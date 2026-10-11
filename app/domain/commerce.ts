// Phase 0 contracts, not generated database types or implemented workflows.
export type DeliveryKind = "account" | "key" | "subscription" | "activation";
export type SourceKind = "local" | "api" | "manual";
export type OrderState =
  | "pending_payment"
  | "paid"
  | "fulfilling"
  | "partially_delivered"
  | "delivered"
  | "review_required"
  | "cancelled"
  | "expired"
  | "refunded";

export type FulfillmentState =
  | "queued"
  | "awaiting_input"
  | "processing"
  | "delivered"
  | "uncertain"
  | "failed"
  | "review_required"
  | "superseded";

export interface PublicVariant {
  id: string;
  productId: string;
  sku: string;
  priceVnd: number;
  deliveryKind: DeliveryKind;
  available: boolean;
}
