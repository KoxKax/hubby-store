import { describe, expect, it } from "vitest";
import { assertVnd, calculateLineTotal, formatVnd } from "../app/domain/money";

describe("integer VND boundary", () => {
  it("rejects fractional, negative, non-finite and unsafe amounts", () => {
    for (const value of [-1, 1.5, Number.NaN, Infinity, 2 ** 53]) {
      expect(() => assertVnd(value)).toThrow(RangeError);
    }
    expect(assertVnd(0)).toBe(0);
  });

  it("calculates quantities without silently overflowing safe integers", () => {
    expect(calculateLineTotal(125_000, 2)).toBe(250_000);
    expect(() => calculateLineTotal(Number.MAX_SAFE_INTEGER, 2)).toThrow();
    for (const quantity of [0, -1, 1.5, Infinity]) {
      expect(() => calculateLineTotal(10_000, quantity)).toThrow();
    }
  });

  it("formats VND with Vietnamese separators and no fractional digits", () => {
    expect(formatVnd(125_000).replace(/\s/g, " ")).toBe("125.000 ₫");
  });
});
