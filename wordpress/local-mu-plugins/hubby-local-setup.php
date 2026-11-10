<?php
defined('ABSPATH') || exit;
if (wp_get_environment_type() !== 'local') return;
define('HUBBY_LOCAL_IMPORT', true);
add_action('wp_loaded', static function () {
    require_once ABSPATH . 'wp-admin/includes/plugin.php';
    $plugin = 'hubby-suppliers/hubby-suppliers.php';
    if (file_exists(WP_PLUGIN_DIR . '/' . $plugin) && !is_plugin_active($plugin)) {
        activate_plugin($plugin, '', false, true);
    }
    if (wp_get_theme('hubby')->exists() && get_stylesheet() !== 'hubby') {
        switch_theme('hubby');
        // Theme functions were already loaded for this request. Render only
        // after a fresh GET so the new templates never run with old functions.
        if (($_SERVER['REQUEST_METHOD'] ?? '') === 'GET') {
            wp_safe_redirect(home_url('/'), 303);
            exit;
        }
    }
    // Deliberately defer the one-time import until the activated plugin has
    // loaded on the next request. Never publish the old CMS draft here.
    $file = ABSPATH . '.hubby-migration/published.json';
    if (function_exists('hubby_import_published_catalog') && file_exists($file) && !get_option('hubby_catalog_import_started')) {
        try {
            $content = json_decode(file_get_contents($file), true, 64, JSON_THROW_ON_ERROR);
            hubby_import_published_catalog($content);
            if (class_exists('WC_Install')) WC_Install::create_pages();
        } catch (Throwable $error) {
            update_option('hubby_local_import_issue', 'Import stopped. Inspect the local mapping before retrying.', false);
        }
    }
    $presentation = ABSPATH . '.hubby-migration/presentation.json';
    if (file_exists($presentation) && !get_option('hubby_presentation_content')) {
        $rendered = json_decode(file_get_contents($presentation), true);
        if (is_array($rendered) && ($rendered['schemaVersion'] ?? null) === 2) {
            add_option('hubby_presentation_content', $rendered, '', false);
        }
    }
    $presentation_v2 = ABSPATH . '.hubby-migration/presentation-v2.json';
    if (file_exists($presentation_v2) && !get_option('hubby_presentation_v2_applied')) {
        $previous = file_exists($presentation) ? json_decode(file_get_contents($presentation), true) : null;
        $current = get_option('hubby_presentation_content');
        $rendered = json_decode(file_get_contents($presentation_v2), true);
        if ((!$current || $current === $previous) && is_array($rendered) && ($rendered['schemaVersion'] ?? null) === 2) {
            update_option('hubby_presentation_content', $rendered, false);
            add_option('hubby_presentation_v2_applied', 'yes', '', false);
        }
    }
    if (!get_option('hubby_local_currency_formatted')) {
        update_option('woocommerce_currency_pos', 'right_space');
        update_option('woocommerce_price_thousand_sep', '.');
        update_option('woocommerce_price_decimal_sep', ',');
        add_option('hubby_local_currency_formatted', 'yes', '', false);
    }
    if (get_option('hubby_presentation_v2_applied') && !get_option('hubby_native_content_started') && post_type_exists('hubby_faq')) {
        global $wpdb;
        $claimed = $wpdb->query($wpdb->prepare("INSERT IGNORE INTO {$wpdb->options} (option_name,option_value,autoload) VALUES (%s,%s,%s)", 'hubby_native_content_started', gmdate('c'), 'no'));
        if ($claimed !== 1) return;
        wp_cache_delete('hubby_native_content_started', 'options');
        $rendered = get_option('hubby_presentation_content');
        $complete = true;
        foreach (($rendered['faqs'] ?? []) as $index => $faq) {
            $post = wp_insert_post(['post_type' => 'hubby_faq', 'post_status' => 'publish', 'post_title' => $faq['question'], 'post_content' => esc_html($faq['answer']), 'menu_order' => $index], true);
            if (is_wp_error($post)) $complete = false;
        }
        foreach (($rendered['experience']['slides'] ?? []) as $index => $slide) {
            $post = wp_insert_post(['post_type' => 'hubby_banner', 'post_status' => 'publish', 'post_title' => $slide['media']['alt'] ?? $slide['title'], 'post_content' => '', 'menu_order' => $index], true);
            if (is_wp_error($post)) { $complete = false; continue; }
            update_post_meta($post, '_hubby_default_image', $slide['media']['src'] ?? '');
            update_post_meta($post, '_hubby_banner_url', $slide['href']);
        }
        if ($complete) add_option('hubby_native_content_imported', 'yes', '', false);
        else update_option('hubby_local_import_issue', 'Native content import stopped. Inspect before retrying.', false);
    }
});
