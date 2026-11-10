# Trạng thái phát hành WooCommerce Hubby — 01/11/2026

**ĐÃ HỦY 02/11/2026:** Owner chọn giữ shop/CMS cũ trên Workers + Supabase. Không tiếp tục phát hành WooCommerce hoặc yêu cầu Owner mở/tạo hosting. Các trạng thái bên dưới chỉ mô tả prototype lịch sử.

## Quyết định mới nhất của Owner — ưu tiên hơn các ghi chú bên dưới

- Ngân sách hosting: **0đ**. Không tự mua gói hoặc dùng trial có thể phát sinh phí. Chưa có hosting miễn phí phù hợp được xác minh/cấp tài khoản; chưa triển khai WordPress công khai.
- Bite: dùng tài liệu công khai hiện có; lỗi và bảo hành do Owner xử lý khi khách liên hệ. Không còn yêu cầu phải có thêm tài liệu lookup mới được phát triển tiếp.
- Plugin 0.3.0 có chế độ gọi mua một lần; kết quả không rõ chuyển đối soát, không tự mua lại. Owner có thể nhập hàng sau đối soát với quyền quản trị, xác nhận và bằng chứng thanh toán; nội dung được mã hóa, lưu người xử lý/lý do/thời gian trong cùng cập nhật DB.
- Schema v3 đã cài trong DB SQLite local: đọc metadata xác nhận option 3 và ba cột manual_actor/manual_reason/manual_at, 0 jobs. Chưa xác nhận MySQL trên hosting. PHP syntax 17 file exit0; không chạy bộ kiểm thử theo yêu cầu. Chưa nghiệm thu giao dịch thật.
- Chỉ cấu hình riêng `HUBBY_BITE_ENABLED=true`, `HUBBY_SUPPLIER_PURCHASES_ENABLED=true`, API key và khóa mã hóa trên máy chủ mới mở điều kiện adapter; local luôn tắt. Chưa bật các cờ trên môi trường công khai.

Các yêu cầu ngân sách chưa chốt, API lookup bắt buộc, và purchase_ready luôn false trong phần lịch sử dưới đây đã được thay thế bởi quyết định này. Hosting, chuyển dữ liệu/CMS và tích hợp payOS trên đích mới vẫn còn việc phải làm.

Chưa hoàn tất. Đây là trạng thái chờ đầu vào, không phải nghiệm thu.

| Yêu cầu | Bằng chứng hiện tại | Kết luận |
| --- | --- | --- |
| WordPress/WooCommerce | Runtime local đã cài, theme hiển thị trong Chrome | Có bản phát triển, chưa public |
| Catalog | db-3; 6 sản phẩm/7 gói; CSV 13 dòng và manifest | Có gói chuyển đổi, chưa nhập hosting |
| CMS nội dung | Native sản phẩm/FAQ/banner/policies; giữ source publish/draft cũ | Chưa chuyển draft/media đầy đủ lên đích mới |
| Database cấp hàng | Schema v2 và unique indexes trong SQLite local, 0 jobs/events | Chưa xác minh MySQL/MariaDB |
| Thanh toán | payOS upstream đã tải để review; bridge có trong source | Chưa cài gateway/receiver trên đích mới, chưa nhận tiền |
| API nguồn | Bite docs cơ bản; mapping/queue/encryption có source | purchase_ready=false; schema/cost/recovery còn thiếu |
| Danh tính và chức năng khách | Woo native account/order; dữ liệu Supabase cũ giữ nguyên | Chưa chuyển Auth/ticket/wishlist/order history hoặc chốt parity |
| Phát hành | Không có hosting PHP/MySQL được chọn | Chưa thể deploy/cutover |
| Kiểm chứng | PHP syntax 17 file exit0; metadata schema | Không có test suite, provider UAT, restore hoặc production acceptance |

## Đầu vào cần Owner

1. Chốt trần hosting mỗi tháng và tổng trả trước tối đa, hoặc yêu cầu giữ 0đ. Chưa được phép tự mua/tạo tài khoản tài chính/hợp đồng thay Owner.
2. Tài liệu chi tiết Bite hoặc thông tin từ provider về schema phản hồi, tra đơn/chống trùng, giá vốn/currency/price-lock, lỗi và hoàn/đổi. Không gửi API key vào chat; cấu hình riêng sau khi có đích triển khai.
3. Trước cutover: chốt nguồn/SKU được bán, phương án chuyển danh tính/nội dung đang nháp và nhập các khóa trên hosting mới. Secret Worker không tự có trên WordPress.

Các blocker hosting và provider đã còn nguyên qua nhiều lượt goal liên tiếp. Phần chuẩn bị độc lập đã được đóng gói; không tiếp tục tự giả định hợp đồng API, ngân sách hoặc danh tính để tạo tiến độ giả. Tiếp tục khi Owner cung cấp lựa chọn hoặc đầu vào thực tế. Không coi code source có sẵn là tất cả chức năng đã hoạt động.
