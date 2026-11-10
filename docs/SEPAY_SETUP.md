# SePay / TPBank — release checklist

Owner connected TPBank through SePay API Banking on 12/10/2026. Connection success was verified in the official Dashboard. No balance or transaction history was read. Free plan remained selected; no webhook existed. No bank identifiers or credentials are stored in this document.

## Implemented and verified

- `app/server/sepay-webhook.server.ts`: Workers Web Crypto HMAC-SHA256 verification using original bytes and documented timestamp prefix, five-minute freshness check, actual streamed 16 KiB limit, JSON validation and pinned TPBank receiving account.
- Incoming direction, exact persisted order reference/amount/state/expiry are required for eligibility. Eligibility is **not** settlement, acknowledgement, paid status or stock release.
- Seven provider-network-free tests cover tampering, secret mismatch, replay, incorrect account/gateway, malformed payload, oversized input and mismatched/expired orders.
- Private payment table has unique `(provider, provider_transaction)`. No public settlement API exists yet; database uniqueness alone is not a completed webhook pipeline.

## Still required before enabling the webhook

1. Codex: durable verified receipt + atomic order settlement, mismatch reconciliation, inventory reservation, encrypted delivery/outbox and retry recovery. Prove concurrent duplicate delivery cannot release multiple units.
2. Codex: separate test/live endpoints and trusted configuration; provider bank-transfer payload has no currency or trustworthy test flag. Never infer live money from a manually sent test webhook.
3. Owner: privately enter the webhook secret in SePay and the server secret store when the ready endpoint is available. Never send it through chat or commit it. Use **HMAC-SHA256**, **JSON**, **incoming transfers**, specific TPBank account, **retry enabled**. Do not select unauthenticated mode.
4. Codex + Owner: send a provider test event first; only return `200 {"success":true}` after durable receipt. Never acknowledge a verified body that was not persisted. Then Owner alone performs any approved small live transfer; Codex checks reconciliation without creating transfers.
5. Owner: verify lawful sourcing/Canva Education eligibility, actual stock/activation workflow, email destination/domain and provider fees. Canva price is 49,000 VND per explicit Owner instruction; other six variants remain unpriced. A price is not stock or permission to fabricate an invitation.

SePay Free includes 50 transactions/month but allows billed overage; no additional charge was authorized. Clarify overage control before live enablement.

Official references checked 12/10/2026:

- [HMAC headers and signed raw bytes](https://developer.sepay.vn/vi/sepay-webhooks/xac-thuc)
- [Payload, acknowledgement and retries](https://docs.sepay.vn/tich-hop-webhooks.html)
- [Current plan limits](https://sepay.vn/bang-gia.html)
