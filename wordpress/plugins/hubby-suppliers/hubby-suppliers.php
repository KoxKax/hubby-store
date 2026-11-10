<?php
/**
 * Plugin Name: Hubby Suppliers
 * Description: Mapping nguồn hàng và chuẩn bị tích hợp nhiều API cho Hubby.
 * Version: 0.3.0
 * Requires PHP: 8.3
 * Requires Plugins: woocommerce
 * License: GPL-2.0-or-later
 */
defined('ABSPATH') || exit;

add_action('before_woocommerce_init', static function () {
    if (class_exists(\Automattic\WooCommerce\Utilities\FeaturesUtil::class)) {
        \Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility('custom_order_tables', __FILE__, true);
    }
});

/** Credentials belong in the hosting environment/wp-config, never product meta. */
function hubby_supplier_definitions(): array {
    // Owner accepts manual reconciliation for the documented one-shot API.
    // Activation still requires private hosting configuration, never a browser
    // field, local preview or the mere presence of a payment gateway.
    $enabled = function_exists('hubby_secret') && hubby_secret('HUBBY_BITE_ENABLED') === 'true'
        && hubby_secret('HUBBY_SUPPLIER_PURCHASES_ENABLED') === 'true'
        && hubby_secret('HUBBY_BITE_API_KEY') !== '' && wp_get_environment_type() !== 'local';
    if ($enabled) {
        try { hubby_delivery_key(); } catch (Throwable $error) { $enabled = false; }
    }
    return apply_filters('hubby_supplier_definitions', [
        'bite' => [
            'label' => 'Bite Store',
            'base_url' => 'https://reseller.bite-store.com',
            'credential' => 'HUBBY_BITE_API_KEY',
            'purchase_ready' => $enabled,
            'reason' => $enabled ? 'Một lần gọi mua; kết quả chưa rõ chuyển Owner đối soát.' : 'Chưa bật nguồn bằng cấu hình máy chủ hoặc chưa có khóa/mã hóa. Lỗi API được Owner đối soát thủ công.',
        ],
    ]);
}

function hubby_supplier_binding(WC_Product $product): array {
    return [
        'supplier' => (string) $product->get_meta('_hubby_supplier'),
        'external_id' => (string) $product->get_meta('_hubby_supplier_product_id'),
    ];
}

/** Only transport reads are enabled in this release. No purchase endpoint. */
function hubby_bite_read(string $endpoint) {
    if (!in_array($endpoint, ['/v1/products', '/v1/balance'], true)) {
        return new WP_Error('hubby_endpoint', 'Endpoint không được cho phép.');
    }
    $key = defined('HUBBY_BITE_API_KEY') ? constant('HUBBY_BITE_API_KEY') : getenv('HUBBY_BITE_API_KEY');
    if (!is_string($key) || $key === '') return new WP_Error('hubby_key', 'Chưa cấu hình khóa Bite ở máy chủ.');
    $response = wp_safe_remote_get('https://reseller.bite-store.com' . $endpoint, [
        'headers' => ['X-API-Key' => $key, 'Accept' => 'application/json'],
        'timeout' => 15,
        'redirection' => 0,
        'limit_response_size' => 1048576,
    ]);
    if (is_wp_error($response) || wp_remote_retrieve_response_code($response) !== 200) {
        return new WP_Error('hubby_provider_unavailable', 'Nguồn chưa phản hồi hợp lệ. Không thay đổi giá hoặc tồn kho.');
    }
    $body = json_decode(wp_remote_retrieve_body($response), true);
    return is_array($body) ? $body : new WP_Error('hubby_provider_schema', 'Phản hồi không đúng JSON; cần xác minh schema.');
}

function hubby_can_purchase(bool $purchasable, WC_Product $product): bool {
    $binding = hubby_supplier_binding($product);
    if ($product->get_meta('_hubby_catalog_key') === '' && $product->get_meta('_hubby_source_variant') === '' && $binding['supplier'] === '') return $purchasable;
    if ($product->is_type('variable')) {
        foreach ($product->get_children() as $child_id) {
            $child = wc_get_product($child_id);
            if ($child && hubby_can_purchase(true, $child)) return $purchasable;
        }
        return false;
    }
    // WooCommerce is now the price authority; editing its price must not be
    // blocked by a stale flag imported from the old CMS.
    $price = (string) $product->get_price('edit');
    if (!preg_match('/^[0-9]+(?:\.0+)?$/D', $price) || (float) $price < 2000) return false;
    $definition = hubby_supplier_definitions()[$binding['supplier']] ?? null;
    return $purchasable && $binding['external_id'] !== '' && $definition && $definition['purchase_ready'] === true;
}
add_filter('woocommerce_is_purchasable', 'hubby_can_purchase', 20, 2);
add_filter('woocommerce_variation_is_purchasable', 'hubby_can_purchase', 20, 2);

function hubby_supplier_fields(WC_Product $product): void {
    $binding = hubby_supplier_binding($product);
    echo '<p><strong>Nguồn cấp hàng Hubby</strong></p><p>Mapping riêng cho từng gói, không tự đổi giá bán theo giá vốn.</p>';
    echo '<label>Nguồn <select name="hubby_supplier[' . esc_attr((string) $product->get_id()) . ']">';
    echo '<option value="">Chưa chọn nguồn</option>';
    foreach (hubby_supplier_definitions() as $id => $definition) {
        echo '<option value="' . esc_attr($id) . '" ' . selected($binding['supplier'], $id, false) . '>' . esc_html($definition['label']) . '</option>';
    }
    echo '</select></label> <label>Mã sản phẩm bên nguồn <input name="hubby_external_id[' . esc_attr((string) $product->get_id()) . ']" value="' . esc_attr($binding['external_id']) . '" maxlength="120"></label>';
}
add_action('woocommerce_product_options_general_product_data', static function () {
    global $product_object;
    if ($product_object instanceof WC_Product && !$product_object->is_type('variable')) hubby_supplier_fields($product_object);
});
add_action('woocommerce_variation_options_pricing', static function ($index, $data, $variation) {
    $product = wc_get_product($variation->ID);
    if ($product) hubby_supplier_fields($product);
}, 10, 3);

function hubby_save_supplier_binding(WC_Product $product): void {
    // WooCommerce's product save handlers verify their nonces; also enforce
    // capability and object ownership here. IDs never grant editing rights.
    if (!current_user_can('edit_post', $product->get_id())) return;
    $id = $product->get_id();
    if (!isset($_POST['hubby_supplier'][$id], $_POST['hubby_external_id'][$id])) return;
    if (!is_string($_POST['hubby_supplier'][$id]) || !is_string($_POST['hubby_external_id'][$id])) return;
    $supplier = sanitize_key(wp_unslash($_POST['hubby_supplier'][$id]));
    $external = sanitize_text_field(wp_unslash($_POST['hubby_external_id'][$id]));
    if (($supplier !== '' && !isset(hubby_supplier_definitions()[$supplier])) || strlen($external) > 120) return;
    $product->update_meta_data('_hubby_supplier', $supplier);
    $product->update_meta_data('_hubby_supplier_product_id', $external);
}
add_action('woocommerce_admin_process_product_object', 'hubby_save_supplier_binding');
add_action('woocommerce_admin_process_variation_object', 'hubby_save_supplier_binding');

add_action('admin_menu', static function () {
    add_submenu_page('woocommerce', 'Nguồn hàng Hubby', 'Nguồn hàng Hubby', 'manage_woocommerce', 'hubby-suppliers', 'hubby_supplier_admin');
});
function hubby_supplier_admin(): void {
    if (!current_user_can('manage_woocommerce')) wp_die(esc_html__('Không có quyền truy cập.', 'hubby'));
    echo '<div class="wrap"><h1>Nguồn hàng Hubby</h1><p>Mỗi biến thể sản phẩm có một nguồn và mã hàng tương ứng. Thêm adapter để hỗ trợ nguồn tiếp theo.</p>';
    echo '<table class="widefat striped"><thead><tr><th>Nguồn</th><th>Cấu hình máy chủ</th><th>Mua tự động</th></tr></thead><tbody>';
    foreach (hubby_supplier_definitions() as $definition) {
        $name = $definition['credential'];
        $configured = (defined($name) && constant($name)) || getenv($name);
        echo '<tr><td>' . esc_html($definition['label']) . '</td><td>' . esc_html($configured ? 'Đã có cấu hình; chưa xác minh API' : 'Chưa cấu hình') . '</td><td>' . esc_html($definition['purchase_ready'] ? 'Adapter sẵn sàng' : $definition['reason']) . '</td></tr>';
    }
    echo '</tbody></table><h2>Trạng thái chuyển đổi</h2><p>Đã có hàng đợi và lưu hàng mã hóa trong mã nguồn; chưa nghiệm thu API nhà cung cấp hoặc payOS trên hosting. Bite vẫn khóa mua tự động. Không bật nhận tiền chỉ vì đã cài plugin.</p>';
    if (function_exists('hubby_render_fulfillment_queue')) hubby_render_fulfillment_queue();
    echo '</div>';
}

require_once __DIR__ . '/includes/import-catalog.php';
require_once __DIR__ . '/includes/content-types.php';
require_once __DIR__ . '/includes/fulfillment.php';
require_once __DIR__ . '/includes/delivery.php';
require_once __DIR__ . '/includes/payment-evidence.php';
require_once __DIR__ . '/includes/operations.php';
require_once __DIR__ . '/includes/checkout.php';
require_once __DIR__ . '/includes/native-import.php';
register_activation_hook(__FILE__, 'hubby_supplier_install');
