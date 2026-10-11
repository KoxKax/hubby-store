# Phase 2 — local trước, staging sau

Owner chưa có Supabase và đã chọn local trước. Không cần tài khoản để mở `/admin-demo`. Không resource/cloud deployment nào được tạo. Tài liệu này là checklist tương lai, không phải xác nhận staging đã chạy.

## Owner làm (khi sẵn sàng)

Local continuation now uses server SQLite CMS/commerce, not browser-only CMS. This does not configure Supabase or waive staging tests. See LOCAL_HANDOFF.md for current functionality, limits and remaining Codex work. Real payments/suppliers remain disconnected.

1. Tạo project Supabase **riêng cho staging**, tự giữ tài khoản/mật khẩu và bật MFA cho tài khoản dịch vụ. Kiểm tra chi phí/region/backup hiện hành trước khi mua. Không dùng database production hoặc dữ liệu khách hàng.
2. Cho phép cụ thể việc cấu hình staging trước khi Codex thao tác từ xa. Tự nhập cấu hình vào file local `.dev.vars` bị Git ignore; không gửi passwords, Google client secret, session cookies, email tokens hoặc secret/service-role key vào chat.
3. Chuẩn bị email thử do mình sở hữu, Google OAuth app thử và domain/SMTP khi cần email ngoài giới hạn thử nghiệm. Xác nhận quyền bán, loại gói (đặc biệt Google), giá, điều kiện giao hàng, chính sách và quyền sử dụng ảnh riêng biệt; fixture không phải catalog đã duyệt.
4. Tự đăng ký/xác nhận email Owner, tự nhập mật khẩu và tự enroll TOTP. Không gửi QR/secret/MFA recovery vào chat. Chỉ bootstrap đúng UUID Auth đã xác minh thông qua quyền quản trị database tin cậy, không thông qua email query/metadata do client gửi.

## Codex làm (chỉ khi staging được cho phép)

- Kiểm tra đúng project staging sạch, inventory/payments/suppliers vẫn mock; rà các policies Storage có sẵn để tránh policy rộng ngoài migration.
- Chạy migration `supabase/migrations/202610110001_phase2.sql`, rồi seed `supabase/seed.sql` trong session đã `SET hubby.environment = 'staging';`. Seed từ chối database có revisions; không tự reset/delete database để vượt guard. Không fake Auth users trên dịch vụ thật.
- Sau khi Owner xác minh UUID, bootstrap bằng trusted database session: cập nhật membership đã được signup trigger tạo thành `owner`, `active=true` cho **đúng user_id**. Unique index chỉ cho một active Owner. Không chạy bootstrap từ browser/publishable client, không commit UUID cá nhân.
- Kiểm Auth/CMS/RLS/media theo checklist bên dưới, ghi evidence redacted và lỗi; không tự deploy/push/Phase3.

## Bindings server-side

Mặc định `APP_ENV=local`, `DATA_MODE=fixtures`, cả payments và suppliers là `mock`. Không SDK/Auth request ra ngoài ở mode này. `/admin-demo` chỉ bật ở local fixtures, không trao quyền Owner.

Khi thử isolated Supabase staging qua localhost, `.dev.vars` đặt `APP_ENV=local`, `DATA_MODE=supabase`, `SUPABASE_ENVIRONMENT=staging`, `PAYMENTS_MODE=mock`, `SUPPLIERS_MODE=mock`, `SITE_ORIGIN=http://127.0.0.1:5174`, `SUPABASE_URL=https://<project-ref>.supabase.co`, `SUPABASE_PUBLISHABLE_KEY=sb_publishable_<...>`. Đây là tên/placeholder, không phải cấu hình hiện có. Dùng đúng origin của server; không trộn localhost với 127.0.0.1. Kiểm bindings được nạp trước khi truy cập; nếu build preview không nạp file nguồn, đặt file ignored ở thư mục config preview hoặc dùng dev server và đổi SITE_ORIGIN tương ứng, không sửa bản build generated.

Phase2 chỉ chấp nhận publishable key mới `sb_publishable_`, không nhận legacy anon JWT hay secret/service-role. Không đặt secret ở `VITE_` hoặc client bundle. `APP_ENV=production` + Supabase bị chặn chủ động. Không có account/config hợp lệ → `/admin` đóng (503), không fallback thành admin demo.

## Auth configuration cần nghiệm thu

- Enable email confirmation; đặt Site URL đúng origin và exact allowlisted `/auth/callback` redirect (không wildcard production).
- Google Authorized redirect URI là callback **của Supabase**; app redirect sau Supabase là `/auth/callback` dùng PKCE. Client secret chỉ ở provider dashboard. [Google guide](https://supabase.com/docs/guides/auth/social-login/auth-google).
- Email signup template dẫn đến `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`; recovery dùng cùng route với `type=recovery`. App GET hiển thị trang xác nhận, POST CSRF mới consume token (giảm scanner/prefetch). Không dùng template fragment access-token của browser-only app. [Email templates](https://supabase.com/docs/guides/auth/auth-email-templates).
- Session qua per-request server client, HttpOnly/SameSite cookies; authorize bằng `getUser` và trusted membership RPC, không tin `getSession` hay metadata. SDK refresh cookie chunks/cache headers được chuyển vào response; caching private/no-store. [SSR client](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [advanced SSR](https://supabase.com/docs/guides/auth/server-side/advanced-guide).
- Owner phải TOTP AAL2 cho CMS, chưa MFA → `/xac-thuc`. [MFA guide](https://supabase.com/docs/guides/auth/auth-mfa). Rà rate limits/CAPTCHA/SMTP/domain; local chưa có rate-limit phân tán, strict CSP hoặc operational alerting.

## Checklist staging chưa chạy

- Email signup/confirmation (kể cả email-scanner GET không consume), login sai/đúng, Google callback/PKCE, reset/reuse/expired link, logout, refresh/revoked session; cookies HttpOnly/Secure trên HTTPS, tất cả chunks giữ đủ.
- REST/RPC/Storage trực tiếp: anon không đọc drafts/profiles; customer A/B không đọc/sửa nhau hay roles; Owner AAL1 không CMS/media; Owner AAL2 mới mutate. Thu hồi membership chặn lại. Không dùng service key để giả lập các actor.
- Draft không đổi public SSR; publish atomic đổi catalog+pointer; stale head fail, replay không duplicate; restore tạo revision mới; multi-client concurrent saves/publications kiểm bằng nhiều connections thật.
- Media bucket private: ảnh draft không đọc được bởi anon; published image được proxy; SVG/HTML/oversize/mismatch MIME bị chặn; orphan upload cleanup là thao tác trusted riêng, chưa có delete API cho client.
- Profile update, published product queries, wishlist/recent views RLS qua API; thử browser mobile/keyboard; không secrets/token URL trong evidence/logs. App wishlist hiện vẫn local; synchronization UI là phần còn lại.
- Product tạo/lưu trữ qua UI, banner ảnh marketing và SEO đầy đủ còn cần bổ sung; UI hiện chỉnh sản phẩm có sẵn và thêm/xóa gói, banner chữ/SEO description.
- Backup/restore rehearsal, cache/private draft leakage, rate-limit/CSP, accessibility/performance review trước mở bán. PGlite không thay GoTrue/Storage/REST/OAuth hoặc backup rehearsal.

## Rollback / giới hạn

CMS restore copy thành **nháp mới**, preview rồi publish; không sửa/xóa revision cũ. SQL migration forward-only; trước staging migration phải có backup và kiểm restore, không tự drop/reset để rollback. Private media backup cần manifest riêng. Local sandbox lưu tối đa 30 snapshots trong localStorage, có quota; chỉ ảnh nhỏ ≤250KB, không dùng ảnh/credentials thật. Không phải distributed CMS hoặc authorization mechanism.

Task tiếp theo: “Hoàn tất nghiệm thu Phase2 trên Supabase staging được Owner cho phép, dùng dữ liệu giả, bổ sung phần CMS còn thiếu và chạy checklist Auth/RLS/Storage trực tiếp. Giữ thanh toán/giao hàng mock; không production, không tự Phase3 hoặc push GitHub.”
