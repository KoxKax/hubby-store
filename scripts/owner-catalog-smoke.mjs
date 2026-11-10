import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  applyOwnerCatalog,
  ownerProducts,
} from "../app/content/owner-catalog.ts";

const base = new URL(process.env.HUBBY_SMOKE_URL ?? "http://127.0.0.1:5174");
assert.ok(
  base.protocol === "http:" &&
    ["127.0.0.1", "localhost"].includes(base.hostname),
);
const jar = new Map();
async function send(path, options = {}) {
  const r = await fetch(new URL(path, base), {
    redirect: "manual",
    ...options,
    headers: {
      Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "),
      ...options.headers,
    },
  });
  for (const raw of r.headers.getSetCookie()) {
    const pair = raw.split(";")[0],
      at = pair.indexOf("=");
    jar.set(pair.slice(0, at), pair.slice(at + 1));
  }
  return r;
}
function post(path, fields) {
  return send(path, {
    method: "POST",
    headers: { Origin: base.origin },
    body: new URLSearchParams({ csrf: jar.get("hubby-local-csrf"), ...fields }),
  });
}
let original;
async function cms() {
  const response = await post("/local-api", {
    command: JSON.stringify({ action: "cms_get" }),
  });
  assert.equal(response.status, 200);
  return response.json();
}
async function change(command) {
  const response = await post("/admin-demo", {
    command: JSON.stringify(command),
  });
  assert.equal(response.status, 200, await response.clone().text());
}
if (process.argv.includes("--prepare-isolated")) {
  assert.equal(
    base.port,
    "5175",
    "Preparation is only allowed on the separate 5175 test runtime, never the Owner preview",
  );
  assert.equal((await send("/admin-demo")).status, 200);
  const state = await cms();
  original = state.revisions.find((r) => r.id === state.publishedId);
  assert.ok(original && state.revisions.at(-1).id === original.id);
  await change({
    action: "cms_save",
    version: state.headVersion,
    snapshot: applyOwnerCatalog(original.snapshot),
  });
  const saved = await cms();
  await change({
    action: "cms_publish",
    version: saved.headVersion,
    id: saved.revisions.at(-1).id,
  });
}
const home = await send("/");
assert.equal(home.status, 200);
const html = await home.text();
assert.ok(
  html.includes("category-panel") && html.includes("compact-collections"),
);
assert.ok(!html.includes("CANVA · CAPCUT · GOOGLE · NETFLIX"));
assert.ok(!html.includes("chọn tại Hubby."));
assert.ok(!html.includes('class="footer-tagline"'));
for (const p of ownerProducts) {
  assert.ok(html.includes(p.name));
  const detail = await send(`/san-pham/${p.slug}`);
  assert.equal(detail.status, 200);
  const text = await detail.text();
  assert.ok(
    text.includes(p.terms.warranty) && text.includes("Chưa có giá bán"),
  );
  for (const v of p.variants) {
    assert.equal(
      (
        await post("/local-api", {
          command: JSON.stringify({
            action: "checkout",
            key: randomUUID(),
            lines: [{ variantId: v.id, quantity: 1 }],
            coupon: "",
            expectedTotal: 0,
          }),
        })
      ).status,
      409,
    );
    assert.equal(
      (await post("/activity", { key: randomUUID(), variantId: v.id })).status,
      409,
    ); // Unpriced variants cannot create public activity.
  }
}
assert.equal((await send("/review")).status, 405);
const key = randomUUID();
const message = `QA review ${key}: private storage check, not a real customer testimonial.`;
const fields = { key, productId: "canva", rating: "4", message };
assert.equal((await post("/review", fields)).status, 200);
assert.equal((await post("/review", fields)).status, 200);
assert.equal(
  (await post("/review", { ...fields, key: randomUUID(), rating: "6" })).status,
  400,
);
assert.equal(
  (
    await post("/review", {
      ...fields,
      key: randomUUID(),
      productId: "missing",
    })
  ).status,
  400,
);
assert.equal((await post("/review", { ...fields, csrf: "bad" })).status, 403);
const ops = await (
  await post("/local-api", { command: JSON.stringify({ action: "ops" }) })
).json();
assert.equal(
  ops.feedback.filter((f) => f.category === "review" && f.message.includes(key))
    .length,
  1,
);
assert.ok(!(await (await send("/")).text()).includes(message));
const publicFeed = await (await send("/activity")).json();
assert.ok(!JSON.stringify(publicFeed).includes("@gmail.com"));
if (original) {
  const state = await cms();
  await change({
    action: "cms_restore",
    version: state.headVersion,
    id: original.id,
  });
  const restored = await cms();
  await change({
    action: "cms_publish",
    version: restored.headVersion,
    id: restored.revisions.at(-1).id,
  });
}
console.log(
  "PASS: six SKUs/seven unpriced variants, server checkout gate, copy/compact layout, private review dedupe/bounds/CSRF, no public review or fabricated identity. QA review retained privately.",
);
