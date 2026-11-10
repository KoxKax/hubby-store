import type { SupabaseClient } from "@supabase/supabase-js";
import { RouterContextProvider } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { action, loader } from "../app/routes/admin-payments";
import { payosQueueGateway } from "../app/server/payos-queue.server";
import { inspectPayosPayment } from "../app/server/payos-reconcile.server";
import { runtimeContext } from "../app/server/runtime-context.server";

const rpcMock = vi.hoisted(() => vi.fn());
vi.mock("../app/server/payos-reconcile.server", () => ({
  inspectPayosPayment: vi.fn(),
}));
vi.mock("../app/server/payos-queue.server", async (original) => ({
  ...(await original<typeof import("../app/server/payos-queue.server")>()),
  payosQueueGateway: vi.fn(() => ({ rpc: rpcMock })),
}));

const origin = "http://127.0.0.1:5174";
const csrf = "a".repeat(43);
const ownerId = "53d83088-e185-46c2-bdce-a69dc6885752";
const caseId = "bank-receipt-synthetic";
const uncertainOrderId = "e7a06f44-8bde-4c1e-91cf-087a7b9d4076";

function setup(owner: boolean) {
  const client = {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: ownerId, email: "owner@example.test" } },
        error: null,
      })),
    },
    rpc: vi.fn(async () => ({
      data: {
        owner,
        aal2: false,
        mfa_required: false,
        password_only_issuer: "https://synthetic.supabase.co/auth/v1",
      },
      error: null,
    })),
  };
  const context = new RouterContextProvider();
  context.set(runtimeContext, {
    env: {
      APP_ENV: "staging",
      DATA_MODE: "supabase",
      SUPABASE_ENVIRONMENT: "staging",
      SUPPLIERS_MODE: "mock",
      PAYMENTS_MODE: "payos",
      PAYOS_CHECKOUT_READY: "true",
      SUPABASE_URL: "https://synthetic.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_synthetic",
      SUPABASE_SECRET_KEY: "sb_secret_synthetic",
      PAYOS_CLIENT_ID: "synthetic-client",
      PAYOS_API_KEY: "synthetic-api",
      PAYOS_CHECKSUM_KEY: "synthetic-checksum-for-testing-only-123",
      SITE_ORIGIN: origin,
    },
    ctx: {} as ExecutionContext,
    responseHeaders: new Headers(),
    responseCookies: new Map(),
    client: client as unknown as SupabaseClient,
  });
  return context;
}

function post(fields: Record<string, string> = {}, token = csrf) {
  return new Request(`${origin}/admin/thanh-toan`, {
    method: "POST",
    headers: {
      Origin: origin,
      Cookie: `hubby-local-csrf=${csrf}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      csrf: token,
      caseKind: "receipt_review",
      caseId,
      reviewAction: "resolve",
      note: "Đã kiểm tra và lưu hồ sơ đối soát.",
      status: "open",
      ...fields,
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(inspectPayosPayment).mockResolvedValue({
    observedAt: 1_798_000_000_000,
    status: "pending",
    amountPaid: 0,
  });
  rpcMock.mockImplementation(async (name: string) => {
    if (name === "payos_review_case") return { id: 1, status: "resolved" };
    return [];
  });
});

describe("Owner payOS review route security", () => {
  it("loads Owner cases using server identity and the selected filter", async () => {
    const result = await loader({
      request: new Request(`${origin}/admin/thanh-toan?status=resolved`),
      context: setup(true),
      url: new URL(`${origin}/admin/thanh-toan?status=resolved`),
    } as never);
    expect(result.status).toBe("resolved");
    expect(result.enabled).toBe(true);
    expect(rpcMock).toHaveBeenCalledWith("payos_reconciliation_queue", {
      p_limit: 50,
      p_status: "resolved",
    });
  });

  it("uses verified Owner UUID rather than a spoofed posted actor", async () => {
    const response = await action({
      request: post({ actorId: "someone-else" }),
      context: setup(true),
      url: new URL(`${origin}/admin/thanh-toan`),
    } as never);
    expect(response).toBeInstanceOf(Response);
    if (!(response instanceof Response))
      throw new Error("Expected redirect response");
    expect(response.status).toBe(303);
    expect(rpcMock).toHaveBeenCalledWith(
      "payos_review_case",
      expect.objectContaining({
        p_actor_id: ownerId,
        p_case_id: caseId,
        p_action: "resolve",
      }),
    );
    expect(payosQueueGateway).toHaveBeenCalledOnce();
  });

  it("blocks forged CSRF before calling payment storage", async () => {
    await expect(
      action({
        request: post({}, "wrong-token"),
        context: setup(true),
        url: new URL(`${origin}/admin/thanh-toan`),
      } as never),
    ).rejects.toMatchObject({ status: 403 });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("blocks non-Owner sessions before any payment storage call", async () => {
    await expect(
      action({
        request: post(),
        context: setup(false),
        url: new URL(`${origin}/admin/thanh-toan`),
      } as never),
    ).rejects.toMatchObject({ status: 403 });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("rejects a bad review action without touching the database", async () => {
    const result = await action({
      request: post({ reviewAction: "mark_paid" }),
      context: setup(true),
      url: new URL(`${origin}/admin/thanh-toan`),
    } as never);
    if (result instanceof Response)
      throw new Error("Expected form validation result");
    expect(result.init?.status).toBe(400);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("looks up an uncertain link using only server-trusted order details", async () => {
    rpcMock.mockResolvedValueOnce([
      {
        kind: "link_unknown",
        caseId: uncertainOrderId,
        orderCode: 2_000_000_011,
        orderId: uncertainOrderId,
        occurredAt: 1_798_000_000_000,
        amountVnd: 49_000,
        reviewStatus: "open",
        reviewNote: null,
        reviewedAt: null,
      },
    ]);
    const result = await action({
      request: post({
        caseKind: "link_unknown",
        caseId: uncertainOrderId,
        reviewAction: "inspect",
        note: "",
        orderCode: "999",
        amountVnd: "100",
      }),
      context: setup(true),
      url: new URL(`${origin}/admin/thanh-toan`),
    } as never);
    if (result instanceof Response)
      throw new Error("Expected inspection result");
    expect(
      "inspected" in result.data ? result.data.inspected : null,
    ).toMatchObject({
      caseId: uncertainOrderId,
      status: "pending",
    });
    expect(inspectPayosPayment).toHaveBeenCalledWith(
      { orderCode: 2_000_000_011, amountVnd: 49_000 },
      {
        clientId: "synthetic-client",
        apiKey: "synthetic-api",
        checksumKey: "synthetic-checksum-for-testing-only-123",
      },
    );
    expect(rpcMock).toHaveBeenCalledExactlyOnceWith(
      "payos_reconciliation_queue",
      {
        p_limit: 50,
        p_status: "open",
      },
    );
  });

  it("never queries payOS when the requested case is not in the Owner queue", async () => {
    const result = await action({
      request: post({
        caseKind: "link_unknown",
        caseId: uncertainOrderId,
        reviewAction: "inspect",
        note: "",
      }),
      context: setup(true),
      url: new URL(`${origin}/admin/thanh-toan`),
    } as never);
    if (result instanceof Response)
      throw new Error("Expected validation result");
    expect(result.init?.status).toBe(409);
    expect(inspectPayosPayment).not.toHaveBeenCalled();
    expect(rpcMock).toHaveBeenCalledOnce();
  });

  it("never queries payOS for a non-Owner or forged request", async () => {
    await expect(
      action({
        request: post({
          caseKind: "link_unknown",
          caseId: uncertainOrderId,
          reviewAction: "inspect",
        }),
        context: setup(false),
        url: new URL(`${origin}/admin/thanh-toan`),
      } as never),
    ).rejects.toMatchObject({ status: 403 });
    expect(inspectPayosPayment).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("accepts a deliberate delivery recovery with server-derived Owner identity only", async () => {
    rpcMock.mockResolvedValueOnce(true);
    const result = await action({
      request: post({
        caseKind: "delivery_exhausted",
        caseId: uncertainOrderId,
        reviewAction: "requeue",
        confirmation: "THU LAI",
        note: "Đã sửa lỗi hạ tầng và kiểm tra kho.",
        actorId: "fake-actor-id",
      }),
      context: setup(true),
      url: new URL(`${origin}/admin/thanh-toan`),
    } as never);
    expect(result).toBeInstanceOf(Response);
    if (!(result instanceof Response))
      throw Error("Expected redirect response");
    expect(result.status).toBe(303);
    expect(result.headers.get("location")).toContain("requeued=1");
    expect(rpcMock).toHaveBeenCalledExactlyOnceWith(
      "requeue_exhausted_payos_delivery",
      {
        p_order: uncertainOrderId,
        p_actor: ownerId,
        p_note: "Đã sửa lỗi hạ tầng và kiểm tra kho.",
      },
    );
  });

  it("fails closed for mismatched cases, confirmation or result, without reattempting", async () => {
    const invalidRequests: Record<string, string>[] = [
      { caseKind: "receipt_review", confirmation: "THU LAI" },
      { caseKind: "delivery_exhausted", confirmation: "THU LA" },
      {
        caseKind: "delivery_exhausted",
        confirmation: "THU LAI",
        note: "short",
      },
      {
        caseKind: "delivery_exhausted",
        confirmation: "THU LAI",
        caseId: "not-uuid",
      },
    ];
    for (const fields of invalidRequests) {
      const result = await action({
        request: post({
          caseId: uncertainOrderId,
          reviewAction: "requeue",
          ...fields,
        }),
        context: setup(true),
        url: new URL(`${origin}/admin/thanh-toan`),
      } as never);
      if (result instanceof Response)
        throw Error("Expected validation response");
      expect(result.init?.status).toBe(400);
    }
    expect(rpcMock).not.toHaveBeenCalled();
    rpcMock.mockResolvedValueOnce(false);
    const rejected = await action({
      request: post({
        caseKind: "delivery_exhausted",
        caseId: uncertainOrderId,
        reviewAction: "requeue",
        confirmation: "THU LAI",
      }),
      context: setup(true),
      url: new URL(`${origin}/admin/thanh-toan`),
    } as never);
    if (rejected instanceof Response) throw Error("Expected conflict result");
    expect(rejected.init?.status).toBe(409);
    expect(rpcMock).toHaveBeenCalledOnce();
  });

  it("blocks non-Owner or forged CSRF before delivery recovery", async () => {
    for (const [owner, token] of [
      [false, csrf],
      [true, "invalid-csrf"],
    ] as const) {
      await expect(
        action({
          request: post(
            {
              caseKind: "delivery_exhausted",
              caseId: uncertainOrderId,
              reviewAction: "requeue",
              confirmation: "THU LAI",
            },
            token,
          ),
          context: setup(owner),
          url: new URL(`${origin}/admin/thanh-toan`),
        } as never),
      ).rejects.toMatchObject({ status: 403 });
    }
    expect(rpcMock).not.toHaveBeenCalled();
  });
});
