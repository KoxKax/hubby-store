import type { LoaderFunctionArgs } from "react-router";
import { requestClient } from "../server/supabase.server";
export async function loader({ request, context, params }: LoaderFunctionArgs) {
  if (!params.id || !/^[a-f0-9-]{36}$/.test(params.id))
    throw new Response("Không tìm thấy ảnh", { status: 404 });
  const client = requestClient(request, context);
  const asset = await client
    .from("media_assets")
    .select("object_path,mime")
    .eq("id", params.id)
    .maybeSingle();
  if (asset.error || !asset.data)
    throw new Response("Không tìm thấy ảnh", { status: 404 });
  const result = await client.storage
    .from("hubby-media")
    .download(asset.data.object_path);
  if (result.error || !result.data)
    throw new Response("Không tìm thấy ảnh", { status: 404 });
  return new Response(await result.data.arrayBuffer(), {
    headers: {
      "Content-Type": asset.data.mime,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "private, no-store",
    },
  });
}
