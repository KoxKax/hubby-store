import type { HubbyEnv } from "./runtime-context.server";
export function dataConfig(env: HubbyEnv) {
  if (!env.DATA_MODE || env.DATA_MODE === "fixtures") return null;
  if (
    env.DATA_MODE !== "supabase" ||
    env.APP_ENV === "production" ||
    env.SUPABASE_ENVIRONMENT !== "staging" ||
    (env.PAYMENTS_MODE !== "mock" && env.PAYMENTS_MODE !== "payos") ||
    !["mock", "bite"].includes(env.SUPPLIERS_MODE ?? "")
  )
    throw new Response("Cấu hình staging chưa hợp lệ", { status: 503 });
  const url = new URL(env.SUPABASE_URL ?? "https://not-configured.invalid");
  const loopback = ["localhost", "127.0.0.1"].includes(url.hostname);
  if (
    (!loopback &&
      (!url.hostname.endsWith(".supabase.co") || url.protocol !== "https:")) ||
    (loopback && env.APP_ENV !== "local") ||
    url.username ||
    url.password ||
    !env.SUPABASE_PUBLISHABLE_KEY ||
    !env.SITE_ORIGIN
  )
    throw new Response("Cần cấu hình Supabase staging", { status: 503 });
  if (!env.SUPABASE_PUBLISHABLE_KEY.startsWith("sb_publishable_"))
    throw new Response(
      "Chỉ chấp nhận publishable key, không dùng service key",
      { status: 503 },
    );
  const origin = new URL(env.SITE_ORIGIN);
  if (
    origin.origin !== env.SITE_ORIGIN ||
    (origin.protocol !== "https:" &&
      !["localhost", "127.0.0.1"].includes(origin.hostname))
  )
    throw new Response("Site origin không hợp lệ", { status: 503 });
  return {
    url: url.origin,
    key: env.SUPABASE_PUBLISHABLE_KEY,
    origin: origin.origin,
  };
}
