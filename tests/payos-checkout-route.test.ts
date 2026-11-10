import type { SupabaseClient } from "@supabase/supabase-js";
import { RouterContextProvider } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { action, loader } from "../app/routes/checkout";
import { startPayosCheckout } from "../app/server/payos-checkout.server";
import { runtimeContext } from "../app/server/runtime-context.server";

vi.mock("../app/server/payos-checkout.server", async (load) => ({
  ...(await load<typeof import("../app/server/payos-checkout.server")>()),
  payosCheckoutGateway: vi.fn(() => ({})),
  startPayosCheckout: vi.fn(async () => ({
    url: "https://pay.payos.vn/web/synthetic",
    orderId: "bbbb1111-aaaa-4111-8111-aaaa1111aaaa",
  })),
}));

const origin = "http://127.0.0.1:5174";
const csrf = "a".repeat(43);
const verifiedId = "abababab-abab-4bab-8bab-abababababab";

function setup(signedIn: boolean, emailVerified = true) {
  const client = {
    auth: {
      getUser: vi.fn(async () => ({
        data: {
          user: signedIn
            ? {
                id: verifiedId,
                email: "Verified@Example.Test",
                email_confirmed_at: emailVerified
                  ? "2026-10-28T00:00:00Z"
                  : null,
              }
            : null,
        },
        error: null,
      })),
    },
    rpc: vi.fn(async () => ({ data: { owner: false }, error: null })),
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
      PAYOS_CLIENT_ID: "synthetic-client-id",
      PAYOS_API_KEY: "synthetic-api-key",
      PAYOS_CHECKSUM_KEY: "synthetic-checksum-key",
      SITE_ORIGIN: origin,
    },
    ctx: {} as ExecutionContext,
    responseHeaders: new Headers(),
    responseCookies: new Map(),
    client: client as unknown as SupabaseClient,
  });
  return context;
}

function post(email: string, guestToken: string | null = "A".repeat(43)) {
  return new Request(`${origin}/thanh-toan`, {
    method: "POST",
    headers: {
      Origin: origin,
      Cookie: `hubby-local-csrf=${csrf}${guestToken ? `; hubby-local-guest=${guestToken}` : ""}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      csrf,
      email,
      key: "aaaa1111-aaaa-4111-8111-aaaa1111aaaa",
      // Forged fields must never override the HttpOnly browser cookie.
      guestToken: "Z".repeat(43),
      lines: JSON.stringify([{ variantId: "canva-edu-3y", quantity: 1 }]),
      coupon: "",
    }),
  });
}

beforeEach(() => vi.clearAllMocks());

describe("payOS checkout route account binding (isolated)", () => {
  it("prefills the email from verified Supabase Auth, not browser input", async () => {
    const state = await loader({
      request: new Request(`${origin}/thanh-toan`),
      context: setup(true),
    } as never);
    expect(state.mode).toBe("payos");
    expect(state.customerEmail).toBe("Verified@Example.Test");
  });

  it("discards forged email before reserving stock or creating payment", async () => {
    const response = await action({
      request: post("attacker@example.test"),
      context: setup(true),
    } as never);
    if (!(response instanceof Response))
      throw new Error("Expected checkout redirect");
    expect(response.status).toBe(303);
    expect(startPayosCheckout).toHaveBeenCalledOnce();
    expect(vi.mocked(startPayosCheckout).mock.calls[0]?.[0]).toMatchObject({
      email: "verified@example.test",
      userId: verifiedId,
    });
  });

  it("does not treat a signed-in but unconfirmed email as a guest checkout", async () => {
    const response = await action({
      request: post("attacker@example.test"),
      context: setup(true, false),
    } as never);
    if (response instanceof Response)
      throw new Error("Expected checked form error");
    expect(response.init?.status).toBe(409);
    expect(startPayosCheckout).not.toHaveBeenCalled();
  });

  it("allows guests with a browser proof and uses their contact email", async () => {
    const context = setup(false);
    const response = await action({
      request: post("guest@example.test"),
      context,
    } as never);
    if (!(response instanceof Response))
      throw new Error("Expected guest checkout redirect");
    expect(response.status).toBe(303);
    expect(vi.mocked(startPayosCheckout).mock.calls[0]?.[0]).toMatchObject({
      email: "guest@example.test",
      userId: null,
      guestToken: "A".repeat(43),
    });
    expect(
      context.get(runtimeContext).responseCookies.get("hubby-local-last-order"),
    ).toContain("HttpOnly");
  });

  it("rejects missing browser proof before the payment adapter is invoked", async () => {
    const response = await action({
      request: post("guest@example.test", null),
      context: setup(false),
    } as never);
    if (response instanceof Response)
      throw new Error("Expected checked form error");
    expect(response.init?.status).toBe(403);
    expect(startPayosCheckout).not.toHaveBeenCalled();
  });
});
