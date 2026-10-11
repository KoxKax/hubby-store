# Hubby — bản local và việc còn lại

Latest storefront v2: see docs/STOREFRONT_V2.md. Image-driven autoplay/multi-upload, persistent dark/light, anonymous feedback + local review, Facebook-only dock, natural copy, actual cart telemetry and no invented sales/emails. CMS → Trang chủ for banners; operations → Góp ý for feedback. Payment/Auth/supplier/trusted Owner access still unconfigured. Purchase announcements need later verified bank settlement/outbox; test contract is not live functionality. Earlier illustrative/chat/footer notes are superseded. State preserved outside build; no resets/deployment.

Ngày 11/10/2026, Asia/Saigon. Owner đã yêu cầu tiếp tục tất cả phần local, chưa có Supabase. Đây là bản thử nghiệp vụ với dữ liệu giả, không phải web đang mở bán hoặc bằng chứng mọi phase production đã hoàn thành.

## Có thể thử ngay

Revision storefront mới: xem STOREFRONT_REFRESH.md. Home có giới thiệu/carousel/steps/category/reviews/FAQ/support, header search/lookup/modal, CSS stars và dock. CMS tab Trang chủ chỉnh notices/slides/intro/reviews. Catalog/support độc lập đã chuyển hướng tới home. Các mô tả product-first/banner-sau-grid dưới đây là lịch sử trước revision; không có fake reviews. Email/code lookup chỉ current session, chat lưu ticket nội bộ; Owner chưa có link Facebook/Telegram. English chưa triển khai. Cảnh báo local đã làm gọn, không biến dữ liệu giả thành cửa hàng thật.

- Storefront product-first, tìm kiếm/lọc/gói/giỏ/coupon/buy now, yêu thích và xem gần đây. Catalog public SSR lấy CMS đã áp dụng và tồn kho local hiện có.
- `/admin-demo`: CMS phía máy chủ local, chỉnh banner chữ/ảnh raster nhỏ, nội dung/FAQ/chính sách/SEO description, sản phẩm hiện có, thêm/ẩn sản phẩm và thêm/bỏ gói. Nháp không đổi public; áp dụng chỉ nháp mới nhất; conflict khi phiên khác đã sửa; khôi phục tạo nháp mới. Đây là simulator công khai trên loopback, **không phải quyền Owner**.
- `/thanh-toan`: server tính giá đã xuất bản, giữ đủ số lượng kho 15 phút hoặc từ chối toàn bộ; idempotency cho đặt trùng. Không nhận email/activation thật, không tạo QR.
- `/don-hang/:id`: đúng phiên guest mới xem đơn; mô phỏng đúng/thiếu/dư/sai tài khoản/hoãn giao; retry job, mở payload DEMO-ONLY bằng POST, thay thế kho mới có lịch sử, resend không cấp kho mới, refund mẫu và chặn reveal sau refund.
- `/tai-khoan/don-hang`, `/tai-khoan/san-pham`, `/tai-khoan/tickets`, `/tai-khoan/da-xem`: lịch sử/thư viện/hỗ trợ/xem gần đây; không giả vờ đăng nhập. Guest cookie HttpOnly/SameSite 24h, hash trong server, không đọc đơn chỉ bằng code/email.
- `/admin-demo/operations`: tổng quan/thu ròng/refund/tồn kho/jobs/đơn/payment observations/tickets/audit, trả lời/đóng ticket, sinh kho giả và bật/tắt checkout. Mọi phiên ở máy này dùng chung store demo; không dùng nó cho dữ liệu riêng tư.
- Auth email/Google/reset/Owner MFA và CMS Supabase handlers vẫn đã viết, nhưng mặc định đóng khi chưa có dịch vụ. `/admin` không bị thay bằng simulator.

## Lưu dữ liệu và giới hạn

Server sandbox là SQLite-backed Durable Object **Wrangler local**, không namespace cloud. Preview lưu vào đường dẫn tuyệt đối `.wrangler/hubby-preview-state` do scripts/preview.mjs thiết lập, nằm ngoài `build/`. Dev server dùng state riêng; không mặc định xem dữ liệu dev và preview là cùng một store. Không tự xóa `.wrangler`, reset database hoặc dùng lại state production.

Đã phát hiện preview cũ lưu state trong build và build lại làm mất các đơn thử đầu tiên. Đã sửa preview, copy nguyên state đang có sau khi dừng server vào thư mục mới (không ghi đè target có sẵn), giữ bản nguồn; checksum ledger trước/sau copy trùng. Kiểm rebuild/restart mới được ghi trong implementation plan. Các mã đơn thử của bản cũ đã mất không được coi là bằng chứng dữ liệu hiện tại. Không có đơn/khách hàng/kho thật bị ảnh hưởng.

Inventory chỉ sinh payload DEMO-ONLY, không nhận passwords/license CSV thật. AES-GCM có nonce ngẫu nhiên và AAD unit+variant, nhưng key ở Wrangler vars là **fixture public**, hoàn toàn không bảo mật dữ liệu thật. Đây là kiểm thuật toán/flow, không key-management production. Không dùng public fixture key cho staging/production.

Ledger dùng transactionSync để cập nhật atomic một snapshot có giới hạn:500 orders,1000 stock,2000 payments,30 CMS revisions,40 messages/ticket. Không phải normalized production commerce schema; Postgres tables/RPC/RLS/multi-connection tests cho commerce vẫn cần triển khai. Local rate limit tối giản không thay edge/Auth/DB distributed abuse protection. Jobs retry thủ công/on-request; không có Queue/cron/email tự chạy hoặc cam kết uptime.

Schema optional banner image đang chỉ cho local: validateContent chặn xuất bản lên Supabase khi có field này, cho đến migration/template/media mapping staging riêng. Wishlist/recent anonymous lưu IDs trong trình duyệt; chưa sync với Auth. Lịch sử browser CMS Phase2 vẫn giữ trong localStorage nhưng không tự ghi đè CMS server; muốn chuyển chỉnh sửa cũ thì cần import có preview riêng.

## Kiểm tra

`npm run check`: lint/types/tests/build. `npm run preview` rồi `npm run smoke`, `npm run smoke:commerce`, `npm run smoke:cms`.

Commerce smoke thực hiện20 requests concurrent /1stock, replay checkout, cross-session404, trước-paid reveal403, sai payment,20 replay/1job, deferred retry, redacted GET, reveal đúng phiên, ticket/reply, resend/no extra stock và refund. Dữ liệu test được giữ để audit, không xóa lịch sử Owner. CMS smoke cần catalog <19 sản phẩm và history còn chỗ, không tự reset để vượt giới hạn; test restore nội dung public ban đầu bằng revision mới.

Mock supplier adapter chỉ là contract test: timeout-after-accept→lookup stable key không mua lại, snapshot phục vụ test restart; không kết nối supplier trong UI hay bảo đảm external API idempotency. Mock payment HMAC test không chứng minh SePay/payOS webhook thật, canonicalization/provider eligibility hoặc tài khoản ngân hàng.

## Owner làm riêng

Hiện tại: xem bản local, thử một đơn và ticket, góp ý nội dung/giao diện; chưa cần tài khoản dịch vụ. Không nhập dữ liệu thật. Chốt SKU (đặc biệt Google), quyền bán, media/brand/Fanpage, giá/chính sách giao/refund khi chuẩn bị mở bán.

Khi sẵn sàng: tự sở hữu isolated Supabase/Cloudflare/Google/email staging, MFA/recovery; tự nhập secrets ngoài chat/Git và cho phép scope cấu hình staging rõ ràng. Chọn ngân hàng/provider/supplier hợp lệ, ngân sách và chính sách retention/privacy/guest email proof. Không yêu cầu Owner gửi secrets qua chat. Duyệt production riêng sau nghiệm thu, không coi “làm đến hết” là go-live.

## Codex làm riêng / chưa xong

Hoàn thiện phần còn lại trên staging được cho phép: normalized Postgres commerce migration/RLS/atomic reservation-coupon-outbox/refund; key provisioning/HMAC fingerprint/CSV preview+dedupe; verified email guest-token POST exchange; thật Auth/reset/Google/MFA/refresh/Storage; webhook adapter chính thức; supplier lookup/leases/reconcile/uncertainty/partial activation; notification queue/cron; private operations với trusted Owner+AAL2; synced customer pages và banner/media migration.

Hardening trước release: CSP/rate-limit/captcha, secret log redaction/alerts, backup+media+key restore drill, concurrency/load/performance/Lighthouse/real-device WCAG audit, expense/kill-switch/recovery runbooks và Owner UAT. Chưa đạt Phase6/7, không deploy hoặc push GitHub tự động.

Task tiếp theo: “Chuẩn bị và nghiệm thu Supabase staging theo docs/STAGING_SETUP.md và danh sách còn lại này, giữ mọi thanh toán/supplier mock cho đến scope riêng. Không provision/deploy production, nhập kho thật hoặc tự push GitHub.”
