import {
  type ActionFunctionArgs,
  data,
  Form,
  Link,
  type LoaderFunctionArgs,
  redirect,
  useActionData,
  useLoaderData,
  useNavigation,
  useSearchParams,
} from "react-router";
import { AdminShell } from "../components/admin-shell";
import { formatVnd } from "../domain/money";
import { csrfToken, secureForm } from "../server/form-security.server";
import {
  loadPayosReconciliationQueue,
  type PayosReviewStatus,
  payosQueueGateway,
  payosQueueReady,
  recordPayosReview,
  requeueExhaustedPayosDelivery,
} from "../server/payos-queue.server";
import { inspectPayosPayment } from "../server/payos-reconcile.server";
import { PayosWebhookSetupError, registerHubbyPayosWebhook } from "../server/payos-setup.server";
import { runtimeContext } from "../server/runtime-context.server";
import { requireOwner } from "../server/supabase.server";
import { payosAdminClient } from "../server/payos-store.server";
import { runBiteSupplierPass } from "../server/supplier.server";
import { runPayosFulfillment } from "../server/payos-fulfillment.server";

export { ErrorBoundary } from "./admin";

export function meta() {
  return [{ title: "Đối soát thanh toán — Hubby" }];
}

export function headers() {
  return { "Cache-Control": "private, no-store" };
}

export async function loader({ request, context, url }: LoaderFunctionArgs) {
  await requireOwner(request, context, url);
  const env = context.get(runtimeContext).env;
  const status: PayosReviewStatus =
    url.searchParams.get("status") === "resolved" ? "resolved" : "open";
  const csrf = csrfToken(request, context);
  if (!payosQueueReady(env))
    return { enabled: false as const, items: [], status, csrf };
  try {
    return {
      enabled: true as const,
      items: await loadPayosReconciliationQueue(payosQueueGateway(env), status),
      status,
      csrf,
    };
  } catch {
    throw new Response("Chưa tải được các khoản cần đối soát.", {
      status: 503,
    });
  }
}

export async function action({ request, context, url }: ActionFunctionArgs) {
  const { user } = await requireOwner(request, context, url);
  const env = context.get(runtimeContext).env;
  if (!payosQueueReady(env))
    return data({ error: "Đối soát chưa được kích hoạt." }, { status: 503 });
  const form = await secureForm(request, 12_000);
  if (form.get("reviewAction") === "recover_account") {
    let stage = "receipt";
    try {
      const reference = String(form.get("caseId") ?? "");
      const item = (await loadPayosReconciliationQueue(payosQueueGateway(env), "open"))
        .find((candidate) => candidate.kind === "receipt_review" && candidate.caseId === reference);
      if (!item?.orderId) throw new Error("Receipt not available");
      stage = "channel";
      const channel = await registerHubbyPayosWebhook(env);
      stage = "provider_payment";
      const inspected = await inspectPayosPayment({ orderCode: item.orderCode, amountVnd: item.amountVnd }, {
        clientId: env.PAYOS_CLIENT_ID ?? "", apiKey: env.PAYOS_API_KEY ?? "", checksumKey: env.PAYOS_CHECKSUM_KEY ?? "",
      });
      if (inspected.status !== "provider_paid_unsettled") throw new Error("Provider payment not verified");
      stage = "settlement";
      const { data: recovered, error } = await payosAdminClient(env.SUPABASE_URL ?? "", env.SUPABASE_SECRET_KEY ?? "")
        .rpc("recover_payos_account_receipt", { p_actor: user.id, p_order: item.orderId, p_reference: reference, p_confirmed_account: channel.receivingAccount });
      if (error || recovered !== true) throw new Error("Recovery conditions not met");
      context.get(runtimeContext).ctx.waitUntil((async () => {
        await runBiteSupplierPass(env);
        await runPayosFulfillment(env);
      })().catch(() => { console.warn("Recovered payment delivery deferred to scheduled work"); }));
      return redirect("/admin/thanh-toan?recovered=1", { status: 303 });
    } catch {
      console.warn("payOS account recovery not completed", { stage });
      return data({ error: "Chưa đủ bằng chứng từ payOS và giao dịch đã lưu để khôi phục đơn. Không thay đổi thanh toán hoặc đặt thêm hàng." }, { status: 409 });
    }
  }
  if (form.get("reviewAction") === "register_webhook") {
    try {
      await registerHubbyPayosWebhook(env);
      return redirect("/admin/thanh-toan?webhook=registered", { status: 303 });
    } catch (error) {
      return data(
        {
          error:
            error instanceof PayosWebhookSetupError ? error.publicMessage : "Chưa kết nối được thông báo payOS. Kết nối bị gián đoạn hoặc phản hồi không hợp lệ; hãy thử lại.",
        },
        { status: 503 },
      );
    }
  }
  const caseKind = String(form.get("caseKind") ?? "");
  const caseId = String(form.get("caseId") ?? "");
  const reviewAction = String(form.get("reviewAction") ?? "");
  const note = String(form.get("note") ?? "").trim();
  const status = form.get("status") === "resolved" ? "resolved" : "open";
  if (reviewAction === "requeue") {
    if (
      caseKind !== "delivery_exhausted" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        caseId,
      ) ||
      form.get("confirmation") !== "THU LAI" ||
      note.length < 10 ||
      note.length > 1000
    )
      return data(
        {
          error:
            "Nhập ghi chú tối thiểu 10 ký tự và xác nhận THU LAI để tiếp tục.",
        },
        { status: 400 },
      );
    try {
      const queued = await requeueExhaustedPayosDelivery(
        payosQueueGateway(env),
        user.id,
        { orderId: caseId, note },
      );
      if (!queued)
        return data(
          {
            error:
              "Đơn không còn đủ điều kiện thử lại. Kiểm tra kho và nhật ký giao hàng.",
          },
          { status: 409 },
        );
      return redirect("/admin/thanh-toan?status=open&requeued=1", {
        status: 303,
      });
    } catch {
      return data(
        {
          error:
            "Không thể đưa đơn vào hàng đợi lúc này. Chưa có thay đổi nào được xác nhận.",
        },
        { status: 503 },
      );
    }
  }
  if (reviewAction === "inspect") {
    // Do not trust a client-supplied orderCode, amount, or link identifier.
    // The review queue is read from the service database only after Owner auth.
    if (caseKind !== "link_unknown" || !/^[0-9a-f-]{36}$/i.test(caseId))
      return data(
        { error: "Không thể tra cứu trường hợp này.", inspected: null },
        { status: 400 },
      );
    try {
      const item = (
        await loadPayosReconciliationQueue(payosQueueGateway(env), status)
      ).find(
        (candidate) =>
          candidate.kind === caseKind && candidate.caseId === caseId,
      );
      if (!item?.orderId || item.orderId !== item.caseId)
        return data(
          {
            error: "Trường hợp đã thay đổi. Hãy tải lại danh sách.",
            inspected: null,
          },
          { status: 409 },
        );
      const { PAYOS_CLIENT_ID, PAYOS_API_KEY, PAYOS_CHECKSUM_KEY } = env;
      if (!PAYOS_CLIENT_ID || !PAYOS_API_KEY || !PAYOS_CHECKSUM_KEY)
        throw new Error("payOS credentials unavailable");
      const inspected = await inspectPayosPayment(
        { orderCode: item.orderCode, amountVnd: item.amountVnd },
        {
          clientId: PAYOS_CLIENT_ID,
          apiKey: PAYOS_API_KEY,
          checksumKey: PAYOS_CHECKSUM_KEY,
        },
      );
      return data({
        error: null,
        inspected: { ...inspected, caseId: item.caseId },
      });
    } catch {
      return data(
        {
          error:
            "Không lấy được dữ liệu xác thực từ payOS. Chưa có thay đổi nào đối với đơn hàng.",
          inspected: null,
        },
        { status: 503 },
      );
    }
  }
  if (
    !["receipt_review", "link_unknown", "delivery_exhausted"].includes(
      caseKind,
    ) ||
    caseId.length < 1 ||
    caseId.length > 120 ||
    !["note", "resolve", "reopen"].includes(reviewAction) ||
    note.length < 3 ||
    note.length > 1000
  )
    return data(
      { error: "Vui lòng nhập ghi chú từ 3 đến 1000 ký tự và thử lại." },
      { status: 400 },
    );

  try {
    await recordPayosReview(payosQueueGateway(env), user.id, {
      kind: caseKind,
      caseId,
      action: reviewAction,
      note,
    });
    return redirect(`/admin/thanh-toan?status=${status}&updated=1`, {
      status: 303,
    });
  } catch {
    return data(
      {
        error:
          "Không lưu được kết quả đối soát. Tải lại danh sách, kiểm tra trạng thái rồi thử lại.",
      },
      { status: 503 },
    );
  }
}

const issue = {
  receipt_review: {
    label: "Tiền cần đối soát",
    explanation:
      "Giao dịch đã có thông báo nhưng chưa đủ điều kiện ghi nhận thanh toán. Kiểm tra sao kê và payOS trước khi xử lý.",
  },
  link_unknown: {
    label: "Chưa rõ kết quả tạo thanh toán",
    explanation:
      "Đã yêu cầu payOS tạo đường dẫn thanh toán nhưng chưa nhận được kết quả chắc chắn. Cần kiểm tra trước khi tạo lại hoặc trả hàng về kho.",
  },
  delivery_exhausted: {
    label: "Giao hàng cần hỗ trợ",
    explanation:
      "Khách đã thanh toán nhưng hệ thống chưa giao hàng được sau nhiều lần thử. Chỉ thử lại khi đã xác nhận hàng vẫn còn và lỗi trước đó chưa gây giao trùng.",
  },
} as const;

export default function AdminPayments() {
  const { enabled, items, status, csrf } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const inspected = result && "inspected" in result ? result.inspected : null;
  const navigation = useNavigation();
  const [params] = useSearchParams();
  return (
    <AdminShell mode="staging" operations section="payments">
      <p className="wp-breadcrumb">Hubby / Vận hành / Thanh toán</p>
      <h1>Đối soát thanh toán</h1>
      {enabled && (
        <section className="admin-panel">
          <h2>Kết nối thông báo payOS</h2>
          <p>
            Kết nối địa chỉ nhận thông báo thanh toán từ payOS. Thao tác này
            chỉ thiết lập kênh thông báo; không tạo đơn hay thu tiền.
          </p>
          <Form method="post">
            <input type="hidden" name="csrf" value={csrf} />
            <input type="hidden" name="reviewAction" value="register_webhook" />
            <button
              type="submit"
              className="button secondary"
              disabled={navigation.state !== "idle"}
            >
              Kết nối thông báo từ payOS
            </button>
          </Form>
          {params.get("webhook") === "registered" && (
            <p role="status">payOS đã xác nhận địa chỉ webhook.</p>
          )}
        </section>
      )}
      <p>
        Xem các giao dịch cần xử lý, ghi chú kết quả kiểm tra và đánh dấu đã
        xem xét. Lệnh thử giao lại chỉ tiếp tục xử lý những đơn đủ điều kiện;
        không tự ghi nhận thanh toán, hoàn tiền hay tạo thêm hàng trong kho.
      </p>
      {enabled && (
        <nav className="wp-tabs" aria-label="Lọc trường hợp đối soát">
          <Link
            aria-current={status === "open" ? "page" : undefined}
            to="/admin/thanh-toan?status=open"
          >
            Cần xử lý
          </Link>
          <Link
            aria-current={status === "resolved" ? "page" : undefined}
            to="/admin/thanh-toan?status=resolved"
          >
            Đã xem xét
          </Link>
        </nav>
      )}
      {params.get("updated") === "1" && (
        <p className="admin-message" role="status">
          Đã lưu lịch sử xử lý. Trạng thái thanh toán và giao hàng không thay
          đổi.
        </p>
      )}
      {params.get("recovered") === "1" && <p className="admin-message" role="status">Đã đối chiếu payOS và ghi nhận thanh toán từ giao dịch hợp lệ. Đơn sẽ được tiếp tục xử lý, không thu thêm tiền.</p>}
      {params.get("requeued") === "1" && (
        <p className="admin-message" role="status">
          Đã đưa tác vụ hợp lệ trở lại hàng đợi giao tự động và ghi nhật ký.
          Chưa xác nhận giao thành công; hãy theo dõi trạng thái đơn.
        </p>
      )}
      {result?.error && (
        <p className="admin-message" role="alert">
          {result.error}
        </p>
      )}
      {!enabled ? (
        <section className="admin-panel" role="status">
          <h2>Chưa bật đối soát payOS</h2>
          <p>
            Thanh toán thật chưa được kích hoạt trên cửa hàng này. Đơn hàng và
            dữ liệu hiện tại được giữ nguyên.
          </p>
        </section>
      ) : items.length === 0 ? (
        <section className="admin-panel" role="status">
          <h2>
            {status === "open"
              ? "Chưa có trường hợp cần kiểm tra"
              : "Chưa có trường hợp được đánh dấu đã xem xét"}
          </h2>
          <p>
            Các khoản thanh toán và giao hàng bình thường vẫn nằm trong quản lý
            đơn hàng.
          </p>
        </section>
      ) : (
        <section className="admin-panel">
          <h2>
            {items.length} trường hợp{" "}
            {status === "open" ? "cần kiểm tra" : "đã xem xét"}
          </h2>
          <div className="wp-operations-list">
            {items.map((item) => (
              <article
                className="order-card"
                key={`${item.kind}-${item.caseId}`}
              >
                <div>
                  <span className="pill">{issue[item.kind].label}</span>
                  <h3>Mã payOS #{item.orderCode}</h3>
                  <p>{issue[item.kind].explanation}</p>
                  {item.reviewNote && (
                    <p>
                      <strong>Ghi chú mới nhất:</strong> {item.reviewNote}
                    </p>
                  )}
                  {item.reviewedAt && (
                    <p>
                      <small>
                        Cập nhật:{" "}
                        {new Intl.DateTimeFormat("vi-VN", {
                          dateStyle: "medium",
                          timeStyle: "short",
                          timeZone: "Asia/Ho_Chi_Minh",
                        }).format(item.reviewedAt)}
                      </small>
                    </p>
                  )}
                  {item.kind === "receipt_review" && (
                    <p>
                      Mã giao dịch: <code>{item.caseId}</code>
                    </p>
                  )}
                  {item.kind === "receipt_review" && item.orderId && item.reviewStatus === "open" && (
                    <Form method="post">
                      <input type="hidden" name="csrf" value={csrf} />
                      <input type="hidden" name="caseId" value={item.caseId} />
                      <button className="button secondary" name="reviewAction" value="recover_account" disabled={navigation.state !== "idle"}>Đối chiếu tài khoản payOS và khôi phục đơn</button>
                    </Form>
                  )}
                  {inspected?.caseId === item.caseId && (
                    <div className="admin-message" role="status">
                      <strong>Tra cứu payOS:</strong>{" "}
                      {
                        {
                          pending:
                            "payOS đang chờ thanh toán. Chưa xác nhận tiền về Hubby.",
                          provider_paid_unsettled:
                            "payOS báo đã nhận đủ tiền. Hubby CHƯA xác nhận trong sổ giao dịch; cần đối chiếu webhook và sao kê trước khi giao hàng.",
                          provider_closed:
                            "payOS báo liên kết đã đóng/hết hạn. Không tự thu hồi kho vì vẫn phải kiểm tra chuyển khoản đến muộn.",
                          manual_review:
                            "Thông tin payOS không khớp hoặc thanh toán một phần. Cần đối chiếu thủ công.",
                        }[inspected.status]
                      }
                      <p>
                        payOS ghi nhận: {formatVnd(inspected.amountPaid)}. Đơn
                        hàng và tồn kho chưa thay đổi.
                      </p>
                    </div>
                  )}
                  <small>
                    {new Intl.DateTimeFormat("vi-VN", {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: "Asia/Ho_Chi_Minh",
                    }).format(item.occurredAt)}
                  </small>
                </div>
                <div>
                  <strong>{formatVnd(item.amountVnd)}</strong>
                  {item.orderId && (
                    <p>
                      Mã đơn nội bộ: <code>{item.orderId}</code>
                    </p>
                  )}
                  <Form method="post" className="wp-form-stack">
                    <input type="hidden" name="csrf" value={csrf} />
                    <input type="hidden" name="caseKind" value={item.kind} />
                    <input type="hidden" name="caseId" value={item.caseId} />
                    <input type="hidden" name="status" value={status} />
                    <label htmlFor={`note-${item.kind}-${item.caseId}`}>
                      Ghi chú đối soát
                    </label>
                    <textarea
                      id={`note-${item.kind}-${item.caseId}`}
                      name="note"
                      minLength={3}
                      maxLength={1000}
                      rows={3}
                      required
                      placeholder="Đã đối chiếu với sao kê, cần xử lý tiếp…"
                    />
                    <div className="wp-actions">
                      <button
                        type="submit"
                        name="reviewAction"
                        value="note"
                        className="button secondary"
                        disabled={navigation.state !== "idle"}
                      >
                        Lưu ghi chú
                      </button>
                      <button
                        type="submit"
                        name="reviewAction"
                        value={
                          item.reviewStatus === "open" ? "resolve" : "reopen"
                        }
                        className="button"
                        disabled={navigation.state !== "idle"}
                      >
                        {item.reviewStatus === "open"
                          ? "Đánh dấu đã xem xét"
                          : "Mở lại kiểm tra"}
                      </button>
                    </div>
                  </Form>
                  {item.kind === "link_unknown" && (
                    <Form method="post">
                      <input type="hidden" name="csrf" value={csrf} />
                      <input type="hidden" name="caseKind" value={item.kind} />
                      <input type="hidden" name="caseId" value={item.caseId} />
                      <input type="hidden" name="status" value={status} />
                      <button
                        className="button secondary"
                        type="submit"
                        name="reviewAction"
                        value="inspect"
                        disabled={navigation.state !== "idle"}
                      >
                        Kiểm tra trạng thái tại payOS
                      </button>
                    </Form>
                  )}
                  {item.kind === "delivery_exhausted" && item.orderId && (
                    <Form method="post" className="wp-form-stack">
                      <input type="hidden" name="csrf" value={csrf} />
                      <input type="hidden" name="caseKind" value={item.kind} />
                      <input type="hidden" name="caseId" value={item.caseId} />
                      <input type="hidden" name="status" value={status} />
                      <p>
                        Chỉ thử lại sau khi xác minh lỗi gián đoạn dịch vụ đã
                        được xử lý. Mỗi đơn có tối đa 3 lần khôi phục có ghi
                        nhật ký; lỗi kho hoặc giải mã không thể thử lại tại đây.
                      </p>
                      <label htmlFor={`retry-note-${item.caseId}`}>
                        Lý do thử lại (tối thiểu 10 ký tự)
                      </label>
                      <textarea
                        id={`retry-note-${item.caseId}`}
                        name="note"
                        minLength={10}
                        maxLength={1000}
                        required
                        rows={2}
                        placeholder="Đã kiểm tra và khắc phục gián đoạn dịch vụ…"
                      />
                      <label htmlFor={`retry-confirm-${item.caseId}`}>
                        Nhập THU LAI để xác nhận
                      </label>
                      <input
                        id={`retry-confirm-${item.caseId}`}
                        name="confirmation"
                        required
                        autoComplete="off"
                      />
                      <button
                        type="submit"
                        name="reviewAction"
                        value="requeue"
                        className="button secondary"
                        disabled={navigation.state !== "idle"}
                      >
                        Đưa lại vào hàng đợi giao hàng
                      </button>
                    </Form>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
      <Link className="text-link" to="/admin/operations?tab=orders">
        Về quản lý đơn hàng
      </Link>
    </AdminShell>
  );
}
