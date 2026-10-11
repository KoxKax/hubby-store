import { describe, expect, it } from "vitest";
import { getStorefrontContent } from "../app/content/fixtures";
import { validateContent } from "../app/content/schema";
import {
  createWorkspace,
  parseWorkspace,
  publishLocal,
  restoreLocal,
  saveLocalDraft,
} from "../app/domain/cms";
import { cartSubtotal, normalizeCart } from "../app/domain/demo-cart";
import { checkOrigin, safeNext } from "../app/domain/request-security";
import { dataConfig } from "../app/server/config.server";
import { imageKind } from "../app/server/media.server";
import type { HubbyEnv } from "../app/server/runtime-context.server";

const fresh = () => structuredClone(getStorefrontContent());
describe("CMS contract and sandbox", () => {
  it("keeps drafts private until publish and rollback creates a new immutable revision", () => {
    const baseline = createWorkspace(fresh());
    const edited = fresh();
    edited.announcement.text = "Banner thử mới";
    const draft = saveLocalDraft(baseline, edited, 0);
    expect(draft.publishedId).toBe("baseline");
    expect(baseline.revisions).toHaveLength(1);
    const published = publishLocal(draft, at(draft.revisions, 1).id);
    expect(
      published.revisions.find((r) => r.id === published.publishedId)?.snapshot
        .announcement.text,
    ).toBe("Banner thử mới");
    const restored = restoreLocal(published, "baseline");
    expect(restored.headVersion).toBe(2);
    expect(restored.publishedId).toBe(published.publishedId);
    expect(at(restored.revisions, 2).snapshot.announcement.text).toBe(
      at(baseline.revisions, 0).snapshot.announcement.text,
    );
    expect(parseWorkspace(JSON.parse(JSON.stringify(restored)))).toEqual(
      restored,
    );
    expect(() => saveLocalDraft(draft, edited, 0)).toThrow(/đã đổi/);
  });
  it("rejects injected keys, unsafe URLs, duplicate IDs, missing relations and bad amounts", () => {
    for (const mutate of [
      (p: ReturnType<typeof fresh>) => {
        p.announcement.href = "javascript:alert(1)";
      },
      (p: ReturnType<typeof fresh>) => {
        p.support.fanpageUrl = "https://user:pass@example.com";
      },
      (p: ReturnType<typeof fresh>) => {
        at(at(p.products, 1).variants).id = at(at(p.products, 0).variants).id;
      },
      (p: ReturnType<typeof fresh>) => {
        at(p.products, 0).category = "missing";
      },
      (p: ReturnType<typeof fresh>) => {
        at(at(p.products, 0).variants).priceVnd = 1.5;
      },
      (p: ReturnType<typeof fresh>) => {
        at(p.sections).productIds = ["absent"];
      },
    ]) {
      const p = fresh();
      mutate(p);
      expect(() => validateContent(p)).toThrow();
    }
    expect(() =>
      validateContent({ ...fresh(), secret_key: "not-allowed" }),
    ).toThrow();
    const image = fresh();
    at(image.products, 0).media = {
      src: "data:image/png;base64,iVBORw0KGgo=",
      alt: "Mẫu",
    };
    expect(() => validateContent(image)).toThrow(/local/);
    expect(() => validateContent(image, true)).not.toThrow();
  });
  it("uses the current CMS price/availability in demo cart, not stale fixtures", () => {
    const p = fresh();
    at(at(p.products, 0).variants).priceVnd = 100000;
    expect(cartSubtotal([{ variantId: "canva-1", quantity: 2 }], p)).toBe(
      200000,
    );
    at(at(p.products, 0).variants).stock = 0;
    expect(normalizeCart([{ variantId: "canva-1", quantity: 2 }], p)).toEqual(
      [],
    );
  });
});
describe("request and configuration safety", () => {
  it("rejects external and encoded open redirects", () => {
    for (const path of [
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
      "/%2f%2fevil.example",
      "/%5cevil.example",
      "/bad%0apath",
    ])
      expect(safeNext(path)).toBe("/tai-khoan");
    expect(safeNext("/admin?tab=products")).toBe("/admin?tab=products");
  });
  it("rejects missing/foreign Origin and non-POST", () => {
    for (const origin of [undefined, "https://evil.example"])
      expect(() =>
        checkOrigin(
          new Request("http://127.0.0.1:5174/admin", {
            method: "POST",
            headers: origin ? { Origin: origin } : {},
          }),
        ),
      ).toThrow();
    expect(() =>
      checkOrigin(
        new Request("http://127.0.0.1:5174/admin", {
          method: "POST",
          headers: { Origin: "http://127.0.0.1:5174" },
        }),
      ),
    ).not.toThrow();
  });
  it("does not connect by default and rejects production/service keys", () => {
    const base = {
      APP_ENV: "local",
      DATA_MODE: "fixtures",
      PAYMENTS_MODE: "mock",
      SUPPLIERS_MODE: "mock",
    } as HubbyEnv;
    expect(dataConfig(base)).toBeNull();
    const configured = {
      ...base,
      DATA_MODE: "supabase",
      SUPABASE_ENVIRONMENT: "staging",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
      SITE_ORIGIN: "http://127.0.0.1:5174",
    } as HubbyEnv;
    expect(dataConfig(configured)?.key).toBe("sb_publishable_test");
    expect(() =>
      dataConfig({ ...configured, APP_ENV: "production" }),
    ).toThrow();
    expect(() =>
      dataConfig({ ...configured, SUPABASE_PUBLISHABLE_KEY: "sb_secret_test" }),
    ).toThrow();
  });
  it("rejects SVG/HTML disguised as an image", () => {
    expect(
      imageKind(new TextEncoder().encode('<svg onload="evil()"></svg>')),
    ).toBeNull();
    expect(
      imageKind(Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0])),
    ).toBe("image/png");
  });
});

function at<T>(values: T[], index = 0): T {
  const value = values[index];
  if (value === undefined) throw new Error("Expected fixture row");
  return value;
}
