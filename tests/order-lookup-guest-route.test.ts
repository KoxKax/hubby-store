import { RouterContextProvider } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { action } from "../app/routes/order-lookup";
import { payosGuestHash } from "../app/server/payos-guest.server";
import { guestOrderGateway } from "../app/server/payos-guest-order.server";
import { payosGuestResumeGateway } from "../app/server/payos-resume.server";
import { runtimeContext } from "../app/server/runtime-context.server";
import { sealStockUnit } from "../app/server/stock-seal.server";

vi.mock("../app/server/local-shop.server", () => ({
  localEnabled: () => false,
}));
vi.mock("../app/server/supabase.server", () => ({
  identity: vi.fn(async () => null),
}));
vi.mock("../app/server/payos-guest-order.server", async (load) => ({
  ...(await load<typeof import("../app/server/payos-guest-order.server")>()),
  guestOrderGateway: vi.fn(),
}));
vi.mock("../app/server/payos-resume.server", async (load) => ({
  ...(await load<typeof import("../app/server/payos-resume.server")>()),
  payosGuestResumeGateway: vi.fn(),
}));

const origin = "https://hubby.dpdns.org";
const csrf = "x".repeat(43);
const browserToken = "A".repeat(43);
const code = "HBABCDEF0123456789";
const email = "guest@example.test";
const orderId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const variantId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const stockId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const inventoryKey = "ab".repeat(32);
const order = {
  id: orderId,
  code,
  state: "delivered",
  created: 1700000000000,
  expires: 1700000900000,
  subtotal: 49000,
  discount: 0,
  total: 49000,
  paid: 49000,
  refunded: 0,
  items: [],
};

function guestPost(
  values: Record<string, string> = {},
  token: string | null = browserToken,
) {
  const request = new Request(`${origin}/tra-don-hang`, {
    method: "POST",
    headers: {
      Origin: origin,
      Cookie: `__Host-hubby-csrf=${csrf}${token ? `; __Host-hubby-guest=${token}` : ""}`,
    },
    body: new URLSearchParams({
      csrf,
      code,
      email,
      intent: "lookup",
      ...values,
    }),
  });
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
      SUPABASE_SECRET_KEY: "sb_secret_synthetic",
      PAYOS_CLIENT_ID: "synthetic-id",
      PAYOS_API_KEY: "synthetic-key",
      PAYOS_CHECKSUM_KEY: "synthetic-checksum",
      SITE_ORIGIN: origin,
      INVENTORY_ENCRYPTION_KEY_V1: inventoryKey,
    },
    ctx: {} as ExecutionContext,
    responseHeaders: new Headers(),
    responseCookies: new Map(),
  });
  return action({ request, context, params: {} } as never);
}

beforeEach(() => vi.clearAllMocks());

describe("guest order lookup route proof and delivery boundaries", () => {
  it("resumes an existing pending link only via a CSRF-protected POST and guest proof", async () => {
    const pending = { ...order, state: "pending_payment", paid: 0 };
    const lookupRpc = vi.fn(async () => pending);
    const resumeRpc = vi.fn(
      async () => "https://pay.payos.vn/web/synthetic-resume",
    );
    vi.mocked(guestOrderGateway).mockReturnValue({ rpc: lookupRpc } as never);
    vi.mocked(payosGuestResumeGateway).mockReturnValue({ rpc: resumeRpc });
    const response = await guestPost({ intent: "resume" });
    expect(response).toBeInstanceOf(Response);
    if (!(response instanceof Response))
      throw new Error("Expected secure redirect");
    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe(
      "https://pay.payos.vn/web/synthetic-resume",
    );
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(resumeRpc).toHaveBeenCalledOnce();
    expect(
      await guestPost({ intent: "resume", csrf: "invalid" }),
    ).toMatchObject({ init: { status: 403 } });
    expect(resumeRpc).toHaveBeenCalledOnce();
  });
  it("requires the browser cookie before calling any trusted order RPC", async () => {
    const result = await guestPost({}, null);
    expect(result).toMatchObject({ order: null, mode: "none" });
    expect(guestOrderGateway).not.toHaveBeenCalled();
  });

  it("requires code, email, and cookie hash together to return an order", async () => {
    const hash = await payosGuestHash(browserToken);
    const rpc = vi.fn(async (_name: string, args: Record<string, string>) =>
      args.p_code === code &&
      args.p_email === email &&
      args.p_guest_hash === hash
        ? order
        : null,
    );
    vi.mocked(guestOrderGateway).mockReturnValue({ rpc } as never);
    expect(await guestPost()).toMatchObject({ mode: "guest", order });
    expect(await guestPost({ email: "other@example.test" })).toMatchObject({
      order: null,
      mode: "none",
    });
    expect(await guestPost({}, "B".repeat(43))).toMatchObject({
      order: null,
      mode: "none",
    });
    expect(rpc).toHaveBeenCalledWith("guest_order_by_proof", {
      p_code: code,
      p_email: email,
      p_guest_hash: hash,
    });
  });

  it("never decrypts during lookup, only on a separate verified POST reveal", async () => {
    const unit = await sealStockUnit(
      { id: stockId, variantId },
      { type: "license_key", licenseKey: "SYNTHETIC-TEST-KEY" },
      1,
      { 1: inventoryKey },
    );
    const rpc = vi.fn(async (name: string) =>
      name === "guest_order_by_proof"
        ? order
        : [{ id: stockId, variantId, ...unit }],
    );
    vi.mocked(guestOrderGateway).mockReturnValue({ rpc } as never);
    const lookup = await guestPost();
    expect(lookup).toMatchObject({ mode: "guest", order });
    expect(JSON.stringify(lookup)).not.toContain("SYNTHETIC-TEST-KEY");
    expect(rpc).toHaveBeenCalledTimes(1);

    const reveal = await guestPost({ intent: "reveal" });
    expect(reveal).toMatchObject({
      mode: "guest",
      products: [{ stockId, licenseKey: "SYNTHETIC-TEST-KEY" }],
    });
    expect(rpc).toHaveBeenCalledWith(
      "read_guest_payos_delivery",
      expect.any(Object),
    );
  });

  it("rejects tampered CSRF before consulting the guest database", async () => {
    const result = await guestPost({ csrf: "tampered" });
    expect(result).toMatchObject({
      data: { mode: "none", order: null },
      init: { status: 403 },
    });
    expect(guestOrderGateway).not.toHaveBeenCalled();
  });
});
