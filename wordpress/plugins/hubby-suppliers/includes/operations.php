<?php
defined('ABSPATH') || exit;

function hubby_render_fulfillment_queue(): void {
    if (!current_user_can('manage_woocommerce')) return;
    if (get_option('hubby_supplier_schema') !== '3') {
        echo '<p>Database cấp hàng chưa sẵn sàng. Chưa thể nhận đơn qua nguồn API.</p>';
        return;
    }
    global $wpdb;
    $jobs = $wpdb->get_results("SELECT id,order_id,supplier,state,issue,submitted_at FROM {$wpdb->prefix}hubby_supplier_jobs ORDER BY created_at DESC,id DESC LIMIT 50");
    echo '<h2>Cấp hàng gần đây</h2><p>Hiển thị tối đa 50 đơn vị hàng. Chỉ thử lại tác vụ bị chặn trước khi gửi; tác vụ chưa rõ kết quả không được mua lại tự động.</p><table class="widefat striped"><thead><tr><th>Đơn</th><th>Nguồn</th><th>Trạng thái</th><th>Vấn đề</th><th>Xử lý</th></tr></thead><tbody>';
    foreach ($jobs as $job) {
        $order = wc_get_order((int) $job->order_id);
        $url = $order ? $order->get_edit_order_url() : '';
        echo '<tr><td><a href="' . esc_url($url) . '">#' . absint($job->order_id) . '</a></td><td>' . esc_html($job->supplier) . '</td><td>' . esc_html($job->state) . '</td><td>' . esc_html($job->issue ?: '—') . '</td><td>';
        if ($job->state === 'blocked' && !$job->submitted_at) {
            echo '<form method="post" action="' . esc_url(admin_url('admin-post.php')) . '"><input type="hidden" name="action" value="hubby_retry_unsubmitted"><input type="hidden" name="job_id" value="' . esc_attr($job->id) . '">';
            wp_nonce_field('hubby_retry_' . $job->id);
            echo '<button class="button" type="submit">Đưa lại vào hàng đợi</button></form>';
        }
        if ($job->state === 'uncertain' && current_user_can('manage_options')) {
            echo '<form method="post" target="_blank" action="' . esc_url(admin_url('admin-post.php')) . '"><input type="hidden" name="action" value="hubby_review_response"><input type="hidden" name="job_id" value="' . esc_attr($job->id) . '">';
            wp_nonce_field('hubby_response_' . $job->id);
            echo '<button class="button" type="submit">Mở phản hồi riêng</button></form>';
        }
        if (in_array($job->state, ['queued', 'blocked', 'uncertain'], true) && current_user_can('manage_options')) {
            echo '<details><summary>Giao hàng sau đối soát</summary><form method="post" action="' . esc_url(admin_url('admin-post.php')) . '"><input type="hidden" name="action" value="hubby_manual_delivery"><input type="hidden" name="job_id" value="' . esc_attr($job->id) . '">';
            wp_nonce_field('hubby_manual_' . $job->id);
            echo '<p><label>Nội dung giao một đơn vị hàng<textarea name="delivery" required maxlength="32000" autocomplete="off" class="widefat"></textarea></label></p><p><label>Kết quả đối soát <select name="reason"><option value="supplier_confirmed">Nguồn đã xác nhận cấp hàng</option><option value="provided_replacement">Đã có hàng thay thế</option></select></label></p><p><label><input type="checkbox" name="confirmed" value="yes" required> Đã đối chiếu với nguồn; thao tác này không gọi mua hoặc xác nhận thêm tiền.</label></p><button type="submit" class="button">Lưu hàng mã hóa cho khách</button></form></details>';
        }
        echo '</td></tr>';
    }
    if (!$jobs) echo '<tr><td colspan="5">Chưa có tác vụ cấp hàng.</td></tr>';
    echo '</tbody></table><h2>Thanh toán cần đối soát</h2><table class="widefat striped"><thead><tr><th>Đơn</th><th>Số tiền VND</th><th>Thời điểm UTC</th><th>Ghi chú</th></tr></thead><tbody>';
    $reviews = $wpdb->get_results("SELECT order_id,amount_vnd,created_at FROM {$wpdb->prefix}hubby_payment_events WHERE state='review' ORDER BY id DESC LIMIT 50");
    foreach ($reviews as $event) echo '<tr><td>#' . absint($event->order_id) . '</td><td>' . esc_html(number_format((int) $event->amount_vnd, 0, ',', '.')) . '</td><td>' . esc_html($event->created_at) . '</td><td>Kiểm tra với payOS/ngân hàng; chưa xác nhận đủ điều kiện giao hàng.</td></tr>';
    if (!$reviews) echo '<tr><td colspan="4">Chưa có khoản cần đối soát.</td></tr>';
    echo '</tbody></table>';
}

function hubby_admin_job(): object {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST' || !current_user_can('manage_woocommerce')) wp_die('Không có quyền.', '', ['response' => 403]);
    $id = $_POST['job_id'] ?? '';
    if (!is_string($id) || !preg_match('/^[a-f0-9-]{36}$/iD', $id)) wp_die('Yêu cầu không hợp lệ.');
    global $wpdb;
    $row = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$wpdb->prefix}hubby_supplier_jobs WHERE id=%s", $id));
    if (!$row) wp_die('Không tìm thấy tác vụ.');
    return $row;
}
add_action('admin_post_hubby_retry_unsubmitted', static function () {
    $job = hubby_admin_job();
    check_admin_referer('hubby_retry_' . $job->id);
    $order = wc_get_order((int) $job->order_id);
    $definition = hubby_supplier_definitions()[$job->supplier] ?? null;
    if (!$order || !hubby_order_has_verified_payment($order) || !$definition || $definition['purchase_ready'] !== true) wp_die('Nguồn hoặc thanh toán chưa đủ điều kiện.');
    global $wpdb;
    $changed = $wpdb->query($wpdb->prepare("UPDATE {$wpdb->prefix}hubby_supplier_jobs SET state='queued',issue=NULL,updated_at=UTC_TIMESTAMP() WHERE id=%s AND state='blocked' AND submitted_at IS NULL", $job->id));
    if ($changed === 1) {
        $order->add_order_note('Hubby: quản trị viên #' . get_current_user_id() . ' đưa tác vụ chưa gửi trở lại hàng đợi. Không tạo mua hàng mới cho tác vụ đã gửi.');
        if (function_exists('as_enqueue_async_action')) as_enqueue_async_action('hubby_supplier_pass', [], 'hubby-suppliers', true);
    }
    wp_safe_redirect(admin_url('admin.php?page=hubby-suppliers'), 303);
    exit;
});
add_action('admin_post_hubby_review_response', static function () {
    if (!current_user_can('manage_options')) wp_die('Không có quyền.', '', ['response' => 403]);
    $job = hubby_admin_job();
    check_admin_referer('hubby_response_' . $job->id);
    nocache_headers();
    header('Cache-Control: private, no-store');
    header('Referrer-Policy: no-referrer');
    header('X-Content-Type-Options: nosniff');
    header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'");
    header('Content-Type: text/plain; charset=utf-8');
    if ($job->state !== 'uncertain' || !$job->ciphertext) { echo 'Không có phản hồi đã lưu. Cần tra giao dịch với nhà cung cấp trước khi xử lý.'; exit; }
    try {
        $value = hubby_open_delivery($job->id . ':response', $job->ciphertext);
        $order = wc_get_order((int) $job->order_id);
        if ($order) $order->add_order_note('Hubby: quản trị viên #' . get_current_user_id() . ' đã mở phản hồi API riêng để đối soát.');
        echo $value;
    } catch (Throwable $error) { status_header(503); echo 'Chưa thể mở phản hồi. Kiểm tra khóa mã hóa ở máy chủ.'; }
    exit;
});

add_action('admin_post_hubby_manual_delivery', static function () {
    if (!current_user_can('manage_options')) wp_die('Không có quyền.', '', ['response' => 403]);
    $job = hubby_admin_job();
    check_admin_referer('hubby_manual_' . $job->id);
    nocache_headers();
    header('Cache-Control: private, no-store');
    header('Referrer-Policy: no-referrer');
    $value = $_POST['delivery'] ?? null;
    $reason = $_POST['reason'] ?? null;
    if (!is_string($value) || strlen($value) < 1 || strlen($value) > 32000 || !is_string($reason) || !in_array($reason, ['supplier_confirmed', 'provided_replacement'], true) || ($_POST['confirmed'] ?? '') !== 'yes') wp_die('Kiểm tra nội dung và xác nhận đối soát.');
    $order = wc_get_order((int) $job->order_id);
    if (!$order || !hubby_order_has_verified_payment($order)) wp_die('Đơn chưa đủ bằng chứng thanh toán hoặc đã hoàn tiền.');
    try { $sealed = hubby_seal_delivery($job->id, wp_unslash($value)); }
    catch (Throwable $error) { wp_die('Chưa thể mã hóa. Kiểm tra khóa trên máy chủ.'); }
    global $wpdb;
    // Submitting is deliberately excluded: do not race an active purchase.
    // Audit and the terminal delivery become visible in one atomic update.
    $changed = $wpdb->query($wpdb->prepare("UPDATE {$wpdb->prefix}hubby_supplier_jobs SET state='delivered',delivered_ciphertext=%s,issue=NULL,manual_actor=%d,manual_reason=%s,manual_at=UTC_TIMESTAMP(),updated_at=UTC_TIMESTAMP() WHERE id=%s AND state IN ('queued','blocked','uncertain') AND delivered_ciphertext IS NULL", $sealed, get_current_user_id(), $reason, $job->id));
    if ($changed !== 1) wp_die('Tác vụ đã thay đổi. Không ghi đè hàng đã giao hoặc tác vụ đang gọi nguồn.');
    $order->add_order_note('Hubby: quản trị viên #' . get_current_user_id() . ' giao một đơn vị hàng sau đối soát (' . $reason . '). Không gọi mua lại; nội dung hàng được mã hóa, không ghi vào ghi chú.');
    hubby_complete_delivered_order((int) $job->order_id);
    wp_safe_redirect(admin_url('admin.php?page=hubby-suppliers'), 303);
    exit;
});
