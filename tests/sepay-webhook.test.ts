import { describe, expect, it } from "vitest";
import {
  evaluateSePayTransfer,
  verifySePayRequest,
} from "../app/server/sepay-webhook.server";

const secret = "synthetic-sepay-test-secret-never-for-live";
const accountNumber = "000000000001";
const timestamp = 1791799018;
const code = "HB0123456789ABCDEF";
const transfer = {
  id: 123,
  gateway: "TPBank",
  transactionDate: "2026-10-12 12:00:00",
  accountNumber,
  subAccount: null,
  code,
  content: `${code} thanh toan`,
  transferType: "in",
  transferAmount: 50000,
  referenceCode: "SYNTHETIC-REFERENCE",
};
async function signed(
  body = JSON.stringify(transfer),
  signedBody = body,
  seconds = timestamp,
) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(`${seconds}.${signedBody}`),
    ),
  );
  return new Request("https://shop.example.test/webhooks/sepay", {
    method: "POST",
    body,
    headers: {
      "Content-Type": "application/json",
      "X-SePay-Timestamp": String(seconds),
      "X-SePay-Signature": `sha256=${[...signature].map((n) => n.toString(16).padStart(2, "0")).join("")}`,
    },
  });
}
const config = { secret, accountNumber, nowSeconds: timestamp };
describe("SePay HMAC / bank boundaries without provider network access", () => {
  it("validates original raw bytes, including whitespace and Unicode", async () => {
    expect(
      await verifySePayRequest(
        await signed(JSON.stringify(transfer, null, 2)),
        config,
      ),
    ).toEqual(transfer);
  });
  it("rejects tampered payload, wrong secret and missing authentication", async () => {
    await expect(
      verifySePayRequest(
        await signed(
          JSON.stringify({ ...transfer, transferAmount: 1 }),
          JSON.stringify(transfer),
        ),
        config,
      ),
    ).rejects.toHaveProperty("status", 401);
    await expect(
      verifySePayRequest(await signed(), { ...config, secret: "x".repeat(32) }),
    ).rejects.toHaveProperty("status", 401);
    await expect(
      verifySePayRequest(
        new Request("https://shop.example.test", {
          method: "POST",
          body: "{}",
          headers: { "Content-Type": "application/json" },
        }),
        config,
      ),
    ).rejects.toHaveProperty("status", 401);
  });
  it("rejects stale and future signed replays; persistent dedup remains required", async () => {
    for (const seconds of [timestamp - 301, timestamp + 301])
      await expect(
        verifySePayRequest(await signed(undefined, undefined, seconds), config),
      ).rejects.toHaveProperty("status", 401);
  });
  it("rejects wrong bank account / gateway / fractional amounts / malformed JSON", async () => {
    await expect(
      verifySePayRequest(await signed(), {
        ...config,
        accountNumber: "000000000002",
      }),
    ).rejects.toHaveProperty("status", 403);
    for (const body of [
      "{",
      JSON.stringify({ ...transfer, gateway: "Unknown" }),
      JSON.stringify({ ...transfer, transferAmount: 0.5 }),
    ])
      await expect(
        verifySePayRequest(await signed(body), config),
      ).rejects.toHaveProperty("status", 400);
  });
  it("caps real body bytes even without Content-Length", async () => {
    await expect(
      verifySePayRequest(await signed("x".repeat(16385)), config),
    ).rejects.toHaveProperty("status", 413);
  });
  it("requires method/media type and configured secrets", async () => {
    await expect(
      verifySePayRequest(new Request("https://shop.example.test"), config),
    ).rejects.toHaveProperty("status", 405);
    const request = await signed();
    request.headers.set("Content-Type", "text/plain");
    await expect(verifySePayRequest(request, config)).rejects.toHaveProperty(
      "status",
      415,
    );
    await expect(
      verifySePayRequest(await signed(), { ...config, secret: "" }),
    ).rejects.toHaveProperty("status", 503);
  });
  it("requires exact order reference/amount/state/expiry, never marks outflow paid", async () => {
    const value = await verifySePayRequest(await signed(), config);
    const order = {
      code,
      totalVnd: 50000,
      state: "pending_payment",
      expiresAt: 2000,
    };
    expect(evaluateSePayTransfer(value, order, 1000)).toBe("eligible");
    for (const changed of [
      { ...order, totalVnd: 49999 },
      { ...order, state: "delivered" },
      { ...order, expiresAt: 1000 },
    ])
      expect(evaluateSePayTransfer(value, changed, 1000)).toBe(
        "reconciliation",
      );
    expect(evaluateSePayTransfer({ ...value, code: null }, order, 1000)).toBe(
      "reconciliation",
    );
    expect(
      evaluateSePayTransfer(
        { ...value, content: `${code} ${code}` },
        order,
        1000,
      ),
    ).toBe("reconciliation");
    expect(
      evaluateSePayTransfer({ ...value, transferType: "out" }, order, 1000),
    ).toBe("ignored");
  });
});
