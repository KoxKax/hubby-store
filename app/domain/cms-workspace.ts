import type { DemoProduct } from "../content/types";
import { normalizeSearch } from "./catalog";

export type ProductPriceFilter = "all" | "priced" | "unpriced";

export function workspaceProducts(
  products: DemoProduct[],
  query: string,
  category: string,
  status: ProductPriceFilter,
) {
  const terms = normalizeSearch(query).split(/\s+/).filter(Boolean);
  return products.filter((product) => {
    const searchable = normalizeSearch(`${product.name} ${product.id}`);
    const priced = product.variants.some((v) => v.priceConfigured !== false);
    return (
      terms.every((term) => searchable.includes(term)) &&
      (!category || product.category === category) &&
      (status === "all" || (status === "priced" ? priced : !priced))
    );
  });
}

export function moveItem<T>(items: T[], from: number, to: number): T[] {
  const result = [...items];
  if (
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 0 ||
    to < 0 ||
    from >= result.length ||
    to >= result.length ||
    from === to
  )
    return result;
  result.splice(to, 0, ...result.splice(from, 1));
  return result;
}
