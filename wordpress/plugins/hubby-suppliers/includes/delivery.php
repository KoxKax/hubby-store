<?php
defined('ABSPATH') || exit;

function hubby_bind_guest_proof(WC_Order $order): void {
    if ($order->get_customer_id() !== 0) return;
    $token = $_COOKIE['hubby_delivery_proof'] ?? '';
    $stored = (string) $order->get_meta('_hubby_guest_proof_hash');
    if ($stored !== '') {
        if (!is_string($token) || !preg_match('/^[a-f0-9]{64}$/D', $token) || !hash_equals($stored, hash('sha256', $token)) || (int) $order->get_meta('_hubby_guest_proof_expires') < time()) {
            throw new WC_Data_Exception('hubby_guest_session', 'Cần dùng lại trình duyệt đã tạo đơn hoặc liên hệ hỗ trợ xác minh.');
        }
        return;
    }
    if (!is_string($token) || !preg_match('/^[a-f0-9]{64}$/D', $token)) $token = bin2hex(random_bytes(32));
    setcookie('hubby_delivery_proof', $token, ['expires' => time() + 30 * DAY_IN_SECONDS, 'path' => '/', 'secure' => is_ssl(), 'httponly' => true, 'samesite' => 'Lax']);
    $order->update_meta_data('_hubby_guest_proof_hash', hash('sha256', $token));
    $order->update_meta_data('_hubby_guest_proof_expires', time() + 30 * DAY_IN_SECONDS);
    $order->save();
    $_COOKIE['hubby_delivery_proof'] = $token;
}

function hubby_can_reveal_order(WC_Order $order): bool {
    $user = get_current_user_id();
    if ($order->get_customer_id() > 0) return $user > 0 && $user === $order->get_customer_id();
    $proof = $_COOKIE['hubby_delivery_proof'] ?? '';
    $key = $_POST['order_key'] ?? '';
    $stored = (string) $order->get_meta('_hubby_guest_proof_hash');
    return (int) $order->get_meta('_hubby_guest_proof_expires') >= time() && is_string($proof) && preg_match('/^[a-f0-9]{64}$/D', $proof) && strlen($stored) === 64 && hash_equals($stored, hash('sha256', $proof)) && is_string($key) && hash_equals($order->get_order_key(), wp_unslash($key));
}

function hubby_reveal_delivery(): void {
    nocache_headers();
    header('Cache-Control: private, no-store');
    header('Referrer-Policy: no-referrer');
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') wp_send_json_error(['message' => 'Yêu cầu không hợp lệ.'], 405);
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    $site = wp_parse_url(home_url('/'));
    $expected_origin = $site['scheme'] . '://' . $site['host'] . (isset($site['port']) ? ':' . $site['port'] : '');
    if ($origin !== $expected_origin) wp_send_json_error(['message' => 'Yêu cầu không hợp lệ.'], 403);
    $id = absint($_POST['order_id'] ?? 0);
    if (!check_ajax_referer('hubby_delivery_' . $id, 'nonce', false)) wp_send_json_error(['message' => 'Phiên đã hết hạn.'], 403);
    $order = wc_get_order($id);
    if (!$order || !hubby_can_reveal_order($order) || !hubby_order_has_verified_payment($order) || $order->get_status() !== 'completed') wp_send_json_error(['message' => 'Chưa thể mở sản phẩm.'], 403);
    global $wpdb;
    $rows = $wpdb->get_results($wpdb->prepare("SELECT id,state,delivered_ciphertext FROM {$wpdb->prefix}hubby_supplier_jobs WHERE order_id=%d ORDER BY item_id,unit_index", $id));
    $expected = array_sum(array_map(static fn($item) => (int) $item->get_quantity(), $order->get_items('line_item')));
    if (!$rows || count($rows) !== $expected) wp_send_json_error(['message' => 'Chưa thể mở sản phẩm.'], 409);
    $products = [];
    try {
        foreach ($rows as $row) {
            if ($row->state !== 'delivered' || !$row->delivered_ciphertext) throw new RuntimeException('Incomplete delivery.');
            $products[] = hubby_open_delivery($row->id, $row->delivered_ciphertext);
        }
    } catch (Throwable $error) { wp_send_json_error(['message' => 'Chưa thể mở sản phẩm.'], 503); }
    wp_send_json_success(['products' => $products]);
}
add_action('wp_ajax_hubby_delivery', 'hubby_reveal_delivery');
add_action('wp_ajax_nopriv_hubby_delivery', 'hubby_reveal_delivery');

function hubby_delivery_button($order): void {
    if (!$order instanceof WC_Order || $order->get_status() !== 'completed') return;
    echo '<section class="hubby-delivery"><h2>Sản phẩm đã mua</h2><p>Chỉ mở khi ở nơi riêng tư. Không chia sẻ tài khoản hoặc mã đã mua.</p><form class="hubby-delivery-form" method="post" action="' . esc_url(admin_url('admin-ajax.php')) . '">';
    echo '<input type="hidden" name="action" value="hubby_delivery"><input type="hidden" name="order_id" value="' . absint($order->get_id()) . '"><input type="hidden" name="order_key" value="' . esc_attr($order->get_order_key()) . '">';
    wp_nonce_field('hubby_delivery_' . $order->get_id(), 'nonce', false);
    echo '<button class="button" type="submit">Mở thông tin đã mua</button><div class="hubby-delivery-result" role="status"></div></form></section>';
}
add_action('woocommerce_order_details_after_order_table', 'hubby_delivery_button');
add_action('wp_enqueue_scripts', static function () {
    if (is_account_page() || is_order_received_page()) wp_enqueue_script('hubby-delivery', plugins_url('../assets/delivery.js', __FILE__), [], '0.1.0', true);
});
