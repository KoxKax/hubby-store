import { findVariant, getStorefrontContent } from "../content/fixtures";
import type { StorefrontContent } from "../content/types";
import { calculateLineTotal } from "./money";

export interface CartLine {
  variantId: string;
  quantity: number;
}

// A cart action must report what actually changed, not just a button click.
export function planCartAddition(
  current: CartLine[],
  variantId: string,
  quantity: number,
  content: StorefrontContent,
) {
  const lines = normalizeCart(current, content);
  const found = findVariant(variantId, content);
  if (!Number.isSafeInteger(quantity) || quantity <= 0)
    return { lines, added: 0, reason: "invalid" as const };
  if (found?.variant.priceConfigured === false)
    return { lines, added: 0, reason: "unpriced" as const };
  if (!found || found.variant.stock < 1)
    return { lines, added: 0, reason: "unavailable" as const };
  const before =
    lines.find((line) => line.variantId === variantId)?.quantity ?? 0;
  const next = normalizeCart([...lines, { variantId, quantity }], content);
  const after =
    next.find((line) => line.variantId === variantId)?.quantity ?? 0;
  return {
    lines: next,
    added: after - before,
    reason: after > before ? ("added" as const) : ("limit" as const),
  };
}

export function normalizeCart(
  value: unknown,
  content: StorefrontContent = getStorefrontContent(),
): CartLine[] {
  if (!Array.isArray(value)) return [];
  const merged = new Map<string, number>();
  for (const row of value.slice(0, 50)) {
    if (!row || typeof row !== "object") continue;
    const { variantId, quantity } = row;
    if (
      typeof variantId !== "string" ||
      !Number.isSafeInteger(quantity) ||
      quantity <= 0
    )
      continue;
    const found = findVariant(variantId, content);
    if (
      !found ||
      found.variant.stock <= 0 ||
      found.variant.priceConfigured === false
    )
      continue;
    merged.set(
      variantId,
      Math.min(9, found.variant.stock, (merged.get(variantId) ?? 0) + quantity),
    );
  }
  return [...merged].map(([variantId, quantity]) => ({ variantId, quantity }));
}

export function cartSubtotal(
  lines: CartLine[],
  content: StorefrontContent = getStorefrontContent(),
) {
  return normalizeCart(lines, content).reduce((total, row) => {
    const found = findVariant(row.variantId, content);
    return (
      total +
      (found ? calculateLineTotal(found.variant.priceVnd, row.quantity) : 0)
    );
  }, 0);
}

export function demoDiscount(
  subtotal: number,
  code: string,
  content: StorefrontContent = getStorefrontContent(),
) {
  const coupon = content.coupon;
  if (code.trim().toUpperCase() !== coupon.code) return 0;
  return Math.min(
    Math.floor((subtotal * coupon.percent) / 100),
    coupon.maxDiscountVnd,
  );
}
