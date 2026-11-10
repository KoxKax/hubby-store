import { z } from "zod";
import { payosAdminClient } from "./payos-store.server";
import type { HubbyEnv } from "./runtime-context.server";

export async function telegramJob(env: HubbyEnv, params: Record<string, unknown>) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) throw new Error("Storage unavailable");
  const { data, error } = await payosAdminClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY)
    .rpc("canva_telegram_job", params);
  if (error) throw new Error("Telegram order storage unavailable");
  return data;
}
export const telegramRows = z.array(z.object({
  jobId: z.uuid(), orderId: z.uuid(), sourceId: z.string().nullable(),
  telegramOrderId: z.string().nullable(), state: z.string(), issue: z.string().nullable(),
  messageId: z.number().nullable(),
}));
export async function wakeCanvaTelegram(env: HubbyEnv) {
  if (!env.CANVA_TELEGRAM || !env.TELEGRAM_CONFIG) return { outcome: "unconfigured" };
  return env.CANVA_TELEGRAM.get(env.CANVA_TELEGRAM.idFromName("bite-owner"))
    .fetch("https://internal/run", { method: "POST" });
}
