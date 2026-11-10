import { describe, expect, it, vi } from "vitest";
import {
  type CheckoutInput,
  checkoutBuyerIdentity,
  type PayosCheckoutGateway,
  payosCheckoutReady,
  startPayosCheckout,
} from "../app/server/payos-checkout.server";

const input: CheckoutInput = {
  requestKey: "aaaa1111-aaaa-4111-8111-aaaa1111aaaa",
  guestToken: "A".repeat(43),
  email: " Buyer@Example.Test ",
  userId: "abababab-abab-4bab-8bab-abababababab",
  lines: [{ variantId: "canva-edu-3y", quantity: 1 }],
  coupon: "",
};
const checkoutUrl = "https://pay.payos.vn/web/12345678901234567890123456789012";
const link = {
  numericCode: 2000000000,
  paymentLinkId: "12345678901234567890123456789012",
  receivingAccount: "0000012345",
  checkoutUrl,
};
const order = {
  status: "claimed",
  orderId: "bbbb1111-aaaa-4111-8111-aaaa1111aaaa",
  orderCode: link.numericCode,
  total: 49000,
  createdAt: Date.now() - 1000,
  expiresAt: Date.now() + 800000,
};

function gateway(claim: unknown = order): PayosCheckoutGateway {
  return {
    rpc: vi.fn(async (name) =>
      name === "claim_payos_link_attempt"
        ? claim
        : name === "attach_payos_link"
          ? true
          : { orderId: order.orderId },
    ),
    createLink: vi.fn(async () => link),
  };
}

describe("payOS checkout orchestration (no external calls)", () => {
  it("uses the authenticated account's email and rejects absent/malformed identities", () => {
    expect(
      checkoutBuyerIdentity({
        id: input.userId ?? "",
        email: " Buyer@Example.Test ",
        emailVerified: true,
      }),
    ).toEqual({ userId: input.userId, email: "buyer@example.test" });
    for (const buyer of [
      null,
      { id: input.userId ?? "", email: "", emailVerified: true },
      { id: input.userId ?? "", email: "wrong", emailVerified: true },
      { id: "not-uuid", email: "buyer@example.test", emailVerified: true },
      {
        id: input.userId ?? "",
        email: "buyer@example.test",
        emailVerified: false,
      },
    ]) {
      expect(() => checkoutBuyerIdentity(buyer)).toThrow(Response);
    }
  });
  it("reserves server-priced inventory before provider creation, then saves the link before redirecting", async () => {
    const api = gateway();
    expect(await startPayosCheckout(input, api)).toEqual({
      url: checkoutUrl,
      orderId: order.orderId,
    });
    const rpc = vi.mocked(api.rpc);
    expect(rpc.mock.calls.map((call) => call[0])).toEqual([
      "reserve_payos_checkout",
      "claim_payos_link_attempt",
      "attach_payos_link",
    ]);
    expect(rpc.mock.calls[0]?.[1]).toMatchObject({
      p_email: "buyer@example.test",
      p_guest_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      p_user: input.userId,
      p_lines: [{ variantKey: "canva-edu-3y", quantity: 1 }],
    });
    expect(api.createLink).toHaveBeenCalledTimes(1);
  });

  it("returns an already stored payment link without a second payOS POST", async () => {
    const api = gateway({
      status: "linked",
      checkoutUrl,
      orderId: order.orderId,
      orderCode: link.numericCode,
    });
    expect(await startPayosCheckout(input, api)).toEqual({
      url: checkoutUrl,
      orderId: order.orderId,
    });
    expect(api.createLink).not.toHaveBeenCalled();
  });

  it("accepts a guest checkout with a browser-held token and null account identity", async () => {
    const api = gateway();
    expect(await startPayosCheckout({ ...input, userId: null }, api)).toEqual({
      url: checkoutUrl,
      orderId: order.orderId,
    });
    expect(api.rpc).toHaveBeenCalledWith(
      "reserve_payos_checkout",
      expect.objectContaining({
        p_user: null,
        p_guest_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
  });

  it("never creates a second link when the first request was ambiguous", async () => {
    const api = gateway({ status: "uncertain" } as typeof order);
    await expect(startPayosCheckout(input, api)).rejects.toMatchObject({
      status: 409,
    });
    expect(api.createLink).not.toHaveBeenCalled();
  });

  it("does not redirect if provider link cannot be recorded", async () => {
    const api = gateway();
    api.rpc = vi.fn(async (name) =>
      name === "claim_payos_link_attempt" ? order : false,
    );
    await expect(startPayosCheckout(input, api)).rejects.toMatchObject({
      status: 503,
    });
  });

  it("does not persist an unsafe provider URL after link creation", async () => {
    const api = gateway();
    api.createLink = vi.fn(async () => ({
      ...link,
      checkoutUrl: "https://evil.test/steal",
    }));
    await expect(startPayosCheckout(input, api)).rejects.toMatchObject({
      status: 503,
    });
    expect(api.createLink).toHaveBeenCalledTimes(1);
    expect(vi.mocked(api.rpc).mock.calls.map(([name]) => name)).toEqual([
      "reserve_payos_checkout",
      "claim_payos_link_attempt",
    ]);
  });

  it("rejects forged cart fields, repeated variants, coupon assumptions and unsafe stored URL", async () => {
    for (const invalid of [
      {
        ...input,
        lines: [{ variantId: "canva-edu-3y", quantity: 1, priceVnd: 1 }],
      },
      {
        ...input,
        lines: [
          { variantId: "canva-edu-3y", quantity: 1 },
          { variantId: "canva-edu-3y", quantity: 1 },
        ],
      },
      { ...input, coupon: "HUBBYxHUBER" },
      { ...input, guestToken: "not-random" },
    ]) {
      const api = gateway();
      await expect(startPayosCheckout(invalid, api)).rejects.toBeInstanceOf(
        Response,
      );
      expect(api.rpc).not.toHaveBeenCalled();
    }
    const api = gateway({
      status: "linked",
      checkoutUrl: "https://evil.test/steal",
      orderId: order.orderId,
      orderCode: link.numericCode,
    });
    await expect(startPayosCheckout(input, api)).rejects.toMatchObject({
      status: 503,
    });
  });

  it("keeps real payment disabled unless every separate activation condition is present", () => {
    expect(
      payosCheckoutReady({
        APP_ENV: "staging",
        DATA_MODE: "supabase",
        PAYMENTS_MODE: "mock",
      } as never),
    ).toBe(false);
    expect(
      payosCheckoutReady({
        APP_ENV: "staging",
        DATA_MODE: "supabase",
        PAYMENTS_MODE: "payos",
        PAYOS_CHECKOUT_READY: "false",
      } as never),
    ).toBe(false);
  });
});
