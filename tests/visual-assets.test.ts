import { existsSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { imageSlides } from "../app/content/experience";
import { getStorefrontContent } from "../app/content/fixtures";
import { ownerProducts } from "../app/content/owner-catalog";
import { brandImage, shopBanners } from "../app/content/visual-assets";

describe("reviewed visual assets preserve CMS authority", () => {
  it("renders three bundled campaigns without changing stored CMS, prices or terms", () => {
    const content = structuredClone(getStorefrontContent());
    const before = JSON.stringify(content);
    expect(imageSlides(content)).toEqual(shopBanners);
    expect(JSON.stringify(content)).toBe(before);
    expect(shopBanners[1]?.media.alt).toContain("HUBBYxHUBER giảm 10%");
  });
  it("retains custom and legacy media instead of silently replacing them", () => {
    const content = structuredClone(getStorefrontContent());
    content.announcement.media = {
      src: "data:image/png;base64,AAAA",
      alt: "Ảnh do Owner tải lên",
    };
    expect(imageSlides(content)[0]?.media).toEqual(content.announcement.media);
    expect(imageSlides(content)).toHaveLength(1);
  });
  it("does not reuse a brand image for a renamed or unrelated product", () => {
    for (const product of ownerProducts) {
      const src = brandImage(product);
      expect(src).toBeTruthy();
      expect(existsSync(`public${src}`)).toBe(true);
      expect(
        brandImage({ ...product, name: "Tên riêng của Owner" }),
      ).toBeUndefined();
    }
  });
  it("ships actual optimized WebP banners in both responsive sizes", () => {
    for (const banner of shopBanners) {
      for (const width of [768, 1200]) {
        const path = `public${banner.media.src.replace("1200", String(width))}`;
        const bytes = readFileSync(path);
        expect(bytes.subarray(0, 4).toString()).toBe("RIFF");
        expect(bytes.subarray(8, 12).toString()).toBe("WEBP");
        expect(statSync(path).size).toBeLessThan(250000);
      }
    }
  });
});
