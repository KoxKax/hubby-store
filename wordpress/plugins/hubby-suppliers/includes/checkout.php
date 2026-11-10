<?php
defined('ABSPATH') || exit;

function hubby_is_supplier_product(WC_Product $product): bool {
    return $product->get_meta('_hubby_catalog_key') !== '' || $product->get_meta('_hubby_source_variant') !== '' || $product->get_meta('_hubby_supplier') !== '';
}

function hubby_validate_supplier_cart(WP_Error $errors, $cart): void {
    if (!$cart instanceof WC_Cart) return;
    $units = 0;
    foreach ($cart->get_cart() as $line) {
        $product = $line['data'] ?? null;
        if (!$product instanceof WC_Product || !hubby_is_supplier_product($product)) continue;
        $quantity = $line['quantity'] ?? 0;
        if (!is_numeric($quantity) || (int) $quantity != $quantity || $quantity < 1 || ($units += (int) $quantity) > 20) {
            $errors->add('hubby_quantity', 'Mỗi đơn hỗ trợ tối đa 20 đơn vị hàng qua API.');
            return;
        }
        if (!hubby_can_purchase(true, $product)) {
            $errors->add('hubby_source_unavailable', 'Gói chưa có nguồn cấp hàng đã cấu hình và xác minh.');
            return;
        }
    }
}
add_action('woocommerce_after_checkout_validation', static function ($data, $errors) {
    hubby_validate_supplier_cart($errors, WC()->cart);
}, 10, 2);
add_action('woocommerce_store_api_cart_errors', 'hubby_validate_supplier_cart', 10, 2);

/** Runs before gateway processing for both classic and Store API checkout. */
function hubby_prepare_supplier_order(WC_Order $order): void {
    if ($order->is_paid()) return;
    $units = 0;
    foreach ($order->get_items('line_item') as $item) {
        $product = $item->get_product();
        if (!$product || !hubby_is_supplier_product($product)) continue;
        $quantity = (int) $item->get_quantity();
        if ($quantity < 1 || ($units += $quantity) > 20 || !hubby_can_purchase(true, $product)) throw new WC_Data_Exception('hubby_source_unavailable', 'Gói hoặc số lượng chưa đủ điều kiện đặt hàng.');
        if ($order->get_payment_method() !== 'payos') throw new WC_Data_Exception('hubby_payment_unavailable', 'Đơn cấp qua API cần phương thức thanh toán đã được tích hợp xác minh.');
        $binding = hubby_supplier_binding($product);
        if ($item->meta_exists('_hubby_source_supplier') && ((string) $item->get_meta('_hubby_source_supplier') !== $binding['supplier'] || (string) $item->get_meta('_hubby_source_product_id') !== $binding['external_id'])) {
            throw new WC_Data_Exception('hubby_source_changed', 'Nguồn hàng đã thay đổi. Hãy tạo lại lựa chọn trước khi thanh toán.');
        }
        $item->update_meta_data('_hubby_source_supplier', $binding['supplier']);
        $item->update_meta_data('_hubby_source_product_id', $binding['external_id']);
        $item->save();
    }
    if ($units > 0) hubby_bind_guest_proof($order);
}
add_action('woocommerce_checkout_order_processed', static function ($id, $data, $order) { hubby_prepare_supplier_order($order); }, 10, 3);
add_action('woocommerce_store_api_checkout_order_processed', 'hubby_prepare_supplier_order');
