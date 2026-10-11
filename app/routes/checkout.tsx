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
export function meta() {
  return [{ title: "Đặt đơn thử nghiệm — Hubby" }];
}
export function loader({ request, context }: LoaderFunctionArgs) {
  return {
    csrf: csrfToken(request, context),
    enabled: localEnabled(request, context),
    key: crypto.randomUUID(),
  };
}
export async function action({ request, context }: ActionFunctionArgs) {
  try {
    const form = await secureForm(request, 12_000);
    const order = await localCall<OrderView>(request, context, {
      action: "checkout",
      key: String(form.get("key")),
      lines: JSON.parse(String(form.get("lines"))),
      coupon: String(form.get("coupon") ?? ""),
      expectedTotal: Number(form.get("expectedTotal")),
    });
    return redirect(`/don-hang/${order.id}?new=1`);
  } catch (error) {
    if (error instanceof Response)
      return data({ error: await error.text() }, { status: error.status });
    return data({ error: "Không thể tạo đơn mẫu." }, { status: 400 });
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
    coupon = params.get("coupon") ?? "",
    discount = demoDiscount(subtotal, coupon, content);
  return (
    <main className="container checkout-page" id="main" tabIndex={-1}>
      <PageIntro
        eyebrow="ONE STEP CLOSER"
        title="Kiểm tra lần cuối nhé."
        description="Xem lại gói, số lượng và tổng tiền trước khi đặt đơn."
      />
      {result?.error && (
        <p role="alert" className="sandbox-notice">
          {result.error}
        </p>
      )}
      {!store.ready && !immediate ? (
        <p role="status">Đang mở giỏ hàng…</p>
      ) : !lines.length ? (
        <EmptyState
          title="Chưa có lựa chọn hợp lệ."
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
              Email minh họa
            </label>
            <input
              id="checkout-email"
              className="text-input"
              value="demo@buyer.example"
              readOnly
            />
            <p className="field-hint">
              Địa chỉ cố định cho đơn local, chưa gửi email. Giữ phiên trình
              duyệt để xem đơn.
            </p>
            <div className="checkout-step">
              <span>02</span>
              <h2>Thanh toán thử nghiệm</h2>
            </div>
            <div className="payment-placeholder">
              <div>
                <strong>Ngân hàng chưa kết nối</strong>
                <p>
                  Không tạo QR. Sau khi đặt đơn, bạn có thể mô phỏng chuyển tiền
                  đúng/sai để thử hệ thống.
                </p>
              </div>
              <span className="pill">MOCK ONLY</span>
            </div>
            <p>
              Đơn được giữ 15 phút. Nếu giá thay đổi, tải lại để xác nhận tổng
              tiền mới.
            </p>
            <Link className="text-link" to="/gio-hang">
              Quay lại giỏ
            </Link>
          </section>
          <aside className="order-summary">
            <p className="eyebrow">YOUR LITTLE UPGRADES</p>
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
            <div className="summary-total">
              <span>Tổng cộng</span>
              <strong>{formatVnd(subtotal - discount)}</strong>
            </div>
            <button
              className="button primary full-width"
              type="submit"
              disabled={!state.enabled || navigation.state !== "idle"}
            >
              {navigation.state !== "idle"
                ? "Đang giữ kho…"
                : "Tạo đơn thử nghiệm"}
            </button>
            <p className="demo-inline">Không thu tiền · Chỉ giao dữ liệu giả</p>
          </aside>
        </Form>
      )}
    </main>
  );
}
