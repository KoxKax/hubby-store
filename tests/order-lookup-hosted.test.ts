import { RouterContextProvider } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { action } from "../app/routes/order-lookup";
import {
  commerceRpc,
  customerSpace,
} from "../app/server/commerce-repository.server";
import { runtimeContext } from "../app/server/runtime-context.server";
import { identity } from "../app/server/supabase.server";

vi.mock("../app/server/commerce-repository.server", () => ({
  commerceRpc: vi.fn(),
  customerSpace: vi.fn(),
  commerceOrderSchema: { parse: (value: unknown) => value },
}));
vi.mock("../app/server/supabase.server", () => ({ identity: vi.fn() }));
vi.mock("../app/server/local-shop.server", () => ({
  localEnabled: () => false,
}));

const origin = "https://hubby.dpdns.org";
const csrf = "x".repeat(43);
const code = "HB0123456789ABCDEF";
const order = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  code,
  state: "paid" as const,
  created: 1700000000000,
  expires: 1700000900000,
  subtotal: 49000,
  discount: 0,
  total: 49000,
  paid: 49000,
  refunded: 0,
  items: [],
};
function post(
  values: Record<string, string> = {},
  options: { guestClaimReady?: boolean } = { guestClaimReady: true },
) {
  const request = new Request(`${origin}/tra-don-hang`, {
    method: "POST",
    headers: {
      Origin: origin,
      Cookie: `__Host-hubby-csrf=${csrf}`,
    },
    body: new URLSearchParams({
      csrf,
      code,
      email: "buyer@example.test",
      ...values,
    }),
  });
  const context = new RouterContextProvider();
  context.set(runtimeContext, {
    env: {
      APP_ENV: "staging",
      DATA_MODE: "supabase",
      SUPABASE_ENVIRONMENT: "staging",
      PAYMENTS_MODE: "mock",
      SUPPLIERS_MODE: "mock",
      ...(options.guestClaimReady ? { GUEST_CLAIM_READY: "true" } : {}),
    },
    ctx: {} as ExecutionContext,
    responseHeaders: new Headers(),
    responseCookies: new Map(),
  });
  return action({
    request,
    context,
    params: {},
    url: new URL(request.url),
    pattern: "/tra-don-hang",
  });
}

describe("hosted customer order lookup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(identity).mockResolvedValue({
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      email: "buyer@example.test",
      emailVerified: true,
      owner: false,
      aal2: false,
      mfaRequired: false,
    });
    vi.mocked(commerceRpc).mockResolvedValue(order);
    vi.mocked(customerSpace).mockResolvedValue({
      orders: [order],
      tickets: [],
    });
  });

  it("finds only an order already owned by the verified session", async () => {
    const result = await post({ code: code.toLowerCase() });
    expect(result).toMatchObject({ order, mode: "account", error: "" });
    expect(commerceRpc).toHaveBeenCalledWith(
      expect.any(Request),
      expect.anything(),
      "customer_order_by_code",
      { p_code: code },
    );
  });

  it("never reads orders when unauthenticated", async () => {
    vi.mocked(identity).mockResolvedValue(null);
    const result = await post();
    expect(result).toMatchObject({ order: null, mode: "none" });
    expect(commerceRpc).not.toHaveBeenCalled();
  });

  it("rejects different email before requesting the customer orders", async () => {
    const result = await post({ email: "another@example.test" });
    expect(result).toMatchObject({ order: null, mode: "none" });
    expect(commerceRpc).not.toHaveBeenCalled();
  });

  it("does not match another order code or an abbreviated code", async () => {
    vi.mocked(commerceRpc).mockResolvedValueOnce(null);
    const wrong = await post({ code: "HBFFFFFFFFFFFFFFFF" });
    const abbreviated = await post({ code: "01234567" });
    expect(wrong).toMatchObject({ order: null, mode: "account" });
    expect(abbreviated).toMatchObject({ order: null, mode: "none" });
  });

  it("requires a deliberate claim action before binding a guest order", async () => {
    const result = await post({ intent: "claim" });
    expect(result).toMatchObject({ order, mode: "claimed", error: "" });
    expect(commerceRpc).toHaveBeenCalledWith(
      expect.any(Request),
      expect.anything(),
      "claim_verified_guest_order",
      { p_code: code, p_email: "buyer@example.test" },
    );
  });

  it("keeps the previous ownership-only lookup without a deployed migration", async () => {
    const found = await post({}, { guestClaimReady: false });
    expect(found).toMatchObject({ order, mode: "account" });
    expect(customerSpace).toHaveBeenCalledOnce();
    expect(commerceRpc).not.toHaveBeenCalled();
    const claim = await post({ intent: "claim" }, { guestClaimReady: false });
    expect(claim).toMatchObject({ order: null, mode: "none" });
    expect(commerceRpc).not.toHaveBeenCalled();
  });

  it("refuses invalid CSRF before querying the customer", async () => {
    const result = await post({ csrf: "invalid" });
    expect(result).toMatchObject({
      data: { order: null, mode: "none" },
      init: { status: 403 },
    });
    expect(commerceRpc).not.toHaveBeenCalled();
  });
});
