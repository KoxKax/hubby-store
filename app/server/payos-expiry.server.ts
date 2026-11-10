import { z } from "zod";
import { payosCheckoutReady } from "./payos-checkout.server";
import { payosAdminClient } from "./payos-store.server";
import type { HubbyEnv } from "./runtime-context.server";

export interface PayosExpiryGateway {
  rpc(
    name: "expire_unsubmitted_payos_checkouts",
    params: { p_limit: number },
  ): Promise<unknown>;
}

export function payosExpiryReady(env: HubbyEnv): boolean {
  return payosCheckoutReady(env);
}

// The query cannot reclaim attempted, linked, paid or ambiguous checkouts.
// A bounded operator-triggered pass allows safe stock recovery without a
// scheduled job while staging payment gates remain closed on the public site.
export async function expireUnsubmittedPayosCheckouts(
  gateway: PayosExpiryGateway,
  limit = 10,
): Promise<number> {
  const requested = z.number().int().min(1).max(20).parse(limit);
  const value = await gateway.rpc("expire_unsubmitted_payos_checkouts", {
    p_limit: requested,
  });
  return z.number().int().min(0).max(requested).parse(value);
}

export function payosExpiryGateway(env: HubbyEnv): PayosExpiryGateway {
  if (!payosExpiryReady(env))
    throw new Error("Payment maintenance is disabled");
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Payment maintenance unavailable");
  const client = payosAdminClient(url, key);
  return {
    async rpc(name, params) {
      if (name !== "expire_unsubmitted_payos_checkouts")
        throw new Error("Unsupported maintenance operation");
      const { data, error } = await client.rpc(name, params);
      if (error) throw new Error("Payment maintenance storage unavailable");
      return data;
    },
  };
}
