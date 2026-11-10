import { z } from "zod";
import {
  BiteError,
  type BiteOrderResult,
  fetchBiteOrder,
  purchaseBiteOnce,
} from "./bite-api.server";
import { biteTrackingGateway, biteTrackingReady } from "./bite-catalog.server";
import { payosFulfillmentReady } from "./payos-fulfillment.server";
import { payosAdminClient } from "./payos-store.server";
import type { HubbyEnv } from "./runtime-context.server";
import { openStockUnit, sealStockUnit } from "./stock-seal.server";

const workSchema = z
  .object({
    id: z.uuid(),
    token: z.uuid(),
    stockId: z.uuid(),
    responseId: z.uuid(),
    variantId: z.uuid(),
    externalId: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/),
    mode: z.enum(["purchase", "poll"]),
    providerOrderId: z.string().nullable(),
    idempotencyKey: z.string(),
    requiresActivation: z.boolean().optional(),
  })
  .strict();
const sealed = z.object({
  ciphertext: z.string().min(32).max(32000),
  nonce: z.string().length(16),
  key_version: z.number().int().min(1).max(1000),
});
export const supplierRows = z.object({
  bindings: z.array(
    z.object({
      variantId: z.uuid(),
      externalId: z.string(),
      enabled: z.boolean(),
      maxPending: z.number().int(),
    }),
  ),
  jobs: z.array(
    z.object({
      id: z.uuid(),
      orderCode: z.string(),
      variantId: z.uuid(),
      externalId: z.string(),
      state: z.enum([
        "queued",
        "submitting",
        "uncertain",
        "waiting",
        "failed",
        "file_ready",
        "stored",
        "cancelled",
      ]),
      createdAt: z.string(),
      manual: z.boolean(),
      providerOrderId: z.string().nullable().optional(),
      providerStatus: z.string().nullable().optional(),
      amount: z.string().nullable().optional(),
      currency: z.string().nullable().optional(),
      polledAt: z.string().nullable().optional(),
      issue: z.string().nullable().optional(),
      idempotent: z.boolean().optional(),
      activationEmail: z.string().optional(),
    }),
  ),
});

export function supplierStorageReady(env: HubbyEnv) {
  return (
    env.APP_ENV === "staging" &&
    env.DATA_MODE === "supabase" &&
    env.BITE_SCHEMA_READY === "true" &&
    !!env.SUPABASE_URL &&
    !!env.SUPABASE_SECRET_KEY &&
    /^[0-9a-f]{64}$/i.test(env.INVENTORY_ENCRYPTION_KEY_V1 ?? "")
  );
}
export function bitePurchasesReady(env: HubbyEnv) {
  return (
    supplierStorageReady(env) &&
    payosFulfillmentReady(env) &&
    env.SUPPLIERS_MODE === "bite" &&
    env.BITE_READY === "true" &&
    !!env.BITE_API_KEY
  );
}
export function supplierGateway(env: HubbyEnv) {
  if (
    !supplierStorageReady(env) ||
    !env.SUPABASE_URL ||
    !env.SUPABASE_SECRET_KEY
  )
    throw new Error("Supplier storage unavailable");
  const client = payosAdminClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY);
  const allowed = new Set([
    "supplier_admin_state",
    "set_supplier_binding",
    "claim_supplier_purchase",
    "finish_supplier_purchase",
    "manual_supplier_delivery",
    "read_supplier_evidence",
    "supplier_activation_admin",
    "retry_bite_after_empty_history",
  ]);
  return {
    async rpc(name: string, params: Record<string, unknown>): Promise<unknown> {
      if (!allowed.has(name)) throw new Error("Supplier operation unavailable");
      const { data, error } = await client.rpc(name, params);
      if (error) throw new Error("Supplier storage unavailable");
      return data;
    },
  };
}

export async function runBiteSupplierPass(env: HubbyEnv, jobId?: string) {
  if (!bitePurchasesReady(env) || !biteTrackingReady(env))
    return { outcome: "disabled" as const };
  const key = env.INVENTORY_ENCRYPTION_KEY_V1;
  if (!key || !env.BITE_API_KEY) throw new Error("Supplier unavailable");
  const gateway = biteTrackingGateway(env);
  if (jobId) z.uuid().parse(jobId);
  // Claim persists request identity/lease before POST. Polls are GET-only;
  // recoveries reuse the exact original idempotency key and quantity.
  const raw = await gateway.rpc("claim_bite_work", { p_job: jobId ?? null });
  if (raw === null) return { outcome: "idle" as const };
  const work = workSchema.parse(raw);
  let result: BiteOrderResult;
  let issue: string | null = null;
  try {
    result =
      work.mode === "poll" && work.providerOrderId
        ? await fetchBiteOrder(work.providerOrderId, env.BITE_API_KEY)
        : await purchaseBiteOnce(
            work.externalId,
            env.BITE_API_KEY,
            work.idempotencyKey,
          );
  } catch (error) {
    issue = error instanceof BiteError ? error.code : "request_unknown";
    result = {
      outcome:
        work.mode === "purchase" &&
        error instanceof BiteError &&
        [402, 403, 404, 409, 502].includes(error.status)
          ? "failed"
          : "uncertain",
      orderId: work.providerOrderId,
      status: issue,
      amount: null,
      currency: null,
      evidence: `Bite operation: ${issue}. No new purchase identity was created.`,
    };
  }
  const response = await sealStockUnit(
    { id: work.responseId, variantId: work.variantId },
    { type: "raw_text", text: result.evidence },
    1,
    { 1: key },
  );
  const stock =
    result.outcome === "received" && result.text && !work.requiresActivation
      ? await sealStockUnit(
          { id: work.stockId, variantId: work.variantId },
          { type: "raw_text", text: result.text },
          1,
          { 1: key },
        )
      : null;
  const saved = await gateway.rpc("finish_bite_work", {
    p_job: work.id,
    p_token: work.token,
    p_stock: stock,
    p_response: response,
    p_result: {
      outcome: work.requiresActivation && result.outcome === "received" ? "waiting" : result.outcome,
      orderId: result.orderId,
      status: work.requiresActivation && result.outcome === "received" ? "awaiting_activation" : result.status,
      amount: result.amount,
      currency: result.currency,
    },
    p_issue: issue,
  });
  if (saved !== true) throw new Error("Supplier result needs reconciliation");
  return { outcome: stock ? ("stored" as const) : result.outcome };
}

export async function manualSupplierDelivery(
  env: HubbyEnv,
  actor: string,
  jobId: string,
  text: string,
  reason: string,
) {
  z.uuid().parse(actor);
  z.uuid().parse(jobId);
  if (
    !["supplier_confirmed", "replacement_provided"].includes(reason) ||
    !text.trim() ||
    new TextEncoder().encode(text).length > 6000
  )
    throw new Error("Invalid manual delivery");
  const gateway = supplierGateway(env);
  // SQL rechecks payment, Owner, state and races; do not bound recovery to
  // the latest 100 dashboard rows.
  const evidence = z
    .object({
      stockId: z.uuid(),
      variantId: z.uuid(),
      responseId: z.uuid(),
      response: sealed.nullable(),
    })
    .parse(
      await gateway.rpc("read_supplier_evidence", {
        p_actor: actor,
        p_job: jobId,
      }),
    );
  const key = env.INVENTORY_ENCRYPTION_KEY_V1;
  if (!key) throw new Error("Encryption unavailable");
  const stock = await sealStockUnit(
    { id: evidence.stockId, variantId: evidence.variantId },
    { type: "raw_text", text },
    1,
    { 1: key },
  );
  return gateway.rpc("manual_supplier_delivery", {
    p_actor: actor,
    p_job: jobId,
    p_reason: reason,
    p_stock: stock,
  });
}

export async function readSupplierActivationEmails(env: HubbyEnv, actor: string) {
  const records = z.array(z.object({ jobId: z.uuid(), requestId: z.uuid(), payload: sealed })).parse(
    await supplierGateway(env).rpc("supplier_activation_admin", { p_actor: actor }),
  );
  const entries = await Promise.all(records.map(async (record) => {
    const value = await openStockUnit(
      { id: record.requestId, variantId: record.requestId }, record.payload,
      { 1: env.INVENTORY_ENCRYPTION_KEY_V1 ?? "" },
    );
    if (value.type !== "raw_text") throw new Error("Invalid activation record");
    const activation = z.object({ purpose: z.literal("canva_activation"), email: z.email().max(254) }).parse(JSON.parse(value.text));
    return [record.jobId, activation.email] as const;
  }));
  return new Map(entries);
}

export async function readSupplierEvidence(
  env: HubbyEnv,
  actor: string,
  jobId: string,
) {
  z.uuid().parse(actor);
  z.uuid().parse(jobId);
  const record = z
    .object({
      stockId: z.uuid(),
      variantId: z.uuid(),
      responseId: z.uuid(),
      response: sealed.nullable(),
    })
    .parse(
      await supplierGateway(env).rpc("read_supplier_evidence", {
        p_actor: actor,
        p_job: jobId,
      }),
    );
  if (!record.response)
    return "Không có phản hồi được lưu. Hãy đối soát với nguồn trước khi giao thủ công.";
  const value = await openStockUnit(
    { id: record.responseId, variantId: record.variantId },
    record.response,
    { 1: env.INVENTORY_ENCRYPTION_KEY_V1 ?? "" },
  );
  return value.type === "raw_text" ? value.text : "Không đọc được phản hồi.";
}
