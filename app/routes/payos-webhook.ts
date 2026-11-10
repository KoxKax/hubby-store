import type { ActionFunctionArgs } from "react-router";
import { processPayosWebhook } from "../server/payos.server";
import { runPayosFulfillment } from "../server/payos-fulfillment.server";
import { payosSupabaseStore } from "../server/payos-store.server";
import { runtimeContext } from "../server/runtime-context.server";
import { runBiteSupplierPass } from "../server/supplier.server";

// Only signed notifications can reach settlement. The official connectivity
// fixture is acknowledged separately and never starts fulfillment.
export function loader() {
  return Response.json(
    { success: false },
    {
      status: 405,
      headers: { Allow: "POST", "Cache-Control": "no-store" },
    },
  );
}

export async function action({ request, context }: ActionFunctionArgs) {
  const env = context.get(runtimeContext).env;
  if (
    request.method !== "POST" ||
    env.PAYMENTS_MODE !== "payos" ||
    env.PAYOS_CHECKOUT_READY !== "true" ||
    env.DATA_MODE !== "supabase" ||
    env.SUPABASE_ENVIRONMENT !== "staging" ||
    env.APP_ENV !== "staging" ||
    !env.PAYOS_CHECKSUM_KEY ||
    !env.SUPABASE_URL ||
    !env.SUPABASE_SECRET_KEY
  ) {
    return Response.json(
      { success: false },
      {
        status: 503,
        headers: { "Cache-Control": "no-store", "Retry-After": "300" },
      },
    );
  }

  try {
    const store = payosSupabaseStore(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY);
    const response = await processPayosWebhook(
      request,
      env.PAYOS_CHECKSUM_KEY,
      store,
    );
    if (response.ok && response.headers.get("X-Hubby-Payos-Event") !== "verification" && env.INVENTORY_ENCRYPTION_KEY_V1) {
      // The webhook ACK depends on durable settlement, not on delivery speed.
      // A failed delivery keeps a retriable SQL outbox lease.
      context.get(runtimeContext).ctx.waitUntil(
        (async () => {
          try {
            await runBiteSupplierPass(env);
          } catch {
            /* Cron/manual reconciliation recovers. */
          }
          await runPayosFulfillment(env);
        })().catch(() => undefined),
      );
    }
    return response;
  } catch {
    // Secret configuration and database errors never reach the caller.
    return Response.json(
      { success: false },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
