import { describe, expect, it } from "vitest";
import { getStorefrontContent } from "../app/content/fixtures";
import { filterProducts, normalizeSearch } from "../app/domain/catalog";
import {
  cartSubtotal,
  demoDiscount,
  normalizeCart,
} from "../app/domain/demo-cart";

describe("demo commerce boundaries", () => {
  it("rejects invalid or sold-out lines, merges quantities and caps to stock", () => {
    expect(normalizeCart(null)).toEqual([]);
    expect(
      normalizeCart([
        { variantId: "capcut-3", quantity: 2 },
        { variantId: "capcut-3", quantity: 99 },
        { variantId: "canva-12", quantity: 1 },
        { variantId: "unknown", quantity: 1 },
        { variantId: "canva-1", quantity: 1.5 },
        { variantId: "netflix-1", quantity: -1 },
      ]),
    ).toEqual([{ variantId: "capcut-3", quantity: 3 }]);
  });
  it("computes fixture prices and bounded integer coupon discounts", () => {
    const subtotal = cartSubtotal([{ variantId: "capcut-3", quantity: 2 }]);
    expect(subtotal).toBe(698000);
    expect(demoDiscount(subtotal, " hubby10 ")).toBe(30000);
    expect(demoDiscount(89000, "HUBBY10")).toBe(8900);
    expect(demoDiscount(subtotal, "invalid")).toBe(0);
  });
  it("matches accent-free Vietnamese search without mutating CMS ordering", () => {
    expect(normalizeSearch("  Để SÁNG TẠO  ")).toBe("de sang tao");
    const products = getStorefrontContent().products;
    const original = products.map((product) => product.id);
    expect(
      filterProducts(products, {
        q: "thiet ke",
        category: "ai",
        available: true,
        sort: "price-asc",
      }).map((product) => product.id),
    ).toContain("canva");
    expect(
      filterProducts(products, {
        q: "",
        category: "work",
        available: true,
        sort: "featured",
      }).map((product) => product.id),
    ).toEqual(["google"]);
    expect(
      filterProducts(products, {
        q: "missing-query",
        category: "",
        available: false,
        sort: "featured",
      }),
    ).toHaveLength(0);
    expect(products.map((product) => product.id)).toEqual(original);
  });
  it("keeps fixture IDs, sections, variants and VND prices consistent", () => {
    const content = getStorefrontContent();
    expect(content.schemaVersion).toBe(2);
    expect(content.products.map((product) => product.name)).toEqual([
      "Canva",
      "CapCut",
      "Google",
      "Netflix",
    ]);
    expect(content.products.length).toBeLessThan(20);
    expect(new Set(content.products.map((product) => product.slug)).size).toBe(
      content.products.length,
    );
    const variants = content.products.flatMap((product) => product.variants);
    expect(new Set(variants.map((variant) => variant.id)).size).toBe(
      variants.length,
    );
    for (const variant of variants) {
      expect(Number.isSafeInteger(variant.priceVnd)).toBe(true);
      expect(variant.priceVnd).toBeGreaterThanOrEqual(0);
      expect(Number.isSafeInteger(variant.stock)).toBe(true);
    }
    for (const section of content.sections) {
      for (const id of section.productIds ?? [])
        expect(content.products.some((product) => product.id === id)).toBe(
          true,
        );
    }
  });
});
