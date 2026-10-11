import { z } from "zod";
import type { StorefrontContent } from "./types";

const text = (max = 240) => z.string().trim().min(1).max(max);
const key = text(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const amount = z.number().int().min(0).max(1_000_000_000);
const internal = text(200).refine(
  (value) => /^\/(?!\/)[a-zA-Z0-9/#?=&_-]*$/.test(value),
  "Chỉ dùng đường dẫn nội bộ an toàn",
);
export function safeHttps(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}
const image = z
  .object({
    src: text(400_000).refine(
      (value) =>
        /^\/media\/[0-9a-f-]{36}$/.test(value) ||
        /^data:image\/(png|jpeg|webp|avif);base64,[A-Za-z0-9+/=]+$/.test(value),
      "Ảnh phải từ media đã duyệt hoặc ảnh demo local",
    ),
    alt: text(160),
  })
  .strict();
const variant = z
  .object({
    id: key,
    label: text(80),
    priceVnd: amount,
    stock: z.number().int().min(0).max(999),
    priceConfigured: z.boolean().optional(),
  })
  .strict();
const product = z
  .object({
    id: key,
    slug: key,
    name: text(80),
    category: key,
    tagline: text(180),
    description: text(5000),
    monogram: text(20),
    art: z.enum(["canva", "capcut", "google", "netflix"]),
    badge: text(50).optional(),
    features: z.array(text(240)).min(1).max(12),
    variants: z.array(variant).min(1).max(8),
    deliveryLabel: text(120),
    activationRequired: z.boolean(),
    terms: z
      .object({
        warranty: text(240),
        receipt: text(500),
        activationNote: text(500),
      })
      .strict()
      .optional(),
    media: image.optional(),
  })
  .strict();
export const contentSchema = z
  .object({
    schemaVersion: z.literal(2),
    revision: text(80),
    brand: z
      .object({ name: text(40), tagline: text(180), footer: text(240) })
      .strict(),
    announcement: z
      .object({
        text: text(180),
        cta: text(80),
        href: internal,
        media: image.optional(),
      })
      .strict(),
    shop: z
      .object({
        eyebrow: text(80),
        title: text(120),
        accent: text(120),
        description: text(320),
        searchPlaceholder: text(120),
        allLabel: text(40),
        resultsLabel: text(80),
      })
      .strict(),
    categories: z
      .array(
        z
          .object({
            id: key,
            name: text(80),
            description: text(180),
            icon: z.enum(["sparkles", "grid", "play", "layers"]),
          })
          .strict(),
      )
      .min(1)
      .max(12),
    products: z.array(product).min(1).max(19),
    sections: z
      .array(
        z
          .object({
            id: key,
            kind: z.enum(["featured", "categories", "how_it_works", "support"]),
            title: text(160),
            subtitle: text(320),
            enabled: z.boolean(),
            sortOrder: z.number().int().min(0).max(100),
            productIds: z.array(key).max(19).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(12),
    steps: z
      .array(z.object({ title: text(120), description: text(320) }).strict())
      .min(1)
      .max(5),
    support: z
      .object({
        title: text(160),
        description: text(320),
        fanpageUrl: z.string().max(500).refine(safeHttps).nullable(),
      })
      .strict(),
    faqs: z
      .array(z.object({ question: text(320), answer: text(2000) }).strict())
      .min(1)
      .max(20),
    coupon: z
      .object({
        code: text(30).regex(/^[A-Z0-9_-]+$/),
        percent: z.number().int().min(0).max(100),
        maxDiscountVnd: amount,
      })
      .strict(),
    policies: z
      .array(
        z.object({ slug: key, title: text(120), body: text(10000) }).strict(),
      )
      .min(1)
      .max(8),
    experience: z
      .object({
        intro: z
          .object({
            eyebrow: text(80),
            title: text(120),
            accent: text(120),
            description: text(320),
          })
          .strict(),
        notices: z
          .array(
            z.object({ id: key, text: text(180), href: internal }).strict(),
          )
          .min(1)
          .max(8),
        slides: z
          .array(
            z
              .object({
                id: key,
                title: text(160),
                description: text(240),
                theme: z.enum(["mint", "peach", "lavender"]),
                href: internal,
                media: image.optional(),
              })
              .strict(),
          )
          .max(12),
        reviews: z
          .array(
            z
              .object({
                id: key,
                name: text(80),
                text: text(1000),
                product: text(80),
              })
              .strict(),
          )
          .max(12),
        illustrativePurchases: z.boolean(),
        activityNotifications: z.boolean().optional(),
        telegramUrl: z
          .string()
          .max(200)
          .refine((value) => {
            if (!safeHttps(value)) return false;
            const url = new URL(value);
            return (
              url.hostname === "t.me" &&
              /^\/[A-Za-z0-9_]{5,64}$/.test(url.pathname) &&
              !url.search &&
              !url.hash
            );
          })
          .nullable(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((content, ctx) => {
    const imageBytes = [
      ...content.products.map((p) => p.media?.src ?? ""),
      content.announcement.media?.src ?? "",
      ...(content.experience?.slides.map((s) => s.media?.src ?? "") ?? []),
    ]
      .filter((s) => s.startsWith("data:"))
      .reduce((sum, s) => sum + s.length, 0);
    if (imageBytes > 1_200_000)
      ctx.addIssue({
        code: "custom",
        path: ["experience"],
        message: "Tổng ảnh local quá lớn; nén ảnh trước khi lưu.",
      });
    const unique = (values: string[], path: string) => {
      if (new Set(values).size !== values.length)
        ctx.addIssue({ code: "custom", path: [path], message: "Mã bị trùng" });
    };
    unique(
      content.products.map((p) => p.id),
      "products",
    );
    if (content.experience) {
      unique(
        content.experience.slides.map((s) => s.id),
        "experience",
      );
      unique(
        content.experience.notices.map((s) => s.id),
        "experience",
      );
      unique(
        content.experience.reviews.map((s) => s.id),
        "experience",
      );
    }
    unique(
      content.products.map((p) => p.slug),
      "products",
    );
    unique(
      content.products.flatMap((p) => p.variants.map((v) => v.id)),
      "products",
    );
    unique(
      content.categories.map((c) => c.id),
      "categories",
    );
    unique(
      content.sections.map((s) => s.id),
      "sections",
    );
    unique(
      content.policies.map((p) => p.slug),
      "policies",
    );
    for (const p of content.products)
      if (!content.categories.some((c) => c.id === p.category))
        ctx.addIssue({
          code: "custom",
          path: ["products"],
          message: "Danh mục không tồn tại",
        });
    for (const s of content.sections)
      for (const id of s.productIds ?? [])
        if (!content.products.some((p) => p.id === id))
          ctx.addIssue({
            code: "custom",
            path: ["sections"],
            message: "Sản phẩm tham chiếu không tồn tại",
          });
    if (content.sections.filter((s) => s.kind === "featured").length !== 1)
      ctx.addIssue({
        code: "custom",
        path: ["sections"],
        message: "Cần đúng một bộ sưu tập đầu trang",
      });
  });
export function validateContent(
  value: unknown,
  localMedia = false,
): StorefrontContent {
  const content = contentSchema.parse(value);
  if (
    !localMedia &&
    content.products.some(
      (p) => p.terms || p.variants.some((v) => v.priceConfigured !== undefined),
    )
  )
    throw new Error(
      "Thông tin gói mới cần migration staging trước khi xuất bản online",
    );
  if (!localMedia && content.experience)
    throw new Error(
      "Bố cục mới cần migration CMS staging trước khi xuất bản online",
    );
  if (!localMedia && content.announcement.media)
    throw new Error(
      "Banner ảnh local cần migration staging riêng trước khi xuất bản online",
    );
  if (
    !localMedia &&
    content.products.some((p) => p.media?.src.startsWith("data:"))
  )
    throw new Error(
      "Ảnh local không được publish lên staging; hãy upload qua media library",
    );
  return content;
}
