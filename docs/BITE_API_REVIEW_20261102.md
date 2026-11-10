# Bite API review — 02/11/2026

> Cập nhật: các mục dưới đây là đánh giá API và danh sách khoảng trống **trước khi triển khai tiếp**. Tiến độ mới được ghi ngay dưới đây; không dùng danh sách "Actual current code gaps" làm trạng thái triển khai hiện tại.

## Tiến độ triển khai thực tế — 02/11/2026

- Giữ React Router/Cloudflare Worker cũ. Đã lưu và hiển thị catalog Bite, tìm kiếm/phân trang, giá/tồn; snapshot đọc gần nhất: **164 SKU active, 126 có hàng, 38 hết**, lúc 2026-11-01 19:55:23Z. Có giao diện liên kết Hubby variant với SKU nguồn theo điều kiện, hiện **0 mapping**, không tự ghép SKU theo tên.
- Đã bổ sung theo dõi GET order, Idempotency-Key cho POST mua một lần, lưu dấu/giá nguồn ở DB, polling có giới hạn, receipt và giao nội dung mã hóa. Có nút Owner-only xem balance và tối đa 20 giao dịch, chỉ đọc các trường an toàn. Các migration tương ứng đã áp trên Supabase hubby-staging.
- Worker version `2caa6110-1867-4f34-b5c9-166df982a686` đã triển khai cho cả domain cũ; TypeScript và build exit 0. **Không chạy test suite/HTTP smoke/UAT, không gọi mua thật** theo yêu cầu. Chưa xác minh response ví/giao dịch hoặc giao hàng thật, và chưa có khung FX/margin/price-lock phía nhà cung cấp, tự động đổi nguồn hay refund đầy đủ. Owner cần tự chọn mapping thương mại chính xác.

Read-only review requested by Owner; no implementation, deployment, provider purchase, authenticated API request or database write in this review. Sources actually opened in the in-chat browser: https://reseller.bite-store.com/docs and https://reseller.bite-store.com/openapi.json (version1.7.0, OAS3.1). Expanded all nine operations and the order request schema. The only executed request from the preceding demonstration was unauthenticated GET products:401 missing X-API-Key. No successful account-specific response has been inspected.

This review supersedes earlier incorrect statements in code comments and setup documents that Bite has no documented idempotency, order lookup, webhook, response example or refund behavior. Do not repeat those assumptions. Existing one-shot code is a partial integration, not full support for the actual contract.

## Verified public contract

| Operation | Verified detail |
| --- | --- |
| GET /v1/products | category integer, search string, page>=1 default1, per_page1..500 default100, live default0; live=1 requests a background refresh, not a promise of synchronous freshness. Archived/disabled/hidden products or categories are omitted; sold-out items remain with inStockfalse. price is current one-unit price, normalPrice is key-aware normal rate, promotion describes flash/percentage/quantity tiers; source checkout rechecks actual quantity pricing and availability. |
| GET /v1/balance | Wallet USD and points. Exact successful JSON fields and conversion relationship are not specified by a typed response schema. |
| GET /v1/transactions | Recent point ledger and recent reseller orders; limit1..100 default30. No pagination/cursor/date filter is declared. Do not present it as an unlimited complete order archive. |
| POST /v1/orders | Required productId string; quantity integer default1. Optional Idempotency-Key header returns an existing order for repeated keys. Description gives success example with ok, orderId, deliveredKeys, amount, status delivered. No customer email, activation payload, max-price or currency field is declared in request schema. Example quantity2 contains only one deliveredKeys element; do not infer all quantity/cardinality semantics from this example. |
| GET /v1/orders/{order_id} | Integer path ID, key required in practice; order status/delivery lookup. Full successful response schema is empty. |
| POST /v1/reseller/branding | Required storeName string body; changes saved invoice store name. |
| GET /v1/orders/{order_id}/invoice | store_name override; client_price explicitly USD; format png default returns image bytes, json returns Base64 JSON. Description says no upstream bot links/wholesale prices shown. It does not declare a VND invoice option. |
| GET /v1/files/{order_id} | Raw delivery file bytes for the key's own order. Telegram file IDs are not transferable across bots. Must deliver through Hubby's authenticated/order-scoped server path; never expose reseller key. |
| GET /v1/products/{product_id}/image | Image bytes with valid key;404 when product has no photo. Existing Owner media must keep precedence. |

All operations use X-API-Key. OpenAPI marks the header optional, but documentation explicitly says missing/invalid key returns401; do not interpret the optional schema flag as public access.

Delivery can be immediate, processing or pending/manual. Files use deliveredFileRef. Docs list 13 text formats; do not parse all credentials by a guessed separator or insert source markup as HTML. Failed fulfillment after debit is documented to refund points; this is a source-wallet action, not a refund of the Hubby customer's VND payment.

Webhook events: order.delivered, order.pending, order.failed, order.pending_completed when URL is configured on a reseller key. No webhook signature/header/schema/retry specification appears in the inspected OpenAPI. Until authenticated callback semantics are verified, callbacks should only wake a GET-order reconciliation, not grant delivery/payment authority.

Errors documented:401 authentication,402 balance,403 key policy,404 unavailable/not found,409 stock,429 limit,502 fulfillment failed/points refunded. Numeric rate quota, idempotency retention/scope/conflict rules, file content-type/size and full successful response schemas are not declared. Success schemas are `{}` across operations; Swagger's displayed string is not a validated real product response. Do not invent exact field names or price currencies for product responses from wallet currency alone.

## What Hubby should use

1. Source catalog browser/import-as-draft: paginated search, source product identity, source stock/price/promotion, optional image. Operator selects actual offers; never automatically publish all Bite items or overwrite Owner names/prices/terms/media.
2. Separate Hubby products/variants from source offers. A Hubby variant can have several eligible source offers in the eventual multi-provider model. Current binding is one per variant and constrained to Bite; it is not yet a general supplier registry. Stable provider+external ID identity, independent source snapshot and last sync/error timestamps, enabled flag, priority and explicit manual selection are required. Never auto-switch supplier after an ambiguous paid purchase.
3. Catalog availability/cost control: source snapshot expiry, stock checks, quote at intended quantity, minimum margin/maximum acceptable cost in normalized VND, and operator review for major changes. Never use CMS demo_stock or max_pending as real source inventory. API request has no maxPrice, so a precheck alone cannot guarantee source price lock. Failed/removed offers should stop new purchases, without deleting public CMS content or historic mappings.
4. Provider order lifecycle: persisted unique idempotency key before POST, immutable request body, source orderId/cost/status, GET-order polling for processing/pending, recovery using the same idempotency identity, capped backoff for429, explicit failed/refund review. Recent transactions are supplementary evidence, not the only durable ledger.
5. Text/link/key/file customer delivery via existing protected encryption/ownership path. Worker fetches files with private credentials; own order proof required. Pending orders show waiting, not delivered. Match provider order/product/quantity before releasing secrets.
6. Owner wallet/transactions view: low-balance/invalid-key/cost-change warnings, cost/profit reconciliation. Amounts/currencies/rates and source-point refunds stay distinct from payOS/VND customer receipts and refunds.
7. Optional invoice/branding later. Hubby sells VND, but source invoice client_price is USD. Prefer Hubby's own VND order receipt initially; provider invoice image is not automatically a compliant tax invoice. No reason to prioritize upstream branding over correct fulfillment.

## Information model to prepare

| Layer | Data needed |
| --- | --- |
| Supplier connection, private | Provider ID/name, trusted base URL, server secret binding name, wallet currencies/balances, key policy capabilities, sync state, last error/time; no key in CMS/product JSON. |
| Source offer, private | Provider+product ID, source name/description/category, plan/term/region/eligibility where actually supplied, unit/quantity prices and currency, normal price/promotions, actual stock/inStock, delivery mode/format, source image identity, snapshot timestamp, raw validated source snapshot. Exact property mapping awaits authenticated output. |
| Hubby public product/variant | Keep existing IDs/slug/name/category/description/features/term/priceVnd/terms/media. Add stable internal SKU if needed, explicit delivery method and eligibility/instructions. Owner chooses selling price, warranty/support; source snapshots cannot overwrite them. |
| Mapping/operating rules | Hubby variant to exact source offer, correct product type/term/account method, enable/priority, purchase quantity semantics, margin/cost ceiling and VND conversion policy, failure/manual handling. |
| Supplier order, private | Hubby order/item/unit, frozen offer, durable idempotency key, request snapshot, source order ID/status/cost/currency, paid/debited/refunded observations, encrypted result or protected file ref, attempt/sync timestamps and redacted error code; audit manual decisions. |

Existing Owner catalog already identifies six products/seven variants and commercial terms in docs/CATALOG_V3.md. Reuse those and current CMS edits. Do not ask Owner to re-enter everything. An email invitation SKU cannot be inferred compatible with a delivered-account SKU; Canva Edu must not be silently mapped to Canva Pro just because duration matches. The order API schema has no activation-email input; own-account/email-invite products need confirmed fulfillment instructions or manual handling rather than collecting/transmitting undeclared customer credentials.

## Historical code gaps (initial API review; superseded by subsequent implementation)

- app/server/bite.server.ts only purchases quantity1 and accepts a single deliveredKeys string; no Idempotency-Key, explicit ok/status validation, durable orderId, pending polling, GET products/balance/transactions/file/image or webhook adapter. Current source comment about no idempotency/lookup is incorrect.
- supplier_jobs snapshots external ID and a one-shot claim, but does not store source orderId/status/cost or dedicated idempotency identity. Encrypted preview prefix is not a durable structured provider order ledger.
- Source page is manual mapping and reconciliation, not a searchable Bite catalog. Existing one-source binding must be generalized for multi-provider requirements.
- Product availability still reads CMS variant.stock in app/routes/product.tsx, not a live source projection. Keep stored CMS data but replace public availability derivation when implementing source inventory.
- Current flags/deployment do not prove a complete or verified integration. Fix these contract gaps before declaring normal live operation supported. This review does not change activation flags or existing data.

## Updated implementation / content state — 02/11/2026

Later editorial update: all 166 saved source descriptions were rewritten as finished Vietnamese copy, with product context, suitable use, exact offer details and usage restrictions. One API-test item remains explicitly non-commercial. Original source text and internal review states remain private. No offer is automatically mapped or published. The saved customer copy contains no Bite attribution or editorial uncertainty boilerplate; unknown conflicting facts are omitted, while known restrictions remain. Desktop notifications now require browser permission and an open admin page; background timers may be throttled. In-app badge/inbox persists independently of notification permission. See docs/content/bite-product-descriptions.vi.json for guarded expected/new content.

The section above records the *initial* review, not the present Worker. Subsequent code adds supplier catalog search/pagination, price and stock snapshots, change inbox, persisted source order identifiers, idempotent purchase submission, bounded polling and protected delivery. The active storefront remains React Router on Cloudflare Workers; the experimental WordPress code has not replaced it. A connected read-only database review found **166 saved Vietnamese supplier-description drafts** (126 awaiting commercial verification, 40 flagged for additional review, zero marked ready) and **418 recorded source-change entries**. These figures are snapshots, not guarantees of today's stock.

Every draft remains private to the source catalog. Product rights, account type, region, duration, activation method and warranty must be checked against the actual offer before the Owner marks a description ready or maps it to a Hubby sale variant; mismatches such as Canva Edu vs Canva Pro cannot be inferred away. No draft is automatically published as a Hubby product, and no selling price or existing CMS content is overwritten.

The Worker periodically checks the Bite catalog (scheduled approximately every five minutes). The Owner's source-change inbox/badge shows recorded changes when CMS is opened; while a CMS tab is visible, the interface refreshes roughly once a minute. This is **in-app notification**, including changes from when the tab was closed; email, phone push and off-browser immediate alerts are not implemented. Successful scheduled refreshes, commercial mappings, real purchase/delivery and payOS callbacks are not established by the presence of code/configuration alone; the Owner requested no test run.

## Inputs still needed, without inventing extra provider docs

Privately configured Bite key and successful READ-ONLY outputs of products, balance, transactions and an existing order are needed to map real JSON, actual currencies/points and statuses. No purchase is necessary to inspect catalog/wallet/history; existing-order data should be minimized and kept private. Owner only chooses eligible offers, selling-price strategy (keep existing prices by default), margin/tỷ giá policy and whether to offer manual/file products. Other unknowns can remain disabled or manually handled until their actual data/contract is available; do not demand an unlimited API document the provider has not supplied.
