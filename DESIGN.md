# Hubby — Design specification

Owner 06/11/2026: bộ mới đúng 3 banner bằng GPT Image theo hai reference công nghệ nền navy, sáng xanh/tím và vật thể/thẻ ứng dụng 3D; thay cả bộ artwork cũ, không chỉ bỏ Huber, không dùng bản vector phẳng đã bị Owner từ chối. Nội dung: giới thiệu shop; Canva Education 3 năm/49.000đ/bảo hành 1 năm; hỗ trợ đơn hàng. Không ưu đãi hoặc cam kết từ ảnh mẫu. Home: intro/banner → sản phẩm → cách mua hàng gọn → FAQ → hỗ trợ. Thẻ sản phẩm thu gọn vừa phải, giảm khoảng trống ở ảnh/mô tả, giữ giá và vùng bấm; chuyển động ngắn khi hiện thẻ/lọc, hover/press/dialog, không thêm vòng lặp nền và tôn trọng reduced-motion. Owner tạm xử lý lời mời Canva thủ công, không bật Telegram.

Owner decision 02/11/2026: keep the existing Hubby storefront design and custom CMS; reject replacement by the separate WordPress theme. Do not redesign or replace the storefront as part of payment/supplier work. WooCommerce migration is cancelled.

Owner implementation22/10/2026: comprehensive customer/CMS UI maintenance authorized with existing-data preservation and scoped automatic deployment. One category control set per viewport, compact intro/cards, truthful unavailable purchase/lookup states, no unconfigured Facebook/English placeholder. CMS home editor now uses existing compatible contract/private media library, product search/category/price filters and explicit editor, top draft-save, notice/banner ordering and immutable restore guard. Readable WooCommerce-inspired workspace retained. No published CMS/schema/Auth/payment settings changed. Evidence and limitations: docs/UI_UX_AUDIT_20261022.md.

Owner revision22/10/2026 supersedes earlier visible carousel-toolbar/reviews clauses: remove previous/next/count/visible pause bar; use one short translucent pill per actual banner at its inside bottom edge, active pill brighter. Maintain44px hit areas, keyboard focus, reduced-motion and hover/focus autoplay pause. A pause/resume button is revealed only for keyboard focus to retain motion control without another visible toolbar. Remove availability checkbox and its URL-driven homepage filtering; keep search/category/sort and all server sale gates. Remove homepage reviews section, not stored reviews/private feedback or CMS content. Catalog now leads directly to FAQ with one divider. No published CMS mutation.

Whole-site quality13/10/2026: official high-resolution product-family imagery replaces favicon defaults; Owner media remains authoritative. Native header search adds bounded in-memory suggestions and multi-term/compact-brand matching. Improve independent browser-list recovery, unavailable-product quantity/contact UX, password visibility controls, dynamic CMS category footer, policy readability and missing-Fanpage routing. Correct mobile grid/aspect-ratio overflow and maintain measured white-text gradient contrast≥4.5:1 for action tokens. See docs/WHOLE_SITE_AUDIT_20261013.md; no new price/rights/fulfillment claims or provider/security-policy change.

Visual campaign13/10/2026: latest Owner direction is exactly three shop-wide Modern Gradient banners (introduction, HUB student campaign, product assortment), tasteful layered glass/3D and concise advertising typography. Confirmed banner code HUBBYxHUBER, amount10%; actual eligibility/redemption remain pending. Owner-uploaded CMS media retains priority; explicit empty slide list hides render defaults. New local official identification images only for exact known product IDs/names. Carousel now has previous/next, pause, count, responsive image sizes and controls outside artwork so no text is obscured. See docs/VISUAL_CAMPAIGN_20261013.md. No catalog reseed, claim of open paid checkout or made-up product entitlement.

Quality revision13/10/2026: preserve established layout/palette/Owner CMS. Add compact catalog sorting/availability/reset controls, friendlier Vietnamese customer states and explicit unavailable lookup before data entry. Default-copy adaptation is exact-match and read-only; do not replace custom Owner text or invent service promises. Evidence and limits recorded in IMPLEMENTATION_PLAN.md.

Admin access decision12/10/2026: Owner confirmed email/password-only access for the intended live shop after risk disclosure. Do not force an Authenticator setup in normal admin navigation. Membership still verified at the server/DB; keep accurate notices for services not enabled, without falsely claiming MFA is enforced. This is the actual site's release preparation, not a separate throwaway demo.

Staging Auth availability12/10/2026: preserve Google-first modal but disable Google when actual provider settings say disabled; explain email fallback. Email fields independently respect provider availability, and send-service failures no longer present a confirmation-success message. Preserve storefront/layout, CMS and all published Owner content. This is truthful readiness handling, not a change to the selected login experience or an accepted live Auth flow.

Latest catalog revision: left category panel with counts, compact3-column product grid desktop/2-column phone; short service-focused intro, no fixed brand list or footer slogan. Reviews and feedback use separate forms; no invented customer testimonials. See docs/CATALOG_V3.md; all older layout notes below are historical when conflicting.

## Current local continuation

Latest revision: previous product-first/no-hero and preserve-layout notes below are historical. Header interpreted from Owner's “footer”: announcement above logo, search, language, order lookup, modal Auth, cart. Intro left/carousel right, then steps → grouped catalog → reviews → FAQ → support. Dark translucent charcoal, mint/peach/lavender typography and subtle CSS star particles; no external images/fonts or fake testimonials. Native dialog supplies modal focus/Escape; controls pause rotating notices/banners, reduced-motion disables autoplay/stars. Local banner slots, announcements, hero and approved reviews configurable in CMS tab Trang chủ. English selector announces not yet available, no partial translation presented as complete.

Historical incomplete-feature lists below are superseded locally: server CMS now adds/hides products, edits variants and supports a small raster banner below the product grid. Added order status/totals, synthetic POST-only reveal, payment simulator, guest orders/library/tickets/recent views and operations tabs. Existing product-first layout and mint/peach/gold/lavender palette retained. Real Auth, staging banner migration and visual polish remain pending.

Browser verified a two-unit order → paid → delivered → reveal → ticket → operator reply/close → customer response. Six routes at360/390/768/1440px:24 combinations without horizontal document overflow, one main each. Proof in artifacts/local-continuation. Not full accessibility, performance or real-device certification.

Ngày: 11/10/2026. Brief chốt: premium Dark Modern Gradient cho thương mại số, tiếng Việt, VND. Phase 1 đã dựng storefront local với dữ liệu mẫu; spec cho chức năng thật ở các phase sau vẫn là mục tiêu, không phải tính năng đã triển khai.

## 1. Ngôn ngữ hình ảnh

Near-black canvas, charcoal panels; tím là màu brand, không phải màu duy nhất. Owner revision11/10: thêm mint, peach, gold, blue/red/green tiết chế theo thương hiệu; chữ/spacing làm chủ đạo. Tránh nền grid dashboard, neon blue glow, badge giả và số liệu xã hội giả. Product art phải phân biệt sản phẩm và có quyền dùng; không dùng screenshot chứa tài khoản thật.

| Token | Giá trị đề xuất | Vai trò |
| --- | --- | --- |
| background | #0B090F | Canvas |
| surface / elevated | #15121B / #211A29 | Cards/dialogs |
| text / muted | #F5EFFB / #B8ADCA | Body/secondary |
| accent | #C4A4F3 | Focus/link |
| CTA gradient | #70409B → #9862C4 | Button, dùng text trắng và kiểm contrast |
| plum | #492337 | Ambient background |
| border | #342A41 | Panel separation |
| success / warning / error | #8FD4AC / #F4C779 / #F39BA9 | Status + text/icon |
| radius | 12 / 18 / 24px | Inputs/card/hero |
| spacing | 4,8,12,16,24,32,48,64,96px | Rhythm |

Font đề xuất Be Vietnam Pro (tự host subset có dấu, kiểm license khi thêm) hoặc system fallback. Heading 48–64px desktop / 32–40px mobile; body 16px, line height >=1,5. Max-width 1200px; gutters 24px desktop, 16px mobile. Không tải font remote/ảnh lớn chỉ để dựng skeleton.

## 2. Sitemap

Public: `/`, `/san-pham`, `/san-pham/:slug`, `/danh-muc/:slug`, `/gio-hang`, `/thanh-toan`, `/thanh-toan/:orderCode`, `/tra-cuu-don`, `/ho-tro`, `/chinh-sach/:slug`.

Auth: `/dang-nhap`, `/dang-ky`, `/quen-mat-khau`, `/auth/callback`.

Customer: `/tai-khoan`, `/tai-khoan/don-hang`, `/tai-khoan/don-hang/:id`, `/tai-khoan/san-pham`, `/tai-khoan/yeu-thich`, `/tai-khoan/da-xem`, `/tai-khoan/tickets/:id`.

Owner: `/admin` và products/variants/inventory/suppliers/orders/payments/tickets/reports/media/cms/settings. Vẫn dark nhưng thao tác bảng dễ đọc; không áp dụng hero trang bán hàng vào màn hình vận hành.

## 3. Layout và customer flows

- Header: wordmark, search, category links, cart count, account. Mobile nav/search dễ chạm, không hamburger nhiều tầng.
- Home (Owner revision): compact heading + search + category chips, sản phẩm ngay trong viewport đầu; không hero giới thiệu/abstract art lớn. Category shortcuts, hướng dẫn và hỗ trợ ở dưới sản phẩm. Compact shop content và featured IDs có typed CMS contract; block giới thiệu chỉ thêm lại khi Owner yêu cầu.
- Card: ảnh 4:3, product name, variant price from (rõ phạm vi), delivery type/availability; một CTA rõ. Không hiển thị tồn supplier chưa xác thực như kho sẵn.
- Product: gallery 2 cột desktop; thông tin/bảo hành, lựa chọn thời hạn/loại, giá đúng selected variant, activation field explanation, add cart/buy now. Mobile CTA sticky không che nội dung/focus.
- Checkout: email bắt buộc, activation fields nếu có, coupon/order summary; guest mặc định được mua. Giá và stock thay đổi thì yêu cầu xác nhận lại, không âm thầm đổi tiền.
- Payment: QR lớn, amount/account/transfer code có copy, expiry và trạng thái. Hướng dẫn same-device mở app ngân hàng theo khả năng provider; không yêu cầu bấm “đã trả” để giao hàng.
- Order: timeline pending → paid → preparing/awaiting input → delivered; partial/error có hướng xử lý. Secret masked, reveal/copy sau kiểm quyền; không nhúng plaintext ẩn trong initial HTML/loader.
- Guest retrieval: gửi link qua email với phản hồi không tiết lộ đơn có tồn tại; token exchange tạo session order-scoped. Email notification dùng link là đề xuất cần Owner chốt (PRD O6).
- Ticket: category/order optional, subject/message, trạng thái; Fanpage link cấu hình. Không gửi credentials vào ticket mặc định.

## 4. CMS contract

CMS lưu dữ liệu có schema version, không thực thi arbitrary JS/HTML/CSS. Block types MVP: hero, featured_products, categories, how_it_works, promo_banner, rich_text (sanitized), support. Cấu hình gồm title/subtitle/CTA/approved internal route or HTTPS URL/media id/alt text/start_at/end_at/sort_order/enabled. Không cho CMS sửa auth/payment/security logic.

Product thông tin, FAQ, activation instructions, SEO metadata và media references lưu DB. Owner draft → preview riêng → publish atomic version → invalidation public cache. Revision rollback tạo revision mới, không sửa lịch sử. Hiển thị lịch Asia/Saigon, lưu UTC. Mỗi media có owner/source/license/alt/dimensions/checksum; dùng AVIF/WebP khi hỗ trợ, upload size/mime allowlist; chưa nhận SVG/HTML tùy ý.

## 5. Trạng thái bắt buộc

Mỗi trang có loading/skeleton, empty, validation, unavailable, retry, success. Checkout thêm price changed/out of stock/expired; payment thêm underpaid/overpaid/late/unmatched/reconciliation; delivery thêm awaiting activation/partial/supplier uncertain; CMS thêm draft/scheduled/published/conflict. Không tạo claims “instant” cho fulfillment manual.

Real recent-order notification chỉ từ projection tối thiểu của đơn thanh toán/giao hợp lệ, product title + thời gian tương đối; không name/email/location/order id/secret, Owner disable được. Không có dữ liệu thì không hiện. Demo đánh dấu rõ dữ liệu mẫu. Wishlist/recent anonymous có thể local storage chỉ product IDs; không lưu credentials/token vào đó.

## 6. Motion, accessibility, responsive

Hover translate <=2px, duration 160–240ms, không shimmer vô hạn; reduced-motion tắt animation. Focus ring lavender rõ; keyboard dialogs giữ focus/escape; aria-live nhẹ cho trạng thái đơn; không dùng màu duy nhất diễn đạt lỗi. Kiểm contrast thực tế CTA gradient trước duyệt, body >=4,5:1. Status toast không che payment/checkout.

Nghiệm thu Phase 1 ở 360/390/768/1440px: không horizontal overflow, không text cắt mất thông tin tiền/variant, tap >=44px, tab order đúng, mock data không đánh lừa là dịch vụ live. Mobile performance budgets: hero <=250KB, card thumb <=80KB, không video nền autoplay. Performance cụ thể theo PRD và measurement environment.

## 7. Owner và Codex

Owner: duyệt visual direction, cung cấp brand/media/Fanpage/policies, quyết định secure-link email và nội dung marketing.

Codex: design components/tokens/responsive states, fixture content, CMS schema/preview/publish, sanitize, accessibility/performance QA. Phase 1 không đòi Owner tạo dịch vụ cloud.

## 8. Phase 1 implementation record

Storefront dùng `app/styles/storefront.css`, components dùng chung và typed content provider. Be Vietnam Pro 400/500/600/700 + italic 400 tự host qua @fontsource/be-vietnam-pro5.3.0, có Vietnamese subset; SIL OFL giữ tại `public/font-license.txt`. Bản đầu dùng torus hero và sản phẩm hư cấu; Owner yêu cầu thay bằng product-first. Bản hiện tại dùng minh họa chữ/CSS Canva mint, CapCut ivory/gold, Google multi-color trên nền sáng, Netflix red; không tải logo/ảnh từ bên thứ ba, không claim đây là official brand artwork.

Hiện có 4 brand examples Owner đề cập với 8 variants giả lập, giá/tồn kho có nhãn demo xuyên suốt. Compact heading/search labels, announcement, featured IDs, category, FAQ, policy và SEO nằm trong fixtures theo contract CMS schemaVersion2 (thay hero bằng shop); Owner editor/draft/publish chưa xây. Wishlist dùng product IDs, cart dùng variant IDs/quantity trong localStorage; form chỉ thử với email example, không lưu/gửi dữ liệu form. Quyền phân phối, SKU và điều kiện gói chưa xác minh.

Preview desktop/mobile và kết quả responsive ở `artifacts/phase-1/`. Kiểm browser 20 tổ hợp viewport/trang không overflow; keyboard/skip link/focus, menu mobile, trạng thái trống/lỗi/loading/hết kho đã thử. CTA gradient đo hai đầu đạt 7.09:1 / 5.28:1 với chữ trắng. Reduced-motion rule đã kiểm source; chưa emulation hoặc audit WCAG toàn bộ. Chưa đo Lighthouse/Core Web Vitals hay thiết bị thật; không coi screenshot là performance proof.

Ảnh revision product-first lưu riêng với prefix `product-first-`; ảnh home cũ là lịch sử, không đại diện giao diện hiện tại. Kết quả palette/viewport revision nằm ở IMPLEMENTATION_PLAN.md.

## Phase 2 administration local slice

Existing product-first storefront retained; visual polish deferred per Owner. Admin uses four focused tabs (content, products/plans, media, history), clear local-only warning, separate save/preview/publish, visible revision and immutable restore-as-new-draft. Content supports heading/accent/SEO description, announcement text/link, footer/Fanpage, section ordering/enabling, coupon and FAQ/policies. Product editor covers existing brand examples, category/delivery descriptions and add/remove variants. Media supports alt text and local small raster previews; staging private library upload is guarded separately.

Auth forms are disabled with explanatory copy when no service configured; no mock account or hidden Owner bypass. Desktop/mobile admin forms tested. Banner images, product create/archive UI, richer SEO, real login and service-backed customer pages are still incomplete; do not treat local sandbox as production CMS. Synthetic prices/stock/brand artwork remain unapproved for selling.

# Storefront revision 2 — 11/10/2026

Latest request supersedes older simulation/chat instructions: image-only banner autoplay every6s, dark default + light theme with SSR cookie persistence, anonymous feedback modal, Facebook-only dock. No invented emails or sales; public cart notifications show actual submitted product/variant actions, never financial proof. Purchase notification integration remains gated on live verified settlement. No-image state is decorative Hubby artwork, not an invented ad. Concise Vietnamese customer copy; no repeated demo/footer labels, checkout still accurately states no real money/delivery. Keep stored Owner content and immutable CMS versions. See docs/STOREFRONT_V2.md for acceptance and limits.

## Login and administration revision — 12/10/2026

Account-based entry: after verified default admin login, go to administration (MFA first when needed). Signed-in Owner gets a management icon beside customer-account access; ordinary customers never get this shortcut. Protected management toolbar includes an Admin disclosure for profile/logout, compact on mobile. Local sandbox toolbar does not impersonate an authenticated admin. Explicit cart/recovery return paths remain preserved. This is WooCommerce-inspired navigation, not installation of WordPress or an authentication bypass.

Header entry is “Đăng nhập” only. Modal initially presents Google sign-in and an email disclosure; email/password appears only after expansion, with sign-up and password recovery inside the same window. Reopening restores the collapsed default. Provider unavailability is explained accurately and cannot authenticate a simulated Owner. The direct login route preserves recovery/redirect handling while using the same Google-first presentation.

Administration uses a WordPress/WooCommerce-inspired workspace, not those packages: compact dark left menu and toolbar, readable light content canvas, searchable product/order tables, selected-row editing, revision/publish side panel, dashboard metrics and mobile menu. Storefront theme remains independent; no global store palette replacement. Queries switch CMS sections without discarding draft; leaving the route with unsaved edits requires a choice. Only saved, unchanged revisions can publish. New product/variant starts unpriced without inherited warranty/media claims. Existing approved content/history remains authoritative. Local admin warnings are security-relevant and remain visible.

Targeted desktop/mobile checks and limitations are recorded in `docs/AUTH_CMS_AUDIT_20261012.md`; no full WCAG or live Auth acceptance claim.


Owner revision 02/11/2026 — light theme: replace the white-on-white presentation with a lavender-gray page canvas, warm tinted cards, distinct lavender navigation and pastel step panels. Strong plum text, saturated selected states and visible input borders. Preserve current layout, dark theme, CMS content and data. Final light-only overrides live in app/styles/light-theme.css.

## Khối sản phẩm — Owner 06/11/2026
Bỏ tiêu đề quảng cáo “Chọn gói bạn cần” và nhãn sản phẩm lặp. Thẻ sản phẩm bắt đầu ngay đầu vùng; sắp xếp và danh mục gộp vào cột trái trên desktop. Điện thoại thu bộ điều khiển thành một nút mở/đóng. Giữ nhãn hỗ trợ tiếp cận và chức năng lọc/sắp xếp; không đưa lại hàng tiêu đề cao tạo khoảng trống.
