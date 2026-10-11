# Hubby storefront v2 — 11/10/2026

Latest Owner changes supersede docs/STOREFRONT_REFRESH.md where they conflict. All work is local; no cloud provisioning, deploy, real payment/Auth/supplier or external messaging.

## Delivered behavior

- Hero is an image slideshow: images fill a3:2 frame, autoplay6s, count equals uploaded images. Empty slots never appear; no photos yields decorative shop branding only. One uploaded legacy announcement image remains a fallback if no new slide images exist. Hover/keyboard focus, pause and reduced motion respected; background tabs do not advance. Controls44px, no link overlay over controls.
- CMS → Trang chủ → Thêm nhiều ảnh banner, or each slide's image input.0..12 records,180KB/new image, JPEG/PNG/WebP/AVIF checked by magic bytes+MIME; no SVG/external scripts.1.2m total inline image characters across snapshot,4MB form cap. Existing250KB legacy image input is a fallback, not an extra slideshow item. Save draft then apply. Titles/descriptions stay in the backwards-compatible schema; image art is not covered by generated captions.
- Header sun/moon selects dark/light. Dark default independent of OS. Allowlisted persistent HttpOnly/Lax cookie renders SSR theme before paint; CSRF+Origin-guarded POST. Theme affects customer/Admin/dialog/form views. No secret in preference cookie.
- Feedback modal from reviews/support/footer: category +10..1500 trimmed characters, no required name/email/order. UUID retry dedupe,10 submissions/session/day,1000 total retained entries. Local operations Góp ý tab shows category/time/new or reviewed; review action audited. Content React-escaped, not published as a testimonial.
- Facebook-only dock; no chat UI or Telegram relay. Missing Fanpage state accurate. Existing order support ticket route remains, not a live chat service.
- Concise customer copy, exact legacy fixture strings adapted without modifying history/custom Owner prose. Homepage/card/footer no repeated demo labels. Auth remains disabled/unconfigured; checkout/order safety still states synthetic/no-transfer behavior. Unapproved SKU rights, prices, policies and fulfillment claims cannot become true by copy changes.

## Activity: truthful, anonymous, bounded

Actual cart submissions (product/variant checked against published catalog+available stock) can create cart telemetry. Public projection: event id, kind, product, variant, `Một khách`, timestamp. No emails, suffixes, actor identifiers, order codes or location. One event/session/minute; idempotency key prevents retry duplication, cap200 and15-minute ephemeral retention; last10 eligible events read. User can disable popups; CMS toggle stops collection/display. Optional polling15s skips hidden tabs and overlapping requests; no fake timers generate transactions. Telemetry is user-submitted cart intent, not verified shopping identity/payment; anti-abuse stronger than local-session limits requires staging edge protections.

Local bank simulation never emits purchases. Browser-created purchase command rejected. `purchaseActivity` is a tested eligibility contract requiring live+verified+committed+not-refunded proof, **not a completed live integration**. Future bank settlement transaction/outbox must enqueue a stable server-only event, enforce publication consent policy, dedupe/exclude refunds and share this public projection. No real adapter/account connected now.

Feedback/operations use the existing loopback local simulator, not trusted Owner Auth. Staging needs normalized private feedback tables/RLS, Owner AAL2, rate limits/retention review, and activity publication policy before online use. Do not put real credentials/contact information in local feedback.

## Owner actions (separate)

1. Add approved banner/product images in CMS, edit alt/link, save/apply; review both themes.
2. Confirm exact SKU/duration/delivery rights/pricing and approved business policies before taking orders.
3. Provide Fanpage when available. Later prepare/authorize isolated staging Auth/DB and bank provider configuration outside chat.

## Codex responsibilities (separate)

Implement and validate local UI, persistence, CSRF, dedupe/privacy/limits; retain existing data; document tests and pending release work. Later implement verified live settlement/outbox announcements and private staging feedback after separate authorization; never turn mocks into live sales notifications.

## Verification

Final browser follow-up: own cart toast visible/social popup absent, then social popup visible/cart toast absent; no overlapping notices. Light mobile feedback form inspected. Auth Escape close and Facebook missing-link dialog verified; no chat. Returned home to dark, reset viewport override, retained existing preview tab. Inspected warn/error log empty. Screenshot artifacts are JPEG bytes (new files use .jpg); earlier screenshot .png extensions did not imply PNG encoding.

Final:106 linted files, generated types/TypeScript,76 tests in9 suites, Workers client275/SSR316-module build passed.32 responsive combinations (4 pages ×4 widths ×2 themes) all one main/no horizontal overflow/no chat/no broken images after correcting support flex sizing and compact mobile header. Light/dark desktop and390px screenshots inspected; no full WCAG/Lighthouse/device certification claimed. New feedback persisted/reviewed; actual UI add-to-cart produces detailed anonymous popup. Public activity defers while the own-cart toast is shown, avoiding mobile overlap. Final preview retained on127.0.0.1:5174. No commit/push/provision/deploy.

Initial build/check:104 linted files,74 tests/9 suites and Workers SSR/client275 modules. New HTTP engagement smoke: theme SSR persistence + invalid/foreign/CSRF rejection, feedback bounds/429/dedupe/review, public cart fields/privacy/replay and client purchase rejection. Existing general/commerce/CMS/refresh smoke passed; concurrent20 buys/one stock and20 payment replays unchanged. QA feedback/order/CMS history retained, no resets. Browser accepted two correctly named JPEG test screenshots via multi-file input, rendered exactly2 slide controls and auto-selected second image; pause worked. Restored original published CMS7 through new revision9, preserving test revision8. Test file named PNG but actually JPEG was correctly rejected; no loosening of MIME checks. Final responsive/visual results recorded below after completion.
