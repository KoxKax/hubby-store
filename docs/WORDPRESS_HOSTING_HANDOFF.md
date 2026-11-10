# Triển khai Hubby WooCommerce — phần hosting cần chốt

**Quyết định mới nhất:** ngân sách 0đ, không đặt mua shared hosting/VPS. Chưa xác minh và cấp hosting miễn phí đáp ứng WooCommerce, outbound API và webhook payOS. Gói supplier mới là 0.3.0; lỗi Bite được đối soát/giao thủ công, không bắt buộc provider có API lookup. Nội dung đề xuất mua/ngân sách chưa chốt bên dưới chỉ còn là lịch sử.

Ngày: 01/11/2026. Owner hiện chỉ có Cloudflare và Supabase, chưa có hosting PHP/MySQL. Hệ thống công khai cũ còn hoạt động; không đổi DNS hoặc bật payOS khi môi trường mới chưa sẵn sàng.

## Đích triển khai

Ưu tiên hosting WordPress có quản trị/cPanel tương đương để giảm công quản lý VPS cho một Owner. Không có cam kết phải mua nhà cung cấp nào. Trước đặt hàng cần đối chiếu đúng chu kỳ, giá gia hạn, VAT/tổng trả trước và điều khoản ngành hàng; giá quảng cáo theo tháng không mặc định là thanh toán từng tháng.

Yêu cầu: PHP 8.3+, MySQL 8 hoặc MariaDB 10.6+, HTTPS, sao lưu có cách phục hồi, lịch nền phục vụ Action Scheduler, outbound HTTPS tới payOS và API nguồn, hỗ trợ import media và cấu hình bí mật ngoài mã nguồn. Đối chiếu giới hạn CPU/RAM/entry processes và dung lượng thực tế; không hứa chịu tải từ số tài nguyên quảng cáo. Cần vị trí chuẩn bị riêng, có thể là subdomain/thư mục phù hợp gói, và phương án rollback. Chưa cần mua VPS.

## Codex có thể làm sau khi có hosting

- Cài WordPress/WooCommerce, cấu hình ngôn ngữ/tiền tệ và quyền quản trị đúng danh tính Owner; không biến tài khoản local thành Owner công khai.
- Upload theme 0.1.0 và plugin Hubby Suppliers 0.2.0 được đóng gói riêng. Có source hàng đợi, bridge receipt và delivery nhưng provider purchase_ready vẫn tắt; chưa nghiệm thu provider/gateway trên hosting.
- Chuyển catalog với mapping cố định; giữ nguyên nguồn publish và bản nháp, không nhân bản đơn hoặc đồng bộ hai hệ thống đặt hàng. Bản nháp Supabase hiện chưa chuyển sang WordPress, vẫn được giữ nguyên ở nguồn.
- Hoàn thiện adapter provider sau khi có schema và cơ chế xử lý timeout/đơn chưa rõ kết quả; Owner tự nhập API key qua cấu hình riêng.
- Cấu hình payOS trên đích mới và xác nhận receiver trước chuyển webhook; không tái sử dụng receiver Hubby Worker cho đơn Woo chưa có mapping.
- Chỉ cutover domain khi đích mới đủ điều kiện; giữ workers.dev và dữ liệu cũ phục vụ rollback.

## Owner cần quyết định

Ngân sách hosting tối đa mỗi tháng và tổng tiền trả trước tối đa. Tạo/đăng nhập tài khoản hosting, điền thông tin hợp đồng và thanh toán do Owner trực tiếp thực hiện; không gửi mật khẩu/OTP/API key vào chat. Sau đó có thể thao tác cài đặt qua Chrome đang mở theo yêu cầu Owner.

## Local đã chuẩn bị

`wordpress/` chứa launcher, WordPress/WooCommerce ghim phiên bản, theme Hubby và plugin mapping nguồn. Runtime SQLite/WASM chỉ chạy local trên 127.0.0.1:9400. Thanh toán/email/outbound API bị chặn bằng mu-plugin chỉ dành local. Không đưa `.runtime`, `.private`, `local-mu-plugins` hoặc auto-login local lên hosting.

Schema WordPress v2 đã được cài vào local bằng CLI. Metadata xác nhận hai bảng jobs/receipt, các unique index và 0 job/0 event; đây không phải kiểm thử concurrency hoặc xác nhận MySQL. CSV catalog native và manifest đã sinh, xem WOOCOMMERCE_DATA_MIGRATION.md; chưa import lại vào hệ khác.

Nguồn yêu cầu máy chủ: https://woocommerce.com/document/server-requirements/ .
