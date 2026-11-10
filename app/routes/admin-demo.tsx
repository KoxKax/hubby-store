import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { data, useFetcher, useLoaderData } from "react-router";
import { CmsPanel } from "../components/cms-panel";
import type { LocalWorkspace } from "../domain/cms";
import { csrfToken, secureForm } from "../server/form-security.server";
import { localCall, localEnabled } from "../server/local-shop.server";
export function meta() {
  return [{ title: "CMS local — Hubby" }];
}
export async function loader({ request, context }: LoaderFunctionArgs) {
  if (!localEnabled(request, context))
    throw new Response("Sandbox không khả dụng", { status: 404 });
  return {
    workspace: await localCall<LocalWorkspace>(request, context, {
      action: "cms_get",
    }),
    csrf: csrfToken(request, context),
  };
}
export async function action({ request, context }: ActionFunctionArgs) {
  try {
    const form = await secureForm(request, 4_000_000);
    const command = JSON.parse(String(form.get("command"))) as Record<
      string,
      unknown
    >;
    if (
      !["cms_save", "cms_publish", "cms_restore"].includes(
        String(command.action),
      )
    )
      throw new Response("Invalid CMS command", { status: 400 });
    return await localCall<{ ok: boolean }>(request, context, command);
  } catch (error) {
    return data(
      {
        error:
          error instanceof Response
            ? await error.text()
            : "Chưa thể lưu CMS. Kiểm schema, dung lượng và lịch sử.",
      },
      { status: error instanceof Response ? error.status : 400 },
    );
  }
}
export default function AdminDemo() {
  const { workspace: w, csrf } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<{ error?: string; ok?: boolean }>();
  const head = w.revisions.at(-1);
  if (!head) return <p>CMS chưa sẵn sàng</p>;
  function submit(command: Record<string, unknown>) {
    fetcher.submit(
      { csrf, command: JSON.stringify({ ...command, version: w.headVersion }) },
      { method: "post" },
    );
  }
  return (
    <CmsPanel
      key={head.id}
      mode="sandbox"
      revision={head}
      history={[...w.revisions].reverse()}
      publishedId={w.publishedId}
      headVersion={w.headVersion}
      busy={fetcher.state !== "idle"}
      feedback={
        fetcher.data?.error ??
        (fetcher.data?.ok ? "Đã lưu trên máy chủ local." : "")
      }
      onSave={(snapshot) => submit({ action: "cms_save", snapshot })}
      onPublish={(id) => submit({ action: "cms_publish", id })}
      onRestore={(id) => submit({ action: "cms_restore", id })}
    />
  );
}
