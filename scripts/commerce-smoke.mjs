import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const base = new URL(process.env.HUBBY_SMOKE_URL ?? "http://127.0.0.1:5174");
assert.ok(
  base.protocol === "http:" &&
    ["127.0.0.1", "localhost"].includes(base.hostname),
  "Local only",
);
function client() {
  const jar = new Map();
  return {
    jar,
    async fetch(path, options = {}) {
      const response = await fetch(new URL(path, base), {
        redirect: "manual",
        ...options,
        headers: {
          Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "),
          ...options.headers,
        },
      });
      for (const cookie of response.headers.getSetCookie()) {
        const [pair] = cookie.split(";");
        const index = pair.indexOf("=");
        jar.set(pair.slice(0, index), pair.slice(index + 1));
      }
      return response;
    },
    async init() {
      assert.equal((await this.fetch("/admin-demo/operations")).status, 200);
    },
    async command(command) {
      return this.fetch("/local-api", {
        method: "POST",
        headers: { Origin: base.origin },
        body: new URLSearchParams({
          csrf: jar.get("hubby-local-csrf"),
          command: JSON.stringify(command),
        }),
      });
    },
  };
}
const operator = client();
await operator.init();
const initial = await (await operator.command({ action: "ops" })).json();
assert.equal(
  initial.stock.find((v) => v.variantId === "canva-12").available,
  0,
  "Use untouched zero-stock variant; do not reset or delete existing sandbox data",
);
assert.equal(
  (
    await operator.command({
      action: "import",
      variantId: "canva-12",
      quantity: 1,
    })
  ).status,
  200,
);
const contenders = Array.from({ length: 20 }, client);
await Promise.all(contenders.map((c) => c.init()));
const requests = contenders.map(() => ({
  action: "checkout",
  key: randomUUID(),
  lines: [{ variantId: "canva-12", quantity: 1 }],
  coupon: "",
  expectedTotal: 699000,
}));
const responses = await Promise.all(
  contenders.map((c, n) => c.command(requests[n])),
);
assert.equal(
  responses.filter((r) => r.status === 200).length,
  1,
  "20 concurrent requests / 1 unit -> exactly 1 winner",
);
assert.equal(responses.filter((r) => r.status === 409).length, 19);
const index = responses.findIndex((r) => r.status === 200),
  winner = contenders[index];
const order = await responses[index].json();
assert.equal((await winner.command(requests[index])).status, 200);
const other = contenders[(index + 1) % 20];
assert.equal(
  (await other.command({ action: "get", id: order.id })).status,
  404,
);
assert.equal(
  (
    await other.command({
      action: "reveal",
      id: order.id,
      unitId: order.items[0].unitIds[0],
    })
  ).status,
  404,
);
assert.equal(
  (
    await winner.command({
      action: "reveal",
      id: order.id,
      unitId: order.items[0].unitIds[0],
    })
  ).status,
  403,
);
const wrong = await (
  await winner.command({
    action: "pay",
    id: order.id,
    scenario: "wrong_account",
  })
).json();
assert.equal(wrong.outcome, "rejected");
assert.equal(wrong.order.state, "pending_payment");
const key = randomUUID();
const pay = { action: "pay", id: order.id, scenario: "deferred", key };
const observations = await Promise.all(
  Array.from({ length: 20 }, () => winner.command(pay)),
);
assert.ok(observations.every((r) => r.status === 200));
const paid = await (
  await winner.command({ action: "get", id: order.id })
).json();
assert.equal(paid.order.state, "paid");
const retry = await winner.command({ action: "retry", id: order.id });
assert.equal(retry.status, 200);
const get = await winner.command({ action: "get", id: order.id });
const redacted = await get.text();
assert.ok(
  !redacted.includes("DEMO-ONLY") &&
    !redacted.includes("ciphertext") &&
    !redacted.includes("nonce"),
);
assert.equal(
  (await winner.command({ action: "retry", id: order.id })).status,
  200,
);
const reveal = await (
  await winner.command({
    action: "reveal",
    id: order.id,
    unitId: order.items[0].unitIds[0],
  })
).json();
assert.match(reveal.payload, /DEMO-ONLY/);
assert.equal(
  (
    await winner.command({
      action: "ticket",
      id: order.id,
      subject: "Smoke test ticket",
      text: "Synthetic question only; no credentials.",
    })
  ).status,
  200,
);
const withTicket = await (
  await winner.command({ action: "get", id: order.id })
).json();
const ticket = withTicket.tickets.at(-1);
assert.equal(
  (
    await operator.command({
      action: "reply",
      id: ticket.id,
      text: "Synthetic support response.",
      close: true,
    })
  ).status,
  200,
);
const answered = await (
  await winner.command({ action: "get", id: order.id })
).json();
assert.equal(answered.tickets.at(-1).state, "closed");
const before = await (await operator.command({ action: "ops" })).json();
const assigned = before.stock.find((v) => v.variantId === "canva-12").assigned;
await winner.command({ action: "resend", id: order.id });
const after = await (await operator.command({ action: "ops" })).json();
assert.equal(
  after.stock.find((v) => v.variantId === "canva-12").assigned,
  assigned,
);
assert.equal(after.jobs.filter((j) => j.orderId === order.id).length, 1);
assert.equal(
  (await winner.command({ action: "refund", id: order.id, key: randomUUID() }))
    .status,
  200,
);
assert.equal(
  (
    await winner.command({
      action: "reveal",
      id: order.id,
      unitId: order.items[0].unitIds[0],
    })
  ).status,
  403,
);
assert.equal((await other.fetch(`/don-hang/${order.id}`)).status, 404);
const activity = await (await other.fetch("/activity")).json();
assert.ok(
  activity.events.every((event) => event.kind !== "purchase"),
  "Mock payment/refund must never appear as a real sale",
);
const final = await (await operator.command({ action: "ops" })).json();
assert.equal(final.stock.find((v) => v.variantId === "canva-12").available, 0);
console.log(
  "PASS: actual Workers SQLite transaction: 20 concurrent checkouts / one stock, checkout replay, cross-session404, before-paid reveal403, invalid payment, 20 payment replays / one job, deferred retry, redacted reads, authorized reveal, ticket/reply, resend/no extra stock, refund/reveal403. Test records retained; no real service calls.",
);
