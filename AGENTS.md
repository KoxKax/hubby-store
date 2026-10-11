# Hubby — Agent working agreement

Latest catalog request: six specified SKUs/seven variants per docs/CATALOG_V3.md, compact cards and category sidebar. Do not invent prices or unspecified warranty/entitlements. Keep unpriced server gate and private reviews separate from feedback. Published local CMS is authoritative; original fixture catalog remains historical regression data. Never rerun the catalog migration to overwrite later Owner pricing/content.

## Scope and authority

Latest visual request11/10/2026 supersedes previous layout/copy clauses: intro left/uploaded-image autoplay right, steps → categories → reviews → FAQ → support; dark default/light persistent; anonymous feedback separate from order support; Facebook-only dock, no chat. Banner count follows uploaded images, no generated promotional slides. Never fabricate email, purchases or testimonials; cart activity is telemetry, purchase activity requires verified committed live payment and excludes mock/refunded transactions. Remove repetitive storefront demo labels but keep accurate unavailable-service/payment safety where consequential. Owner has no external support destination. Local-only authorization and all production gates remain unchanged.

Read PRD.md, DESIGN.md, ARCHITECTURE.md, DATABASE.md and IMPLEMENTATION_PLAN.md before implementation. Latest direct Owner instructions take precedence; track changed decisions in documents. Phase 0 is documentation and minimal project/tooling only. Subsequent phases must be explicitly requested; do not implement full commerce site in Phase 0.

Current authorization: Owner requested continuing all remaining phases locally on11/10/2026. Implement synthetic commerce, mock payment/fulfillment, customer/admin operations and local hardening; do not wait for unavailable staging accounts to finish local workflows. Full staging/production acceptance remains gated. No cloud resources, real authentication accounts, real payments, supplier connections or production deployment. Keep current storefront layout for later visual revision. Local sandbox operations are never Owner authentication.

Latest Phase1 design revision: product-first home, no large introductory hero; multiple restrained accent colors. Canva/CapCut/Google/Netflix are Owner-requested brand examples, not verified licensed SKUs. Keep price/plan/stock synthetic, no affiliation/verified feature claims; Google service and every delivery method remain open until Owner confirms.

Work local-first on Windows. Do not connect real payment accounts, use real customer credentials/production inventory, create production resources, or deploy production without explicit Owner authorization. Keep staging data/secrets isolated. Reading repo/docs and creating local reversible artifacts are normal task work. Do not ask approval again for actions already authorized.

Never request Owner to paste secrets into chat; use ignored `.dev.vars`/environment and later provider secret stores. Never commit secrets, plaintext stock, exported customer data or backups. `.env.example` is names and safe examples only. Demo emails use reserved example domains; provider network access disabled in tests.

## Architecture and code

- React Router Framework Mode SSR on Workers, TypeScript strict. Follow pinned versions and lockfile; verify current official docs for compatibility changes.
- Separate route/UI, domain services, repositories, provider adapters. `.server.ts` for privileged code; no secret values/client bundles in loaders/public types.
- Postgres transactions/RPC own stock/coupon/payment consistency. JS requests do not emulate transaction by multiple independent API writes. No direct production SQL from local tests.
- Integer VND; prices recomputed server. Domain statuses typed and persisted; order state does not prove paid/fulfilled.
- Webhook signature/schema/account/direction/currency/amount/reference verified before state change. Idempotency and outbox persistent; never trust returnURL/browser/QR screenshot.
- Queue payload contains IDs only. Supplier timeout becomes uncertain/reconciliation, not blind repurchase. Resend must reuse delivery; replacement has lineage and new stock.
- Application encrypts inventory/delivery/activation with versioned AES-GCM; unique nonce + AAD; keys outside DB; log redaction. No plaintext email delivery until Owner decides O6 and security design is updated.
- Owner permissions require trusted membership and AAL2 server-side; enforce RLS and guarded RPC. Guest access order-scoped, hashed token, expiry, POST exchange.
- All UI/marketing content supported by CMS schema; no arbitrary CMS JS, unsanitized HTML or made-up recent purchases.

## Quality and workflow

Use npm with package-lock; CI Node24. Keep scope focused, preserve Owner edits. Run `npm run check` (formatter/linter, generated route/Worker types + TS, domain tests, production build). Run relevant SQL/RLS/concurrency/Worker/E2E checks as features arrive; don't label an unrun check passed.

No auto-deploy script/workflow in Phase 0. Production review must include costs, secret/key recovery, staging UAT, verified payment/fulfillment failure paths, rollback/restore, Owner approval. Do not assume sandbox availability from a provider's marketing page.

Security-relevant changes require meaningful tests for ownership, tampering/replays and failure recovery. Test fixtures synthetic. Avoid adding tests that merely duplicate low-risk UI markup. Use local runtime HTTP smoke tests to distinguish Node unit checks from actual Workers execution.

Communicate in clear Vietnamese unless requested otherwise; explain outcome and remaining gates. Record exact check output/status/limitations in IMPLEMENTATION_PLAN.md. Phase completion requires measurable criteria, not only compiled UI. Owner tasks listed separately from Codex tasks.
