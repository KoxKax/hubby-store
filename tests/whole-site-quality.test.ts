import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ownerProducts } from "../app/content/owner-catalog";
import { brandImage } from "../app/content/visual-assets";
import { parseSavedList, savedProductIds } from "../app/domain/browser-lists";
import { filterProducts, normalizeSearch } from "../app/domain/catalog";

const search = (q: string, category = "", available = false) =>
  filterProducts(ownerProducts, { q, category, available, sort: "featured" });
describe("search helps customers without changing commercial eligibility", () => {
  it.each([
    "office 365",
    "365 office",
    "  OFFICE   365  ",
    "office365",
    "office-365",
  ])("finds Office for %s", (query) => {
    expect(search(query).map((p) => p.id)).toEqual(["office"]);
  });
  it("matches delivery, variant length and Vietnamese without accents", () => {
    expect(normalizeSearch("  Chính   chủ ")).toBe("chinh chu");
    expect(search("6 thang capcut").map((p) => p.id)).toEqual(["capcut"]);
    expect(search("loi moi email").some((p) => p.id === "canva")).toBe(true);
    expect(search("link kich hoat", "learning").map((p) => p.id)).toEqual([
      "duolingo",
    ]);
    expect(search("canva", "", true)).toEqual([]);
  });
  it("does not mutate source products and does not match incomplete multi-word queries", () => {
    const snapshot = JSON.stringify(ownerProducts);
    expect(search("canva unknownword")).toEqual([]);
    search("capcut 6 thang");
    expect(JSON.stringify(ownerProducts)).toBe(snapshot);
  });
});
describe("browser lists recover independently from malformed storage", () => {
  it("rejects malformed, oversized or absent JSON without propagating an exception", () => {
    for (const raw of [null, "{bad", " ", "x".repeat(16001)])
      expect(parseSavedList(raw)).toEqual([]);
    expect(parseSavedList('["canva"]')).toEqual(["canva"]);
  });
  it("deduplicates valid IDs, retains order and ignores unrelated/unsafe items", () => {
    expect(
      savedProductIds(
        ["google", "canva", "google", {}, "missing", null, "office"],
        ownerProducts,
      ),
    ).toEqual(["google", "canva", "office"]);
    expect(savedProductIds({}, ownerProducts)).toEqual([]);
  });
});
describe("real product images are shipped instead of favicons", () => {
  it("provides both optimized sizes for all six known products", () => {
    for (const product of ownerProducts) {
      const src = brandImage(product);
      expect(src).toMatch(/^\/visuals\/products\/[a-z]+-320\.webp$/);
      for (const width of [160, 320]) {
        const bytes = readFileSync(
          `public${src?.replace("320", String(width))}`,
        );
        expect(bytes.subarray(8, 12).toString()).toBe("WEBP");
        expect(bytes.length).toBeLessThan(40000);
      }
    }
  });
});
