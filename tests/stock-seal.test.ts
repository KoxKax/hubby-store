import { describe, expect, it } from "vitest";
import {
  openStockUnit,
  type StockSecret,
  sealStockUnit,
} from "../app/server/stock-seal.server";

const identity = {
  id: "11111111-1111-4111-8111-111111111111",
  variantId: "22222222-2222-4222-8222-222222222222",
};
const keys = {
  1: "11".repeat(32),
  2: "22".repeat(32),
};

describe("Worker encrypted stock (synthetic credentials only)", () => {
  it.each<StockSecret>([
    {
      type: "account",
      login: "sample@example.test",
      password: "demo-password",
    },
    { type: "license_key", licenseKey: "DEMO-KEY-ONLY" },
    { type: "activation_link", url: "https://example.test/activate/demo" },
  ])(
    "encrypts and decrypts $type without plaintext DB columns",
    async (secret) => {
      const encrypted = await sealStockUnit(identity, secret, 1, keys);
      expect(Object.keys(encrypted).sort()).toEqual([
        "ciphertext",
        "key_version",
        "nonce",
      ]);
      expect(JSON.stringify(encrypted)).not.toContain(Object.values(secret)[1]);
      expect(encrypted.nonce).toHaveLength(16);
      expect(await openStockUnit(identity, encrypted, keys)).toEqual(secret);
    },
  );

  it("uses unique nonces and versioned keys for safe rotation", async () => {
    const secret: StockSecret = {
      type: "license_key",
      licenseKey: "TEST-ONLY",
    };
    const first = await sealStockUnit(identity, secret, 1, keys);
    const second = await sealStockUnit(identity, secret, 1, keys);
    const rotated = await sealStockUnit(identity, secret, 2, keys);
    expect(first.nonce).not.toBe(second.nonce);
    expect(first.ciphertext).not.toBe(second.ciphertext);
    expect(rotated.key_version).toBe(2);
    expect(await openStockUnit(identity, rotated, keys)).toEqual(secret);
    await expect(
      openStockUnit(identity, first, { 2: keys[2] }),
    ).rejects.toThrow();
  });

  it("rejects swapped variant, stock ID, key version, nonce and ciphertext", async () => {
    const stored = await sealStockUnit(
      identity,
      { type: "license_key", licenseKey: "ABC" },
      1,
      keys,
    );
    const badIds = [
      { ...identity, id: "33333333-3333-4333-8333-333333333333" },
      { ...identity, variantId: "44444444-4444-4444-8444-444444444444" },
    ];
    for (const bad of badIds) {
      await expect(openStockUnit(bad, stored, keys)).rejects.toThrow();
    }
    await expect(
      openStockUnit(identity, { ...stored, key_version: 2 }, keys),
    ).rejects.toThrow();
    await expect(
      openStockUnit(identity, { ...stored, nonce: "AAAAAAAAAAAAAAAA" }, keys),
    ).rejects.toThrow();
    await expect(
      openStockUnit(identity, { ...stored, ciphertext: "AAAA" }, keys),
    ).rejects.toThrow();
  });

  it("refuses invalid secrets, malformed identifiers, and invalid key material", async () => {
    const secret: StockSecret = {
      type: "license_key",
      licenseKey: "synthetic",
    };
    await expect(
      sealStockUnit({ ...identity, id: "x" }, secret, 1, keys),
    ).rejects.toThrow();
    await expect(sealStockUnit(identity, secret, 0, keys)).rejects.toThrow();
    await expect(
      sealStockUnit(identity, secret, 1, { 1: "insecure" }),
    ).rejects.toThrow();
    await expect(
      sealStockUnit(
        identity,
        { type: "activation_link", url: "http://example.test" },
        1,
        keys,
      ),
    ).rejects.toThrow();
    await expect(
      sealStockUnit(
        identity,
        { type: "account", login: "a", password: "" },
        1,
        keys,
      ),
    ).rejects.toThrow();
  });
});
