import { describe, expect, it, vi } from "vitest";
import { canonicalPayosData } from "../app/server/payos.server";
import { inspectPayosPayment } from "../app/server/payos-reconcile.server";

const credentials = {
  clientId: "synthetic-client",
  apiKey: "synthetic-api",
  checksumKey: "synthetic-checksum-key-not-for-live-use",
};
const expected = {
  orderCode: 12345,
  amountVnd: 49_000,
  paymentLinkId: "synthetic_link_123",
};

async function signedPayload(data: Record<string, unknown>) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(credentials.checksumKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(canonicalPayosData(data)),
  );
  return {
    code: "00",
    data,
    signature: [...new Uint8Array(signature)]
      .map((x) => x.toString(16).padStart(2, "0"))
      .join(""),
  };
}

async function getResponse(
  status: string,
  partial: Partial<
    Record<
      "id" | "orderCode" | "amount" | "amountPaid" | "amountRemaining",
      unknown
    >
  > = {},
) {
  const body = await signedPayload({
    id: expected.paymentLinkId,
    orderCode: expected.orderCode,
    amount: expected.amountVnd,
    amountPaid: status === "PAID" ? expected.amountVnd : 0,
    amountRemaining: status === "PAID" ? 0 : expected.amountVnd,
    status,
    ...partial,
  });
  return Response.json(body);
}

describe("payOS read-only provider reconciliation", () => {
  it("fetches only the configured payOS URL and verifies a pending response", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL) =>
      getResponse("PENDING"),
    );
    const result = await inspectPayosPayment(
      expected,
      credentials,
      fetcher as unknown as typeof fetch,
    );
    expect(result.status).toBe("pending");
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      "https://api-merchant.payos.vn/v2/payment-requests/synthetic_link_123",
    );
  });

  it("never calls verified provider-paid status a locally settled order", async () => {
    const result = await inspectPayosPayment(
      expected,
      credentials,
      vi.fn(async () => getResponse("PAID")) as unknown as typeof fetch,
    );
    expect(result.status).toBe("provider_paid_unsettled");
    expect(result.amountPaid).toBe(49_000);
  });

  it("can inspect an uncertain link by order code without inventing a payment link ID", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL) =>
      getResponse("PAID"),
    );
    const result = await inspectPayosPayment(
      { orderCode: expected.orderCode, amountVnd: expected.amountVnd },
      credentials,
      fetcher as unknown as typeof fetch,
    );
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      "https://api-merchant.payos.vn/v2/payment-requests/12345",
    );
    expect(result.status).toBe("provider_paid_unsettled");
  });

  it("never treats a provider response without a valid link ID as trusted evidence", async () => {
    const result = await inspectPayosPayment(
      { orderCode: expected.orderCode, amountVnd: expected.amountVnd },
      credentials,
      vi.fn(async () =>
        getResponse("PAID", { id: "../other" }),
      ) as unknown as typeof fetch,
    );
    expect(result.status).toBe("manual_review");
  });

  it("supports the provider's documented transactions object in signed GET responses", async () => {
    const body = await signedPayload({
      id: expected.paymentLinkId,
      orderCode: expected.orderCode,
      amount: 49_000,
      amountPaid: 0,
      amountRemaining: 49_000,
      status: "PENDING",
      transactions: "[object Object]",
    });
    body.data.transactions = {};
    const result = await inspectPayosPayment(
      expected,
      credentials,
      vi.fn(async () => Response.json(body)) as unknown as typeof fetch,
    );
    expect(result.status).toBe("pending");
  });

  it("requires manual review for signed amount/order mismatches and partial payment", async () => {
    for (const r of [
      await getResponse("PAID", { orderCode: 222 }),
      await getResponse("PAID", { amount: 30_000 }),
      await getResponse("UNDERPAID", {
        amountPaid: 5_000,
        amountRemaining: 44_000,
      }),
    ]) {
      const got = await inspectPayosPayment(
        expected,
        credentials,
        vi.fn(async () => r) as unknown as typeof fetch,
      );
      expect(got.status).toBe("manual_review");
    }
  });

  it("rejects altered signatures and unexpected network responses", async () => {
    const valid = await getResponse("PENDING");
    const payload = (await valid.json()) as { data: { amountPaid: number } };
    payload.data.amountPaid = 30_000;
    await expect(
      inspectPayosPayment(
        expected,
        credentials,
        vi.fn(async () => Response.json(payload)) as unknown as typeof fetch,
      ),
    ).rejects.toMatchObject({ status: 503 });
    await expect(
      inspectPayosPayment(
        expected,
        credentials,
        vi.fn(
          async () => new Response("limit", { status: 429 }),
        ) as unknown as typeof fetch,
      ),
    ).rejects.toMatchObject({ status: 503 });
  });

  it("rejects malicious URL identifiers before contacting provider", async () => {
    const fetcher = vi.fn();
    await expect(
      inspectPayosPayment(
        { ...expected, paymentLinkId: "../other" },
        credentials,
        fetcher as unknown as typeof fetch,
      ),
    ).rejects.toMatchObject({ status: 503 });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
