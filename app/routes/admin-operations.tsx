import { useEffect, useState } from "react";
import {
  type ActionFunctionArgs,
  data,
  Link,
  type LoaderFunctionArgs,
  useFetcher,
  useLoaderData,
  useSearchParams,
} from "react-router";
import { z } from "zod";
import { AdminShell } from "../components/admin-shell";
import { TicketCard } from "../components/commerce-space";
import { useContent } from "../components/content-context";
import { statuses } from "../components/local-commerce";
import { normalizeSearch } from "../domain/catalog";
import { formatVnd } from "../domain/money";
import {
  commerceRpc,
  operationsSchema,
} from "../server/commerce-repository.server";
import { csrfToken, secureForm } from "../server/form-security.server";
import { requireOwner } from "../server/supabase.server";

export { ErrorBoundary } from "./admin";

export function meta() {
  return [{ title: "Vận hành cửa hàng — Hubby" }];
}
export async function loader({ request, context, url }: LoaderFunctionArgs) {
  await requireOwner(request, context, url);
  return {
    space: operationsSchema.parse(
      await commerceRpc(request, context, "commerce_admin_space"),
    ),
    csrf: csrfToken(request, context),
  };
}
export async function action({ request, context, url }: ActionFunctionArgs) {
  try {
    const form = await secureForm(request, 8000);
    await requireOwner(request, context, url);
    const id = z.uuid().parse(form.get("id"));
    if (form.get("intent") === "review")
      await commerceRpc(request, context, "review_submission", { p_id: id });
    else if (form.get("intent") === "reply") {
      const input = z
        .object({
          version: z.coerce.number().int().positive(),
          message: z.string().trim().min(3).max(3000),
        })
        .parse({ version: form.get("version"), message: form.get("message") });
      await commerceRpc(request, context, "reply_support", {
        p_id: id,
        p_version: input.version,
        p_body: input.message,
        p_close: form.get("close") === "yes",
      });
    } else return data({ error: "Thao tác không hợp lệ." }, { status: 400 });
    return { message: "Đã lưu thay đổi." };
  } catch (error) {
    if (error instanceof Response && error.status === 302) throw error;
    return data(
      {
        error:
          error instanceof Response
            ? await error.text()
            : "Bạn kiểm tra nội dung nhé.",
      },
      { status: error instanceof Response ? error.status : 400 },
    );
  }
}
export default function AdminOperations() {
  const { space, csrf } = useLoaderData<typeof loader>();
  const [params] = useSearchParams();
  const requested = params.get("tab") ?? "overview";
  const tab = ["overview", "orders", "tickets", "reviews", "feedback"].includes(
    requested,
  )
    ? requested
    : "overview";
  const content = useContent();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  useEffect(() => {
    if (tab) {
      setQuery("");
      setFilter("all");
    }
  }, [tab]);
  const search = normalizeSearch(query);
  const matchingOrders = space.orders.filter(
    (o) =>
      normalizeSearch(
        `${o.code} ${o.items.map((i) => i.product).join(" ")}`,
      ).includes(search) &&
      (filter === "all" || o.state === filter),
  );
  const matchingTickets = space.tickets.filter(
    (t) =>
      normalizeSearch(t.subject).includes(search) &&
      (filter === "all" || t.state === filter),
  );
  const submissions = space.submissions.filter(
    (s) => s.kind === (tab === "reviews" ? "review" : "feedback"),
  );
  const matchingSubmissions = submissions.filter(
    (s) =>
      normalizeSearch(
        `${s.category} ${s.message} ${s.productId ?? ""}`,
      ).includes(search) &&
      (filter === "all" || s.state === filter),
  );
  const date = (at: number) =>
    new Intl.DateTimeFormat("vi-VN", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "Asia/Saigon",
    }).format(at);
  const fetcher = useFetcher<typeof action>();
  const busy = fetcher.state !== "idle";
  const failed = !!fetcher.data && "error" in fetcher.data;
  const notice = fetcher.data
    ? "error" in fetcher.data
      ? fetcher.data.error
      : fetcher.data.message
    : "";
  return (
    <AdminShell mode="staging" operations section={tab}>
      <p className="wp-breadcrumb">Hubby / Vận hành</p>
      <h1>
        {tab === "tickets"
          ? "Yêu cầu hỗ trợ"
          : tab === "reviews"
            ? "Đánh giá gửi riêng"
            : tab === "feedback"
              ? "Góp ý"
              : tab === "orders"
                ? "Đơn hàng"
                : "Tổng quan"}
      </h1>
      {notice && (
        <p className="admin-message" role={failed ? "alert" : "status"}>
          {notice}
        </p>
      )}
      {tab !== "overview" && (
        <section className="admin-panel wp-operations-toolbar">
          <label>
            Tìm kiếm
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={
                tab === "orders"
                  ? "Mã đơn hoặc sản phẩm"
                  : tab === "tickets"
                    ? "Chủ đề yêu cầu"
                    : "Nội dung phản hồi"
              }
            />
          </label>
          <label>
            Trạng thái
            <select
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            >
              <option value="all">Tất cả trạng thái</option>
              {Object.entries(
                tab === "orders"
                  ? statuses
                  : tab === "tickets"
                    ? { open: "Đang mở", closed: "Đã đóng" }
                    : { new: "Chưa đọc", reviewed: "Đã xem" },
              ).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {(query || filter !== "all") && (
            <button
              type="button"
              className="button secondary"
              onClick={() => {
                setQuery("");
                setFilter("all");
              }}
            >
              Xóa bộ lọc
            </button>
          )}
        </section>
      )}
      {tab === "overview" ? (
        <div className="account-grid">
          <section className="admin-panel">
            <p className="eyebrow">ĐƠN HÀNG</p>
            <h2>{space.orders.length}</h2>
            <p>Đơn trong danh sách gần đây</p>
            <Link className="text-link" to="?tab=orders">
              Xem đơn hàng →
            </Link>
          </section>
          <section className="admin-panel">
            <p className="eyebrow">CẦN PHẢN HỒI</p>
            <h2>
              {space.tickets.filter((t) => t.state === "open").length} yêu cầu
              đang mở
            </h2>
            <p>
              {space.submissions.filter((s) => s.state === "new").length} góp ý
              và đánh giá chưa đọc
            </p>
            <Link className="text-link" to="?tab=tickets">
              Xử lý yêu cầu →
            </Link>
          </section>
          <section className="admin-panel">
            <h2>Quản lý thanh toán</h2>
            <p>
              Xem kết nối payOS và các giao dịch cần kiểm tra tại mục Thanh toán.
            </p>
          </section>
        </div>
      ) : tab === "orders" ? (
        matchingOrders.length ? (
          <div className="wp-table-scroll">
            <table className="wp-table">
              <caption>
                {matchingOrders.length} đơn hàng trong danh sách
              </caption>
              <thead>
                <tr>
                  <th scope="col">Mã đơn / thời gian</th>
                  <th scope="col">Sản phẩm</th>
                  <th scope="col">Tổng tiền</th>
                  <th scope="col">Thanh toán</th>
                  <th scope="col">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {matchingOrders.map((order) => (
                  <tr key={order.id}>
                    <th scope="row">
                      {order.code}
                      <small>{date(order.created)}</small>
                    </th>
                    <td>
                      <details>
                        <summary>{order.items.length} gói sản phẩm</summary>
                        {order.items.map((item) => (
                          <p key={item.id}>
                            {item.product} · {item.label} × {item.quantity}
                          </p>
                        ))}
                      </details>
                    </td>
                    <td>{formatVnd(order.total)}</td>
                    <td>
                      {formatVnd(order.paid)}
                      <small>Đã hoàn: {formatVnd(order.refunded)}</small>
                    </td>
                    <td>
                      <span className={`wp-status state-${order.state}`}>
                        {statuses[order.state]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <WorkspaceEmpty
            title={
              space.orders.length ? "Không có đơn phù hợp" : "Chưa có đơn hàng"
            }
            description={
              space.orders.length
                ? "Thử mã đơn khác hoặc xóa bộ lọc."
                : "Các đơn mới sẽ xuất hiện tại đây khi cửa hàng bắt đầu nhận đơn."
            }
          />
        )
      ) : tab === "tickets" ? (
        matchingTickets.length ? (
          matchingTickets.map((ticket) => (
            <section className="admin-panel wp-ticket-item" key={ticket.id}>
              <p className="wp-item-time">{date(ticket.created)}</p>
              <TicketCard ticket={ticket} />
              <fetcher.Form method="post" className="admin-form">
                <input type="hidden" name="csrf" value={csrf} />
                <input type="hidden" name="id" value={ticket.id} />
                <input type="hidden" name="version" value={ticket.version} />
                <input type="hidden" name="intent" value="reply" />
                <label>
                  Trả lời khách
                  <textarea
                    name="message"
                    minLength={3}
                    maxLength={3000}
                    required
                    rows={3}
                  />
                </label>
                <label className="admin-checkbox">
                  <input type="checkbox" name="close" value="yes" />
                  Đóng yêu cầu sau khi trả lời
                </label>
                <button
                  type="submit"
                  className="button primary"
                  disabled={busy}
                >
                  Gửi phản hồi
                </button>
              </fetcher.Form>
            </section>
          ))
        ) : (
          <WorkspaceEmpty
            title={
              space.tickets.length
                ? "Không có yêu cầu phù hợp"
                : "Chưa có yêu cầu hỗ trợ"
            }
            description="Yêu cầu và phản hồi của khách sẽ được lưu tại đây."
          />
        )
      ) : matchingSubmissions.length ? (
        matchingSubmissions.map((s) => (
          <section className="admin-panel wp-submission" key={s.id}>
            <p className="wp-item-time">{date(s.at)}</p>
            <h2>
              {s.kind === "review"
                ? `${content.products.find((p) => p.id === s.productId)?.name ?? s.productId} · ${s.rating}/5`
                : s.category}
            </h2>
            <p className="feedback-message">{s.message}</p>
            <span className="pill">
              {s.state === "new" ? "Chưa đọc" : "Đã xem"}
            </span>
            {s.state === "new" && (
              <fetcher.Form method="post">
                <input type="hidden" name="csrf" value={csrf} />
                <input type="hidden" name="id" value={s.id} />
                <button
                  type="submit"
                  className="button secondary"
                  name="intent"
                  value="review"
                  disabled={busy}
                >
                  Đánh dấu đã xem
                </button>
              </fetcher.Form>
            )}
          </section>
        ))
      ) : (
        <WorkspaceEmpty
          title={
            tab === "reviews"
              ? "Chưa có đánh giá phù hợp"
              : "Chưa có góp ý phù hợp"
          }
          description="Phản hồi được gửi riêng cho Hubby, không tự hiển thị trên cửa hàng."
        />
      )}
    </AdminShell>
  );
}

function WorkspaceEmpty({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <section className="admin-panel wp-empty-state">
      <h2>{title}</h2>
      <p>{description}</p>
    </section>
  );
}
