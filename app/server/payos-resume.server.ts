import { z } from "zod";
import { payosCheckoutReady, safePayosUrl } from "./payos-checkout.server";
import { payosGuestHash } from "./payos-guest.server";
import { payosAdminClient } from "./payos-store.server";
import type { HubbyEnv } from "./runtime-context.server";

export interface PayosResumeGateway {
  rpc(name: string, params: Record<string, unknown>): Promise<unknown>;
}

function verifiedResumeUrl(value: unknown): string {
  if (typeof value !== "string")
    throw new Response(
      "Đơn không còn liên kết thanh toán hợp lệ. Vui lòng kiểm tra lại trạng thái hoặc liên hệ Hubby.",
      { status: 409 },
    );
  return safePayosUrl(value);
}

/** DB Auth JWT owns the order; the browser supplies only its order UUID. */
export async function resumeRegisteredPayosCheckout(
  orderId: string,
  gateway: PayosResumeGateway,
) {
  if (!z.uuid().safeParse(orderId).success)
    throw new Response("Không tìm thấy đơn hàng.", { status: 404 });
  return verifiedResumeUrl(
    await gateway.rpc("resume_registered_payos_link", { p_order: orderId }),
  );
}

/** Never pass a guest browser token to Supabase; only its SHA-256 digest. */
export async function resumeGuestPayosCheckout(
  code: string,
  email: string,
  token: string,
  gateway: PayosResumeGateway,
) {
  const normalizedCode = code.trim().toUpperCase();
  const normalizedEmail = email.trim().toLowerCase();
  if (
    !/^HB[A-F0-9]{16}$/.test(normalizedCode) ||
    !z.email().max(254).safeParse(normalizedEmail).success
  )
    throw new Response("Mã đơn hoặc email không hợp lệ.", { status: 400 });
  const proof = await payosGuestHash(token);
  return verifiedResumeUrl(
    await gateway.rpc("resume_guest_payos_link", {
      p_code: normalizedCode,
      p_email: normalizedEmail,
      p_guest_hash: proof,
    }),
  );
}

export function payosGuestResumeGateway(env: HubbyEnv): PayosResumeGateway {
  if (!payosCheckoutReady(env) || !env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY)
    throw new Response("Thanh toán trực tuyến chưa sẵn sàng.", {
      status: 503,
    });
  const client = payosAdminClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY);
  return {
    async rpc(name, params) {
      if (name !== "resume_guest_payos_link")
        throw new Response("Yêu cầu không hợp lệ.", { status: 400 });
      const { data, error } = await client.rpc(name, params);
      if (error)
        throw new Response(
          "Chưa thể xác minh liên kết. Vui lòng thử lại sau.",
          {
            status: 503,
          },
        );
      return data;
    },
  };
}

export function payosResumeRedirect(url: string): Response {
  return new Response(null, {
    status: 303,
    headers: {
      Location: safePayosUrl(url),
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
