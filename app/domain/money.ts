export function assertVnd(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError("VND must be a non-negative safe integer");
  }
  return value;
}

export function calculateLineTotal(
  unitPriceVnd: number,
  quantity: number,
): number {
  assertVnd(unitPriceVnd);
  if (!Number.isSafeInteger(quantity) || quantity <= 0) {
    throw new RangeError("Quantity must be a positive safe integer");
  }
  return assertVnd(unitPriceVnd * quantity);
}

export function formatVnd(value: number): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(assertVnd(value));
}
