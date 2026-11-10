import { useEffect } from "react";
import { Form, Link, useFetcher, useActionData, useRevalidator } from "react-router";
import { formatVnd } from "../domain/money";
import type {
  CommerceOrder,
  SupportTicket,
} from "../server/commerce-repository.server";
import { statuses } from "./local-commerce";

export type RevealedUnit = { stockId: string } & (
  | { type: "account"; login: string; password: string }
  | { type: "license_key"; licenseKey: string }
  | { type: "activation_link"; url: string }
  | { type: "raw_text"; text: string }
);

export function DeliveryUnitList({ products }: { products: RevealedUnit[] }) {
  return (
    <>
      {products.map((product, index) => (
        <div className="local-item" key={product.stockId}>
          <h3>Sản phẩm {index + 1}</h3>
          {product.type === "account" ? (
            <>
              <p>
                Tài khoản: <code>{product.login}</code>
              </p>
              <p>
                Mật khẩu: <code>{product.password}</code>
              </p>
            </>
          ) : product.type === "license_key" ? (
            <p>
              Mã bản quyền: <code>{product.licenseKey}</code>
            </p>
          ) : product.type === "raw_text" ? (
            <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
              {product.text}
            </pre>
          ) : (
            <p>
              Liên kết kích hoạt:{" "}
              <a href={product.url} target="_blank" rel="noopener noreferrer">
                Mở liên kết HTTPS
              </a>
            </p>
          )}
        </div>
      ))}
    </>
  );
}

function RegisteredDelivery({ csrf }: { csrf: string }) {
  const fetcher = useFetcher<{ products?: RevealedUnit[]; error?: string }>();
  return (
    <section className="admin-panel" aria-label="Nhận sản phẩm">
      <h2>Nhận sản phẩm của bạn</h2>
      <p>
        Chỉ hiển thị thông tin khi bạn chủ động mở. Không chia sẻ mã hoặc mật
        khẩu với người khác.
      </p>
      <fetcher.Form method="post">
        <input type="hidden" name="csrf" value={csrf} />
        <input type="hidden" name="intent" value="reveal" />
        <button
          className="button secondary"
          disabled={fetcher.state !== "idle"}
          type="submit"
        >
          {fetcher.state !== "idle"
            ? "Đang lấy thông tin…"
            : "Xem thông tin đã mua"}
        </button>
      </fetcher.Form>
      {fetcher.data?.error && <p role="alert">{fetcher.data.error}</p>}
      {fetcher.data?.products && (
        <DeliveryUnitList products={fetcher.data.products} />
      )}
    </section>
  );
}

export function CommerceOrderCard({ order }: { order: CommerceOrder }) {
  return (
    <Link className="order-card admin-panel" to={`/don-hang/${order.id}`}>
      <div>
        <p className="eyebrow">{order.code}</p>
        <h2>{order.items.map((i) => i.product).join(" + ") || "Đơn hàng"}</h2>
        <p>
          {new Intl.DateTimeFormat("vi-VN", {
            dateStyle: "short",
            timeZone: "Asia/Saigon",
          }).format(order.created)}
        </p>
      </div>
      <div>
        <span className="pill">{statuses[order.state]}</span>
        <strong>{formatVnd(order.total)}</strong>
      </div>
    </Link>
  );
}
export function TicketCard({ ticket }: { ticket: SupportTicket }) {
  return (
    <section className="admin-panel">
      <h2>{ticket.subject}</h2>
      <span className="pill">
        {ticket.state === "closed" ? "Đã đóng" : "Đang mở"}
      </span>
      {ticket.messages.map((m) => (
        <div className="ticket-message" key={m.id}>
          <strong>{m.role === "owner" ? "Hubby" : "Bạn"}</strong>
          <p style={{ whiteSpace: "pre-wrap" }}>{m.text}</p>
        </div>
      ))}
    </section>
  );
}
export function SupportForm({
  csrf,
  requestKey,
  orderId,
}: {
  csrf: string;
  requestKey: string;
  orderId?: string;
}) {
  const fetcher = useFetcher<{ message?: string; error?: string }>();
  return (
    <fetcher.Form
      method="post"
      action="/tai-khoan/tickets"
      className="admin-panel admin-form"
    >
      <h2>Gửi yêu cầu hỗ trợ</h2>
      <input type="hidden" name="csrf" value={csrf} />
      <input type="hidden" name="key" value={requestKey} />
      {orderId && <input type="hidden" name="orderId" value={orderId} />}
      <label>
        Chủ đề
        <input name="subject" minLength={3} maxLength={120} required />
      </label>
      <label>
        Bạn cần Hubby hỗ trợ điều gì?
        <textarea
          name="message"
          minLength={3}
          maxLength={3000}
          rows={4}
          required
        />
      </label>
      <p className="field-hint">
        Đừng gửi mật khẩu, mã OTP hoặc thông tin thẻ vào đây nhé.
      </p>
      <button
        className="button primary"
        type="submit"
        disabled={fetcher.state !== "idle"}
      >
        {fetcher.state !== "idle" ? "Đang gửi…" : "Gửi yêu cầu"}
      </button>
      {(fetcher.data?.error || fetcher.data?.message) && (
        <p role={fetcher.data.error ? "alert" : "status"}>
          {fetcher.data.error || fetcher.data.message}
        </p>
      )}
    </fetcher.Form>
  );
}
export function CommerceOrderDetail({
  order,
  csrf,
  requestKey,
  tickets,
  resumeReady = false,
}: {
  order: CommerceOrder;
  csrf: string;
  requestKey: string;
  tickets: SupportTicket[];
  resumeReady?: boolean;
}) {
  const actionResult = useActionData<{ error?: string }>();
  const revalidator = useRevalidator();
  useEffect(() => {
    if (!["pending_payment", "paid", "review_required"].includes(order.state)) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible" && revalidator.state === "idle") void revalidator.revalidate();
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [order.state, revalidator]);
  return (
    <main id="main" tabIndex={-1} className="container account-page">
      <p className="eyebrow">{order.code}</p>
      <h1>Chi tiết đơn hàng</h1>
      <span className="pill">{statuses[order.state]}</span>
      {actionResult?.error && <p className="service-note" role="alert">{actionResult.error}</p>}
      {order.state === "review_required" && <p className="service-note">Hubby đã nhận thông báo giao dịch và đang đối chiếu. Nếu đã chuyển tiền, bạn không cần thanh toán lại.</p>}
      {order.state === "paid" && <p className="service-note">Đã ghi nhận thanh toán. Hubby đang xử lý sản phẩm; đơn sẽ cập nhật tại đây khi có kết quả. Bạn không cần thanh toán lại.</p>}
      <div className="account-grid">
        <section className="admin-panel">
          <h2>{formatVnd(order.total)}</h2>
          {order.items.map((i) => (
            <article key={i.id}>
              <h3>{i.product}</h3>
              <p>
                {i.label} · {i.quantity} × {formatVnd(i.price)}
              </p>
            </article>
          ))}
          <dl className="local-totals">
            <dt>Đã nhận thanh toán</dt>
            <dd>{formatVnd(order.paid)}</dd>
            <dt>Đã hoàn tiền</dt>
            <dd>{formatVnd(order.refunded)}</dd>
          </dl>
          {order.state === "pending_payment" && order.expires > Date.now() && resumeReady && (
            <Form method="post" className="admin-form">
              <input type="hidden" name="csrf" value={csrf} />
              <button
                type="submit"
                name="intent"
                value="resume"
                className="button primary"
              >
                Tiếp tục thanh toán
              </button>
              <p>Chỉ mở lại liên kết payOS của đơn này nếu còn hiệu lực.</p>
            </Form>
          )}
          {order.state === "delivered" ? (
            <RegisteredDelivery csrf={csrf} />
          ) : (
            <p>
              Thông tin giao sản phẩm chỉ mở sau khi thanh toán được xác minh và
              đơn đã được giao.
            </p>
          )}
          <Link className="text-link" to="/tai-khoan/don-hang">
            Về lịch sử đơn hàng
          </Link>
        </section>
        <SupportForm csrf={csrf} requestKey={requestKey} orderId={order.id} />
      </div>
      {tickets
        .filter((t) => t.orderId === order.id)
        .map((ticket) => (
          <TicketCard key={ticket.id} ticket={ticket} />
        ))}
    </main>
  );
}
