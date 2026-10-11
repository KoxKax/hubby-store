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
import {
  CommandButton,
  type OrderView,
  SandboxNotice,
  statuses,
  type TicketView,
} from "../components/local-commerce";
import { PageIntro } from "../components/storefront";
import { formatVnd } from "../domain/money";
import { csrfToken, secureForm } from "../server/form-security.server";
import { localCall } from "../server/local-shop.server";
export function meta() {
  return [{ title: "Chi tiết đơn mẫu — Hubby" }];
}
export async function loader({ request, context, params }: LoaderFunctionArgs) {
  const result = await localCall<{ order: OrderView; tickets: TicketView[] }>(
    request,
    context,
    { action: "get", id: params.id },
  );
  return {
    ...result,
    csrf: csrfToken(request, context),
    paymentKey: crypto.randomUUID(),
    refundKey: crypto.randomUUID(),
  };
}
export async function action({ request, context, params }: ActionFunctionArgs) {
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
            : "Không thể gửi ticket.",
      },
      { status: error instanceof Response ? error.status : 400 },
    );
  }
}
export default function Order() {
  const {
    order: o,
    tickets,
    csrf,
    paymentKey: initialPaymentKey,
    refundKey: initialRefundKey,
  } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const nav = useNavigation();
  const [paymentKey] = useState(initialPaymentKey);
  const [refundKey] = useState(initialRefundKey);
  return (
    <main className="container account-page" id="main" tabIndex={-1}>
      <PageIntro
        eyebrow={`ORDER / ${o.id.slice(0, 8).toUpperCase()}`}
        title="Một nâng cấp đang đến."
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
