import { parseCookieHeader, serializeCookieHeader } from "@supabase/ssr";
import type { RouterContextProvider } from "react-router";
import { type Theme, themeValue } from "../domain/theme";
import { runtimeContext } from "./runtime-context.server";

function themeName(request: Request) {
  return new URL(request.url).protocol === "https:"
    ? "__Host-hubby-theme"
    : "hubby-theme";
}
export function readTheme(request: Request) {
  return themeValue(
    parseCookieHeader(request.headers.get("Cookie") ?? "").find(
      (c) => c.name === themeName(request),
    )?.value,
  );
}
export function saveTheme(
  request: Request,
  context: Readonly<RouterContextProvider>,
  theme: Theme,
) {
  const name = themeName(request);
  context.get(runtimeContext).responseCookies.set(
    name,
    serializeCookieHeader(name, theme, {
      httpOnly: true,
      secure: new URL(request.url).protocol === "https:",
      sameSite: "lax",
      path: "/",
      maxAge: 31_536_000,
    }),
  );
}
