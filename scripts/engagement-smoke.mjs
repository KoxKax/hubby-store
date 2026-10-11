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
    async get(path, options = {}) {
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
    async post(path, fields, headers = {}) {
      return this.get(path, {
        method: "POST",
        headers: { Origin: base.origin, ...headers },
        body: new URLSearchParams({
          csrf: jar.get("hubby-local-csrf"),
          ...fields,
        }),
      });
    },
    async command(command) {
      return this.post("/local-api", { command: JSON.stringify(command) });
    },
  };
}
const user = client(),
  reader = client();
const home = await user.get("/");
assert.match(await home.text(), /data-theme="dark"/);
await reader.get("/");
const theme = await user.post("/theme", { theme: "light" });
assert.equal(theme.status, 200);
assert.match(theme.headers.get("set-cookie"), /hubby-theme=light;.*HttpOnly/);
assert.match(await (await user.get("/")).text(), /data-theme="light"/);
assert.equal((await user.post("/theme", { theme: "arbitrary" })).status, 400);
assert.equal(
  (await user.post("/theme", { theme: "dark", csrf: "wrong" })).status,
  403,
);
assert.ok(
  [400, 403].includes(
    (
      await user.post(
        "/theme",
        { theme: "dark" },
        { Origin: "https://foreign.example" },
      )
    ).status,
  ),
);
assert.equal((await user.get("/theme")).status, 405);
assert.equal((await user.get("/feedback")).status, 405);

const key = randomUUID(),
  message = `Synthetic QA feedback ${randomUUID()}`;
const fields = { key, category: "idea", message };
for (let i = 0; i < 2; i++)
  assert.equal((await user.post("/feedback", fields)).status, 200);
assert.equal(
  (await user.post("/feedback", { ...fields, key: "not-uuid" })).status,
  400,
);
assert.equal(
  (await user.post("/feedback", { ...fields, key: randomUUID(), message: "x" }))
    .status,
  400,
);
assert.equal(
  (await user.post("/feedback", { ...fields, csrf: "wrong" })).status,
  403,
);
assert.equal(
  (
    await user.post("/feedback", {
      ...fields,
      key: randomUUID(),
      message: "x".repeat(10_000),
    })
  ).status,
  413,
);
const ops = await (await user.command({ action: "ops" })).json();
const saved = ops.feedback.filter((f) => f.message === message);
assert.equal(saved.length, 1, "Retry must not duplicate feedback");
assert.equal(saved[0].state, "new");
assert.equal(
  (
    await user.post("/admin-demo/operations", {
      intent: "feedback_review",
      id: saved[0].id,
    })
  ).status,
  302,
);
assert.equal(
  (await (await user.command({ action: "ops" })).json()).feedback.find(
    (f) => f.id === saved[0].id,
  ).state,
  "reviewed",
);
const variant = ops.stock.find((v) => v.available > 0);
assert.ok(variant, "No stock resets allowed; choose an available fixture");
const eventKey = randomUUID();
const before = (await (await reader.get("/activity")).json()).events;
assert.equal(
  (
    await user.post("/activity", {
      key: eventKey,
      variantId: variant.variantId,
    })
  ).status,
  200,
);
assert.equal(
  (
    await user.post("/activity", {
      key: eventKey,
      variantId: variant.variantId,
    })
  ).status,
  200,
);
const feed = (await (await reader.get("/activity")).json()).events;
assert.equal(feed.filter((e) => !before.some((b) => b.id === e.id)).length, 1);
assert.equal(feed.at(-1).kind, "cart");
assert.ok(feed.at(-1).product && feed.at(-1).variant);
assert.equal(JSON.stringify(feed).includes(message), false);
for (const event of feed)
  assert.deepEqual(
    Object.keys(event).sort(),
    ["id", "kind", "product", "variant", "customer", "at"].sort(),
  );
assert.equal(
  (await user.post("/activity", { key: randomUUID(), variantId: "missing" }))
    .status,
  409,
);
assert.equal(
  (
    await user.command({
      action: "activity_purchase",
      key: randomUUID(),
      variantId: variant.variantId,
    })
  ).status,
  400,
  "Client purchase events must be rejected",
);
const limitUser = client();
await limitUser.get("/");
for (let i = 0; i < 10; i++)
  assert.equal(
    (
      await limitUser.post("/feedback", {
        key: randomUUID(),
        category: "other",
        message: `Synthetic rate-limit QA ${i}`,
      })
    ).status,
    200,
  );
assert.equal(
  (
    await limitUser.post("/feedback", {
      key: randomUUID(),
      category: "other",
      message: "Synthetic overflow QA",
    })
  ).status,
  429,
);
console.log(
  "PASS: SSR theme + persistence/CSRF; bounded feedback + idempotency/admin review; cart feed detail/privacy/dedupe; no client-created sales. Retained local QA feedback, no external service calls.",
);
