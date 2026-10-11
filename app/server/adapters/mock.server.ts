import { z } from "zod";
import type {
  PaymentAdapter,
  PaymentLinkInput,
  SupplierAdapter,
  SupplierDelivery,
  VerifiedPaymentObservation,
} from "./contracts.server";

const eventSchema = z
  .object({
    transactionId: z.string().min(1).max(100),
    merchantReference: z.string().min(1).max(100),
    amountVnd: z.number().int().nonnegative(),
    currency: z.literal("VND"),
    channelId: z.literal("mock-local"),
    receivingAccount: z.literal("DEMO-NOT-A-BANK"),
    direction: z.literal("in"),
    occurredAt: z.iso.datetime(),
    isTest: z.literal(true),
  })
  .strict();
const encoder = new TextEncoder();
async function hmac(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}
export async function signMock(body: string, secret: string) {
  const bytes = new Uint8Array(
    await crypto.subtle.sign("HMAC", await hmac(secret), encoder.encode(body)),
  );
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
// Pure test adapter; no network, real QR, bank account, provider credentials or endpoint.
export class MockPaymentAdapter implements PaymentAdapter {
  constructor(
    private secret: string,
    environment: "local",
  ) {
    if (environment !== "local")
      throw new Error("Mock adapters are local-only");
  }
  async createLink(input: PaymentLinkInput) {
    if (!Number.isSafeInteger(input.amountVnd) || input.amountVnd < 0)
      throw new Error("Invalid VND");
    return { providerLinkId: `mock:${input.idempotencyKey}`, qrPayload: "" };
  }
  async verifyWebhook(request: Request): Promise<VerifiedPaymentObservation> {
    const body = await request.text();
    if (encoder.encode(body).length > 64_000)
      throw new Error("Payload too large");
    const signature = request.headers.get("X-Mock-Signature") ?? "";
    if (!/^[0-9a-f]{64}$/.test(signature)) throw new Error("Invalid signature");
    const bytes = Uint8Array.from(signature.match(/../g) ?? [], (b) =>
      Number.parseInt(b, 16),
    );
    if (
      !(await crypto.subtle.verify(
        "HMAC",
        await hmac(this.secret),
        bytes,
        encoder.encode(body),
      ))
    )
      throw new Error("Invalid signature");
    return eventSchema.parse(JSON.parse(body));
  }
  async reconcile() {
    return [];
  }
}
export class MockSupplierAdapter implements SupplierAdapter {
  capabilities = { idempotentPurchase: true, lookupPurchase: true };
  private purchases = new Map<string, SupplierDelivery>();
  constructor(private simulateTimeoutAfterAccept = false) {}
  async purchase(input: Parameters<SupplierAdapter["purchase"]>[0]) {
    if (!input.externalSku.startsWith("DEMO-"))
      throw new Error("Synthetic SKU only");
    if (input.activationInfo)
      throw new Error("No real activation information in mock adapter");
    const existing = this.purchases.get(input.idempotencyKey);
    if (existing) return existing;
    const delivered: SupplierDelivery = {
      state: "delivered",
      externalReference: `mock-${input.unitId}`,
      sensitivePayload: `DEMO-ONLY / ${input.externalSku} / ${input.unitId}`,
    };
    this.purchases.set(input.idempotencyKey, delivered);
    if (this.simulateTimeoutAfterAccept)
      return {
        state: "uncertain" as const,
        externalReference: delivered.externalReference,
      };
    return delivered;
  }
  async lookup(key: string) {
    return this.purchases.get(key) ?? { state: "absent" as const };
  }
  get purchaseCount() {
    return this.purchases.size;
  }
  // Test-only crash/restart fixture; production requires durable attempts/outbox in Postgres.
  snapshot() {
    return [...this.purchases];
  }
  restore(entries: [string, SupplierDelivery][]) {
    this.purchases = new Map(entries);
  }
}
