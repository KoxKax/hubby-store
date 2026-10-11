import type { DemoProduct } from "../content/types";

export function normalizeSearch(value: string) {
  return value
    .toLocaleLowerCase("vi")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/đ/g, "d")
    .trim();
}

export function filterProducts(
  products: DemoProduct[],
  filters: { q: string; category: string; available: boolean; sort: string },
) {
  const query = normalizeSearch(filters.q);
  const results = products.filter(
    (product) =>
      (!filters.category || product.category === filters.category) &&
      (!filters.available ||
        product.variants.some(
          (variant) => variant.stock > 0 && variant.priceConfigured !== false,
        )) &&
      (!query ||
        normalizeSearch(
          `${product.name} ${product.tagline} ${product.description}`,
        ).includes(query)),
  );
  const minimum = (product: DemoProduct) =>
    Math.min(...product.variants.map((variant) => variant.priceVnd));
  if (filters.sort === "price-asc")
    results.sort((a, b) => minimum(a) - minimum(b));
  if (filters.sort === "price-desc")
    results.sort((a, b) => minimum(b) - minimum(a));
  if (filters.sort === "name")
    results.sort((a, b) => a.name.localeCompare(b.name, "vi"));
  return results;
}
