import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { action, loader } from "../app/routes/casso-webhook";
import {
  type BankPaymentOrder,
  type CassoConfig,
  type CassoPaymentStore,
  evaluateCassoReceipt,
  processCassoWebhook,
  verifyCassoRequest,
} from "../app/server/casso-webhook.server";

const now = Date.parse("2026-10-22T12:00:00+07:00");
const code = "HB0123456789ABCDEF";
const config: CassoConfig = {
  secret: "synthetic-casso-signing-key-not-for-live-0001",
  accountNumber: "000000000001",
  virtualAccountNumber: "CASSHUBBYTEST",
  currency: "VND",
  environment: "test",
  nowMs: now,
};
const transaction = {
  id: 123,
  reference: "SYNTHETIC-BANK-REFERENCE",
  description: `Thanh toan ${code}`,
  amount: 49000,
  transactionDateTime: "2026-10-22 11:59:30",
  accountNumber: config.accountNumber,
  virtualAccountNumber: config.virtualAccountNumber,
  bankName: "OCB",
  bankAbbreviation: "OCB",
  runningBalance: 50000,
  virtualAccountName: "SYNTHETIC",
  counterAccountName: "DO NOT PERSIST",
  counterAccountNumber: "000000000002",
  counterAccountBankId: "",
  counterAccountBankName: "",
};
// Independent implementation matching the publisher's documented sample.
function sorted(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, child]) => [key, sorted(child)]),
  );
}
function signed(
  overrides: Record<string, unknown> = {},
  options: {
    timestamp?: number;
    secret?: string;
    tamper?: Record<string, unknown>;
    error?: number;
    array?: boolean;
    whitespace?: boolean;
  } = {},
) {
  const data = { ...transaction, ...overrides };
  const body = {
    error: options.error ?? 0,
    data: options.array ? [data] : data,
  };
  const timestamp = options.timestamp ?? now;
  const signature = createHmac("sha512", options.secret ?? config.secret)
    .update(`${timestamp}.${JSON.stringify(sorted(body))}`)
    .digest("hex");
  return new Request("https://shop.example.test/webhooks/casso", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Casso-Signature": `t=${timestamp},v1=${signature}`,
    },
    body: JSON.stringify(
      options.tamper ? { ...body, data: { ...data, ...options.tamper } } : body,
      null,
      options.whitespace ? 2 : undefined,
    ),
  });
}
const order: BankPaymentOrder = {
  code,
  totalVnd: 49000,
  createdAt: now - 60_000,
  expiresAt: now + 60_000,
  state: "pending_payment",
  environment: "test",
  reservationValid: true,
};
beforeEach(() => {
  vi.spyOn(globalThis, "fetch").mockRejectedValue(
    new Error("No provider network in tests"),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
});
describe("Casso V2 OCB signature and matching boundaries", () => {
  it("verifies sorted full-envelope HMAC SHA512 independently of JSON whitespace", async () => {
    const receipt = await verifyCassoRequest(
      signed({}, { whitespace: true }),
      config,
    );
    expect(receipt).toMatchObject({
      provider: "casso-v2",
      transactionId: "123",
      amountVnd: 49000,
      orderCode: code,
      environment: "test",
    });
    expect(receipt.transactionAt).toBe(now - 30_000);
    expect(JSON.stringify(receipt)).not.toMatch(
      /runningBalance|counterAccount|DO NOT PERSIST/,
    );
    expect(evaluateCassoReceipt(receipt, order, now)).toBe("eligible");
  });
  it.each(["amount", "accountNumber", "description", "runningBalance"])(
    "rejects tampered %s, including fields not retained",
    async (field) => {
      await expect(
        verifyCassoRequest(signed({}, { tamper: { [field]: 1 } }), config),
      ).rejects.toHaveProperty("status", 401);
    },
  );
  it("rejects wrong key and token-only/V1 authentication", async () => {
    await expect(
      verifyCassoRequest(signed({}, { secret: "wrong-test-key" }), config),
    ).rejects.toHaveProperty("status", 401);
    const req = signed();
    req.headers.delete("X-Casso-Signature");
    req.headers.set("secure-token", config.secret);
    await expect(verifyCassoRequest(req, config)).rejects.toHaveProperty(
      "status",
      401,
    );
    await expect(
      verifyCassoRequest(signed({}, { array: true }), config),
    ).rejects.toHaveProperty("status", 400);
  });
  it("pins both OCB main account and exact CASS VA", async () => {
    for (const overrides of [
      { accountNumber: "000000000003" },
      { virtualAccountNumber: "CASSOTHER" },
    ])
      await expect(
        verifyCassoRequest(signed(overrides), config),
      ).rejects.toHaveProperty("status", 403);
    await expect(
      verifyCassoRequest(signed({ bankAbbreviation: "TPB" }), config),
    ).rejects.toHaveProperty("status", 400);
  });
  it("accepts provider retry horizon but rejects stale/future or duplicate signature fields", async () => {
    await expect(
      verifyCassoRequest(
        signed({}, { timestamp: now - 24 * 3600_000 }),
        config,
      ),
    ).resolves.toHaveProperty("transactionId", "123");
    for (const timestamp of [now - 26 * 3600_000, now + 301_000])
      await expect(
        verifyCassoRequest(signed({}, { timestamp }), config),
      ).rejects.toHaveProperty("status", 401);
    const req = signed();
    req.headers.append("X-Casso-Signature", "t=1,v1=bad");
    await expect(verifyCassoRequest(req, config)).rejects.toHaveProperty(
      "status",
      401,
    );
  });
  it("rejects error/test probe id0, unsafe amounts and invalid calendar dates", async () => {
    for (const overrides of [
      { id: 0 },
      { amount: 1.5 },
      { transactionDateTime: "2026-02-30 12:00:00" },
      { transactionDateTime: "2026-10-22 12:10:00" },
    ])
      await expect(
        verifyCassoRequest(signed(overrides), config),
      ).rejects.toHaveProperty("status", 400);
    await expect(
      verifyCassoRequest(signed({}, { error: 1 }), config),
    ).rejects.toHaveProperty("status", 400);
  });
  it("bounds actual bytes when Content-Length is missing or forged", async () => {
    const req = signed({ description: "x".repeat(17000) });
    req.headers.set("Content-Length", "2");
    await expect(verifyCassoRequest(req, config)).rejects.toHaveProperty(
      "status",
      413,
    );
  });
  it("never accepts browser query params as webhook authentication", async () => {
    const req = new Request(
      `https://shop.example.test/webhooks/casso?success=true`,
      {
        method: "POST",
        body: "{}",
        headers: { "Content-Type": "application/json" },
      },
    );
    await expect(verifyCassoRequest(req, config)).rejects.toHaveProperty(
      "status",
      401,
    );
    await expect(
      verifyCassoRequest(signed(), {
        ...config,
        currency: "USD",
      } as unknown as CassoConfig),
    ).rejects.toHaveProperty("status", 503);
  });
  it.each([
    `No order reference`,
    `${code} ${code}`,
    `X${code}`,
    `${code}1`,
    `${code} HB1111111111111111`,
  ])("does not guess ambiguous/unbounded reference %s", async (description) => {
    const receipt = await verifyCassoRequest(signed({ description }), config);
    expect(receipt.orderCode).toBeNull();
    expect(evaluateCassoReceipt(receipt, order, now)).toBe("reconciliation");
  });
  it.each([-49000, 0])(
    "outgoing/zero transfer %s never pays an order",
    async (amount) => {
      expect(
        evaluateCassoReceipt(
          await verifyCassoRequest(signed({ amount }), config),
          order,
          now,
        ),
      ).toBe("ignored");
    },
  );
  it("requires exact amount, test/live isolation, timely reservation and pending order", async () => {
    const receipt = await verifyCassoRequest(signed(), config);
    const changes: Partial<BankPaymentOrder>[] = [
      { totalVnd: 48000 },
      { totalVnd: 50000 },
      { totalVnd: 0 },
      { environment: "live" },
      { reservationValid: false },
      { state: "paid" },
      { state: "cancelled" },
      { state: "refunded" },
      { createdAt: now },
      { expiresAt: now - 40_000 },
    ];
    for (const patch of changes)
      expect(evaluateCassoReceipt(receipt, { ...order, ...patch }, now)).toBe(
        "reconciliation",
      );
    expect(evaluateCassoReceipt(receipt, null, now)).toBe("reconciliation");
    expect(evaluateCassoReceipt(receipt, order, order.expiresAt)).toBe(
      "reconciliation",
    );
  });
});
describe("acknowledgement only follows durable commit, not successful signature alone", () => {
  it("returns strict-mode success only after repository commits", async () => {
    for (const outcome of [
      "paid",
      "duplicate",
      "ignored",
      "reconciliation",
    ] as const) {
      const commit = vi.fn(async () => ({ durable: true as const, outcome }));
      const response = await processCassoWebhook(signed(), config, { commit });
      expect(commit).toHaveBeenCalledOnce();
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ success: true });
    }
  });
  it("never acknowledges database failures or a missing durable implementation", async () => {
    const commit = vi.fn(async () => {
      throw new Error("Synthetic DB unavailable");
    });
    const response = await processCassoWebhook(signed(), config, { commit });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ success: false });
    const nonDurable = {
      commit: async () => ({ durable: false, outcome: "paid" }),
    } as unknown as CassoPaymentStore;
    expect(
      (await processCassoWebhook(signed(), config, nonDurable)).status,
    ).toBe(503);
  });
  it("signature failure never reaches the repository", async () => {
    const commit = vi.fn();
    expect(
      (
        await processCassoWebhook(
          signed({}, { secret: "wrong-test-key" }),
          config,
          { commit },
        )
      ).status,
    ).toBe(401);
    expect(commit).not.toHaveBeenCalled();
  });
  it("public reserved endpoint is disabled and cannot acknowledge even valid input", async () => {
    expect(loader().status).toBe(405);
    expect(loader().headers.get("Allow")).toBe("POST");
    const response = action();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ success: false });
  });
});
