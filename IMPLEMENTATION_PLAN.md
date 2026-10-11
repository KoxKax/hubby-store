# Hubby — Phased implementation plan

## Catalog v3 — 11/10/2026

Six Owner products/seven variants published locally as new immutable CMS12; history/order snapshots/stock retained. Terms editable, unconfigured prices explicitly shown and rejected by both cart and server checkout. Compact cards + category panel, service-focused copy, separate private product/rating review modal + operations tab. No deceptive fake reviews or Gmail identities. See docs/CATALOG_V3.md for Owner/Codex actions and release gates.

Quality check passes lint111 files, generated types/TypeScript,80 tests/10 suites, client277/SSR317 build. New catalog HTTP smoke passes product details, all7 unpriced checkout/activity409, review dedupe/bounds/CSRF/private-only. Browser390px review shows success. No staging/live payment/email/supplier/production or Git changes. Existing test fixtures remain historical; old commerce/refresh smoke hardcodes removed sample variants and is not claimed against the new catalog.

Additional verification: CMS CAS/publish/restore regression passed and restored the new six-product catalog through immutable revision14 (QA revision/order retained). Browser24 combinations (home/Canva detail/private reviews ×360/390/768/1440 ×dark/light) have no horizontal overflow or broken images and one main each. Học tập filter displays only Duolingo; review QA submission succeeds at390px. CMS product tab confirms editable warranty/receipt/activation notes and unconfigured price checkbox. Evidence: artifacts/catalog-v3. Not full WCAG, Lighthouse or live-service acceptance.

Final after CMS feature-list editor and direct “Tài khoản & dịch vụ số” heading: npm run check passed again (lint112 files, TypeScript,80 tests/10 suites, client277/SSR317 build). Local catalog smoke rerun against final build; all previous release restrictions retained.

## Storefront v2 delivery — 11/10/2026

Latest Owner request delivered locally: image-count autoplay6s + multi-upload CMS, SSR persistent dark/light (dark default), anonymous feedback modal + operations review, Facebook-only dock/no chat, concise copy/no repeated demo labels, actual cart telemetry with product+duration, no invented email/sales. Live purchase announcements remain **pending verified bank settlement/outbox integration**; tested eligibility contract is not an active bank connection. docs/STOREFRONT_V2.md supersedes older illustrative/chat/footer notes.

- Final check after mobile fixes: lint106 files, Worker/Router types+TypeScript,76 tests in9 suites, client275/SSR316 modules build. Windows sandbox runtime/temp limitations required scoped local execution outside sandbox; no deploy/dependency change.
- New engagement HTTP smoke passed twice: theme SSR/default/persistence + invalid/foreign/CSRF rejection; feedback bounds/body cap/10-per-day429/retry dedupe/review; cart projection/privacy/replay; client-created purchase rejected. General smoke passed. Commerce/CMS/refresh regression passed:20 buys/one stock,20 payment replays/one allocation, guest ownership/reveal/refund, CMS CAS/restore, owned lookup/support. Synthetic history retained, no reset.
- Browser: light persisted after reload; feedback saved and reviewed; multi-upload2 JPEG test screenshots → exactly2 controls, auto-selected second image and pause worked. Mislabeled PNG/JPEG correctly rejected. Restored original CMS7 as new9; later CMS smoke restored same original content again through new versions.
- Responsive32 combinations: home/Canva/lookup/CMS Home at360/390/768/1440 in both themes. Fixed support max-content overflow/mobile header packing; final32 have one main, no horizontal overflow/chat/broken images. Activity now defers during own cart toast. Artifacts/storefront-v2 contains screenshots/measurements; not full WCAG/Lighthouse/device certification.
- Owner: add approved images via CMS Trang chủ, review copy/themes, confirm authorized SKUs/prices/policies; provide Fanpage later. Codex: local implementation/checks, state preservation and separate staging/private Owner/Auth/guest email/bank-outbox work. No commit/push/provision/deploy/real payment or supplier call.

Ngày: 11/10/2026. Owner requested continuing all remaining phases **local-first**. Synthetic commerce/customer/admin/mock adapters are authorized; isolated staging and production resources/real services are not. Full phase acceptance still requires the original measured gates below; the local continuation does not waive them. Earlier phase logs/task restrictions below are historical. See docs/LOCAL_HANDOFF.md for current status, Owner actions and remaining release gates.

## Phase roadmap

## Local continuation verification — 11/10/2026

## Storefront refresh requested by Owner — 11/10/2026

Implemented intro/carousel → steps → category collections → reviews → FAQ → support; announcement/header search, language placeholder, modal Auth, lookup, dock, CSS particles and multicolor. Independent catalog/support/category rendering replaced by safe redirects; product detail retained. Repetitive demo copy removed from home/product/cart/customer pages; one local footer plus checkout/order safety remains. Order tools collapsed, not presented as bank functions. docs/STOREFRONT_REFRESH.md supersedes prior no-hero/layout-preservation notes.

- Final npm run check passed: lint93 files without warnings, Worker/Router types + TypeScript,66 tests in8 files and client266-module/SSR build. Windows EBUSY resolved by stopping owned preview, no state/source deletion.
- After adding browser measurement artifacts, final lint94 files passed with no warnings. Final preview serves5174; screenshots verified visually, viewport override reset. No quality score asserted for untranslated or unconfigured services.
- Final HTTP smoke and new smoke:refresh passed: own short-code+fixture email lookup; wrong/unknown/cross-session generic response; cross-session support404; owned ticket saved; catalog/support redirects. Earlier refresh build also passed commerce20 requests/1 stock and payment replay/retry/reveal/refund suite.
- CMS CAS/publish/new product/restore suite passed after UI saved/applied new experience settings as revision5. Subsequent smoke restored that configuration through new immutable revisions, preserving order snapshots/history. No reset, real SMTP, external messaging, Auth service or payment calls.
- Browser: slide controls select expected slide without navigating; modal signup/login remains on home and Escape closes; search returned Netflix; Facebook missing-link state explicit. Created synthetic Canva order0C2EC54F, lookup returned own order, dock saved one message visible in order; cancelled pending order to release reservation while retaining ticket/audit.
- Responsive16 combinations: home/lookup/new CMS tab/Canva detail at360/390/768/1440, one main and no horizontal overflow. Fixed mobile step positioning and slide-caption hit-target overlap found by visual QA. Inspected warn/error log empty. artifacts/storefront-refresh contains desktop/full/mobile/auth/chat screenshots and measurements; not full WCAG/Lighthouse/real-device certification.
- Remaining: English, real Auth/guest-email proof, approved SKU/policies/media/reviews, external support relay and staging/production acceptance. Owner has no Fanpage/Telegram yet; no invented destination. Purchase popups visibly illustrate synthetic events, no made-up people/reviews. No commit/push/deploy.

## Earlier local continuation evidence

- Implemented local slices of Phase3–5: atomic stock/order, mock payment/fulfillment/refund/replacement, guest pages/tickets, operations and server CMS publish/version history. No real bank, supplier, Auth service or production deployment.
- Final verification passed:58 tests in7 files, lint/types and Workers SSR build. Includes regression for full refund cancelling deferred delivery without a pending job or new allocation. All three HTTP smoke suites passed again after the final build/restart.
- HTTP smoke: public/Auth fail-closed guards;20 concurrent checkout requests against1 unit produced1 winner/19 conflicts; duplicate payment/retry allocated once; cross-session read/reveal denied; ticket/reply/refund tested. CMS race produced1 save/1 conflict, draft was private, publish changed public catalog, restore preserved historical order snapshots.
- Preview persistence bug fixed: old storage under build lost earlier synthetic orders. Current store copied after stopping preview into `.wrangler/hubby-preview-state`; before/after checksum matched, rebuild/restart also matched. No real customer data affected; this is not production recovery certification.
- Browser: two-unit order paid/delivered/revealed, customer ticket received operator reply and closed state.24 viewport/route combinations had no horizontal overflow; captured browser error/warn log empty. Screenshots/measurements in artifacts/local-continuation.
- Owner: review local UX/content; no cloud account needed now. Later approve SKU rights, assets/policies and isolated staging access, entering secrets outside chat. Codex: remaining normalized commerce SQL/RLS, verified guest/Auth, private operations, real-provider adapters, queues/security/restore/performance/UAT are listed separately in docs/LOCAL_HANDOFF.md. Phase6/7 and production acceptance are NOT complete.

## Phase roadmap (original release gates retained)

| Phase | Deliverables / Codex work | Measurable acceptance | Owner action | Effort estimate |
| --- | --- | --- | --- | --- |
| 0 — Plan and skeleton | Six docs, versioned SSR shell, domain/adapter boundaries, lint/type/test/build + runtime smoke | 6 docs present, no real secrets/cloud resources, checks recorded; stack/cost limitations explicit | Review open decisions; no cloud signup required yet | This task |
| 1 — Storefront visual prototype | Tokens/components, responsive home/catalog/detail/cart mock, search/filter/variant/buy-now interactions, typed CMS fixture provider | 360/390/768/1440px no overflow; keyboard/focus/reduced motion; <20 synthetic products; no live API calls; check passes and screenshots reviewed | Provide/approve brand, visual direction; can use clearly labeled fixtures pending assets | 3–5 days |
| 2 — Data/Auth/CMS | SQL migrations/RLS, synthetic seeds, Supabase repository, email/password/Google, Owner TOTP, CMS/media draft-publish-preview | All policies pass anon/A/B/AAL1/AAL2 tests; reset/logout/OAuth refresh checked; Owner changes banner/product/page without code; migration rollback strategy documented | Own staging Supabase/Cloudflare/Google/email accounts + staging-only secrets when needed; policy/catalog verification | 4–7 days |
| 3 — Commerce and inventory | Atomic order/cart/coupon/stock reserve; encrypted CSV/manual imports; guest proofs, fake payment intents | 20 parallel buys for one stock: 1 reserve; duplicate checkout one order; qty2 two units; expiry race safe; no plaintext in logs/browser/storage | Confirm expiry/coupon/activation fields; synthetic only | 4–6 days |
| 4 — Payment mock then staging adapter | Signature validation, settlement ledger/outbox, provider adapter, reconciliation, safe guest email links | Duplicate 20x one allocation/outbox; invalid signature/account/amount/currency/inbound/test event doesn't fulfill; late/missed/out-of-order paths; no browser settlement | Select bank/provider, eligibility/fee/KYC; choose secure email link; explicit separate scope before any real account connection | 4–6 days |
| 5 — Fulfillment/customer/admin operations | Local units + mock/API adapter approved docs, activation, purchases/ticket/wishlist/recent, reports, retry/replace/refund/resend/notes/low-stock | Crash/retry/timeout tests show no duplicate purchase; partial quantities correct; resend no new stock; replacement lineage; confirmed refund <=paid; privacy-safe real-order projection; report fixture totals match | Provide supplier terms/docs/test mechanism and support/refund/retention policies; validate UAT | 5–8 days |
| 6 — Staging hardening and release readiness | Full E2E/UAT, mobile QA, performance/load/security, backup+restore, alerts/cost/kill-switch runbooks | RLS/E2E/check green; <=2.5s p75 LCP target measured; restore meets proposed RPO24h/RTO4h; payment reconciliation recovery; no critical security findings; cost plan accepted | Decide Free-risk pilot vs Pro budget vs alternative; approve actual monthly fees/policies/production release explicitly | 3–5 days |
| 7 — Limited production launch (not yet authorized) | Controlled deployment, low-value test payments only after authorization, reconciliation watch and rollback | Owner approval recorded; verified actual payment→single delivery; alert + refund exercise; go/no-go report | Own resources/payment accounts, approve go-live and initial limits | Separate task |

Supplier real adapter can be delayed without blocking local-stock MVP, but unsupported supplier fulfillment must be visibly disabled. “Full advanced admin” is complete only after Phase5 criteria, not after visual shell.

## Hard gates

1. Phase 1 can proceed with mock content; O1/O2 unknown recorded. No accounts required for local prototype.
2. Phase 2 cloud staging requires Owner-owned staging accounts/requested provisioning scope; no production credentials.
3. No real payment account connection in this assignment. Mock tests first; provider staging/test claims must be verified. Official payOS API lists production, so not assumed sandbox.
4. Production plan cannot honestly claim guaranteed <500k with Supabase Pro. Owner chooses budget/risk or asks D1/external-Auth spike; spike must satisfy auth/MFA/atomic-stock/backup tests before stack switch.
5. Inventory/credentials real only after Owner-authorized secure import and permission-to-sell checks, no upload into chat/git.
6. Production resource creation and production deploy require explicit Owner authorization; release readiness is not permission to launch.

## Owner checklist (separate)

- [ ] Confirm SKU/variants/delivery rights/warranty/refund/activation fields.
- [ ] Select domain and provide logo/media/Fanpage URL, content, approved policies.
- [ ] Decide budget/risk before release; confirm tax/card/provider overage and actual tier quotas.
- [ ] Own staging service accounts, MFA/recovery; place staging secrets through safe configuration.
- [ ] Choose bank/payment provider and complete KYC only in later authorized scope.
- [ ] Provide supplier docs/terms and supported test mechanism.
- [ ] Decide email-delivery privacy tradeoff (secure links recommended), guest TTL and claim policy.
- [ ] Decide data retention, support SLA and actual recovery targets; verify legal/business obligations externally.
- [ ] UAT on desktop/mobile and explicit production approval in later task.

## Codex checklist (separate)

- [x] Read available prior user brief and current request; record missing cached content.
- [x] Check official compatibility/plans/payment docs and npm versions.
- [x] Draft PRD/DESIGN/ARCHITECTURE/DATABASE/AGENTS/IMPLEMENTATION_PLAN.
- [x] Minimal SSR shell/domain contracts/quality tooling and lockfile.
- [x] Record all Phase 0 check results, limitations and recommended Phase 1 task.
- [x] Implement Phase 1 storefront with typed mock content, no real service integrations.
- [x] Run Phase 1 build/type/lint/unit/runtime/browser checks and save desktop/mobile previews.
- [ ] Later phases: implement/test migrations/RLS/auth/CMS/checkout/payments/fulfillment/admin separately per roadmap.

## Initial verification log

Environment initially empty: `O:\Linh tinh\Hubby`; no existing git repository. Node24.19.0/npm11.17.0 available. Remote GitHub metadata earlier confirmed private `KoxKax/hubby-store` access. Initialized local Git branch `main`, origin `https://github.com/KoxKax/hubby-store.git`; no commit/push or remote mutation performed. All deliverable source/docs are new local files; generated types/build/node_modules/secrets/backup directories ignored.

11/10/2026: sandbox npm registry DNS failed (`ENOTFOUND`); permitted network command successfully queried registry and installed dependencies. Versions confirmed/installed: React Router8.4.0, React19.3.0, Vite8.3.4, Cloudflare Vite1.63.1, Wrangler4.149.0, TypeScript6.0.3, Vitest5.0.3, Biome2.5.15, isbot5.2.2. package-lock committed as deliverable file (not yet a Git commit); `npm ls --depth=0` reports matching pinned dependencies.

Initial failures resolved: Biome deprecated config migrated to preset; Workers sandbox EPERM/runtime failure resolved by authorized local execution outside sandbox; explicit Workers `entry.server.tsx` prevents React Router's fallback Node entry from auto-installing isbot/pruning dev dependencies; plain Cloudflare context example did not match RR8 `RouterContextProvider`, replaced with typed context. Final checks below succeeded after fixes. npm emitted allow-scripts advisories for esbuild/workerd install scripts; build/runtime passed, no arbitrary package scripts approved. A fresh CI/Linux run is not claimed.

| Check | Status | Evidence / limitation |
| --- | --- | --- |
| Official architecture/price research | Complete | ARCHITECTURE sources, accessed11/10/2026 |
| Prior brief retrieval | Partial | User stage4–6 available; assistant messages references only, stage1–3 absent |
| Dependency install and audit | Passed | npm install --include=dev, lockfile; npm audit --audit-level=high: 0 vulnerabilities on11/10/2026 |
| Formatting/lint | Passed | Biome check: 20 source/config files, no diagnostics (after smoke script addition) |
| Typecheck and generated types | Passed | Wrangler runtime/binding types + RR route types + tsc --noEmit |
| Domain tests | Passed | 1 test file, 3 tests: integer amounts, qty/overflow, vi-VN formatting |
| Production build (local only) | Passed | Vite8.3.4 client100 modules and SSR97 modules compiled; no upload/deploy |
| Local Workers HTTP smoke | Passed | npm run smoke: /200 with vi SSR/noindex/no-store/nosniff; /health200 runtime-only JSON; unknown route404 Vietnamese fallback; localhost connection required permitted execution outside sandbox |
| Git hygiene | Passed | origin points intended repo; generated files and .env/.dev.vars/private-inventory/backups ignored; no push |
| DB migrations/RLS/concurrency | Not run, not implemented | Phase2–5; no database created |
| Browser viewport/accessibility/performance | Not run | Phase1 UI; skeleton is not storefront |
| Auth/payment/supplier/E2E | Not run, not implemented | Later phases with synthetic staging |
| Cloud deploy/production/resources | Not performed | Outside Phase0 |

`npm run check` final completed with exit0 after context/entry fixes. Local dev server started at http://127.0.0.1:5173 for smoke; ordinary Owner terminal can start again with `npm run dev` if session stops. `smoke` is reproducible with server already running and only accepts localhost HTTP. CI workflow exists but has not run on GitHub because no files were pushed. Browser visual/hydration/mobile checks deliberately remain Phase1 work; HTTP smoke proves SSR/runtime, not complete storefront usability.

## Phase 1 task (historical, completed)

```text
Bắt đầu Phase 1 của Hubby, chỉ xây storefront visual prototype chạy local.
Đọc AGENTS.md, PRD.md, DESIGN.md, ARCHITECTURE.md, DATABASE.md và IMPLEMENTATION_PLAN.md.
Giữ React Router Framework Mode SSR/Cloudflare/TypeScript và dependency lockfile đã kiểm chứng.
Xây design tokens, reusable components, home, catalog/search/category/filter,
product detail/variant selection, cart và buy-now flow dưới dạng mock.
Dùng typed CMS fixture provider (dưới 20 sản phẩm giả) để toàn bộ banner,
product text/media/sections/SEO có contract cho CMS thật Phase 2.
Phong cách premium near-black/charcoal + plum/purple/lavender gradients;
typography tiếng Việt, spacing rộng; không neon blue, không đơn mua giả đóng vai thật.
Kiểm responsive 360/390/768/1440px, keyboard/focus/contrast/reduced motion,
loading/empty/error/out-of-stock và đánh dấu demo rõ ràng.
Không triển khai auth/DB/payment/supplier thật, không dùng credentials/kho thật,
không tạo cloud resources, không deploy production.
Chạy npm run check và kiểm UI bằng browser/screenshot khi có công cụ;
ghi kết quả/giới hạn vào IMPLEMENTATION_PLAN.md.
Giao prototype chạy được, ảnh preview desktop/mobile, danh sách thay đổi
và tiêu chí Phase 1 đạt/chưa đạt. Chưa chuyển Phase 2.
```

## Phase 2 local delivery — 11/10/2026

Owner authorized Phase2 and chose local first because no Supabase account exists. This is the local slice, **not full Phase2 acceptance**. Local CMS, server Auth/CMS/profile/media handlers, SQL migration + guarded synthetic seed, and access-control tests are implemented. No remote resources/configuration, deployment, Git push/commit, payment or supplier connection performed.

| Check | Result |
| --- | --- |
| npm run check | Pass: lint63 files, generated Worker/Router types + TypeScript, 29 tests in5 files, client249 modules + SSR build (exit0) |
| SQL | Actual PGlite migration/seed/RLS: anon/A/B/Owner AAL1/AAL2/revoked; guarded draft/publish/restore, CAS, immutable history, failed-publish atomicity, private media rules pass |
| CSRF/content safety | Origin+token+byte cap; internal redirects/schema/unknown fields/media magic; fixtures make no network Auth requests pass |
| Workers HTTP smoke | Public/auth/demo routes200, unknown404, real admin503, logout GET405, callback503, malformed media404; HttpOnly/Lax CSRF cookie and same-origin unconfigured action503; foreign-Origin POST rejected400 by Router before application403 guard |
| Browser CMS | Save draft leaves storefront unchanged; apply updates heading; reload keeps browser-local content; restore baseline creates revision2 preserving0/1 then applies successfully |
| Responsive | 12/12 checks: admin product editor/auth/account at360/390/768/1440; one main per page, no horizontal overflow. No warnings/errors in inspected browser logs; not full WCAG/device audit |
| Actual Auth/Storage/REST/concurrency | Not run: no staging account; PGlite auth/storage stubs are not full Supabase |
| Remaining UI | Product create/archive, image marketing banners/full SEO, synced wishlist/recent-view UI still pending |
| Production hardening | CSP/rate limits/backup rehearsal/load/performance/accessibility and production setup not accepted |

Evidence screenshots and responsive measurements in `artifacts/phase-2/`. Browser test title reverted through revision restore; no test content applied to cloud. Local CMS snapshots≤30 and quota-bound, published only in this browser after hydration, SSR still fixtures. Account login deliberately disabled. No local GoTrue/Storage stack installed.

Owner now: try `/admin-demo`, review scope/content; no account needed. Later prepare isolated staging account and confirm remote configuration authority; self-enter passwords/MFA/provider secrets, approve product rights/assets/prices/policies. Codex now: preserve UI and deliver local evidence; next implement missing CMS screens + stage tests when authorized, never bootstrap permissions via metadata.

### Exact recommended next task (finish Phase2, not automatically Phase3)

“Hoàn tất Phase2 Hubby theo docs/STAGING_SETUP.md sau khi Owner chuẩn bị và cho phép Supabase staging. Bổ sung product create/archive, banner ảnh/SEO và wishlist/recent-view sync. Chạy Auth email/Google/reset/logout/refresh/MFA và RLS/RPC/Storage trực tiếp với anon/A/B/Owner AAL1/AAL2, concurrent publish, backup/restore checklist. Dùng dữ liệu giả, giữ payments/suppliers mock; không production/deploy/push/Phase3 tự động. Ghi rõ pass/fail/pending và Owner actions.”

### Exact Phase3 task — chỉ sau Phase2 được nghiệm thu và Owner yêu cầu

“Bắt đầu Phase3 Hubby: commerce backend local/staging synthetic. Đọc AGENTS/PRD/DATABASE/ARCHITECTURE và Phase2 evidence. Xây order/item snapshot giá server, coupon validation, guest proof an toàn, inventory mã hóa/reservations/outbox và idempotent mock fulfillment với adapter interface. Kiểm race20 khách/1 stock, double checkout key, expiry/retry/crash và authorization orders A/B/guest. Checkout vẫn mock, không payment/supplier thật, production hoặc gửi dữ liệu khách hàng. Chạy checks, ghi nghiệm thu và handoff Phase4 payment staging, không tự chuyển phase.”


## Phase 1 initial delivery and verification — 11/10/2026 (historical)

Owner's “tiến hành đi” authorized the recommended Phase 1 local scope. Completed: premium storefront, typed content contracts/fixture provider, 8 fictional products/variants with synthetic availability, local cart/wishlist, catalog accent-insensitive search/category/stock filter/price/name sort, variant selection, buy-now preview, coupon validation, checkout confirmation without order/payment/fulfillment, support FAQ and policy pages. Account remains an explicit placeholder. No fabricated real-order notifications; no Fanpage destination invented. No Auth/DB/CMS admin or external service integration.

Main source: `app/content/`, `app/components/`, `app/domain/catalog.ts`, `app/domain/demo-cart.ts`, storefront routes and `app/styles/storefront.css`. Self-host font dependency @fontsource/be-vietnam-pro5.3.0 + OFL notice; lockfile updated. Only demo IDs/quantities are stored on browser; checkout form values are not persisted/transmitted. Mock price/stock must be replaced with server-authoritative commerce logic in later phases, not reused as payment proof.

| Check / acceptance | Result | Evidence and limits |
| --- | --- | --- |
| Lint / formatting | Passed | Biome39 files after final CSS edits; CSS noDescendingSpecificity disabled for component-scoped selector order, other recommended rules kept |
| Type generation / TypeScript | Passed | Workers + RR types and tsc from npm run check |
| Unit tests | Passed | 2 files, 7 tests: money/quantity, normalized IDs/stock caps, subtotal/coupon, accent search/filter, fixture integrity |
| Local production build | Passed | Client132 modules, SSR119 modules; final rebuild exit0. Windows preview lock caused EBUSY once; stopped our preview and rebuilt successfully, no source deletion |
| Runtime HTTP smoke | Passed | Dev5173 and final local build5174: home/catalog/detail/category/cart/checkout/favorites/support/account/policy/health and unknown route/product/category404 |
| Responsive | Passed | 5 pages × 360/390/768/1440px =20 checks, no horizontal overflow; `artifacts/phase-1/responsive-results.json` |
| Cart / coupon / persistence | Passed | Nova3months349k ×2 =698k; HUBBY10 capped30k =>668k; reload preserved variant/qty. Coupon intentionally not persisted |
| Search/filter/sort/empty | Passed | Unknown search empty, ascending price order correct; available filter7 of8 products; no fixture mutation |
| Variants / out-of-stock / buy-now | Passed | Canvas12month soldout disables both purchase actions; Nova1month direct buy129k independent of cart |
| Preview checkout / wishlist | Passed | Local confirmation explicitly no order/money/email/delivery; favorite persisted and rendered |
| Loading / error / retry | Passed | Explicit catalog preview states; retry returns catalog; unknown slugs404 |
| Keyboard / mobile nav | Passed (targeted) | Visible focus, Tab traversal, skip-link Enter focuses main; mobile menu opens/closes at360px. Not complete WCAG audit |
| Contrast / reduced motion | Partial verification | CTA white text at gradient ends7.09:1 /5.28:1; reduced-motion CSS inspected, browser preference emulation and all-color contrast audit not run |
| Hydration / console | Passed on local build | Fresh5174 tab had no warning/error through navigation/wishlist/buy-now. Earlier dev tab emitted one script warning during HMR; absent in fresh build |
| Dependency audit | Passed | Install audit135 packages reports0 vulnerabilities; point-in-time package audit, not application security audit |
| Screenshots / visual review | Passed | Desktop1440, mobile390, full home, catalog reviewed; all synthetic assets/labels |
| GitHub CI / deploy | Not performed | Files local/uncommitted, no push/cloud changes/deploy |
| SQL/RLS/Auth/payment/supplier | Not implemented/tested | Future phases; no real credentials, stock, accounts or transactions |
| Performance/load/real devices | Not run | No Lighthouse/LCP score, SQL concurrency or production readiness claim |

Phase1 prototype acceptance is complete with accessibility/performance limits above recorded; these remain release-hardening gates. `artifacts/phase-1/home-desktop-1440.jpg`, `home-mobile-390.jpg`, `home-desktop-full.jpg`, `catalog-desktop.jpg` are preview evidence. HTTP localhost5174 serves the final build while `npm run preview` remains running; restart per README if stopped.

### Owner actions now (separate)

- Review desktop/mobile visual direction and Vietnamese copy; fictional catalog is not a proposed licensed product list.
- Supply approved real product names/variants, rights-to-sell, brand assets, Fanpage URL and policy copy when ready; never send stock credentials or passwords in chat/git.
- No cloud/payment signup needed to review Phase1. When requesting Phase2, own staging service accounts and confirm provisioning scope before remote work; decide production budget/risk later.

### Codex responsibilities next (separate, not started)

- Preserve this visual shell, create migrations/RLS/repository/CMS/auth tests and explain account setup only when needed.
- Replace fixtures behind the typed boundary, keep staging synthetic, provide quality/access-control evidence and a safe rollback plan.
- Do not start payment/fulfillment/production, silently provision accounts or publish local work to GitHub.

## Phase 1 revision — product-first storefront

Owner feedback11/10/2026: bỏ phần giới thiệu lớn đầu trang, vào thấy sản phẩm ngay; thêm màu chữ ngoài tím; nhóm dự kiến Canva/CapCut/Google/Netflix. Revision này vẫn local/mock Phase1, không chuyển Phase2.

Implemented: compact shop heading/search, URL-based home query/category chips, four brand-example cards before category/how-to/support content; restrained mint/peach/gold + product-specific typography/artwork. Four example products, eight synthetic variants; Google service type and real SKU/delivery/rights are explicitly unconfirmed. No real prices/features/partner claims, remote assets or new dependencies. Typed CMS schemaVersion2 replaces hero with shop fields; CMS admin not implemented. Old invalid fixture cart IDs normalize away; stale favorites IDs excluded.

| Revision verification | Status / evidence |
| --- | --- |
| npm run check | Passed:39 source/config files, generated Worker/RR types + TypeScript,7 tests, client132/SSR119 modules, exit0; final lint including generated responsive evidence40 files passed |
| HTTP smoke on final build5174 | Passed all routes/404s and mock flags; asserts four brand examples in SSR and no introductory hero markup |
| Responsive |20/20 passed at360/390/768/1440 across home/catalog/Canva detail/cart/checkout; no horizontal overflow |
| Product-first above fold | First home card top/bottom px:360=393.9/703.7,390=393.9/716.9,768=382.3/824.8 at844px height;1440=343.5/752.6 at900px height. First row and its price fully visible |
| Home filters/search | Passed:Giải trí→Netflix; search canva→Canva; unknown query→empty/reset; keyboard Enter on Sáng tạo→Canva+CapCut |
| Out-of-stock | Canva12month disables buy/add; sample stock only |
| Buy now | CapCut3month selected→checkout349k, correct variant, no cart mutation or real transaction |
| Brand title contrast | Canva11.43:1, CapCut12.66:1, Google10.42:1, Netflix9.66:1 against card background; targeted check, not full WCAG audit |
| Browser console | No warnings/errors in reviewed local build navigation |
| Screenshots | Reviewed desktop1440 and mobile390; `artifacts/phase-1/product-first-desktop.jpg` / `product-first-mobile.jpg`; measurements in `product-first-responsive.json` |
| Services/GitHub/production | Not connected/deployed/pushed; all previous scope restrictions unchanged |

Owner now: review the revised layout/palette and later confirm exact SKU/service (especially Google), verified distribution rights, delivery terms, final prices and assets. Codex: preserve product-first structure and schemaVersion2 when implementing the future CMS/data layer; do not treat these fixtures as approved commercial inventory. Older Phase1 images and checks above remain historical.

## Exact recommended task for Phase 2

```text
Bắt đầu Phase 2 Hubby: Data/Auth/CMS, giữ giao diện Phase1 hiện tại.
Đọc AGENTS.md và 5 tài liệu dự án; dùng DATABASE.md làm design baseline,
ghi rõ mọi thay đổi trước khi tạo migrations.
Trước tiên xây SQL migrations, synthetic seeds, RLS/guarded RPC,
repository layer và tests local; không tự tạo tài nguyên cloud.
Thiết kế/chạy kiểm anon/customer A/customer B/Owner AAL1/AAL2,
không dùng service-role trong browser và không tin role do client gửi.
Triển khai email/password, Google OAuth, reset/logout/refresh
và Owner TOTP ở staging khi Owner đã cung cấp account/configuration
an toàn và cho phép provisioning staging rõ ràng. Không yêu cầu secrets trong chat.
Xây CMS/media/product/variant editing, draft/preview/publish/revision rollback
theo typed contract Phase1; Owner đổi banner và sản phẩm không sửa source.
Giữ synthetic data, noindex và mock checkout; chưa triển khai order/payment/
supplier/encrypted production inventory hoặc production deployment.
Nếu staging chưa sẵn, hoàn thành migrations/tests/local implementation,
phân biệt checks đã chạy và integration checks còn chờ; không giả lập pass.
Chạy npm run check + RLS/auth/CMS checks liên quan, cập nhật tài liệu,
giao checklist Owner riêng, kết quả nghiệm thu và exact Phase3 task.
Không tự chuyển Phase3 và không commit/push GitHub nếu chưa được yêu cầu.
```
