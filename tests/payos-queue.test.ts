import { describe, expect, it, vi } from "vitest";
import {
  loadPayosReconciliationQueue,
  payosQueueReady,
  recordPayosReview,
  requeueExhaustedPayosDelivery,
} from "../app/server/payos-queue.server";

const staging = {
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
  SITE_ORIGIN: "https://synthetic.test",
};

const receipt = {
  kind: "receipt_review",
  caseId: "payment-reference-100",
  orderCode: 2_000_000_010,
  orderId: null,
  occurredAt: 1_798_000_000_000,
  amountVnd: 49_000,
  reviewStatus: "open",
  reviewNote: null,
  reviewedAt: null,
};

describe("Owner payment reconciliation queue and audited manual reviews", () => {
  it("remains disabled without an explicit staging checkout gate", () => {
    expect(payosQueueReady(staging as never)).toBe(true);
    expect(
      payosQueueReady({ ...staging, PAYMENTS_MODE: "mock" } as never),
    ).toBe(false);
    expect(
      payosQueueReady({ ...staging, PAYOS_CHECKOUT_READY: "false" } as never),
    ).toBe(false);
    expect(
      payosQueueReady({ ...staging, APP_ENV: "production" } as never),
    ).toBe(false);
  });

  it("reads at most 50 cases, keeping individual reference IDs distinct", async () => {
    const rpc = vi.fn(async () => [
      receipt,
      { ...receipt, caseId: "payment-reference-101" },
      {
        ...receipt,
        kind: "delivery_exhausted",
        caseId: "e7a06f44-8bde-4c1e-91cf-087a7b9d4076",
        orderId: "e7a06f44-8bde-4c1e-91cf-087a7b9d4076",
        orderCode: 2_000_000_011,
        occurredAt: 1_798_000_000_001,
        amountVnd: 49_000,
      },
    ]);
    const items = await loadPayosReconciliationQueue({ rpc });
    expect(items).toHaveLength(3);
    expect(items[0]?.caseId).not.toBe(items[1]?.caseId);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("payos_reconciliation_queue", {
      p_limit: 50,
      p_status: "open",
    });
  });

  it("selects resolved cases and validates attached review history", async () => {
    const rpc = vi.fn(async () => [
      {
        ...receipt,
        reviewStatus: "resolved",
        reviewNote: "Đã đối chiếu sao kê, lưu hồ sơ.",
        reviewedAt: 1_798_000_010_000,
      },
    ]);
    const resolved = await loadPayosReconciliationQueue({ rpc }, "resolved");
    expect(resolved[0]?.reviewStatus).toBe("resolved");
    expect(rpc).toHaveBeenCalledWith("payos_reconciliation_queue", {
      p_limit: 50,
      p_status: "resolved",
    });
    await expect(
      loadPayosReconciliationQueue({ rpc }, "invalid" as never),
    ).rejects.toThrow();
  });

  it("rejects malformed, fabricated or excessive data instead of rendering it", async () => {
    const invalid = [
      [{ ...receipt, kind: "settled" }],
      [{ ...receipt, caseId: "" }],
      [{ ...receipt, orderId: "not-uuid" }],
      [{ ...receipt, orderCode: Number.MAX_SAFE_INTEGER + 2 }],
      [{ ...receipt, amountVnd: "49000" }],
      [{ ...receipt, secret: "unexpected" }],
      [{ ...receipt, reviewStatus: "paid" }],
      [{ ...receipt, reviewNote: "x" }],
      [{ ...receipt, reviewedAt: "yesterday" }],
      Array.from({ length: 51 }, () => receipt),
      null,
    ];
    for (const value of invalid) {
      await expect(
        loadPayosReconciliationQueue({ rpc: async () => value }),
      ).rejects.toThrow();
    }
  });

  it("propagates storage uncertainty; does not mark orders as paid", async () => {
    const rpc = vi.fn(async () => {
      throw new Error("Database unavailable");
    });
    await expect(loadPayosReconciliationQueue({ rpc })).rejects.toThrow(
      "Database unavailable",
    );
    expect(rpc).toHaveBeenCalledOnce();
  });

  it("writes only audit events attributed to the server-verified Owner", async () => {
    const actorId = "53d83088-e185-46c2-bdce-a69dc6885752";
    const rpc = vi.fn(async () => ({ id: 1, status: "resolved" }));
    const saved = await recordPayosReview({ rpc }, actorId, {
      kind: receipt.kind,
      caseId: receipt.caseId,
      action: "resolve",
      note: "  Đã kiểm tra ngân hàng, lưu hồ sơ.  ",
    });
    expect(saved).toEqual({ id: 1, status: "resolved" });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("payos_review_case", {
      p_kind: "receipt_review",
      p_case_id: receipt.caseId,
      p_actor_id: actorId,
      p_action: "resolve",
      p_note: "Đã kiểm tra ngân hàng, lưu hồ sơ.",
    });
  });

  it("fails closed on spoofed actor, invalid notes and untrusted RPC results", async () => {
    const rpc = vi.fn(async () => ({ id: 2, status: "paid" }));
    const actorId = "53d83088-e185-46c2-bdce-a69dc6885752";
    const valid = {
      kind: "receipt_review",
      caseId: receipt.caseId,
      action: "note",
      note: "Kiểm tra tiếp",
    };
    await expect(
      recordPayosReview({ rpc }, "not-a-uuid", valid),
    ).rejects.toThrow();
    await expect(
      recordPayosReview({ rpc }, actorId, {
        ...valid,
        actorId: "someone-else",
      }),
    ).rejects.toThrow();
    await expect(
      recordPayosReview({ rpc }, actorId, { ...valid, note: " " }),
    ).rejects.toThrow();
    await expect(
      recordPayosReview({ rpc }, actorId, { ...valid, action: "mark_paid" }),
    ).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
    await expect(recordPayosReview({ rpc }, actorId, valid)).rejects.toThrow();
    expect(rpc).toHaveBeenCalledOnce();
  });

  it("requeues only a server-attributed order and requires an explicit boolean result", async () => {
    const actorId = "53d83088-e185-46c2-bdce-a69dc6885752";
    const orderId = "e7a06f44-8bde-4c1e-91cf-087a7b9d4076";
    const rpc = vi.fn(async () => true);
    expect(
      await requeueExhaustedPayosDelivery({ rpc }, actorId, {
        orderId,
        note: "  Dịch vụ đã hoạt động trở lại.  ",
      }),
    ).toBe(true);
    expect(rpc).toHaveBeenCalledExactlyOnceWith(
      "requeue_exhausted_payos_delivery",
      {
        p_order: orderId,
        p_actor: actorId,
        p_note: "Dịch vụ đã hoạt động trở lại.",
      },
    );
    for (const input of [
      { orderId: "wrong-uuid", note: "Dịch vụ đã hoạt động trở lại." },
      { orderId, note: "short" },
      { orderId, note: "Dịch vụ đã hoạt động trở lại.", actorId: "spoofed" },
    ]) {
      await expect(
        requeueExhaustedPayosDelivery({ rpc }, actorId, input),
      ).rejects.toThrow();
    }
    expect(rpc).toHaveBeenCalledOnce();
    await expect(
      requeueExhaustedPayosDelivery({ rpc }, "not-uuid", {
        orderId,
        note: "Dịch vụ đã hoạt động trở lại.",
      }),
    ).rejects.toThrow();
    rpc.mockResolvedValueOnce("true" as never);
    await expect(
      requeueExhaustedPayosDelivery({ rpc }, actorId, {
        orderId,
        note: "Dịch vụ đã hoạt động trở lại.",
      }),
    ).rejects.toThrow();
  });
});
