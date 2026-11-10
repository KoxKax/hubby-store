import { z } from "zod";
import { commerceOrderSchema } from "./commerce-repository.server";
import { payosCheckoutReady } from "./payos-checkout.server";
import { openVerifiedPayosDelivery } from "./payos-delivery.server";
import { payosGuestHash } from "./payos-guest.server";
import { payosAdminClient } from "./payos-store.server";
import type { HubbyEnv } from "./runtime-context.server";

export interface GuestOrderGateway {
  rpc(
    name: "guest_order_by_proof" | "read_guest_payos_delivery",
    args: { p_code: string; p_email: string; p_guest_hash: string },
  ): Promise<unknown>;
}

function trustedGuestInput(code: string, email: string) {
  const normalizedCode = code.trim().toUpperCase();
  const normalizedEmail = email.trim().toLowerCase();
  if (
    !/^HB[A-F0-9]{16}$/.test(normalizedCode) ||
    !z.email().max(254).safeParse(normalizedEmail).success
  )
    throw new Response("Mã đơn hoặc email không hợp lệ.", { status: 400 });
  return { normalizedCode, normalizedEmail };
}

export async function guestOrderWithProof(
  code: string,
  email: string,
  token: string,
  gateway: GuestOrderGateway,
) {
  const { normalizedCode, normalizedEmail } = trustedGuestInput(code, email);
  const raw = await gateway.rpc("guest_order_by_proof", {
    p_code: normalizedCode,
    p_email: normalizedEmail,
    p_guest_hash: await payosGuestHash(token),
  });
  if (raw === null) return null;
  const order = commerceOrderSchema.safeParse(raw);
  if (!order.success)
    throw new Response("Chưa thể xác minh đơn hàng.", { status: 503 });
  return order.data;
}

export async function revealGuestPayosDelivery(
  code: string,
  email: string,
  token: string,
  gateway: GuestOrderGateway,
  key: string,
) {
  const { normalizedCode, normalizedEmail } = trustedGuestInput(code, email);
  const raw = await gateway.rpc("read_guest_payos_delivery", {
    p_code: normalizedCode,
    p_email: normalizedEmail,
    p_guest_hash: await payosGuestHash(token),
  });
  if (raw === null)
    throw new Response(
      "Đơn chưa giao xong hoặc thông tin tra cứu không khớp.",
      {
        status: 404,
      },
    );
  return openVerifiedPayosDelivery(raw, { 1: key });
}

export function guestOrderGateway(env: HubbyEnv): GuestOrderGateway {
  if (!payosCheckoutReady(env))
    throw new Response("Tra cứu đơn khách chưa mở.", { status: 503 });
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SECRET_KEY;
  if (!url || !key)
    throw new Response("Tra cứu đơn khách chưa mở.", { status: 503 });
  const client = payosAdminClient(url, key);
  return {
    async rpc(name, args) {
      const { data, error } = await client.rpc(name, args);
      if (error)
        throw new Response("Tra cứu đang gián đoạn. Vui lòng thử lại.", {
          status: 503,
        });
      return data;
    },
  };
}
