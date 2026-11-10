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
} from "react-router";
import { CommerceOrderDetail } from "../components/commerce-space";
import {
  CommandButton,
  type OrderView,
  SandboxNotice,
  statuses,
  type TicketView,
} from "../components/local-commerce";
import { PageIntro } from "../components/storefront";
import { formatVnd } from "../domain/money";
import {
  commerceRpc,
  customerOrder,
  customerSpace,
} from "../server/commerce-repository.server";
import { csrfToken, secureForm } from "../server/form-security.server";
import { localCall, localEnabled } from "../server/local-shop.server";
import { payosCheckoutReady } from "../server/payos-checkout.server";
import {
  payosDeliveryGateway,
  revealRegisteredPayosDelivery,
} from "../server/payos-delivery.server";
import { payosFulfillmentReady } from "../server/payos-fulfillment.server";
import {
  payosResumeRedirect,
  resumeRegisteredPayosCheckout,
} from "../server/payos-resume.server";
import { runtimeContext } from "../server/runtime-context.server";
import { identity } from "../server/supabase.server";
export function meta() {
  return [{ title: "Chi tiết đơn hàng — Hubby" }];
}
export function headers() {
  return {
    "Cache-Control": "private, no-store",
    "Referrer-Policy": "no-referrer",
  };
}
export async function loader({ request, context, params }: LoaderFunctionArgs) {
  if (!localEnabled(request, context)) {
    const order = await customerOrder(request, context, params.id ?? "");
    const space = await customerSpace(
      request,
      context,
      `/don-hang/${order.id}`,
    );
    return {
      live: true as const,
      order,
      tickets: space.tickets,
      csrf: csrfToken(request, context),
      requestKey: crypto.randomUUID(),
      resumeReady: payosCheckoutReady(context.get(runtimeContext).env),
    };
  }
  const result = await localCall<{ order: OrderView; tickets: TicketView[] }>(
    request,
    context,
    { action: "get", id: params.id },
  );
  return {
    live: false as const,
    ...result,
    csrf: csrfToken(request, context),
    paymentKey: crypto.randomUUID(),
    refundKey: crypto.randomUUID(),
  };
}
export async function action({ request, context, params }: ActionFunctionArgs) {
  if (!localEnabled(request, context)) {
    // A POST with valid CSRF and a verified signed-in order is the only way
    // to request plaintext. GET/loader, anonymous and unrelated orders never
    // fetch encrypted stock, let alone decrypt it.
    const order = await customerOrder(request, context, params.id ?? "");
    const form = await secureForm(request, 2000);
    if (form.get("intent") === "resume") {
      if (
        order.state !== "pending_payment" ||
        !payosCheckoutReady(context.get(runtimeContext).env)
      )
        return data({ error: "Đơn không còn chờ thanh toán. Nếu đã chuyển tiền, bạn không cần thanh toán lại; trạng thái mới đang được cập nhật." }, { status: 409 });
      try {
        const url = await resumeRegisteredPayosCheckout(order.id, {
          rpc: (name, args) => commerceRpc(request, context, name, args),
        });
        return payosResumeRedirect(url);
      } catch (error) {
        return data({ error: error instanceof Response ? await error.text() : "Chưa mở được liên kết. Nếu đã chuyển tiền, bạn không cần thanh toán lại." }, { status: error instanceof Response ? error.status : 503 });
      }
    }
    if (form.get("intent") !== "reveal")
      throw new Response("Yêu cầu không được hỗ trợ.", { status: 405 });
    const env = context.get(runtimeContext).env;
    if (order.state !== "delivered" || !payosFulfillmentReady(env))
      throw new Response("Thông tin giao hàng chưa sẵn sàng.", { status: 409 });
    const user = await identity(request, context);
    const key = env.INVENTORY_ENCRYPTION_KEY_V1;
    if (!user || !key)
      throw new Response("Phiên nhận hàng không hợp lệ.", { status: 403 });
    const products = await revealRegisteredPayosDelivery(
      order.id,
      user.id,
      payosDeliveryGateway(env),
      { 1: key },
    );
    return data(
      { products, error: "" },
      {
        headers: {
          "Cache-Control": "private, no-store",
          "Referrer-Policy": "no-referrer",
        },
      },
    );
  }
  try {
    const form = await secureForm(request, 6000);
    await localCall(request, context, {
      action: "ticket",
      id: params.id,
      subject: String(form.get("subject")),
      text: String(form.get("text")),
    });
    return redirect(`/don-hang/${params.id}`);
  } catch (error) {
    return data(
      {
        error:
          error instanceof Response
            ? await error.text()
            : "Chưa gửi được yêu cầu hỗ trợ. Vui lòng thử lại.",
      },
      { status: error instanceof Response ? error.status : 400 },
    );
  }
}
export default function Order() {
  const state = useLoaderData<typeof loader>();
  if (state.live)
    return (
      <CommerceOrderDetail
        order={state.order}
        tickets={state.tickets}
        csrf={state.csrf}
        requestKey={state.requestKey}
        resumeReady={state.resumeReady}
      />
    );
  return <LocalOrder state={state} />;
}
function LocalOrder({
  state,
}: {
  state: Extract<Awaited<ReturnType<typeof loader>>, { live: false }>;
}) {
  const {
    order: o,
    tickets,
    csrf,
    paymentKey: initialPaymentKey,
    refundKey: initialRefundKey,
  } = state;
  const result = useActionData<typeof action>();
  const nav = useNavigation();
  const [paymentKey] = useState(initialPaymentKey);
  const [refundKey] = useState(initialRefundKey);
  return (
    <main className="container account-page" id="main" tabIndex={-1}>
      <PageIntro
        eyebrow={`ORDER / ${o.id.slice(0, 8).toUpperCase()}`}
        title="Chi tiết đơn hàng"
        description="Thông tin đơn hàng, sản phẩm và hỗ trợ ở cùng một nơi."
      />
      <SandboxNotice />
      <nav className="admin-actions">
        <Link className="button secondary" to="/tai-khoan/don-hang">
          Tất cả đơn hàng
        </Link>
        <Link className="button secondary" to="/tra-don-hang">
          Tra đơn hàng
        </Link>
      </nav>
      <div className="account-grid">
        <section className="admin-panel">
          <span className="pill">{statuses[o.state]}</span>
          <h2>{formatVnd(o.total)}</h2>
          {o.state === "pending_payment" && (
            <p>
              Giữ kho đến{" "}
              {new Intl.DateTimeFormat("vi-VN", {
                timeZone: "Asia/Saigon",
                timeStyle: "short",
              }).format(o.expires)}
              . Tải lại để cập nhật trạng thái.
            </p>
          )}
          <dl className="local-totals">
            <dt>Tạm tính</dt>
            <dd>{formatVnd(o.subtotal)}</dd>
            <dt>Giảm giá</dt>
            <dd>{formatVnd(o.discount)}</dd>
            <dt>Đã nhận</dt>
            <dd>{formatVnd(o.paid)}</dd>
            <dt>Đã hoàn</dt>
            <dd>{formatVnd(o.refunded)}</dd>
          </dl>
          {o.items.map((item) => (
            <article className="local-item" key={item.variantId}>
              <h3>
                {item.product} / {item.label}
              </h3>
              <p>
                {item.quantity} × {formatVnd(item.price)}
              </p>
              {item.activation && (
                <p>
                  Xem hướng dẫn kích hoạt của gói. Không gửi mật khẩu cá nhân.
                </p>
              )}
              {o.state === "delivered" &&
                item.unitIds.map((id, n) => (
                  <div key={id}>
                    <p>Đơn vị {n + 1}</p>
                    <CommandButton
                      csrf={csrf}
                      command={{ action: "reveal", id: o.id, unitId: id }}
                    >
                      Xem sản phẩm {n + 1}
                    </CommandButton>
                    <CommandButton
                      csrf={csrf}
                      command={{ action: "replace", id: o.id, unitId: id }}
                    >
                      Thử đổi sang đơn vị kho mới
                    </CommandButton>
                  </div>
                ))}
            </article>
          ))}
        </section>
        <aside className="admin-panel">
          <h2>Theo dõi & xử lý</h2>
          <p>
            Thanh toán thật chưa được kết nối. Giữ mã đơn để tra lại và gửi câu
            hỏi khi cần.
          </p>
          <details className="order-simulator">
            <summary>Công cụ thử luồng local</summary>
            <p className="eyebrow">SIMULATOR / KHÔNG PHẢI NGÂN HÀNG</p>
            <h2>Thử luồng thanh toán.</h2>
            {o.state === "pending_payment" ? (
              <>
                <CommandButton
                  csrf={csrf}
                  command={{
                    action: "pay",
                    id: o.id,
                    key: paymentKey,
                    scenario: "exact",
                  }}
                >
                  Mô phỏng chuyển đúng tiền
                </CommandButton>
                <details>
                  <summary>Thử tình huống lỗi</summary>
                  {(
                    [
                      "underpaid",
                      "overpaid",
                      "wrong_account",
                      "deferred",
                    ] as const
                  ).map((s) => (
                    <CommandButton
                      key={s}
                      csrf={csrf}
                      command={{ action: "pay", id: o.id, scenario: s }}
                    >
                      {
                        {
                          underpaid: "Chuyển thiếu mẫu",
                          overpaid: "Chuyển dư mẫu",
                          wrong_account: "Sai tài khoản nhận mẫu",
                          deferred: "Đúng tiền · tạm hoãn giao",
                        }[s]
                      }
                    </CommandButton>
                  ))}
                </details>
                <CommandButton
                  csrf={csrf}
                  command={{ action: "cancel", id: o.id }}
                >
                  Hủy đơn chưa thanh toán
                </CommandButton>
              </>
            ) : (
              <p>
                Không có mã QR hoặc tài khoản ngân hàng ở đây. Mọi giao dịch là
                sự kiện giả do máy chủ local tạo.
              </p>
            )}
            {o.state === "paid" && (
              <CommandButton
                csrf={csrf}
                command={{ action: "retry", id: o.id }}
              >
                Chạy lại job giao mẫu
              </CommandButton>
            )}
            {o.state === "delivered" && (
              <>
                <CommandButton
                  csrf={csrf}
                  command={{ action: "resend", id: o.id }}
                >
                  Thử gửi lại thông báo · không cấp kho mới
                </CommandButton>
                <CommandButton
                  csrf={csrf}
                  command={{ action: "refund", id: o.id, key: refundKey }}
                >
                  Hoàn toàn bộ tiền mẫu
                </CommandButton>
              </>
            )}
          </details>
          <Link className="text-link" to="/#san-pham">
            Tiếp tục khám phá
          </Link>
        </aside>
      </div>
      <section className="admin-panel local-support">
        <h2>Hỗ trợ cho đơn này</h2>
        <p>
          Không gửi mật khẩu hoặc mã xác thực. Nội dung được gắn với đơn để tiện
          theo dõi.
        </p>
        {result?.error && <p role="alert">{result.error}</p>}
        <Form method="post" className="admin-form">
          <input type="hidden" name="csrf" value={csrf} />
          <label>
            Chủ đề
            <input
              name="subject"
              required
              minLength={3}
              maxLength={120}
              placeholder="Bạn cần hỗ trợ điều gì?"
            />
          </label>
          <label>
            Nội dung
            <textarea
              name="text"
              required
              minLength={3}
              maxLength={1500}
              placeholder="Mô tả câu hỏi của bạn"
            />
          </label>
          <button
            className="button primary"
            disabled={nav.state !== "idle"}
            type="submit"
          >
            Gửi yêu cầu hỗ trợ
          </button>
        </Form>
        {tickets.map((t) => (
          <article className="local-item" key={t.id}>
            <h3>
              {t.subject} · {t.state === "closed" ? "Đã đóng" : "Đang mở"}
            </h3>
            {t.messages.map((m) => (
              <p key={m.id}>
                <strong>{m.role === "operator" ? "Hubby" : "Bạn"}:</strong>{" "}
                {m.text}
              </p>
            ))}
          </article>
        ))}
      </section>
    </main>
  );
}
