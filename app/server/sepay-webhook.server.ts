import { z } from "zod";

// Protocol: https://developer.sepay.vn/vi/sepay-webhooks/xac-thuc
// This verifier does not acknowledge delivery, settle orders or release stock.
const transactionSchema = z.object({
  id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  gateway: z.literal("TPBank"),
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/),
  accountNumber: z.string().regex(/^\d{6,30}$/),
  subAccount: z.string().max(100).nullable().optional(),
  code: z.string().max(100).nullable(),
  content: z.string().max(2000),
  transferType: z.enum(["in", "out"]),
  transferAmount: z.number().int().positive().max(100000000000),
  description: z.string().max(4000).optional(),
  accumulated: z.number().finite().optional(),
  referenceCode: z.string().max(120),
});
export type SePayTransfer = z.infer<typeof transactionSchema>;

function failure(status: number) {
  return new Response("Webhook không hợp lệ.", { status });
}

export async function verifySePayRequest(
  request: Request,
  config: { secret: string; accountNumber: string; nowSeconds?: number },
): Promise<SePayTransfer> {
  if (config.secret.length < 32 || !/^\d{6,30}$/.test(config.accountNumber))
    throw failure(503);
  if (request.method !== "POST") throw failure(405);
  if (
    !/^application\/json(?:\s*;|$)/i.test(
      request.headers.get("Content-Type") ?? "",
    )
  )
    throw failure(415);
  const timestamp = request.headers.get("X-SePay-Timestamp") ?? "";
  const signature = request.headers.get("X-SePay-Signature") ?? "";
  if (
    !/^\d{10}$/.test(timestamp) ||
    !/^sha256=[a-fA-F0-9]{64}$/.test(signature)
  )
    throw failure(401);
  const now = config.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > 300) throw failure(401);
  const declaredLength = request.headers.get("Content-Length");
  if (
    declaredLength &&
    (!/^\d+$/.test(declaredLength) || Number(declaredLength) > 16384)
  )
    throw failure(413);
  // Limit actual streamed bytes as well; a forged/missing Content-Length is no bypass.
  if (!request.body) throw failure(400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      length += result.value.byteLength;
      if (length > 16384) {
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
  const prefix = new TextEncoder().encode(`${timestamp}.`);
  const signed = new Uint8Array(prefix.length + raw.length);
  signed.set(prefix);
  signed.set(raw, prefix.length);
  const digest = new Uint8Array(
    signature
      .slice(7)
      .match(/../g)
      ?.map((hex) => Number.parseInt(hex, 16)) ?? [],
  );
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(config.secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  if (!(await crypto.subtle.verify("HMAC", key, digest, signed)))
    throw failure(401);
  let input: unknown;
  try {
    input = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw));
  } catch {
    throw failure(400);
  }
  const parsed = transactionSchema.safeParse(input);
  if (!parsed.success) throw failure(400);
  if (parsed.data.accountNumber !== config.accountNumber) throw failure(403);
  return parsed.data;
}

// Incoming transfers can be evaluated only against a persisted server order.
// SePay bank transfer payload has no currency/test flag: VND and live/test
// isolation must be pinned in trusted endpoint configuration, not guessed here.
export function evaluateSePayTransfer(
  transfer: SePayTransfer,
  order: { code: string; totalVnd: number; state: string; expiresAt: number },
  now = Date.now(),
): "eligible" | "reconciliation" | "ignored" {
  if (transfer.transferType !== "in") return "ignored";
  if (!/^HB[A-F0-9]{16}$/.test(order.code)) return "reconciliation";
  const matches = transfer.content.match(/\bHB[A-F0-9]{16}\b/g) ?? [];
  if (
    transfer.code !== order.code ||
    matches.length !== 1 ||
    matches[0] !== order.code
  )
    return "reconciliation";
  if (
    !Number.isSafeInteger(order.totalVnd) ||
    order.totalVnd <= 0 ||
    transfer.transferAmount !== order.totalVnd ||
    order.state !== "pending_payment" ||
    !Number.isFinite(order.expiresAt) ||
    now >= order.expiresAt
  )
    return "reconciliation";
  return "eligible";
}
