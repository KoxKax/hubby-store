# Hubby — Kiểm tra đăng nhập, CMS và luồng local, 12/10/2026

## Kết quả

Đã cập nhật đăng nhập Google trước, email mở rộng cùng đăng ký/quên mật khẩu trong cửa sổ; CMS và vận hành dùng menu trái, bảng tìm kiếm và khung lưu/xuất bản lấy cảm hứng WordPress/WooCommerce. Không đổi framework, không cài WordPress, không bật dịch vụ thật.

Các luồng local hiện có đã được kiểm tra bằng tests, Workers HTTP và các tương tác trình duyệt nêu dưới đây. Đây không phải xác nhận web sẵn sàng bán hàng thật.

## Lỗi tìm thấy và đã xử lý

- Không báo “đã thêm giỏ” khi gói chưa niêm yết giá; server gate vẫn giữ nguyên.
- Sản phẩm mới không mượn bảo hành/cách giao/media từ mẫu khác; sản phẩm và gói mới chưa được coi là đã chốt giá.
- Email checkout hợp lệ, trim/lowercase trước lưu; đổi email trong cùng checkout replay bị từ chối thay vì trả nhầm đơn.
- Tra đơn kiểm đúng email của đơn thuộc phiên hiện tại, trực tiếp trên dữ liệu riêng trong Worker rồi chỉ trả projection đã ẩn email. Không thêm email vào public list/ops. Email fixture chỉ là fallback cho đơn lịch sử không có email, không mở mọi đơn.
- Nội dung checkout không hứa gửi email khi chưa có dịch vụ gửi.
- Rời CMS có cảnh báo chỉnh sửa chưa lưu; không xuất bản revision khi còn thay đổi chưa lưu.
- Feed local không biến thanh toán mô phỏng thành đơn mua thật; dữ liệu công khai chỉ còn hoạt động thêm giỏ ẩn danh. Lịch sử cũ không bị xóa. Các hàm sinh hoạt động giả trong source/test cũ không được nối vào runtime storefront hay Worker.

## Bằng chứng kiểm tra

`npm run check` cuối: exit 0. Biome 115 files; generated Workers/React Router types + TypeScript; 10 test files, 87 tests; client/SSR build thành công. Tests gồm SQL/RLS PGlite, CSRF/request tampering, CMS/media, idempotency và domain payment/fulfillment. PGlite không thay cho UAT hosted Supabase.

Runtime tách riêng:

```text
npm run preview -- --port 5175 --state hubby-audit-20261012
HUBBY_SMOKE_URL=http://127.0.0.1:5175
npm run smoke
npm run smoke:commerce
npm run smoke:cms
npm run smoke:refresh
npm run smoke:engagement
node scripts/owner-catalog-smoke.mjs --prepare-isolated
```

Cả sáu nhóm đều PASS. Chế độ chuẩn bị sáu SKU chỉ cho phép port thử 5175, tạo revision mới rồi khôi phục nội dung test; không chạy lại migration catalog ở preview Owner. Test orders, CMS revisions và góp ý/đánh giá QA giữ lại trong state thử, không nhập kho hay thông tin khách thật.

- Commerce: 20 checkout đồng thời/1 kho, replay, 20 payment replay/1 job, nhận thiếu/sai, retry, reveal chỉ sau paid, cross-session denied, hỗ trợ/trả lời, resend không tiêu kho mới, refund đóng reveal. Mock payment/refund không tạo public purchase.
- CMS: cạnh tranh save 1 thành công/1 conflict, nháp riêng, publish/SSR và sản phẩm mới, checkout theo catalog động, restore thành revision mới, snapshot đơn cũ không đổi.
- Lookup/support: checkout bằng email QA riêng và đối chiếu đúng email/code cùng phiên; email sai/fixture dùng nhầm/cross-session trả kết quả chung; uppercase replay khớp, đổi email replay trả 409, email không hợp lệ trả 400; ticket chỉ lưu một lần và không truy cập chéo.
- Theme/feedback/activity: theme SSR/persistence/CSRF, góp ý có giới hạn/dedupe, telemetry thêm giỏ và projection ẩn danh, từ chối client tạo purchase.
- Sáu SKU/bảy gói: server chặn checkout/activity chưa giá; review riêng, bounds/dedupe/CSRF; không đưa review/địa chỉ email giả ra công khai.

Trình duyệt: đã thử Google mặc định không có form email; expand, register, forgot, Escape/reopen; CMS search/sửa và cảnh báo mất nháp; sáu mục CMS/tám mục vận hành; menu mobile. Trên runtime riêng đã sửa tên sản phẩm → lưu → áp dụng → thấy storefront đổi → khôi phục phiên bản cũ thành bản mới → storefront trở lại. Đánh giá/góp ý gửi thành công, xuất hiện trong hai mục quản trị riêng. Search/không kết quả, favorite sau reload và theme persistence hoạt động. Favorite thử được bỏ lại, theme chính trả về dark.

Responsive: 6 trang × 4 viewport = 24 checks tại 360/390/768/1440, không document overflow/ảnh lỗi/main trùng. Các trang là home, Canva detail, cart, checkout trống, CMS products và operations orders. Không coi kiểm checkout trống là đã kiểm mọi trạng thái checkout có hàng. Auth email mobile light, CMS desktop light và desktop/mobile admin có ảnh bằng chứng tại `artifacts/auth-cms-20261012/`.

`npm audit --omit=dev`: exit 0, 0 vulnerabilities. Chỉ là kiểm dependency production tại thời điểm chạy.

## Dữ liệu cửa hàng được giữ nguyên

Runtime Owner dùng state cũ `.wrangler/hubby-preview-state` trên loopback 5174. Fingerprint thương mại trước/sau giống nhau:

```text
57df4a909bcb9eaf5987183450d6f0717c642ef86be88af4bfe3c4d7cbc0e009
16 orders / 18 payment observations / 10 tickets
```

Không publish nháp Owner, không thay giá/nội dung đã lưu, không xóa lịch sử, không commit/push/deploy. Các chỉnh sửa palette/ribbon/particles có sẵn trước lượt này được giữ lại. Git không lưu `.wrangler` hay dữ liệu shop; fingerprint không thay thế backup/restore.

Lỗi môi trường được ghi nhận: EACCES loopback và EPERM Wrangler log/typegen trong sandbox; chạy lại local checks được phép ngoài sandbox. EBUSY build do preview giữ file trên Windows; xác minh đúng process Hubby rồi dừng riêng, build lại thành công. Không xóa dữ liệu để làm test qua.

Bài HTTP bổ sung dùng email riêng ban đầu thất bại: lookup đang nhận danh sách projection đã ẩn email. Đã chuyển đối chiếu vào Worker actor-scoped, không mở rộng dữ liệu công khai; chạy lại full check và cả sáu nhóm runtime đều PASS. Đơn QA từ lần thất bại vẫn nằm trong state thử, không xóa/reset. Các đơn lịch sử không có email giữ fallback cũ; retry đơn cũ có fingerprint trước thay đổi có thể trả conflict an toàn, không tự tạo đơn mới để vượt lỗi.

## Chưa nghiệm thu

Google/email login thật, reset email/MFA với provider, hosted Supabase RLS/auth, live payment/webhook/supplier/email, guest lookup khác thiết bị, staging UAT và release. Chưa chạy Lighthouse/Core Web Vitals/load/full WCAG hay thiết bị thật. Khi chưa có provider configuration, nút auth khóa có giải thích; local admin không phải Owner login. Danh mục Owner hiện còn chưa giá, nên không mở checkout thật.

## Owner cần làm

1. Duyệt giao diện mới, nhập giá và nội dung/ảnh được phép dùng qua CMS; xác minh quyền bán, điều kiện gói và bảo hành.
2. Khi sẵn sàng staging: tạo tài khoản dịch vụ, cho phép provisioning rõ ràng; cấu hình Google/Supabase, email và ngân hàng qua env/secret store, không gửi khóa/mật khẩu vào chat.
3. Cung cấp Fanpage nếu muốn nối Facebook; duyệt chính sách, phương thức giao an toàn và email thông báo.
4. Duyệt ngân sách, UAT thật, backup/restore/rollback và phát hành riêng.

## Codex đảm nhiệm

Đã hoàn thành thay đổi/local audit trên. Khi được phép staging: cấu hình adapters, xác minh OAuth/refresh/logout/reset/MFA, RLS/ownership, signature/idempotency/outbox và failure recovery, lookup guest khác thiết bị, performance/accessibility và rehearsal restore; báo bằng chứng thật trước xin mở bán. Không tự vượt các gate đang đóng.
