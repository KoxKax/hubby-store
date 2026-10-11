import { parseCookieHeader } from "@supabase/ssr";
import type { RouterContextProvider } from "react-router";
import { runtimeContext } from "./runtime-context.server";
import { digest } from "./seal.server";
export function localEnabled(
  request: Request,
  context: Readonly<RouterContextProvider>,
) {
  const env = context.get(runtimeContext).env;
  const url = new URL(request.url);
  return (
    env.APP_ENV === "local" &&
    env.DATA_MODE === "fixtures" &&
    env.PAYMENTS_MODE === "mock" &&
    env.SUPPLIERS_MODE === "mock" &&
    ["localhost", "127.0.0.1"].includes(url.hostname)
  );
}
async function guest(
  request: Request,
  context: Readonly<RouterContextProvider>,
) {
  const state = context.get(runtimeContext);
  if (state.guestActor) return state.guestActor;
  let token = parseCookieHeader(request.headers.get("Cookie") ?? "").find(
    (c) => c.name === "hubby-demo-session",
  )?.value;
  if (!token || !/^[a-zA-Z0-9_-]{43}$/.test(token)) {
    token = btoa(
      String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))),
    )
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replaceAll("=", "");
    state.responseCookies.set(
      "hubby-demo-session",
      `hubby-demo-session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400`,
    );
  }
  // Per-request state only; never keep a session in a shared Env object.
  state.guestActor = digest(token);
  return state.guestActor;
}
export async function localCall<T>(
  request: Request,
  context: Readonly<RouterContextProvider>,
  command: Record<string, unknown>,
): Promise<T> {
  if (!localEnabled(request, context))
    throw new Response("Commerce local non disponible", { status: 503 });
  const env = context.get(runtimeContext).env;
  const actor = await guest(request, context);
  if (!env.LOCAL_SHOP)
    throw new Response("Chưa bật kho thử nghiệm local", { status: 503 });
  const response = await env.LOCAL_SHOP.get(
    env.LOCAL_SHOP.idFromName("hubby-synthetic-v1"),
  ).fetch("https://local-shop.internal/", {
    method: "POST",
    body: JSON.stringify({ ...command, actor }),
  });
  if (!response.ok) {
    if (response.status === 401)
      context
        .get(runtimeContext)
        .responseCookies.set(
          "hubby-demo-session",
          "hubby-demo-session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0",
        );
    const body = (await response.json()) as { error: string };
    throw new Response(body.error, { status: response.status });
  }
  return response.json() as Promise<T>;
}
