import { parseCookieHeader, serializeCookieHeader } from "@supabase/ssr";
import type { RouterContextProvider } from "react-router";
import { runtimeContext } from "./runtime-context.server";

// An opaque browser-bound claim for guest orders. Never place this bearer
// secret in HTML, a query string, redirect URL, localStorage, or a log.
function guestCookieName(request: Request) {
  return new URL(request.url).protocol === "https:"
    ? "__Host-hubby-guest"
    : "hubby-local-guest";
}

export function readPayosGuestToken(request: Request) {
  const value = parseCookieHeader(request.headers.get("Cookie") ?? "").find(
    (cookie) => cookie.name === guestCookieName(request),
  )?.value;
  return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
}

export function issuePayosGuestToken(
  request: Request,
  context: Readonly<RouterContextProvider>,
) {
  const old = readPayosGuestToken(request);
  if (old) return old;
  const token = btoa(
    String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))),
  )
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
  const name = guestCookieName(request);
  context.get(runtimeContext).responseCookies.set(
    name,
    serializeCookieHeader(name, token, {
      httpOnly: true,
      secure: new URL(request.url).protocol === "https:",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    }),
  );
  return token;
}

export async function payosGuestHash(token: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token))
    throw new Response("Không có quyền xem đơn khách.", { status: 403 });
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)),
    ),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function lastGuestOrderCode(request: Request) {
  const value = parseCookieHeader(request.headers.get("Cookie") ?? "").find(
    (cookie) =>
      cookie.name ===
      (new URL(request.url).protocol === "https:"
        ? "__Host-hubby-last-order"
        : "hubby-local-last-order"),
  )?.value;
  return value && /^HB[A-F0-9]{16}$/.test(value) ? value : null;
}

export function rememberGuestOrder(
  request: Request,
  context: Readonly<RouterContextProvider>,
  orderId: string,
) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      orderId,
    )
  )
    throw new Response("Mã đơn hàng không hợp lệ.", { status: 503 });
  const code = `HB${orderId.replaceAll("-", "").slice(0, 16).toUpperCase()}`;
  const secure = new URL(request.url).protocol === "https:";
  const name = secure ? "__Host-hubby-last-order" : "hubby-local-last-order";
  context.get(runtimeContext).responseCookies.set(
    name,
    serializeCookieHeader(name, code, {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    }),
  );
}
