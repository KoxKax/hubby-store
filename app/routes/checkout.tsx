import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  data,
  Form,
  Link,
  redirect,
  useActionData,
  useLoaderData,
  useNavigation,
  useSearchParams,
} from "react-router";
import { useContent } from "../components/content-context";
import type { OrderView } from "../components/local-commerce";
import { useStore } from "../components/store-context";
import { EmptyState, PageIntro } from "../components/storefront";
import { findVariant } from "../content/fixtures";
import { cartSubtotal, demoDiscount, normalizeCart } from "../domain/demo-cart";
import { formatVnd } from "../domain/money";
import { csrfToken, secureForm } from "../server/form-security.server";
import { localCall, localEnabled } from "../server/local-shop.server";
import {
  checkoutBuyerIdentity,
  payosCheckoutGateway,
  payosCheckoutReady,
  startPayosCheckout,
} from "../server/payos-checkout.server";
import {
  issuePayosGuestToken,
  readPayosGuestToken,
  rememberGuestOrder,
} from "../server/payos-guest.server";
import { runtimeContext } from "../server/runtime-context.server";
import { identity } from "../server/supabase.server";
export function meta() {
  return [{ title: "Đặt hàng — Hubby" }];
}
export function headers() {
  return { "Cache-Control": "private, no-store" };
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const local = localEnabled(request, context);
  const payos = payosCheckoutReady(context.get(runtimeContext).env);
  const buyer = payos ? await identity(request, context) : null;
  if (payos) issuePayosGuestToken(request, context);
  return {
    csrf: csrfToken(request, context),
    enabled: local || payos,
    customerEmail: buyer?.email ?? "",
    mode: payos
      ? ("payos" as const)
      : local
        ? ("local" as const)
        : ("closed" as const),
    key: crypto.randomUUID(),
  };
}
export async function action({ request, context }: ActionFunctionArgs) {
  try {
    const form = await secureForm(request, 12_000);
    const env = context.get(runtimeContext).env;
    if (payosCheckoutReady(env)) {
      if (new URL(request.url).origin !== env.SITE_ORIGIN)
        throw new Response("Địa chỉ cửa hàng không khớp.", { status: 403 });
      const authenticated = await identity(request, context);
      const buyer = authenticated ? checkoutBuyerIdentity(authenticated) : null;
      const guestToken = readPayosGuestToken(request);
      if (!guestToken)
        throw new Response("Phiên đặt hàng hết hạn. Vui lòng tải lại trang.", {
          status: 403,
        });
      const payment = await startPayosCheckout(
        {
          requestKey: String(form.get("key") ?? ""),
          guestToken,
          // Signed-in buyers always use their verified account email. Guest
          // email is user-submitted contact, not identity proof on its own.
          email: buyer?.email ?? String(form.get("email") ?? ""),
          userId: buyer?.userId ?? null,
          lines: JSON.parse(String(form.get("lines") ?? "null")),
          coupon: String(form.get("coupon") ?? ""),
          canvaEmail: String(form.get("canvaEmail") ?? ""),
        },
        payosCheckoutGateway(env),
      );
      if (!buyer) rememberGuestOrder(request, context, payment.orderId);
      return redirect(payment.url, { status: 303 });
    }
    const order = await localCall<OrderView>(request, context, {
      action: "checkout",
      key: String(form.get("key")),
      lines: JSON.parse(String(form.get("lines"))),
      coupon: String(form.get("coupon") ?? ""),
      expectedTotal: Number(form.get("expectedTotal")),
      email: String(form.get("email") ?? ""),
    });
    return redirect(`/don-hang/${order.id}?new=1`);
  } catch (error) {
    if (error instanceof Response)
      return data({ error: await error.text() }, { status: error.status });
    return data(
      { error: "Chưa thể tạo đơn. Vui lòng kiểm tra thông tin và thử lại." },
      { status: 400 },
    );
  }
}
export default function Checkout() {
  const content = useContent();
  const store = useStore();
  const [params] = useSearchParams();
  const state = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const navigation = useNavigation();
  const [key] = useState(state.key);
  const immediate = params.get("variant");
  const lines = immediate
    ? normalizeCart(
        [
          {
            variantId: immediate,
            quantity: Number(params.get("quantity") ?? "1"),
          },
        ],
        content,
      )
    : store.lines;
  const subtotal = cartSubtotal(lines, content),
    coupon = state.mode === "local" ? (params.get("coupon") ?? "") : "",
    discount =
      state.mode === "local" ? demoDiscount(subtotal, coupon, content) : 0;
  const needsCanva = lines.some((line) => line.variantId === "canva-36");
  const invalidCanvaQuantity = lines.some((line) => line.variantId === "canva-36" && line.quantity !== 1);
  return (
    <main className="container checkout-page" id="main" tabIndex={-1}>
      <PageIntro
        eyebrow="ĐẶT HÀNG"
        title="Kiểm tra đơn hàng"
        description="Xem lại gói, số lượng và tổng tiền trước khi đặt đơn."
      />
      {result?.error && (
        <p role="alert" className="sandbox-notice">
          {result.error}
        </p>
      )}
      {!state.enabled ? (
        <EmptyState
          title="Tạm thời chưa thể đặt hàng trực tuyến"
          description="Thanh toán đang được cập nhật. Bạn vẫn có thể xem thông tin sản phẩm hoặc liên hệ Hubby để được hỗ trợ."
        />
      ) : !store.ready && !immediate ? (
        <p role="status">Đang mở giỏ hàng…</p>
      ) : !lines.length ? (
        <EmptyState
          title="Chưa có sản phẩm để thanh toán"
          description="Chọn gói còn hàng để tiếp tục."
        />
      ) : (
        <Form method="post" className="cart-grid">
          <input type="hidden" name="csrf" value={state.csrf} />
          <input type="hidden" name="key" value={key} />
          <input type="hidden" name="lines" value={JSON.stringify(lines)} />
          <input type="hidden" name="coupon" value={coupon} />
          <input
            type="hidden"
            name="expectedTotal"
            value={subtotal - discount}
          />
          <section className="checkout-form">
            <div className="checkout-step">
              <span>01</span>
              <h2>Thông tin đơn hàng</h2>
            </div>
            <label className="field-label" htmlFor="checkout-email">
              Email nhận thông tin đơn hàng
            </label>
            <input
              id="checkout-email"
              name="email"
              type="email"
              className="text-input"
              defaultValue={
                state.mode === "local"
                  ? "demo@buyer.example"
                  : state.customerEmail
              }
              placeholder="tenban@example.com"
              maxLength={254}
              required
              readOnly={state.mode === "payos" && !!state.customerEmail}
            />
            <p className="field-hint">
              {state.mode === "local"
                ? "Email dùng để tra đơn trong phiên trình duyệt này. Đây là mô phỏng, chưa gửi email."
                : state.customerEmail
                  ? "Đơn hàng gắn với email của tài khoản Hubby đang đăng nhập."
                  : "Bạn có thể đặt hàng mà không cần đăng nhập. Hãy lưu mã đơn và tra cứu bằng trình duyệt đã dùng khi mua. Nếu đổi thiết bị hoặc xóa dữ liệu trình duyệt, bạn có thể liên hệ Hubby để được hỗ trợ xác minh."}
            </p>
            {state.mode === "payos" && !state.customerEmail && (
              <p className="service-note">
                Muốn xem đơn trên nhiều thiết bị?{" "}
                <Link to="/dang-nhap?next=%2Fthanh-toan">Đăng nhập</Link> trước
                khi đặt hàng.
              </p>
            )}
            {state.mode === "payos" && needsCanva && (
              <div className="canva-activation-fields">
                <label className="field-label" htmlFor="canva-email">Email tài khoản Canva nhận lời mời</label>
                <input id="canva-email" name="canvaEmail" type="email" className="text-input"
                  required maxLength={254} autoComplete="off" placeholder="Email bạn đang dùng để đăng nhập Canva"
                  aria-describedby="canva-email-help" />
                <p className="field-hint" id="canva-email-help">
                  Lời mời sẽ gửi đến email này, có thể khác email đơn hàng. Mỗi đơn mua một lời mời;
                  nếu mua cho email khác, hãy tạo đơn riêng. Không gửi mật khẩu hoặc mã xác thực.
                </p>
                <p className="service-note">Canva cần được kích hoạt sau thanh toán. Hubby sẽ xử lý lời mời và cập nhật tiến độ trong đơn hàng.</p>
                {invalidCanvaQuantity && <p role="alert" className="form-error">Mỗi đơn chỉ nhận một lời mời Canva. Hãy quay lại giỏ hàng và đổi số lượng thành 1.</p>}
              </div>
            )}
            <div className="checkout-step">
              <span>02</span>
              <h2>
                {state.mode === "local"
                  ? "Thanh toán thử nghiệm"
                  : "Thanh toán qua payOS"}
              </h2>
            </div>
            <div className="payment-placeholder">
              <div>
                <strong>
                  {state.mode === "local"
                    ? "Ngân hàng chưa kết nối"
                    : "Chuyển đến cổng thanh toán payOS"}
                </strong>
                <p>
                  {state.mode === "local"
                    ? "Không tạo QR. Sau khi đặt đơn, bạn có thể mô phỏng chuyển tiền đúng/sai."
                : "Hệ thống sẽ giữ sản phẩm trong thời gian thanh toán và chuyển bạn đến payOS để thanh toán đúng số tiền của đơn hàng."}
                </p>
              </div>
              <span className="pill">
                {state.mode === "local" ? "Mô phỏng" : "payOS"}
              </span>
            </div>
            <p>
              {state.mode === "local"
                ? "Đây là đơn thử nghiệm; hệ thống không thu tiền và không giao sản phẩm thật."
                : "Sản phẩm được giữ tối đa 15 phút trong khi thanh toán. Nếu giá thay đổi trước khi đặt đơn, vui lòng kiểm tra lại tổng tiền."}
            </p>
            <Link className="text-link" to="/gio-hang">
              Quay lại giỏ
            </Link>
          </section>
          <aside className="order-summary">
            <p className="eyebrow">ĐƠN HÀNG CỦA BẠN</p>
            <h2>Lựa chọn của bạn</h2>
            {lines.map((l) => {
              const f = findVariant(l.variantId, content);
              return f ? (
                <div className="checkout-summary-item" key={l.variantId}>
                  <div>
                    <strong>{f.product.name}</strong>
                    <small>
                      {f.variant.label} × {l.quantity}
                    </small>
                  </div>
                  <span>{formatVnd(f.variant.priceVnd * l.quantity)}</span>
                </div>
              ) : null;
            })}
            {discount > 0 && <p>Ưu đãi: −{formatVnd(discount)}</p>}
            {state.mode === "payos" && params.has("coupon") && (
              <p className="field-hint">
                Mã ưu đãi hiện chưa áp dụng cho thanh toán trực tuyến. Tổng tiền bên dưới chưa trừ ưu đãi.
              </p>
            )}
            <div className="summary-total">
              <span>Tổng cộng</span>
              <strong>{formatVnd(subtotal - discount)}</strong>
            </div>
            <button
              className="button primary full-width"
              type="submit"
              disabled={!state.enabled || invalidCanvaQuantity || navigation.state !== "idle"}
            >
              {navigation.state !== "idle"
                ? "Đang tạo đơn hàng…"
                : state.mode === "local"
                  ? "Tạo đơn thử nghiệm"
                  : "Tiếp tục thanh toán"}
            </button>
            {state.mode === "local" && (
              <p className="demo-inline">
                Không thu tiền · Chỉ giao dữ liệu giả
              </p>
            )}
          </aside>
        </Form>
      )}
    </main>
  );
}
