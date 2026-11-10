# Hubby — Product Requirements

Current Owner decision 02/11/2026: retain the original storefront/design and CMS on React Router + Cloudflare Workers + Supabase. WordPress/WooCommerce migration is cancelled; hosting budget is 0 VND. Continue payOS and multi-supplier commerce in this stack, initially Bite. Ambiguous provider purchases require manual reconciliation without automatic repurchase. Preserve Owner content/draft/prices and identities. Older conflicting architecture/provider notes are historical. No live activation is inferred.

Payment direction22/10/2026: Owner requests OCB/Casso, has neither OCB nor Casso account. Use OCB personal VA + Casso Flow Webhook V2 as selected integration target, not payOS or direct bank transfer API by assumption. Current work is verification/matching foundation and disabled endpoint; real checkout/QR, durable settlement/outbox and eligible fulfillment still required. Sponsor OCB currently advertised free/1 bank-account+VA/2 integrations; exact quota/duration and bank fees require account-specific verification. No paid upgrade, account opening/consent/OTP or live-money authority inferred. docs/OCB_CASSO_SETUP.md is current setup checklist; SePay work remains historical/preserved.

Owner domain decision12/10/2026: free DigitalPlat hubby.dpdns.org registered/connected, no paid purchase, expiry currently12/10/2027. Owner acknowledged provider terms and personally verified GitHub. Keep workers.dev fallback; free namespace is not sole business/auth recovery identity. Paid commerce gates unchanged. Details docs/CUSTOM_DOMAIN.md.

Latest12/10/2026 supersedes older no-deployment notes: public Hubby runs at https://hubby.kienhoang1919.workers.dev on verified Workers Free, using real Supabase CMS/Auth/support/private feedback. Checkout remains closed. Owner connected TPBank via SePay and specified Canva Edu3 years at49,000 VND. CMS revision2 publishes this price, preserving all other content and six unpriced variants. Actual eligible supply/invitation workflow is still required; synthetic stock is not sellable supply. No paid upgrade or live transfer authorized.

Latest Owner decision12/10/2026: email/password-only admin, including the intended live website, explicitly confirmed after stolen-password risk was explained. Supersedes mandatory Owner MFA requirements, not trusted membership, verified sessions, RLS, CSRF or customer isolation. Owner requests continuing through hosting/use, not another demo. No paid upgrade/purchase authorization inferred; real-payment connection requires separate Owner-owned account/security steps and acceptance. Current site is not yet publicly deployed or open for paid orders.

Auth correction12/10/2026: Owner's failed registration was an enhanced-form routing bug, not verified bad credentials; no account was created. Fixed and checked actual Workers transport plus143 offline tests. Owner still needs to privately register/confirm using the project-team email before exact-identity admin bootstrap and MFA. No repeat Dashboard sign-in, password disclosure or production launch is required for this fix.

Auth setup12/10/2026: Owner's Supabase Dashboard login confirmed, staging Site URL and two redirect URLs manually saved and visually verified. Hubby now uses actual provider availability: Google disabled until configured; email send failures explained without false success. Default Supabase email is team-only, unsuitable for public customers; SMTP/domain + secure custom templates remain release gates. Owner separately self-registers/validates their Hubby account and enrolls MFA. No admin account or real payment has been created by Codex.

Current staging12/10/2026: existing six-product/seven-unpriced-variant public CMS imported from local-14 without historical fixture reseed. Staging storefront now reads Supabase on isolated localhost5176, while normal5174 remains unchanged. No Auth users/admin created, real bank/fulfillment/production not ready. Owner needed next only for private Dashboard sign-in and later their own admin/password/MFA/provider choices; no passwords/keys in chat. Older catalog migration restrictions are superseded only for validated current CMS fields, not real commerce.

Staging update12/10/2026: Owner created isolated hubby-staging in Hubby Free/Singapore and confirmed private database-password rotation. Codex installed foundation tables, restricted CMS RPCs and private media bucket; anonymous REST checks passed. Website is not live: current local CMS catalog has not been imported, real Owner/Auth/MFA/Google and commerce UAT still pending. No prices/rights/warranty invented, no paid upgrade or real payment connection. Normal local preview remains unchanged.

Release request12/10/2026: complete for hosted use, Owner performs necessary account/security/billing steps only, prioritize minimum spend and evaluate Oracle Free. Owner has no cloud accounts, has card for self-verification and uses TPBank. Free-first staging is the implementation path; provider fees/quota eligibility, rights/policies and hosted UAT still unresolved. No paid purchase/upgrade or unattended live launch implied. See docs/LOW_COST_RELEASE.md.

Latest catalog request11/10: six Owner-supplied SKUs/seven variants now specified in docs/CATALOG_V3.md. Prices and several warranty/eligibility details remain open. Compact cards + left category panel and service-focused copy supersede old brand-example content. Reviews are separate private submissions, never fabricated public testimonials; public activity must remain truthful.

Ngày lập: 11/10/2026 (Asia/Saigon). Trạng thái: baseline đề xuất Phase 0; chưa cho phép phát hành production.

## 1. Nguồn yêu cầu và phạm vi

Latest Owner revision11/10: reintroduce intro left/banner carousel right; announcement rotation + logo/search/language/order lookup/modal auth/cart header; steps, category products, reviews, FAQ, support in that order. Remove independent catalog/support pages (legacy redirects retain old links). Add restrained floating stars and mint/peach accents. Purchase popups are explicitly illustrative; no invented reviews. Facebook/Telegram links not supplied; ticket support local only. Email+code form does not authorize disclosure of another session's order; cross-device verification remains pending.

Nguồn chuẩn là brief trong yêu cầu hiện tại và các câu trả lời Owner giai đoạn 4–6 đọc được từ chat “Xây dựng web bán tài khoản”. Công cụ chỉ trả về tham chiếu cho các trả lời của assistant; không có đầy đủ giai đoạn 1–3. Không coi những phần thiếu đó là quyết định đã chốt.

Hubby bán sản phẩm số được phép phân phối cho khách Việt Nam: tài khoản được ủy quyền, license key và gói subscription. Tiếng Việt, VND, dưới 20 sản phẩm ban đầu, một Owner. Subscription MVP là mua/kích hoạt một kỳ; tự động gia hạn/trừ tiền định kỳ chưa được chốt.

Phase 0 chỉ tạo tài liệu, thiết kế dữ liệu, bộ khung, công cụ chất lượng và kiểm tra ban đầu. Không làm toàn bộ website, không kết nối tài khoản thanh toán, không dùng khách hàng/kho thật, không tạo tài nguyên cloud hoặc deploy production.

## 2. Quyết định đã chốt từ Owner

- Dark Modern Gradient: near-black/charcoal, plum/purple/lavender; desktop/mobile cao cấp, nền abstract; tránh neon xanh và dashboard AI đại trà. Owner revision11/10: product-first, không hero giới thiệu lớn ở đầu; thêm mint/peach/gold và màu theo sản phẩm, không chỉ tím.
- Nhóm sản phẩm Owner nêu: Canva, CapCut, Google, Netflix và tương tự. Chưa chốt SKU/loại dịch vụ Google, gói/thời hạn/giá, cách giao và quyền phân phối. Phase1 chỉ minh họa tên thương hiệu với dữ liệu gói/stock/giá giả lập; không claim quan hệ chính thức.
- Email/password và Google; guest checkout và thành viên; thêm giỏ và mua ngay.
- QR ngân hàng Việt Nam; chỉ backend xác nhận tiền; giao từ kho nội bộ hoặc API nhà cung cấp.
- Các kiểu giao: credentials an toàn, license key, subscription activation, nhập thông tin cần kích hoạt.
- Lịch sử đơn, thư viện đã mua, wishlist, xem gần đây, tìm kiếm/category/filter/related.
- Ticket cơ bản và liên kết Facebook Fanpage; coupon/banner/thông báo đơn gần đây có thật.
- Owner quản lý product/variant/kho/supplier/order/payment/ticket/report/media/CMS; import thủ công/CSV/API, logs/alerts; retry/replace/refund/resend/notes.
- CMS sửa banner/ảnh/nội dung/category/section/page/SEO không cần sửa source.
- Managed hosting, mục tiêu dưới 500.000đ/tháng; MFA, backup, logs, rate-limit; staging trước thanh toán thật.

## 3. Giả định thiết kế (có thể đổi)

| ID | Giả định | Hệ quả / mốc xác minh |
| --- | --- | --- |
| A1 | <=50 giao dịch ngân hàng/tháng ở pilot; <=1.000 đơn/tháng khi tăng trưởng | Chỉ dùng để tính chi phí; đo trước release |
| A2 | Kho chủ yếu 1 credential/key cho 1 đơn vị variant | Seat dùng chung cần mô hình riêng, không mặc định hỗ trợ |
| A3 | QR giữ đơn 15 phút; reserve kho 15 phút | Test hết hạn/late payment; Owner chốt Phase 3 |
| A4 | Thông tin kích hoạt là email/ID, không yêu cầu mật khẩu cá nhân | Nếu supplier đòi password, review riêng trước triển khai |
| A5 | MVP ưu tiên kho nội bộ; hỗ trợ adapter supplier nhưng chỉ thêm API khi có hợp đồng/docs | Không quảng cáo supplier API đã hoạt động |
| A6 | Email thông báo + link an toàn; không gửi mật khẩu/key trực tiếp | Khác mong muốn email-delivery trong chat cũ, Owner cần chốt Phase 4 |
| A7 | Reports gồm doanh thu thu tiền, refund, gross margin ước tính, best sellers, tồn kho, ticket | Gross margin chưa gồm thuế/phí nếu chưa khai báo |

## 4. Câu hỏi còn mở và rủi ro

| ID | Cần xác minh | Người quyết định | Trước khi |
| --- | --- | --- | --- |
| O1 | Danh sách SKU, quyền phân phối/điều khoản nhà cung cấp, thời hạn/bảo hành/đổi trả | Owner | Phase 2 nhập catalog thật |
| O2 | Domain, logo, font, Fanpage URL, nội dung brand, email hỗ trợ | Owner | Phase 1–2 |
| O3 | Ngân hàng, tư cách cá nhân/hộ kinh doanh/doanh nghiệp, provider chấp nhận ngành hàng, phí/overage | Owner với provider | Phase 4 adapter thật |
| O4 | Ngân sách là hard cap hay mục tiêu; chấp nhận rủi ro Free tier hay tăng cho Supabase Pro | Owner | Phase 6 release; không chặn UI Phase 1 |
| O5 | Supplier API, sandbox, SLA, idempotency/reconcile/refund | Owner cung cấp docs; Codex đánh giá | Phase 5 |
| O6 | Có gửi secret qua email hay secure link; guest link TTL, quy tắc claim order | Owner; Codex đề xuất secure link | Phase 4 |
| O7 | Chính sách refund/replace khi sản phẩm đã lộ; SLA support/kích hoạt | Owner | Phase 5 |
| O8 | Thông tin pháp nhân, hóa đơn/thuế, thông báo website, quyền riêng tư/lưu dữ liệu | Owner xác minh với đơn vị chuyên môn | Trước mở bán; tài liệu này không kết luận pháp lý |
| O9 | Mức tải thực, RPO/RTO chấp nhận được và nhu cầu PITR | Owner | Phase 6 |

Rủi ro kỹ thuật chính: double-sell do concurrency; webhook giả/trùng/đến muộn; paid nhưng supplier timeout chưa biết kết quả; rò credentials trong HTML/log/email/cache; service-role bypass RLS; Free database pause/quota/không managed backup; email quota/SMTP; chi phí vượt do payment/traffic/backup; CMS XSS/upload độc; region latency; chi phí và quyền lực của Owner duy nhất.

## 5. Yêu cầu chức năng và tiêu chí nghiệm thu

| ID | Chức năng | Nghiệm thu đo được | Phase |
| --- | --- | --- | --- |
| F01 | Catalog/variant/search/filter/related | <20 demo products, slug duy nhất, giá/tồn/hết hàng rõ; tìm từ tiếng Việt | 1–2 |
| F02 | Auth | Signup/login/logout/reset password + Google; email verify; khách không truy cập dữ liệu người khác | 2 |
| F03 | Cart/buy now | Giá/tồn/coupon được tính lại server; double submit một checkout chỉ tạo một order | 3 |
| F04 | Guest | Email-link chứng minh quyền truy cập; biết order code/email đơn thuần không đọc được secret | 3–4 |
| F05 | QR | Không xác nhận từ redirect/screenshot; xác minh chữ ký, account, VND, amount, mã đơn, giao dịch unique | 4 |
| F06 | Delivery | 20 webhook replay chỉ tạo một allocation; 20 checkout tranh 1 stock chỉ 1 reserve; qty 2 nhận 2 đơn vị | 3–5 |
| F07 | Activation | Form schema theo variant, validate server, encrypted info; trạng thái awaiting input/processing/review | 5 |
| F08 | Customer hub | Orders/purchased/wishlist/recent/ticket mobile; secret chỉ reveal sau kiểm tra quyền | 5 |
| F09 | Ticket/Fanpage | Customer chỉ đọc ticket mình; Owner reply; link HTTPS cấu hình CMS | 5 |
| F10 | CMS/media | Owner draft/preview/publish/rollback banner/category/section/page/SEO/ảnh; refresh thấy phiên bản mới | 2 |
| F11 | Inventory/suppliers | CSV preview/validate/dedupe trước commit; encrypted stock, audit, low stock; mock adapter contract | 3–5 |
| F12 | Order operations | Retry idempotent, resend cùng delivery, replacement có lineage, refund đối soát; audit ai/lúc nào/lý do | 5 |
| F13 | Marketing | Coupon expiry/quota áp dụng atomic; recent order anonymized chỉ đơn thật eligible; không tự tạo đơn giả | 3/5 |
| F14 | Reports | Báo cáo đối chiếu payment/refund ledger với fixtures biết trước; VND integer, Asia/Saigon | 5 |

## 6. Phi chức năng

- WCAG 2.2 AA mục tiêu: keyboard/focus/contrast, labels/error/status; reduced motion; touch >=44px. Secret reveal không ghi vào analytics.
- Mục tiêu pilot: p75 LCP <=2,5s, INP <=200ms, CLS <=0,1 trên máy/mobile test ghi cấu hình; Lighthouse mobile >=90 performance/accessibility cho catalog fixture. Đây là mục tiêu, chưa đo Phase 0.
- MFA TOTP Owner, server kiểm role + AAL2; secrets server-only; encryption AES-256-GCM versioned; mọi reveal/audit không chứa plaintext.
- Phục hồi đề xuất RPO <=24h / RTO <=4h cho pilot; alert đối soát >=5 phút; kiểm tra restore trước release. Chưa là SLA thương mại.
- Không cache trang cá nhân/secret. HTTPS production, CSP, CSRF/origin check, schema validation, request/body limits, rate-limit nhiều lớp.

## 7. Owner actions (tách riêng)

1. Chốt O1–O9 đúng mốc; cung cấp catalog được phép bán, media có quyền, nội dung và chính sách.
2. Sau khi cần staging: tự sở hữu tài khoản Cloudflare, Supabase, Google OAuth, email/domain; bật MFA và lưu recovery; không gửi khóa bí mật vào chat/git.
3. Sau test mô phỏng: chọn provider/ngân hàng và hoàn tất KYC; xác nhận ngân sách và phí; chưa làm trong Phase 0.
4. Duyệt design trên mobile/desktop, chính sách giao hàng/refund, test UAT và quyết định release production riêng.

## 8. Codex responsibilities (tách riêng)

Kiểm chứng docs/cost; xây UI/CMS/schema/migrations/RLS/auth/domain/adapters; tạo fixtures giả, test concurrency/webhook/security; cấu hình staging khi được yêu cầu; hướng dẫn Owner đặt secrets; runbook backup/restore/reconciliation; báo kết quả thật và giới hạn, chuẩn bị release review. Không thay Owner ký hợp đồng/KYC/chốt quyền bán hoặc tự phát hành production.

## 9. Ngoài MVP

Marketplace đa seller, wallet/nạp tiền, affiliate, nhiều admin role UI, recurring debit, app native, referral/rewards, chat realtime, supplier tự động failover không đối soát, machine learning. Advanced admin đầy đủ được chia phase; không coi Phase 1 storefront là MVP vận hành xong.
# Latest storefront changes — 11/10/2026

Owner requested image-count autoplay banners, default dark + persistent light option, feedback, Facebook-only dock and concise natural copy without demo labels. Deliver locally. Public activity must be truthful and anonymous: actual cart telemetry now; live purchases only after verified committed bank settlement, never mock transactions or invented Gmail addresses. Feedback is not an order-support ticket, not automatically a public review. Existing release/auth/payment/data gates unchanged. See docs/STOREFRONT_V2.md.

## Latest authentication/admin decision — 12/10/2026

Owner clarified that management must be entered through an admin account. Verified Owner default sign-in opens administration, requiring MFA before access; customers stay in customer space. Administrative account menu offers profile and POST logout. Admin entry is not just a visual link: trusted membership and AAL2 are required server-side. No current admin credentials exist because Supabase is unconfigured; no local simulation can substitute for authentication. CMS/media is the existing secured slice; live inventory/order/payment/support management remains unimplemented and must not be advertised as complete.

Single header “Đăng nhập”; Google-first modal; email/password, sign-up and recovery revealed through the email disclosure rather than separate navigation. Registered customers still receive account/history access. WordPress/WooCommerce-inspired CMS navigation and tables are a UI preference, not an architecture/framework migration. Complete and verify available local workflows; real provider/staging acceptance stays separately gated. See `docs/AUTH_CMS_AUDIT_20261012.md` for tested scope and Owner/Codex responsibilities.

