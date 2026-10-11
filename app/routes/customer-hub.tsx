import type { LoaderFunctionArgs } from "react-router";
import { Link, useLoaderData } from "react-router";
import {
  OrderCard,
  type OrderView,
  SandboxNotice,
  type TicketView,
} from "../components/local-commerce";
import { EmptyState, PageIntro } from "../components/storefront";
import { localCall } from "../server/local-shop.server";
export function meta() {
  return [{ title: "Không gian đơn hàng — Hubby" }];
}
export async function loader({ request, context }: LoaderFunctionArgs) {
  const result = await localCall<{
    orders: OrderView[];
    tickets: TicketView[];
  }>(request, context, { action: "list" });
  return { ...result, path: new URL(request.url).pathname };
}
export default function CustomerHub() {
  const { orders, tickets, path } = useLoaderData<typeof loader>();
  const library = path.endsWith("san-pham"),
    support = path.endsWith("tickets");
  const selected = library
    ? orders.filter((o) => o.state === "delivered" && !o.refunded)
    : [...orders].reverse();
  return (
    <main className="container account-page" id="main" tabIndex={-1}>
      <PageIntro
        eyebrow="YOUR HUBBY SPACE"
        title={
          library
            ? "Những nâng cấp của bạn."
            : support
              ? "Hỗ trợ của bạn."
              : "Lịch sử đơn hàng."
        }
        description="Đơn hàng, sản phẩm đã nhận và hỗ trợ của bạn."
      />
      <SandboxNotice />
      <nav className="admin-actions">
        <Link className="button secondary" to="/tai-khoan/don-hang">
          Đơn hàng
        </Link>
        <Link className="button secondary" to="/tai-khoan/san-pham">
          Sản phẩm đã nhận
        </Link>
        <Link className="button secondary" to="/tai-khoan/tickets">
          Hỗ trợ
        </Link>
        <Link className="button secondary" to="/yeu-thich">
          Yêu thích
        </Link>
      </nav>
      {support ? (
        !tickets.length ? (
          <EmptyState
            title="Chưa có yêu cầu hỗ trợ."
            description="Mở một đơn hàng để gửi câu hỏi."
          />
        ) : (
          tickets.map((t) => (
            <Link
              className="admin-panel order-card"
              key={t.id}
              to={`/don-hang/${t.orderId}`}
            >
              <h2>{t.subject}</h2>
              <span className="pill">
                {t.state === "closed" ? "Đã đóng" : "Đang mở"}
              </span>
            </Link>
          ))
        )
      ) : !selected.length ? (
        <EmptyState
          title={library ? "Chưa có sản phẩm đã nhận." : "Chưa có đơn hàng."}
          description="Khám phá sản phẩm để bắt đầu."
        />
      ) : (
        selected.map((o) => <OrderCard key={o.id} order={o} />)
      )}
    </main>
  );
}
