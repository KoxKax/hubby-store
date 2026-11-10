# Hubby — free custom domain

Completed 12/10/2026: https://hubby.dpdns.org is registered in the Owner's DigitalPlat account using one free slot and connected to the existing Cloudflare Worker `hubby`. No subscription/credit purchase, paid plan or new hosting provider.

- Owner accepted DigitalPlat applicable terms and personally completed GitHub verification. No OAuth grant automated, identity document requested, API key created or credentials copied.
- Cloudflare zone uses Free plan. Authoritative delegation verified through public DNS: `ganz.ns.cloudflare.com`, `maria.ns.cloudflare.com`. Custom Domain added through Cloudflare Dashboard; HTTPS home200 and CMS six-product content verified.
- WHOIS privacy enabled and verified in DigitalPlat. Current expiration12/10/2027; Dashboard says free renewal within120 days before expiry, early renewal uses credits. “Permanent” UI label is not a permanence guarantee; provider terms are best-effort and allow namespace loss. Keep the original URL as a separate backup.
- Original URL remains https://hubby.kienhoang1919.workers.dev, without forcing redirects into the free domain. Runtime `SITE_ALIAS` accepts only the exact configured HTTPS origin, with separate host cookies and unchanged CSRF/Owner guards. Do not trust forwarded hostname or any `*.dpdns.org` tenant.
- Source `wrangler.hosted.jsonc` declares the verified custom route/zone for future deployments. Current runtime version `8be8dfd3-58dc-4380-951d-1d9b968fc19f`; alias deployed first, custom-domain attachment then applied through Dashboard. Final source artifact with route passed dry-run; no second real deployment needed. Never deploy default simulator config. Missing future route permissions must be explicitly resolved, not silently broadened.

## Verification

195 tests/17 files pass, lint142 files pass, TypeScript/route/Worker types pass, hosted build passes/client282 modules, artifact preflight accepted/productionReady=false, explicit-config deploy dry-run passes. Public HTTP on **both** origins200; new domain sign-in200, admin/support302 to sign-in, checkout200 explicitly closed, cross-origin feedback403. Browser homepage and Cloudflare custom-domain table verified. Screenshot: artifacts/domain-setup/hubby-custom-domain.png.

No paid orders, fixture fulfillment, customer submissions or Auth account changes created by these checks. Single `npm run check`, normal preview smoke and signed-in/new-domain purchase UAT not rerun. Supabase provider callback URL settings remain a separate release gate; displaying the password-login page is not proof of Google/signup/recovery callback configuration. No redirect wildcard, MFA weakening or data migration.

Owner: renew within the displayed free window, retain service notices, privately complete future provider callback/security setup if needed. Domain-only task is complete; paid checkout/SePay settlement/actual delivery/email and other release gates in IMPLEMENTATION_PLAN.md are unchanged.

Codex: preserve both routes and origin boundaries on updates; investigate failure on free domain using workers.dev backup before changing providers or purchasing services.

[Provider terms](https://domain.digitalplat.org/terms-of-service/)
[Cloudflare Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
