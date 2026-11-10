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
    customer: "Một khách",
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

/**
 * Random birthdate suffix in DDMM format (e.g. 1607, 2705, 0803).
 */
export function randomBirthdateSuffix(): string {
  const day = Math.floor(Math.random() * 28) + 1;
  const month = Math.floor(Math.random() * 12) + 1;
  return `${String(day).padStart(2, "0")}${String(month).padStart(2, "0")}`;
}

/**
 * Random character + number suffix (e.g. k99, anh02, h88, t04, ngoc95).
 */
export function randomCharNumSuffix(): string {
  const chars = [
    "k",
    "t",
    "h",
    "n",
    "m",
    "v",
    "d",
    "p",
    "l",
    "q",
    "anh",
    "linh",
    "ngoc",
    "huy",
    "dung",
    "minh",
    "phuong",
    "nam",
    "ha",
    "thao",
  ];
  const char = chars[Math.floor(Math.random() * chars.length)];
  const years = [
    "95",
    "96",
    "97",
    "98",
    "99",
    "00",
    "01",
    "02",
    "03",
    "04",
    "05",
    "2k1",
    "2k2",
    "2k3",
    "2k4",
  ];
  const num = years[Math.floor(Math.random() * years.length)];
  return `${char}${num}`;
}

/**
 * Generate virtual masked email conforming to:
 * "xxxx1607@gmail.com", "xxxx2705@gmail.com", "xxxxk99@gmail.com", etc.
 */
export function generateVirtualEmail(): string {
  const suffix =
    Math.random() < 0.65 ? randomBirthdateSuffix() : randomCharNumSuffix();
  return `xxxx${suffix}@gmail.com`;
}

/**
 * Masks real customer email for privacy while preserving recognizable suffix:
 * e.g. "nguyenmai2705@gmail.com" -> "xxxx2705@gmail.com"
 * If email is synthetic or unrecognized, returns a random virtual email.
 */
export function maskCustomerEmail(email?: string): string {
  if (!email || typeof email !== "string") return generateVirtualEmail();
  const trimmed = email.trim().toLowerCase();
  const atIdx = trimmed.indexOf("@");
  if (atIdx === -1 || trimmed === "demo@buyer.example") {
    return generateVirtualEmail();
  }
  const localPart = trimmed.slice(0, atIdx);
  const domain = trimmed.slice(atIdx);

  // Check if localPart ends with 4 digits (birthdate like 1607, 2705)
  const dateMatch = localPart.match(/\d{4}$/);
  if (dateMatch) {
    return `xxxx${dateMatch[0]}${domain === "@gmail.com" ? domain : "@gmail.com"}`;
  }
  // Check if localPart ends with single char + 2-4 digits (e.g. k99, t04) or 2k\d
  const charNumMatch = localPart.match(/(?:[a-z]\d{2,4}|2k\d)$/);
  if (charNumMatch) {
    return `xxxx${charNumMatch[0]}${domain === "@gmail.com" ? domain : "@gmail.com"}`;
  }
  // Check trailing 2 digits
  const twoDigitMatch = localPart.match(/\d{2}$/);
  if (twoDigitMatch) {
    return `xxxx${twoDigitMatch[0]}${domain === "@gmail.com" ? domain : "@gmail.com"}`;
  }
  if (localPart.length >= 4) {
    return `xxxx${localPart.slice(-4)}${domain === "@gmail.com" ? domain : "@gmail.com"}`;
  }
  return generateVirtualEmail();
}

export interface VirtualProductOption {
  name: string;
  variant?: string;
}

export const fallbackProductList: VirtualProductOption[] = [
  { name: "Canva Edu", variant: "3 năm" },
  { name: "Capcut Pro", variant: "1 tháng" },
  { name: "Microsoft Office 365", variant: "1 năm" },
  { name: "Netflix", variant: "1 tháng" },
  { name: "Duolingo", variant: "1 năm" },
  { name: "Capcut Pro", variant: "6 tháng" },
];

export function createVirtualActivity(
  products?: { name: string; variants?: { label: string }[] }[],
): Activity {
  const kind: "cart" | "purchase" = Math.random() < 0.6 ? "purchase" : "cart";
  let product = "Canva Edu";
  let variant = "3 năm";

  const firstProduct =
    products?.[Math.floor(Math.random() * (products?.length ?? 1))];
  if (firstProduct) {
    product = firstProduct.name;
    const variants = firstProduct.variants;
    if (variants && variants.length > 0) {
      const v = variants[Math.floor(Math.random() * variants.length)];
      if (v) variant = v.label;
    }
  } else {
    const item =
      fallbackProductList[
        Math.floor(Math.random() * fallbackProductList.length)
      ];
    if (item) {
      product = item.name;
      variant = item.variant ?? "";
    }
  }

  return {
    id: `virt-${crypto.randomUUID()}`,
    kind,
    product,
    variant,
    customer: generateVirtualEmail(),
    at: Date.now() - Math.floor(Math.random() * 45_000),
  };
}
