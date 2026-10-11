# Hubby — chỉnh sửa trải nghiệm storefront

Historical notes: docs/STOREFRONT_V2.md supersedes the illustrative notifications/chat/old footer and banner behavior below. Those entries remain as historical evidence, not current behavior.

Owner yêu cầu11/10/2026; chạy local, không xuất bản Internet hoặc mở bán.

## Đã đổi

- Dải thông báo luân phiên, header logo/tìm kiếm/ngôn ngữ/tra đơn/modal tài khoản/giỏ. Tìm kiếm đi tới catalog trên home; catalog/support/category URLs cũ chuyển tới section phù hợp. Chi tiết sản phẩm giữ riêng.
- Giới thiệu trái/banner phải → các bước → nhóm sản phẩm theo category → khu vực reviews → FAQ → hỗ trợ. Thêm nền sao CSS và mint/peach/lavender, responsive, không tải asset ngoài.
- Bỏ ribbon và dòng demo lặp lại trên home/product/cart, giữ ghi chú local cuối trang và cảnh báo ở checkout/order để không nhầm tiền/kho thật. Custom CMS copy không bị rewrite; chỉ chuỗi fixture cũ có mapping trình bày.
- CMS tab Trang chủ: hero,1–8 notices,1–6 slides với ảnh raster180KB/slot, approved reviews, toggle purchase illustration, Telegram link allowlisted. Lưu nháp/xuất bản/khôi phục vẫn CAS server; old history retained. Supabase chưa hỗ trợ extension, publish bị chặn có giải thích.
- Modal đăng nhập/đăng ký/quên mật khẩu, Google action, xác minh server cho icon account. Local chưa có Auth, fields disabled; không tạo fake account.
- Form tra đơn mã+email: email local cố định demo@buyer.example, chỉ đơn có quyền trong trình duyệt đã đặt hàng; phản hồi unknown/wrong/cross-session như nhau, không public secret. Cross-device email verification chưa kết nối.
- Hộp hội thoại là ticket theo đơn hiện có; nhận phản hồi trong order. Fanpage chưa có: nút mở giải thích và chọn hỗ trợ nội bộ. Telegram chưa có: không fake destination, không gửi tin ra ngoài. CMS link Telegram chỉ mở app, không relay tự động.
- Purchase popup giả luôn nhãn MINH HỌA/KHÔNG PHẢI ĐƠN THẬT, không tên khách/địa điểm giả;22s/5.5s, dismiss, tab hidden skip, reduced-motion skip. Reviews để trống vì chưa có phản hồi đã duyệt.

## Owner làm riêng

Review nội dung/giao diện; nhập banner và phản hồi được phép công bố qua CMS. Cung cấp Fanpage/Telegram khi có. Chốt SKU/điều kiện/gói Google, quyền bán, giá và chính sách trước staging. Không gửi bot token/secrets trong chat/CMS.

## Codex / giới hạn còn lại

Kiểm responsive/modal/search/carousel/lookup/chat/CMS; giữ mock payments/suppliers. Real Auth, verified guest email, commerce PostgreSQL và SMTP, Facebook/Telegram bot server integration, English translation, approved business copy/media/reviews và production acceptance là scope tiếp theo, không giả pass ở bản local.

Checks and screenshots recorded in IMPLEMENTATION_PLAN.md and artifacts/storefront-refresh. Source replacement removed temporary home-legacy file created during this turn; old CMS revisions/history kept. No inventory/customer data or material user file deleted.
