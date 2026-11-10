<?php
/** Local development guard. Do not package or upload this directory to hosting. */
defined('ABSPATH') || exit;
add_filter('pre_wp_mail', '__return_true');
add_filter('pre_http_request', static function () {
    return new WP_Error('hubby_local_network_disabled', 'Outbound API requests are disabled in the local workspace.');
}, PHP_INT_MAX);
add_filter('woocommerce_available_payment_gateways', '__return_empty_array', PHP_INT_MAX);
add_filter('woocommerce_is_purchasable', '__return_false', PHP_INT_MAX);
add_filter('woocommerce_variation_is_purchasable', '__return_false', PHP_INT_MAX);
add_action('admin_notices', static function () {
    echo '<div class="notice notice-info"><p>Hubby — môi trường phát triển trên máy này. Thanh toán, mua API và gửi email đều khóa. Đây không phải phiên Owner của web đang chạy.</p></div>';
});
