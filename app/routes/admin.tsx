import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { data, useFetcher, useLoaderData } from "react-router";
import { CmsPanel, type MediaRecord } from "../components/cms-panel";
import { validateContent } from "../content/schema";
import type { CmsRevision } from "../domain/cms";
import { csrfToken, secureForm } from "../server/form-security.server";
import { imageKind } from "../server/media.server";
import { requireOwner } from "../server/supabase.server";
export function meta() {
  return [{ title: "Owner CMS — Hubby" }];
}
export async function loader({ request, context }: LoaderFunctionArgs) {
  const { client } = await requireOwner(request, context);
  const [doc, revisions, media] = await Promise.all([
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
  ]);
  if (doc.error || revisions.error || media.error || !doc.data)
    throw new Response("CMS staging chưa sẵn sàng", { status: 503 });
  const history: CmsRevision[] = revisions.data.map((r) => ({
    id: r.id,
    version: r.version,
    createdAt: r.created_at,
    snapshot: validateContent(r.payload),
  }));
  if (!history[0])
    throw new Response("Chưa có synthetic seed", { status: 503 });
  return {
    headVersion: Number(doc.data.head_version),
    publishedId: doc.data.published_revision_id as string | null,
    history,
    media: media.data as MediaRecord[],
    csrf: csrfToken(request, context),
  };
}
export async function action({ request, context }: ActionFunctionArgs) {
  const form = await secureForm(request, 2_200_000);
  const { client, user } = await requireOwner(request, context);
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
        { message: "Ảnh tối đa 2MB; cần alt text và nguồn/quyền sử dụng." },
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
      return data({ message: "Chưa upload được ảnh." }, { status: 400 });
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
            "Ảnh đã upload nhưng chưa ghi metadata; cần kiểm tra orphan object trước thử lại.",
        },
        { status: 400 },
      );
    return {
      message:
        "Đã upload ảnh nháp. Chọn trong thư viện và lưu/xuất bản để sử dụng.",
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
            "Nội dung chưa đúng schema; kiểm các trường bắt buộc, gói, đường dẫn và ảnh.",
        },
        { status: 400 },
      );
    }
  } else if (intent === "publish" || intent === "restore") {
    const id = String(form.get("revisionId") ?? "");
    if (!/^[a-f0-9-]{36}$/.test(id))
      return data({ message: "Mã revision không hợp lệ." }, { status: 400 });
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
            : "Chưa thể lưu. Kiểm tra quyền Owner/MFA và schema.",
      },
      { status: result.error.code === "40001" ? 409 : 400 },
    );
  return {
    message:
      intent === "publish"
        ? "Đã xuất bản staging."
        : intent === "restore"
          ? "Đã tạo bản nháp khôi phục mới."
          : "Đã lưu bản nháp.",
  };
}
export default function Admin() {
  const state = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
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
      feedback={fetcher.data?.message}
      busy={fetcher.state !== "idle"}
      onSave={(snapshot) =>
        send("save", { snapshot: JSON.stringify(snapshot) })
      }
      onPublish={(id) => send("publish", { revisionId: id })}
      onRestore={(id) => send("restore", { revisionId: id })}
      uploadForm={
        <fetcher.Form
          method="post"
          encType="multipart/form-data"
          className="admin-panel admin-form"
        >
          <h2>Upload media staging</h2>
          <input type="hidden" name="csrf" value={state.csrf} />
          <label>
            Ảnh (tối đa 2MB)
            <input
              name="file"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/avif"
              required
            />
          </label>
          <label>
            Alt text
            <input name="alt" maxLength={160} required />
          </label>
          <label>
            Nguồn / quyền sử dụng
            <input name="license" maxLength={500} required />
          </label>
          <button
            type="submit"
            name="intent"
            value="upload"
            className="button secondary"
            disabled={fetcher.state !== "idle"}
          >
            Upload ảnh nháp
          </button>
        </fetcher.Form>
      }
    />
  );
}
