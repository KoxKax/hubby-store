import { describe, expect, it } from "vitest";
import { hostingPreflight } from "../app/server/hosting-preflight";
import { hostedServiceVars } from "../scripts/hosting-config";

function setup() {
  return {
    workers_dev: true,
    preview_urls: false,
    vars: {
      APP_ENV: "staging",
      DATA_MODE: "supabase",
      SUPABASE_ENVIRONMENT: "staging",
      PAYMENTS_MODE: "mock",
      SUPPLIERS_MODE: "mock",
      SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_synthetic_do_not_log",
      SITE_ORIGIN: "https://hubby.synthetic.workers.dev",
    },
  };
}
describe("hosted artifact isolation, not production acceptance", () => {
  it("injects only the verified publishable service config, not local secrets", () => {
    const key = "sb_publishable_synthetic_do_not_log";
    expect(
      hostedServiceVars({
        HUBBY_STAGING_PROJECT_REF: "toienefhdorkcexyfnst",
        SUPABASE_URL: "https://toienefhdorkcexyfnst.supabase.co",
        SUPABASE_PUBLISHABLE_KEY: key,
        DEMO_INVENTORY_KEY: "synthetic_fixture",
        SITE_ORIGIN: "http://127.0.0.1:5176",
        SERVICE_ROLE_KEY: "synthetic_private_do_not_log",
      }),
    ).toEqual({
      SUPABASE_URL: "https://toienefhdorkcexyfnst.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: key,
    });
  });
  it.each([
    {},
    { SUPABASE_URL: "https://other.supabase.co" },
    { SUPABASE_PUBLISHABLE_KEY: "sb_secret_synthetic_private_do_not_log" },
    { HUBBY_STAGING_PROJECT_REF: "other_project" },
  ])(
    "refuses an unverified target or secret key without disclosing values %j",
    (overrides) => {
      const values = Object.keys(overrides).length
        ? {
            HUBBY_STAGING_PROJECT_REF: "toienefhdorkcexyfnst",
            SUPABASE_URL: "https://toienefhdorkcexyfnst.supabase.co",
            SUPABASE_PUBLISHABLE_KEY: "sb_publishable_synthetic_do_not_log",
            ...overrides,
          }
        : {};
      expect(() => hostedServiceVars(values)).toThrow(/verified Hubby/);
      try {
        hostedServiceVars(values);
      } catch (error) {
        expect(String(error)).not.toContain("do_not_log");
      }
    },
  );
  it("accepts a configured staged artifact without claiming provider/UAT readiness", () => {
    const report = hostingPreflight(setup());
    expect(report.configurationAccepted).toBe(true);
    expect(report.productionReady).toBe(false);
    expect(report.providerAccountVerified).toBe(false);
    expect(report.deployed).toBe(false);
    expect(JSON.stringify(report)).not.toContain("synthetic");
  });
  it("blocks missing and malformed artifacts", () => {
    for (const value of [undefined, null, [], {}, "not-configured"])
      expect(hostingPreflight(value).configurationAccepted).toBe(false);
  });
  it.each([
    { APP_ENV: "local" },
    { APP_ENV: "production" },
    { DATA_MODE: "fixtures" },
    { PAYMENTS_MODE: "live" },
    { SUPPLIERS_MODE: "live" },
    { SUPABASE_PUBLISHABLE_KEY: "sb_secret_do_not_log" },
    { SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co/other" },
    { SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co.evil.test" },
    { SITE_ORIGIN: "http://public.example.test" },
    { SITE_ORIGIN: "https://user:do_not_log@host.example.test" },
    { SITE_ORIGIN: "https://127.0.0.1" },
    { DEMO_INVENTORY_KEY: "do_not_log" },
    { SERVICE_ROLE_KEY: "do_not_log" },
  ])("blocks unsafe vars without disclosing them %j", (overrides) => {
    const config = setup();
    const report = hostingPreflight({
      ...config,
      vars: { ...config.vars, ...overrides },
    });
    expect(report.configurationAccepted).toBe(false);
    expect(JSON.stringify(report)).not.toContain("do_not_log");
  });
  it.each([
    {
      durable_objects: {
        bindings: [{ name: "LOCAL_SHOP", class_name: "LocalShop" }],
      },
    },
    {
      migrations: [{ tag: "local-shop-v1", new_sqlite_classes: ["LocalShop"] }],
    },
    { durable_objects: { bindings: "malformed" } },
    { workers_dev: false },
    { preview_urls: true },
  ])("blocks simulator resources or unreviewed routes %j", (overrides) => {
    expect(
      hostingPreflight({ ...setup(), ...overrides }).configurationAccepted,
    ).toBe(false);
  });
});
