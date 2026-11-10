# Hubby — lộ trình tiết kiệm để mở bán

Mới nhất12/10/2026 thay ghi chú cũ “chưa có URL”: web đã lên https://hubby.kienhoang1919.workers.dev, Cloudflare Free đã xác nhận, bản cập nhật `c2f44d4e-a769-45e1-a4de-b73f8764f854`. Canva49.000đ đã xuất bản; sáu gói khác chưa niêm yết. TPBank đã nối SePay Free; chưa bật webhook/nhận tiền thật.190 tests qua. Các gate thanh toán/giao hàng/email/restore/CPU còn lại ở IMPLEMENTATION_PLAN.md và SEPAY_SETUP.md. Không nâng gói; SePay có phí vượt50 giao dịch nên không cam kết luôn0đ.

Trạng thái mới nhất12/10/2026: Cloudflare đã kết nối qua Owner tự Authorize; không cần tạo tài khoản/đăng nhập lại.169 tests và gói build hosting riêng đã qua. Chưa có triển khai hay URL Internet. Kiểm gói/địa chỉ thực tế bị công cụ kiểm soát quyền tạm lỗi429, chưa xác nhận Workers Free của tài khoản. Không nâng gói, tạo resource, upload hoặc mua domain. Backend thương mại/nhận tiền thật/email khách/khôi phục/CPU hosted vẫn chưa hoàn tất; các ghi chú đang chờ OAuth bên dưới là lịch sử.

Trạng thái mới12/10/2026: catalog hiện hành đã nối Supabase; Owner đã xác nhận tài khoản và quyền admin, chọn email/mật khẩu-only kể cả dùng thật. Bản149-test đọc CMS bằng phiên Owner thật không còn ép MFA; đây là chính web đang chuẩn bị phát hành. Cloudflare đã đăng nhập Dashboard, đang chờ Owner tự Authorize Wrangler để nối công cụ triển khai. Không yêu cầu tạo lại Supabase/enroll MFA. Chưa có web công khai, backend commerce/payment/email/restore/hosted CPU/UAT chưa xong; không coi kết nối hosting là hoàn tất shop. Các ghi chú tài khoản/MFA/content chưa có phía dưới là lịch sử khi mâu thuẫn mục này. Không tự mua/nâng gói; tiếp tục Free-first có đo hạn mức.

Ngày kiểm tra: 12/10/2026. Owner yêu cầu hoàn thiện và đưa web lên sử dụng, ưu tiên ít chi phí nhất; có thẻ xác minh, ngân hàng TPBank. Không có quyền tự mua domain, nâng gói hoặc chấp nhận phí vượt hạn mức. Supabase đã kết nối; Owner đã tạo hubby-staging trong Hubby Free/tier_free, Singapore, xác nhận đổi mật khẩu riêng. Codex đã cài foundation schema và hardening, chuẩn bị config publishable riêng, kiểm anon REST; chưa seed/import catalog, tạo Auth users hay deploy website. Xem STAGING_SETUP.md.

## Hướng triển khai trước mắt

Giữ React Router/Workers + Supabase; dùng Supabase Free cho bản staging. Thử Workers Free và đo CPU trước khi quyết định hosting mở bán. Ưu tiên Resend Free cho email, SePay Free nếu TPBank và ngành hàng đủ điều kiện. Không mua Supabase Pro ở bước này. Đây là phương án thử tiết kiệm, không xác nhận production đủ an toàn/miễn phí.

Oracle là phương án dự phòng cần kiểm chứng, không tự chuyển kiến trúc. Backend hiện chỉ chấp nhận Supabase managed hoặc loopback local; URL self-host public bị chặn. App phụ thuộc Workers runtime/bindings; không copy nguyên bản local lên VPS và xem là web vận hành. Cần spike ARM/runtime/Auth/MFA/RLS/Storage/restore và cấu hình endpoint tin cậy trước bất kỳ chuyển đổi nào. Không tự xây password auth để né chi phí.

## Chi phí và giới hạn đã kiểm chứng

| Hạng mục | Phương án thử tiết kiệm | Giới hạn / quyết định trước mở bán |
| --- | --- | --- |
| Workers Free | 0đ trong hạn mức | 100.000 requests/ngày, 10ms CPU/request; SSR/Auth có thể không đủ. Chưa đo CPU hosted. Không dùng HTTP wall time làm CPU proof. Nếu không đạt: trình phương án tối ưu/hosting khác hoặc xin duyệt Paid $5/tháng, không tự nâng. |
| Supabase Free | 0đ trong hạn mức | 500MB DB/1GB media, pause khi ít hoạt động, không automatic backup. Pilot live chỉ sau Owner chấp nhận rủi ro và kiểm export+restore+media/key recovery. |
| Resend Free | 0đ trong hạn mức | 3.000 emails/tháng, tối đa100/ngày; tính cả Auth/reset/receipt. Cần domain gửi được xác minh trước gửi cho khách. |
| SePay Free | 50 giao dịch/tháng | TPBank nằm trong danh sách hỗ trợ, không chứng minh tài khoản/nguồn hàng của Owner đã được chấp nhận. Cho phép vượt và tính phí; phải xác nhận cách tính, hạn mức/cảnh báo và phí trước kết nối tiền thật. Không cam kết luôn0đ hoặc50 giao dịch=50 đơn. |
| Domain | Chưa mua | .com thông thường Cloudflare $10,46/năm, khoảng282k với giả định27k/USD; premium/thuế/tỷ giá/khả dụng kiểm lúc mua. Có thể thử hosting bằng địa chỉ provider khi cấu hình hợp lệ; email thương hiệu/live cần domain phù hợp. |
| Oracle Always Free | Compute0đ nếu đúng quota/có capacity | Tài liệu hiện tại:1.500 OCPU-hours/9.000 GB-hours/tháng, tương đương2 OCPU/12GB cho Always Free tenancy. Home region có thể hết capacity; máy idle có thể bị thu hồi. Không SLA. Cần thẻ hợp lệ để xác minh, có thể authorization hold; Owner tự nhập và chấp nhận điều khoản. Không nâng Pay As You Go, dùng tài nguyên trial hết hạn hoặc tạo tải giả để tránh idle reclaim. |

Tổng phí thuê dịch vụ có thể0đ cho bản thử trong hạn mức, chưa tính domain. Với web SSR hiện tại không thể hứa production0đ: nếu cần Workers Paid thì base thêm135k/tháng theo giả định27k/USD, chưa phí giao dịch/vượt quota/backup/thuế. Backup, giám sát, bảo trì, công phát triển và nguồn hàng không tự nhiên miễn phí chỉ vì VPS0đ. Oracle chưa được provision hoặc benchmark; Free tiers không thay release gate.

## Owner: chỉ làm lúc cần

**Bước tạo project đã xong:** không cần tạo lại tài khoản/project hay kết nối plugin. Giữ mật khẩu mới riêng; không gửi vào chat. Không nâng cấp nếu chưa duyệt phí. Khi connector hỗ trợ giới hạn quyền, chỉ cấp cho staging; không mặc định mở mọi project. Codex đang xử lý phần CMS trước khi cần Owner tự đăng ký tài khoản quản trị/MFA.

Lý do cần Owner thực hiện bước này: công cụ `get_cost` trả lỗi `UNAVAILABLE` / không được server cung cấp; `confirm_cost` bắt buộc có kết quả từ `get_cost`, và `create_project` bắt buộc có mã xác nhận hợp lệ. Không tự đoán giá hoặc tạo mã để lách chuỗi xác nhận. Browser Dashboard chuyển về trang đăng nhập: chưa đăng nhập trong trình duyệt dù connector đã kết nối. Không tự thao tác đăng nhập hoặc đặt mật khẩu. Plan Free được xác minh qua API tổ chức, không phải bằng chứng project đã tồn tại hoặc mọi tác vụ đều miễn phí.

Sau khi project sẵn: báo tên project/đã kết nối; Codex xác minh đúng project, không chạy migration vào project khác. Owner tự đăng ký/xác nhận tài khoản admin và enroll MFA; Codex bootstrap chỉ đúng UUID đã xác minh bằng session tin cậy. Không mặc định nâng account theo email hoặc metadata.

Các bước sau mới cần: tạo Cloudflare Free để thử hosted; chọn/mua domain sau khi báo giá được duyệt; tạo Google OAuth/email và SePay theo hướng dẫn; Owner tự xác minh TPBank/KYC/OTP và điều khoản provider. Không gửi ngân hàng/login secrets cho agent. Chốt giá/nguồn hàng/điều kiện bảo hành, duyệt UAT và thao tác mở bán cuối.

## Codex: các phần phải làm

1. Kiểm đúng project và quyền, giữ payments/suppliers mock, chạy migration staging có backup/rollback plan. Không rerun catalog migration hoặc ghi đè CMS Owner.
2. Hoàn tất schema/CMS hiện hành: category, terms, chưa niêm yết giá, banner/media/experience; import content có preview/version/hash, không mang demo orders hoặc public fixture key sang cloud.
3. Nghiệm thu Auth email/Google/logout/reset/MFA + RLS/Storage thật, mọi thao tác admin yêu cầu Owner+AAL2. Local mocks/PGlite không chứng minh hosted Auth đã hoạt động.
4. Implement normalized orders/stock/coupons/payment/outbox/guest email proofs và admin ops. Kiểm20 người/1stock,20 payment replay/1delivery, expiry/crash/refund/replacement/restore.
5. Xác minh TPBank+provider, xây webhook/đối soát, giao kho mã hóa/manual activation phù hợp và email link an toàn. Chưa nhận tiền thật trước bộ kiểm staging và scope provider được xác nhận.
6. Hardening/rate limits/CSP, quota alerts, backup DB+media+key tách riêng, restore drill; CPU/mobile/load và phí thực tế. Tắt checkout mới khi có lỗi/quota, không bỏ webhook/đối soát các đơn đã nhận tiền.
7. Chỉ đưa lên tên miền/bật thanh toán sau báo cáo go/no-go, giải quyết blockers và Owner xác nhận mở bán. Không đưa /admin-demo, simulator, test users, lịch sử đơn giả hoặc secret lên Internet.

## Kiểm tra chuẩn bị

`npm run staging:preflight` đọc config mặc định, file ignored `.dev.vars` nếu có và các bindings môi trường allowlisted. Không liên hệ provider, không tạo resource, không deploy, không in giá trị khóa/URL. Exit2 nghĩa cấu hình staging chưa được chấp nhận; exit0 chỉ kiểm hình dạng/config guard, không chứng minh project tồn tại, đúng tier, Auth/RLS/backup hoạt động hoặc production-ready. Config local vẫn fixtures và production guard không bị tháo. Tool này không chặn lệnh Wrangler deploy trực tiếp; checklist/production review vẫn bắt buộc.

## Nguồn chính thức (kiểm tra12/10/2026)

- [Oracle Always Free](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm), [Oracle FAQ/card/SLA](https://www.oracle.com/cloud/free/faq/).
- [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/).
- [Supabase pricing](https://supabase.com/pricing), [Supabase self-host Docker](https://supabase.com/docs/guides/self-hosting/docker).
- [Resend pricing](https://resend.com/pricing), [SePay pricing/banks](https://sepay.vn/bang-gia.html), [Cloudflare domain prices](https://pricing.registrar.cloudflare.com/).
