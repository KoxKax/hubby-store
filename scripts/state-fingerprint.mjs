import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const base = new URL("http://127.0.0.1:5174");
const initial = await fetch(new URL("/admin-demo/operations", base));
assert.equal(initial.status, 200);
const jar = new Map(
  initial.headers.getSetCookie().map((raw) => {
    const pair = raw.split(";")[0],
      i = pair.indexOf("=");
    return [pair.slice(0, i), pair.slice(i + 1)];
  }),
);
const response = await fetch(new URL("/local-api", base), {
  method: "POST",
  headers: {
    Origin: base.origin,
    Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "),
  },
  body: new URLSearchParams({
    csrf: jar.get("hubby-local-csrf"),
    command: JSON.stringify({ action: "ops" }),
  }),
});
assert.equal(response.status, 200);
const state = await response.json();
const fingerprint = createHash("sha256")
  .update(
    JSON.stringify({
      orders: state.orders,
      stock: state.stock,
      payments: state.payments,
      jobs: state.jobs,
      tickets: state.tickets,
      audit: state.audit,
      enabled: state.checkoutEnabled,
    }),
  )
  .digest("hex");
console.log(
  JSON.stringify({
    fingerprint,
    orders: state.orders.length,
    payments: state.payments.length,
    tickets: state.tickets.length,
  }),
);
