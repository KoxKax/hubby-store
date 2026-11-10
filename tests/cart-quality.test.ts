import { describe, expect, it } from "vitest";
import { getStorefrontContent } from "../app/content/fixtures";
import { filterProducts } from "../app/domain/catalog";
import { planCartAddition } from "../app/domain/demo-cart";

describe("truthful cart actions", () => {
  const content = getStorefrontContent();
  it("reports only the quantity actually added, respecting remaining stock", () => {
    const current = [{ variantId: "capcut-3", quantity: 2 }];
    const result = planCartAddition(current, "capcut-3", 3, content);
    expect(result.added).toBe(1);
    expect(result.reason).toBe("added");
    expect(result.lines).toEqual([{ variantId: "capcut-3", quantity: 3 }]);
    expect(current[0]?.quantity).toBe(2);
    expect(planCartAddition(result.lines, "capcut-3", 1, content).reason).toBe(
      "limit",
    );
    expect(planCartAddition(result.lines, "capcut-3", 1, content).added).toBe(
      0,
    );
  });
  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid quantity %s without success",
    (quantity) => {
      expect(planCartAddition([], "capcut-3", quantity, content)).toMatchObject(
        { added: 0, reason: "invalid", lines: [] },
      );
    },
  );
  it("never adds unknown, sold-out or unpriced variants", () => {
    expect(planCartAddition([], "unknown", 1, content).reason).toBe(
      "unavailable",
    );
    expect(planCartAddition([], "canva-12", 1, content).reason).toBe(
      "unavailable",
    );
    const unpublished = structuredClone(content);
    const variant = unpublished.products[0]?.variants[0];
    if (!variant) throw new Error("Missing fixture");
    variant.priceConfigured = false;
    expect(planCartAddition([], variant.id, 1, unpublished).reason).toBe(
      "unpriced",
    );
  });
  it("sequential additions cannot exceed the per-variant cap", () => {
    const first = planCartAddition([], "netflix-1", 8, content);
    const second = planCartAddition(first.lines, "netflix-1", 8, content);
    expect(second.lines[0]?.quantity).toBeLessThanOrEqual(9);
    expect(first.added + second.added).toBe(second.lines[0]?.quantity);
  });
});

describe("catalog price sorting", () => {
  it.each(["price-asc", "price-desc"])(
    "puts unpriced products last for %s without treating them as free",
    (sort) => {
      const products = structuredClone(getStorefrontContent().products);
      const first = products[0],
        second = products[1];
      if (!first || !second) throw new Error("Missing fixtures");
      first.variants.forEach((v) => {
        v.priceConfigured = false;
        v.priceVnd = 0;
      });
      const secondVariant = second.variants[0];
      if (!secondVariant) throw new Error("Missing variant");
      secondVariant.priceConfigured = false;
      secondVariant.priceVnd = 0;
      const sorted = filterProducts(products, {
        q: "",
        category: "",
        available: false,
        sort,
      });
      expect(sorted.at(-1)?.id).toBe(first.id);
      const prices = sorted
        .slice(0, -1)
        .map((p) =>
          Math.min(
            ...p.variants
              .filter((v) => v.priceConfigured !== false)
              .map((v) => v.priceVnd),
          ),
        );
      expect(prices).toEqual(
        [...prices].sort((a, b) => (sort === "price-asc" ? a - b : b - a)),
      );
      expect(products[0]?.id).toBe(first.id);
    },
  );
});
