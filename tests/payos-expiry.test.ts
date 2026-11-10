import { describe, expect, it, vi } from "vitest";
import {
  expireUnsubmittedPayosCheckouts,
  payosExpiryReady,
} from "../app/server/payos-expiry.server";

const completeStaging = {
  APP_ENV: "staging",
  DATA_MODE: "supabase",
  SUPABASE_ENVIRONMENT: "staging",
  SUPPLIERS_MODE: "mock",
  PAYMENTS_MODE: "payos",
  PAYOS_CHECKOUT_READY: "true",
  SUPABASE_URL: "https://synthetic.supabase.co",
  SUPABASE_SECRET_KEY: "sb_secret_synthetic",
  PAYOS_CLIENT_ID: "test-client",
  PAYOS_API_KEY: "test-key",
  PAYOS_CHECKSUM_KEY: "test-checksum-key",
  SITE_ORIGIN: "https://synthetic.test",
};

describe("safe payOS reservation expiry (gateway only, no cloud writes)", () => {
  it("stays unavailable when real payment activation is closed", () => {
    expect(
      payosExpiryReady({ ...completeStaging, PAYMENTS_MODE: "mock" } as never),
    ).toBe(false);
    expect(
      payosExpiryReady({ ...completeStaging, APP_ENV: "production" } as never),
    ).toBe(false);
    expect(
      payosExpiryReady({
        ...completeStaging,
        PAYOS_CHECKOUT_READY: "false",
      } as never),
    ).toBe(false);
    expect(payosExpiryReady(completeStaging as never)).toBe(true);
  });

  it("uses one bounded service RPC and returns confirmed count", async () => {
    const rpc = vi.fn(async () => 2);
    expect(await expireUnsubmittedPayosCheckouts({ rpc })).toBe(2);
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith("expire_unsubmitted_payos_checkouts", {
      p_limit: 10,
    });
  });

  it("rejects invalid batch sizes without touching inventory", async () => {
    const rpc = vi.fn(async () => 0);
    for (const limit of [-1, 0, 21, 1.5, Number.NaN]) {
      await expect(
        expireUnsubmittedPayosCheckouts({ rpc }, limit),
      ).rejects.toThrow();
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it("fails closed on implausible or ambiguous RPC responses", async () => {
    for (const value of [null, -1, 11, "1", true]) {
      const rpc = vi.fn(async () => value);
      await expect(expireUnsubmittedPayosCheckouts({ rpc })).rejects.toThrow();
    }
    const rpc = vi.fn(async () => {
      throw Error("Unknown DB commit status");
    });
    await expect(expireUnsubmittedPayosCheckouts({ rpc })).rejects.toThrow();
  });
});
