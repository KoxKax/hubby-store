import assert from "node:assert/strict";

const base = new URL("http://127.0.0.1:5176");
const jar = new Map();
async function send(path, options = {}) {
  const response = await fetch(new URL(path, base), {
    redirect: "manual",
    ...options,
    headers: {
      Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "),
      ...options.headers,
    },
    signal: AbortSignal.timeout(20000),
  });
  for (const raw of response.headers.getSetCookie()) {
    const pair = raw.split(";")[0],
      at = pair.indexOf("=");
    jar.set(pair.slice(0, at), pair.slice(at + 1));
  }
  return response;
}
const home = await send("/");
assert.equal(home.status, 200);
assert.match(home.headers.get("Cache-Control"), /no-store/);
const html = await home.text();
for (const product of [
  "Canva Edu",
  "Microsoft Office 365",
  "CapCut Pro",
  "Netflix",
  "Duolingo",
  "Google AI Pro",
])
  assert.ok(html.includes(product));
assert.ok(
  html.includes("staging-import-1"),
  "SSR must use actual staged CMS, not historical fixtures",
);
assert.ok(!/sb_secret_|service_role|ciphertext/.test(html));
for (const path of [
  "/dang-nhap",
  "/dang-ky",
  "/gio-hang",
  "/san-pham/canva",
  "/tra-don-hang",
  "/tai-khoan",
])
  assert.equal((await send(path)).status, 200, path);
for (const path of ["/admin"]) {
  const response = await send(path);
  assert.equal(response.status, 302, path);
  assert.ok(response.headers.get("Location").startsWith("/dang-nhap"));
}
assert.equal((await send("/admin-demo")).status, 404);
assert.equal((await send("/admin-demo/operations")).status, 503);
const local = await send("/local-api", {
  method: "POST",
  headers: { Origin: base.origin },
  body: new URLSearchParams({
    csrf: jar.get("hubby-local-csrf"),
    command: JSON.stringify({ action: "ops" }),
  }),
});
assert.equal(
  local.status,
  503,
  "Staging must not authorize the local simulator",
);
assert.equal((await send("/dang-xuat")).status, 405);
const transportSignup = await send("/dang-ky.data", {
  method: "POST",
  headers: { Origin: base.origin },
  body: new URLSearchParams({
    csrf: jar.get("hubby-local-csrf"),
    email: "qa@example.test",
    password: "short",
    name: "QA",
  }),
});
assert.equal(transportSignup.status, 400);
const signupResult = await transportSignup.text();
assert.ok(
  signupResult.includes("12–128"),
  "Single Fetch signup must run signup validation, not password login",
);
assert.ok(!signupResult.includes("Email hoặc mật khẩu chưa đúng"));
console.log(
  "PASS: staging Workers SSR reads six CMS entries; admin redirects to login, public account page renders without a session, local CMS/operations/API disabled, no live-payment/Auth account mutation. Signed-in Auth/MFA UAT pending.",
);
