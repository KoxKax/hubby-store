import { z } from "zod";
import type { PayosCredentials } from "./payos.server";
import { canonicalPayosData, verifySignature } from "./payos.server";

// Read-only payment-provider reconciliation. A PAID response must NOT by itself
// mark a local order paid: only the bank receipt ledger may settle fulfillment.
const payment = z.object({
  id: z.string().min(8).max(120),
  orderCode: z.number().int().positive().safe(),
  amount: z.number().int().min(2_000),
  amountPaid: z.number().int().min(0),
  amountRemaining: z.number().int().min(0),
  status: z.enum(["PENDING", "PAID", "CANCELLED", "EXPIRED", "UNDERPAID"]),
});
const responseShape = z.object({
  code: z.literal("00"),
  data: payment,
  signature: z.string().regex(/^[a-f0-9]{64}$/i),
});

export interface ExpectedPayment {
  orderCode: number;
  amountVnd: number;
  // An interrupted create-link request may have no locally stored link ID.
  // payOS documents looking up a link by the merchant's numeric orderCode.
  paymentLinkId?: string;
}

export type PaymentReconciliation = {
  observedAt: number;
  status:
    | "pending"
    | "provider_paid_unsettled"
    | "provider_closed"
    | "manual_review";
  amountPaid: number;
};

function unavailable(stage = "validation"): never {
  console.warn("payOS payment inspection unavailable", { stage });
  throw new Response("Chưa thể đối chiếu thanh toán với payOS.", {
    status: 503,
  });
}

export async function inspectPayosPayment(
  expected: ExpectedPayment,
  credentials: PayosCredentials,
  fetcher: typeof fetch = fetch,
): Promise<PaymentReconciliation> {
  if (
    !Number.isSafeInteger(expected.orderCode) ||
    expected.orderCode < 1 ||
    !Number.isSafeInteger(expected.amountVnd) ||
    expected.amountVnd < 2_000 ||
    (expected.paymentLinkId !== undefined &&
      !/^[a-zA-Z0-9_-]{8,120}$/.test(expected.paymentLinkId)) ||
    !credentials.clientId ||
    !credentials.apiKey ||
    credentials.checksumKey.length < 32
  )
    unavailable();

  let response: Response;
  try {
    response = await fetcher(
      `https://api-merchant.payos.vn/v2/payment-requests/${encodeURIComponent(expected.paymentLinkId ?? String(expected.orderCode))}`,
      {
        method: "GET",
        headers: {
          "x-client-id": credentials.clientId,
          "x-api-key": credentials.apiKey,
        },
        redirect: "manual",
        signal: AbortSignal.timeout(10_000),
      },
    );
  } catch {
    unavailable("transport");
  }
  if (!response.ok) unavailable(`http_${response.status}`);

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    unavailable("json");
  }
  const parsed = responseShape.safeParse(body);
  if (!parsed.success || !body || typeof body !== "object") {
    console.warn("payOS payment inspection schema", { fields: body && typeof body === "object" ? Object.keys(body).filter((key) => /^[a-zA-Z]{1,30}$/.test(key)) : [] });
    unavailable("schema");
  }
  const raw = (body as { data: Record<string, unknown> }).data;
  // The payOS payment-request GET sample returns transactions as an object.
  // Its payment-request JavaScript signature algorithm serializes plain
  // objects as '[object Object]'. Never derive settlement from that nested data.
  const canonicalInput = { ...raw };
  if (
    canonicalInput.transactions &&
    !Array.isArray(canonicalInput.transactions)
  ) {
    if (typeof canonicalInput.transactions !== "object") unavailable();
    canonicalInput.transactions = "[object Object]";
  }
  try {
    canonicalPayosData(canonicalInput);
  } catch {
    unavailable("signature");
  }
  if (
    !(await verifySignature(
      canonicalInput,
      parsed.data.signature,
      credentials.checksumKey,
    ))
  )
    unavailable();

  const value = parsed.data.data;
  if (
    !/^[a-zA-Z0-9_-]{8,120}$/.test(value.id) ||
    (expected.paymentLinkId !== undefined &&
      value.id !== expected.paymentLinkId) ||
    value.orderCode !== expected.orderCode ||
    value.amount !== expected.amountVnd ||
    value.amountPaid > value.amount ||
    value.amountRemaining > value.amount ||
    value.amountPaid + value.amountRemaining !== value.amount
  )
    return {
      observedAt: Date.now(),
      status: "manual_review",
      amountPaid: value.amountPaid,
    };

  return {
    observedAt: Date.now(),
    status:
      value.status === "PAID" && value.amountPaid === value.amount
        ? "provider_paid_unsettled"
        : value.status === "PENDING" && value.amountPaid === 0
          ? "pending"
          : value.status === "CANCELLED" || value.status === "EXPIRED"
            ? "provider_closed"
            : "manual_review",
    amountPaid: value.amountPaid,
  };
}
