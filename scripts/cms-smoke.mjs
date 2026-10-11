import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const base = new URL(process.env.HUBBY_SMOKE_URL ?? "http://127.0.0.1:5174");
assert.ok(
  base.protocol === "http:" &&
    ["127.0.0.1", "localhost"].includes(base.hostname),
  "Local only",
);
const jar = new Map();
async function send(path, options = {}) {
  const response = await fetch(new URL(path, base), {
    redirect: "manual",
    ...options,
    headers: {
      Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "),
      ...options.headers,
    },
  });
  for (const raw of response.headers.getSetCookie()) {
    const pair = raw.split(";")[0],
      at = pair.indexOf("=");
    jar.set(pair.slice(0, at), pair.slice(at + 1));
  }
  return response;
}
async function command(c) {
  return send(
    ["cms_save", "cms_publish", "cms_restore"].includes(c.action)
      ? "/admin-demo"
      : "/local-api",
    {
      method: "POST",
      headers: { Origin: base.origin },
      body: new URLSearchParams({
        csrf: jar.get("hubby-local-csrf"),
        command: JSON.stringify(c),
      }),
    },
  );
}
assert.equal((await send("/admin-demo")).status, 200);
const before = await (await command({ action: "cms_get" })).json();
assert.ok(
  before.revisions.length <= 25,
  "Keep room for immutable test revisions; never delete owner history",
);
const published = before.revisions.find((r) => r.id === before.publishedId);
assert.ok(published);
const original = structuredClone(published.snapshot);
const draft = structuredClone(original);
draft.shop.title = `CMS smoke ${randomUUID().slice(0, 8)}`;
if (draft.experience) draft.experience.intro.title = draft.shop.title;
const product = structuredClone(draft.products[0]);
const id = `demo-${randomUUID().slice(0, 8)}`;
Object.assign(product, {
  id,
  slug: id,
  name: "CMS test product",
  monogram: "DEMO",
  variants: [{ id: `${id}-1`, label: "Test plan", priceVnd: 149000, stock: 0 }],
});
delete product.media;
draft.products.push(product);
draft.sections.find((s) => s.kind === "featured").productIds.push(id);
const saves = await Promise.all(
  Array.from({ length: 2 }, () =>
    command({
      action: "cms_save",
      version: before.headVersion,
      snapshot: draft,
    }),
  ),
);
assert.equal(saves.filter((r) => r.status === 200).length, 1);
assert.equal(saves.filter((r) => r.status === 409).length, 1);
assert.ok(
  !(await (await send("/")).text()).includes(draft.shop.title),
  "Draft not public",
);
let saved = await (await command({ action: "cms_get" })).json();
const revision = saved.revisions.at(-1);
assert.equal(
  (
    await command({
      action: "cms_publish",
      version: saved.headVersion,
      id: revision.id,
    })
  ).status,
  200,
);
assert.ok(
  (await (await send("/")).text()).includes(draft.shop.title),
  "Published change appears in server-rendered HTML",
);
assert.equal((await send(`/san-pham/${id}`)).status, 200);
assert.equal(
  (await command({ action: "import", variantId: `${id}-1`, quantity: 1 }))
    .status,
  200,
);
const orderResponse = await command({
  action: "checkout",
  key: randomUUID(),
  lines: [{ variantId: `${id}-1`, quantity: 1 }],
  coupon: "",
  expectedTotal: 149000,
});
assert.equal(orderResponse.status, 200);
const order = await orderResponse.json();
assert.equal(order.items[0].price, 149000);
await command({
  action: "pay",
  id: order.id,
  key: randomUUID(),
  scenario: "exact",
});
await command({ action: "refund", id: order.id, key: randomUUID() });
saved = await (await command({ action: "cms_get" })).json();
assert.equal(
  (
    await command({
      action: "cms_restore",
      version: saved.headVersion,
      id: published.id,
    })
  ).status,
  200,
);
const restored = await (await command({ action: "cms_get" })).json();
assert.equal(restored.headVersion, before.headVersion + 2);
assert.equal(
  (
    await command({
      action: "cms_publish",
      version: restored.headVersion,
      id: restored.revisions.at(-1).id,
    })
  ).status,
  200,
);
assert.ok(!(await (await send("/")).text()).includes(draft.shop.title));
assert.equal((await send(`/san-pham/${id}`)).status, 404);
const historical = await (
  await command({ action: "get", id: order.id })
).json();
assert.equal(historical.order.items[0].price, 149000);
assert.equal(historical.order.items[0].product, "CMS test product");
console.log(
  "PASS: local server CMS CAS (2 saves -> 1 success/1 conflict), draft privacy, publish SSR + new product detail, dynamic catalog checkout/stock, restore-as-new revision/archive and historical order snapshots. Original content restored; test revisions/orders retained.",
);
