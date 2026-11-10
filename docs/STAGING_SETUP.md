# Phase 2 — local trước, staging sau

## Cập nhật: Cloudflare đã kết nối (12/10/2026)

Owner đã tự Authorize mã mới; Wrangler login/whoami xác nhận kết nối đúng tài khoản. Không cần đăng nhập hay cấp token lại. Mã/token OAuth không lưu trong repo; thông tin kết nối được mã hóa, khóa nằm ở Windows Credential Manager. Các hướng dẫn đang chờ Authorize phía dưới đã cũ.

Bản mã mới qua169 tests/lint/types/build. Gói hosting riêng đã build, không có binding/migration/kho mã hóa thử nghiệm local; chưa deploy. Kiểm gói/địa chỉ Cloudflare đang bị bước kiểm soát quyền tạm lỗi429, không tự lách. hosting:preflight hiện cố ý báo chưa đủ cấu hình và chưa sẵn sàng production. Còn backend đơn/kho/thanh toán/email và nghiệm thu trước mở bán; không đưa bản local giả lên mạng rồi coi là shop thật.

## Hiện tại: admin đã mở, không cần Authenticator (12/10/2026)

Owner đã xác nhận rõ email/mật khẩu-only cho web dùng thật và chấp nhận rủi ro. Đã áp dụng chính sách vào đúng project hiện có, giữ kiểm quyền Owner/RLS; phiên đăng nhập thật vào [quản trị](http://127.0.0.1:5176/admin) và đọc6 sản phẩm/7 gói thành công. Không cần làm các bước enroll MFA cũ bên dưới. Không tạo/reset mật khẩu hay tắt xác nhận email.149 tests/lint/types/build đã qua trước hai chỉnh sửa câu thông báo admin; các smoke cuối/copy rebuild còn phải chạy lại.

Bạn đã đăng nhập Cloudflare trên trình duyệt. Công cụ triển khai cần bước OAuth riêng: tự bấm Authorize trong trang Wrangler đã mở. Không gửi token/mật khẩu hoặc thông tin thẻ. Đây là kết nối hosting, chưa có URL web công khai/mở bán. Backend đơn/kho/thanh toán/email và nghiệm thu phát hành vẫn chưa hoàn tất.

## Bước hiện tại: bật xác thực hai lớp (12/10/2026)

Bạn đã đăng ký/xác nhận email và xác nhận đúng tài khoản cần làm admin. Codex đã cấp quyền cho đúng Auth UUID qua transaction được kiểm tra, không tạo tài khoản hay mật khẩu khác. Staging có đúng1 Owner/1 audit bootstrap. Phiên đăng nhập thật mở /admin chuyển đến [xác thực hai lớp](http://127.0.0.1:5176/xac-thuc?next=%2Fadmin), chưa cho vào CMS. Không cần đăng ký lại hoặc đăng nhập Dashboard lại. Các ghi nhận0 users bên dưới là lịch sử trước đăng ký.

Owner tự bấm **Thiết lập Authenticator**, thêm khóa trên trang vào ứng dụng Authenticator của mình rồi nhập mã6 chữ số và bấm **Xác minh**. URI dạng otpauth có khóa sau secret= và trước dấu & tiếp theo; nếu nhập thủ công thì chỉ nhập khóa đó, chọn loại theo thời gian. Không gửi URI/khóa/mã/ảnh màn hình chứa khóa vào chat. Codex không thao tác tạo/xác minh MFA thay bạn. Sau khi xong, báo đã vào được quản trị hoặc lỗi không chứa bí mật.

Kiểm tra mới:54 tests SQL/Auth qua,8 anonymous service checks qua, khách vẫn không có quyền admin.0 verified MFA factors tại lúc kiểm tra; CMS/Storage signed-in AAL2 UAT chưa thực hiện. Advisors có WARN [kiểm tra mật khẩu đã rò rỉ chưa bật](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection); tài liệu chính thức xác nhận chức năng này cần Pro trở lên. Giữ Free, rà biện pháp bảo vệ mật khẩu trước phát hành, không tự nâng gói. Hai private RLS-no-policy INFO là deny-all có chủ đích. Không đồng nghĩa web đã sẵn sàng bán hàng thật.

## Bước hiện tại: tài khoản Hubby (12/10/2026)

Lần đăng ký vừa rồi bị lỗi mã: biểu mẫu JavaScript gửi /dang-ky.data nhưng server xử lý nhầm sang đăng nhập. Đã sửa theo URL chuẩn hóa của React Router8, thêm regression tests và kiểm POST thật trên Workers bằng dữ liệu không hợp lệ (không tạo tài khoản/gửi thư). Kiểm tra mới nhất:143 tests + lint/types/build qua; local/staging smoke qua; Auth vẫn0 users/0 confirmed. Tab đăng ký mới16 đã mở, tab cũ giữ nguyên dữ liệu bạn đã nhập. Bạn thử lại bước đăng ký bên dưới; không cần đổi mật khẩu hay đăng nhập lại Dashboard vì lỗi này.

Dashboard đã đăng nhập; không cần làm lại. Owner đã lưu Site URL5176 và hai callback URLs, Codex đã thấy giá trị lưu trong UI. Google chưa kết nối nên web tắt đúng nút Google và chặn POST trực tiếp; email provider đang bật. Signup/recovery báo lỗi gửi thư thật thay vì thành công giả.138 tests + lint/types/build và Workers local/staging smoke qua; không đồng nghĩa Auth tài khoản/MFA đã nghiệm thu.

**Owner cần làm:** ở [đăng ký Hubby thử nghiệm](http://127.0.0.1:5176/dang-ky), tự nhập tên/email của tài khoản Supabase thành viên dự án, tự đặt mật khẩu≥12 ký tự. Mở email xác nhận trong cùng trình duyệt đã đăng ký. Không gửi mật khẩu/link/code/MFA vào chat. Nếu không nhận thư hoặc có lỗi, báo nội dung lỗi không kèm token; không đăng ký liên tục để né rate-limit. Xong xác nhận với Codex tài khoản này là của Owner. Codex chỉ cấp quyền cho đúng UUID có email confirmed được xác minh, không tự chọn user theo thời gian tạo.

Default SMTP hiện chỉ gửi tới thành viên dự án ([tài liệu](https://supabase.com/docs/guides/auth/auth-smtp)); Dashboard ghi rõ cần custom SMTP để sửa subject/body. Hai file supabase/templates/confirmation.html và recovery.html đã chuẩn bị nhưng CHƯA cài lên Supabase. Thử Owner bằng default-template PKCE/same-browser được phép, nhưng email scanner-safe/custom SMTP/khách ngoài team/Google/MFA vẫn là gate. Không tắt xác nhận email, thêm thành viên tùy tiện hoặc tự mua domain/email plan. Khi sẵn, Owner tự cấu hình credential SMTP/domain; Codex kiểm templates/app confirm/redirect và delivery.

**Codex tiếp theo:** xác minh tài khoản Owner đã confirmed → bootstrap trusted membership đúng UUID → hướng dẫn tự enroll TOTP → kiểm /admin+AAL2, CMS/Storage publish/restore/cross-access. Bản local5174 và published content phải được giữ nguyên. Thanh toán/kho/đơn/guest support thật chưa nối; không quảng cáo web đã vận hành hoàn chỉnh hay tự mở bán. Các chỉ dẫn template cấu hình bên dưới là yêu cầu tương lai, không phải đã áp dụng.

## Đang làm — bản thử đã nối nội dung (12/10/2026)

Nội dung đang xuất bản local-14 đã được kiểm schema/hash rồi chuyển một lần sang Supabase staging:6 sản phẩm/7 gói, tất cả chưa đặt giá;0 ảnh,0 review công khai,0 Auth users. Không seed catalog cũ, import kho/đơn/góp ý, hay đổi nội dung local. Migration current_storefront_contract bổ sung điều kiện gói/priceConfigured/experience/banner được quản lý, giữ phân quyền/Owner+AAL2/lịch sử bất biến.

Bản đang dùng [5174](http://127.0.0.1:5174/) giữ nguyên. Bản thử [5176](http://127.0.0.1:5176/) chạy Workers trên máy nhưng đọc catalog từ Supabase. `npm run staging:preview` nạp file ignored .dev.vars.staging và dùng state riêng. Không deploy ra Internet, nhận tiền, tạo tài khoản admin, nâng gói hoặc mất dữ liệu. Import kỹ thuật có audit staging_content_import/author null, không giả mạo Owner; không có publication actor cho tới khi Owner thực sự đăng nhập/xuất bản. Cấm chạy lại bootstrap sau khi staging thay đổi.

Owner cần ngay: mở [Supabase Dashboard](https://supabase.com/dashboard), đăng nhập tài khoản đã tạo project, giữ mật khẩu/mã xác thực riêng. Tab14 đã mở visible và được xác minh là trang Sign in. Đây không phải mật khẩu database. Sau đó báo đã đăng nhập; chưa tự đăng ký web cho tới khi URL/redirect/email-template staging được cấu hình đúng.

Codex tiếp tục: kiểm dashboard, cấu hình origin5176/redirect và email xác nhận an toàn, hướng dẫn Owner tự signup/confirm/TOTP; bootstrap chỉ đúng UUID đã được xác minh với Owner. Chạy Auth/MFA/Storage/RLS signed-in và các backend commerce còn thiếu. Google OAuth/domain/SMTP/ngân hàng cần bước tài khoản/secret do Owner sở hữu, không dán vào chat. Không tắt xác nhận email/MFA để vượt bước này.

Kiểm tra:126 tests/13 files + lint/typecheck/build qua;8 actual anonymous service checks và staging Workers SSR/guards qua. Default5174 smoke qua. Advisors không ERROR/WARN; hai private deny-all INFO giữ nguyên ([giải thích](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)). Chưa nghiệm thu tài khoản thật/Google/MFA/email/Storage upload/full commerce/backup restore/production. Các mục foundation-only bên dưới là lịch sử nếu mâu thuẫn trạng thái này.

## Trạng thái staging thực tế — 12/10/2026

Owner đã tạo hubby-staging trong tổ chức Hubby (Free), Singapore; xác nhận đổi mật khẩu database riêng. Codex không dùng/lưu mật khẩu chat và không cần mật khẩu mới. Project khỏe, PostgreSQL17.11; trước migration không có bảng ứng dụng, Auth users, buckets/objects hoặc lịch sử migration. Đã áp dụng Phase2 foundation và staging_acl_hardening. 13 bảng ứng dụng bật RLS, bucket hubby-media private, chưa có Owner, CMS revisions/products hoặc đơn thật. Không chạy seed.sql cũ (catalog4 brand) hay migration lại catalog local.

Settings trong file ignored .dev.vars.staging, origin dự kiến5176, dùng publishable key; không thay .dev.vars hoặc preview5174. `npm run staging:preflight:cloud`: cấu hình được chấp nhận, payments/suppliers vẫn mock, productionReady=false. `npm run staging:smoke`: opt-in network riêng (không chạy trong npm test), đọc Auth settings và kiểm REST/RPC bằng anon; không signup hoặc seed. Published projection hoạt động nhưng chưa có content; anon không phải Owner, không đọc profiles/nháp, không mutate CMS; Accept-Profile private trả406/PGRST106. Google chưa cấu hình; email provider enabled không chứng minh email đã gửi hoặc có tài khoản admin.

Security advisors sau sửa: không ERROR/WARN, còn2 INFO RLS-no-policy cho private memberships/audit, chủ đích deny-all ([giải thích](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)). Performance: hết missing-FK/initplan WARN;7 INFO unused indexes do database mới, không xóa chỉ mục đảm bảo consistency/FK chỉ để hết thông báo ([giải thích](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index)). Không coi advisors là security certification.

**Owner hiện tại:** không cần tạo lại project, gửi mật khẩu/key, đăng ký tài khoản bằng API hay nâng gói. Khi web thử sẵn, tự đăng ký/xác nhận tài khoản Owner và enroll MFA; sau đó bootstrap đúng UUID đã xác minh. Google OAuth và email/domain cần tài khoản do Owner sở hữu, hướng dẫn riêng lúc cần; không dán secrets vào chat.

**Codex tiếp theo:** migration CMS hiện hành (experience/terms/unpriced/art/sections/media), preview+hash+version import chỉ content đã publish ở local, không import orders/feedback/kho; chạy bản thử riêng5176 rồi nghiệm thu Auth/MFA/RLS/Storage và chuyển đổi CMS. Chưa được bỏ guard hoặc bật commerce/live payment chỉ vì foundation đã tạo. Các checklist cũ bên dưới là lịch sử/kế hoạch, không ghi đè trạng thái này.

## Cập nhật đăng nhập admin — 12/10/2026

Luồng đã nối trong mã nguồn: admin được xác minh → MFA nếu cần → `/admin`; khách → tài khoản khách. Có nút quản trị chỉ cho Owner và menu hồ sơ/đăng xuất trong quản trị. Chưa có tài khoản admin thật hay mật khẩu mặc định; Supabase vẫn chưa được cấu hình. `/admin-demo` là công cụ thử local, không phải đăng nhập admin và không được mở ra Internet. Không cài WordPress/WooCommerce: đây là cách quản lý lấy cảm hứng từ chúng.

Owner cần tạo project staging và tự đăng ký/xác nhận tài khoản, giữ mật khẩu/MFA riêng, rồi cho phép cấu hình. Codex chỉ bootstrap đúng UUID đã xác minh và chạy nghiệm thu khi được cấp phạm vi. Hiện `/admin` mới có CMS/media được bảo vệ; quản trị đơn/kho/thanh toán/hỗ trợ thật chưa nối backend. Không gộp các chức năng mô phỏng local thành tính năng quản trị thật. Kết quả local và giới hạn ghi trong `IMPLEMENTATION_PLAN.md`.

Owner chưa có Supabase và đã chọn local trước. Không cần tài khoản để mở `/admin-demo`. Không resource/cloud deployment nào được tạo. Tài liệu này là checklist tương lai, không phải xác nhận staging đã chạy.

## Owner làm (khi sẵn sàng)

Local continuation now uses server SQLite CMS/commerce, not browser-only CMS. This does not configure Supabase or waive staging tests. See LOCAL_HANDOFF.md for current functionality, limits and remaining Codex work. Real payments/suppliers remain disconnected.

1. Tạo project Supabase **riêng cho staging**, tự giữ tài khoản/mật khẩu và bật MFA cho tài khoản dịch vụ. Kiểm tra chi phí/region/backup hiện hành trước khi mua. Không dùng database production hoặc dữ liệu khách hàng.
2. Cho phép cụ thể việc cấu hình staging trước khi Codex thao tác từ xa. Tự nhập cấu hình vào file local `.dev.vars` bị Git ignore; không gửi passwords, Google client secret, session cookies, email tokens hoặc secret/service-role key vào chat.
3. Chuẩn bị email thử do mình sở hữu, Google OAuth app thử và domain/SMTP khi cần email ngoài giới hạn thử nghiệm. Xác nhận quyền bán, loại gói (đặc biệt Google), giá, điều kiện giao hàng, chính sách và quyền sử dụng ảnh riêng biệt; fixture không phải catalog đã duyệt.
4. Tự đăng ký/xác nhận email Owner, tự nhập mật khẩu và tự enroll TOTP. Không gửi QR/secret/MFA recovery vào chat. Chỉ bootstrap đúng UUID Auth đã xác minh thông qua quyền quản trị database tin cậy, không thông qua email query/metadata do client gửi.

## Codex làm (chỉ khi staging được cho phép)

- Kiểm tra đúng project staging sạch, inventory/payments/suppliers vẫn mock; rà các policies Storage có sẵn để tránh policy rộng ngoài migration.
- Foundation và hai forward migrations đã áp dụng. Không chạy lại seed.sql hoặc bootstrap content lên staging hiện tại. Dữ liệu fixture cũ chỉ dành cho regression offline, không thay thế nội dung Owner.
- Sau khi Owner xác minh UUID/email confirmed, bootstrap bằng trusted database session: cập nhật membership đã được signup trigger tạo thành `role='owner',revoked_at=null` cho **đúng user_id**. Không có cột active. Unique index chỉ cho một active Owner. Không chạy bootstrap từ browser/publishable client, tự chọn user theo thời gian tạo hay commit UUID cá nhân.
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
