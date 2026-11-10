import {
  createServerClient,
  parseCookieHeader,
  serializeCookieHeader,
} from "@supabase/ssr";
import { type RouterContextProvider, redirect } from "react-router";
import { safeNext } from "../domain/request-security";
import { dataConfig } from "./config.server";
import {
  runtimeContext,
  type VerifiedIdentity,
} from "./runtime-context.server";

export function requestClient(
  request: Request,
  context: Readonly<RouterContextProvider>,
) {
  const runtime = context.get(runtimeContext);
  if (runtime.client) return runtime.client;
  const config = dataConfig(runtime.env);
  if (!config)
    throw new Response(
      "Đăng nhập và quản trị staging chưa được cấu hình. Dùng CMS local demo để thử nội dung.",
      { status: 503 },
    );
  if (new URL(request.url).origin !== config.origin)
    throw new Response("Origin không khớp staging", { status: 503 });
  const jar = new Map(
    parseCookieHeader(request.headers.get("Cookie") ?? "").map((c) => [
      c.name,
      c.value,
    ]),
  );
  runtime.client = createServerClient(config.url, config.key, {
    auth: { flowType: "pkce" },
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          signal: AbortSignal.any([
            ...(init?.signal ? [init.signal] : []),
            AbortSignal.timeout(10_000),
          ]),
        }),
    },
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (cookies, headers) => {
        for (const { name, value, options } of cookies) {
          jar.set(name, value);
          runtime.responseCookies.set(
            name,
            serializeCookieHeader(name, value, {
              ...options,
              httpOnly: true,
              secure: new URL(request.url).protocol === "https:",
              sameSite: "lax",
              path: "/",
            }),
          );
        }
        for (const [name, value] of Object.entries(headers))
          runtime.responseHeaders.set(name, value);
      },
    },
  });
  return runtime.client;
}
export async function identity(
  request: Request,
  context: Readonly<RouterContextProvider>,
): Promise<VerifiedIdentity | null> {
  const runtime = context.get(runtimeContext);
  const config = dataConfig(runtime.env);
  if (!config) return null;
  runtime.identity ??= (async () => {
    const client = requestClient(request, context);
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) return null;
    const status = await client.rpc("owner_status");
    const raw = status.error ? null : status.data;
    return {
      id: data.user.id,
      email: data.user.email ?? "",
      emailVerified: Boolean(data.user.email && data.user.email_confirmed_at),
      owner: raw?.owner === true,
      aal2: raw?.aal2 === true,
      // Owner authorized password-only access, including the eventual live site.
      // Require a trusted DB policy bound to this exact verified Auth project.
      // Missing/malformed policy or a different issuer always retains MFA.
      mfaRequired:
        raw?.mfa_required !== false ||
        raw?.password_only_issuer !== `${config.url}/auth/v1`,
    };
  })();
  return runtime.identity;
}
export async function requireOwner(
  request: Request,
  context: Readonly<RouterContextProvider>,
  appUrl = new URL(request.url),
) {
  requestClient(request, context);
  const user = await identity(request, context);
  if (!user)
    throw redirect(
      `/dang-nhap?next=${encodeURIComponent(safeNext(appUrl.pathname + appUrl.search))}`,
    );
  if (!user.owner)
    throw new Response("Chỉ Owner được truy cập", { status: 403 });
  if (!user.aal2 && user.mfaRequired)
    throw redirect(
      `/xac-thuc?next=${encodeURIComponent(safeNext(appUrl.pathname + appUrl.search, "/admin"))}`,
    );
  return { user, client: requestClient(request, context) };
}

// Navigation only: destination pages still enforce their own server/RLS guards.
export async function signedInDestination(
  request: Request,
  context: Readonly<RouterContextProvider>,
  requestedNext: unknown,
) {
  // Login/callback can replace a session already inspected earlier this request.
  context.get(runtimeContext).identity = undefined;
  const user = await identity(request, context);
  if (!user)
    throw new Response("Chưa xác minh được phiên đăng nhập", { status: 401 });
  const next = safeNext(requestedNext);
  if (user.owner && next === "/tai-khoan")
    return user.aal2 || !user.mfaRequired
      ? "/admin"
      : "/xac-thuc?next=%2Fadmin";
  return next;
}
