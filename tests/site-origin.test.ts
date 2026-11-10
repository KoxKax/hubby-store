import { RouterContextProvider } from "react-router";
import { describe, expect, it } from "vitest";
import { hostingPreflight } from "../app/server/hosting-preflight";
import type { HubbyEnv } from "../app/server/runtime-context.server";
import { runtimeContext } from "../app/server/runtime-context.server";
import { siteEnvForRequest } from "../app/server/site-origin.server";
import { requestClient } from "../app/server/supabase.server";

const primary = "https://hubby.synthetic.workers.dev";
const alias = "https://hubby.dpdns.org";
const env: HubbyEnv = {
  APP_ENV: "staging",
  DATA_MODE: "supabase",
  SUPABASE_ENVIRONMENT: "staging",
  PAYMENTS_MODE: "mock",
  SUPPLIERS_MODE: "mock",
  SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_synthetic",
  SITE_ORIGIN: primary,
  SITE_ALIAS: alias,
};
describe("exact server-configured domain alias", () => {
  it("allows the alias without changing the original configured environment", () => {
    expect(
      siteEnvForRequest(new Request(`${alias}/admin`), env).SITE_ORIGIN,
    ).toBe(alias);
    expect(siteEnvForRequest(new Request(primary), env)).toBe(env);
    expect(env.SITE_ORIGIN).toBe(primary);
  });
  it("does not trust suffixes, HTTP, ports, forwarded host, or other tenants", () => {
    for (const url of [
      "https://hubby.dpdns.org.evil.test",
      "https://other.dpdns.org",
      "http://hubby.dpdns.org",
      "https://hubby.dpdns.org:444",
    ]) {
      const request = new Request(url, {
        headers: { "X-Forwarded-Host": "hubby.dpdns.org" },
      });
      expect(siteEnvForRequest(request, env)).toBe(env);
      const context = new RouterContextProvider();
      context.set(runtimeContext, {
        env: siteEnvForRequest(request, env),
        ctx: {} as ExecutionContext,
        responseHeaders: new Headers(),
        responseCookies: new Map(),
      });
      expect(() => requestClient(request, context)).toThrow();
    }
  });
  it("fails closed for malformed configured aliases", () => {
    for (const SITE_ALIAS of [
      "invalid",
      "http://hubby.dpdns.org",
      "https://secret@hubby.dpdns.org",
      "https://hubby.dpdns.org/",
      "https://hubby.dpdns.org?query=1",
    ])
      expect(() =>
        siteEnvForRequest(new Request(primary), { ...env, SITE_ALIAS }),
      ).toThrow();
  });
  it("allows only the verified alias in hosting artifact preflight", () => {
    const config = { workers_dev: true, preview_urls: false, vars: env };
    expect(hostingPreflight(config).configurationAccepted).toBe(true);
    expect(
      hostingPreflight({
        ...config,
        vars: { ...env, SITE_ALIAS: "https://other.dpdns.org" },
      }).configurationAccepted,
    ).toBe(false);
  });
  it("preserves exactly the registered custom domain route, not a wildcard", () => {
    const route = {
      pattern: "hubby.dpdns.org",
      zone_id: "2f4457ab24731c570d2f86fa026a46af",
      custom_domain: true,
    };
    const config = {
      workers_dev: true,
      preview_urls: false,
      vars: env,
      routes: [route],
    };
    expect(hostingPreflight(config).configurationAccepted).toBe(true);
    for (const routes of [
      "malformed",
      [],
      [{ ...route, pattern: "*.dpdns.org" }],
      [{ ...route, zone_id: "other" }],
      [{ ...route, custom_domain: false }],
    ])
      expect(
        hostingPreflight({ ...config, routes }).configurationAccepted,
      ).toBe(false);
  });
});
