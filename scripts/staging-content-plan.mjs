import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { validateContent } from "../app/content/schema.ts";
import { initialStagingImportSql } from "../app/server/staging-import-plan.ts";

// Read-only against the retained Owner preview. Generates a PUBLIC CONTENT
// artifact only, no drafts/orders/feedback/stock/credentials or cloud writes.
const base = new URL("http://127.0.0.1:5174");
const cookies = new Map();
const home = await fetch(base, { signal: AbortSignal.timeout(15000) });
assert.equal(home.status, 200);
for (const raw of home.headers.getSetCookie()) {
  const pair = raw.split(";")[0];
  const at = pair.indexOf("=");
  cookies.set(pair.slice(0, at), pair.slice(at + 1));
}
const response = await fetch(new URL("/local-api", base), {
  method: "POST",
  headers: {
    Origin: base.origin,
    Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; "),
  },
  body: new URLSearchParams({
    csrf: cookies.get("hubby-local-csrf"),
    command: JSON.stringify({ action: "catalog" }),
  }),
  signal: AbortSignal.timeout(15000),
});
assert.equal(response.status, 200);
const content = validateContent(await response.json());
const hash = createHash("sha256").update(JSON.stringify(content)).digest("hex");
const sql = initialStagingImportSql(content);
const directory = new URL(
  "../.wrangler/staging-content-plan/",
  import.meta.url,
);
await mkdir(directory, { recursive: true });
await writeFile(
  new URL("public-content.json", directory),
  JSON.stringify(content),
);
await writeFile(new URL("initial-import.sql", directory), sql);
console.log(
  JSON.stringify(
    {
      scope: "published-content-plan-only",
      sourceRevision: content.revision,
      sha256: hash,
      products: content.products.length,
      variants: content.products.flatMap((p) => p.variants).length,
      unpriced: content.products
        .flatMap((p) => p.variants)
        .filter((v) => v.priceConfigured === false).length,
      publicReviews: content.experience?.reviews.length ?? 0,
      cloudWritten: false,
    },
    null,
    2,
  ),
);
