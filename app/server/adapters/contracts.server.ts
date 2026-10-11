// Boundary declarations only: no real provider implementation or secret values.
export interface PaymentLinkInput {
  merchantReference: string;
  amountVnd: number;
  expiresAt: string;
  idempotencyKey: string;
}

export interface VerifiedPaymentObservation {
  transactionId: string;
  merchantReference: string;
  amountVnd: number;
  currency: "VND";
  channelId: string;
  receivingAccount: string;
  direction: "in" | "out";
  occurredAt: string;
  isTest: boolean;
}

export interface PaymentAdapter {
  createLink(input: PaymentLinkInput): Promise<{
    providerLinkId: string;
    qrPayload: string;
  }>;
  verifyWebhook(request: Request): Promise<VerifiedPaymentObservation>;
  reconcile(merchantReference: string): Promise<VerifiedPaymentObservation[]>;
}

export interface SupplierDelivery {
  state: "delivered";
  externalReference: string;
  sensitivePayload: string;
}

export interface SupplierAdapter {
  capabilities: { idempotentPurchase: boolean; lookupPurchase: boolean };
  purchase(input: {
    externalSku: string;
    unitId: string;
    idempotencyKey: string;
    activationInfo?: Record<string, string>;
  }): Promise<
    | SupplierDelivery
    | { state: "pending" | "uncertain"; externalReference?: string }
  >;
  lookup(
    idempotencyKey: string,
  ): Promise<SupplierDelivery | { state: "absent" | "pending" | "uncertain" }>;
}
