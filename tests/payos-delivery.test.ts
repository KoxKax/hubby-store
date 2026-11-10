import { describe, expect, it, vi } from "vitest";
import {
  type DeliveryReadGateway,
  revealRegisteredPayosDelivery,
} from "../app/server/payos-delivery.server";
import { sealStockUnit } from "../app/server/stock-seal.server";

const orderId = "11111111-1111-4111-8111-111111111111";
const actorId = "22222222-2222-4222-8222-222222222222";
const variantId = "33333333-3333-4333-8333-333333333333";
const stockId = "44444444-4444-4444-8444-444444444444";
const keys = { 1: "ab".repeat(32) };

async function unit() {
  return {
    id: stockId,
    variantId,
    ...(await sealStockUnit(
      { id: stockId, variantId },
      { type: "license_key", licenseKey: "SYNTHETIC-LICENSE-NOT-REAL" },
      1,
      keys,
    )),
  };
}

function gateway(response: unknown) {
  const rpc = vi.fn(async () => response);
  return { rpc } satisfies DeliveryReadGateway;
}

describe("registered-customer payOS delivery reveal", () => {
  it("decrypts only an explicit service-verified order and actor pairing", async () => {
    const encrypted = await unit();
    const api = gateway([encrypted]);
    expect(
      await revealRegisteredPayosDelivery(orderId, actorId, api, keys),
    ).toEqual([
      {
        stockId,
        type: "license_key",
        licenseKey: "SYNTHETIC-LICENSE-NOT-REAL",
      },
    ]);
    expect(api.rpc).toHaveBeenCalledExactlyOnceWith("read_payos_delivery", {
      p_order: orderId,
      p_actor: actorId,
    });
    expect(JSON.stringify(api.rpc.mock.calls)).not.toContain(
      "SYNTHETIC-LICENSE-NOT-REAL",
    );
  });

  it("never queries the database with malformed order or actor IDs", async () => {
    const api = gateway(null);
    await expect(
      revealRegisteredPayosDelivery("bad", actorId, api, keys),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      revealRegisteredPayosDelivery(orderId, "bad", api, keys),
    ).rejects.toMatchObject({ status: 404 });
    expect(api.rpc).not.toHaveBeenCalled();
  });

  it("does not disclose delivery for pending, guest, or unrelated orders when SQL denies the read", async () => {
    const api = gateway(null);
    await expect(
      revealRegisteredPayosDelivery(orderId, actorId, api, keys),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("rejects incomplete, duplicated or unexpected ciphertext records", async () => {
    const encrypted = await unit();
    for (const invalid of [
      [],
      [encrypted, encrypted],
      [{ ...encrypted, plaintext: "secret" }],
      [{ ...encrypted, variantId: "bad" }],
    ]) {
      const api = gateway(invalid);
      await expect(
        revealRegisteredPayosDelivery(orderId, actorId, api, keys),
      ).rejects.toMatchObject({ status: 503 });
    }
  });

  it("never returns undecipherable or tampered inventory", async () => {
    const encrypted = await unit();
    for (const [rows, activeKeys] of [
      [[{ ...encrypted, ciphertext: "A".repeat(44) }], keys],
      [[encrypted], {}],
    ] as const) {
      const api = gateway(rows);
      await expect(
        revealRegisteredPayosDelivery(orderId, actorId, api, activeKeys),
      ).rejects.toMatchObject({ status: 503 });
    }
  });
});
