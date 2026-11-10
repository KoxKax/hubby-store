import { z } from "zod";
import { payosCheckoutReady } from "./payos-checkout.server";
import { payosAdminClient } from "./payos-store.server";
import type { HubbyEnv } from "./runtime-context.server";

const reviewKind = z.enum([
  "receipt_review",
  "link_unknown",
  "delivery_exhausted",
]);
const reviewStatus = z.enum(["open", "resolved"]);
const reviewAction = z.enum(["note", "resolve", "reopen"]);

const queueItem = z
  .object({
    kind: reviewKind,
    caseId: z.string().min(1).max(120),
    orderCode: z.number().int().safe().positive(),
    orderId: z.uuid().nullable(),
    occurredAt: z.number().int().positive(),
    amountVnd: z.number().int().min(0).max(100_000_000_000),
    reviewStatus,
    reviewNote: z.string().min(3).max(1000).nullable(),
    reviewedAt: z.number().int().positive().nullable(),
  })
  .strict();

export type PayosQueueItem = z.infer<typeof queueItem>;
export type PayosReviewStatus = z.infer<typeof reviewStatus>;

const reviewInput = z
  .object({
    kind: reviewKind,
    caseId: z.string().min(1).max(120),
    action: reviewAction,
    note: z.string().trim().min(3).max(1000),
  })
  .strict();

const reviewResult = z
  .object({ id: z.number().int().positive(), status: reviewStatus })
  .strict();

const requeueInput = z
  .object({
    orderId: z.uuid(),
    note: z.string().trim().min(10).max(1000),
  })
  .strict();

export function payosQueueReady(env: HubbyEnv) {
  return payosCheckoutReady(env);
}

/** Read-only operations view. Neither review status nor provider status is proof of payment. */
export async function loadPayosReconciliationQueue(
  gateway: {
    rpc(name: string, values: Record<string, unknown>): Promise<unknown>;
  },
  status: PayosReviewStatus = "open",
): Promise<PayosQueueItem[]> {
  const selected = reviewStatus.parse(status);
  const raw = await gateway.rpc("payos_reconciliation_queue", {
    p_limit: 50,
    p_status: selected,
  });
  return z.array(queueItem).max(50).parse(raw);
}

/** Append an Owner-attributed note/status event only; never settle, refund or fulfill. */
export async function recordPayosReview(
  gateway: {
    rpc(name: string, values: Record<string, unknown>): Promise<unknown>;
  },
  actorId: string,
  input: unknown,
) {
  const actor = z.uuid().parse(actorId);
  const parsed = reviewInput.parse(input);
  const raw = await gateway.rpc("payos_review_case", {
    p_kind: parsed.kind,
    p_case_id: parsed.caseId,
    p_actor_id: actor,
    p_action: parsed.action,
    p_note: parsed.note,
  });
  return reviewResult.parse(raw);
}

/** Restores an exhausted service-error job to the retry queue only if SQL
 * re-verifies payment, reserved stock, Owner role and a bounded audit history. */
export async function requeueExhaustedPayosDelivery(
  gateway: {
    rpc(name: string, values: Record<string, unknown>): Promise<unknown>;
  },
  actorId: string,
  input: unknown,
) {
  const actor = z.uuid().parse(actorId);
  const { orderId, note } = requeueInput.parse(input);
  const result = await gateway.rpc("requeue_exhausted_payos_delivery", {
    p_order: orderId,
    p_actor: actor,
    p_note: note,
  });
  return z.boolean().parse(result);
}

export function payosQueueGateway(env: HubbyEnv) {
  if (!payosQueueReady(env) || !env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY)
    throw new Error("Payment reconciliation unavailable");
  const client = payosAdminClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY);
  return {
    async rpc(name: string, values: Record<string, unknown>) {
      if (
        name !== "payos_reconciliation_queue" &&
        name !== "payos_review_case" &&
        name !== "requeue_exhausted_payos_delivery"
      )
        throw new Error("Unsupported payment operation");
      const { data, error } = await client.rpc(name, values);
      if (error) throw new Error("Payment reconciliation storage unavailable");
      return data;
    },
  };
}
