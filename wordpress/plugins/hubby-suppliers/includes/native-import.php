<?php
defined('ABSPATH') || exit;

/** Native WooCommerce CSV import stores custom meta as strings. Normalize the
 * migration-owned JSON back to an array and preserve the source slug. Native
 * importer permissions/nonce still apply; this is not an import endpoint.
 */
add_action('woocommerce_product_import_inserted_product_object', static function ($product, $data) {
    if (!$product instanceof WC_Product || !current_user_can('manage_woocommerce')) return;
    $source = $product->get_meta('_hubby_source_product');
    $key = (string) $product->get_meta('_hubby_catalog_key');
    if ($key === '' || !is_string($source) || strlen($source) > 100000) return;
    $decoded = json_decode($source, true, 20);
    if (!is_array($decoded) || ($decoded['id'] ?? '') !== $key || !is_string($decoded['slug'] ?? null) || !preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/D', $decoded['slug'])) return;
    $product->update_meta_data('_hubby_source_product', $decoded);
    $product->set_slug($decoded['slug']);
    $product->save();
}, 10, 2);
