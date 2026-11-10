import { z } from "zod";
import { payosAdminClient } from "./payos-store.server";
import type { HubbyEnv } from "./runtime-context.server";
import { openStockUnit, type StockKeyring } from "./stock-seal.server";

const claimed = z
  .object({
    orderId: z.uuid(),
    lease: z.uuid(),
    units: z.array(z.unknown()).max(20),
  })
  .strict();
const unit = z
  .object({
    id: z.uuid(),
    variantId: z.uuid(),
    ciphertext: z.string().min(32).max(32000),
    nonce: z.string().min(16).max(32),
    key_version: z.number().int().min(1).max(1000),
  })
  .strict();

export interface FulfillmentGateway {
  rpc(name: string, values: Record<string, unknown>): Promise<unknown>;
}

export interface FulfillmentResult {
  outcome: "idle" | "delivered" | "held";
  orderId?: string;
}

function unavailable(): never {
  throw new Error("Fulfillment is not safely configured");
}

// No other code may run the Worker with an unverified provider or fake stock.
export function payosFulfillmentReady(env: HubbyEnv) {
  return (
    env.APP_ENV === "staging" &&
    env.DATA_MODE === "supabase" &&
    env.SUPABASE_ENVIRONMENT === "staging" &&
    env.PAYMENTS_MODE === "payos" &&
    env.PAYOS_CHECKOUT_READY === "true" &&
    !!env.SUPABASE_URL &&
    !!env.SUPABASE_SECRET_KEY &&
    !!env.INVENTORY_ENCRYPTION_KEY_V1 &&
    /^[0-9a-f]{64}$/i.test(env.INVENTORY_ENCRYPTION_KEY_V1)
  );
}

// A single attempt does not perform any external supplier purchase or send
// plaintext stock in mail/logs. SQL atomically delivers exactly what was paid.
export async function fulfillNextPayosOrder(
  gateway: FulfillmentGateway,
  keys: StockKeyring,
): Promise<FulfillmentResult> {
  const raw = await gateway.rpc("claim_payos_fulfillment", {});
  if (raw === null) return { outcome: "idle" };
  const work = claimed.parse(raw);
  const params = { p_order: work.orderId, p_lease: work.lease };
  let issue: "stock_mismatch" | "decrypt_failed" | "service_unavailable" =
    "stock_mismatch";
  try {
    if (work.units.length < 1) throw new Error("No stock units reserved");
    const seen = new Set<string>();
    for (const row of work.units) {
      const stock = unit.safeParse(row);
      if (!stock.success || seen.has(stock.data.id))
        throw new Error("Invalid stock unit list");
      seen.add(stock.data.id);
      if (!keys[stock.data.key_version]) {
        issue = "service_unavailable";
        throw new Error("Stock key version unavailable");
      }
      issue = "decrypt_failed";
      await openStockUnit(
        { id: stock.data.id, variantId: stock.data.variantId },
        stock.data,
        keys,
      );
      issue = "stock_mismatch";
    }
    // A failed completion RPC signals an uncertain storage/lease state, not bad stock.
    issue = "service_unavailable";
    if ((await gateway.rpc("complete_payos_fulfillment", params)) !== true)
      throw new Error("Delivery reservation changed");
    return { outcome: "delivered", orderId: work.orderId };
  } catch {
    // Failure state is durable and retried with capped backoff by the DB.
    // If this RPC fails, the lease expires and the next operator/cron can retry.
    await gateway.rpc("fail_payos_fulfillment", {
      ...params,
      p_issue: issue,
    });
    return { outcome: "held", orderId: work.orderId };
  }
}

export function payosFulfillmentGateway(env: HubbyEnv): FulfillmentGateway {
  if (!payosFulfillmentReady(env)) unavailable();
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SECRET_KEY;
  if (!url || !key) unavailable();
  const client = payosAdminClient(url, key);
  return {
    async rpc(name, values) {
      if (
        ![
          "claim_payos_fulfillment",
          "complete_payos_fulfillment",
          "fail_payos_fulfillment",
        ].includes(name)
      )
        unavailable();
      const { data, error } = await client.rpc(name, values);
      if (error) throw new Error("Fulfillment storage unavailable");
      return data;
    },
  };
}

export async function runPayosFulfillment(env: HubbyEnv) {
  if (!payosFulfillmentReady(env)) return { outcome: "disabled" as const };
  const key = env.INVENTORY_ENCRYPTION_KEY_V1;
  if (!key) unavailable();
  // One order per invocation is intentionally bounded on Workers Free.
  return fulfillNextPayosOrder(payosFulfillmentGateway(env), { 1: key });
}
