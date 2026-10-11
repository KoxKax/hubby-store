# Hubby

Bản local tiếng Việt/VND cho Canva/CapCut/Google/Netflix và catalog do CMS tạo. Bố cục mới: giới thiệu/banner → cách mua → nhóm sản phẩm → reviews → FAQ → hỗ trợ; catalog/hỗ trợ cũ chuyển về home. Chưa mở bán; giá/kho/đơn/giao dịch là giả, không chứng minh quyền phân phối hoặc quan hệ thương hiệu. Xem docs/STOREFRONT_REFRESH.md cho thay đổi và giới hạn.

## Mở và thử

Node24 + npm. `npm ci` nếu chưa cài dependencies, `npm run build`, rồi `npm run preview`. Mở http://127.0.0.1:5174 khi server còn chạy; đây không phải URL Internet. `npm run dev` là server phát triển riêng (thường5173).

- Cửa hàng: chọn gói → checkout → tạo đơn thử → mô phỏng đúng tiền → mở payload DEMO-ONLY.
- `/admin-demo`: CMS phía máy chủ local, nháp/xem trước/áp dụng/khôi phục; thêm/ẩn sản phẩm và gói, ảnh/banner nhỏ, nội dung và SEO description.
- `/admin-demo?tab=home`: chỉnh intro, nhiều thông báo, banner trượt/ảnh, đánh giá được phép công bố; bật/tắt purchase illustration. Không nhập bot token vào CMS.
- `/tra-don-hang`: mã đơn + email local cố định, trong phiên đã đặt hàng. Tra cứu trên máy khác cần dịch vụ xác minh email; không mở secret bằng mã/email đơn thuần.
- Đăng nhập/đăng ký mở modal; local chưa có Auth nên không nhận credentials thật. Góc phải là Facebook trạng thái chưa cấu hình và hộp ticket theo đơn; chưa relay Telegram.
- `/admin-demo/operations`: orders/kho/payment events/tickets/reports/audit/kill-switch demo.
- `/tai-khoan/don-hang`, `/tai-khoan/san-pham`, `/tai-khoan/tickets`, `/tai-khoan/da-xem`: dữ liệu của phiên hiện tại.

Không nhập credentials, inventory, email hay tài khoản khách thật. Các simulator local không phải đăng nhập Owner. Auth thật vẫn đóng khi chưa cấu hình staging; `/admin` thật yêu cầu trusted Owner+MFA.

## Dữ liệu / rebuild

Preview SQLite state ở `.wrangler/hubby-preview-state`, **ngoài build/**. Dừng preview Ctrl+C trước `npm run build` trên Windows để tránh khóa assets. Khởi động lại bằng `npm run preview` không reset ledger/CMS. Không xóa `.wrangler`; không overwrite database để chạy test. Dev và preview dùng state riêng.

Cart/favorites/recent dùng IDs/qty trong browser storage. CMS hiện lưu ở server local, catalog/checkout dùng cùng published snapshot và inventory. Lịch sử CMS browser Phase2 giữ nguyên trong localStorage nhưng không tự ghi đè nội dung server mới.

AES-GCM ở sandbox dùng public fixture key, không bảo vệ dữ liệu thật. Không CSV import thật, email, provider QR, supplier API, queue/cron hoặc cloud namespace nào được bật. State giới hạn phù hợp demo; không thay production Postgres schema/RLS.

## Kiểm tra

```sh
npm run check
# Khi npm run preview đang chạy ở terminal khác:
npm run smoke
npm run smoke:commerce
npm run smoke:cms
```

`smoke` đặt `HUBBY_SMOKE_URL=http://127.0.0.1:5174` khi cần (mặc định script public là5173); các commerce/CMS scripts mặc định5174. Chỉ nhận loopback HTTP. Tests dùng dữ liệu giả và giữ audit/revisions, không reset Owner state. `npm run format` cho lint formatting. CI chưa chạy GitHub vì chưa push.

## Tài liệu hiện hành

- [Local handoff](docs/LOCAL_HANDOFF.md): chức năng, giới hạn, Owner/Codex actions và những gì chưa xong.
- [Staging setup](docs/STAGING_SETUP.md): chuẩn bị tài khoản riêng sau khi Owner cho phép.
- [Implementation plan](IMPLEMENTATION_PLAN.md): roadmap/gates + evidence hiện hành; logs Phase0/1/2 phía dưới là lịch sử.
- [PRD](PRD.md), [Design](DESIGN.md), [Architecture](ARCHITECTURE.md), [Database](DATABASE.md), [Agent agreement](AGENTS.md).

Giao diện giữ dark charcoal + mint/peach/gold/lavender theo phản hồi Owner; Be Vietnam Pro tự host, OFL tại public/font-license.txt. Noindex/private no-store. Không auto deployment/production resources/Git push. Full staging acceptance, payments/suppliers thật và release hardening **chưa hoàn thành**; không coi bản local là web đã sẵn sàng mở bán.

