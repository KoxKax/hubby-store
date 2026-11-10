# Hướng chuyển Hubby sang WooCommerce — 01/11/2026

**ĐÃ HỦY 02/11/2026 theo Owner.** Giữ giao diện shop cũ và Cloudflare Workers + Supabase. Nội dung dưới đây là lịch sử, không còn là kế hoạch triển khai; không tìm hosting hay chuyển dữ liệu/khóa sang WordPress.

## Quyết định và phạm vi

Owner chọn hướng WordPress + WooCommerce để dùng quản trị/thương mại có sẵn; dự định cấp hàng qua API nhiều nhà cung cấp, Bite là nguồn tham khảo đầu tiên. Đây là thay đổi định hướng so với CMS tự viết trước đây. WooCommerce không tự bảo đảm ít lỗi: tích hợp, chất lượng plugin, cập nhật và vận hành vẫn quyết định độ tin cậy.

Phiên này chỉ đọc tài liệu công khai và chuẩn bị phương án. Không cài WordPress, mua hosting, đổi DNS, nhập lại catalog, chuyển khách hàng, chép secrets, gọi mua hàng hoặc bật thanh toán. Worker hiện tại vẫn là hệ thống phục vụ công khai; giữ PAYMENTS_MODE=mock. Không chạy kiểm thử.

## Đọc Bite

Nguồn trực tiếp: https://reseller.bite-store.com/docs . Đường dẫn /api-docs/ quan sát thấy chuyển về /docs.

- Auth: header X-API-Key.
- GET /v1/products: tài liệu mô tả danh sách sản phẩm, tồn và giá hiện tại; đề cập normalPrice/promotion.
- GET /v1/balance: tài liệu mô tả ví USD và points. Chưa kết luận mọi giá sản phẩm/settlement đều bằng USD khi thiếu schema phản hồi.
- POST /v1/orders: ví dụ body productId và quantity; tài liệu nói trả deliveredKeys.
- Trang liệt kê 13 dạng giao, gồm tài khoản, link, license và raw text. Chỉ hỗ trợ dạng dữ liệu của SKU thực sự chọn; không suy đoán ý nghĩa từ tên sản phẩm, không lưu dữ liệu giao bí mật trong log/order note/email.
- Chưa thấy tài liệu công khai tại trang này cho idempotency key, lookup/recovery order, webhook, lỗi/rate limit, sandbox, refund/replacement hoặc giới hạn tổng tiền mua. Không diễn giải sự thiếu tài liệu thành khẳng định API không có các khả năng đó.
- Chưa có API key; không gọi endpoint authenticated, không đặt đơn/nạp ví, chưa xác nhận plugin WooCommerce chính thức của Bite.

## Kiến trúc đề xuất

1. WordPress + WooCommerce làm nguồn chính cho sản phẩm, biến thể, giá bán, khách và đơn. Dùng CRUD API tương thích HPOS; tránh tự viết lại màn hình đơn/coupon/reports lõi.
2. Theme Hubby dựng lại hình ảnh hiện hữu; mặc định storefront WooCommerce để giảm số lớp đồng bộ, chưa dùng React headless + hai hệ đăng nhập/giỏ/checkout.
3. Một plugin Hubby Suppliers chứa adapter riêng cho từng nguồn. Mapping variant Woo → supplier + external product ID, hỗ trợ tắt nguồn/chọn nguồn chính/dự phòng có kiểm soát. Không tự chuyển nguồn nếu lần mua trước còn chưa rõ kết quả.
4. Sau payment xác minh, lưu ý định cấp hàng bền vững và xếp tác vụ Action Scheduler (chỉ ID). Khóa chống mua trùng theo từng đơn vị order item, ghi external reference và giá vốn snapshot. Action Scheduler không thay thế idempotency của provider.
5. Phân biệt not_sent, submitting, pending, delivered, uncertain, failed/review. Timeout sau gửi chuyển uncertain; tra provider hoặc xử lý thủ công, không tự POST mua lại. Webhook thanh toán lặp không tạo một lần mua mới.
6. Adapter chuẩn hóa kết quả và mã hóa delivery trước khi lưu. Quyền xem hàng thuộc chủ đơn, kiểm tra phía máy chủ; không công khai URL/file chứa credential. Giá bán VND do Owner chốt; giá vốn/currency và số dư riêng, không ghi đè giá bán bằng feed.
7. Tồn API là thông tin có thể đổi giữa lúc xem và lúc mua; không coi số lượng xem trước CMS là tồn thật hoặc coi việc đọc stock là giữ hàng. Cần chính sách khi khách đã trả tiền mà nguồn hết hàng/đổi giá/thiếu số dư.
8. payOS dùng gateway WooCommerce được đánh giá riêng về webhook, currency, chống trùng và refund. Secret Worker hiện có không tự xuất hiện trên hosting WordPress; Owner tự nhập kín khi đích triển khai đã chọn.

## Thứ tự chuyển đổi

- Xác định hosting hiện có hỗ trợ PHP/MySQL hoặc MariaDB, HTTPS, lịch nền, backup và môi trường chuẩn bị riêng. Không cài WordPress chuẩn trực tiếp lên Worker React hiện tại. Không tự mua tài nguyên.
- Dựng bản WordPress/WooCommerce riêng, ghim phiên bản đã chọn và plugin cần thiết; kiểm tra chính sách cập nhật và giá gia hạn hosting/plugin trước quyết định chi phí.
- Lập mapping danh mục/sản phẩm/biến thể và nội dung. Nội dung publish và bản nháp hiện tại là hai nguồn riêng; import một lần có mapping, không publish draft hoặc ghi đè chỉnh sửa mới. Giữ ID/URL cũ bằng mapping và redirect khi cần.
- Tài khoản Supabase không mặc định chuyển được mật khẩu/session sang WordPress. Cần phương án chuyển danh tính riêng; không xuất password hash, không giả định users mới là Owner hoặc dùng role từ metadata khách.
- Chỉ tích hợp Bite sau khi có schema/điều kiện mua và xác nhận recovery/idempotency. Thêm các adapter tiếp theo sau cùng một hợp đồng nghiệp vụ.
- Chưa chuyển domain/webhook/thu tiền cho tới khi đích triển khai cụ thể sẵn sàng và các giới hạn còn thiếu được trình bày rõ. Tại cutover chỉ một hệ thống nhận đơn/payment làm nguồn chính; tránh double fulfillment. Giữ phương án quay về Worker.

## Điều cần cung cấp tiếp

- Owner đã có hosting WordPress/PHP + MySQL chưa? Nếu chưa, chốt ngân sách rồi mới đề xuất nhà cung cấp; không mặc định cần trả phí mới ngay.
- Bite có tài liệu chi tiết/schema, lookup order/idempotency, plugin chính thức và chính sách hoàn/đổi? Chỉ gửi URL hoặc nội dung đã loại secret.

## Nguồn chính thức

- https://woocommerce.com/pricing/ — core miễn phí, hạ tầng/extensions/payment có chi phí riêng.
- https://woocommerce.com/document/server-requirements/ — môi trường PHP/MySQL hoặc MariaDB.
- https://developer.woocommerce.com/docs/features/orders/high-performance-order-storage/ — HPOS và CRUD.
- https://actionscheduler.org/ — hàng đợi nền WordPress; cần cấu hình lịch vận hành phù hợp.

Đây là kế hoạch kiến trúc, không phải tuyên bố đã chuyển hệ thống hoặc tích hợp provider thành công.
