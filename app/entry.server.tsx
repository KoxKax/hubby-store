import { isbot } from "isbot";
import { renderToReadableStream } from "react-dom/server";
import { type EntryContext, ServerRouter } from "react-router";

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
) {
  let status = responseStatusCode;
  const body = await renderToReadableStream(
    <ServerRouter context={routerContext} url={request.url} />,
    {
      signal: request.signal,
      onError() {
        status = 500;
        // Keep exception payloads out of logs until redacted logging is configured.
      },
    },
  );
  if (isbot(request.headers.get("user-agent") ?? "")) {
    await body.allReady;
  }
  responseHeaders.set("Content-Type", "text/html; charset=utf-8");
  return new Response(body, { status, headers: responseHeaders });
}

export function handleError() {
  // Phase 0 has no error telemetry; production redacted logging is a later gate.
}
