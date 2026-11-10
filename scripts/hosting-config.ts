import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

export function hostedServiceVars(values: Record<string, string | undefined>) {
  const project = values.HUBBY_STAGING_PROJECT_REF;
  const url = values.SUPABASE_URL;
  const key = values.SUPABASE_PUBLISHABLE_KEY;
  if (
    project !== "toienefhdorkcexyfnst" ||
    url !== `https://${project}.supabase.co` ||
    !key?.startsWith("sb_publishable_") ||
    key.length <= "sb_publishable_".length
  )
    throw new Error(
      "Hosted build requires the verified Hubby Supabase project and publishable key",
    );
  // Strict allowlist: no passwords, service keys, fixture keys, or local origin.
  return { SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: key };
}

export function readHostedServiceVars() {
  return hostedServiceVars(
    parseEnv(
      readFileSync(new URL("../.dev.vars.staging", import.meta.url), "utf8"),
    ),
  );
}
