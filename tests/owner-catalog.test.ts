import { describe, expect, it } from "vitest";
import { getStorefrontContent } from "../app/content/fixtures";
import { applyOwnerCatalog, ownerProducts } from "../app/content/owner-catalog";
import { validateContent } from "../app/content/schema";
import { normalizeCart } from "../app/domain/demo-cart";
import { reviewInput } from "../app/domain/engagement";
import { checkout, emptyShop } from "../app/domain/local-shop";

describe("Owner catalog, unpriced safety and private review contract", () => {
  it("has exact six products / seven terms; never invents prices", () => {
    const c = validateContent(applyOwnerCatalog(getStorefrontContent()), true);
    expect(c.products).toHaveLength(6);
    expect(c.products.flatMap((p) => p.variants).map((v) => v.label)).toEqual([
      "3 năm",
      "1 năm",
      "1 tháng",
      "6 tháng",
      "1 tháng",
      "1 năm",
      "18 tháng",
    ]);
    expect(
      c.products.every((p) =>
        p.variants.every((v) => v.priceConfigured === false),
      ),
    ).toBe(true);
    expect(c.products.find((p) => p.id === "google")?.terms?.warranty).toBe(
      "Không bảo hành",
    );
    expect(c.products.find((p) => p.id === "canva")?.terms?.warranty).toBe(
      "1 năm",
    );
    expect(() => validateContent(c)).toThrow(/migration staging/);
  });
  it("preserves unrelated custom products, images, and original snapshots", () => {
    const original = structuredClone(getStorefrontContent());
    const first = original.products[0];
    if (!first) throw new Error("Missing fixture");
    first.media = {
      src: "/media/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      alt: "Owner image",
    };
    original.products.push({
      ...structuredClone(first),
      id: "custom",
      slug: "custom",
      variants: [
        { id: "custom-1", label: "1 tháng", priceVnd: 1000, stock: 0 },
      ],
    });
    const before = JSON.stringify(original);
    const next = applyOwnerCatalog(original);
    expect(next.products.find((p) => p.id === "custom")).toEqual(
      original.products.at(-1),
    );
    expect(next.products[0]?.media).toEqual(first.media);
    expect(JSON.stringify(original)).toBe(before);
  });
  it("rejects unpriced checkout even when synthetic stock exists", () => {
    const c = applyOwnerCatalog(getStorefrontContent());
    const variant = c.products[0]?.variants[0];
    if (!variant) throw new Error("Missing plan");
    variant.stock = 1;
    expect(normalizeCart([{ variantId: "canva-36", quantity: 1 }], c)).toEqual(
      [],
    );
    expect(() =>
      checkout(
        emptyShop(),
        c,
        {
          actor: "a",
          key: crypto.randomUUID(),
          lines: [{ variantId: "canva-36", quantity: 1 }],
          coupon: "",
          expectedTotal: 0,
        },
        Date.now(),
      ),
    ).toThrow(/chưa có giá/);
  });
  it("bounds rating and review text and rejects public/identity injection", () => {
    const value = {
      key: crypto.randomUUID(),
      productId: ownerProducts[0]?.id,
      rating: "5",
      message: "Trải nghiệm sử dụng tốt.",
    };
    expect(reviewInput.parse(value).rating).toBe(5);
    for (const input of [
      { ...value, rating: 6 },
      { ...value, rating: "" },
      { ...value, message: "ngắn" },
      { ...value, email: "private@example.com" },
      { ...value, public: true },
    ])
      expect(reviewInput.safeParse(input).success).toBe(false);
  });
});
