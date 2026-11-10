import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  data,
  Form,
  Link,
  redirect,
  useActionData,
  useLoaderData,
  useSearchParams,
} from "react-router";
import { AdminShell, operationSections } from "../components/admin-shell";
import {
  CommandButton,
  type OrderView,
  SandboxNotice,
  statuses,
  type TicketView,
} from "../components/local-commerce";
import { normalizeSearch } from "../domain/catalog";
import { type Feedback, feedbackCategories } from "../domain/engagement";
import type { report } from "../domain/local-shop";
import { formatVnd } from "../domain/money";
import { csrfToken, secureForm } from "../server/form-security.server";
import { localCall } from "../server/local-shop.server";

interface Ops {
  orders: OrderView[];
  stock: {
    variantId: string;
    name: string;
    available: number;
    reserved: number;
    assigned: number;
  }[];
  report: ReturnType<typeof report>;
  payments: { id: string; orderId: string; amount: number; outcome: string }[];
  jobs: { orderId: string; state: string }[];
  tickets: TicketView[];
  audit: { eventId: string; action: string; id: string; at: number }[];
  checkoutEnabled: boolean;
  feedback: Feedback[];
}
export function meta() {
  return [{ title: "Vận hành local — Hubby" }];
}
export async function loader({ request, context }: LoaderFunctionArgs) {
  return {
    ...(await localCall<Ops>(request, context, { action: "ops" })),
    csrf: csrfToken(request, context),
  };
}
export async function action({ request, context }: ActionFunctionArgs) {
  try {
    const form = await secureForm(request, 6000);
    if (form.get("intent") === "feedback_review") {
      await localCall(request, context, {
        action: "feedback_review",
        id: String(form.get("id")),
      });
      return redirect(
        form.get("returnTab") === "reviews"
          ? "/admin-demo/operations?tab=reviews"
          : "/admin-demo/operations?tab=feedback",
      );
    }
    await localCall(request, context, {
      action: "reply",
      id: String(form.get("ticketId")),
      text: String(form.get("text")),
      close: form.get("close") === "on",
    });
    return redirect("/admin-demo/operations?tab=tickets");
  } catch (error) {
    return data(
      {
        error:
          error instanceof Response ? await error.text() : "Không thể trả lời.",
      },
      { status: error instanceof Response ? error.status : 400 },
    );
  }
}
export default function Operations() {
  const s = useLoaderData<typeof loader>();
  const error = useActionData<typeof action>();
  const [params] = useSearchParams();
  const requested = params.get("tab") ?? "overview";
  const tab = operationSections.some((item) => item.id === requested)
    ? requested
    : "overview";
  const [query, setQuery] = useState("");
  const orders = s.orders.filter((o) =>
    normalizeSearch(
      `${o.id} ${o.items.map((i) => i.product).join(" ")} ${statuses[o.state]}`,
    ).includes(normalizeSearch(query)),
  );
  return (
    <AdminShell mode="sandbox" section={tab} operations>
      <div className="admin-page wp-operations">
        <div className="admin-heading">
          <div>
            <p className="wp-breadcrumb">Hubby / Vận hành</p>
            <h1>{operationSections.find((item) => item.id === tab)?.label}</h1>
            <p>Theo dõi và xử lý công việc của cửa hàng.</p>
          </div>
        </div>
        <SandboxNotice />
        <p>
          Đây là bảng mô phỏng công khai trên loopback, không phải quyền Owner.
          Dữ liệu mọi phiên đều là mẫu; đơn chi tiết chỉ mở trong phiên sở hữu.
        </p>
        {error?.error && <p role="alert">{error.error}</p>}
        {(tab === "feedback" || tab === "reviews") && (
          <section aria-label="Góp ý khách hàng">
            <h2>
              {tab === "reviews" ? "Đánh giá" : "Góp ý"} (
              {
                s.feedback.filter(
                  (f) =>
                    f.state === "new" &&
                    (tab === "reviews"
                      ? f.category === "review"
                      : f.category !== "review"),
                ).length
              }{" "}
              chưa xem)
            </h2>
            {!s.feedback.some((f) =>
              tab === "reviews"
                ? f.category === "review"
                : f.category !== "review",
            ) && <p>Chưa có nội dung gửi đến.</p>}
            {s.feedback
              .filter((f) =>
                tab === "reviews"
                  ? f.category === "review"
                  : f.category !== "review",
              )
              .map((f) => (
                <article className="admin-panel feedback-entry" key={f.id}>
                  <h3>{feedbackCategories[f.category]}</h3>
                  <p>
                    {new Intl.DateTimeFormat("vi-VN", {
                      timeZone: "Asia/Saigon",
                      dateStyle: "short",
                      timeStyle: "short",
                    }).format(f.at)}{" "}
                    · {f.state === "new" ? "Chưa xem" : "Đã xem"}
                  </p>
                  <p className="feedback-message">{f.message}</p>
                  {f.state === "new" && (
                    <Form method="post">
                      <input type="hidden" name="csrf" value={s.csrf} />
                      <input
                        type="hidden"
                        name="intent"
                        value="feedback_review"
                      />
                      <input type="hidden" name="returnTab" value={tab} />
                      <input type="hidden" name="id" value={f.id} />
                      <button type="submit" className="button secondary">
                        Đánh dấu đã xem
                      </button>
                    </Form>
                  )}
                </article>
              ))}
          </section>
        )}
        {tab === "overview" && (
          <>
            <div className="local-metrics">
              {[
                ["Đơn mẫu", String(s.report.orders)],
                ["Tiền mẫu đã nhận", formatVnd(s.report.received)],
                ["Hoàn mẫu", formatVnd(s.report.refunded)],
                ["Thu ròng mẫu", formatVnd(s.report.net)],
                ["Kho sẵn", String(s.report.available)],
                ["Tác vụ đang chờ", String(s.report.pendingJobs)],
                ["Yêu cầu hỗ trợ mở", String(s.report.openTickets)],
              ].map(([label, value]) => (
                <article className="admin-panel" key={label}>
                  <p>{label}</p>
                  <h2>{value}</h2>
                </article>
              ))}
            </div>
            <section className="admin-panel">
              <h2>Công tắc checkout</h2>
              <p>
                {s.checkoutEnabled ? "Đang cho phép đặt mẫu" : "Đang tạm dừng"}{" "}
                · không dừng xử lý đơn đã trả mẫu.
              </p>
              <CommandButton
                csrf={s.csrf}
                command={{ action: "switch", enabled: !s.checkoutEnabled }}
              >
                {s.checkoutEnabled ? "Tạm dừng đặt mẫu" : "Bật đặt mẫu"}
              </CommandButton>
              <h3>Nhà cung cấp / email</h3>
              <p>
                Chưa kết nối. Chỉ giao kho giả local; không gọi supplier, không
                gửi email, không quảng cáo giao dịch mẫu như đơn thật.
              </p>
            </section>
          </>
        )}
        {tab === "orders" && (
          <section className="admin-panel">
            <div className="wp-list-toolbar">
              <h2>Đơn hàng ({s.orders.length})</h2>
              <label>
                Tìm đơn hàng
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Mã đơn, sản phẩm hoặc trạng thái"
                />
              </label>
            </div>
            <div className="wp-table-scroll">
              <table className="wp-table">
                <caption>Đơn hàng trong môi trường local</caption>
                <thead>
                  <tr>
                    <th scope="col">Mã đơn</th>
                    <th scope="col">Sản phẩm</th>
                    <th scope="col">Trạng thái</th>
                    <th scope="col">Tổng tiền</th>
                    <th scope="col">Chi tiết</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id}>
                      <th scope="row">#{o.id.slice(0, 8).toUpperCase()}</th>
                      <td>
                        {o.items
                          .map((i) => `${i.product} × ${i.quantity}`)
                          .join(" · ")}
                      </td>
                      <td>
                        <span className="wp-status">{statuses[o.state]}</span>
                      </td>
                      <td>{formatVnd(o.total)}</td>
                      <td>
                        <Link
                          className="wp-row-action"
                          to={`/don-hang/${o.id}`}
                        >
                          Mở trong phiên sở hữu
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!orders.length && (
              <p role="status">
                {query ? "Không tìm thấy đơn phù hợp." : "Chưa có đơn hàng."}
              </p>
            )}
          </section>
        )}
        {tab === "inventory" && (
          <>
            <p>
              Chỉ sinh thêm payload DEMO-ONLY. Không có ô nhập passwords/license
              thật hoặc CSV production.
            </p>
            {s.stock.map((i) => (
              <article className="admin-panel order-card" key={i.variantId}>
                <div>
                  <h2>{i.name}</h2>
                  <p>
                    Sẵn {i.available} · giữ {i.reserved} · đã cấp {i.assigned}
                  </p>
                  {i.available < 3 && (
                    <span className="pill">Kho mẫu thấp</span>
                  )}
                </div>
                <CommandButton
                  csrf={s.csrf}
                  command={{
                    action: "import",
                    variantId: i.variantId,
                    quantity: 3,
                  }}
                >
                  Sinh thêm 3 đơn vị giả
                </CommandButton>
              </article>
            ))}
          </>
        )}
        {tab === "payments" && (
          <>
            <p>
              Không có tiền thật. Sai số tiền/tài khoản hoặc đến muộn không tự
              giao. Ledger sự kiện giữ riêng với trạng thái giao.
            </p>
            {s.payments.map((p) => (
              <article className="admin-panel order-card" key={p.id}>
                <div>
                  <h2>
                    {(
                      {
                        matched: "Đã khớp đơn",
                        rejected: "Không hợp lệ",
                        underpaid: "Thiếu tiền",
                        overpaid: "Thừa tiền",
                        late: "Đến sau khi hết hạn",
                      } as Record<string, string>
                    )[p.outcome] ?? p.outcome}
                  </h2>
                  <p>
                    Giao dịch {p.id.slice(0, 8)} / đơn {p.orderId.slice(0, 8)}
                  </p>
                </div>
                <strong>{formatVnd(p.amount)}</strong>
              </article>
            ))}
          </>
        )}
        {tab === "tickets" &&
          s.tickets.map((t) => (
            <article className="admin-panel local-support" key={t.id}>
              <h2>
                {t.subject} · {t.state === "closed" ? "Đã đóng" : "Đang mở"}
              </h2>
              {t.messages.map((m) => (
                <p key={m.id}>
                  <strong>
                    {m.role === "operator" ? "Hỗ trợ" : "Khách mẫu"}:
                  </strong>{" "}
                  {m.text}
                </p>
              ))}
              <Form method="post" className="admin-form">
                <input type="hidden" name="csrf" value={s.csrf} />
                <input type="hidden" name="ticketId" value={t.id} />
                <label>
                  Trả lời thử
                  <textarea
                    required
                    name="text"
                    minLength={3}
                    maxLength={1500}
                    defaultValue="Hubby đã nhận câu hỏi thử của bạn."
                  />
                </label>
                <label>
                  <input type="checkbox" name="close" /> Đóng yêu cầu
                </label>
                <button className="button primary" type="submit">
                  Gửi phản hồi mẫu
                </button>
              </Form>
            </article>
          ))}
        {tab === "audit" && (
          <section className="admin-panel">
            <h2>Nhật ký gần đây · không chứa payload kho</h2>
            {s.audit.map((a) => (
              <p className="local-item" key={a.eventId}>
                <strong>{a.action}</strong> / {a.id.slice(0, 12)} /{" "}
                {new Intl.DateTimeFormat("vi-VN", {
                  timeZone: "Asia/Saigon",
                  timeStyle: "short",
                }).format(a.at)}
              </p>
            ))}
          </section>
        )}
      </div>
    </AdminShell>
  );
}
