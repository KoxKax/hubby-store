import { describe, expect, it, vi } from "vitest";
import {
  type FulfillmentGateway,
  fulfillNextPayosOrder,
  payosFulfillmentReady,
} from "../app/server/payos-fulfillment.server";
import type { HubbyEnv } from "../app/server/runtime-context.server";
import { sealStockUnit } from "../app/server/stock-seal.server";

const keys = { 1: "ab".repeat(32) };
const orderId = "11111111-1111-4111-8111-111111111111";
const lease = "22222222-2222-4222-8222-222222222222";
const variantId = "33333333-3333-4333-8333-333333333333";
const stockId = "44444444-4444-4444-8444-444444444444";

async function encryptedUnit(id = stockId) {
  const encrypted = await sealStockUnit(
    { id, variantId },
    { type: "license_key", licenseKey: "SYNTHETIC-NEVER-DELIVER" },
    1,
    keys,
  );
  return { id, variantId, ...encrypted };
}

function fakeGateway(units: unknown[], completion: unknown = true) {
  const rpc = vi.fn(async (name: string, _values: Record<string, unknown>) => {
    if (name === "claim_payos_fulfillment") return { orderId, lease, units };
    if (name === "complete_payos_fulfillment") {
      if (completion instanceof Error) throw completion;
      return completion;
    }
    if (name === "fail_payos_fulfillment") return true;
    throw Error("Unexpected RPC");
  });
  return { rpc } satisfies FulfillmentGateway;
}

const callNames = (api: ReturnType<typeof fakeGateway>) =>
  api.rpc.mock.calls.map((call) => call[0]);

describe("payOS encrypted fulfillment orchestration without database or network", () => {
  it("returns idle without writing when no settled order is claimable", async () => {
    const rpc = vi.fn(async () => null);
    expect(await fulfillNextPayosOrder({ rpc }, keys)).toEqual({
      outcome: "idle",
    });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("claim_payos_fulfillment", {});
  });

  it("decrypts all reserved stock before a single atomic completion; never returns credentials", async () => {
    const units = [
      await encryptedUnit(),
      await encryptedUnit("55555555-5555-4555-8555-555555555555"),
    ];
    const api = fakeGateway(units);
    const result = await fulfillNextPayosOrder(api, keys);
    expect(result).toEqual({ outcome: "delivered", orderId });
    expect(JSON.stringify(result)).not.toContain("SYNTHETIC-NEVER-DELIVER");
    expect(callNames(api)).toEqual([
      "claim_payos_fulfillment",
      "complete_payos_fulfillment",
    ]);
    expect(api.rpc).toHaveBeenLastCalledWith("complete_payos_fulfillment", {
      p_order: orderId,
      p_lease: lease,
    });
  });

  it.each([
    ["missing reserved units", async () => []],
    [
      "duplicate stock ID",
      async () => {
        const unit = await encryptedUnit();
        return [unit, unit];
      },
    ],
    [
      "wrong variant for encrypted stock",
      async () => [
        {
          ...(await encryptedUnit()),
          variantId: "66666666-6666-4666-8666-666666666666",
        },
      ],
    ],
    [
      "tampered ciphertext",
      async () => [{ ...(await encryptedUnit()), ciphertext: "A".repeat(44) }],
    ],
    ["malformed item", async () => [{ id: "not-a-uuid" }]],
  ])(
    "holds %s and never marks the order delivered",
    async (_reason, makeUnits) => {
      const api = fakeGateway(await makeUnits());
      expect(await fulfillNextPayosOrder(api, keys)).toEqual({
        outcome: "held",
        orderId,
      });
      expect(callNames(api)).toEqual([
        "claim_payos_fulfillment",
        "fail_payos_fulfillment",
      ]);
      expect(api.rpc).toHaveBeenLastCalledWith("fail_payos_fulfillment", {
        p_order: orderId,
        p_lease: lease,
        p_issue: expect.stringMatching(/^(stock_mismatch|decrypt_failed)$/),
      });
    },
  );

  it("holds an order with a missing encryption key and records the accurate failure reason", async () => {
    const unit = await encryptedUnit();
    const api = fakeGateway([unit]);
    expect(await fulfillNextPayosOrder(api, {})).toEqual({
      outcome: "held",
      orderId,
    });
    expect(api.rpc).toHaveBeenLastCalledWith("fail_payos_fulfillment", {
      p_order: orderId,
      p_lease: lease,
      p_issue: "service_unavailable",
    });
  });

  it("refuses completion if the lease was lost and records a bounded retry", async () => {
    const api = fakeGateway([await encryptedUnit()], false);
    expect(await fulfillNextPayosOrder(api, keys)).toEqual({
      outcome: "held",
      orderId,
    });
    expect(callNames(api)).toEqual([
      "claim_payos_fulfillment",
      "complete_payos_fulfillment",
      "fail_payos_fulfillment",
    ]);
    expect(api.rpc).toHaveBeenLastCalledWith("fail_payos_fulfillment", {
      p_order: orderId,
      p_lease: lease,
      p_issue: "service_unavailable",
    });
  });

  it("classifies completion database failures as retryable without mislabeling stock", async () => {
    const api = fakeGateway(
      [await encryptedUnit()],
      new Error("Database temporarily unavailable"),
    );
    expect(await fulfillNextPayosOrder(api, keys)).toEqual({
      outcome: "held",
      orderId,
    });
    expect(callNames(api)).toEqual([
      "claim_payos_fulfillment",
      "complete_payos_fulfillment",
      "fail_payos_fulfillment",
    ]);
    expect(api.rpc).toHaveBeenLastCalledWith("fail_payos_fulfillment", {
      p_order: orderId,
      p_lease: lease,
      p_issue: "service_unavailable",
    });
  });

  it("does not claim success if the durable failure ledger is unavailable", async () => {
    const rpc = vi.fn(async (name: string) => {
      if (name === "claim_payos_fulfillment")
        return { orderId, lease, units: [] };
      throw new Error("Database unavailable");
    });
    await expect(fulfillNextPayosOrder({ rpc }, keys)).rejects.toThrow(
      "Database unavailable",
    );
  });

  it("stays disabled for public Workers until all staging secret and mode gates are present", () => {
    const valid = {
      APP_ENV: "staging",
      DATA_MODE: "supabase",
      SUPABASE_ENVIRONMENT: "staging",
      PAYMENTS_MODE: "payos",
      PAYOS_CHECKOUT_READY: "true",
      SUPABASE_URL: "https://test.supabase.co",
      SUPABASE_SECRET_KEY: "synthetic-server-only",
      INVENTORY_ENCRYPTION_KEY_V1: keys[1],
    } satisfies Partial<HubbyEnv>;
    expect(payosFulfillmentReady(valid as HubbyEnv)).toBe(true);
    for (const disabled of [
      { PAYMENTS_MODE: "mock" },
      { APP_ENV: "production" },
      { PAYOS_CHECKOUT_READY: "false" },
      { INVENTORY_ENCRYPTION_KEY_V1: "weak-key" },
      { SUPABASE_SECRET_KEY: undefined },
    ]) {
      expect(payosFulfillmentReady({ ...valid, ...disabled } as HubbyEnv)).toBe(
        false,
      );
    }
  });
});
