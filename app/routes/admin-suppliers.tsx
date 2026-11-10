import { useEffect } from "react";
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
  useRevalidator,
  useSearchParams,
} from "react-router";
import { z } from "zod";
import { AdminShell } from "../components/admin-shell";
import { BiteProductBrowser } from "../components/bite-product-browser";
import {
  BiteError,
  fetchBiteTransactions,
  fetchBiteWallet,
} from "../server/bite-api.server";
import {
  biteChangesSchema,
  biteTrackingGateway,
  biteTrackingReady,
  catalogStateSchema,
  syncBiteCatalog,
} from "../server/bite-catalog.server";
import { csrfToken, secureForm } from "../server/form-security.server";
import { runPayosFulfillment } from "../server/payos-fulfillment.server";
import { runtimeContext } from "../server/runtime-context.server";
import { requireOwner } from "../server/supabase.server";
import {
  bitePurchasesReady,
  manualSupplierDelivery,
  readSupplierEvidence,
  readSupplierActivationEmails,
  runBiteSupplierPass,
  supplierGateway,
  supplierRows,
  supplierStorageReady,
} from "../server/supplier.server";

export { ErrorBoundary } from "./admin";
export function meta() {
  return [{ title: "Nguồn hàng API — Hubby" }];
}
export function headers() {
  return {
    "Cache-Control": "private, no-store",
    "Referrer-Policy": "no-referrer",
  };
}
const SOURCE_PAGE_CHUNK = 30;
const MAX_SOURCE_PAGE = 334;
const SOURCE_PAGE_SIZES = [10, 20, 30, 50] as const;
const sourcePageUrl = (search: string, pageSize: number, page: number) =>
  `?view=products&q=${encodeURIComponent(search)}&pageSize=${pageSize}&page=${page}`;

export async function loader({ request, context, url }: LoaderFunctionArgs) {
  const { client, user } = await requireOwner(request, context, url);
  const env = context.get(runtimeContext).env;
  const csrf = csrfToken(request, context);
  const search = (url.searchParams.get("q") ?? "").slice(0, 100);
  const requestedPageSize = Number(url.searchParams.get("pageSize"));
  const pageSize = SOURCE_PAGE_SIZES.includes(requestedPageSize as 10 | 20 | 30 | 50)
    ? requestedPageSize
    : 20;
  const requestedPage = Number(url.searchParams.get("page"));
  const page = Number.isSafeInteger(requestedPage)
    ? Math.max(1, Math.min(Math.ceil((MAX_SOURCE_PAGE * SOURCE_PAGE_CHUNK) / pageSize), requestedPage))
    : 1;
  const rawChangePage = Number(url.searchParams.get("changePage"));
  const changePage = Number.isSafeInteger(rawChangePage)
    ? Math.max(1, Math.min(100000, rawChangePage))
    : 1;
  const unreadOnly = url.searchParams.get("unread") !== "0";
  const tracking = biteTrackingReady(env);
  const emptyCatalog = {
    sync: { lastSuccess: null, issue: null, nextPage: 1, running: false },
    total: 0,
    items: [],
  };
  const emptyChanges = { unread: 0, total: 0, items: [] };
  if (!supplierStorageReady(env))
    return {
      enabled: false,
      purchasing: false,
      csrf,
      bindings: [],
      jobs: [],
      variants: [],
      catalog: emptyCatalog,
      changes: emptyChanges,
      search,
      page,
      pageSize,
      changePage,
      unreadOnly,
      tracking: false,
      hasKey: false,
      eligibleIds: [] as string[],
    };
  const start = (page - 1) * pageSize;
  const firstSourcePage = Math.floor(start / SOURCE_PAGE_CHUNK) + 1;
  const lastSourcePage = Math.min(MAX_SOURCE_PAGE, Math.floor((start + pageSize - 1) / SOURCE_PAGE_CHUNK) + 1);
  const [state, variants, catalogPages, changes] = await Promise.all([
    supplierGateway(env).rpc("supplier_admin_state", { p_actor: user.id }),
    client
      .from("product_variants")
      .select("id,variant_key,label")
      .order("variant_key"),
    tracking
      ? Promise.all(
          Array.from(
            { length: lastSourcePage - firstSourcePage + 1 },
            (_, index) =>
              biteTrackingGateway(env)
                .rpc("bite_catalog_admin", {
                  p_actor: user.id,
                  p_search: search,
                  p_page: firstSourcePage + index,
                })
                .then((value) => catalogStateSchema.parse(value)),
          ),
        )
      : [emptyCatalog],
    tracking
      ? biteTrackingGateway(env)
          .rpc("bite_catalog_changes_page", {
            p_actor: user.id,
            p_page: changePage,
            p_unread_only: unreadOnly,
          })
          .then((value) => biteChangesSchema.parse(value))
      : emptyChanges,
  ]);
  if (variants.error)
    throw new Response("Chưa tải được các gói sản phẩm.", { status: 503 });
  // Existing database RPC pages at 30 rows. Compose the selected view size
  // without altering the deployed schema, data or supplier sync process.
  const catalog = {
    ...catalogPages[0],
    sync: catalogPages[0]?.sync ?? emptyCatalog.sync,
    total: catalogPages[0]?.total ?? 0,
    items: catalogPages
      .flatMap((part) => part.items)
      .slice(start % SOURCE_PAGE_CHUNK, (start % SOURCE_PAGE_CHUNK) + pageSize),
  };
  if (page > Math.max(1, Math.ceil(catalog.total / pageSize)))
    return redirect(`/admin/nguon-hang${sourcePageUrl(search, pageSize, Math.max(1, Math.ceil(catalog.total / pageSize)))}`);
  // The database rechecks these conditions when the Owner saves a mapping.
  // This snapshot only makes the form's eligibility clear before submission.
  const now = Date.now();
  const activationEmails = await readSupplierActivationEmails(env, user.id);
  const parsedState = supplierRows.parse(state);
  const recent = (timestamp: string | null) =>
    timestamp !== null &&
    Number.isFinite(Date.parse(timestamp)) &&
    now - Date.parse(timestamp) <= 15 * 60_000;
  const eligibleIds = catalog.items
    .filter(
      (item) =>
        item.active &&
        item.inStock &&
        item.stock !== 0 &&
        (item.delivery === "automatic" || item.delivery === "manual") &&
        item.currency === "USD" &&
        Number(item.price) > 0 &&
        recent(item.syncedAt) &&
        recent(catalog.sync.lastSuccess) &&
        !catalog.sync.issue,
    )
    .map((item) => item.externalId);
  return {
    enabled: true,
    purchasing: bitePurchasesReady(env),
    csrf,
    ...parsedState,
    jobs: parsedState.jobs.map((job) => ({ ...job, activationEmail: activationEmails.get(job.id) })),
    variants: variants.data,
    catalog,
    changes,
    search,
    page,
    pageSize,
    changePage,
    unreadOnly,
    tracking,
    hasKey: !!env.BITE_API_KEY,
    eligibleIds,
  };
}
export async function action({ request, context, url }: ActionFunctionArgs) {
  const { user } = await requireOwner(request, context, url);
  const env = context.get(runtimeContext).env;
  const form = await secureForm(request, 24_000);
  if (!supplierStorageReady(env))
    return data(
      { error: "Nguồn API chưa được cấu hình.", finance: null },
      { status: 503 },
    );
  const intent = form.get("intent");
  try {
    if (intent === "inspect_wallet" || intent === "inspect_transactions") {
      if (!biteTrackingReady(env) || !env.BITE_API_KEY)
        throw new Error("Source API unavailable");
      if (intent === "inspect_wallet")
        return data({
          error: null,
          finance: {
            type: "wallet" as const,
            wallet: await fetchBiteWallet(env.BITE_API_KEY),
            transactions: null,
          },
        });
      return data({
        error: null,
        finance: {
          type: "transactions" as const,
          wallet: null,
          transactions: await fetchBiteTransactions(env.BITE_API_KEY),
        },
      });
    }
    if (intent === "sync_catalog") {
      const synced = await syncBiteCatalog(env, user.id);
      if (["failed", "disabled"].includes(synced.outcome))
        return data(
          {
            error:
              "Chưa đồng bộ được. Xem mã lỗi nguồn; dữ liệu CMS và bản nguồn trước được giữ nguyên.",
            finance: null,
          },
          { status: 503 },
        );
      return redirect(
        `/admin/nguon-hang?view=products&sync=${synced.outcome}`,
        {
          status: 303,
        },
      );
    }
    if (intent === "save_copy") {
      const externalId = z
        .string()
        .regex(/^\d{1,20}$/)
        .parse(form.get("externalId"));
      const description = z
        .string()
        .trim()
        .min(12)
        .max(3000)
        .parse(form.get("description"));
      const status = z
        .enum(["ready", "verify", "needs_review"])
        .parse(form.get("status"));
      await biteTrackingGateway(env).rpc("bite_catalog_save_copy", {
        p_actor: user.id,
        p_external: externalId,
        p_description: description,
        p_status: status,
      });
      return redirect(
        `/admin/nguon-hang${sourcePageUrl(String(form.get("q") ?? ""), Number(form.get("pageSize")) || 20, Math.max(1, Number(form.get("page")) || 1))}&copySaved=1`,
        { status: 303 },
      );
    }
    if (intent === "ack_changes") {
      const ids = z
        .array(z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER))
        .min(1)
        .max(50)
        .parse(form.getAll("changeId"));
      await biteTrackingGateway(env).rpc("bite_catalog_ack_page", {
        p_actor: user.id,
        p_ids: ids,
      });
      return redirect("/admin/nguon-hang?view=changes&ack=1", { status: 303 });
    }
    if (intent === "process_order") {
      const id = z.uuid().parse(form.get("jobId"));
      await runBiteSupplierPass(env, id);
      await runPayosFulfillment(env);
      return redirect("/admin/nguon-hang?view=orders&polled=1", { status: 303 });
    }
    if (intent === "retry_empty_history") {
      const id = z.uuid().parse(form.get("jobId"));
      if (!env.BITE_API_KEY) throw new Error("Source unavailable");
      const history = await fetchBiteTransactions(env.BITE_API_KEY);
      const orders = history.groups.find((group) => group.name.toLowerCase() === "orders");
      if (!orders || orders.count !== 0) throw new Error("Source history requires reconciliation");
      if (await supplierGateway(env).rpc("retry_bite_after_empty_history", { p_actor: user.id, p_job: id }) !== true) throw new Error("Retry unavailable");
      await runBiteSupplierPass(env, id);
      await runPayosFulfillment(env);
      return redirect("/admin/nguon-hang?view=orders&polled=1", { status: 303 });
    }
    if (intent === "poll_order") {
      const id = z.uuid().parse(form.get("jobId"));
      if (
        (await biteTrackingGateway(env).rpc("request_bite_order_poll", {
          p_actor: user.id,
          p_job: id,
        })) !== true
      )
        throw new Error("No existing source order to poll");
      await runBiteSupplierPass(env, id);
      await runPayosFulfillment(env);
      return redirect("/admin/nguon-hang?view=orders&polled=1", {
        status: 303,
      });
    }
    if (intent === "evidence") {
      const text = await readSupplierEvidence(
        env,
        user.id,
        String(form.get("jobId") ?? ""),
      );
      return new Response(text, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "private, no-store",
          "Referrer-Policy": "no-referrer",
          "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy":
            "default-src 'none'; frame-ancestors 'none'",
        },
      });
    }
    if (intent === "binding") {
      const input = z
        .object({
          variantId: z.uuid(),
          externalId: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/),
          maxPending: z.coerce.number().int().min(1).max(100),
        })
        .parse({
          variantId: form.get("variantId"),
          externalId: form.get("externalId"),
          maxPending: form.get("maxPending"),
        });
      const enabled = form.get("enabled") === "yes";
      if (enabled && !biteTrackingReady(env))
        throw new Error("Source catalog must be available");
      if (enabled && form.get("confirmed") !== "yes")
        throw new Error("Confirmation required");
      const changed = await supplierGateway(env).rpc("set_supplier_binding", {
        p_actor: user.id,
        p_variant: input.variantId,
        p_external: input.externalId,
        p_enabled: enabled,
        p_max: input.maxPending,
      });
      if (changed !== true) throw new Error("Binding not saved");
    } else if (intent === "manual") {
      if (form.get("confirmed") !== "yes")
        throw new Error("Confirmation required");
      const changed = await manualSupplierDelivery(
        env,
        user.id,
        String(form.get("jobId") ?? ""),
        String(form.get("delivery") ?? ""),
        String(form.get("reason") ?? ""),
      );
      if (changed !== true) throw new Error("Task changed");
    } else throw new Error("Invalid action");
    if (intent === "binding" && form.get("returnView") === "products")
      return redirect(
        `/admin/nguon-hang${sourcePageUrl(String(form.get("q") ?? ""), Number(form.get("pageSize")) || 20, Math.max(1, Number(form.get("page")) || 1))}&saved=1`,
        { status: 303 },
      );
    return redirect(`/admin/nguon-hang?view=${intent === "manual" ? "orders" : "bindings"}&saved=1`, { status: 303 });
  } catch (error) {
    const sourceIssue =
      error instanceof BiteError ? ` Mã lỗi: ${error.code}.` : "";
    return data(
      {
        error:
          "Chưa lưu được thay đổi. Hãy tải lại trang, kiểm tra thông tin và thử lại. Để bật tự đặt hàng, nguồn cần còn hàng, có giá USD, hỗ trợ giao tự động hoặc xử lý thủ công và có dữ liệu vừa đồng bộ." +
          sourceIssue,
        finance: null,
      },
      { status: 409 },
    );
  }
}
const labels = {
  queued: "Chờ cấp hàng",
  submitting: "Đang gọi nguồn",
  uncertain: "Cần đối soát",
  waiting: "Chờ nguồn giao hàng",
  failed: "Nguồn báo lỗi — cần xử lý",
  file_ready: "Bite đã có tệp — cần nhận và xử lý",
  stored: "Đã nhận hàng",
  cancelled: "Đã hủy trước thanh toán",
};
const deliveryLabels: Record<string, string> = {
  automatic: "Nguồn hỗ trợ giao tự động",
  text: "Nguồn giao nội dung dạng chữ",
  manual: "Nguồn xử lý thủ công",
  file: "Nguồn giao bằng tệp",
};
const sourceChangeLabels: Record<string, string> = {
  name: "Tên sản phẩm",
  description: "Mô tả từ nguồn",
  category: "Nhóm sản phẩm",
  delivery: "Cách giao hàng",
  promotion: "Ưu đãi từ nguồn",
  active: "Trạng thái bán",
  inStock: "Tình trạng còn hàng",
};
const sourceValue = (value: unknown, field: string) => {
  if (value == null || value === "") return "Chưa có thông tin";
  if (field === "active") return value === true ? "Đang bán" : "Ngừng bán";
  if (field === "inStock") return value === true ? "Còn hàng" : "Hết hàng";
  if (field === "delivery")
    return deliveryLabels[String(value)] ?? String(value);
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : "Chưa có thông tin";
};
function SourceDetailChanges({
  fields,
  before,
  after,
}: {
  fields: string[];
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}) {
  if (!after || !before) return null;
  const keys = fields.includes("details")
    ? ["name", "category", "delivery", "description"]
    : [];
  if (fields.includes("promotion")) keys.push("promotion");
  if (fields.includes("active")) keys.push("active");
  if (fields.includes("stock")) keys.push("inStock");
  const changed = keys.filter((key) => before[key] !== after[key]);
  return changed.length ? (
    <details>
      <summary>Xem nội dung thay đổi</summary>
      {changed.map((key) => (
        <p key={key} style={{ overflowWrap: "anywhere" }}>
          <strong>{sourceChangeLabels[key]}:</strong>{" "}
          {sourceValue(before[key], key)} → {sourceValue(after[key], key)}
        </p>
      ))}
    </details>
  ) : null;
}
export default function AdminSuppliers() {
  const state = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();
  useEffect(() => {
    if (!state.tracking) return;
    const timer = window.setInterval(() => {
      if (
        document.visibilityState === "visible" &&
        revalidator.state === "idle"
      )
        revalidator.revalidate();
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [state.tracking, revalidator]);
  const result = useActionData<typeof action>();
  const busy = useNavigation().state !== "idle";
  const [params] = useSearchParams();
  const requestedView = params.get("view") ?? "products";
  const view = ["products", "bindings", "orders", "wallet", "changes"].includes(
    requestedView,
  )
    ? requestedView
    : "products";
  return (
    <AdminShell mode="staging" operations section="suppliers">
      <p className="wp-breadcrumb">Hubby / Kho hàng / Nguồn API</p>
            <h1>Nguồn hàng API</h1>
      <p className="supplier-intro">
        Xem sản phẩm từ Bite, kiểm tra mô tả tiếng Việt, chọn gói Hubby tương
        ứng và theo dõi đơn đặt từ nguồn.
      </p>
      <nav
        className="admin-workspace-tabs supplier-tabs"
        aria-label="Chức năng nguồn hàng"
      >
        {[
          ["products", "Sản phẩm nguồn"],
          [
            "changes",
            `Thông báo thay đổi${state.changes.unread ? ` (${state.changes.unread})` : ""}`,
          ],
          ["bindings", "Liên kết sản phẩm"],
          ["orders", "Đơn đặt từ Bite"],
          ["wallet", "Ví & giao dịch"],
        ].map(([id, label]) => (
          <Link
            key={id}
            aria-current={view === id ? "page" : undefined}
            to={`?view=${id}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      {params.has("saved") && (
        <p className="admin-message" role="status">
          Đã lưu liên kết nguồn.
        </p>
      )}
      {params.has("copySaved") && (
        <p className="admin-message" role="status">
          Đã lưu mô tả tiếng Việt của sản phẩm nguồn.
        </p>
      )}
      {params.has("ack") && (
        <p className="admin-message" role="status">
          Đã đánh dấu thông báo trên trang vừa xem.
        </p>
      )}
      {params.has("polled") && (
        <p className="admin-message" role="status">
          Đã yêu cầu cập nhật đơn nguồn. Xem trạng thái mới bên dưới.
        </p>
      )}
      {params.has("sync") && (
        <p className="admin-message" role="status">
          Đã xử lý yêu cầu đồng bộ. Xem thời điểm và trạng thái cập nhật bên
          dưới.
        </p>
      )}
      {result?.error && <p role="alert">{result.error}</p>}
      {!state.enabled ? (
        <section className="admin-panel">
          <h2>Chưa cấu hình nguồn</h2>
          <p>
            Chưa thể kết nối nguồn Bite. Hãy kiểm tra cấu hình nguồn hàng trong
            phần quản trị hệ thống. Sản phẩm, giá bán và nội dung đã lưu trên
            Hubby vẫn được giữ nguyên.
          </p>
        </section>
      ) : (
        <>
          {state.tracking && view === "products" && (
            <section className="admin-panel supplier-panel">
              <h2>Danh sách sản phẩm Bite</h2>
              <p>
                Đây là danh sách của nhà cung cấp Bite, tách biệt với sản phẩm
                đang bán trên Hubby. Giá bên dưới là giá nhập. Hệ thống kiểm tra
                khoảng 5 phút một lần và báo khi có thay đổi về sản phẩm, giá
                hoặc tồn kho. Hãy xác nhận đúng gói, thời hạn, cách giao và
                quyền lợi trước khi liên kết.
              </p>
              <p>
                {state.hasKey
                  ? "Đã kết nối API Bite."
                  : "Chưa cấu hình khóa kết nối Bite."}{" "}
                Đồng bộ thành công gần nhất:{" "}
                {state.catalog.sync.lastSuccess
                  ? new Date(state.catalog.sync.lastSuccess).toLocaleString(
                      "vi-VN",
                      { timeZone: "Asia/Saigon" },
                    )
                  : "Chưa có"}
                .
              </p>
              {state.catalog.sync.issue && (
                <p role="alert">
                  Chưa cập nhật được dữ liệu Bite:{" "}
                  <code>{state.catalog.sync.issue}</code>. Hệ thống vẫn giữ bản
                  cập nhật trước và không thay đổi sản phẩm trên shop.
                </p>
              )}
              {state.catalog.sync.nextPage > 1 && (
                <p role="status">
                  Đã lưu các trang trước, đang chờ tiếp tục từ trang{" "}
                  {state.catalog.sync.nextPage}.
                </p>
              )}
              <Form method="post">
                <input type="hidden" name="csrf" value={state.csrf} />
                <input type="hidden" name="intent" value="sync_catalog" />
                <button
                  type="submit"
                  className="button secondary"
                  disabled={busy || !state.hasKey}
                >
                  Cập nhật dữ liệu từ Bite ngay
                </button>
              </Form>
              <BiteProductBrowser
                items={state.catalog.items}
                total={state.catalog.total}
                search={state.search}
                page={state.page}
                pageSize={state.pageSize}
                csrf={state.csrf}
                busy={busy}
                eligibleIds={state.eligibleIds}
                bindings={state.bindings}
                variants={state.variants}
              />
            </section>
          )}
          {state.tracking && view === "changes" && (
            <section className="admin-panel supplier-panel">
              <h2>Thay đổi từ Bite</h2>
              <p>
                Hubby kiểm tra Bite khoảng 5 phút một lần và ghi nhận thay đổi
                về sản phẩm, giá, ưu đãi hoặc tồn kho. Các lần đổi tồn kho liên
                tiếp của cùng một sản phẩm được gộp lại. Khi mở quản trị, số
                thông báo mới được cập nhật mỗi phút. Hệ thống chưa gửi thông
                báo khi trình duyệt đã đóng.
              </p>
              <p>
                <strong>{state.changes.unread} nhóm thông báo chưa xem</strong>{" "}
                · {state.changes.total} mục trong danh sách đang chọn · Trang{" "}
                {state.changePage}
              </p>
              <nav className="admin-inline-actions" aria-label="Lọc thông báo">
                <Link
                  aria-current={state.unreadOnly ? "page" : undefined}
                  to="?view=changes&unread=1"
                >
                  Chưa xem
                </Link>
                <Link
                  aria-current={!state.unreadOnly ? "page" : undefined}
                  to="?view=changes&unread=0"
                >
                  Toàn bộ lịch sử
                </Link>
              </nav>
              {state.changes.items.some((change) => !change.read) && (
                <Form method="post">
                  <input type="hidden" name="csrf" value={state.csrf} />
                  <input type="hidden" name="intent" value="ack_changes" />
                  {state.changes.items
                    .filter((change) => !change.read)
                    .map((change) => (
                      <input
                        key={change.id}
                        type="hidden"
                        name="changeId"
                        value={change.id}
                      />
                    ))}
                  <button type="submit" className="button secondary" disabled={busy}>
                    Đánh dấu các thông báo đang hiển thị là đã xem
                  </button>
                </Form>
              )}
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Sản phẩm</th>
                      <th>Thay đổi</th>
                      <th>Thời điểm</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.changes.items.map((change) => (
                      <tr key={change.id}>
                        <td>
                          <strong>#{change.externalId}</strong>
                          <p>
                            {String(
                              change.after?.name ??
                                change.before?.name ??
                                "Sản phẩm nguồn",
                            )}
                          </p>
                          {!change.read && <strong>Chưa xem</strong>}
                        </td>
                        <td>
                          <strong>
                            {
                              (
                                {
                                  new: "Sản phẩm mới",
                                  updated: "Cập nhật",
                                  removed: "Ngừng bán",
                                  returned: "Bán trở lại",
                                } as const
                              )[change.kind]
                            }
                          </strong>
                          <p>
                            {change.fields
                              .map(
                                (field) =>
                                  (
                                    ({
                                      price: "Giá bán từ nguồn",
                                      normal_price: "Giá thông thường",
                                      reference_price: "Giá tham khảo trước đó",
                                      stock: "Số lượng còn hàng",
                                      details: "Thông tin sản phẩm",
                                      promotion: "Ưu đãi từ nguồn",
                                      active: "Trạng thái bán",
                                      new: "Sản phẩm mới",
                                    }) as Record<string, string>
                                  )[field] ?? field,
                              )
                              .join(" · ")}
                          </p>
                          {change.occurrences > 1 && (
                            <p>
                              Gồm {change.occurrences} lần cập nhật từ nguồn.
                            </p>
                          )}
                          {change.fields.includes("price") &&
                            change.before?.price !== change.after?.price && (
                              <p>
                                Giá bán từ nguồn:{" "}
                                {String(change.before?.price ?? "—")} →{" "}
                                {String(change.after?.price ?? "—")}{" "}
                                {String(change.after?.currency ?? "")}
                              </p>
                            )}
                          {(change.fields.includes("normal_price") ||
                            change.fields.includes("price")) &&
                            change.before?.normalPrice !==
                              change.after?.normalPrice && (
                              <p>
                                Giá thông thường:{" "}
                                {String(change.before?.normalPrice ?? "—")} →{" "}
                                {String(change.after?.normalPrice ?? "—")}{" "}
                                {String(change.after?.currency ?? "")}
                              </p>
                            )}
                          {change.fields.includes("reference_price") && (
                            <p>
                              Giá tham khảo trước đó:{" "}
                              {String(change.before?.previousPrice ?? "—")} →{" "}
                              {String(change.after?.previousPrice ?? "—")}{" "}
                              {String(change.after?.currency ?? "")}
                            </p>
                          )}
                          {change.fields.includes("price") &&
                            change.before?.currency !==
                              change.after?.currency && (
                              <p>
                                Đơn vị tiền:{" "}
                                {String(change.before?.currency ?? "—")} →{" "}
                                {String(change.after?.currency ?? "—")}
                              </p>
                            )}
                          {change.fields.includes("stock") && (
                            <p>
                              Số lượng còn hàng:{" "}
                              {String(change.before?.stock ?? "không rõ")} →{" "}
                              {String(change.after?.stock ?? "không rõ")}
                            </p>
                          )}
                          <SourceDetailChanges
                            fields={change.fields}
                            before={change.before}
                            after={change.after}
                          />
                        </td>
                        <td>
                          {new Date(change.createdAt).toLocaleString("vi-VN", {
                            timeZone: "Asia/Ho_Chi_Minh",
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {state.changes.items.length === 0 && (
                <p>
                  {state.unreadOnly
                    ? "Không còn thông báo chưa xem."
                    : "Chưa ghi nhận thay đổi nào từ nguồn."}
                </p>
              )}
              <nav aria-label="Trang thông báo">
                {state.changePage > 1 && (
                  <Link
                    to={`?view=changes&unread=${state.unreadOnly ? "1" : "0"}&changePage=${state.changePage - 1}`}
                  >
                    Trang trước
                  </Link>
                )}{" "}
                {state.changePage * 50 < state.changes.total && (
                  <Link
                    to={`?view=changes&unread=${state.unreadOnly ? "1" : "0"}&changePage=${state.changePage + 1}`}
                  >
                    Trang sau
                  </Link>
                )}
              </nav>
            </section>
          )}
          {state.tracking && view === "wallet" && (
            <section className="admin-panel supplier-panel">
              <h2>Ví và giao dịch Bite</h2>
              <p>
                Đọc trực tiếp từ tài khoản nguồn khi bạn bấm xem. Không nạp
                tiền, không đặt hàng. Số dư USD/points và giao dịch Bite tách
                biệt với thanh toán VND của khách.
              </p>
              <div className="admin-inline-actions">
                <Form method="post">
                  <input type="hidden" name="csrf" value={state.csrf} />
                  <input type="hidden" name="intent" value="inspect_wallet" />
                  <button
                    type="submit"
                    className="button secondary"
                    disabled={busy || !state.hasKey}
                  >
                    Xem số dư nguồn
                  </button>
                </Form>
                <Form method="post">
                  <input type="hidden" name="csrf" value={state.csrf} />
                  <input
                    type="hidden"
                    name="intent"
                    value="inspect_transactions"
                  />
                  <button
                    type="submit"
                    className="button secondary"
                    disabled={busy || !state.hasKey}
                  >
                    Xem tối đa 20 giao dịch gần đây
                  </button>
                </Form>
              </div>
              {result?.finance?.type === "wallet" && result.finance.wallet && (
                <div role="status">
                  <h3>Thông tin ví nguồn</h3>
                  {result.finance.wallet.fields.length ? (
                    <dl>
                      {result.finance.wallet.fields.map((entry) => (
                        <div key={entry.field}>
                          <dt>{entry.field}</dt>
                          <dd>{entry.value}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <p>
                      Phản hồi thành công nhưng định dạng số dư chưa được nhận
                      diện. Tên trường:{" "}
                      {result.finance.wallet.topLevelFields.join(", ") ||
                        "không có"}
                      .
                    </p>
                  )}
                </div>
              )}
              {result?.finance?.type === "transactions" &&
                result.finance.transactions && (
                  <div role="status">
                    <h3>Giao dịch nguồn (chỉ các trường an toàn)</h3>
                    {result.finance.transactions.groups.length ? (
                      result.finance.transactions.groups.map((group, index) => (
                        <details key={`${group.name}-${index}`} open>
                          <summary>
                            {group.name} · {group.count} mục trong phản hồi
                          </summary>
                          {group.items.map((item, itemIndex) => (
                            <p key={itemIndex}>
                              {Object.entries(item)
                                .map(([key, value]) => `${key}: ${value}`)
                                .join(" · ") ||
                                "Không có trường công khai phù hợp"}
                            </p>
                          ))}
                        </details>
                      ))
                    ) : (
                      <p>
                        Chưa nhận diện được danh sách giao dịch trong phản hồi.
                        Tên trường:{" "}
                        {result.finance.transactions.topLevelFields.join(
                          ", ",
                        ) || "không có"}
                        .
                      </p>
                    )}
                  </div>
                )}
            </section>
          )}
          {view === "bindings" && (
            <section className="admin-panel supplier-panel">
              <h2>Chọn nguồn cấp hàng cho từng gói</h2>
              <p>
                {state.purchasing
                  ? "Có thể tự đặt hàng từ Bite khi khách thanh toán thành công và đơn đủ điều kiện."
                  : "Tự đặt hàng từ Bite đang tắt. Bạn vẫn có thể lưu nguồn cung cấp cho từng gói."}
              </p>
              <p>
                Giá bán được quản lý tại mục Sản phẩm. Hãy chọn đúng mã gói của
                Bite. Đơn hàng đã đặt vẫn giữ nguồn cung cấp được chọn tại thời
                điểm mua. Giới hạn đơn chờ là số đơn tối đa đang chờ Bite xử lý
                cho gói này.
              </p>
              {state.variants.map((variant) => {
                const binding = state.bindings.find(
                  (row) => row.variantId === variant.id,
                );
                return (
                  <details key={variant.id}>
                    <summary>
                      {variant.variant_key} · {variant.label}
                      {binding
                        ? ` · Bite #${binding.externalId}`
                        : " · Chưa liên kết"}
                      {binding?.enabled ? " · Đã cho phép cấp qua Bite" : ""}
                    </summary>
                    <Form method="post" className="form-stack">
                      <input type="hidden" name="csrf" value={state.csrf} />
                      <input type="hidden" name="intent" value="binding" />
                      <input
                        type="hidden"
                        name="variantId"
                        value={variant.id}
                      />
                      <label>
                        Mã sản phẩm Bite
                        <input
                          required
                          name="externalId"
                          defaultValue={binding?.externalId ?? ""}
                          maxLength={80}
                          pattern="[A-Za-z0-9_-]+"
                        />
                      </label>
                      <label>
                        Giới hạn đơn đang chờ Bite (đơn)
                        <input
                          required
                          type="number"
                          aria-description="Số đơn tối đa đang chờ Bite xử lý cho gói này; không phải số lượng tồn kho hay hạn mức tiền."
                          name="maxPending"
                          min={1}
                          max={100}
                          defaultValue={binding?.maxPending ?? 20}
                        />
                      </label>
                      <p>
                        Tối đa bao nhiêu đơn của gói này được chờ Bite xử lý
                        cùng lúc; không phải số lượng tồn kho.
                      </p>
                      <label>
                        <input
                          type="checkbox"
                          name="enabled"
                          value="yes"
                          defaultChecked={binding?.enabled ?? false}
                        />
                        Tự đặt hàng từ Bite khi Hubby xác nhận đã thanh toán
                      </label>
                      <label>
                        <input type="checkbox" name="confirmed" value="yes" />
                        Tôi đã kiểm tra đúng sản phẩm, quyền lợi và giá nhập;
                        tôi sẽ xử lý thủ công nếu Bite gặp sự cố.
                      </label>
                      <p>
                        Có thể tự đặt hàng với nguồn giao tự động hoặc nguồn xử
                        lý thủ công nếu còn hàng, có giá USD và dữ liệu mới.
                        Với nguồn xử lý thủ công, Bite nhận đơn trước; Hubby theo
                        dõi trạng thái và chỉ giao khi nhận được kết quả hợp lệ.
                        Các gói cần thông tin riêng của khách phải được đối
                        chiếu cách nhận trước khi bật.
                      </p>
                      <button
                        type="submit"
                        className="button secondary"
                        disabled={busy}
                      >
                        Lưu liên kết
                      </button>
                    </Form>
                  </details>
                );
              })}
            </section>
          )}
          {view === "orders" && (
            <section className="admin-panel supplier-panel">
              <h2>Đơn hàng mua từ Bite</h2>
              <p>
                Hiển thị tối đa 100 lần yêu cầu mua hàng gần nhất từ Bite. Khi
                đã có mã đơn nguồn, hệ thống có thể cập nhật tiến độ mà không
                đặt mua thêm. Thông tin phản hồi từ Bite được lưu riêng và mã
                hóa để hỗ trợ xử lý sự cố.
              </p>
              {!state.jobs.length && (
                <p>Chưa có đơn hàng nào được gửi sang Bite.</p>
              )}
              {state.jobs.map((job) => (
                <details key={job.id}>
                  <summary>
                    {job.orderCode} · Bite {job.externalId} ·{" "}
                    {labels[job.state]}
                    {job.manual ? " · Xử lý thủ công" : ""}
                  </summary>
                  <p>
                    Mã đơn Bite: {job.providerOrderId ?? "Chưa nhận được"} ·
                    Trạng thái nguồn: {job.providerStatus ?? "Chưa có"}
                  </p>
                  {job.amount && (
                    <p>
                      Chi phí ghi nhận: {job.amount}{" "}
                      {job.currency ?? "(nguồn chưa trả đơn vị tiền)"}
                    </p>
                  )}
                  {job.polledAt && (
                    <p>
                      Cập nhật:{" "}
                      {new Date(job.polledAt).toLocaleString("vi-VN", {
                        timeZone: "Asia/Saigon",
                      })}
                    </p>
                  )}
                  {job.activationEmail && <p><strong>Email Canva nhận lời mời:</strong> {job.activationEmail}</p>}
                  {job.activationEmail && job.state !== "stored" && job.state !== "cancelled" && (
                    <p>Gửi email này kèm mã đơn Bite để xử lý lời mời. Chỉ xác nhận giao xong khi đã hoàn tất kích hoạt cho khách.</p>
                  )}
                  {job.issue && <p role="status">Mã xử lý: {job.issue}</p>}
                  {job.state === "uncertain" && !job.providerOrderId && <Form method="post">
                    <input type="hidden" name="csrf" value={state.csrf} />
                    <input type="hidden" name="intent" value="retry_empty_history" />
                    <input type="hidden" name="jobId" value={job.id} />
                    <button type="submit" className="button secondary" disabled={busy}>Đối chiếu lịch sử trống và gửi lại cùng yêu cầu</button>
                    <p>Chỉ thực hiện khi API xác nhận danh sách đơn nguồn đang trống; giữ nguyên mã chống trùng và ghi lịch sử. Tối đa một lần.</p>
                  </Form>}
                  {job.state === "queued" && <Form method="post">
                    <input type="hidden" name="csrf" value={state.csrf} />
                    <input type="hidden" name="intent" value="process_order" />
                    <input type="hidden" name="jobId" value={job.id} />
                    <button type="submit" className="button secondary" disabled={busy}>Tiếp tục xử lý đơn đã thanh toán</button>
                  </Form>}
                  {state.tracking &&
                    job.providerOrderId &&
                    ["waiting", "uncertain", "failed", "file_ready"].includes(
                      job.state,
                    ) && (
                      <Form method="post">
                        <input type="hidden" name="csrf" value={state.csrf} />
                        <input type="hidden" name="intent" value="poll_order" />
                        <input type="hidden" name="jobId" value={job.id} />
                        <button
                          type="submit"
                          className="button secondary"
                          disabled={busy}
                        >
                          Tra trạng thái đơn Bite
                        </button>
                      </Form>
                    )}
                  <Form method="post" reloadDocument>
                    <input type="hidden" name="csrf" value={state.csrf} />
                    <input type="hidden" name="intent" value="evidence" />
                    <input type="hidden" name="jobId" value={job.id} />
                    <button type="submit" className="button secondary">
                      Xem thông tin Bite trả về
                    </button>
                  </Form>
                  {["queued", "uncertain", "waiting", "failed", "file_ready"].includes(
                    job.state,
                  ) && (
                    <Form method="post" className="form-stack">
                      <input type="hidden" name="csrf" value={state.csrf} />
                      <input type="hidden" name="intent" value="manual" />
                      <input type="hidden" name="jobId" value={job.id} />
                      <label>
                        Nội dung hàng đã nhận để giao cho khách
                        <textarea
                          required
                          name="delivery"
                          maxLength={6000}
                          autoComplete="off"
                        />
                      </label>
                      <label>
                        Lý do
                        <select name="reason">
                          <option value="supplier_confirmed">
                            Đã kiểm tra và nhận hàng từ Bite
                          </option>
                          <option value="replacement_provided">
                            Tự cung cấp hàng thay thế
                          </option>
                        </select>
                      </label>
                      <label>
                        <input
                          required
                          type="checkbox"
                          name="confirmed"
                          value="yes"
                        />
                        Tôi đã kiểm tra đơn với Bite, xác nhận hàng chưa được
                        giao cho khách và sẽ không gửi thêm yêu cầu mua hàng cho
                        đơn này
                      </label>
                      <button type="submit" className="button" disabled={busy}>
                        Lưu hàng đã nhận để hệ thống giao
                      </button>
                    </Form>
                  )}
                </details>
              ))}
            </section>
          )}
        </>
      )}
    </AdminShell>
  );
}
