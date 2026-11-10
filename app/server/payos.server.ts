import { z } from "zod";

// payOS payment-requests HMAC-SHA256 protocol:
// https://payos.vn/docs/tich-hop-webhook/kiem-tra-du-lieu-voi-signature/
// This adapter deliberately has no access to customer-submitted totals.
const money = z.number().int().min(2_000).max(100_000_000_000);
const numericCode = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const payosData = z.object({
  orderCode: numericCode,
  amount: money,
  description: z.string().max(200),
  accountNumber: z.string().min(4).max(40),
  virtualAccountNumber: z.string().max(40).optional(),
  reference: z.string().min(1).max(120),
  transactionDateTime: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/),
  currency: z.literal("VND"),
  paymentLinkId: z.string().min(8).max(120),
  code: z.literal("00"),
});
const envelope = z.object({
  code: z.literal("00"),
  success: z.literal(true),
  data: payosData,
  signature: z.string().regex(/^[a-fA-F0-9]{64}$/),
});
const checkoutResult = z.object({
  code: z.literal("00"),
  data: z.object({
    orderCode: numericCode,
    amount: money,
    currency: z.literal("VND"),
    paymentLinkId: z.string().min(8).max(120),
    checkoutUrl: z.string().url(),
    status: z.literal("PENDING"),
    accountNumber: z.string().min(4).max(40),
  }),
  signature: z.string().regex(/^[a-fA-F0-9]{64}$/),
});

export interface PayosCredentials {
  clientId: string;
  apiKey: string;
  checksumKey: string;
}
export interface TrustedPayosOrder {
  // Allocated once in durable storage, unique for the payment provider.
  numericCode: number;
  amountVnd: number;
  expiresAt: number;
  createdAt: number;
  state: "pending_payment";
  // The order has already been atomically created and stock reserved.
  reservationValid: true;
}
export interface PayosPaymentLink {
  numericCode: number;
  paymentLinkId: string;
  receivingAccount: string;
  checkoutUrl: string;
}
export interface PayosReceipt {
  provider: "payos";
  numericCode: number;
  paymentLinkId: string;
  receivingAccount: string;
  virtualAccount?: string;
  reference: string;
  amountVnd: number;
  transactionAt: number;
}
export interface PersistedPayosOrder {
  numericCode: number;
  paymentLinkId: string;
  receivingAccount: string;
  amountVnd: number;
  state: string;
  createdAt: number;
  expiresAt: number;
  reservationValid: boolean;
}

function fail(status: number): Response {
  return new Response("Giao dịch payOS không hợp lệ.", { status });
}

// JavaScript sample from payOS sorts all data keys, converts null to "",
// and JSON-serializes arrays after sorting their element-object keys.
export function canonicalPayosData(data: Record<string, unknown>): string {
  if (Object.keys(data).length > 64) throw fail(400);
  return Object.keys(data)
    .sort()
    .map((key) => {
      if (!/^[A-Za-z][A-Za-z0-9]*$/.test(key)) throw fail(400);
      let value = data[key];
      if (
        value === null ||
        value === undefined ||
        value === "null" ||
        value === "undefined"
      ) {
        value = "";
      } else if (Array.isArray(value)) {
        if (
          value.length > 30 ||
          value.some((v) => !v || typeof v !== "object" || Array.isArray(v))
        )
          throw fail(400);
        value = JSON.stringify(
          value.map((v) =>
            Object.fromEntries(
              Object.entries(v).sort(([a], [b]) => a.localeCompare(b)),
            ),
          ),
        );
      } else if (typeof value === "object" || typeof value === "function") {
        throw fail(400);
      } else if (typeof value === "number" && !Number.isSafeInteger(value)) {
        throw fail(400);
      }
      return `${key}=${String(value)}`;
    })
    .join("&");
}

async function hmac(data: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  return { key, data: new TextEncoder().encode(data) };
}

async function hexSignature(data: string, secret: string): Promise<string> {
  const input = await hmac(data, secret);
  return [
    ...new Uint8Array(await crypto.subtle.sign("HMAC", input.key, input.data)),
  ]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
}

export async function verifySignature(
  data: Record<string, unknown>,
  signature: string,
  secret: string,
) {
  if (!/^[a-fA-F0-9]{64}$/.test(signature)) return false;
  const input = await hmac(canonicalPayosData(data), secret);
  const digest = new Uint8Array(
    (signature.match(/../g) ?? []).map((v) => Number.parseInt(v, 16)),
  );
  return crypto.subtle.verify("HMAC", input.key, digest, input.data);
}

function checkCredentials(credentials: PayosCredentials) {
  if (
    !credentials.clientId ||
    !credentials.apiKey ||
    credentials.checksumKey.length < 32
  )
    throw fail(503);
}

function trustedOrigin(origin: string) {
  const url = new URL(origin);
  if (
    url.origin !== origin ||
    url.protocol !== "https:" ||
    url.username ||
    url.password
  )
    throw fail(503);
  return origin;
}

export async function createPayosPaymentLink(
  order: TrustedPayosOrder,
  credentials: PayosCredentials,
  siteOrigin: string,
  fetcher: typeof fetch = fetch,
): Promise<PayosPaymentLink> {
  checkCredentials(credentials);
  const origin = trustedOrigin(siteOrigin);
  const now = Date.now();
  if (
    !numericCode.safeParse(order.numericCode).success ||
    !money.safeParse(order.amountVnd).success ||
    !Number.isSafeInteger(order.createdAt) ||
    !Number.isSafeInteger(order.expiresAt) ||
    order.createdAt >= order.expiresAt ||
    now >= order.expiresAt ||
    order.state !== "pending_payment" ||
    !order.reservationValid
  )
    throw fail(409);
  const expiredAt = Math.floor(order.expiresAt / 1000);
  if (expiredAt > 2_147_483_647) throw fail(409);
  const description = `HB${order.numericCode.toString(36).toUpperCase()}`;
  // payOS documents a 9-character limit on unlinked bank accounts.
  if (description.length > 9) throw fail(409);
  const cancelUrl = `${origin}/thanh-toan/ket-qua?cancel=1`;
  const returnUrl = `${origin}/thanh-toan/ket-qua`;
  const signature = await hexSignature(
    `amount=${order.amountVnd}&cancelUrl=${cancelUrl}&description=${description}&orderCode=${order.numericCode}&returnUrl=${returnUrl}`,
    credentials.checksumKey,
  );
  let response: Response;
  try {
    response = await fetcher(
      "https://api-merchant.payos.vn/v2/payment-requests",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-client-id": credentials.clientId,
          "x-api-key": credentials.apiKey,
        },
        body: JSON.stringify({
          orderCode: order.numericCode,
          amount: order.amountVnd,
          description,
          cancelUrl,
          returnUrl,
          expiredAt,
          signature,
        }),
        signal: AbortSignal.timeout(10_000),
      },
    );
  } catch {
    throw fail(503);
  }
  if (!response.ok) throw fail(503);
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw fail(503);
  }
  const parsed = checkoutResult.safeParse(body);
  if (!parsed.success) throw fail(503);
  const result = parsed.data.data;
  const url = new URL(result.checkoutUrl);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "pay.payos.vn" ||
    url.username ||
    url.password ||
    result.orderCode !== order.numericCode ||
    result.amount !== order.amountVnd ||
    !(await verifySignature(
      (body as { data: Record<string, unknown> }).data,
      parsed.data.signature,
      credentials.checksumKey,
    ))
  )
    throw fail(503);
  // Persist the returned link/account atomically before exposing checkoutUrl.
  return {
    numericCode: result.orderCode,
    paymentLinkId: result.paymentLinkId,
    receivingAccount: result.accountNumber,
    checkoutUrl: result.checkoutUrl,
  };
}

async function boundedJson(request: Request): Promise<unknown> {
  if (request.method !== "POST") throw fail(405);
  if (
    !/^application\/json(?:\s*;|$)/i.test(
      request.headers.get("Content-Type") ?? "",
    )
  )
    throw fail(415);
  const declared = request.headers.get("Content-Length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > 16_384))
    throw fail(413);
  if (!request.body) throw fail(400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      total += part.value.byteLength;
      if (total > 16_384) {
        await reader.cancel();
        throw fail(413);
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  const raw = new Uint8Array(total);
  let position = 0;
  for (const chunk of chunks) {
    raw.set(chunk, position);
    position += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw));
  } catch {
    throw fail(400);
  }
}

export async function verifyPayosWebhook(
  request: Request,
  checksumKey: string,
): Promise<PayosReceipt> {
  if (checksumKey.length < 32) throw fail(503);
  const input = await boundedJson(request);
  const parsed = envelope.safeParse(input);
  if (!parsed.success || !input || typeof input !== "object") throw fail(400);
  const data = (input as { data: Record<string, unknown> }).data;
  if (!(await verifySignature(data, parsed.data.signature, checksumKey)))
    throw fail(401);
  const transaction = parsed.data.data;
  const at = Date.parse(
    `${transaction.transactionDateTime.replace(" ", "T")}+07:00`,
  );
  if (
    !Number.isFinite(at) ||
    new Date(at + 7 * 3600_000).toISOString().slice(0, 19).replace("T", " ") !==
      transaction.transactionDateTime
  )
    throw fail(400);
  return {
    provider: "payos",
    numericCode: transaction.orderCode,
    paymentLinkId: transaction.paymentLinkId,
    receivingAccount: transaction.accountNumber,
    virtualAccount: transaction.virtualAccountNumber || undefined,
    reference: transaction.reference,
    amountVnd: transaction.amount,
    transactionAt: at,
  };
}

export function evaluatePayosReceipt(
  receipt: PayosReceipt,
  order: PersistedPayosOrder | null,
  now = Date.now(),
): "eligible" | "reconciliation" {
  return order &&
    receipt.numericCode === order.numericCode &&
    receipt.paymentLinkId === order.paymentLinkId &&
    receipt.receivingAccount === order.receivingAccount &&
    receipt.amountVnd === order.amountVnd &&
    order.state === "pending_payment" &&
    order.reservationValid &&
    Number.isFinite(order.createdAt) &&
    Number.isFinite(order.expiresAt) &&
    order.createdAt < order.expiresAt &&
    receipt.transactionAt >= order.createdAt &&
    receipt.transactionAt < order.expiresAt &&
    now < order.expiresAt
    ? "eligible"
    : "reconciliation";
}

export interface PayosPaymentStore {
  // Must commit a provider-reference unique inbox event, validate a locked
  // order/link/reservation, settle money, and enqueue ONE fulfillment outbox
  // entry in one durable database transaction. No in-memory implementation.
  commit(receipt: PayosReceipt): Promise<{
    durable: true;
    outcome: "paid" | "duplicate" | "reconciliation";
  }>;
}

export async function processPayosWebhook(
  request: Request,
  checksumKey: string,
  store: PayosPaymentStore,
) {
  try {
    const receipt = await verifyPayosWebhook(request, checksumKey);
    // Exact published confirm-webhook fixture, authenticated above using this
    // channel's checksum key. It is connectivity evidence, never money.
    // https://payos.vn/docs/api/ — confirm-webhook sample bank transaction.
    if (receipt.numericCode === 123 && receipt.amountVnd === 3000 &&
        receipt.receivingAccount === "12345678" && receipt.reference === "TF230204212323" &&
        receipt.paymentLinkId === "124c33293c43417ab7879e14c8d9eb18" &&
        receipt.transactionAt === Date.parse("2023-02-04T18:25:00+07:00")) {
      return Response.json({ success: true }, { headers: {
        "Cache-Control": "no-store", "X-Hubby-Payos-Event": "verification",
      } });
    }
    const result = await store.commit(receipt);
    if (
      result.durable !== true ||
      !["paid", "duplicate", "reconciliation"].includes(result.outcome)
    )
      throw fail(503);
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
