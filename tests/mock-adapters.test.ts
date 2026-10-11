import { describe, expect, it } from "vitest";
import {
  MockPaymentAdapter,
  MockSupplierAdapter,
  signMock,
} from "../app/server/adapters/mock.server";

const secret = "PUBLIC-LOCAL-TEST-SECRET-NOT-A-PROVIDER-CREDENTIAL";
const valid = {
  transactionId: "mock-tx",
  merchantReference: "mock-order",
  amountVnd: 89000,
  currency: "VND",
  channelId: "mock-local",
  receivingAccount: "DEMO-NOT-A-BANK",
  direction: "in",
  occurredAt: "2026-10-11T00:00:00Z",
  isTest: true,
};
async function request(value: unknown) {
  const body = JSON.stringify(value);
  return new Request("https://mock.invalid/", {
    method: "POST",
    headers: { "X-Mock-Signature": await signMock(body, secret) },
    body,
  });
}
describe("local-only adapter boundaries", () => {
  it("valid mock HMAC event accepted; creates no usable QR", async () => {
    const adapter = new MockPaymentAdapter(secret, "local");
    expect(await adapter.verifyWebhook(await request(valid))).toEqual(valid);
    expect(
      (
        await adapter.createLink({
          merchantReference: "mock",
          amountVnd: 89000,
          expiresAt: valid.occurredAt,
          idempotencyKey: "key",
        })
      ).qrPayload,
    ).toBe("");
  });
  it("signature tampering rejected", async () => {
    const adapter = new MockPaymentAdapter(secret, "local");
    const body = JSON.stringify(valid);
    const signature = await signMock(body, secret);
    await expect(
      adapter.verifyWebhook(
        new Request("https://mock.invalid/", {
          method: "POST",
          headers: { "X-Mock-Signature": signature },
          body: JSON.stringify({ ...valid, amountVnd: 1 }),
        }),
      ),
    ).rejects.toThrow("signature");
  });
  it.each([
    { currency: "USD" },
    { channelId: "live" },
    { receivingAccount: "wrong" },
    { direction: "out" },
    { isTest: false },
    { amountVnd: 0.5 },
  ])("signed wrong event cannot be settled %j", async (patch) => {
    await expect(
      new MockPaymentAdapter(secret, "local").verifyWebhook(
        await request({ ...valid, ...patch }),
      ),
    ).rejects.toThrow();
  });
  it("supplier accepted then timed out is reconciled with same key, not repurchased", async () => {
    const adapter = new MockSupplierAdapter(true);
    const input = {
      externalSku: "DEMO-LICENSE",
      unitId: "unit-1",
      idempotencyKey: "stable-key",
    };
    expect((await adapter.purchase(input)).state).toBe("uncertain");
    const restart = new MockSupplierAdapter();
    restart.restore(adapter.snapshot());
    expect((await restart.lookup(input.idempotencyKey)).state).toBe(
      "delivered",
    );
    for (let n = 0; n < 20; n++)
      expect((await restart.purchase(input)).state).toBe("delivered");
    expect(restart.purchaseCount).toBe(1);
  });
  it("no unverified supplier SKU or personal activation payload", async () => {
    const adapter = new MockSupplierAdapter();
    await expect(
      adapter.purchase({
        externalSku: "real",
        unitId: "unit",
        idempotencyKey: "key",
      }),
    ).rejects.toThrow("Synthetic");
    await expect(
      adapter.purchase({
        externalSku: "DEMO-TEST",
        unitId: "unit",
        idempotencyKey: "key",
        activationInfo: { email: "demo@example.test" },
      }),
    ).rejects.toThrow("activation");
  });
});
