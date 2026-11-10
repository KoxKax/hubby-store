import { describe, expect, it, vi } from "vitest";
import { runPayosMaintenancePass } from "../app/server/payos-maintenance.server";
import type { HubbyEnv } from "../app/server/runtime-context.server";
import { sealStockUnit } from "../app/server/stock-seal.server";

const key = "ab".repeat(32);
const orderId = "11111111-1111-4111-8111-111111111111";
const lease = "22222222-2222-4222-8222-222222222222";
const variantId = "33333333-3333-4333-8333-333333333333";
const stockId = "44444444-4444-4444-8444-444444444444";

function env(overrides: Partial<HubbyEnv> = {}): HubbyEnv {
  return {
    APP_ENV: "staging",
    DATA_MODE: "supabase",
    SUPABASE_ENVIRONMENT: "staging",
    SUPPLIERS_MODE: "mock",
    PAYMENTS_MODE: "payos",
    PAYOS_CHECKOUT_READY: "true",
    SUPABASE_URL: "https://synthetic.supabase.co",
    SUPABASE_SECRET_KEY: "sb_secret_synthetic",
    PAYOS_CLIENT_ID: "synthetic-client",
    PAYOS_API_KEY: "synthetic-api",
    PAYOS_CHECKSUM_KEY: "synthetic-checksum",
    SITE_ORIGIN: "https://synthetic.example",
    INVENTORY_ENCRYPTION_KEY_V1: key,
    ...overrides,
  } as HubbyEnv;
}

function dependencies(claim: () => unknown, expiryResult: unknown = 0) {
  const fulfillmentRpc = vi.fn(async (name: string) => {
    if (name === "claim_payos_fulfillment") return claim();
    if (name === "complete_payos_fulfillment") return true;
    if (name === "fail_payos_fulfillment") return true;
    throw new Error("Unexpected fulfillment RPC");
  });
  const expiryRpc = vi.fn(async () => expiryResult);
  return {
    fulfillment: { rpc: fulfillmentRpc },
    expiry: { rpc: expiryRpc },
    fulfillmentRpc,
    expiryRpc,
  };
}

describe("bounded payOS scheduled maintenance without cloud access", () => {
  it("does nothing on hosted mock payment mode or missing encryption", async () => {
    const deps = dependencies(() => null);
    expect(
      await runPayosMaintenancePass(env({ PAYMENTS_MODE: "mock" }), deps),
    ).toEqual({ outcome: "disabled" });
    expect(
      await runPayosMaintenancePass(
        env({ INVENTORY_ENCRYPTION_KEY_V1: undefined }),
        deps,
      ),
    ).toEqual({ outcome: "disabled" });
    expect(deps.fulfillmentRpc).not.toHaveBeenCalled();
    expect(deps.expiryRpc).not.toHaveBeenCalled();
  });

  it("delivers verified encrypted stock and stops on an idle queue", async () => {
    const encrypted = await sealStockUnit(
      { id: stockId, variantId },
      { type: "license_key", licenseKey: "FAKE-KEY-FOR-TEST" },
      1,
      { 1: key },
    );
    let attempts = 0;
    const deps = dependencies(() =>
      attempts++ === 0
        ? {
            orderId,
            lease,
            units: [{ id: stockId, variantId, ...encrypted }],
          }
        : null,
    );
    deps.expiryRpc.mockResolvedValue(2);
    expect(await runPayosMaintenancePass(env(), deps)).toEqual({
      outcome: "processed",
      delivered: 1,
      held: 0,
      expiredUnsubmitted: 2,
    });
    expect(deps.fulfillmentRpc.mock.calls.map((call) => call[0])).toEqual([
      "claim_payos_fulfillment",
      "complete_payos_fulfillment",
      "claim_payos_fulfillment",
    ]);
    expect(deps.expiryRpc).toHaveBeenCalledWith(
      "expire_unsubmitted_payos_checkouts",
      { p_limit: 10 },
    );
  });

  it("caps failures to three durable attempts per pass", async () => {
    const deps = dependencies(() => ({ orderId, lease, units: [] }));
    expect(await runPayosMaintenancePass(env(), deps)).toEqual({
      outcome: "processed",
      delivered: 0,
      held: 3,
      expiredUnsubmitted: 0,
    });
    expect(
      deps.fulfillmentRpc.mock.calls.filter(
        ([name]) => name === "claim_payos_fulfillment",
      ),
    ).toHaveLength(3);
    expect(
      deps.fulfillmentRpc.mock.calls.filter(
        ([name]) => name === "fail_payos_fulfillment",
      ),
    ).toHaveLength(3);
  });

  it("never reports a completed pass if durable reservation cleanup failed", async () => {
    const deps = dependencies(() => null, "ambiguous");
    await expect(runPayosMaintenancePass(env(), deps)).rejects.toThrow();
  });

  it("stops after a failed outbox RPC without releasing any stock", async () => {
    const deps = dependencies(() => null);
    deps.fulfillmentRpc.mockRejectedValue(new Error("Database unavailable"));
    await expect(runPayosMaintenancePass(env(), deps)).rejects.toThrow(
      "Database unavailable",
    );
    expect(deps.expiryRpc).not.toHaveBeenCalled();
  });
});
