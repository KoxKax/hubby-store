import { z } from "zod";

// Casso Webhook V2 signs recursively sorted JSON, NOT raw bytes or SePay HMAC.
// https://github.com/CassoHQ/casso-webhook-v2-verify-signature
const money = z.number().int().min(1).max(100_000_000_000);
const transactionSchema = z.object({
  id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  reference: z.string().trim().min(1).max(160),
  description: z.string().max(2000),
  amount: z.number().int().min(-100_000_000_000).max(100_000_000_000),
  transactionDateTime: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/),
  accountNumber: z.string().regex(/^\d{6,30}$/),
  bankAbbreviation: z.literal("OCB"),
  virtualAccountNumber: z.string().regex(/^CASS[A-Za-z0-9]{1,26}$/),
});
export interface CassoConfig {
  secret: string;
  accountNumber: string;
  virtualAccountNumber: string;
  currency: "VND";
  environment: "test" | "live";
  nowMs?: number;
}
export interface CassoReceipt {
  provider: "casso-v2";
  environment: "test" | "live";
  transactionId: string;
  bankReference: string;
  accountNumber: string;
  virtualAccountNumber: string;
  currency: "VND";
  amountVnd: number;
  description: string;
  transactionAt: number;
  orderCode: string | null;
}
function failure(status: number): Response {
  return new Response("Webhook không hợp lệ.", { status });
}
function sortedJson(value: unknown, depth = 0): unknown {
  if (depth > 8) throw failure(400);
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && !Number.isSafeInteger(value))
      throw failure(400);
    return value;
  }
  if (Array.isArray(value)) throw failure(400); // V2 sends one object, not V1 batches.
  const object = value as Record<string, unknown>;
  const keys = Object.keys(object).sort();
  if (keys.length > 64) throw failure(400);
  return Object.fromEntries(
    keys.map((key) => [key, sortedJson(object[key], depth + 1)]),
  );
}
export async function verifyCassoRequest(
  request: Request,
  config: CassoConfig,
): Promise<CassoReceipt> {
  if (
    config.secret.length < 32 ||
    config.secret.length > 256 ||
    !/^\d{6,30}$/.test(config.accountNumber) ||
    !/^CASS[A-Za-z0-9]{1,26}$/.test(config.virtualAccountNumber) ||
    config.currency !== "VND" ||
    !["test", "live"].includes(config.environment)
  )
    throw failure(503);
  if (request.method !== "POST") throw failure(405);
  if (
    !/^application\/json(?:\s*;|$)/i.test(
      request.headers.get("Content-Type") ?? "",
    )
  )
    throw failure(415);
  const signature = request.headers.get("X-Casso-Signature") ?? "";
  const match = /^t=(\d{13}),v1=([a-f0-9]{128})$/.exec(signature);
  if (!match) throw failure(401);
  const timestamp = Number(match[1]);
  const now = config.nowMs ?? Date.now();
  // Provider retries for 24h. Permanent transaction deduplication is still mandatory.
  if (
    !Number.isFinite(now) ||
    timestamp > now + 300_000 ||
    now - timestamp > 25 * 3600_000
  )
    throw failure(401);
  const declared = request.headers.get("Content-Length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > 16_384))
    throw failure(413);
  if (!request.body) throw failure(400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const result = await reader.read();
      if (result.done) break;
      length += result.value.byteLength;
      if (length > 16_384) {
        await reader.cancel();
        throw failure(413);
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }
  const raw = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    raw.set(chunk, offset);
    offset += chunk.length;
  }
  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw));
  } catch {
    throw failure(400);
  }
  const canonical = JSON.stringify(sortedJson(body));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(config.secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["verify"],
  );
  const digest = new Uint8Array(
    match[2]?.match(/../g)?.map((hex) => Number.parseInt(hex, 16)) ?? [],
  );
  if (
    !(await crypto.subtle.verify(
      "HMAC",
      key,
      digest,
      new TextEncoder().encode(`${timestamp}.${canonical}`),
    ))
  )
    throw failure(401);
  const parsed = z
    .object({ error: z.literal(0), data: transactionSchema })
    .safeParse(body);
  if (!parsed.success) throw failure(400);
  const transaction = parsed.data.data;
  if (
    transaction.accountNumber !== config.accountNumber ||
    transaction.virtualAccountNumber !== config.virtualAccountNumber
  )
    throw failure(403);
  const at = Date.parse(
    `${transaction.transactionDateTime.replace(" ", "T")}+07:00`,
  );
  if (
    !Number.isFinite(at) ||
    new Date(at + 7 * 3600_000).toISOString().slice(0, 19).replace("T", " ") !==
      transaction.transactionDateTime ||
    at > now + 300_000
  )
    throw failure(400);
  const codes =
    transaction.description.match(
      /(?<![\p{L}\p{N}])HB[A-F0-9]{16}(?![\p{L}\p{N}])/gu,
    ) ?? [];
  return {
    provider: "casso-v2",
    environment: config.environment,
    transactionId: String(transaction.id),
    bankReference: transaction.reference,
    accountNumber: transaction.accountNumber,
    virtualAccountNumber: transaction.virtualAccountNumber,
    currency: "VND",
    amountVnd: transaction.amount,
    description: transaction.description,
    transactionAt: at,
    orderCode: codes.length === 1 ? (codes[0] ?? null) : null,
  };
}
export interface BankPaymentOrder {
  code: string;
  totalVnd: number;
  state: string;
  createdAt: number;
  expiresAt: number;
  environment: "test" | "live";
  reservationValid: boolean;
}
export function evaluateCassoReceipt(
  receipt: CassoReceipt,
  order: BankPaymentOrder | null,
  now = Date.now(),
) {
  if (receipt.amountVnd <= 0) return "ignored" as const;
  if (
    !order ||
    !/^HB[A-F0-9]{16}$/.test(order.code) ||
    receipt.orderCode !== order.code ||
    !money.safeParse(order.totalVnd).success ||
    receipt.amountVnd !== order.totalVnd ||
    order.state !== "pending_payment" ||
    order.environment !== receipt.environment ||
    !order.reservationValid ||
    !Number.isFinite(order.createdAt) ||
    !Number.isFinite(order.expiresAt) ||
    order.createdAt >= order.expiresAt ||
    receipt.transactionAt < order.createdAt ||
    receipt.transactionAt >= order.expiresAt ||
    now >= order.expiresAt
  )
    return "reconciliation" as const;
  return "eligible" as const;
}

// A production implementation must atomically persist a unique provider/env/id
// receipt, lock/recheck the order/reservation, settle and insert one ID-only outbox job.
// An interface is NOT a durable database implementation or permission to enable live.
export interface CassoPaymentStore {
  commit(receipt: CassoReceipt): Promise<{
    durable: true;
    outcome: "paid" | "duplicate" | "reconciliation" | "ignored";
  }>;
}
export async function processCassoWebhook(
  request: Request,
  config: CassoConfig,
  store: CassoPaymentStore,
): Promise<Response> {
  try {
    const receipt = await verifyCassoRequest(request, config);
    const result = await store.commit(receipt);
    if (
      result.durable !== true ||
      !["paid", "duplicate", "reconciliation", "ignored"].includes(
        result.outcome,
      )
    )
      throw failure(503);
    return Response.json(
      { success: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      { success: false },
      {
        status: error instanceof Response ? error.status : 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
