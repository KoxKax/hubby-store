import { z } from "zod";

export const feedbackCategories = {
  experience: "Trải nghiệm mua sắm",
  product: "Sản phẩm & gói dịch vụ",
  idea: "Ý tưởng cho Hubby",
  other: "Góp ý khác",
  review: "Đánh giá dịch vụ",
} as const;
export const feedbackInput = z
  .object({
    key: z.uuid(),
    category: z.enum(["experience", "product", "idea", "other", "review"]),
    message: z.string().trim().min(10).max(1500),
  })
  .strict();
export const reviewInput = z
  .object({
    key: z.uuid(),
    productId: z
      .string()
      .max(80)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    rating: z.coerce.number().int().min(1).max(5),
    message: z.string().trim().min(10).max(1000),
  })
  .strict();
export interface Feedback {
  id: string;
  category: keyof typeof feedbackCategories;
  message: string;
  at: number;
  state: "new" | "reviewed";
}
export interface Activity {
  id: string;
  kind: "cart" | "purchase";
  product: string;
  variant: string;
  customer: string;
  at: number;
}
export const activityTTL = 15 * 60_000;
export function publicActivity(event: Activity): Activity {
  // Explicit allowlist: never expose actor hashes, email, order codes or keys.
  return {
    id: event.id,
    kind: event.kind,
    product: event.product,
    variant: event.variant,
    customer: event.customer,
    at: event.at,
  };
}
export function recentActivities(events: Activity[], now: number) {
  return events
    .filter((e) => e.at <= now && e.at > now - activityTTL)
    .slice(-10)
    .map(publicActivity);
}
// Server-only integration contract. No browser action can submit purchase events.
// The live settlement outbox must call this after verified, committed payment;
// local test settlements are deliberately ineligible.
export function purchaseActivity(
  event: Omit<Activity, "kind">,
  proof: {
    channel: "mock" | "live";
    verified: boolean;
    committed: boolean;
    refunded: boolean;
  },
): Activity | null {
  return proof.channel === "live" &&
    proof.verified &&
    proof.committed &&
    !proof.refunded
    ? publicActivity({ ...event, kind: "purchase" })
    : null;
}
