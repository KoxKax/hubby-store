type RecordValue = Record<string, unknown>;
function record(value: unknown): RecordValue {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as RecordValue)
    : {};
}
function httpsOrigin(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      url.origin === value &&
      !url.username &&
      !url.password &&
      !url.hostname.endsWith(".invalid")
      ? url
      : null;
  } catch {
    return null;
  }
}

// This inspects an artifact, not a provider account or permission to publish.
// Values never appear in reports, including malformed URLs and unknown vars.
export function hostingPreflight(input: unknown) {
  const config = record(input);
  const vars = record(config.vars);
  const blockers: string[] = [];
  if (
    vars.APP_ENV !== "staging" ||
    vars.DATA_MODE !== "supabase" ||
    vars.SUPABASE_ENVIRONMENT !== "staging" ||
    !["mock", "payos"].includes(String(vars.PAYMENTS_MODE)) ||
    !["mock", "bite"].includes(String(vars.SUPPLIERS_MODE))
  )
    blockers.push("staging-only-configuration-required");
  const allowedVars = new Set([
    "APP_ENV",
    "DATA_MODE",
    "SUPABASE_ENVIRONMENT",
    "PAYMENTS_MODE",
    "SUPPLIERS_MODE",
    "PAYOS_CHECKOUT_READY",
    "BITE_SCHEMA_READY",
    "BITE_READY",
    "BITE_TRACKING_READY",
    "SUPABASE_URL",
    "SUPABASE_PUBLISHABLE_KEY",
    "SITE_ORIGIN",
    "SITE_ALIAS",
  ]);
  if (Object.keys(vars).some((key) => !allowedVars.has(key)))
    blockers.push("unexpected-runtime-vars");
  if (vars.PAYMENTS_MODE === "payos" && vars.PAYOS_CHECKOUT_READY !== "true")
    blockers.push("explicit-payment-activation-required");
  if (
    vars.SUPPLIERS_MODE === "bite" &&
    (vars.BITE_SCHEMA_READY !== "true" || vars.BITE_READY !== "true")
  )
    blockers.push("explicit-supplier-activation-required");
  const bindings = record(config.durable_objects).bindings;
  if (
    (Array.isArray(bindings) && bindings.length > 0) ||
    (bindings !== undefined && !Array.isArray(bindings)) ||
    (Array.isArray(config.migrations) && config.migrations.length > 0) ||
    (config.migrations !== undefined && !Array.isArray(config.migrations))
  )
    blockers.push("local-simulator-bindings-or-migrations-present");
  const service = httpsOrigin(vars.SUPABASE_URL);
  if (
    !service ||
    !/^[a-z]{20}\.supabase\.co$/.test(service.hostname) ||
    typeof vars.SUPABASE_PUBLISHABLE_KEY !== "string" ||
    !vars.SUPABASE_PUBLISHABLE_KEY.startsWith("sb_publishable_") ||
    vars.SUPABASE_PUBLISHABLE_KEY.length <= "sb_publishable_".length
  )
    blockers.push("verified-project-runtime-configuration-required");
  const origin = httpsOrigin(vars.SITE_ORIGIN);
  if (
    config.routes !== undefined &&
    (!Array.isArray(config.routes) ||
      config.routes.length !== 1 ||
      record(config.routes[0]).pattern !== "hubby.dpdns.org" ||
      record(config.routes[0]).custom_domain !== true ||
      record(config.routes[0]).zone_id !== "2f4457ab24731c570d2f86fa026a46af")
  )
    blockers.push("verified-custom-domain-route-required");
  if (
    vars.SITE_ALIAS !== undefined &&
    (!httpsOrigin(vars.SITE_ALIAS) ||
      vars.SITE_ALIAS !== "https://hubby.dpdns.org")
  )
    blockers.push("verified-site-alias-required");
  if (!origin || ["localhost", "127.0.0.1"].includes(origin.hostname))
    blockers.push("hosted-origin-required");
  if (config.workers_dev !== true || config.preview_urls !== false)
    blockers.push("explicit-staging-route-configuration-required");
  return {
    scope: "hosted-staging-artifact-only",
    configurationAccepted: blockers.length === 0,
    productionReady: false,
    providerAccountVerified: false,
    deployed: false,
    blockers,
  };
}
