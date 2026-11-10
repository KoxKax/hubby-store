<?php
defined('ABSPATH') || exit;

/** One-time bootstrap of the published catalog into a NEW development site.
 * Does not rewrite existing Woo products or read/migrate Supabase identities.
 * Browser requests cannot invoke an importer on a production installation.
 */
function hubby_import_published_catalog(array $content): array {
    if (wp_get_environment_type() !== 'local' || !defined('HUBBY_LOCAL_IMPORT') || !HUBBY_LOCAL_IMPORT) {
        throw new RuntimeException('Catalog bootstrap is local-only.');
    }
    if (($content['schemaVersion'] ?? null) !== 2 || !isset($content['products'], $content['categories'])) {
        throw new InvalidArgumentException('Unsupported published source.');
    }
    if (get_option('hubby_catalog_import_started')) {
        throw new RuntimeException('Import has already started; inspect existing mapping before continuing.');
    }
    // Block retries after partial failure rather than overwriting later edits.
    if (!add_option('hubby_catalog_import_started', gmdate('c'), '', false)) {
        throw new RuntimeException('Another import already owns the bootstrap.');
    }
    $categories = [];
    foreach ($content['categories'] as $category) {
        $term = term_exists($category['id'], 'product_cat');
        if (!$term) $term = wp_insert_term($category['name'], 'product_cat', ['slug' => $category['id'], 'description' => $category['description']]);
        if (is_wp_error($term)) throw new RuntimeException('Unable to import category.');
        $categories[$category['id']] = (int) (is_array($term) ? $term['term_id'] : $term);
    }
    $mapping = [];
    foreach ($content['products'] as $source) {
        if (wc_get_products(['limit' => 1, 'sku' => 'hubby-' . $source['id']])) throw new RuntimeException('Existing SKU conflict.');
        $product = new WC_Product_Variable();
        $product->set_name($source['name']);
        $product->set_slug($source['slug']);
        $product->set_sku('hubby-' . $source['id']);
        $product->set_status('publish');
        $product->set_description(esc_html($source['description']));
        $product->set_short_description(esc_html($source['tagline']));
        $product->set_category_ids([$categories[$source['category']]]);
        $product->update_meta_data('_hubby_catalog_key', $source['id']);
        $product->update_meta_data('_hubby_source_revision', $content['revision']);
        $product->update_meta_data('_hubby_source_product', $source);
        $attribute = new WC_Product_Attribute();
        $attribute->set_name('Gói');
        $attribute->set_options(array_column($source['variants'], 'label'));
        $attribute->set_visible(true);
        $attribute->set_variation(true);
        $product->set_attributes([$attribute]);
        $id = $product->save();
        $mapping[$source['id']] = ['product_id' => $id, 'variants' => []];
        foreach ($source['variants'] as $variant) {
            $variation = new WC_Product_Variation();
            $variation->set_parent_id($id);
            $variation->set_sku($variant['id']);
            $variation->set_status('publish');
            $variation->set_virtual(true);
            $variation->set_attributes([sanitize_title('Gói') => $variant['label']]);
            $priced = ($variant['priceConfigured'] ?? true) === true;
            $variation->set_regular_price($priced ? (string) $variant['priceVnd'] : '');
            $variation->set_manage_stock(false);
            $variation->set_stock_status('outofstock');
            $variation->update_meta_data('_hubby_source_variant', $variant['id']);
            $variation->update_meta_data('_hubby_price_configured', $priced ? 'yes' : 'no');
            $variation->update_meta_data('_hubby_legacy_preview_stock', (int) $variant['stock']);
            $variation_id = $variation->save();
            $mapping[$source['id']]['variants'][$variant['id']] = $variation_id;
        }
        WC_Product_Variable::sync($id);
    }
    foreach ($content['policies'] as $policy) {
        $result = wp_insert_post(['post_type' => 'page', 'post_status' => 'publish', 'post_title' => $policy['title'], 'post_name' => $policy['slug'], 'post_content' => esc_html($policy['body'])], true);
        if (is_wp_error($result)) throw new RuntimeException('Unable to import policy.');
    }
    update_option('hubby_published_content', $content, false);
    update_option('hubby_catalog_mapping', $mapping, false);
    update_option('hubby_catalog_import_complete', gmdate('c'), false);
    return $mapping;
}
