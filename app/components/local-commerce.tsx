import { useState } from "react";
import { Link, useFetcher } from "react-router";
import type { projection, Ticket } from "../domain/local-shop";
import { formatVnd } from "../domain/money";
export type OrderView = ReturnType<typeof projection>;
export type TicketView = Omit<Ticket, "actor">;
export const statuses: Record<string, string> = {
  pending_payment: "Chờ thanh toán",
  paid: "Đã nhận thanh toán · chờ giao",
  delivered: "Đã giao",
  expired: "Hết hạn",
  cancelled: "Đã hủy",
  review_required: "Cần kiểm tra",
  refunded: "Đã hoàn tiền",
};
export function SandboxNotice() {
  return (
    <p className="sandbox-notice">
      Môi trường thử nghiệm · Không chuyển tiền hoặc nhập tài khoản thật.
    </p>
  );
}
export function CommandButton({
  csrf,
  command,
  children,
}: {
  csrf: string;
  command: Record<string, unknown>;
  children: React.ReactNode;
}) {
  const fetcher = useFetcher<{
    error?: string;
    message?: string;
    payload?: string;
    outcome?: string;
  }>();
  const [visible, setVisible] = useState(true);
  return (
    <div className="local-command">
      <fetcher.Form method="post" action="/local-api">
        <input type="hidden" name="csrf" value={csrf} />
        <input type="hidden" name="command" value={JSON.stringify(command)} />
        <button
          type="submit"
          className="button secondary"
          disabled={fetcher.state !== "idle"}
          onClick={() => setVisible(true)}
        >
          {fetcher.state !== "idle" ? "Đang xử lý…" : children}
        </button>
      </fetcher.Form>
      {fetcher.data?.error && <p role="alert">{fetcher.data.error}</p>}
      {fetcher.data?.message && <p role="status">{fetcher.data.message}</p>}
      {fetcher.data?.outcome && (
        <p role="status">Kết quả mẫu: {fetcher.data.outcome}</p>
      )}
      {fetcher.data?.payload && visible && (
        <div className="demo-delivery">
          <p>{fetcher.data.payload}</p>
          <button
            type="button"
            className="button secondary"
            onClick={() => setVisible(false)}
          >
            Ẩn sản phẩm mẫu
          </button>
        </div>
      )}
    </div>
  );
}
export function OrderCard({ order }: { order: OrderView }) {
  return (
    <Link className="order-card admin-panel" to={`/don-hang/${order.id}`}>
      <div>
        <p className="eyebrow">
          ĐƠN HÀNG / {order.id.slice(0, 8).toUpperCase()}
        </p>
        <h2>{order.items.map((i) => i.product).join(" + ")}</h2>
        <p>
          {new Intl.DateTimeFormat("vi-VN", {
            dateStyle: "short",
            timeStyle: "short",
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
