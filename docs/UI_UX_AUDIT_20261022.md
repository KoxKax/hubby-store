# Hubby UI/CMS maintenance — 22/10/2026

Owner requested implementation of the comprehensive UI/content audit, preservation of existing data, checks and deployment to the existing Worker. This is maintenance, not activation of real payments or a new commerce backend.

## Findings and resolution

| Priority | Area | Observed problem | Resolution |
| --- | --- | --- | --- |
| P1 | Catalog | Category chips and category panel both visible on the same viewport | Desktop sidebar; phone scrollable chips; one visible control set, shared URL filtering |
| P1 | CMS home | Live Owner session confirmed an obsolete migration message blocking all editing | Existing ExperienceEditor connected to the existing compatible CMS save/publish contract; no migration |
| P1 | Media | Hosted banners could not select existing uploaded media | Shared searchable media picker, guarded /media URLs; hosted upload form retained |
| P1 | Lookup | Unavailable service still showed a disabled form | Hosted page offers order-history entry and explains code/email lookup is unavailable; local scoped form retained |
| P1 | Product | Unpriced/sold-out selections showed an unusable purchase form | Clear availability/price message and support action; quantity and purchase controls only for eligible selections; server sale gates retained |
| P2 | CMS products | Long editor always open; search only | Search + category/price filters, result count, thumbnails, explicit edit/close, slug and optional delivery-term fields |
| P2 | CMS publication | Save action far below long content; restore could discard edits | Top form-associated save button, dirty/busy gates; restore confirmation for unsaved changes; immutable revisions retained |
| P2 | CMS assortment | New-product control available only in simulator | Available through the same protected hosted save/publish workflow; new product starts unpriced/zero stock/no inherited warranty or media |
| P2 | CMS home | No banner/notice ordering controls | Stable-ID up/down controls; bundled campaigns previewed separately from uploaded media; explicit empty slides retained |
| P2 | Operations | Order cards, no list filters, no useful empty state | Orders table with item disclosure/ledger amounts; search/status filters for orders/tickets/submissions; empty states and product names |
| P2 | Mobile admin | Open menu pushed content down | Sidebar overlay/backdrop, Escape closes and returns focus; resize closes stale mobile menu |
| P2 | Storefront | Repeated hero text, oversized spacing, visual noise | Short exact-default-only copy adaptation, smaller intro, quieter stars, compact card rhythm and clear detail links |
| P2 | Navigation | English placeholder and Facebook button without a destination | Vietnamese/VND only; Facebook dock appears only with a configured destination |
| P2 | Customer | Account sections lacked active state and some empty copy | Active navigation and friendlier order/library/support labels |

Existing banner artwork, CMS uploads, custom copy, catalog terms, prices, Auth role policy, Google provider setup and payment settings were preserved. Reviews remain private; no fake orders/testimonials or marketing identities added. CMS theme stays a readable light workspace independent of storefront dark/light mode.

## Verification

- Final full check: exit0, 165 linted source/config/evidence files, 24 Vitest files / 256 tests, generated Worker/Router types, TypeScript and client294/SSR336-module build. Includes SQL/RLS, Auth, price/cart, payment-verifier and ownership regressions. New tests verify composed CMS filters and lossless/non-mutating item reordering. The later read-only hosted smoke script was separately formatted/linted and executed successfully.
- Separate Workers QA5184: general HTTP, commerce, CMS, lookup/support and engagement smoke groups passed. Includes two competing draft saves, immutable restore, twenty concurrent checkouts for one stock, twenty payment replays, cross-session/reveal/refund denial and CSRF. All data synthetic and state isolated.
- Separate QA5175: six products/seven unpriced variants, server price gates and private review checks passed. Script follows existing isolated-port restriction.
- Browser measurements: 105 page/viewport/theme combinations at 360/390/768/1024/1440, no document overflow, no observed broken images, exactly one main landmark. Dark covers ten customer pages and six CMS sections; light covers five customer pages. This is targeted evidence, not every page in both themes or full WCAG/Lighthouse/device certification.
- Browser interactions: CMS search/edit, top-toolbar draft save, immutable history restore, notice reordering/undo, dirty publication gate, navigation blocker, stay-on-page, mobile menu/backdrop/Escape. No hosted draft save, publish, upload or restore was submitted.
- Existing public catalog was read anonymously and copied only into isolated QA5184 for realistic layout inspection; original QA catalog restored as a new revision. No catalog import or seed ran against Supabase.
- Supabase guidance used to retain private media access and server authorization. Current changelog reviewed; TLS cipher deprecation does not require an application/SDK upgrade for this change. [Storage access control](https://supabase.com/docs/guides/storage/security/access-control).
- Initial restricted check failed due Windows sandbox temp/log access; approved external local execution passed. A new test's tuple type was corrected before final success. QA preview helper initially used the small local API route and assumed JSON from document POST; corrected to existing CMS document endpoint/status handling, then apply/restore passed. No production operation failed as a result.

Artifacts: `artifacts/ux-20261022/responsive.json`, before/after-home desktop/mobile images, local CMS desktop/mobile, `live-cms-desktop.png`, `product-mobile.png`, `live-lookup.png` and `live-admin-responsive.json`. Screenshots are visual evidence, not a transaction or performance certification.

## Data preservation and deployment

Before maintenance: existing Worker version `2e6135ef-80c4-46c8-bb56-0b2e47f22a98` recorded for rollback. Source copies of files touched this turn are retained under ignored `.wrangler/ux-backup-20261022/`; the worktree already contained many uncommitted changes and was not reset or committed.

Read-only CMS baseline: head version4, 4 revisions, published payload MD5 `18e6f26646d600ab2f90e68e3d33f85c`, all-revision payload hash `30c89d6894f8a05698e2c74eee18049d`, 0 managed media records. Existing unpublished draft preserved. No database/Auth/provider mutation or schema change is required by this batch.

Hosted build, hosting preflight and explicit generated-config deployment dry-run all exit0. Preflight remains productionReady=false because commerce acceptance is a separate unfinished phase. Maintenance deployment with `--keep-vars` succeeded: version `106af62f-4334-49e9-9011-66259ab60787`, both existing public hosts preserved. Reported startup2ms is not a load/CPU benchmark.

Read-only post-deploy smoke passed on both hosts: fifteen public pages each, current CSS/copy, six product details, account lookup without disabled code/email form, checkout closed, anonymous admin302, local admin404 and Casso GET405. Actual signed-in Owner session loaded all six CMS tabs and five operations sections at360/768/1440:33 additional combinations, no overflow/broken images/duplicate main. Live CMS search Office returned one row; unpriced filter returned five products; filters cleared afterwards. Live home editor/private media picker visible with save disabled while unchanged. No production form submitted. Observed live console warn/error logs empty.

Post-deployment read-only SQL exactly matched the baseline: head4, revisions4, same published/all-revision hashes and media0. Both published content and unpublished draft retained. QA5184 original catalog restored; only verified task-owned preview process trees21908/27072 stopped, state retained. No Owner preview/process or data was deleted. Source rollback copies and prior Worker version remain available.

## Responsibilities and remaining limits

Codex: deliver maintenance source, meaningful checks, visual/public verification, unchanged-data confirmation and rollback version. Complete scoped deployment with the existing hosting account.

Owner: no new account, payment setup or credential entry is required for this UI maintenance. Review the result and use the existing admin account to make business/content changes. Optional Fanpage/media/other prices remain Owner choices, not invented defaults.

Not part of this acceptance: real transfer/settlement/fulfillment, OCB/Casso activation, SMTP/guest email-proof implementation, supplier connections, legal/business policy drafting, paid upgrades, fake social proof or a claim that the shop is ready to accept money. Signed-in production write UAT is deliberately not run against the Owner's preserved draft.
