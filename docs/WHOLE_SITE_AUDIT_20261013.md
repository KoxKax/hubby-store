# Hubby — Product imagery and whole-site quality, 13/10/2026

## Scope

Owner requested online product images and comprehensive improvement. Retain Modern Gradient, three approved banners, published CMS/prices/warranty and existing Cloudflare/Supabase architecture. Do not equate public hosting or synthetic tests with paid-commerce readiness. No paid upgrade, real customer credentials, payment activation, catalog reseed or unreviewed DB changes.

## Product images

Replaced small favicon render defaults with optimized160/320px WebP under public/visuals/products. App metadata verifies exact application ID, bundle and seller before download; CDNs allowlisted. Microsoft uses its actual Microsoft365 press-kit wordmark, not Windows or Copilot. Google AI Pro is identified using the official Gemini app image, not Google One favicon; it is a product-family image, not a claim that every current app entitlement belongs to the shop's18-month offer.

Sources (accessed13/10/2026):

- Canva: https://apps.apple.com/us/app/id897446215 — Canva Pty Ltd, com.canva.canvaeditor.
- CapCut: https://apps.apple.com/us/app/id1500855883 — BYTEDANCE PTE. LTD., com.lemon.lvoverseas.
- Netflix: https://apps.apple.com/us/app/id363590051 — Netflix, Inc., com.netflix.Netflix.
- Duolingo: https://apps.apple.com/us/app/id570060128 — Duolingo, Inc, com.duolingo.DuolingoMobile.
- Gemini: https://apps.apple.com/us/app/id6477489729 — Google LLC, com.google.gemini.
- Microsoft365: https://news.microsoft.com/microsoft365_logo_horiz_c-gray_rgb/ — image https://msftstories.thesourcemediaassets.com/2019/11/Microsoft365_logo_horiz_c-gray_rgb.png.

Observed320px sizes: Canva6998, CapCut2820, Netflix4098, Duolingo4996, Gemini4816, Microsoft6062 bytes. Local image inspection confirms matching logos/artwork. No third-party browser hotlinks. Source identification does not imply partnership, authorized resale or an unrestricted commercial trademark license. Owner-provided media retains priority; renamed product disables known-brand defaults. On image failure, UI falls back to other available identification artwork without modifying CMS.

## Improvements

- Search: accent-insensitive, repeated spaces/hyphens normalized, multiple terms in any order, product features/delivery/variant labels included; compact brand queries Office365/CapCutPro supported. Unpriced and sold-out availability gates unchanged.
- Header search: in-memory suggestions, direct product links, all-results/empty-result path, clear input, native search landmark, keyboard Escape and normal Tab navigation. No private data or external search calls. Submit goes directly to product section.
- Saved lists: independent malformed JSON recovery, input size bound, exact known IDs, deduplication/order/bounds; no duplicates in recently viewed. No Auth tokens or credentials stored.
- Product details: quantity disabled for unavailable plans, valid min/max; contact navigation remains available when sold out. Large art now fits narrow screens. No fake prices, stock or features.
- Login: shared explicit show/hide password control and minimum-length hint for registration/reset; password hidden by default. No password capture, session/provider/role policy change. Removed one customer-facing staging word in an unauthorized-profile response.
- Support: missing Fanpage dialog now links to authenticated tickets and actual FAQ, not unconfigured email/code lookup.
- Footer categories come from current CMS rather than a fixed two-category list. Policy paragraphs/return links improve readability; all actual policy text remains Owner-controlled.
- Cards/product/cart use responsive actual product imagery. Corrected small-cart thumbnail crop and mobile header search placement.

## Verification and limitations

Initial full check218 tests passed. Accessibility lint rejected event wrapper without semantic role, then preferred native search tag; corrected instead of disabling checks. Subsequent npm run check exit0:152 lint files, generated Worker/Router types+TS,20 files/220 tests, client287 and SSR build. Added measured contrast safeguard for actual action-gradient tokens after this check; final checks recorded in IMPLEMENTATION_PLAN.md. No performance score inferred from compilation.

Six HTTP suites passed in isolated5175/state hubby-comprehensive-20261013: general routes/404/guards, commerce20 buyers/one stock and20 payment replays/one job, guest isolation/reveal/refund/retry, CMS CAS/privacy/publish/restore/history, owned lookup/support, theme/feedback/activity and six-SKU/seven-unpriced gates. No external provider calls. QA revisions/orders/feedback retained only in ignored isolated state, not Owner state or remote DB.

Browser first32 combinations found product-detail overflow at360/390. Cause: large-art min-height320 combined with1.2 aspect ratio forced384px min-content width; fixed with min-width0 grid children and mobile min-height0/padding/icon sizing. Header wrapper now occupies intended mobile search grid span. Final32 combinations (eight pages ×360/390/768/1440) have one main, no document overflow or broken images. Tested search suggestions/Escape/Enter/product-section hash and actual synthetic Netflix add→cart with48px loaded thumbnail. Console warn/error capture empty during inspected flows. This is not full WCAG, Lighthouse, load, real-device, signed-in production or live-money acceptance.

Supabase skill: current changelog fetched;12/10 CBC TLS1.2 deprecation read via Node after web tool failure. No custom deprecated cipher configuration in app changed. Current SSR guide reviewed; per-request client/getUser/membership/PKCE/cookie cache boundaries retained. No schema/roles/secrets/provider setting change. Google OAuth and sender setup remain Owner-controlled configuration/UAT gates.

## Remaining Owner decisions

Google OAuth security/secret setup and verified login test; coupon HUBBYxHUBER10% eligibility/products/caps/dates; final product prices/eligible supply; support destination; guest-proof/email delivery and approved payment/fulfillment UAT. Do not advertise these as completed by the visual maintenance update.

## Publication

### Account saved-products continuation

Added /tai-khoan/yeu-thich and explicit signed-in product-detail saving. Browser favorites remain separate; no automatic import or browsing-history upload. Server verifies identity with getUser, validates current published catalog key and DB UUID, then performs one scoped insert/delete against existing wishlists RLS. Duplicate insert23505 is idempotent; no upsert/update grant or remote migration. List joins only published products and preserves newest-first order. Guests redirect, CSRF/Origin/duplicate/extra form fields rejected, service/RLS errors do not claim success. Synthetic tests cover two identities, editable metadata not trusted, exact deletion filters, malformed responses, unknown product and spoofed fields. Real signed-in cross-device save/remove still requires private Owner/customer UAT; no account credentials were read or submitted by Codex.

Use existing hosted artifact/preflight/keep-vars workflow. Record actual version and public verification in IMPLEMENTATION_PLAN.md; do not infer deployment from a successful local build.
