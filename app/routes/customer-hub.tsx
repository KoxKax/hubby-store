import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { data, Link, useLoaderData } from "react-router";
import { z } from "zod";
import {
  CommerceOrderCard,
  SupportForm,
  TicketCard,
} from "../components/commerce-space";
import {
  OrderCard,
  type OrderView,
  SandboxNotice,
  type TicketView,
} from "../components/local-commerce";
import { EmptyState, PageIntro } from "../components/storefront";
import {
  commerceRpc,
  customerSpace,
  requireCustomer,
} from "../server/commerce-repository.server";
import { csrfToken, secureForm } from "../server/form-security.server";
import { localCall, localEnabled } from "../server/local-shop.server";
export function meta() {
  return [{ title: "Đơn hàng của bạn — Hubby" }];
}
export async function loader({ request, context, url }: LoaderFunctionArgs) {
  if (!localEnabled(request, context)) {
    const space = await customerSpace(request, context, url.pathname);
    return {
      live: true as const,
      ...space,
      path: url.pathname,
      csrf: csrfToken(request, context),
      requestKey: crypto.randomUUID(),
    };
  }
  const result = await localCall<{
    orders: OrderView[];
    tickets: TicketView[];
  }>(request, context, { action: "list" });
  return { live: false as const, ...result, path: url.pathname };
}
export async function action({ request, context, url }: ActionFunctionArgs) {
  try {
    const form = await secureForm(request, 8000);
    if (!url.pathname.endsWith("tickets") || localEnabled(request, context))
      return data({ error: "Thao tác không hợp lệ." }, { status: 400 });
    await requireCustomer(request, context, url.pathname);
    const input = z
      .object({
        key: z.uuid(),
        orderId: z.uuid().nullable(),
        subject: z.string().trim().min(3).max(120),
        message: z.string().trim().min(3).max(3000),
      })
      .parse({
        key: form.get("key"),
        orderId: form.get("orderId") || null,
        subject: form.get("subject"),
        message: form.get("message"),
      });
    await commerceRpc(request, context, "create_support_ticket", {
      p_key: input.key,
      p_order: input.orderId,
      p_subject: input.subject,
      p_body: input.message,
    });
    return {
      message: "Hubby đã nhận yêu cầu. Bạn theo dõi phản hồi tại đây nhé.",
    };
  } catch (error) {
    if (error instanceof Response && error.status === 302) throw error;
    return data(
      {
        error:
          error instanceof Response
            ? await error.text()
            : "Bạn kiểm tra chủ đề và nội dung nhé.",
      },
      { status: error instanceof Response ? error.status : 400 },
    );
  }
}
export default function CustomerHub() {
  const state = useLoaderData<typeof loader>();
  const { orders, tickets, path } = state;
  const library = path.endsWith("san-pham"),
    support = path.endsWith("tickets");
  const selected = library
    ? orders.filter(
        (o) => o.state === "delivered" && !o.refunded && o.paid >= o.total,
      )
    : [...orders].reverse();
  const preparing = state.live && library ? state.orders.filter((order) => order.state === "paid" || order.state === "review_required") : [];
  return (
    <main className="container account-page" id="main" tabIndex={-1}>
      <PageIntro
        eyebrow="TÀI KHOẢN"
        title={
          library
            ? "Sản phẩm đã nhận"
            : support
              ? "Yêu cầu hỗ trợ"
              : "Lịch sử đơn hàng"
        }
        description="Đơn hàng, sản phẩm đã nhận và hỗ trợ của bạn."
      />
      {!state.live && <SandboxNotice />}
      <nav className="admin-actions account-nav" aria-label="Tài khoản của bạn">
        <Link
          className="button secondary"
          aria-current={!library && !support ? "page" : undefined}
          to="/tai-khoan/don-hang"
        >
          Đơn hàng
        </Link>
        <Link
          className="button secondary"
          aria-current={library ? "page" : undefined}
          to="/tai-khoan/san-pham"
        >
          Sản phẩm đã nhận
        </Link>
        <Link
          className="button secondary"
          aria-current={support ? "page" : undefined}
          to="/tai-khoan/tickets"
        >
          Hỗ trợ
        </Link>
        <Link className="button secondary" to="/yeu-thich">
          Yêu thích
        </Link>
      </nav>
      {support && state.live && (
        <SupportForm csrf={state.csrf} requestKey={state.requestKey} />
      )}
      {preparing.length > 0 && <section aria-label="Đơn đang xử lý">
        <h2>Đơn đang xử lý</h2>
        <p className="service-note">Các đơn dưới đây đang được đối chiếu hoặc chuẩn bị sản phẩm. Bạn không cần thanh toán lại.</p>
        {preparing.map((order) => <CommerceOrderCard key={order.id} order={order} />)}
      </section>}
      {state.live ? (
        support ? (
          !state.tickets.length ? (
            <p className="service-note">
              Các yêu cầu đã gửi và phản hồi từ Hubby sẽ xuất hiện tại đây.
            </p>
          ) : (
            state.tickets.map((ticket) => (
              <TicketCard key={ticket.id} ticket={ticket} />
            ))
          )
        ) : !selected.length ? (
          <EmptyState
            title={library ? "Chưa có sản phẩm đã nhận." : "Chưa có đơn hàng."}
            description={library ? "Sản phẩm sẽ xuất hiện ở đây khi giao xong. Bạn có thể theo dõi đơn đang xử lý ở phía trên hoặc trong mục Đơn hàng." : "Đơn hàng của bạn sẽ được lưu tại đây."}
          />
        ) : (
          (library
            ? state.orders.filter(
                (o) =>
                  o.state === "delivered" && !o.refunded && o.paid >= o.total,
              )
            : state.orders
          ).map((o) => <CommerceOrderCard key={o.id} order={o} />)
        )
      ) : support ? (
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
        (library
          ? state.orders.filter(
              (o) =>
                o.state === "delivered" && !o.refunded && o.paid >= o.total,
            )
          : [...state.orders].reverse()
        ).map((o) => <OrderCard key={o.id} order={o} />)
      )}
    </main>
  );
}
