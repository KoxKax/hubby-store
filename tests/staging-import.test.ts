import { describe, expect, it } from "vitest";
import { defaultExperience } from "../app/content/experience";
import { getStorefrontContent } from "../app/content/fixtures";
import { initialStagingImportSql } from "../app/server/staging-import-plan";

describe("operator-only first staging content import", () => {
  it("escapes SQL literals and has untouched-target guards, no identity bypass", () => {
    const content = structuredClone(getStorefrontContent());
    content.brand.name = "Owner's $hubby_import_0$";
    const sql = initialStagingImportSql(content);
    expect(sql).toContain("Owner''s $hubby_import_0$");
    expect(sql).toContain("do $hubby_import_1$");
    expect(sql).toContain("doc.head_version<>0");
    expect(sql).toContain("exists(select 1 from auth.users)");
    expect(sql).toContain("staging_content_import");
    expect(sql).not.toContain("request.jwt.claims");
    expect(sql).not.toContain("insert into private.role_memberships");
    expect(sql).not.toContain("insert into public.cms_publications");
  });
  it("does not silently discard media or unverified public reviews", () => {
    const content = structuredClone(getStorefrontContent());
    content.announcement.media = {
      src: "/media/55555555-5555-4555-8555-555555555555",
      alt: "Owned",
    };
    expect(() => initialStagingImportSql(content)).toThrow(/media separately/);
    delete content.announcement.media;
    content.experience = structuredClone(defaultExperience);
    content.experience.reviews = [
      { id: "test", name: "Test", text: "Test", product: "Test" },
    ];
    expect(() => initialStagingImportSql(content)).toThrow(/verified-content/);
  });
});
