import { z } from "zod";
import { payosCheckoutReady } from "./payos-checkout.server";
import type { HubbyEnv } from "./runtime-context.server";

export class PayosWebhookSetupError extends Error {
  constructor(public readonly publicMessage: string) { super(publicMessage); }
}

// Official payOS gateway source confirms POST /confirm-webhook + webhookUrl.
// Keys are read only by this server module; destination cannot be supplied by a form.
export async function registerHubbyPayosWebhook(env: HubbyEnv) {
  if (!payosCheckoutReady(env) || !env.PAYOS_CLIENT_ID || !env.PAYOS_API_KEY)
    throw new PayosWebhookSetupError("Chưa đủ cấu hình payOS trên máy chủ. Cần Client ID, API Key, Checksum Key và cấu hình thanh toán đang bật.");
  let response: Response;
  try {
    response = await fetch(
    "https://api-merchant.payos.vn/confirm-webhook",
    {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(20_000),
      headers: {
        "Content-Type": "application/json",
        "x-client-id": env.PAYOS_CLIENT_ID,
        "x-api-key": env.PAYOS_API_KEY,
      },
      body: JSON.stringify({
        webhookUrl: "https://hubby.dpdns.org/webhooks/payos",
      }),
    },
    );
  } catch (error) {
    const name = error instanceof Error ? error.name : "unknown";
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    const kind = name === "TimeoutError" ? "timeout" : message.includes("redirect") ? "redirect" : message.includes("header") ? "header" : "network";
    console.warn("payOS webhook registration transport failure", { kind });
    throw new PayosWebhookSetupError(`Không kết nối được API payOS (${kind}). Chưa đăng ký địa chỉ nhận thông báo.`);
  }
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    let destination = "missing";
    try { const url = new URL(location ?? "", "https://api-merchant.payos.vn"); destination = `${url.origin}${url.pathname}`; } catch { destination = "invalid"; }
    console.warn("payOS webhook registration redirect", { httpStatus: response.status, destination });
    throw new PayosWebhookSetupError(`API payOS chuyển hướng yêu cầu (HTTP ${response.status}). Cần cập nhật địa chỉ API trước khi kết nối.`);
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Webhook configuration unavailable");
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 16_000) {
      await reader.cancel();
      throw new Error("Webhook configuration unavailable");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  let body: unknown;
  try { body = JSON.parse(new TextDecoder().decode(bytes)); }
  catch {
    console.warn("payOS webhook registration non-JSON response", { httpStatus: response.status });
    throw new PayosWebhookSetupError(`API payOS trả về phản hồi không đúng định dạng (HTTP ${response.status}).`);
  }
  const result = z.object({ code: z.string().max(20) }).safeParse(body);
  if (!response.ok || !result.success || result.data.code !== "00") {
    const code = result.success && /^[A-Za-z0-9_-]{1,20}$/.test(result.data.code) ? result.data.code : "unknown";
    console.warn("payOS webhook registration rejected", { httpStatus: response.status, providerCode: code });
    throw new PayosWebhookSetupError(`Chưa kết nối được thông báo payOS (HTTP ${response.status}, mã ${code}). Kiểm tra thông tin kênh payOS và địa chỉ nhận thông báo.`);
  }
  const channel = z.object({ data: z.object({ accountNumber: z.string().min(4).max(40), webhookUrl: z.literal("https://hubby.dpdns.org/webhooks/payos") }) }).safeParse(body);
  if (!channel.success) throw new PayosWebhookSetupError("payOS chưa trả đủ thông tin tài khoản nhận tiền để đối chiếu.");
  return { receivingAccount: channel.data.data.accountNumber };
}
