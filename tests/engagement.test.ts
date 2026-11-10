import { RouterContextProvider } from "react-router";
import { describe, expect, it } from "vitest";
import {
  defaultExperience,
  experienceOf,
  imageSlides,
} from "../app/content/experience";
import { getStorefrontContent } from "../app/content/fixtures";
import { validateContent } from "../app/content/schema";
import {
  createVirtualActivity,
  feedbackInput,
  generateVirtualEmail,
  maskCustomerEmail,
  publicActivity,
  purchaseActivity,
  randomBirthdateSuffix,
  randomCharNumSuffix,
  recentActivities,
} from "../app/domain/engagement";
import { themeValue } from "../app/domain/theme";
import { runtimeContext } from "../app/server/runtime-context.server";
import { readTheme, saveTheme } from "../app/server/theme.server";

describe("truthful public activity and private feedback", () => {
  const event = {
    id: crypto.randomUUID(),
    kind: "cart" as const,
    product: "Canva",
    variant: "1 tháng",
    customer: "Một khách",
    at: 1000,
  };
  it("public projection drops all private and attacker-supplied fields", () => {
    const projected = publicActivity({
      ...event,
      actor: "secret",
      email: "private@example.com",
      orderId: "secret",
      customer: "private@example.com",
    } as typeof event);
    expect(projected).toEqual(event);
    expect(JSON.stringify(projected)).not.toMatch(/email|actor|orderId|secret/);
    expect(projected.customer).toBe("Một khách");
  });
  it("expires activity and excludes future timestamps", () => {
    expect(recentActivities([event], 1001)).toEqual([event]);
    expect(recentActivities([event], 901001)).toEqual([]);
    expect(recentActivities([event], 999)).toEqual([]);
  });
  it("mock, unverified, uncommitted or refunded settlement never becomes marketing", () => {
    const proof = {
      channel: "live" as const,
      verified: true,
      committed: true,
      refunded: false,
    };
    expect(purchaseActivity(event, proof)?.kind).toBe("purchase");
    for (const invalid of [
      { channel: "mock" as const },
      { verified: false },
      { committed: false },
      { refunded: true },
    ])
      expect(purchaseActivity(event, { ...proof, ...invalid })).toBeNull();
  });
  it("feedback has bounded text/category/idempotency and no identity input", () => {
    const input = {
      key: crypto.randomUUID(),
      category: "idea",
      message: "  Góp ý về bộ lọc sản phẩm  ",
    };
    expect(feedbackInput.parse(input).message).toBe("Góp ý về bộ lọc sản phẩm");
    for (const bad of [
      { category: "unknown" },
      { message: "x" },
      { message: "x".repeat(1501) },
      { key: "invalid" },
      { email: "private@example.com" },
    ])
      expect(feedbackInput.safeParse({ ...input, ...bad }).success).toBe(false);
  });
});
describe("image-count carousel and non-destructive CMS defaults", () => {
  it("uses three approved campaign defaults, with Owner uploads and removal taking priority", () => {
    const content = {
      ...getStorefrontContent(),
      experience: structuredClone(defaultExperience),
    };
    expect(imageSlides(content)).toHaveLength(3);
    const first = content.experience.slides[0];
    if (!first) throw Error("fixture missing");
    first.media = { src: "data:image/png;base64,AAAA", alt: "Owner banner" };
    expect(imageSlides(content)).toHaveLength(1);
    content.experience.slides = [];
    expect(imageSlides(content)).toHaveLength(0);
    expect(validateContent(content, true).experience?.slides).toEqual([]);
  });
  it("legacy simulation toggle is inert without changing immutable data", () => {
    const content = {
      ...getStorefrontContent(),
      experience: {
        ...structuredClone(defaultExperience),
        illustrativePurchases: true,
      },
    };
    expect(experienceOf(content).illustrativePurchases).toBe(false);
    expect(content.experience.illustrativePurchases).toBe(true);
  });
  it("preserves a real legacy uploaded image until new slides replace it", () => {
    const content = structuredClone(getStorefrontContent());
    content.announcement.media = {
      src: "data:image/jpeg;base64,AAAA",
      alt: "Owner legacy image",
    };
    expect(imageSlides(content)).toHaveLength(1);
    expect(imageSlides(content)[0]?.media.alt).toBe("Owner legacy image");
    expect(content.experience).toBeUndefined();
  });
  it("limits the image collection and total local snapshot size", () => {
    const content = {
      ...getStorefrontContent(),
      experience: structuredClone(defaultExperience),
    };
    const first = content.experience.slides[0];
    if (!first) throw Error("fixture missing");
    content.experience.slides = Array.from({ length: 12 }, (_, n) => ({
      ...first,
      id: `slide-${n}`,
    }));
    expect(validateContent(content, true).experience?.slides).toHaveLength(12);
    content.experience.slides.push({ ...first, id: "slide-overflow" });
    expect(() => validateContent(content, true)).toThrow();
    content.experience.slides.pop();
    for (const slide of content.experience.slides)
      slide.media = {
        src: `data:image/png;base64,${"A".repeat(110_000)}`,
        alt: "bounded local QA",
      };
    expect(() => validateContent(content, true)).toThrow("Tổng ảnh local");
  });
});
describe("SSR theme preference", () => {
  it("defaults to dark and rejects unknown cookie values", () => {
    expect(themeValue(undefined)).toBe("dark");
    expect(readTheme(new Request("http://localhost/"))).toBe("dark");
    expect(
      readTheme(
        new Request("http://localhost/", {
          headers: { Cookie: "hubby-theme=light" },
        }),
      ),
    ).toBe("light");
    expect(
      readTheme(
        new Request("http://localhost/", {
          headers: { Cookie: "hubby-theme=evil" },
        }),
      ),
    ).toBe("dark");
  });
  it("HTTPS theme cookie is host-only, persistent, HttpOnly and not shared with HTTP", () => {
    const context = new RouterContextProvider();
    context.set(runtimeContext, {
      env: {
        APP_ENV: "local",
        DATA_MODE: "fixtures",
        PAYMENTS_MODE: "mock",
        SUPPLIERS_MODE: "mock",
      },
      ctx: {} as ExecutionContext,
      responseHeaders: new Headers(),
      responseCookies: new Map(),
    });
    const request = new Request("https://store.example/", {
      headers: { Cookie: "hubby-theme=light" },
    });
    expect(readTheme(request)).toBe("dark");
    saveTheme(request, context, "light");
    const cookie = context
      .get(runtimeContext)
      .responseCookies.get("__Host-hubby-theme");
    expect(cookie).toMatch(/__Host-hubby-theme=light/);
    expect(cookie).toMatch(/Secure; HttpOnly|HttpOnly; Secure|Secure/);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/Max-Age=31536000/);
    expect(cookie).not.toMatch(/Domain=/);
  });
});

describe("virtual social notifications and real customer privacy masking", () => {
  it("generates virtual emails with xxxx prefix, birthdate or character+number suffix, and @gmail.com", () => {
    for (let i = 0; i < 30; i++) {
      const email = generateVirtualEmail();
      expect(email).toMatch(/^xxxx[a-z0-9]+@gmail\.com$/);
      expect(email.startsWith("xxxx")).toBe(true);
      expect(email.endsWith("@gmail.com")).toBe(true);
    }
  });

  it("random birthdate suffix always formats 4 digits (DDMM)", () => {
    for (let i = 0; i < 20; i++) {
      const suffix = randomBirthdateSuffix();
      expect(suffix).toMatch(/^\d{4}$/);
      const day = Number.parseInt(suffix.slice(0, 2), 10);
      const month = Number.parseInt(suffix.slice(2, 4), 10);
      expect(day).toBeGreaterThanOrEqual(1);
      expect(day).toBeLessThanOrEqual(28);
      expect(month).toBeGreaterThanOrEqual(1);
      expect(month).toBeLessThanOrEqual(12);
    }
  });

  it("random char-num suffix contains valid characters and numbers", () => {
    for (let i = 0; i < 20; i++) {
      const suffix = randomCharNumSuffix();
      expect(suffix).toMatch(/^[a-z]+(?:\d{2}|2k\d)$/);
    }
  });

  it("masks real customer emails preserving birthdate/suffix while safeguarding privacy", () => {
    expect(maskCustomerEmail("maihoang2705@gmail.com")).toBe(
      "xxxx2705@gmail.com",
    );
    expect(maskCustomerEmail("nguyenvana1607@gmail.com")).toBe(
      "xxxx1607@gmail.com",
    );
    expect(maskCustomerEmail("customerk99@gmail.com")).toBe(
      "xxxxk99@gmail.com",
    );
    expect(maskCustomerEmail("demo@buyer.example")).toMatch(
      /^xxxx[a-z0-9]+@gmail\.com$/,
    );
    expect(maskCustomerEmail("")).toMatch(/^xxxx[a-z0-9]+@gmail\.com$/);
    expect(maskCustomerEmail(undefined)).toMatch(/^xxxx[a-z0-9]+@gmail\.com$/);
  });

  it("creates virtual activities with random products and proper attributes", () => {
    const products = [
      { name: "Canva Edu", variants: [{ label: "3 năm" }] },
      { name: "Capcut Pro", variants: [{ label: "1 tháng" }] },
    ];
    const activity = createVirtualActivity(products);
    expect(activity.id.startsWith("virt-")).toBe(true);
    expect(["cart", "purchase"]).toContain(activity.kind);
    expect(["Canva Edu", "Capcut Pro"]).toContain(activity.product);
    expect(activity.customer).toMatch(/^xxxx[a-z0-9]+@gmail\.com$/);
    expect(activity.at).toBeLessThanOrEqual(Date.now());
  });
});
