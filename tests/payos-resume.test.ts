import { describe, expect, it, vi } from "vitest";
import { payosGuestHash } from "../app/server/payos-guest.server";
import {
  payosResumeRedirect,
  resumeGuestPayosCheckout,
  resumeRegisteredPayosCheckout,
} from "../app/server/payos-resume.server";

const url = "https://pay.payos.vn/web/synthetic-payment-link";
const orderId = "bbbb1111-aaaa-4111-8111-aaaa1111aaaa";
const code = "HBBBBB1111AAAA4111";
const token = "A".repeat(43);

describe("resume an existing payOS link without a second provider request", () => {
  it("only asks the authenticated database RPC for the verified order", async () => {
    const gateway = { rpc: vi.fn(async () => url) };
    expect(await resumeRegisteredPayosCheckout(orderId, gateway)).toBe(url);
    expect(await resumeRegisteredPayosCheckout(orderId, gateway)).toBe(url);
    expect(gateway.rpc).toHaveBeenCalledTimes(2);
    expect(gateway.rpc).toHaveBeenCalledWith("resume_registered_payos_link", {
      p_order: orderId,
    });
    await expect(
      resumeRegisteredPayosCheckout("wrong", gateway),
    ).rejects.toMatchObject({ status: 404 });
    expect(gateway.rpc).toHaveBeenCalledTimes(2);
  });

  it("normalizes code and email, hashes the browser proof and never transmits its raw value", async () => {
    const gateway = { rpc: vi.fn(async () => url) };
    expect(
      await resumeGuestPayosCheckout(
        code.toLowerCase(),
        " Guest@Example.Test ",
        token,
        gateway,
      ),
    ).toBe(url);
    expect(gateway.rpc).toHaveBeenCalledWith("resume_guest_payos_link", {
      p_code: code,
      p_email: "guest@example.test",
      p_guest_hash: await payosGuestHash(token),
    });
    expect(JSON.stringify(gateway.rpc.mock.calls)).not.toContain(token);
  });

  it("rejects missing proof, absent/expired DB link, or an off-site URL", async () => {
    const gateway = { rpc: vi.fn(async () => null as unknown) };
    await expect(
      resumeGuestPayosCheckout(code, "guest@example.test", "bad", gateway),
    ).rejects.toMatchObject({ status: 403 });
    expect(gateway.rpc).not.toHaveBeenCalled();
    await expect(
      resumeGuestPayosCheckout(code, "guest@example.test", token, gateway),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      resumeRegisteredPayosCheckout(orderId, gateway),
    ).rejects.toMatchObject({ status: 409 });
    gateway.rpc.mockImplementation(
      async () => "https://pay.payos.vn.evil.invalid/web/fake",
    );
    await expect(
      resumeRegisteredPayosCheckout(orderId, gateway),
    ).rejects.toMatchObject({ status: 503 });
  });

  it("redirects by POST only, with no-store and no-referrer", () => {
    const response = payosResumeRedirect(url);
    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe(url);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
  });
});
