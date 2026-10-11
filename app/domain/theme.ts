export type Theme = "dark" | "light";
export function themeValue(value: unknown): Theme {
  return value === "light" ? "light" : "dark";
}
