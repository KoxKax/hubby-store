import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { dataConfig } from "../app/server/config.server.ts";

// Read-only local configuration check. Never contacts a provider or deploys.
// Node24 executes this existing erasable TS validator; keep one source of truth.
const root = new URL("../", import.meta.url);
const config = JSON.parse(
  readFileSync(new URL("wrangler.jsonc", root), "utf8"),
);
const varsPath = new URL(
  process.argv.includes("--staging") ? ".dev.vars.staging" : ".dev.vars",
  root,
);
const localVars = existsSync(varsPath)
  ? parseEnv(readFileSync(varsPath, "utf8"))
  : {};
const names = [
  "APP_ENV",
  "DATA_MODE",
  "SUPABASE_ENVIRONMENT",
  "SITE_ORIGIN",
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "PAYMENTS_MODE",
  "SUPPLIERS_MODE",
];
const env = Object.fromEntries(
  names.map((name) => [
    name,
    process.env[name] ?? localVars[name] ?? config.vars?.[name],
  ]),
);
const required = [
  "SUPABASE_ENVIRONMENT",
  "SITE_ORIGIN",
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
];
const missing = required.filter((name) => !env[name]);
let configurationAccepted = false;
try {
  configurationAccepted =
    ["local", "staging"].includes(env.APP_ENV) &&
    env.DATA_MODE === "supabase" &&
    !!dataConfig(env);
} catch {
  // Do not print exceptions, URL values, input files or keys into logs.
}
console.log(
  JSON.stringify(
    {
      scope: "staging-config-only",
      configurationAccepted,
      productionReady: false,
      devVarsPresent: existsSync(varsPath),
      missingBindings: missing,
      paymentsRemainMock: env.PAYMENTS_MODE === "mock",
      suppliersRemainMock: env.SUPPLIERS_MODE === "mock",
      next: configurationAccepted
        ? "Verify the selected staging project, Auth/MFA/RLS/CMS and migrations; this result is not live-service acceptance."
        : "Create an Owner-owned free staging project and configure ignored .dev.vars safely; see docs/LOW_COST_RELEASE.md.",
    },
    null,
    2,
  ),
);
process.exitCode = configurationAccepted ? 0 : 2;
