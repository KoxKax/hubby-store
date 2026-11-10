import { syncBiteCatalog } from "./bite-catalog.server";
import {
  expireUnsubmittedPayosCheckouts,
  type PayosExpiryGateway,
  payosExpiryGateway,
  payosExpiryReady,
} from "./payos-expiry.server";
import {
  type FulfillmentGateway,
  type FulfillmentResult,
  fulfillNextPayosOrder,
  payosFulfillmentGateway,
  payosFulfillmentReady,
} from "./payos-fulfillment.server";
import type { HubbyEnv } from "./runtime-context.server";
import { runBiteSupplierPass } from "./supplier.server";

// A scheduled pass is intentionally small enough for the Workers Free tier.
// The hosted mock Worker stays inert; supplier POSTs need separate gates.
const MAX_DELIVERIES_PER_PASS = 3;
const EXPIRE_UNSUBMITTED_PER_PASS = 10;

type MaintenanceDependencies = {
  fulfillment: FulfillmentGateway;
  expiry: PayosExpiryGateway;
};

export type PayosMaintenanceResult =
  | { outcome: "disabled" }
  | {
      outcome: "processed";
      delivered: number;
      held: number;
      expiredUnsubmitted: number;
    };

/**
 * Recover paid orders that remain in the delivery outbox, and release only
 * checkouts that never attempted to contact payOS. SQL owns both leases and
 * the final decision; provider-ambiguous reservations are never expired here.
 */
export async function runPayosMaintenancePass(
  env: HubbyEnv,
  dependencies?: MaintenanceDependencies,
): Promise<PayosMaintenanceResult> {
  if (!dependencies) {
    try {
      await syncBiteCatalog(env);
    } catch {
      /* Keep previous cache; checkout rejects stale offers. */
    }
  }
  if (!payosFulfillmentReady(env) || !payosExpiryReady(env))
    return { outcome: "disabled" };

  const key = env.INVENTORY_ENCRYPTION_KEY_V1;
  if (!key) return { outcome: "disabled" };
  const fulfillment = dependencies?.fulfillment ?? payosFulfillmentGateway(env);
  const expiry = dependencies?.expiry ?? payosExpiryGateway(env);
  // Bounded provider work; original idempotency identity survives lost responses.
  if (!dependencies) {
    try {
      await runBiteSupplierPass(env);
    } catch {
      /* Continue local delivery/expiry; supplier evidence stays private. */
    }
  }
  let delivered = 0;
  let held = 0;

  for (let i = 0; i < MAX_DELIVERIES_PER_PASS; i++) {
    const result: FulfillmentResult = await fulfillNextPayosOrder(fulfillment, {
      1: key,
    });
    if (result.outcome === "idle") break;
    if (result.outcome === "delivered") delivered++;
    if (result.outcome === "held") held++;
  }

  const expiredUnsubmitted = await expireUnsubmittedPayosCheckouts(
    expiry,
    EXPIRE_UNSUBMITTED_PER_PASS,
  );
  return { outcome: "processed", delivered, held, expiredUnsubmitted };
}
