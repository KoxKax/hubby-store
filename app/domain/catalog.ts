import type { DemoProduct } from "../content/types";

export function normalizeSearch(value: string) {
  return value
    .toLocaleLowerCase("vi")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/đ/g, "d")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function filterProducts(
  products: DemoProduct[],
  filters: { q: string; category: string; available: boolean; sort: string },
) {
  const words = normalizeSearch(filters.q).split(" ").filter(Boolean);
  const results = products.filter(
    (product) =>
      (!filters.category || product.category === filters.category) &&
      (!filters.available ||
        product.variants.some(
          (variant) => variant.stock > 0 && variant.priceConfigured !== false,
        )) &&
      words.every(
        (word) =>
          normalizeSearch(
            [
              product.name,
              product.tagline,
              product.description,
              product.deliveryLabel,
              ...product.features,
              ...product.variants.map((variant) => variant.label),
            ].join(" "),
          ).includes(word) ||
          normalizeSearch(product.name).replaceAll(" ", "").includes(word),
      ),
  );
  const minimum = (product: DemoProduct) =>
    Math.min(
      ...product.variants
        .filter((variant) => variant.priceConfigured !== false)
        .map((variant) => variant.priceVnd),
    );
  if (filters.sort === "price-asc" || filters.sort === "price-desc")
    results.sort((a, b) => {
      const left = minimum(a),
        right = minimum(b);
      // Unpriced products are not free and belong after priced products in both directions.
      if (!Number.isFinite(left)) return Number.isFinite(right) ? 1 : 0;
      if (!Number.isFinite(right)) return -1;
      return filters.sort === "price-asc" ? left - right : right - left;
    });
  if (filters.sort === "name")
    results.sort((a, b) => a.name.localeCompare(b.name, "vi"));
  return results;
}
