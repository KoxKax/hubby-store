<?php
defined('ABSPATH') || exit;
add_action('after_setup_theme', static function () {
    add_theme_support('title-tag');
    add_theme_support('post-thumbnails');
    add_theme_support('woocommerce');
    add_theme_support('wc-product-gallery-lightbox');
    register_nav_menus(['primary' => 'Menu chính', 'footer' => 'Chân trang']);
});
add_action('wp_enqueue_scripts', static function () {
    wp_enqueue_style('hubby', get_stylesheet_uri(), [], '0.1.0');
    wp_enqueue_script('hubby', get_template_directory_uri() . '/assets/theme.js', [], '0.1.0', true);
});
function hubby_content(): array { return (array) get_option('hubby_presentation_content', get_option('hubby_published_content', [])); }
function hubby_asset(string $name): string { return get_template_directory_uri() . '/assets/visuals/' . $name; }
function hubby_source_url(string $url): string {
    if (str_starts_with($url, '/visuals/')) return hubby_asset(substr($url, strlen('/visuals/')));
    if (str_starts_with($url, '/media/')) return 'https://hubby.dpdns.org' . $url;
    if (str_starts_with($url, '/')) return home_url($url);
    return $url;
}
function hubby_product_image($html, $product, $size, $attr, $placeholder, $image): string {
    if ($product->get_image_id()) return $html;
    $source = $product->get_meta('_hubby_source_product');
    if (!is_array($source)) return $html;
    if (!empty($source['media']['src'])) {
        $src = hubby_source_url($source['media']['src']);
        $alt = $source['media']['alt'];
    } else {
        $known = ['canva' => 'Canva Edu', 'office' => 'Microsoft Office 365', 'capcut' => 'CapCut Pro', 'netflix' => 'Netflix', 'duolingo' => 'Duolingo', 'google' => 'Google AI Pro'];
        if (($known[$source['id']] ?? '') !== $source['name']) return $html;
        $src = hubby_asset('products/' . $source['id'] . '-320.webp');
        $alt = $source['name'];
    }
    return '<img src="' . esc_url($src) . '" alt="' . esc_attr($alt) . '" width="320" height="320" loading="lazy">';
}
add_filter('woocommerce_product_get_image', 'hubby_product_image', 10, 6);
add_action('woocommerce_single_product_summary', static function () {
    global $product;
    $source = $product ? $product->get_meta('_hubby_source_product') : null;
    if (!is_array($source)) return;
    echo '<div class="hubby-product-terms">';
    foreach (['deliveryLabel' => 'Cách nhận', 'warranty' => 'Bảo hành', 'activationNote' => 'Lưu ý'] as $field => $label) {
        $value = $field === 'deliveryLabel' ? ($source[$field] ?? '') : ($source['terms'][$field] ?? '');
        if ($value !== '') echo '<p><strong>' . esc_html($label) . ':</strong> ' . esc_html($value) . '</p>';
    }
    echo '</div>';
}, 25);
add_filter('woocommerce_get_price_html', static function ($html, $product) {
    if ($html === '' && ($product->get_meta('_hubby_catalog_key') || $product->get_meta('_hubby_source_variant'))) return '<span class="price">Chưa có giá bán</span>';
    return $html;
}, 10, 2);
add_action('customize_register', static function ($customizer) {
    $customizer->add_section('hubby_home', ['title' => 'Trang chủ Hubby', 'priority' => 30]);
    foreach (['eyebrow' => 'Nhãn giới thiệu', 'title' => 'Tiêu đề', 'accent' => 'Dòng nhấn', 'description' => 'Mô tả', 'support_title' => 'Tiêu đề hỗ trợ', 'support_description' => 'Nội dung hỗ trợ'] as $id => $label) {
        $customizer->add_setting('hubby_' . $id, ['sanitize_callback' => 'sanitize_textarea_field', 'capability' => 'edit_theme_options']);
        $customizer->add_control('hubby_' . $id, ['section' => 'hubby_home', 'label' => $label, 'type' => str_contains($id, 'description') ? 'textarea' : 'text']);
    }
    $customizer->add_setting('hubby_facebook', ['sanitize_callback' => 'esc_url_raw']);
    $customizer->add_control('hubby_facebook', ['section' => 'hubby_home', 'label' => 'Đường dẫn Facebook hỗ trợ', 'type' => 'url']);
});
