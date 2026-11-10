import { describe, expect, it, vi } from "vitest";
import {
  loadPayosStockCounts,
  loadPayosStockUnits,
  payosInventoryReady,
  provisionEncryptedPayosStock,
  quarantinePayosStock,
} from "../app/server/payos-inventory.server";
import type { HubbyEnv } from "../app/server/runtime-context.server";
import { openStockUnit } from "../app/server/stock-seal.server";

const keys = { 1: "ef".repeat(32) };
const input = {
  stockId: "11111111-1111-4111-8111-111111111111",
  variantId: "22222222-2222-4222-8222-222222222222",
  secret: {
    type: "account" as const,
    login: "sample@example.test",
    password: "synthetic-password",
  },
};

describe("Owner inventory ingestion; synthetic secrets, no DB or network", () => {
  it("encrypts each account before crossing the database boundary", async () => {
    const rpc = vi.fn(
      async (_name: string, _params: Record<string, unknown>) => true,
    );
    expect(await provisionEncryptedPayosStock(input, keys, { rpc })).toEqual({
      stockId: input.stockId,
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    const params = rpc.mock.calls[0]?.[1] as
      | Record<string, unknown>
      | undefined;
    expect(params).toMatchObject({
      p_id: input.stockId,
      p_variant: input.variantId,
      p_key_version: 1,
    });
    expect(JSON.stringify(params)).not.toContain(input.secret.password);
    expect(JSON.stringify(params)).not.toContain(input.secret.login);
    expect(
      await openStockUnit(
        { id: input.stockId, variantId: input.variantId },
        {
          ciphertext: String(params?.p_ciphertext),
          nonce: String(params?.p_nonce),
          key_version: 1,
        },
        keys,
      ),
    ).toEqual(input.secret);
  });

  it("rejects malformed inventory without any database call", async () => {
    const rpc = vi.fn(async () => true);
    await expect(
      provisionEncryptedPayosStock({ ...input, stockId: "invalid" }, keys, {
        rpc,
      }),
    ).rejects.toThrow();
    await expect(
      provisionEncryptedPayosStock(
        { ...input, secret: { type: "account", login: "x", password: "" } },
        keys,
        { rpc },
      ),
    ).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("does not confirm stock when persistence fails or is ambiguous", async () => {
    await expect(
      provisionEncryptedPayosStock(input, keys, { rpc: async () => false }),
    ).rejects.toThrow("did not confirm");
    await expect(
      provisionEncryptedPayosStock(input, keys, {
        rpc: async () => {
          throw new Error("Storage unavailable");
        },
      }),
    ).rejects.toThrow("Storage unavailable");
  });

  it("reads only aggregate inventory counts; rejects any unexpected secret-bearing fields", async () => {
    const row = {
      variantId: input.variantId,
      available: 1,
      reserved: 2,
      delivered: 3,
      quarantined: 0,
    };
    expect(await loadPayosStockCounts({ rpc: async () => [row] })).toEqual([
      row,
    ]);
    await expect(
      loadPayosStockCounts({
        rpc: async () => [{ ...row, ciphertext: "not-for-browser" }],
      }),
    ).rejects.toThrow();
  });

  it("lists only non-sensitive unit metadata, never credentials or ciphertext", async () => {
    const row = {
      id: input.stockId,
      variantId: input.variantId,
      state: "available",
      createdAt: "2026-10-28T00:00:00Z",
    };
    expect(await loadPayosStockUnits({ rpc: async () => [row] })).toEqual([
      row,
    ]);
    for (const unsafe of [
      { ...row, ciphertext: "secret" },
      { ...row, password: "secret" },
      { ...row, state: "reserved" },
    ]) {
      await expect(
        loadPayosStockUnits({ rpc: async () => [unsafe] }),
      ).rejects.toThrow();
    }
  });

  it("quarantines only with typed Owner identity/reason and explicit DB confirmation", async () => {
    const rpc = vi.fn(async () => true);
    const candidate = {
      stockId: input.stockId,
      actorId: "33333333-3333-4333-8333-333333333333",
      reason: "compromised",
    };
    expect(await quarantinePayosStock(candidate, { rpc })).toBe(true);
    expect(rpc).toHaveBeenCalledWith("quarantine_payos_stock", {
      p_stock: candidate.stockId,
      p_actor: candidate.actorId,
      p_reason: "compromised",
    });
    for (const invalid of [
      { ...candidate, actorId: "fake" },
      { ...candidate, reason: "delivered" },
      { ...candidate, stockId: "fake" },
    ]) {
      await expect(quarantinePayosStock(invalid, { rpc })).rejects.toThrow();
    }
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(
      await quarantinePayosStock(candidate, { rpc: async () => false }),
    ).toBe(false);
    await expect(
      quarantinePayosStock(candidate, { rpc: async () => ({ ok: true }) }),
    ).rejects.toThrow("ambiguous");
  });

  it("only enables the backend for an isolated staging DB with an encryption key", () => {
    const valid = {
      APP_ENV: "staging",
      DATA_MODE: "supabase",
      SUPABASE_ENVIRONMENT: "staging",
      SUPABASE_URL: "https://test.supabase.co",
      SUPABASE_SECRET_KEY: "synthetic-server-secret",
      INVENTORY_ENCRYPTION_KEY_V1: keys[1],
    } satisfies Partial<HubbyEnv>;
    expect(payosInventoryReady(valid as HubbyEnv)).toBe(true);
    for (const disabled of [
      { APP_ENV: "production" },
      { SUPABASE_ENVIRONMENT: undefined },
      { SUPABASE_SECRET_KEY: undefined },
      { INVENTORY_ENCRYPTION_KEY_V1: "bad" },
    ])
      expect(payosInventoryReady({ ...valid, ...disabled } as HubbyEnv)).toBe(
        false,
      );
  });
});
