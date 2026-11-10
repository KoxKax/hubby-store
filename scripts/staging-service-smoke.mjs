import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { validateContent } from "../app/content/schema.ts";
import { dataConfig } from "../app/server/config.server.ts";

// Explicit opt-in only: npm test never contacts a provider. Uses only the
// publishable key and anonymous actor; no signup, seed, tokens or Owner bypass.
assert.ok(
  process.argv.includes("--confirm-staging"),
  "Explicit staging opt-in required",
);
const env = parseEnv(
  readFileSync(new URL("../.dev.vars.staging", import.meta.url), "utf8"),
);
const config = dataConfig(env);
assert.ok(
  config && ["local", "staging"].includes(env.APP_ENV),
  "Staging config required",
);
assert.match(env.HUBBY_STAGING_PROJECT_REF ?? "", /^[a-z]{20}$/);
assert.equal(
  new URL(config.url).hostname,
  `${env.HUBBY_STAGING_PROJECT_REF}.supabase.co`,
);
const headers = { apikey: config.key, "Content-Type": "application/json" };
async function rpc(name, body = {}) {
  return fetch(`${config.url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
}
async function denied(response, label) {
  assert.ok(
    [401, 403].includes(response.status),
    `${label} must deny anonymous access`,
  );
  await response.body?.cancel();
}
const published = await rpc("published_storefront");
assert.equal(published.status, 200, "Published projection must be callable");
const content = await published.json();
if (content !== null) {
  const validated = validateContent(content);
  const variants = await fetch(
    `${config.url}/rest/v1/product_variants?select=variant_key,price_vnd,price_configured&enabled=eq.true`,
    { headers, signal: AbortSignal.timeout(15000) },
  );
  assert.equal(variants.status, 200);
  const sort = (rows) =>
    rows.sort((a, b) => a.variant_key.localeCompare(b.variant_key));
  assert.deepEqual(
    sort(await variants.json()),
    sort(
      validated.products.flatMap((p) =>
        p.variants.map((v) => ({
          variant_key: v.id,
          price_vnd: v.priceVnd,
          price_configured: v.priceConfigured ?? true,
        })),
      ),
    ),
  );
}
const owner = await rpc("owner_status");
assert.equal(owner.status, 200);
assert.deepEqual(await owner.json(), {
  owner: false,
  aal2: false,
  mfa_required: true,
  password_only_issuer: `${config.url}/auth/v1`,
});
await denied(
  await fetch(`${config.url}/rest/v1/profiles?select=id&limit=1`, {
    headers,
    signal: AbortSignal.timeout(15000),
  }),
  "Profiles",
);
const drafts = await fetch(
  `${config.url}/rest/v1/cms_revisions?select=id&limit=1`,
  { headers, signal: AbortSignal.timeout(15000) },
);
// A denied table grant may respond 401/403; an RLS-filtered empty result is safe.
if (drafts.status === 200) assert.deepEqual(await drafts.json(), []);
else await denied(drafts, "CMS drafts");
await denied(
  await rpc("save_cms_draft", { p_payload: {}, p_expected_version: 0 }),
  "CMS mutation",
);
const privateSchema = await fetch(
  `${config.url}/rest/v1/role_memberships?select=user_id&limit=1`,
  {
    headers: { ...headers, "Accept-Profile": "private" },
    signal: AbortSignal.timeout(15000),
  },
);
assert.equal(
  privateSchema.status,
  406,
  "Private schema must not be exposed to REST",
);
assert.equal((await privateSchema.json()).code, "PGRST106");
const settings = await fetch(`${config.url}/auth/v1/settings`, {
  headers,
  signal: AbortSignal.timeout(15000),
});
assert.equal(settings.status, 200, "Auth service must be reachable");
const auth = await settings.json();
console.log(
  JSON.stringify(
    {
      scope: "anonymous-staging-service-checks",
      productionReady: false,
      checks: {
        publishedProjection: true,
        anonymousNotOwner: true,
        profilesDenied: true,
        draftsPrivate: true,
        cmsMutationDenied: true,
        privateSchemaUnexposed: true,
        authServiceReachable: true,
        publishedSchemaAndPrices: content !== null,
      },
      publishedCatalogPresent: content !== null,
      googleConfigured: auth.external?.google === true,
      emailProviderEnabled: auth.external?.email === true,
      remaining:
        "Owner/Auth/MFA/Storage UAT and full commerce remain pending; this is not a live launch.",
    },
    null,
    2,
  ),
);
