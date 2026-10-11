import assert from "node:assert/strict";
import { applyOwnerCatalog } from "../app/content/owner-catalog.ts";

const base = new URL("http://127.0.0.1:5174");
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
    const pair = raw.split(";")[0];
    const at = pair.indexOf("=");
    jar.set(pair.slice(0, at), pair.slice(at + 1));
  }
  return r;
}
async function command(c) {
  const r = await send(c.action === "cms_get" ? "/local-api" : "/admin-demo", {
    method: "POST",
    headers: { Origin: base.origin },
    body: new URLSearchParams({
      csrf: jar.get("hubby-local-csrf"),
      command: JSON.stringify(c),
    }),
  });
  assert.equal(r.status, 200, await r.clone().text());
  return c.action === "cms_get" ? r.json() : {};
}
assert.equal((await send("/admin-demo")).status, 200);
let state = await command({ action: "cms_get" });
const original = state.revisions.find((r) => r.id === state.publishedId);
assert.ok(
  original && state.revisions.length < 30,
  "Need published content and room for immutable revision",
);
const next = applyOwnerCatalog(original.snapshot);
next.shop.searchPlaceholder = "Tìm sản phẩm, gói dịch vụ…";
next.steps = [
  {
    title: "Chọn sản phẩm",
    description: "Xem thời hạn, cách nhận và bảo hành của gói bạn cần.",
  },
  {
    title: "Đặt hàng",
    description:
      "Chọn gói, kiểm tra tổng tiền và điền thông tin kích hoạt nếu cần.",
  },
  {
    title: "Nhận & sử dụng",
    description:
      "Theo dõi đơn hàng để nhận tài khoản hoặc link kích hoạt. Cần giúp thì gửi hỗ trợ từ đơn nhé.",
  },
];
next.support = {
  ...next.support,
  title: "Bạn cần hỗ trợ?",
  description:
    "Gửi yêu cầu từ đơn hàng để Hubby kiểm tra và hỗ trợ đúng gói của bạn.",
};
next.brand.footer =
  "Tài khoản và dịch vụ số. Hỗ trợ từ lúc chọn gói đến khi sử dụng.";
console.log(
  next.products
    .map((p) => `${p.name}: ${p.variants.map((v) => v.label).join(" / ")}`)
    .join("\n"),
);
if (process.argv.includes("--apply")) {
  const latest = state.revisions.at(-1);
  if (latest.id !== state.publishedId) {
    assert.deepEqual(
      { ...latest.snapshot, revision: next.revision },
      next,
      "Unpublished Owner draft exists; only resume this exact catalog change",
    );
  } else {
    await command({
      action: "cms_save",
      version: state.headVersion,
      snapshot: next,
    });
  }
  state = await command({ action: "cms_get" });
  await command({
    action: "cms_publish",
    version: state.headVersion,
    id: state.revisions.at(-1).id,
  });
  console.log(
    "Published new immutable local catalog revision. Old orders, stock and CMS history retained.",
  );
}
