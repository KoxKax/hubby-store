import assert from "node:assert/strict";
import { access, readFile, writeFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { validateContent } from "../app/content/schema.ts";

// Explicit QA5184 only. Read the public catalog; never seed or publish remotely.
assert.ok(process.argv.includes("--confirm-isolated"));
const mode = process.argv[2];
assert.ok(["apply", "restore"].includes(mode));
const base = "http://127.0.0.1:5184";
const record = new URL("../.wrangler/ux-preview-catalog.json", import.meta.url);
const jar = new Map();
async function request(path, options = {}) {
  const response = await fetch(`${base}${path}`, {
    redirect: "manual",
    ...options,
    headers: {
      Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "),
      ...options.headers,
    },
  });
  for (const raw of response.headers.getSetCookie()) {
    const [pair] = raw.split(";");
    const at = pair.indexOf("=");
    jar.set(pair.slice(0, at), pair.slice(at + 1));
  }
  return response;
}
async function command(value) {
  const response = await request(
    ["cms_save", "cms_publish", "cms_restore"].includes(value.action)
      ? "/admin-demo"
      : "/local-api",
    {
      method: "POST",
      headers: { Origin: base },
      body: new URLSearchParams({
        csrf: jar.get("hubby-local-csrf"),
        command: JSON.stringify(value),
      }),
    },
  );
  assert.equal(response.status, 200, `QA command ${value.action}`);
  return value.action === "cms_get" ? response.json() : { ok: true };
}
assert.equal((await request("/admin-demo")).status, 200);
const workspace = await command({ action: "cms_get" });
if (mode === "apply") {
  const present = await access(record).then(
    () => true,
    () => false,
  );
  const previous = present ? JSON.parse(await readFile(record, "utf8")) : null;
  assert.ok(
    !present || previous.restored === true,
    "Restore the previous QA catalog first",
  );
  const env = parseEnv(
    await readFile(new URL("../.dev.vars.staging", import.meta.url), "utf8"),
  );
  assert.equal(
    new URL(env.SUPABASE_URL).hostname,
    "toienefhdorkcexyfnst.supabase.co",
  );
  const response = await fetch(
    `${env.SUPABASE_URL}/rest/v1/rpc/published_storefront`,
    {
      method: "POST",
      headers: {
        apikey: env.SUPABASE_PUBLISHABLE_KEY,
        "Content-Type": "application/json",
      },
      body: "{}",
      signal: AbortSignal.timeout(15000),
    },
  );
  assert.equal(response.status, 200);
  const snapshot = validateContent(await response.json());
  // Write the recovery pointer before creating a QA revision.
  await writeFile(
    record,
    JSON.stringify({ publishedId: workspace.publishedId }),
  );
  await command({
    action: "cms_save",
    version: workspace.headVersion,
    snapshot,
  });
  const saved = await command({ action: "cms_get" });
  await command({
    action: "cms_publish",
    version: saved.headVersion,
    id: saved.revisions.at(-1).id,
  });
  console.log(
    `PASS: public ${snapshot.products.length}-product catalog copied only to isolated QA5184.`,
  );
} else {
  const original = JSON.parse(await readFile(record, "utf8"));
  await command({
    action: "cms_restore",
    version: workspace.headVersion,
    id: original.publishedId,
  });
  const restored = await command({ action: "cms_get" });
  await command({
    action: "cms_publish",
    version: restored.headVersion,
    id: restored.revisions.at(-1).id,
  });
  // Keep this recovery record as evidence rather than deleting files.
  await writeFile(record, JSON.stringify({ ...original, restored: true }));
  console.log(
    "PASS: isolated QA5184 original catalog restored as a new revision; history retained.",
  );
}
