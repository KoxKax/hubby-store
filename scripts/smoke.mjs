import assert from "node:assert/strict";

const base = new URL(process.env.HUBBY_SMOKE_URL ?? "http://127.0.0.1:5173");
assert.ok(
  ["127.0.0.1", "localhost"].includes(base.hostname) &&
    base.protocol === "http:",
  "Prototype smoke tests must target a local HTTP server",
);

const home = await fetch(new URL("/", base));
assert.equal(home.status, 200);
assert.match(home.headers.get("cache-control") ?? "", /no-store/);
assert.equal(home.headers.get("x-content-type-options"), "nosniff");
const html = await home.text();
assert.match(html, /lang="vi"/);
assert.match(html, /Hubby/);
assert.match(html, /data-theme="dark"/);
assert.match(html, /welcome-grid/);
assert.equal(
  /demo-ribbon|DEMO COLLECTION|Gói mẫu|MINH HỌA|local-footnote|dock-chat/.test(
    html.split("<script")[0],
  ),
  false,
  "Customer markup must not include repeated demo labels (loader data may retain old CMS copy)",
);
assert.match(html, /noindex, nofollow/);
for (const brand of ["Canva", "CapCut", "Google", "Netflix"])
  assert.match(html, new RegExp(brand));
assert.doesNotMatch(html, /class="hero container"/);

const health = await fetch(new URL("/health", base));
assert.equal(health.status, 200);
assert.deepEqual(await health.json(), {
  status: "ok",
  phase: 2,
  scope: "runtime-only",
  database: "not-configured",
  payments: "not-connected",
  suppliers: "not-connected",
});

const missing = await fetch(new URL("/phase-0-missing-route", base));
assert.equal(missing.status, 404);
assert.match(await missing.text(), /Không tìm thấy trang/);

for (const path of [
  "/san-pham",
  "/san-pham/canva",
  "/danh-muc/ai",
  "/gio-hang",
  "/thanh-toan?variant=capcut-3",
  "/yeu-thich",
  "/ho-tro",
  "/tra-don-hang",
  "/tai-khoan",
  "/dang-nhap",
  "/dang-ky",
  "/quen-mat-khau",
  "/admin-demo",
  "/chinh-sach/bao-mat",
]) {
  const response = await fetch(new URL(path, base));
  assert.equal(response.status, 200, path);
  assert.match(await response.text(), /Hubby|hubby/, path);
}
const absentProduct = await fetch(
  new URL("/san-pham/missing-demo-product", base),
);
assert.equal(absentProduct.status, 404);
const absentCategory = await fetch(
  new URL("/danh-muc/missing-demo-category", base),
);
assert.equal(absentCategory.status, 404);
for (const [path, status] of [
  ["/admin", 503],
  ["/dang-xuat", 405],
  ["/auth/callback", 503],
  ["/media/invalid", 404],
]) {
  const response = await fetch(new URL(path, base), { redirect: "manual" });
  assert.equal(response.status, status, path);
}
const login = await fetch(new URL("/dang-nhap", base));
const csrfCookie = login.headers.get("set-cookie") ?? "";
assert.match(csrfCookie, /hubby-local-csrf=/);
assert.match(csrfCookie, /HttpOnly/);
assert.match(csrfCookie, /SameSite=Lax/i);
const token = /hubby-local-csrf=([^;]+)/.exec(csrfCookie)?.[1];
assert.ok(token);
for (const origin of [base.origin, "https://untrusted.example"]) {
  const blocked = await fetch(new URL("/dang-nhap", base), {
    method: "POST",
    headers: { Origin: origin, Cookie: `hubby-local-csrf=${token}` },
    body: new URLSearchParams({ csrf: token, intent: "google" }),
    redirect: "manual",
  });
  // React Router may reject a foreign Origin before the application's 403 guard.
  assert.ok(
    origin === base.origin
      ? blocked.status === 503
      : [400, 403].includes(blocked.status),
  );
}
console.log(
  "PASS: refreshed Workers SSR home, catalog/support redirects, detail, category redirects, lookup, cart, checkout, favorites, account, policy, health and 404.",
);
