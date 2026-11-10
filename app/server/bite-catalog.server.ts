import { z } from "zod";
import type { StorefrontContent } from "../content/types";
import { BiteError, fetchBiteProducts } from "./bite-api.server";
import { payosAdminClient } from "./payos-store.server";
import type { HubbyEnv } from "./runtime-context.server";
export function biteTrackingReady(env: HubbyEnv) {
  return (
    env.BITE_TRACKING_READY === "true" &&
    env.DATA_MODE === "supabase" &&
    env.APP_ENV === "staging" &&
    !!env.SUPABASE_URL &&
    !!env.SUPABASE_SECRET_KEY
  );
}
export function biteTrackingGateway(env: HubbyEnv) {
  if (!biteTrackingReady(env) || !env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY)
    throw new Error("Source tracking unavailable");
  const client = payosAdminClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY);
  const allowed = new Set([
    "claim_bite_catalog_sync",
    "store_bite_catalog_page",
    "fail_bite_catalog_sync",
    "bite_catalog_admin",
    "bite_catalog_changes_admin",
    "bite_catalog_ack_changes",
    "bite_catalog_changes_page",
    "bite_catalog_ack_page",
    "bite_catalog_unread_count",
    "bite_catalog_alert_status",
    "bite_catalog_save_copy",
    "claim_bite_work",
    "finish_bite_work",
    "request_bite_order_poll",
    "bite_public_availability",
  ]);
  return {
    async rpc(name: string, params: Record<string, unknown>): Promise<unknown> {
      if (!allowed.has(name)) throw new Error("Invalid source operation");
      const { data, error } = await client.rpc(name, params);
      if (error) throw new Error("Source storage unavailable");
      return data;
    },
  };
}
export async function syncBiteCatalog(env: HubbyEnv, actor?: string) {
  if (!biteTrackingReady(env) || !env.BITE_API_KEY)
    return { outcome: "disabled" as const };
  const gateway = biteTrackingGateway(env),
    raw = await gateway.rpc("claim_bite_catalog_sync", {
      p_actor: actor ?? null,
      p_force: !!actor,
    });
  if (raw === null) return { outcome: "busy" as const };
  const work = z
    .object({
      token: z.uuid(),
      generation: z.uuid(),
      page: z.number().int().min(1).max(100),
    })
    .parse(raw);
  let stage: "source" | "storage" = "source";
  try {
    for (let page = work.page; page < work.page + 3 && page <= 100; page++) {
      stage = "source";
      const products = await fetchBiteProducts(env.BITE_API_KEY, page),
        done = products.length < 100;
      stage = "storage";
      if (
        (await gateway.rpc("store_bite_catalog_page", {
          p_token: work.token,
          p_generation: work.generation,
          p_page: page,
          p_items: products,
          p_done: done,
        })) !== true
      )
        throw new Error("Catalog lease changed");
      if (done) return { outcome: "synced" as const };
    }
    return { outcome: "partial" as const };
  } catch (error) {
    try {
      await gateway.rpc("fail_bite_catalog_sync", {
        p_token: work.token,
        p_issue:
          error instanceof BiteError
            ? error.code
            : stage === "storage"
              ? "catalog_storage_unavailable"
              : "source_response_unavailable",
      });
    } catch {
      // The DB lease expires; never replace its last valid catalog snapshot.
    }
    return { outcome: "failed" as const };
  }
}
export const catalogStateSchema = z.object({
  sync: z.object({
    lastSuccess: z.string().nullable(),
    issue: z.string().nullable(),
    nextPage: z.number().int(),
    running: z.boolean(),
  }),
  total: z.number().int(),
  items: z.array(
    z.object({
      externalId: z.string(),
      name: z.string(),
      description: z.string(),
      editorialDescription: z.string().nullable(),
      editorialStatus: z.enum(["needs_review", "ready", "verify"]).nullable(),
      category: z.string(),
      price: z.string(),
      previousPrice: z.string().nullable(),
      normalPrice: z.string().nullable(),
      currency: z.string().nullable(),
      stock: z.number().nullable(),
      inStock: z.boolean(),
      promotion: z.string(),
      delivery: z.string(),
      syncedAt: z.string(),
      active: z.boolean(),
    }),
  ),
});

export const biteChangesSchema = z.object({
  unread: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  items: z.array(z.object({
    id: z.number().int(),
    externalId: z.string(),
    kind: z.enum(["new", "updated", "removed", "returned"]),
    fields: z.array(z.string()),
    occurrences: z.number().int().positive().default(1),
    before: z.record(z.string(), z.unknown()).nullable(),
    after: z.record(z.string(), z.unknown()).nullable(),
    createdAt: z.string(),
    read: z.boolean(),
  })),
});

export async function applySourceAvailability(
  content: StorefrontContent,
  env: HubbyEnv,
): Promise<StorefrontContent> {
  if (!biteTrackingReady(env)) return content;
  let availability: { variantKey: string; stock: number }[] = [];
  try {
    availability = z
      .array(
        z.object({
          variantKey: z.string(),
          stock: z.number().int().nonnegative(),
        }),
      )
      .parse(
        await biteTrackingGateway(env).rpc("bite_public_availability", {}),
      );
  } catch {
    /* Do not substitute CMS demonstration stock for unavailable live data. */
  }
  const counts = new Map(
    availability.map((item) => [item.variantKey, item.stock]),
  );
  return {
    ...content,
    products: content.products.map((product) => ({
      ...product,
      variants: product.variants.map((variant) => ({
        ...variant,
        stock: counts.get(variant.id) ?? 0,
      })),
    })),
  };
}
