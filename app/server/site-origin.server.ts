import type { HubbyEnv } from "./runtime-context.server";

// A server-configured alias, never a suffix/wildcard or forwarded Host header.
// Preserve independent host cookies and same-origin CSRF on both public URLs.
export function siteEnvForRequest(request: Request, env: HubbyEnv): HubbyEnv {
  if (!env.SITE_ALIAS) return env;
  let alias: URL;
  try {
    alias = new URL(env.SITE_ALIAS);
  } catch {
    throw new Response("Tên miền chưa được cấu hình đúng.", { status: 503 });
  }
  if (
    alias.protocol !== "https:" ||
    alias.origin !== env.SITE_ALIAS ||
    alias.username ||
    alias.password
  )
    throw new Response("Tên miền chưa được cấu hình đúng.", { status: 503 });
  return new URL(request.url).origin === alias.origin
    ? { ...env, SITE_ORIGIN: alias.origin }
    : env;
}
