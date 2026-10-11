import { describe, expect, it } from "vitest";
import {
  customerCopy,
  defaultExperience,
  experienceOf,
} from "../app/content/experience";
import { getStorefrontContent } from "../app/content/fixtures";
import { validateContent } from "../app/content/schema";
import { findOwnedOrder, localOrderEmail } from "../app/domain/order-lookup";

describe("storefront experience preserves existing CMS and validates local extensions", () => {
  const baseline = getStorefrontContent();
  it("old published snapshots render new defaults without changing stored content", () => {
    const old = structuredClone(baseline);
    expect(experienceOf(old).slides).toHaveLength(3);
    expect(old.experience).toBeUndefined();
    expect(experienceOf(old).reviews).toEqual([]);
    expect(customerCopy("Gói mẫu")).toBe("");
    expect(customerCopy("Owner custom copy")).toBe("Owner custom copy");
  });
  it("custom legacy heading remains visible; explicit experience has priority", () => {
    const draft = structuredClone(baseline);
    draft.shop.title = "Owner heading";
    expect(experienceOf(draft).intro.title).toBe("Owner heading");
    draft.experience = structuredClone(defaultExperience);
    draft.experience.intro.title = "New heading";
    expect(experienceOf(draft).intro.title).toBe("New heading");
  });
  it("supports typed local experience but refuses unsupported staging writes", () => {
    const draft = {
      ...baseline,
      experience: structuredClone(defaultExperience),
    };
    expect(validateContent(draft, true).experience?.notices).toHaveLength(3);
    expect(() => validateContent(draft, false)).toThrow("migration");
  });
  it("rejects executable links, duplicate identities and unsafe media", () => {
    const draft = {
      ...baseline,
      experience: structuredClone(defaultExperience),
    };
    const slide = draft.experience.slides[0];
    const first = draft.experience.notices[0];
    const second = draft.experience.notices[1];
    if (!slide || !first || !second) throw Error("Missing fixtures");
    slide.href = "javascript:alert(1)";
    expect(() => validateContent(draft, true)).toThrow();
    slide.href = "/#san-pham";
    second.id = first.id;
    expect(() => validateContent(draft, true)).toThrow();
    second.id = "unique";
    slide.media = {
      src: "data:image/svg+xml;base64,AAAA",
      alt: "unsafe",
    };
    expect(() => validateContent(draft, true)).toThrow();
  });
  it("Telegram link allows only a plain HTTPS t.me username, never token/deep-link injection", () => {
    for (const url of [
      "http://t.me/valid_user",
      "https://t.me.evil.example/valid_user",
      "https://t.me/valid_user?start=secret",
      "https://user:pass@t.me/valid_user",
      "https://t.me/+invite",
      "https://t.me/valid_user#secret",
    ]) {
      const draft = {
        ...baseline,
        experience: { ...structuredClone(defaultExperience), telegramUrl: url },
      };
      expect(() => validateContent(draft, true)).toThrow();
    }
    expect(
      validateContent(
        {
          ...baseline,
          experience: {
            ...structuredClone(defaultExperience),
            telegramUrl: "https://t.me/valid_user",
          },
        },
        true,
      ).experience?.telegramUrl,
    ).toBe("https://t.me/valid_user");
  });
});
describe("email/code lookup only inside already-owned session", () => {
  const own = { id: "12345678-1234-4234-8234-123456789abc" };
  it("matches short or full code and normalizes local fixture email", () => {
    expect(findOwnedOrder([own], "12345678", localOrderEmail)).toEqual(own);
    expect(
      findOwnedOrder([own], own.id.toUpperCase(), " DEMO@BUYER.EXAMPLE "),
    ).toEqual(own);
  });
  it("unknown, wrong email, malformed and cross-session codes reveal nothing", () => {
    expect(findOwnedOrder([], own.id, localOrderEmail)).toBeUndefined();
    expect(findOwnedOrder([own], own.id, "other@example.com")).toBeUndefined();
    expect(findOwnedOrder([own], "1234", localOrderEmail)).toBeUndefined();
    expect(findOwnedOrder([own], "</script>", localOrderEmail)).toBeUndefined();
  });
  it("ambiguous prefix never picks the first order", () => {
    expect(
      findOwnedOrder(
        [own, { id: "12345678-aaaa-4aaa-8aaa-123456789abc" }],
        "12345678",
        localOrderEmail,
      ),
    ).toBeUndefined();
  });
});
