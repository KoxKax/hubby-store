import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const base = new URL(process.env.HUBBY_SMOKE_URL ?? "http://127.0.0.1:5174");
assert.ok(
  base.protocol === "http:" &&
    ["localhost", "127.0.0.1"].includes(base.hostname),
);
function client() {
  const jar = new Map();
  return {
    async send(path, options = {}) {
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
    },
    async post(path, fields) {
      return this.send(path, {
        method: "POST",
        headers: { Origin: base.origin },
        body: new URLSearchParams({
          csrf: jar.get("hubby-local-csrf"),
          ...fields,
        }),
      });
    },
    async command(c) {
      return this.post("/local-api", { command: JSON.stringify(c) });
    },
  };
}
const owner = client(),
  other = client();
await owner.send("/admin-demo/operations");
await other.send("/tra-don-hang");
const initial = await (await owner.command({ action: "ops" })).json();
assert.equal(
  initial.stock.find((s) => s.variantId === "canva-12").available,
  0,
  "Do not reset stock to pass this smoke",
);
assert.equal(
  (
    await owner.command({
      action: "import",
      variantId: "canva-12",
      quantity: 1,
    })
  ).status,
  200,
);
const created = await owner.command({
  action: "checkout",
  key: randomUUID(),
  lines: [{ variantId: "canva-12", quantity: 1 }],
  coupon: "",
  expectedTotal: 699000,
});
assert.equal(created.status, 200);
const order = await created.json();
const fields = {
  code: order.id.slice(0, 8).toUpperCase(),
  email: "demo@buyer.example",
};
const lookup = await owner.post("/tra-don-hang", fields);
assert.equal(lookup.status, 200);
assert.ok((await lookup.text()).includes(`/don-hang/${order.id}`));
for (const [who, input] of [
  [other, fields],
  [owner, { ...fields, email: "wrong@example.com" }],
  [owner, { ...fields, code: "00000000" }],
]) {
  const response = await who.post("/tra-don-hang", input);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.ok(!html.includes(`/don-hang/${order.id}`));
  assert.ok(html.includes("Chưa thể hiển thị đơn"));
}
const message = {
  code: fields.code,
  message: "Synthetic storefront refresh support question.",
};
assert.equal((await other.post("/support-message", message)).status, 404);
const supported = await owner.post("/support-message", message);
assert.equal(supported.status, 200);
assert.equal((await supported.json()).orderId, order.id);
const detail = await (
  await owner.command({ action: "get", id: order.id })
).json();
assert.equal(detail.tickets.length, 1);
assert.equal(detail.tickets[0].messages[0].text, message.message);
assert.equal(
  (
    await owner.command({
      action: "pay",
      id: order.id,
      key: randomUUID(),
      scenario: "exact",
    })
  ).status,
  200,
);
assert.equal(
  (await owner.command({ action: "refund", id: order.id, key: randomUUID() }))
    .status,
  200,
);
for (const [path, location] of [
  ["/san-pham?q=canva", "/?q=canva#san-pham"],
  ["/ho-tro", "/#ho-tro"],
]) {
  const response = await owner.send(path);
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), location);
}
console.log(
  "PASS: owned email/code lookup, generic wrong/cross-session responses, support ticket persisted once, cross-session support denied, legacy redirects. Synthetic history retained, no external messaging or payments.",
);
