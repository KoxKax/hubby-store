# Hubby — Catalog revision 3 (11/10/2026)

## Delivered locally

Owner catalog replaces the four legacy samples in the published local CMS as immutable revision12; no order, inventory or prior revision deletion. Six products/seven variants: Canva Edu3 years/warranty1 year/email invitation; Office3651 year/full warranty/own account; CapCut Pro1 or6 months/supplied account; Netflix1 month/supplied account; Duolingo1 year/own account activation link; Google AI Pro18 months/no warranty/own account activation link. These commercial terms come from Owner, not independently verified manufacturer guarantees.

CMS product editor exposes names, descriptions, features, durations, delivery text and new warranty/receipt/activation notes. Price is explicitly unconfigured until Owner supplies it: UI displays “Chưa niêm yết giá”, cart normalization and server checkout reject these variants even if old synthetic stock remains. Existing stock IDs and historical order snapshots stay unchanged. CapCut, Netflix and Duolingo warranty remains unspecified, never assumed full warranty. Office exact edition/eligibility still requires Owner confirmation.

New left category panel with counts and URL filters; three-column compact desktop grid, two columns on phone, wrapping category panel above cards on narrow screens. No fixed brand list or old tagline in hero/footer. Intro describes services and support briefly; steps and support copy revised. Slides/themes/feedback/Facebook preserved.

Reviews have a separate modal with product/rating1..5/text10..1000; POST /review checks CSRF and product existence. Private storage uses the existing bounded feedback table with category=review; separate operations tab “Đánh giá”, not mixed into “Góp ý”. Retry key dedupe and feedback limits still apply. No name/email collected. Submissions are not automatically public, not marked verified purchases, and cannot become testimonials by client request. Existing public CMS review slots are for genuine, consented testimonials only. No fake reviews or invented Gmail sales/cart identities implemented. Public cart feed remains anonymous real telemetry; live purchase outbox integration is still pending verified live settlement.

## Compatibility and release gates

Optional product `terms` and variant `priceConfigured` keep old local snapshots readable. Supabase publication rejects these extensions until SQL validation/materialization migration, rather than silently losing fields. Original fixtures remain historical test baselines; published local CMS is authoritative. `scripts/update-owner-catalog.mjs` is a one-off migration, not a routine reset: it can resume only an identical saved draft, otherwise refuses to overwrite unpublished work. Do not rerun after Owner pricing/custom edits.

Canva Education has eligibility restrictions, including K–12 educational roles; it is not a general-purpose paid plan available to everybody. Official source checked11/10/2026: [Canva eligibility](https://www.canva.com/en_in/education/eligibility-guidelines/). Owner must verify authorized sourcing, customer eligibility and the asserted3-year term before selling. Other product entitlement/region/device limits must likewise be confirmed; no storage quotas, device counts or “official partner” claims invented.

Local checkout/fulfillment remains synthetic. Capturing real activation emails and actually sending invitations/activation links requires secure staging forms, email and authorized supplier adapters. No real customer credentials, bank connection, live delivery, deployment or Git push.

## Owner actions

- Supply prices for7 variants; confirm warranty of CapCut/Netflix/Duolingo and exact account/edition/device/region eligibility.
- Verify rights to distribute and Canva Education eligibility; approve policies and truthful content.
- Add licensed product/banner images in CMS; provide Facebook later.
- Prepare authorized isolated staging before real Auth, activation email, payment or supplier integration.

## Codex responsibilities

- Local product/CMS schema, content, compact responsive UI and separate private review flow.
- Test unpriced checkout bypass, schema compatibility, review bounds/CSRF/privacy/dedupe and CMS immutable changes.
- Preserve history and clearly record remaining staging/production gates.

## Verification

Quality check: lint111 files, generated Worker/Router types + TypeScript,80 tests/10 suites, client277/SSR317 modules build pass. New catalog HTTP smoke passes six detail routes/seven checkout rejections, private review retry/bounds/CSRF and no public review/identity. Browser review submission shows success on390px. Additional responsive/CMS results recorded in IMPLEMENTATION_PLAN.md. QA submissions are explicitly test messages retained privately, not customer social proof. No full accessibility/performance/real-device certification.
