<?php
defined('ABSPATH') || exit;

// Use WordPress's editor, revisions and media library rather than another CMS.
add_action('init', static function () {
    register_post_type('hubby_faq', [
        'labels' => ['name' => 'FAQ Hubby', 'singular_name' => 'Câu hỏi', 'add_new_item' => 'Thêm câu hỏi', 'edit_item' => 'Sửa câu hỏi'],
        'public' => false, 'show_ui' => true, 'show_in_rest' => true,
        'menu_icon' => 'dashicons-editor-help', 'supports' => ['title', 'editor', 'revisions', 'page-attributes'],
        'map_meta_cap' => true,
    ]);
    register_post_type('hubby_banner', [
        'labels' => ['name' => 'Banner Hubby', 'singular_name' => 'Banner', 'add_new_item' => 'Thêm banner', 'edit_item' => 'Sửa banner'],
        'public' => false, 'show_ui' => true, 'show_in_rest' => true,
        'menu_icon' => 'dashicons-images-alt2', 'supports' => ['title', 'editor', 'thumbnail', 'revisions', 'page-attributes'],
        'map_meta_cap' => true,
    ]);
});
add_action('add_meta_boxes_hubby_banner', static function () {
    add_meta_box('hubby-banner-link', 'Đường dẫn banner', static function ($post) {
        wp_nonce_field('hubby_banner_link_' . $post->ID, 'hubby_banner_nonce');
        echo '<p><label for="hubby-banner-url">URL khi bấm banner</label></p><input class="widefat" id="hubby-banner-url" name="hubby_banner_url" type="text" value="' . esc_attr(get_post_meta($post->ID, '_hubby_banner_url', true)) . '" placeholder="/#san-pham">';
        echo '<p>Chọn ảnh ở mục Ảnh đại diện. Dùng Thứ tự trong Thuộc tính để sắp xếp; chỉ banner đã xuất bản mới hiện.</p>';
    });
});
add_action('save_post_hubby_banner', static function ($id) {
    if (wp_is_post_revision($id) || wp_is_post_autosave($id) || !current_user_can('edit_post', $id)) return;
    $nonce = $_POST['hubby_banner_nonce'] ?? '';
    if (!is_string($nonce) || !wp_verify_nonce(sanitize_text_field(wp_unslash($nonce)), 'hubby_banner_link_' . $id)) return;
    $url = $_POST['hubby_banner_url'] ?? '';
    if (!is_string($url)) return;
    $url = trim(wp_unslash($url));
    if ($url !== '' && !str_starts_with($url, '/') && !str_starts_with($url, 'https://')) return;
    if (str_starts_with($url, '//')) return;
    update_post_meta($id, '_hubby_banner_url', esc_url_raw($url));
});

function hubby_home_faqs(): array {
    return array_map(static fn($post) => ['question' => $post->post_title, 'answer' => $post->post_content], get_posts([
        'post_type' => 'hubby_faq', 'post_status' => 'publish', 'posts_per_page' => 50,
        'orderby' => ['menu_order' => 'ASC', 'ID' => 'ASC'],
    ]));
}
function hubby_home_banners(): array {
    $slides = [];
    foreach (get_posts(['post_type' => 'hubby_banner', 'post_status' => 'publish', 'posts_per_page' => 12, 'orderby' => ['menu_order' => 'ASC', 'ID' => 'ASC']]) as $post) {
        $image = get_the_post_thumbnail_url($post, 'full');
        if (!$image) $image = get_post_meta($post->ID, '_hubby_default_image', true);
        if (!$image) continue;
        $slides[] = ['href' => get_post_meta($post->ID, '_hubby_banner_url', true) ?: '/#san-pham', 'media' => [
            'src' => $image, 'alt' => get_post_meta(get_post_thumbnail_id($post), '_wp_attachment_image_alt', true) ?: $post->post_title,
        ]];
    }
    return $slides;
}
