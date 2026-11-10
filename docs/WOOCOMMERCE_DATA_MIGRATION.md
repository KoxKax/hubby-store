# Gói chuyển catalog Hubby bằng importer WooCommerce

Source: snapshot published db-3; nguồn và bản nháp Supabase được giữ nguyên. Không lấy catalog fixtures làm nguồn giá. Gói migration được tạo trong wordpress/.private/migration và không commit vào Git vì sau này có thể chứa dữ liệu chưa công khai.

## Đã chuẩn bị

- CSV UTF-8 có BOM theo cột native WooCommerce 11.2.1: 6 variable product và 7 variation/virtual, parent bằng SKU chứ không gán lại ID database cũ.
- Giữ giá đã niêm yết; gói chưa có giá để trống, không gán 0. Tất cả outofstock, không import demo_stock thành hàng có thể bán. Giá bán không tự thay bằng giá vốn API.
- Source key, revision, slug và nội dung gốc lưu trong custom meta. Plugin Hubby normalize JSON metadata bằng hook native importer và giữ slug.
- Owner media hiện có được tham chiếu bằng URL media đang publish; chưa sideload lại media từ Supabase vào hosting. Hình fallback vẫn do theme cung cấp, không thay Owner upload.
- Manifest có revision, số lượng và SHA256 để đối chiếu file. File chỉ chứa catalog công khai, không có khách hàng, đơn, mật khẩu, API key hoặc hàng bí mật.

## Thao tác trên hosting mới khi đã có

1. Cài WooCommerce và Hubby Suppliers; chưa bật gateway hay nguồn mua tự động.
2. Products → All products → Import. Chọn CSV. Để **Update existing products** tắt; đây là import một lần vào hệ mới đã chuẩn bị, không ghi đè sản phẩm Owner sửa về sau.
3. Đối chiếu mapping cột: Type, SKU, Published, Regular price, Parent, Attributes và các cột Meta. Các cột Stock để trống; In stock?=0. Không tự ánh xạ Meta thành giá/tồn.
4. Sau import đối chiếu 6 sản phẩm/7 gói, giá Canva 49.000 VND, sáu gói chưa chốt giá không tự có giá và chưa có hàng bán được. Bấm từng gói để kiểm tra mapping nguồn trước bật thanh toán.
5. Cấu hình product permalink base `san-pham` để giữ các URL sản phẩm cũ nếu chọn cùng domain; lập redirect cho các đường dẫn khác. Không redirect webhook POST của Worker sang gateway WooCommerce.

Không tự import lại nếu bị dừng giữa chừng. Trước hết đối chiếu SKU nào đã được tạo và log import để tiếp tục đúng phần thiếu.

## Chưa chuyển trong CSV

Banner/FAQ local đã dùng native WordPress CPT, chính sách là native Pages. Bộ nội dung này cần chuyển sang hosting bằng gói nội dung/mapping riêng. Draft Supabase chưa import hoặc publish. Chưa chuyển danh tính Auth, feedback/ticket, wishlist, order history, quyền nhận hàng, media private hoặc secret. Không giả định mật khẩu/session Supabase dùng được trên WordPress. Cần chốt cách chuyển danh tính và các chức năng khách hàng trước cutover.

CSV đã sinh không đồng nghĩa đã nhập/kiểm chứng native importer trên hosting. Không có hosting, không có đổi domain hoặc migration remote trong bước chuẩn bị này.
