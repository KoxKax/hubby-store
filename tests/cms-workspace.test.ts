import { describe, expect, it } from "vitest";
import { ownerProducts } from "../app/content/owner-catalog";
import { moveItem, workspaceProducts } from "../app/domain/cms-workspace";

describe("CMS workspace keeps Owner data intact", () => {
  it("combines accent-insensitive multiword search, category and price filters", () => {
    const products = structuredClone(ownerProducts);
    const canva = products.find((p) => p.id === "canva");
    if (!canva?.variants[0]) throw Error("Missing fixture");
    canva.variants[0].priceConfigured = true;
    canva.variants[0].priceVnd = 49000;
    const before = JSON.stringify(products);
    expect(
      workspaceProducts(products, "edu canva", canva.category, "priced"),
    ).toEqual([canva]);
    expect(workspaceProducts(products, "", "", "unpriced")).toHaveLength(5);
    expect(
      workspaceProducts(products, "canva", "entertainment", "all"),
    ).toEqual([]);
    expect(workspaceProducts(products, " không tồn tại ", "", "all")).toEqual(
      [],
    );
    expect(JSON.stringify(products)).toBe(before);
  });
  it("never loses banner data when reordering, including boundary and invalid moves", () => {
    const first = {
      id: "a",
      media: {
        src: "/media/00000000-0000-4000-8000-000000000001",
        alt: "Ảnh Owner",
      },
    };
    const items = [first, { id: "b" }, { id: "c" }];
    const before = JSON.stringify(items);
    const moved = moveItem(items, 0, 2);
    expect(moved.map((i) => i.id)).toEqual(["b", "c", "a"]);
    expect(moved[2]).toBe(first);
    expect(moveItem(moved, 2, 0)).toEqual(items);
    for (const [from, to] of [
      [-1, 0],
      [0, 3],
      [0, 0],
      [0.5, 1],
      [1, Number.NaN],
    ] as const) {
      expect(moveItem(items, from, to)).toEqual(items);
    }
    expect(moveItem([], 0, 1)).toEqual([]);
    expect(JSON.stringify(items)).toBe(before);
  });
});
