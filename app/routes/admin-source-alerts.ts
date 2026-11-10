import type { LoaderFunctionArgs } from "react-router";
import { biteTrackingGateway, biteTrackingReady } from "../server/bite-catalog.server";
import { runtimeContext } from "../server/runtime-context.server";
import { requireOwner } from "../server/supabase.server";

export function headers() {
  return { "Cache-Control": "private, no-store" };
}

export async function loader({ request, context, url }: LoaderFunctionArgs) {
  const { user } = await requireOwner(request, context, url);
  const env = context.get(runtimeContext).env;
  if (!biteTrackingReady(env))
    throw new Response("Chưa bật theo dõi nguồn Bite.", { status: 503 });
  const result: unknown = await biteTrackingGateway(env).rpc("bite_catalog_alert_status", { p_actor: user.id });
  if (!result || typeof result !== "object")
    throw new Response("Không đọc được thông báo nguồn hàng.", { status: 503 });
  const alert = result as Record<string, unknown>;
  if (
    typeof alert.unread !== "number" || !Number.isSafeInteger(alert.unread) || alert.unread < 0 ||
    typeof alert.latestId !== "number" || !Number.isSafeInteger(alert.latestId) || alert.latestId < 0
  )
    throw new Response("Không đọc được thông báo nguồn hàng.", { status: 503 });
  return Response.json(
    { unread: alert.unread, latestId: alert.latestId },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
