<?php
defined('ABSPATH') || exit;

/** Match only a persisted, server-verified receipt. A paid Woo status or an
 * editable order meta field alone is insufficient authority to buy inventory.
 */
function hubby_payment_evidence_matches(WC_Order $order): bool {
    global $wpdb;
    if (get_option('hubby_supplier_schema') !== '3' || $order->get_payment_method() !== 'payos' || $order->get_currency() !== 'VND') return false;
    $total = (string) $order->get_total('edit');
    if (!preg_match('/^[0-9]+(?:\.0+)?$/D', $total)) return false;
    $event = $wpdb->get_row($wpdb->prepare("SELECT amount_vnd,link_id FROM {$wpdb->prefix}hubby_payment_events WHERE accepted_order_id=%d AND state='verified'", $order->get_id()));
    return $event && (int) $event->amount_vnd === (int) $total && hash_equals((string) $event->link_id, (string) $order->get_meta('_wc_order_payos_payment_link_id'));
}

function hubby_payos_canonical(array $data): string {
    ksort($data, SORT_STRING);
    $parts = [];
    foreach ($data as $key => $value) {
        if ($value === null || $value === 'undefined' || $value === 'null') $value = '';
        elseif (is_bool($value)) $value = $value ? 'true' : 'false';
        elseif (is_array($value)) {
            if (!array_is_list($value)) throw new RuntimeException('Unsupported signed field.');
            $value = array_map(static function ($entry) {
                if (is_array($entry) && !array_is_list($entry)) ksort($entry, SORT_STRING);
                return $entry;
            }, $value);
            $value = wp_json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        } elseif (!is_scalar($value)) throw new RuntimeException('Unsupported signed field.');
        $parts[] = $key . '=' . $value;
    }
    return implode('&', $parts);
}

/** A guard in front of upstream payOS 1.0.77's Woo API webhook. The upstream
 * handler still owns the Woo payment transition. This guard persists separate
 * evidence and diverts mismatched/late/second receipts into reconciliation.
 */
function hubby_guard_payos_webhook(): void {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') wp_send_json_error(['message' => 'POST required.'], 405);
    if (get_option('hubby_supplier_schema') !== '3') wp_send_json_error(['message' => 'Payment storage unavailable.'], 503);
    $settings = get_option('payos_gateway_settings', []);
    $secret = hubby_secret('PAYOS_CHECKSUM_KEY');
    if ($secret === '') $secret = is_array($settings) && is_string($settings['checksum_key'] ?? null) ? $settings['checksum_key'] : '';
    if ($secret === '') wp_send_json_error(['message' => 'Payment not configured.'], 503);
    $raw = file_get_contents('php://input', false, null, 0, 20481);
    if (!is_string($raw) || strlen($raw) > 20480) wp_send_json_error(['message' => 'Invalid request.'], 400);
    $body = json_decode($raw, true, 20);
    $data = is_array($body) ? ($body['data'] ?? null) : null;
    $signature = $body['signature'] ?? null;
    if (!is_array($data) || count($data) > 64 || !is_string($signature) || !preg_match('/^[a-f0-9]{64}$/iD', $signature)) wp_send_json_error(['message' => 'Invalid request.'], 400);
    try { $canonical = hubby_payos_canonical($data); }
    catch (Throwable $error) { wp_send_json_error(['message' => 'Invalid request.'], 400); }
    if (!hash_equals(hash_hmac('sha256', $canonical, $secret), strtolower($signature))) wp_send_json_error(['message' => 'Invalid signature.'], 401);
    if (($body['code'] ?? '') !== '00' || ($body['success'] ?? null) !== true || ($data['code'] ?? '') !== '00' || ($data['currency'] ?? '') !== 'VND') wp_send_json_error(['message' => 'Unsupported payment.'], 400);
    // A signed registration sample must never become an actual order receipt.
    if (($body['desc'] ?? '') === 'Giao dich thu nghiem' || ($data['description'] ?? '') === 'VQRIO123' || ($data['reference'] ?? '') === 'MA_GIAO_DICH_THU_NGHIEM') wp_send_json_success(['registered' => true]);
    if (!is_int($data['orderCode'] ?? null) || $data['orderCode'] <= 0 || !is_int($data['amount'] ?? null) || $data['amount'] < 2000 || $data['amount'] > 100000000000
        || !is_string($data['reference'] ?? null) || strlen($data['reference']) < 1 || strlen($data['reference']) > 120
        || !is_string($data['paymentLinkId'] ?? null) || strlen($data['paymentLinkId']) < 8 || strlen($data['paymentLinkId']) > 120
        || !is_string($data['accountNumber'] ?? null) || strlen($data['accountNumber']) > 40) wp_send_json_error(['message' => 'Invalid payment.'], 400);
    $order = wc_get_order($data['orderCode']);
    $account = hubby_secret('PAYOS_RECEIVING_ACCOUNT');
    if ($account === '') $account = (string) ($settings['gateway_info']['account_number'] ?? '');
    $time = is_string($data['transactionDateTime'] ?? null) ? DateTimeImmutable::createFromFormat('!Y-m-d H:i:s', $data['transactionDateTime'], new DateTimeZone('Asia/Ho_Chi_Minh')) : false;
    $time_valid = $time && $time->format('Y-m-d H:i:s') === $data['transactionDateTime'];
    $eligible = $order && $order->get_payment_method() === 'payos' && $order->get_currency() === 'VND'
        && $order->has_status(['pending', 'on-hold', 'underpaid', 'processing', 'completed']) && $order->get_total_refunded() == 0
        && preg_match('/^[0-9]+(?:\.0+)?$/D', (string) $order->get_total('edit')) && (int) $order->get_total('edit') === $data['amount']
        && $account !== '' && hash_equals($account, $data['accountNumber'])
        && hash_equals((string) $order->get_meta('_wc_order_payos_payment_link_id'), $data['paymentLinkId'])
        && $time_valid && $order->get_date_created() && $time->getTimestamp() >= $order->get_date_created()->getTimestamp() && $time->getTimestamp() <= time() + 300;
    // Upstream links do not persist an expiry snapshot. Use an explicit
    // operator-configured acceptance window; do not silently invent one.
    $window = hubby_secret('HUBBY_PAYOS_ACCEPTANCE_SECONDS');
    $eligible = $eligible && ctype_digit($window) && (int) $window >= 60 && (int) $window <= DAY_IN_SECONDS
        && time() <= $order->get_date_created()->getTimestamp() + (int) $window;
    global $wpdb;
    $table = $wpdb->prefix . 'hubby_payment_events';
    $reference = hash('sha256', 'payos:' . $data['reference']);
    $fingerprint = hash('sha256', $canonical);
    $state = $eligible ? 'verified' : 'review';
    $accepted = $eligible ? (string) $order->get_id() : null;
    $sql = $wpdb->prepare("INSERT IGNORE INTO $table (reference_hash,fingerprint,order_id,accepted_order_id,amount_vnd,link_id,state,created_at) VALUES (%s,%s,%d,NULLIF(%s,''),%d,%s,%s,UTC_TIMESTAMP())",
        $reference, $fingerprint, $data['orderCode'], $accepted ?? '', $data['amount'], $data['paymentLinkId'], $state);
    $inserted = $wpdb->query($sql);
    if ($inserted === false) wp_send_json_error(['message' => 'Payment storage unavailable.'], 503);
    $existing = $wpdb->get_row($wpdb->prepare("SELECT order_id,fingerprint,state FROM $table WHERE reference_hash=%s", $reference));
    if (!$existing && $eligible) {
        // A different receipt already accepted this order. Retain the second
        // signed receipt for review; do not accumulate it as another payment.
        $inserted = $wpdb->query($wpdb->prepare("INSERT IGNORE INTO $table (reference_hash,fingerprint,order_id,accepted_order_id,amount_vnd,link_id,state,created_at) VALUES (%s,%s,%d,NULL,%d,%s,'review',UTC_TIMESTAMP())", $reference, $fingerprint, $data['orderCode'], $data['amount'], $data['paymentLinkId']));
        if ($inserted === false) wp_send_json_error(['message' => 'Payment storage unavailable.'], 503);
        $existing = $wpdb->get_row($wpdb->prepare("SELECT order_id,fingerprint,state FROM $table WHERE reference_hash=%s", $reference));
    }
    if (!$existing) wp_send_json_error(['message' => 'Payment storage unavailable.'], 503);
    if ((int) $existing->order_id !== $data['orderCode'] || !hash_equals($existing->fingerprint, $fingerprint)) wp_send_json_error(['message' => 'Payment reference conflict.'], 409);
    if ($existing->state !== 'verified' || !$eligible) wp_send_json_success(['review' => true]);
    // Continue to upstream's signed webhook handler. Never mark paid here.
}
add_action('woocommerce_api_verify_payos_webhook', 'hubby_guard_payos_webhook', 1);

add_action('woocommerce_payment_complete', static function ($id) {
    $order = wc_get_order($id);
    if (!$order || !hubby_order_has_verified_payment($order)) return;
    try { hubby_enqueue_verified_order($order); }
    catch (Throwable $error) {
        // A later recovery pass will retry queue insertion; not provider buying.
        $order->update_meta_data('_hubby_fulfillment_review', 'queue_creation_requires_review');
        $order->save();
    }
});

function hubby_payment_recover_queue(): void {
    global $wpdb;
    if (get_option('hubby_supplier_schema') !== '3') return;
    $cursor = absint(get_option('hubby_payment_recovery_cursor', 0));
    $events = $wpdb->get_results($wpdb->prepare("SELECT id,accepted_order_id FROM {$wpdb->prefix}hubby_payment_events WHERE state='verified' AND id>%d ORDER BY id LIMIT 20", $cursor));
    foreach ($events as $event) {
        $order = wc_get_order((int) $event->accepted_order_id);
        if ($order && hubby_order_has_verified_payment($order)) {
            try { hubby_enqueue_verified_order($order); } catch (Throwable $error) { /* No provider calls or secret logs. */ }
        }
        $cursor = (int) $event->id;
    }
    update_option('hubby_payment_recovery_cursor', $events ? $cursor : 0, false);
}
