import assert from "node:assert/strict";

// Read-only public maintenance verification. Never submit credentials or orders.
for (const base of [
  "https://hubby.dpdns.org",
  "https://hubby.kienhoang1919.workers.dev",
]) {
  for (const path of [
    "/",
    "/san-pham/canva",
    "/san-pham/microsoft-office-365",
    "/san-pham/capcut",
    "/san-pham/netflix",
    "/san-pham/duolingo",
    "/san-pham/google",
    "/gio-hang",
    "/tra-don-hang",
    "/thanh-toan",
    "/tai-khoan",
    "/dang-nhap",
    "/chinh-sach/bao-mat",
    "/chinh-sach/doi-tra",
    "/chinh-sach/dieu-khoan",
  ]) {
    const response = await fetch(`${base}${path}`, {
      redirect: "manual",
      signal: AbortSignal.timeout(20000),
    });
    assert.equal(response.status, 200, `${base}${path}`);
    const html = await response.text();
    assert.doesNotMatch(html, /sb_secret_|service_role"\s*:/);
    if (path === "/") {
      assert.match(html, /Chọn gói phù hợp/);
      assert.match(html, /Canva Edu/);
      assert.match(html, /49\.000/);
      assert.doesNotMatch(
        html,
        /English đang được chuẩn bị|class="slide-controls"|class="reviews-section"/,
      );
      const css = html.match(/href="([^"\s]+\.css)"/)[1];
      const style = await fetch(new URL(css, base));
      assert.equal(style.status, 200);
      assert.match(await style.text(), /wp-product-filters/);
    }
    if (path === "/san-pham/capcut") {
      assert.match(html, /Chưa có giá bán/);
      assert.match(html, /Hỏi về gói này/);
    }
    if (path === "/tra-don-hang") {
      assert.match(html, /Xem lịch sử đơn hàng/);
      assert.doesNotMatch(html, /name="code"|name="email"/);
    }
    if (path === "/thanh-toan") assert.match(html, /chưa nhận đơn trực tuyến/);
  }
  for (const path of ["/admin", "/admin/operations"]) {
    const response = await fetch(`${base}${path}`, { redirect: "manual" });
    assert.equal(response.status, 302);
    assert.match(response.headers.get("location"), /^\/dang-nhap\?next=/);
  }
  assert.equal((await fetch(`${base}/admin-demo`)).status, 404);
  assert.equal((await fetch(`${base}/webhooks/casso`)).status, 405);
  console.log(
    `PASS: ${base}: 15 public pages, updated assets/copy/lookup, closed checkout and protected admin.`,
  );
}
