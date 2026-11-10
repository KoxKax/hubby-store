import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  data,
  isRouteErrorResponse,
  Link,
  useFetcher,
  useLoaderData,
  useRouteError,
  useRouteLoaderData,
} from "react-router";
import { CmsPanel, type MediaRecord } from "../components/cms-panel";
import type { ProductSourceBinding, PublishedSourceVariant } from "../components/product-source-link";
import { validateContent } from "../content/schema";
import type { CmsRevision } from "../domain/cms";
import type { loader as rootLoader } from "../root";
import { csrfToken, secureForm } from "../server/form-security.server";
import { imageKind } from "../server/media.server";
import { runtimeContext } from "../server/runtime-context.server";
import { requireOwner } from "../server/supabase.server";
import { supplierGateway, supplierRows, supplierStorageReady } from "../server/supplier.server";
export function meta() {
  return [{ title: "Quản trị cửa hàng — Hubby" }];
}
export function ErrorBoundary() {
  const error = useRouteError();
  const root = useRouteLoaderData<typeof rootLoader>("root");
  const forbidden = isRouteErrorResponse(error) && error.status === 403;
  const unconfigured =
    isRouteErrorResponse(error) &&
    error.status === 503 &&
    root?.authConfigured === false;
  return (
    <main id="main" tabIndex={-1} className="container auth-page">
      <section className="auth-card">
        <p className="eyebrow">QUẢN TRỊ HUBBY</p>
        <h1>
          {forbidden
            ? "Tài khoản không có quyền quản trị"
            : unconfigured
              ? "Chưa bật đăng nhập quản trị"
              : "Quản trị chưa sẵn sàng"}
        </h1>
        <p>
          {forbidden
            ? "Trang này dành cho tài khoản admin của cửa hàng. Tài khoản khách không thể truy cập."
            : unconfigured
              ? "Cần cấu hình dịch vụ đăng nhập và cấp quyền cho tài khoản admin trước khi sử dụng. Hiện chưa có tài khoản admin được thiết lập."
              : "Chưa thể mở khu vực quản trị. Vui lòng thử lại sau."}
        </p>
        <div className="admin-actions">
          <Link className="button secondary" to="/">
            Về cửa hàng
          </Link>
          {forbidden && (
            <Link className="button secondary" to="/tai-khoan">
              Tài khoản của bạn
            </Link>
          )}
        </div>
      </section>
    </main>
  );
}
export async function loader({ request, context, url }: LoaderFunctionArgs) {
  const { client, user } = await requireOwner(request, context, url);
  const env = context.get(runtimeContext).env;
  // A source outage must not prevent the Owner from editing CMS content.
  const sourceState = supplierStorageReady(env)
    ? Promise.all([
        client.from("product_variants").select("id,variant_key").eq("enabled", true),
        supplierGateway(env).rpc("supplier_admin_state", { p_actor: user.id }),
      ]).then(([variants, raw]) => {
        if (variants.error) throw new Error("Source variants unavailable");
        return { available: true, variants: variants.data as PublishedSourceVariant[], bindings: supplierRows.parse(raw).bindings as ProductSourceBinding[] };
      }).catch(() => ({ available: false, variants: [] as PublishedSourceVariant[], bindings: [] as ProductSourceBinding[] }))
    : Promise.resolve({ available: false, variants: [] as PublishedSourceVariant[], bindings: [] as ProductSourceBinding[] });
  const [doc, revisions, media, source] = await Promise.all([
    client
      .from("cms_documents")
      .select("head_version,published_revision_id")
      .eq("slug", "storefront")
      .single(),
    client
      .from("cms_revisions")
      .select("id,version,payload,created_at")
      .order("version", { ascending: false })
      .limit(30),
    client
      .from("media_assets")
      .select("id,alt,status,source_license")
      .order("created_at", { ascending: false })
      .limit(100),
    sourceState,
  ]);
  if (doc.error || revisions.error || media.error || !doc.data)
    throw new Response("Chưa tải được nội dung quản trị. Vui lòng thử lại.", { status: 503 });
  const history: CmsRevision[] = revisions.data.map((r) => ({
    id: r.id,
    version: r.version,
    createdAt: r.created_at,
    snapshot: validateContent(r.payload),
  }));
  if (!history[0])
    throw new Response("Chưa có nội dung cửa hàng", { status: 503 });
  return {
    headVersion: Number(doc.data.head_version),
    publishedId: doc.data.published_revision_id as string | null,
    history,
    media: media.data as MediaRecord[],
    source,
    csrf: csrfToken(request, context),
  };
}
export async function action({ request, context, url }: ActionFunctionArgs) {
  const form = await secureForm(request, 2_200_000);
  const { client, user } = await requireOwner(request, context, url);
  const intent = form.get("intent");
  if (intent === "upload") {
    const file = form.get("file");
    const alt = String(form.get("alt") ?? "").trim();
    const license = String(form.get("license") ?? "").trim();
    if (
      !(file instanceof File) ||
      file.size > 2_097_152 ||
      file.size < 12 ||
      alt.length < 1 ||
      alt.length > 160 ||
      license.length < 1 ||
      license.length > 500
    )
      return data(
        { message: "Ảnh không được vượt quá 2MB. Hãy nhập mô tả và nguồn hoặc quyền sử dụng ảnh." },
        { status: 400 },
      );
    const bytes = await file.arrayBuffer();
    const mime = imageKind(new Uint8Array(bytes));
    if (!mime || mime !== file.type)
      return data(
        { message: "Định dạng ảnh không hợp lệ; không chấp nhận SVG/HTML." },
        { status: 400 },
      );
    const id = crypto.randomUUID();
    const ext = mime === "image/jpeg" ? "jpg" : mime.split("/")[1];
    const path = `${user.id}/${id}.${ext}`;
    const checksum = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    )
      .map((n) => n.toString(16).padStart(2, "0"))
      .join("");
    const upload = await client.storage
      .from("hubby-media")
      .upload(path, bytes, { contentType: mime, upsert: false });
    if (upload.error)
      return data({ message: "Chưa tải được ảnh lên. Vui lòng thử lại." }, { status: 400 });
    const inserted = await client.from("media_assets").insert({
      id,
      object_path: path,
      mime,
      byte_size: file.size,
      alt,
      source_license: license,
      checksum,
      uploaded_by: user.id,
      status: "draft",
    });
    if (inserted.error)
      return data(
        {
          message:
            "Ảnh đã tải lên nhưng chưa lưu được vào thư viện. Hãy kiểm tra thư viện ảnh trước khi thử tải lại để tránh trùng ảnh.",
        },
        { status: 400 },
      );
    const productId = String(form.get("targetProductId") ?? "");
    return {
      message: productId
        ? "Đã tải ảnh lên và chọn cho sản phẩm trong bản nháp. Lưu và xuất bản để áp dụng."
        : "Đã tải ảnh vào thư viện. Bạn có thể chọn khi sửa sản phẩm hoặc banner.",
      uploadedMedia: {
        id,
        src: `/media/${id}`,
        alt,
        productId: /^[a-zA-Z0-9_-]{1,80}$/.test(productId) ? productId : null,
      },
    };
  }
  const version = Number(form.get("version"));
  if (!Number.isSafeInteger(version) || version < 0)
    return data({ message: "Phiên bản không hợp lệ." }, { status: 400 });
  let result: { error: { code: string } | null };
  if (intent === "save") {
    try {
      const raw = String(form.get("snapshot") ?? "");
      if (raw.length > 200000)
        return data({ message: "Nội dung quá lớn." }, { status: 413 });
      const snapshot = validateContent(JSON.parse(raw));
      result = await client.rpc("save_cms_draft", {
        p_payload: snapshot,
        p_expected_version: version,
      });
    } catch {
      return data(
        {
          message:
            "Chưa thể lưu. Kiểm tra các trường bắt buộc, thông tin gói, đường dẫn và ảnh đã chọn.",
        },
        { status: 400 },
      );
    }
  } else if (intent === "publish" || intent === "restore") {
    const id = String(form.get("revisionId") ?? "");
    if (!/^[a-f0-9-]{36}$/.test(id))
      return data({ message: "Không nhận diện được phiên bản nội dung đã chọn." }, { status: 400 });
    result = await client.rpc(
      intent === "publish" ? "publish_cms_revision" : "restore_cms_draft",
      { p_revision_id: id, p_expected_version: version },
    );
  } else
    return data({ message: "Thao tác không được hỗ trợ." }, { status: 400 });
  if (result.error)
    return data(
      {
        message:
          result.error.code === "40001"
            ? "Có thay đổi đồng thời. Tải lại trước khi lưu/xuất bản."
            : "Chưa thể lưu. Kiểm tra quyền quản trị và nội dung đã nhập.",
      },
      { status: result.error.code === "40001" ? 409 : 400 },
    );
  return {
    message:
      intent === "publish"
        ? "Đã xuất bản. Nội dung mới đã được áp dụng trên cửa hàng."
        : intent === "restore"
          ? "Đã tạo bản nháp khôi phục mới."
          : "Đã lưu bản nháp.",
  };
}
export default function Admin() {
  const state = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const uploadFetcher = useFetcher<typeof action>();
  const head = state.history[0];
  if (!head) return null;
  function send(intent: string, extra: Record<string, string>) {
    fetcher.submit(
      {
        csrf: state.csrf,
        version: String(state.headVersion),
        intent,
        ...extra,
      },
      { method: "post" },
    );
  }
  return (
    <CmsPanel
      key={head.id}
      mode="staging"
      revision={head}
      history={state.history}
      publishedId={state.publishedId}
      headVersion={state.headVersion}
      mediaRecords={state.media}
      sourceVariants={state.source.variants}
      sourceBindings={state.source.bindings}
      sourceAvailable={state.source.available}
      sourceCsrf={state.csrf}
      feedback={fetcher.data?.message}
      busy={fetcher.state !== "idle"}
      uploadBusy={uploadFetcher.state !== "idle"}
      uploadFeedback={uploadFetcher.data?.message}
      uploadedMedia={
        uploadFetcher.data && "uploadedMedia" in uploadFetcher.data
          ? uploadFetcher.data.uploadedMedia
          : undefined
      }
      onUpload={(file, alt, license, productId) => {
        const payload = new FormData();
        payload.set("intent", "upload");
        payload.set("csrf", state.csrf);
        payload.set("file", file);
        payload.set("alt", alt);
        payload.set("license", license);
        if (productId) payload.set("targetProductId", productId);
        uploadFetcher.submit(payload, {
          method: "post",
          encType: "multipart/form-data",
        });
      }}
      onSave={(snapshot) =>
        send("save", { snapshot: JSON.stringify(snapshot) })
      }
      onPublish={(id) => send("publish", { revisionId: id })}
      onRestore={(id) => send("restore", { revisionId: id })}
    />
  );
}
