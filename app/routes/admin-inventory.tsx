import { useState } from "react";
import {
  type ActionFunctionArgs,
  data,
  Form,
  Link,
  type LoaderFunctionArgs,
  redirect,
  useActionData,
  useLoaderData,
  useNavigation,
  useSearchParams,
} from "react-router";
import { AdminShell } from "../components/admin-shell";
import { csrfToken, secureForm } from "../server/form-security.server";
import {
  expireUnsubmittedPayosCheckouts,
  payosExpiryGateway,
  payosExpiryReady,
} from "../server/payos-expiry.server";
import {
  payosFulfillmentReady,
  runPayosFulfillment,
} from "../server/payos-fulfillment.server";
import {
  loadPayosStockCounts,
  loadPayosStockUnits,
  payosInventoryGateway,
  payosInventoryReady,
  provisionEncryptedPayosStock,
  quarantinePayosStock,
} from "../server/payos-inventory.server";
import { runtimeContext } from "../server/runtime-context.server";
import type { StockSecret } from "../server/stock-seal.server";
import { requireOwner } from "../server/supabase.server";

export function meta() {
  return [{ title: "Kho hàng — Hubby" }];
}

export function headers() {
  return { "Cache-Control": "no-store" };
}

export async function loader({ request, context, url }: LoaderFunctionArgs) {
  const { client } = await requireOwner(request, context, url);
  const env = context.get(runtimeContext).env;
  const enabled = payosInventoryReady(env);
  if (!enabled)
    return {
      enabled,
      expiryReady: false,
      deliveryReady: false,
      csrf: csrfToken(request, context),
      stockId: crypto.randomUUID(),
      variants: [],
      counts: [],
      stockUnits: [],
    };
  const gateway = payosInventoryGateway(env);
  const [catalog, counts, stockUnits] = await Promise.all([
    client
      .from("product_variants")
      .select("id,variant_key,label")
      .order("variant_key"),
    loadPayosStockCounts(gateway),
    loadPayosStockUnits(gateway),
  ]);
  if (catalog.error)
    throw new Response("Không thể tải danh sách gói.", { status: 503 });
  return {
    enabled,
    expiryReady: payosExpiryReady(env),
    deliveryReady: payosFulfillmentReady(env),
    csrf: csrfToken(request, context),
    stockId: crypto.randomUUID(),
    variants: catalog.data,
    counts,
    stockUnits,
  };
}

export async function action({ request, context, url }: ActionFunctionArgs) {
  const { user } = await requireOwner(request, context, url);
  const env = context.get(runtimeContext).env;
  if (!payosInventoryReady(env))
    return data({ error: "Kho mã hóa chưa được cấu hình." }, { status: 503 });
  const form = await secureForm(request, 12_000);
  const kind = form.get("kind");
  if (kind === "quarantine") {
    try {
      const changed = await quarantinePayosStock(
        {
          stockId: String(form.get("stockId") ?? ""),
          actorId: user.id,
          reason: String(form.get("reason") ?? ""),
        },
        payosInventoryGateway(env),
      );
      if (!changed)
        return data(
          {
            error:
              "Mã này không còn sẵn sàng. Tải lại kho để đối chiếu trước khi xử lý.",
          },
          { status: 409 },
        );
      return redirect("/admin/kho?quarantined=1", { status: 303 });
    } catch {
      return data(
        {
          error:
            "Chưa thể ngừng bán mã này. Tải lại kho để kiểm tra trạng thái trước khi thử lại.",
        },
        { status: 400 },
      );
    }
  }
  if (kind === "retry_delivery") {
    if (!payosFulfillmentReady(env))
      return data(
        { error: "Tác vụ giao hàng chưa được kích hoạt." },
        { status: 503 },
      );
    try {
      const result = await runPayosFulfillment(env);
      if (result.outcome === "disabled") throw Error("Delivery disabled");
      return redirect(`/admin/kho?delivery=${result.outcome}`, { status: 303 });
    } catch {
      return data(
        {
          error:
            "Không xác nhận được kết quả giao hàng. Hãy đối chiếu đơn trước khi thử lại.",
        },
        { status: 503 },
      );
    }
  }
  if (kind === "expire_unsubmitted") {
    if (!payosExpiryReady(env))
      return data(
        { error: "Chưa mở công cụ thu hồi giữ kho." },
        { status: 503 },
      );
    try {
      const released = await expireUnsubmittedPayosCheckouts(
        payosExpiryGateway(env),
      );
      return redirect(`/admin/kho?expired=${released}`, { status: 303 });
    } catch {
      return data(
        {
          error:
            "Chưa xác minh được kết quả thu hồi. Hãy tải lại tồn kho và kiểm tra trước khi thử lại.",
        },
        { status: 503 },
      );
    }
  }
  let secret: StockSecret;
  if (kind === "account")
    secret = {
      type: "account",
      login: String(form.get("login") ?? ""),
      password: String(form.get("password") ?? ""),
    };
  else if (kind === "license_key")
    secret = {
      type: "license_key",
      licenseKey: String(form.get("licenseKey") ?? ""),
    };
  else if (kind === "activation_link")
    secret = {
      type: "activation_link",
      url: String(form.get("activationUrl") ?? ""),
    };
  else return data({ error: "Chọn loại hàng hợp lệ." }, { status: 400 });
  try {
    const key = env.INVENTORY_ENCRYPTION_KEY_V1;
    if (!key) throw new Error("Missing stock encryption key");
    await provisionEncryptedPayosStock(
      {
        stockId: String(form.get("stockId") ?? ""),
        variantId: String(form.get("variantId") ?? ""),
        secret,
      },
      { 1: key },
      payosInventoryGateway(env),
    );
    // Always reload with a fresh one-use ID and discard the credential fields.
    return redirect("/admin/kho?stored=1", { status: 303 });
  } catch {
    // Never serialize the secret, raw RPC response, or encryption failure.
    return data(
      {
        error:
          "Chưa thể lưu hàng. Kiểm tra dữ liệu hoặc tải lại để đối chiếu kho trước khi nhập lại.",
      },
      { status: 400 },
    );
  }
}

export default function AdminInventory() {
  const {
    enabled,
    expiryReady,
    deliveryReady,
    csrf,
    stockId,
    variants,
    counts,
    stockUnits,
  } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const navigation = useNavigation();
  const [params, setParams] = useSearchParams();
  const view = params.get("view") ?? "stock";
  const [filter, setFilter] = useState("");
  const [kind, setKind] = useState<StockSecret["type"]>("license_key");
  const countMap = new Map(counts.map((item) => [item.variantId, item]));
  const variantMap = new Map(variants.map((item) => [item.id, item]));
  return (
    <AdminShell mode="staging" operations section="inventory">
      <p className="wp-breadcrumb">Hubby / Vận hành / Kho hàng</p>
      <h1>Kho hàng</h1>
      <p>
        <Link to="/admin/nguon-hang">
          Xem nguồn Bite và các đơn cần kiểm tra
        </Link>
      </p>
      <p>
        Theo dõi các mã kích hoạt và tài khoản đã nhập kho. Để bảo vệ khách
        hàng, thông tin bí mật sẽ không hiển thị lại sau khi lưu.
      </p>
      {!enabled ? (
        <section className="admin-panel" role="status">
          <h2>Kho hàng chưa sẵn sàng</h2>
          <p>
            Cần hoàn tất cấu hình bảo mật và lưu trữ trước khi sử dụng kho.
            Sản phẩm và đơn hàng hiện có vẫn được giữ nguyên.
          </p>
        </section>
      ) : (
        <>
          {params.get("stored") === "1" && (
            <p className="admin-message" role="status">
              Đã lưu một đơn vị hàng ở dạng mã hóa.
            </p>
          )}
          {params.get("quarantined") === "1" && (
            <p className="admin-message" role="status">
              Đã ngừng bán mã này. Hệ thống sẽ không tự giao mã cho đơn mới.
            </p>
          )}
          {params.has("expired") && (
            <p className="admin-message" role="status">
              Đã kiểm tra giữ kho quá hạn. Số đơn chưa từng gửi yêu cầu thanh
              toán được giải phóng: {Number(params.get("expired")) || 0}.
            </p>
          )}
          {params.get("delivery") === "delivered" && (
            <p className="admin-message" role="status">
              Đã hoàn tất một đơn thanh toán được xác minh và có đủ hàng hợp lệ.
            </p>
          )}
          {params.get("delivery") === "held" && (
            <p className="admin-message" role="status">
              Chưa thể giao đơn đang chờ. Đơn vẫn được giữ để kiểm tra và xử lý
              lại, không lấy thêm mã mới.
            </p>
          )}
          {params.get("delivery") === "idle" && (
            <p className="admin-message" role="status">
              Hiện không có đơn đã thanh toán nào đủ điều kiện xử lý lại.
            </p>
          )}
          {result?.error && (
            <p className="admin-message" role="alert">
              {result.error}
            </p>
          )}
          <nav className="admin-workspace-tabs" aria-label="Chức năng kho">
            {[
              ["stock", "Tồn theo gói"],
              ["units", "Danh sách mã"],
              ["import", "Nhập hàng"],
              ["maintenance", "Xử lý đang chờ"],
            ].map(([id, label]) => (
              <button
                type="button"
                key={id}
                aria-current={view === id ? "page" : undefined}
                onClick={() => {
                  const next = new URLSearchParams(params);
                  next.set("view", id ?? "stock");
                  setParams(next);
                }}
              >
                {label}
              </button>
            ))}
          </nav>
          {(view === "stock" || view === "units") && (
            <label className="admin-stock-filter">
              Lọc theo gói
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="">Tất cả gói</option>
                {variants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.variant_key} · {v.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <section className="admin-panel" hidden={view !== "stock"}>
            <h2>Tồn kho theo gói</h2>
            <div className="wp-table-wrap">
              <table className="wp-table">
                <thead>
                  <tr>
                    <th>Gói</th>
                    <th>Sẵn sàng</th>
                    <th>Đang giữ</th>
                    <th>Đã giao</th>
                    <th>Ngừng bán</th>
                  </tr>
                </thead>
                <tbody>
                  {variants
                    .filter((v) => !filter || v.id === filter)
                    .map((variant) => {
                      const count = countMap.get(variant.id);
                      return (
                        <tr key={variant.id}>
                          <th scope="row">
                            {variant.variant_key} · {variant.label}
                          </th>
                          <td>{count?.available ?? 0}</td>
                          <td>{count?.reserved ?? 0}</td>
                          <td>{count?.delivered ?? 0}</td>
                          <td>{count?.quarantined ?? 0}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </section>
          <section className="admin-panel" hidden={view !== "units"}>
            <h2>Kiểm tra từng mã trong kho</h2>
            <p>
              Hiển thị tối đa 50 mã mới nhất đang sẵn sàng hoặc đã ngừng bán. Chỉ
              thấy mã định danh, không hiển thị tài khoản, mật khẩu hay key.
              Ngừng bán là thao tác không thể tự hoàn tác, dùng khi mã có vấn đề.
              Mã đã giữ cho đơn hoặc đã giao không thể ngừng bán tại đây.
            </p>
            <div className="wp-table-wrap">
              <table className="wp-table">
                <thead>
                  <tr>
                    <th>Mã định danh</th>
                    <th>Gói</th>
                    <th>Trạng thái</th>
                    <th>Xử lý</th>
                  </tr>
                </thead>
                <tbody>
                  {stockUnits
                    .filter((u) => !filter || u.variantId === filter)
                    .map((unit) => (
                      <tr key={unit.id}>
                        <td>
                          <code>{unit.id}</code>
                        </td>
                        <td>
                          {variantMap.get(unit.variantId)?.label ?? "Gói đã ẩn"}
                        </td>
                        <td>
                          {unit.state === "available"
                            ? "Sẵn sàng"
                            : "Đã ngừng bán"}
                        </td>
                        <td>
                          {unit.state === "available" ? (
                            <Form
                              method="post"
                              onSubmit={(event) => {
                                if (
                                  !window.confirm(
                                    "Ngừng bán mã này? Bạn không thể tự đưa mã trở lại kho bán.",
                                  )
                                )
                                  event.preventDefault();
                              }}
                            >
                              <input type="hidden" name="csrf" value={csrf} />
                              <input
                                type="hidden"
                                name="kind"
                                value="quarantine"
                              />
                              <input
                                type="hidden"
                                name="stockId"
                                value={unit.id}
                              />
                              <select
                                name="reason"
                                aria-label={`Lý do ngừng bán ${unit.id}`}
                                required
                                defaultValue="invalid"
                              >
                                <option value="invalid">Mã không hợp lệ</option>
                                <option value="compromised">
                                  Nghi lộ thông tin
                                </option>
                                <option value="expired">Hết hạn</option>
                                <option value="other">Lý do khác</option>
                              </select>{" "}
                              <button
                                type="submit"
                                className="button secondary"
                                disabled={navigation.state !== "idle"}
                              >
                                Ngừng bán
                              </button>
                            </Form>
                          ) : (
                            "Không thể bán"
                          )}
                        </td>
                      </tr>
                    ))}
                  {!stockUnits.some(
                    (u) => !filter || u.variantId === filter,
                  ) && (
                    <tr>
                      <td colSpan={4}>Chưa có mã nào trong danh sách.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
          {expiryReady && (
            <section className="admin-panel" hidden={view !== "maintenance"}>
              <h2>Kiểm tra đơn giữ hàng quá hạn</h2>
              <p>
                Chỉ trả hàng về kho khi đơn đã quá hạn và chưa gửi yêu cầu
                tạo thanh toán đến payOS. Đơn đã có đường dẫn thanh toán,
                giao dịch hoặc kết quả chưa rõ phải được kiểm tra riêng để
                tránh giao một sản phẩm cho hai khách.
              </p>
              <Form method="post">
                <input type="hidden" name="csrf" value={csrf} />
                <input type="hidden" name="kind" value="expire_unsubmitted" />
                <button
                  className="button secondary"
                  type="submit"
                  disabled={navigation.state !== "idle"}
                >
                  Kiểm tra & giải phóng tối đa 10 đơn an toàn
                </button>
              </Form>
            </section>
          )}
          {deliveryReady && (
            <section className="admin-panel" hidden={view !== "maintenance"}>
              <h2>Xử lý giao hàng đang chờ</h2>
              <p>
                Chỉ nhận tác vụ có biên nhận thanh toán đã xác minh, đã giữ đủ
                hàng và chưa giao thành công. Mỗi lần chạy kiểm tra tối đa một
                đơn; hệ thống kiểm tra giải mã trước khi xác nhận giao.
              </p>
              <Form method="post">
                <input type="hidden" name="csrf" value={csrf} />
                <input type="hidden" name="kind" value="retry_delivery" />
                <button
                  className="button secondary"
                  type="submit"
                  disabled={navigation.state !== "idle"}
                >
                  Kiểm tra và xử lý một đơn đang chờ
                </button>
              </Form>
            </section>
          )}
          <section className="admin-panel" hidden={view !== "import"}>
            <h2>Nhập tài khoản hoặc mã bản quyền</h2>
            <p>
              Mỗi lần lưu một tài khoản, mã bản quyền hoặc liên kết kích hoạt.
              Dữ liệu được mã hóa trên máy chủ trước khi lưu vào kho.
            </p>
            <Form method="post" autoComplete="off" className="auth-form">
              <input type="hidden" name="csrf" value={csrf} />
              <input type="hidden" name="stockId" value={stockId} />
              <label className="field-label" htmlFor="stock-variant">
                Gói sản phẩm
              </label>
              <select
                className="text-input"
                name="variantId"
                id="stock-variant"
                required
                defaultValue=""
              >
                <option value="" disabled>
                  Chọn gói
                </option>
                {variants.map((variant) => (
                  <option key={variant.id} value={variant.id}>
                    {variant.variant_key} — {variant.label}
                  </option>
                ))}
              </select>
              <label className="field-label" htmlFor="stock-kind">
                Loại hàng
              </label>
              <select
                className="text-input"
                name="kind"
                id="stock-kind"
                value={kind}
                onChange={(e) => setKind(e.target.value as StockSecret["type"])}
              >
                <option value="license_key">Mã bản quyền</option>
                <option value="account">Tài khoản & mật khẩu</option>
                <option value="activation_link">Liên kết kích hoạt</option>
              </select>
              {kind === "license_key" && (
                <>
                  <label className="field-label" htmlFor="stock-license">
                    Mã bản quyền
                  </label>
                  <input
                    className="text-input"
                    name="licenseKey"
                    id="stock-license"
                    type="password"
                    required
                    maxLength={2048}
                    autoComplete="off"
                  />
                </>
              )}
              {kind === "account" && (
                <>
                  <label className="field-label" htmlFor="stock-login">
                    Tên đăng nhập
                  </label>
                  <input
                    className="text-input"
                    name="login"
                    id="stock-login"
                    required
                    maxLength={1024}
                    autoComplete="off"
                  />
                  <label className="field-label" htmlFor="stock-password">
                    Mật khẩu tài khoản
                  </label>
                  <input
                    className="text-input"
                    name="password"
                    id="stock-password"
                    type="password"
                    required
                    maxLength={1024}
                    autoComplete="new-password"
                  />
                </>
              )}
              {kind === "activation_link" && (
                <>
                  <label className="field-label" htmlFor="stock-link">
                    Đường dẫn kích hoạt (HTTPS)
                  </label>
                  <input
                    className="text-input"
                    name="activationUrl"
                    id="stock-link"
                    type="url"
                    required
                    maxLength={2048}
                    placeholder="https://..."
                  />
                </>
              )}
              <button
                className="button primary"
                type="submit"
                disabled={navigation.state !== "idle" || variants.length === 0}
              >
                {navigation.state !== "idle"
                  ? "Đang mã hóa & lưu…"
                  : "Lưu vào kho"}
              </button>
            </Form>
          </section>
        </>
      )}
    </AdminShell>
  );
}
