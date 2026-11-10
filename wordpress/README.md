# Hubby WordPress workspace

Local development using official WordPress Playground CLI, pinned to CLI 3.1.61, WordPress 7.1.4, WooCommerce 11.2.1 and PHP 8.3. Versions observed from the official WordPress update APIs on 01/11/2026. This is not a production deployment or a verified compatibility claim.

Run `npm ci`, then `npm start` from this directory. Local URL: http://127.0.0.1:9400/wp-admin/ . CLI auto-login is a local development account only, not the public site's Owner. The launcher restricts listeners to IPv4 loopback. Stop with Ctrl+C.

WordPress and SQLite state persist in ignored `.runtime/site/`. Dependencies use this directory's own package-lock. Nothing reads the existing Worker secret store or `.dev.vars.staging`. Do not add provider credentials, customer exports or real delivery secrets here.

The separately mounted `local-mu-plugins` disables purchase, all WordPress outbound HTTP and email. It is not part of a future production plugin/theme package. Disabling networking means updates and provider/catalog sync will not work in this workspace; CLI installs the pinned WooCommerce ZIP during initial boot.

Production requires a separate PHP/MySQL or MariaDB host, HTTPS, background-job scheduling and backups. This SQLite/WASM runtime is for development; do not copy its auto-login or database into public hosting as an accepted production setup. Six products/seven variants from published revision db-3 have been imported into this isolated local site. The original public site and unpublished Supabase draft remain unchanged; the draft and Auth identities have not been migrated.

Theme `themes/hubby` and plugin `plugins/hubby-suppliers` are distributable source. The plugin provides source mapping, native WordPress FAQ/banner editors and a local-only one-time importer, plus the guarded fulfillment modules described below. Existing generic WooCommerce catalog/cart/account/order screens are retained. A payOS 1.0.77 upstream ZIP has been downloaded privately for review, not installed or activated; source review does not certify live acceptance.

Commands: `npm run sync:local` copies only the owned source folders into the isolated runtime; `npm run lint:php` parses PHP syntax without executing WordPress or tests. `scripts/package.ps1` creates theme/plugin ZIPs in ignored `dist/`, excluding local guards, snapshots, database and credentials. Source WordPress/WooCommerce code is installed from official distribution URLs, not copied into Git.

Plugin 0.2.0 additionally implements durable per-unit purchase intents, a bounded Action Scheduler pass, an upstream-payOS webhook evidence guard, encrypted response/delivery storage, POST-only delivery reveal, and reconciliation screens. These are source implementations, not production acceptance. Bite's registry `purchase_ready` remains false. The sample parser expects a direct `deliveredKeys` array from the public documentation and deliberately holds any other response for review; it has not been confirmed against an authenticated provider response. Worker purchases remain disabled in local even if flags are changed.

The v2 queue/receipt schema is installed in the isolated SQLite runtime, with unique order-unit, provider-reference and accepted-order indexes observed and no job/event rows. This is schema metadata, not a financial/concurrency test or a MySQL acceptance result. `npm run export:woocommerce` generates a one-time native CSV and manifest from the existing published snapshot; it does not publish the old draft or import customer data.

Remaining: verify supplier schema/recovery/cost policy and concurrency on real hosting, upstream payOS integration acceptance, WooCommerce account/support/saved-list parity, production content/media/draft/identity migration, hosting, cutover and operational acceptance. See ../docs/WOOCOMMERCE_MIGRATION.md and ../docs/WORDPRESS_HOSTING_HANDOFF.md. Nothing here is a statement of completion or production readiness.
