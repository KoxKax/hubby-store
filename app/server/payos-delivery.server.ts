import { z } from "zod";
import { payosFulfillmentReady } from "./payos-fulfillment.server";
import { payosAdminClient } from "./payos-store.server";
import type { HubbyEnv } from "./runtime-context.server";
import { openStockUnit, type StockKeyring } from "./stock-seal.server";

const sealedUnit = z
  .object({
    id: z.uuid(),
    variantId: z.uuid(),
    ciphertext: z.string().min(32).max(32000),
    nonce: z.string().min(16).max(32),
    key_version: z.number().int().min(1).max(1000),
  })
  .strict();
const sealedDelivery = z.array(sealedUnit).min(1).max(20);

export interface DeliveryReadGateway {
  rpc(
    name: "read_payos_delivery",
    args: { p_order: string; p_actor: string },
  ): Promise<unknown>;
}

// The authenticated user is checked against their order by customerOrder()
// in the route AND in the service-only SQL. Nothing is returned by loaders,
// logs or email. Guests intentionally cannot use this registered-user path.
export async function revealRegisteredPayosDelivery(
  orderId: string,
  actorId: string,
  gateway: DeliveryReadGateway,
  keys: StockKeyring,
) {
  if (
    !z.uuid().safeParse(orderId).success ||
    !z.uuid().safeParse(actorId).success
  )
    throw new Response("Không tìm thấy thông tin giao hàng.", { status: 404 });
  const raw = await gateway.rpc("read_payos_delivery", {
    p_order: orderId,
    p_actor: actorId,
  });
  if (raw === null)
    throw new Response("Thông tin giao hàng chưa sẵn sàng.", { status: 404 });
  return openVerifiedPayosDelivery(raw, keys);
}

// Only call after the trusted database function has checked the buyer's
// ownership and the fully settled/fulfilled state. This helper never grants
// access by itself; it only validates and decrypts approved sealed units.
export async function openVerifiedPayosDelivery(
  raw: unknown,
  keys: StockKeyring,
) {
  const parsed = sealedDelivery.safeParse(raw);
  if (
    !parsed.success ||
    new Set(parsed.data.map((u) => u.id)).size !== parsed.data.length
  )
    throw new Response("Thông tin giao hàng chưa sẵn sàng.", { status: 503 });
  try {
    const products = [];
    for (const stock of parsed.data) {
      products.push({
        stockId: stock.id,
        ...(await openStockUnit(
          { id: stock.id, variantId: stock.variantId },
          stock,
          keys,
        )),
      });
    }
    return products;
  } catch {
    throw new Response("Chưa thể giải mã sản phẩm. Vui lòng liên hệ Hubby.", {
      status: 503,
    });
  }
}

export function payosDeliveryGateway(env: HubbyEnv): DeliveryReadGateway {
  if (!payosFulfillmentReady(env))
    throw new Response("Chức năng nhận hàng chưa mở.", { status: 503 });
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SECRET_KEY;
  if (!url || !key)
    throw new Response("Chức năng nhận hàng chưa mở.", { status: 503 });
  const client = payosAdminClient(url, key);
  return {
    async rpc(name, args) {
      const { data, error } = await client.rpc(name, args);
      if (error)
        throw new Response("Chưa thể đọc thông tin giao hàng.", {
          status: 503,
        });
      return data;
    },
  };
}
