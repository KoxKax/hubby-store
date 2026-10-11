import { parseCookieHeader, serializeCookieHeader } from "@supabase/ssr";
import type { RouterContextProvider } from "react-router";
import { checkOrigin, equalToken } from "../domain/request-security";
import { runtimeContext } from "./runtime-context.server";

function csrfName(request: Request) {
  return new URL(request.url).protocol === "https:"
    ? "__Host-hubby-csrf"
    : "hubby-local-csrf";
}
export function csrfToken(
  request: Request,
  context: Readonly<RouterContextProvider>,
) {
  const runtime = context.get(runtimeContext);
  if (runtime.csrfToken) return runtime.csrfToken;
  const name = csrfName(request);
  const existing = parseCookieHeader(request.headers.get("Cookie") ?? "").find(
    (c) => c.name === name,
  )?.value;
  const token =
    existing && /^[A-Za-z0-9_-]{43}$/.test(existing)
      ? existing
      : btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=/g, "");
  runtime.csrfToken = token;
  if (token !== existing)
    runtime.responseCookies.set(
      name,
      serializeCookieHeader(name, token, {
        httpOnly: true,
        secure: new URL(request.url).protocol === "https:",
        sameSite: "lax",
        path: "/",
        maxAge: 3600,
      }),
    );
  return token;
}
export async function secureForm(request: Request, limit = 150_000) {
  checkOrigin(request);
  const type = request.headers.get("Content-Type") ?? "";
  if (
    !type.startsWith("application/x-www-form-urlencoded") &&
    !type.startsWith("multipart/form-data")
  )
    throw new Response("Định dạng không hợp lệ", { status: 415 });
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader)
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new Response("Dữ liệu quá lớn", { status: 413 });
      }
      chunks.push(value);
    }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const form = await new Response(bytes, {
    headers: { "Content-Type": type },
  }).formData();
  const cookie =
    parseCookieHeader(request.headers.get("Cookie") ?? "").find(
      (c) => c.name === csrfName(request),
    )?.value ?? "";
  if (!equalToken(cookie, String(form.get("csrf") ?? "")))
    throw new Response("Phiên biểu mẫu hết hạn, vui lòng tải lại", {
      status: 403,
    });
  return form;
}
