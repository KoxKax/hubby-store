import { createRequestHandler, RouterContextProvider } from "react-router";
import { runtimeContext } from "../app/server/runtime-context.server";

export { LocalShop } from "./local-shop";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

export default {
  async fetch(request, env, ctx) {
    const context = new RouterContextProvider();
    const runtime = {
      env,
      ctx,
      responseHeaders: new Headers(),
      responseCookies: new Map<string, string>(),
    };
    context.set(runtimeContext, runtime);
    const response = await requestHandler(request, context);
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("X-Frame-Options", "DENY");
    response.headers.set(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=()",
    );
    for (const [name, value] of runtime.responseHeaders)
      response.headers.set(name, value);
    for (const cookie of runtime.responseCookies.values())
      response.headers.append("Set-Cookie", cookie);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  },
} satisfies ExportedHandler<Env>;
