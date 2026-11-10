import { RouterContextProvider } from "react-router";
import { describe, expect, it, vi } from "vitest";
import {
  issuePayosGuestToken,
  lastGuestOrderCode,
  payosGuestHash,
  readPayosGuestToken,
  rememberGuestOrder,
} from "../app/server/payos-guest.server";
import {
  type GuestOrderGateway,
  guestOrderWithProof,
  revealGuestPayosDelivery,
} from "../app/server/payos-guest-order.server";
import { runtimeContext } from "../app/server/runtime-context.server";

const origin = "https://hubby.dpdns.org";
const token = "A".repeat(43);
const orderId = "bbbb1111-aaaa-4111-8111-aaaa1111aaaa";
const code = "HBBBBB1111AAAA4111";
const order = {
  id: orderId,
  code,
  created: 1700000000000,
  expires: 1700000900000,
  state: "delivered",
  subtotal: 49000,
  discount: 0,
  total: 49000,
  paid: 49000,
  refunded: 0,
  items: [],
};

function mockGateway(raw: unknown = order): GuestOrderGateway {
  return { rpc: vi.fn(async () => raw) };
}

function context() {
  const ctx = new RouterContextProvider();
  const responseCookies = new Map<string, string>();
  ctx.set(runtimeContext, {
    env: {
      APP_ENV: "staging",
      DATA_MODE: "supabase",
      PAYMENTS_MODE: "mock",
      SUPPLIERS_MODE: "mock",
    },
    ctx: {} as ExecutionContext,
    responseHeaders: new Headers(),
    responseCookies,
  });
  return { ctx, responseCookies };
}

describe("guest payOS browser proof", () => {
  it("issues an HttpOnly, Secure, SameSite cookie and reads it back", () => {
    const { ctx, responseCookies } = context();
    const request = new Request(`${origin}/thanh-toan`);
    const generated = issuePayosGuestToken(request, ctx);
    expect(generated).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const cookie = responseCookies.get("__Host-hubby-guest") ?? "";
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie.toLowerCase()).toContain("samesite=lax");
    const subsequent = new Request(`${origin}/thanh-toan`, {
      headers: { Cookie: cookie.split(";")[0] ?? "" },
    });
    expect(readPayosGuestToken(subsequent)).toBe(generated);
    expect(issuePayosGuestToken(subsequent, ctx)).toBe(generated);
  });

  it("remembers guest's actual readable code for the return page", () => {
    const { ctx, responseCookies } = context();
    rememberGuestOrder(new Request(`${origin}/thanh-toan`), ctx, orderId);
    const cookie = responseCookies.get("__Host-hubby-last-order") ?? "";
    const request = new Request(`${origin}/thanh-toan/ket-qua`, {
      headers: { Cookie: cookie.split(";")[0] ?? "" },
    });
    expect(lastGuestOrderCode(request)).toBe(code);
  });

  it("only returns an order when trusted DB confirms code, email, cookie hash", async () => {
    const gateway = mockGateway();
    expect(
      await guestOrderWithProof(
        code.toLowerCase(),
        " Guest@Test.example ",
        token,
        gateway,
      ),
    ).toMatchObject(order);
    expect(gateway.rpc).toHaveBeenCalledWith("guest_order_by_proof", {
      p_code: code,
      p_email: "guest@test.example",
      p_guest_hash: await payosGuestHash(token),
    });
    expect(
      await guestOrderWithProof(
        code,
        "guest@test.example",
        token,
        mockGateway(null),
      ),
    ).toBeNull();
  });

  it("rejects invalid guest proof before database reads", async () => {
    const gateway = mockGateway();
    for (const invalid of ["short", "", "not-a-token"]) {
      await expect(
        guestOrderWithProof(code, "guest@test.example", invalid, gateway),
      ).rejects.toMatchObject({ status: 403 });
    }
    expect(gateway.rpc).not.toHaveBeenCalled();
  });

  it("won't decrypt missing/unverified delivery and only requests from trusted RPC", async () => {
    const gateway = mockGateway(null);
    await expect(
      revealGuestPayosDelivery(
        code,
        "guest@test.example",
        token,
        gateway,
        "key",
      ),
    ).rejects.toMatchObject({ status: 404 });
    expect(gateway.rpc).toHaveBeenCalledWith("read_guest_payos_delivery", {
      p_code: code,
      p_email: "guest@test.example",
      p_guest_hash: await payosGuestHash(token),
    });
  });
});
