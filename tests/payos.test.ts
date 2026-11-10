import { describe, expect, it, vi } from "vitest";
import {
  canonicalPayosData,
  createPayosPaymentLink,
  evaluatePayosReceipt,
  processPayosWebhook,
  verifyPayosWebhook,
} from "../app/server/payos.server";

const checksumKey = "synthetic-payos-checksum-00000000000000000000000";
const credentials = {
  clientId: "synthetic-client-id",
  apiKey: "synthetic-api-key",
  checksumKey,
};
const now = Date.now();
const numericCode = 1234567;
const amount = 49000;
const linkId = "124c33293c43417ab7879e14c8d9eb18";
const accountNumber = "000000001234";

async function signature(data: Record<string, unknown>, secret = checksumKey) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return [
    ...new Uint8Array(
      await crypto.subtle.sign(
        "HMAC",
        key,
        new TextEncoder().encode(canonicalPayosData(data)),
      ),
    ),
  ]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
}

const receiptData = {
  orderCode: numericCode,
  amount,
  description: "HBTEST",
  accountNumber,
  reference: "PAYOS-SYNTHETIC-TRANSFER",
  transactionDateTime: "2026-10-26 12:30:00",
  currency: "VND",
  paymentLinkId: linkId,
  code: "00",
  desc: "Thành công",
  counterAccountBankId: "",
  counterAccountBankName: "",
  counterAccountName: "",
  counterAccountNumber: "",
  virtualAccountName: "",
  virtualAccountNumber: "",
};

async function webhook(
  data: Record<string, unknown> = receiptData,
  signData: Record<string, unknown> = data,
  secret = checksumKey,
) {
  return new Request("https://hubby.example.test/webhooks/payos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code: "00",
      desc: "success",
      success: true,
      data,
      signature: await signature(signData, secret),
    }),
  });
}

describe("payOS adapter, synthetic data only and no provider network", () => {
  it("canonicalizes all signed webhook fields including future optional bank details", async () => {
    const value = await verifyPayosWebhook(await webhook(), checksumKey);
    expect(value).toEqual({
      provider: "payos",
      numericCode,
      paymentLinkId: linkId,
      receivingAccount: accountNumber,
      reference: receiptData.reference,
      amountVnd: amount,
      transactionAt: Date.parse("2026-10-26T12:30:00+07:00"),
    });
    expect(canonicalPayosData({ b: null, a: 0 })).toBe("a=0&b=");
  });

  it("rejects tampered values, wrong key, non-success and invalid media type", async () => {
    await expect(
      verifyPayosWebhook(
        await webhook({ ...receiptData, amount: 48000 }, receiptData),
        checksumKey,
      ),
    ).rejects.toHaveProperty("status", 401);
    await expect(
      verifyPayosWebhook(await webhook(), "x".repeat(32)),
    ).rejects.toHaveProperty("status", 401);
    await expect(
      verifyPayosWebhook(
        await webhook({ ...receiptData, code: "01" }),
        checksumKey,
      ),
    ).rejects.toHaveProperty("status", 400);
    const wrongMedia = await webhook();
    wrongMedia.headers.set("Content-Type", "text/plain");
    await expect(
      verifyPayosWebhook(wrongMedia, checksumKey),
    ).rejects.toHaveProperty("status", 415);
    await expect(
      verifyPayosWebhook(await webhook(), ""),
    ).rejects.toHaveProperty("status", 503);
  });

  it("bounds body bytes even when Content-Length is omitted", async () => {
    const oversized = await webhook({
      ...receiptData,
      description: "x".repeat(17000),
    });
    oversized.headers.delete("Content-Length");
    await expect(
      verifyPayosWebhook(oversized, checksumKey),
    ).rejects.toHaveProperty("status", 413);
  });

  it("matches exact persisted payment and excludes expiry, mismatches and replays", async () => {
    const receipt = await verifyPayosWebhook(await webhook(), checksumKey);
    const paidAt = receipt.transactionAt;
    const order = {
      numericCode,
      paymentLinkId: linkId,
      receivingAccount: accountNumber,
      amountVnd: amount,
      state: "pending_payment",
      createdAt: paidAt - 300_000,
      expiresAt: paidAt + 600_000,
      reservationValid: true,
    };
    expect(evaluatePayosReceipt(receipt, order, paidAt)).toBe("eligible");
    for (const changed of [
      { ...order, paymentLinkId: "wrong" },
      { ...order, amountVnd: amount - 1 },
      { ...order, receivingAccount: "wrong" },
      { ...order, state: "paid" },
      { ...order, reservationValid: false },
      { ...order, expiresAt: paidAt },
    ])
      expect(evaluatePayosReceipt(receipt, changed, paidAt)).toBe(
        "reconciliation",
      );
    expect(evaluatePayosReceipt(receipt, null, paidAt)).toBe("reconciliation");
    expect(evaluatePayosReceipt(receipt, order, order.expiresAt)).toBe(
      "reconciliation",
    );
  });

  it("constructs the exact documented link signature and checks signed provider reply", async () => {
    const origin = "https://hubby.example.test";
    const order = {
      numericCode,
      amountVnd: amount,
      createdAt: now - 30_000,
      expiresAt: now + 600_000,
      state: "pending_payment" as const,
      reservationValid: true as const,
    };
    const fetcher = vi.fn(
      async (_input: RequestInfo | URL, options?: RequestInit) => {
        const sent = JSON.parse(String(options?.body));
        expect(String(_input)).toBe(
          "https://api-merchant.payos.vn/v2/payment-requests",
        );
        expect(
          (options?.headers as Record<string, string> | undefined)?.[
            "x-api-key"
          ],
        ).toBe(credentials.apiKey);
        expect(sent.orderCode).toBe(numericCode);
        expect(sent.amount).toBe(amount);
        const expectedSignature = await signature({
          amount,
          cancelUrl: sent.cancelUrl,
          description: sent.description,
          orderCode: numericCode,
          returnUrl: sent.returnUrl,
        });
        expect(sent.signature).toBe(expectedSignature);
        const data = {
          bin: "970422",
          accountNumber,
          amount,
          orderCode: numericCode,
          currency: "VND",
          paymentLinkId: linkId,
          status: "PENDING",
          checkoutUrl: `https://pay.payos.vn/web/${linkId}`,
        };
        return Response.json({
          code: "00",
          desc: "success",
          data,
          signature: await signature(data),
        });
      },
    );
    const response = await createPayosPaymentLink(
      order,
      credentials,
      origin,
      fetcher as typeof fetch,
    );
    expect(response.checkoutUrl).toBe(`https://pay.payos.vn/web/${linkId}`);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await expect(
      createPayosPaymentLink(
        { ...order, reservationValid: false as true },
        credentials,
        origin,
        fetcher as typeof fetch,
      ),
    ).rejects.toHaveProperty("status", 409);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("only acknowledges after a durable database commit; database outages remain retryable", async () => {
    const commit = vi.fn(async () => ({
      durable: true as const,
      outcome: "paid" as const,
    }));
    const successful = await processPayosWebhook(await webhook(), checksumKey, {
      commit,
    });
    expect(successful.status).toBe(200);
    expect(commit).toHaveBeenCalledOnce();
    const offline = await processPayosWebhook(await webhook(), checksumKey, {
      commit: async () => {
        throw Error("synthetic storage outage");
      },
    });
    expect(offline.status).toBe(503);
    const forged = await processPayosWebhook(
      await webhook({ ...receiptData, amount: 48000 }, receiptData),
      checksumKey,
      { commit },
    );
    expect(forged.status).toBe(401);
    expect(commit).toHaveBeenCalledOnce();
  });
});
