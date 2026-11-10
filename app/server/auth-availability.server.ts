import type { RouterContextProvider } from "react-router";
import { dataConfig } from "./config.server";
import { runtimeContext } from "./runtime-context.server";

// Public provider settings only. No user sessions, secrets or authorization
// decisions are cached here; trusted identity is verified separately.
export function authAvailability(
  request: Request,
  context: Readonly<RouterContextProvider>,
) {
  const runtime = context.get(runtimeContext);
  const config = dataConfig(runtime.env);
  if (!config)
    return Promise.resolve({ available: false, email: false, google: false });
  if (new URL(request.url).origin !== config.origin)
    return Promise.resolve({ available: false, email: false, google: false });
  runtime.authAvailability ??= (async () => {
    try {
      const response = await fetch(`${config.url}/auth/v1/settings`, {
        headers: { apikey: config.key },
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok)
        return { available: false, email: false, google: false };
      const settings: unknown = await response.json();
      if (
        !settings ||
        typeof settings !== "object" ||
        !("external" in settings) ||
        !settings.external ||
        typeof settings.external !== "object"
      )
        return { available: false, email: false, google: false };
      const external = settings.external as Record<string, unknown>;
      return {
        available: true,
        email: external.email === true,
        google: external.google === true,
      };
    } catch {
      return { available: false, email: false, google: false };
    }
  })();
  return runtime.authAvailability;
}

export function emailServiceFailure(code: string | undefined) {
  switch (code) {
    case "email_address_not_authorized":
      return "Email này chưa được dịch vụ gửi thư của bản thử cho phép. Cần hoàn tất cấu hình email trước khi đăng ký.";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "Đã tới giới hạn gửi email. Bạn chờ một lúc rồi thử lại nhé.";
    case "email_provider_disabled":
    case "signup_disabled":
    case "unexpected_failure":
      return "Chưa thể gửi email xác nhận. Vui lòng thử lại sau.";
    default:
      return null;
  }
}
