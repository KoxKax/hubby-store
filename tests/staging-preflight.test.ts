import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function run(overrides: Record<string, string | undefined> = {}) {
  const childEnv: Record<string, string | undefined> = {
    ...process.env,
    APP_ENV: "local",
    DATA_MODE: "supabase",
    SUPABASE_ENVIRONMENT: "staging",
    SITE_ORIGIN: "http://127.0.0.1:5174",
    SUPABASE_URL: "https://synthetic-preflight.supabase.co",
    SUPABASE_PUBLISHABLE_KEY: "sb_publishable_synthetic_do_not_log",
    PAYMENTS_MODE: "mock",
    SUPPLIERS_MODE: "mock",
    ...overrides,
  };
  const result = spawnSync(
    process.execPath,
    ["scripts/staging-preflight.mjs"],
    {
      cwd: fileURLToPath(new URL("../", import.meta.url)),
      encoding: "utf8",
      // Wrangler narrows the parent env to local fixture literals. This child
      // deliberately exercises other bindings; no provider connection is made.
      env: childEnv as NodeJS.ProcessEnv,
    },
  );
  if (result.error) throw result.error;
  return {
    status: result.status,
    output: result.stdout,
    report: JSON.parse(result.stdout),
  };
}
describe("read-only staging preflight, not production approval", () => {
  it("accepts configured staging without leaking input values or claiming production", () => {
    const result = run();
    expect(result.status).toBe(0);
    expect(result.report.configurationAccepted).toBe(true);
    expect(result.report.productionReady).toBe(false);
    expect(result.output).not.toContain("synthetic_do_not_log");
    expect(result.output).not.toContain("synthetic-preflight.supabase.co");
  });
  it("fixtures/missing bindings remain blocked", () => {
    const result = run({
      DATA_MODE: "fixtures",
      SUPABASE_URL: "",
      SUPABASE_PUBLISHABLE_KEY: "",
    });
    expect(result.status).toBe(2);
    expect(result.report.missingBindings).toEqual([
      "SUPABASE_URL",
      "SUPABASE_PUBLISHABLE_KEY",
    ]);
    expect(result.report.configurationAccepted).toBe(false);
  });
  it.each([
    { APP_ENV: "production" },
    { APP_ENV: "unknown" },
    { PAYMENTS_MODE: "live" },
    { SUPPLIERS_MODE: "live" },
    { SUPABASE_ENVIRONMENT: "production" },
    { SUPABASE_PUBLISHABLE_KEY: "sb_secret_synthetic_do_not_log" },
    { SUPABASE_URL: "https://evil.example.test" },
    { SUPABASE_URL: "not-a-url-sensitive_do_not_log" },
    { SITE_ORIGIN: "http://public.example.test" },
  ])("rejects unsafe staging config %j without disclosure", (overrides) => {
    const result = run(overrides);
    expect(result.status).toBe(2);
    expect(result.report.configurationAccepted).toBe(false);
    expect(result.report.productionReady).toBe(false);
    expect(result.output).not.toContain("do_not_log");
  });
});
