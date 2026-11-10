export const localOrderEmail = "demo@buyer.example";
// Hosted lookup must match a verified account email AND a server-owned order.
// Email/code entered in a form are never themselves evidence of ownership.
export function findVerifiedAccountOrder<T extends { code: string }>(
  orders: readonly T[],
  code: string,
  enteredEmail: string,
  verifiedEmail: string,
): T | undefined {
  const normalizedCode = code.trim().toUpperCase();
  if (
    !/^HB[A-F0-9]{16}$/.test(normalizedCode) ||
    !verifiedEmail.trim() ||
    enteredEmail.trim().toLowerCase() !== verifiedEmail.trim().toLowerCase()
  )
    return undefined;
  return orders.find((order) => order.code === normalizedCode);
}
export function findOwnedOrder<T extends { id: string; email?: string }>(
  orders: T[],
  code: string,
  email: string,
): T | undefined {
  const normEmail = email.trim().toLowerCase();
  const normalized = code.trim().toLowerCase();
  if (
    !/^(?:[a-f0-9]{8}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/.test(
      normalized,
    )
  )
    return undefined;
  const matches = orders.filter(
    (order) =>
      (order.id === normalized || order.id.slice(0, 8) === normalized) &&
      normEmail === (order.email?.trim().toLowerCase() || localOrderEmail),
  );
  return matches.length === 1 ? matches[0] : undefined;
}
