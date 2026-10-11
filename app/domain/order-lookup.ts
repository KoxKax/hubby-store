export const localOrderEmail = "demo@buyer.example";
export function findOwnedOrder<T extends { id: string }>(
  orders: T[],
  code: string,
  email: string,
): T | undefined {
  if (email.trim().toLowerCase() !== localOrderEmail) return undefined;
  const normalized = code.trim().toLowerCase();
  if (
    !/^(?:[a-f0-9]{8}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/.test(
      normalized,
    )
  )
    return undefined;
  const matches = orders.filter(
    (order) => order.id === normalized || order.id.slice(0, 8) === normalized,
  );
  return matches.length === 1 ? matches[0] : undefined;
}
