import type { DemoProduct } from "../content/types";

export function savedProductIds(value: unknown, products: DemoProduct[]) {
  if (!Array.isArray(value)) return [];
  const allowed = new Set(products.map((product) => product.id));
  return [
    ...new Set(
      value
        .slice(0, 100)
        .filter(
          (id): id is string => typeof id === "string" && allowed.has(id),
        ),
    ),
  ].slice(0, 20);
}

export function parseSavedList(raw: string | null): unknown {
  if (!raw || raw.length > 16000) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}
