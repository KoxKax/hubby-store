<?php
defined('ABSPATH') || exit;

function hubby_secret(string $name): string {
    $value = defined($name) ? constant($name) : getenv($name);
    return is_string($value) ? $value : '';
}

function hubby_delivery_key(): string {
    $hex = hubby_secret('HUBBY_DELIVERY_KEY_V1');
    if (!preg_match('/^[a-f0-9]{64}$/iD', $hex) || !function_exists('openssl_encrypt') || !in_array('aes-256-gcm', openssl_get_cipher_methods(), true)) {
        throw new RuntimeException('Delivery encryption is unavailable.');
    }
    return hex2bin($hex);
}
function hubby_seal_delivery(string $job_id, string $payload): string {
    if (strlen($payload) > 1048576) throw new RuntimeException('Delivery payload exceeds limit.');
    $nonce = random_bytes(12);
    $tag = '';
    $cipher = openssl_encrypt($payload, 'aes-256-gcm', hubby_delivery_key(), OPENSSL_RAW_DATA, $nonce, $tag, 'hubby:delivery:v1:' . $job_id, 16);
    if ($cipher === false) throw new RuntimeException('Unable to seal delivery.');
    return wp_json_encode(['v' => 1, 'n' => base64_encode($nonce), 't' => base64_encode($tag), 'c' => base64_encode($cipher)]);
}
function hubby_open_delivery(string $job_id, string $sealed): string {
    $data = json_decode($sealed, true);
    if (!is_array($data) || ($data['v'] ?? null) !== 1) throw new RuntimeException('Unsupported encryption version.');
    $nonce = base64_decode($data['n'] ?? '', true);
    $tag = base64_decode($data['t'] ?? '', true);
    $cipher = base64_decode($data['c'] ?? '', true);
    if ($nonce === false || strlen($nonce) !== 12 || $tag === false || strlen($tag) !== 16 || $cipher === false) throw new RuntimeException('Invalid sealed delivery.');
    $value = openssl_decrypt($cipher, 'aes-256-gcm', hubby_delivery_key(), OPENSSL_RAW_DATA, $nonce, $tag, 'hubby:delivery:v1:' . $job_id);
    if ($value === false) throw new RuntimeException('Unable to decrypt delivery.');
    return $value;
}

function hubby_supplier_install(): void {
    global $wpdb;
    require_once ABSPATH . 'wp-admin/includes/upgrade.php';
    $table = $wpdb->prefix . 'hubby_supplier_jobs';
    $charset = $wpdb->get_charset_collate();
    dbDelta("CREATE TABLE $table (
        id varchar(36) NOT NULL,
        order_id bigint(20) unsigned NOT NULL,
        item_id bigint(20) unsigned NOT NULL,
        unit_index int unsigned NOT NULL,
        supplier varchar(40) NOT NULL,
        external_id varchar(120) NOT NULL,
        state varchar(20) NOT NULL DEFAULT 'queued',
        claim_token varchar(36) DEFAULT NULL,
        submitted_at datetime DEFAULT NULL,
        ciphertext longtext DEFAULT NULL,
        delivered_ciphertext longtext DEFAULT NULL,
        issue varchar(40) DEFAULT NULL,
        manual_actor bigint(20) unsigned DEFAULT NULL,
        manual_reason varchar(40) DEFAULT NULL,
        manual_at datetime DEFAULT NULL,
        created_at datetime NOT NULL,
        updated_at datetime NOT NULL,
        PRIMARY KEY  (id),
        UNIQUE KEY order_unit (order_id,item_id,unit_index),
        KEY due_jobs (state,created_at),
        KEY order_jobs (order_id)
    ) $charset;");
    $events = $wpdb->prefix . 'hubby_payment_events';
    dbDelta("CREATE TABLE $events (
        id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
        reference_hash varchar(64) NOT NULL,
        fingerprint varchar(64) NOT NULL,
        order_id bigint(20) unsigned NOT NULL,
        accepted_order_id bigint(20) unsigned DEFAULT NULL,
        amount_vnd bigint(20) unsigned NOT NULL,
        link_id varchar(120) NOT NULL,
        state varchar(20) NOT NULL,
        created_at datetime NOT NULL,
        PRIMARY KEY  (id),
        UNIQUE KEY reference_once (reference_hash),
        UNIQUE KEY order_once (accepted_order_id),
        KEY review_events (state,id)
    ) $charset;");
    if ($wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $wpdb->esc_like($table))) === $table && $wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $wpdb->esc_like($events))) === $events) {
        update_option('hubby_supplier_schema', '3', false);
    }
}

/** Called only after a payment verifier persisted its evidence, not by a URL
 * redirect or a generic order-status transition. The verifier integration is
 * deliberately separate from this fulfillment module.
 */
function hubby_enqueue_verified_order(WC_Order $order): void {
    global $wpdb;
    if (!hubby_order_has_verified_payment($order)) throw new RuntimeException('Verified payment required.');
    $total_units = 0;
    foreach ($order->get_items('line_item') as $item_id => $item) {
        $quantity = (int) $item->get_quantity();
        $supplier = (string) $item->get_meta('_hubby_source_supplier');
        $external = (string) $item->get_meta('_hubby_source_product_id');
        if ($quantity < 1 || $quantity > 20 || ($total_units += $quantity) > 20 || $external === '' || !isset(hubby_supplier_definitions()[$supplier])) {
            throw new RuntimeException('Incomplete frozen supplier mapping.');
        }
    }
    foreach ($order->get_items('line_item') as $item_id => $item) {
        for ($unit = 0; $unit < (int) $item->get_quantity(); $unit++) {
            $inserted = $wpdb->query($wpdb->prepare("INSERT IGNORE INTO {$wpdb->prefix}hubby_supplier_jobs (id,order_id,item_id,unit_index,supplier,external_id,state,created_at,updated_at) VALUES (%s,%d,%d,%d,%s,%s,'queued',UTC_TIMESTAMP(),UTC_TIMESTAMP())",
                wp_generate_uuid4(), $order->get_id(), $item_id, $unit, $item->get_meta('_hubby_source_supplier'), $item->get_meta('_hubby_source_product_id')));
            if ($inserted === false) throw new RuntimeException('Unable to persist supplier job.');
        }
    }
    if (function_exists('as_enqueue_async_action')) as_enqueue_async_action('hubby_supplier_pass', [], 'hubby-suppliers', true);
}

function hubby_order_has_verified_payment(WC_Order $order): bool {
    if (!$order->is_paid() || $order->get_total_refunded() > 0 || $order->get_currency() !== 'VND') return false;
    // No WordPress option, query parameter, browser input or order meta can
    // provide this evidence. The separate signed-payment bridge owns it.
    return function_exists('hubby_payment_evidence_matches') && hubby_payment_evidence_matches($order);
}

add_action('woocommerce_checkout_create_order_line_item', static function ($item, $cart_key, $values) {
    $product = $values['data'] ?? null;
    if (!$product instanceof WC_Product) return;
    $binding = hubby_supplier_binding($product);
    $item->add_meta_data('_hubby_source_supplier', $binding['supplier'], true);
    $item->add_meta_data('_hubby_source_product_id', $binding['external_id'], true);
}, 10, 3);

/** One documented Bite POST, never retried after an ambiguous outcome.
 * Owner accepts manual reconciliation when the public contract is insufficient.
 * Explicit server flags and private keys gate purchases; browsers cannot call this directly.
 */
function hubby_bite_purchase_once(string $external_id): array {
    $key = hubby_secret('HUBBY_BITE_API_KEY');
    if ($key === '') throw new RuntimeException('Provider key unavailable.');
    $response = wp_safe_remote_post('https://reseller.bite-store.com/v1/orders', [
        'headers' => ['X-API-Key' => $key, 'Content-Type' => 'application/json', 'Accept' => 'application/json'],
        'body' => wp_json_encode(['productId' => $external_id, 'quantity' => 1]),
        'timeout' => 15, 'redirection' => 0, 'limit_response_size' => 1048576,
    ]);
    if (is_wp_error($response)) return ['state' => 'uncertain', 'issue' => 'transport_unknown', 'response' => null];
    $body = wp_remote_retrieve_body($response);
    // Fail closed on undocumented response envelopes. Preserve the response
    // encrypted for reconciliation even for HTTP errors; never log its body.
    $json = json_decode($body, true);
    $keys = is_array($json) ? ($json['deliveredKeys'] ?? null) : null;
    $ok = in_array(wp_remote_retrieve_response_code($response), [200, 201], true) && is_array($keys) && array_is_list($keys) && count($keys) === 1 && is_string($keys[0]) && $keys[0] !== '' && strlen($keys[0]) <= 32000;
    return ['state' => $ok ? 'delivered' : 'uncertain', 'issue' => $ok ? null : 'response_requires_review', 'response' => $body, 'delivery' => $ok ? $keys[0] : null];
}

add_filter('hubby_supplier_adapters', static function ($adapters) {
    $adapters['bite'] = 'hubby_bite_purchase_once';
    return $adapters;
});

function hubby_supplier_run_pass(): void {
    global $wpdb;
    if (hubby_secret('HUBBY_SUPPLIER_PURCHASES_ENABLED') !== 'true' || wp_get_environment_type() === 'local') return;
    if (get_option('hubby_supplier_schema') !== '3') return;
    if (function_exists('hubby_payment_recover_queue')) hubby_payment_recover_queue();
    try { hubby_delivery_key(); } catch (Throwable $error) { return; }
    $table = $wpdb->prefix . 'hubby_supplier_jobs';
    // An abandoned submission is not permission to purchase again.
    $wpdb->query("UPDATE $table SET state='uncertain',issue='worker_interrupted',updated_at=UTC_TIMESTAMP() WHERE state='submitting' AND submitted_at < DATE_SUB(UTC_TIMESTAMP(),INTERVAL 2 MINUTE)");
    $ready = array_keys(array_filter(hubby_supplier_definitions(), static fn($definition) => ($definition['purchase_ready'] ?? false) === true));
    if (!$ready) return;
    $placeholders = implode(',', array_fill(0, count($ready), '%s'));
    $job = $wpdb->get_row($wpdb->prepare("SELECT * FROM $table WHERE state='queued' AND supplier IN ($placeholders) ORDER BY created_at,id LIMIT 1", ...$ready));
    if (!$job) return;
    $order = wc_get_order((int) $job->order_id);
    if (!$order || !hubby_order_has_verified_payment($order)) {
        $wpdb->query($wpdb->prepare("UPDATE $table SET state='blocked',issue='payment_requires_review',updated_at=UTC_TIMESTAMP() WHERE id=%s AND state='queued'", $job->id));
        return;
    }
    $definition = hubby_supplier_definitions()[$job->supplier] ?? null;
    $adapter = apply_filters('hubby_supplier_adapters', [])[$job->supplier] ?? null;
    if (!$definition || !$definition['purchase_ready'] || !is_callable($adapter)) return;
    if (hubby_secret($definition['credential']) === '') {
        $wpdb->query($wpdb->prepare("UPDATE $table SET state='blocked',issue='provider_key_unavailable',updated_at=UTC_TIMESTAMP() WHERE id=%s AND state='queued' AND submitted_at IS NULL", $job->id));
        return;
    }
    $claim = wp_generate_uuid4();
    $changed = $wpdb->query($wpdb->prepare("UPDATE $table SET state='submitting',claim_token=%s,submitted_at=UTC_TIMESTAMP(),updated_at=UTC_TIMESTAMP() WHERE id=%s AND state='queued' AND submitted_at IS NULL", $claim, $job->id));
    if ($changed !== 1) return;
    try {
        $result = $adapter($job->external_id);
        $raw = isset($result['response']) ? hubby_seal_delivery($job->id . ':response', $result['response']) : null;
        $delivered = ($result['state'] ?? '') === 'delivered' && is_string($result['delivery'] ?? null);
        $sealed = $delivered ? hubby_seal_delivery($job->id, $result['delivery']) : null;
        $updated = $wpdb->query($wpdb->prepare("UPDATE $table SET state=%s,ciphertext=NULLIF(%s,''),delivered_ciphertext=NULLIF(%s,''),issue=NULLIF(%s,''),updated_at=UTC_TIMESTAMP() WHERE id=%s AND claim_token=%s AND state IN ('submitting','uncertain') AND ciphertext IS NULL",
            $delivered ? 'delivered' : 'uncertain', $raw ?? '', $sealed ?? '', $result['issue'] ?? '', $job->id, $claim));
        if ($updated !== 1) return; // Never buy again to compensate for a failed local write.
        if ($delivered) hubby_complete_delivered_order((int) $job->order_id);
    } catch (Throwable $error) {
        $wpdb->query($wpdb->prepare("UPDATE $table SET state='uncertain',issue='service_requires_review',updated_at=UTC_TIMESTAMP() WHERE id=%s AND claim_token=%s AND state='submitting'", $job->id, $claim));
    }
}
add_action('hubby_supplier_pass', 'hubby_supplier_run_pass');

function hubby_complete_delivered_order(int $id): void {
    global $wpdb;
    $order = wc_get_order($id);
    if (!$order || !hubby_order_has_verified_payment($order)) return;
    $expected = array_sum(array_map(static fn($item) => (int) $item->get_quantity(), $order->get_items('line_item')));
    $rows = $wpdb->get_results($wpdb->prepare("SELECT item_id,unit_index,state,delivered_ciphertext FROM {$wpdb->prefix}hubby_supplier_jobs WHERE order_id=%d", $id));
    if (!$rows || count($rows) !== $expected) return;
    foreach ($rows as $row) if ($row->state !== 'delivered' || !$row->delivered_ciphertext) return;
    foreach ($order->get_items('line_item') as $item_id => $item) {
        $units = array_values(array_filter($rows, static fn($row) => (int) $row->item_id === (int) $item_id));
        if (count($units) !== (int) $item->get_quantity()) return;
    }
    if ($order->get_status() === 'processing') $order->update_status('completed', 'Hubby: tất cả đơn vị hàng đã được cấp và lưu mã hóa.');
}

add_action('init', static function () {
    if (get_option('hubby_supplier_schema') !== '3' && current_user_can('manage_woocommerce')) hubby_supplier_install();
});
add_action('action_scheduler_init', static function () {
    if (function_exists('as_has_scheduled_action') && !as_has_scheduled_action('hubby_supplier_pass', [], 'hubby-suppliers')) {
        as_schedule_recurring_action(time() + 60, 60, 'hubby_supplier_pass', [], 'hubby-suppliers', true);
    }
});
