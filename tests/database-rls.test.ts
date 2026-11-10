import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { defaultExperience } from "../app/content/experience";
import { getStorefrontContent } from "../app/content/fixtures";
import { applyOwnerCatalog } from "../app/content/owner-catalog";
import { initialStagingImportSql } from "../app/server/staging-import-plan";

const OWNER = "11111111-1111-4111-8111-111111111111",
  A = "22222222-2222-4222-8222-222222222222",
  B = "33333333-3333-4333-8333-333333333333";
let pg: PGlite;
beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema storage;
 alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;
 create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
 create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb)$$;
 create function auth.uid() returns uuid language sql stable as $$select nullif(auth.jwt()->>'sub','')::uuid$$;
 grant usage on schema public,auth,storage to anon,authenticated;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text);
 alter table storage.objects enable row level security;grant select,insert on storage.objects to anon,authenticated;`);
  await pg.exec(
    await readFile(
      new URL(
        "../supabase/migrations/202610110001_phase2.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await pg.exec(
    await readFile(
      new URL(
        "../supabase/migrations/20261011200620_staging_acl_hardening.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await pg.exec("set hubby.environment='staging'");
  await pg.exec(
    await readFile(
      new URL(
        "../supabase/migrations/20261011201932_current_storefront_contract.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  // Exercise the actual first-content bootstrap in a rolled-back transaction.
  await pg.exec(
    await readFile(
      new URL(
        "../supabase/migrations/20261011211233_staging_owner_access_policy.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await pg.exec(
    await readFile(
      new URL(
        "../supabase/migrations/20261012111208_cms_safe_publication.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  // Historical fixtures remain regression data, never the remote import source.
  const imported = applyOwnerCatalog(getStorefrontContent());
  imported.brand.name = "Owner's $hubby_import_0$";
  const bootstrap = initialStagingImportSql(imported)
    .replace(/^begin;/, "")
    .replace(/commit;$/, "");
  await pg.exec("begin");
  await pg.exec(bootstrap);
  expect(
    (await pg.query("select count(*)::int as n from public.products")).rows,
  ).toEqual([{ n: 6 }]);
  expect(
    (
      await pg.query(
        "select count(*)::int as n from public.product_variants where not price_configured",
      )
    ).rows,
  ).toEqual([{ n: 7 }]);
  expect(
    (await pg.query("select public.published_storefront() as p")).rows[0],
  ).toHaveProperty("p.brand.name", imported.brand.name);
  expect(
    (await pg.query("select count(*)::int as n from public.cms_publications"))
      .rows,
  ).toEqual([{ n: 0 }]);
  expect(
    (await pg.query("select actor_id,action from private.cms_audit")).rows,
  ).toEqual([{ actor_id: null, action: "staging_content_import" }]);
  await pg.exec("savepoint duplicate_import");
  await expect(pg.exec(bootstrap)).rejects.toThrow(/untouched staging/);
  await pg.exec("rollback");
  await pg.exec(
    await readFile(new URL("../supabase/seed.sql", import.meta.url), "utf8"),
  );
  await pg.query(
    "insert into auth.users(id,email,raw_user_meta_data) values ($1,'owner@example.test','{}'),($2,'a@example.test','{\"role\":\"owner\"}'),($3,'b@example.test','{}')",
    [OWNER, A, B],
  );
  await pg.query(
    "update private.role_memberships set role='owner' where user_id=$1",
    [OWNER],
  );
}, 15_000);
afterAll(async () => {
  await pg?.close();
});
async function actor<T>(
  user: string | null,
  aal: string,
  fn: () => Promise<T>,
) {
  await pg.exec(`begin;set local role ${user ? "authenticated" : "anon"}`);
  await pg.query("select set_config('request.jwt.claims',$1,true)", [
    JSON.stringify(
      user
        ? {
            sub: user,
            aal,
            role: "authenticated",
            user_metadata: { role: "owner" },
          }
        : { role: "anon" },
    ),
  ]);
  try {
    return await fn();
  } finally {
    await pg.exec("rollback");
  }
}
async function denied(work: () => Promise<unknown>) {
  await pg.exec("savepoint denial_check");
  try {
    await expect(work()).rejects.toMatchObject({ code: "42501" });
  } finally {
    await pg.exec("rollback to savepoint denial_check");
  }
}
describe("real PostgreSQL migration/RLS with test Auth/Storage stubs", () => {
  it("staging password-only policy stays private and cannot authorize customers or other issuers", async () => {
    const issuer = "https://isolated-staging.supabase.co/auth/v1";
    await pg.query(
      "update private.owner_access_policy set password_only_issuer=$1 where singleton",
      [issuer],
    );
    try {
      for (const [user, tokenIssuer, allowed] of [
        [OWNER, issuer, true],
        [A, issuer, false],
        [OWNER, "https://other.supabase.co/auth/v1", false],
        [OWNER, "", false],
      ] as const) {
        await actor(user, "aal1", async () => {
          await pg.query("select set_config('request.jwt.claims',$1,true)", [
            JSON.stringify({
              sub: user,
              role: "authenticated",
              aal: "aal1",
              iss: tokenIssuer,
            }),
          ]);
          expect(
            (await pg.query("select public.hubby_owner() as allowed")).rows,
          ).toEqual([{ allowed }]);
          expect(
            (await pg.query("select * from public.cms_revisions")).rows.length >
              0,
          ).toBe(allowed);
          await denied(() =>
            pg.query(
              "update private.owner_access_policy set password_only_issuer=null",
            ),
          );
          await denied(() =>
            pg.query("select * from private.owner_access_policy"),
          );
          if (allowed) {
            await pg.query("select public.save_cms_draft($1::jsonb,1)", [
              JSON.stringify(getStorefrontContent()),
            ]);
            await pg.query(
              "insert into storage.objects(bucket_id,name) values('hubby-media',$1)",
              [`${OWNER}/stage-asset.png`],
            );
          } else {
            await denied(() =>
              pg.query("select public.save_cms_draft($1::jsonb,1)", [
                JSON.stringify(getStorefrontContent()),
              ]),
            );
          }
        });
      }
      await actor(OWNER, "aal1", async () => {
        await pg.query("select set_config('request.jwt.claims',$1,true)", [
          JSON.stringify({
            sub: OWNER,
            role: "authenticated",
            aal: "aal1",
            user_metadata: { iss: issuer, mfa_required: false },
          }),
        ]);
        expect(
          (await pg.query("select public.hubby_owner() as allowed")).rows,
        ).toEqual([{ allowed: false }]);
      });
      await pg.query(
        "update private.role_memberships set revoked_at=now() where user_id=$1",
        [OWNER],
      );
      await actor(OWNER, "aal1", async () => {
        await pg.query("select set_config('request.jwt.claims',$1,true)", [
          JSON.stringify({
            sub: OWNER,
            role: "authenticated",
            aal: "aal1",
            iss: issuer,
          }),
        ]);
        expect(
          (await pg.query("select public.hubby_owner() as allowed")).rows,
        ).toEqual([{ allowed: false }]);
      });
    } finally {
      await pg.exec(
        "update private.owner_access_policy set password_only_issuer=null",
      );
      await pg.query(
        "update private.role_memberships set revoked_at=null where user_id=$1",
        [OWNER],
      );
    }
  });
  it("retains qualified UPDATEs for hosted pg-safeupdate without disabling guards", async () => {
    const result = await pg.query<{ source: string }>(
      "select pg_get_functiondef('private.materialize_storefront_base(jsonb)'::regprocedure) as source",
    );
    const source = result.rows[0]?.source ?? "";
    expect(source).toContain("where enabled=true");
    expect(source).toContain("where status<>'archived'");
    expect(source).not.toMatch(
      /set\s+(?:enabled=false|status='archived')\s*;/i,
    );
    expect(source).not.toMatch(/set_config|safeupdate\s*=/i);
  });
  it("publishes current terms, unpriced variants and experience without changing old history", async () => {
    await actor(OWNER, "aal2", async () => {
      const current = applyOwnerCatalog(getStorefrontContent());
      current.experience = structuredClone(defaultExperience);
      const draft = (
        await pg.query<{ id: string }>(
          "select public.save_cms_draft($1::jsonb,1) as id",
          [JSON.stringify(current)],
        )
      ).rows[0]?.id;
      await pg.query("select public.publish_cms_revision($1,2)", [draft]);
      expect(
        (
          await pg.query(
            "select count(*)::int as n from public.product_variants where enabled and not price_configured",
          )
        ).rows,
      ).toEqual([{ n: 7 }]);
      expect(
        (
          await pg.query(
            "select terms->>'warranty' as warranty from public.products where catalog_key='google'",
          )
        ).rows,
      ).toEqual([{ warranty: "Không bảo hành" }]);
      expect(
        (
          await pg.query(
            "select payload ? 'experience' as extended from public.cms_revisions where version=1",
          )
        ).rows,
      ).toEqual([{ extended: false }]);
      expect(
        (await pg.query("select public.published_storefront() as p")).rows[0],
      ).toHaveProperty(
        "p.experience.intro.title",
        current.experience.intro.title,
      );
    });
  });
  it("validates extensions at raw RPC boundary, not just the application", async () => {
    const current = applyOwnerCatalog(getStorefrontContent());
    current.experience = structuredClone(defaultExperience);
    const raw = JSON.parse(JSON.stringify(current));
    const cases = [
      { ...raw, injected: true },
      {
        ...raw,
        experience: { ...raw.experience, activityNotifications: "true" },
      },
      {
        ...raw,
        experience: {
          ...raw.experience,
          telegramUrl: "https://t.me/owner_name?unsafe=1",
        },
      },
      {
        ...raw,
        experience: {
          ...raw.experience,
          notices: [{ id: "unsafe", text: "Unsafe", href: "//evil.example" }],
        },
      },
      {
        ...raw,
        experience: {
          ...raw.experience,
          slides: [
            {
              id: "unsafe",
              title: "Unsafe",
              description: "Unsafe",
              theme: "mint",
              href: "/",
              media: {
                src: "data:image/png;base64,iVBORw0KGgo=",
                alt: "Unsafe",
              },
            },
          ],
        },
      },
      {
        ...raw,
        experience: {
          ...raw.experience,
          reviews: [
            { id: "duplicate", name: "Test", text: "Test", product: "Test" },
            { id: "duplicate", name: "Test", text: "Test", product: "Test" },
          ],
        },
      },
      {
        ...raw,
        products: raw.products.map((p: Record<string, unknown>) => ({
          ...p,
          terms: {
            warranty: "Test",
            receipt: "Test",
            activationNote: "Test",
            injected: true,
          },
        })),
      },
      {
        ...raw,
        products: raw.products.map((p: Record<string, unknown>) => ({
          ...p,
          variants: [
            {
              id: "bad",
              label: "Bad",
              priceVnd: 0,
              stock: 0,
              priceConfigured: null,
            },
          ],
        })),
      },
    ];
    for (const invalid of cases) {
      await actor(OWNER, "aal2", async () => {
        await expect(
          pg.query("select public.save_cms_draft($1::jsonb,1)", [
            JSON.stringify(invalid),
          ]),
        ).rejects.toThrow();
      });
    }
    for (const name of [
      "cms_valid",
      "cms_valid_base",
      "materialize_storefront",
      "materialize_storefront_base",
      "cms_media_valid",
      "cms_media_ids",
    ]) {
      expect(
        (
          await pg.query(
            "select has_function_privilege('authenticated',$1,'EXECUTE') as allowed",
            [`private.${name}(jsonb)`],
          )
        ).rows,
      ).toEqual([{ allowed: false }]);
    }
  });
  it("publishes only referenced banner media and revokes it after removal", async () => {
    await actor(OWNER, "aal2", async () => {
      const asset = "55555555-5555-4555-8555-555555555555";
      const path = `${OWNER}/${asset}.png`;
      await pg.query(
        "insert into public.media_assets(id,object_path,mime,byte_size,alt,source_license,checksum,uploaded_by) values($1,$2,'image/png',12,'Banner','Synthetic',repeat('0',64),$3)",
        [asset, path, OWNER],
      );
      const current = structuredClone(getStorefrontContent());
      current.experience = structuredClone(defaultExperience);
      current.announcement.media = { src: `/media/${asset}`, alt: "Banner" };
      await pg.exec("savepoint missing_object");
      await expect(
        pg.query("select public.save_cms_draft($1::jsonb,1)", [
          JSON.stringify(current),
        ]),
      ).rejects.toThrow(/Missing media object/);
      await pg.exec("rollback to savepoint missing_object");
      await pg.query(
        "insert into storage.objects(bucket_id,name) values('hubby-media',$1)",
        [path],
      );
      at(current.experience.slides).media = current.announcement.media;
      const draft = (
        await pg.query<{ id: string }>(
          "select public.save_cms_draft($1::jsonb,1) as id",
          [JSON.stringify(current)],
        )
      ).rows[0]?.id;
      await pg.query("select public.publish_cms_revision($1,2)", [draft]);
      expect(
        (
          await pg.query("select status from public.media_assets where id=$1", [
            asset,
          ])
        ).rows,
      ).toEqual([{ status: "published" }]);
      const next = (
        await pg.query<{ id: string }>(
          "select public.save_cms_draft($1::jsonb,2) as id",
          [JSON.stringify(getStorefrontContent())],
        )
      ).rows[0]?.id;
      await pg.query("select public.publish_cms_revision($1,3)", [next]);
      await pg.exec("set local role anon");
      await pg.query("select set_config('request.jwt.claims','{}',true)");
      expect((await pg.query("select * from storage.objects")).rows).toEqual(
        [],
      );
      expect(
        (await pg.query("select * from public.media_assets")).rows,
      ).toEqual([]);
    });
  });
  it("overrides provider default grants and keeps privileged implementations out of public", async () => {
    const functions = await pg.query<{ proname: string; prosecdef: boolean }>(
      "select p.proname,p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'",
    );
    expect(functions.rows).toHaveLength(6);
    expect(functions.rows.every((p) => !p.prosecdef)).toBe(true);
    for (const schema of ["public", "private"]) {
      for (const signature of [
        "save_cms_draft(jsonb,integer)",
        "restore_cms_draft(uuid,integer)",
        "publish_cms_revision(uuid,integer)",
      ]) {
        const privileges = await pg.query<{ anon: boolean; customer: boolean }>(
          "select has_function_privilege('anon',$1,'EXECUTE') as anon,has_function_privilege('authenticated',$1,'EXECUTE') as customer",
          [`${schema}.${signature}`],
        );
        expect(privileges.rows).toEqual([{ anon: false, customer: true }]);
      }
    }
    await actor(A, "aal2", async () => {
      await denied(() =>
        pg.query("select private.save_cms_draft('{}'::jsonb,1)"),
      );
      await denied(() => pg.query("select * from private.cms_audit"));
      await denied(() =>
        pg.query("select private.materialize_storefront('{}'::jsonb)"),
      );
    });
  });
  it("keeps draft files private and exposes only referenced published media", async () => {
    await actor(OWNER, "aal2", async () => {
      const asset = "44444444-4444-4444-8444-444444444444",
        path = `${OWNER}/${asset}.png`;
      await pg.query(
        "insert into public.media_assets(id,object_path,mime,byte_size,alt,source_license,checksum,uploaded_by) values($1,$2,'image/png',12,'Test image','Synthetic test',repeat('0',64),$3)",
        [asset, path, OWNER],
      );
      await pg.query(
        "insert into storage.objects(bucket_id,name) values('hubby-media',$1)",
        [path],
      );
      await denied(() =>
        pg.query(
          "update public.media_assets set status='published' where id=$1",
          [asset],
        ),
      );
      await pg.exec("set local role anon");
      await pg.query("select set_config('request.jwt.claims','{}',true)");
      expect(
        (await pg.query("select * from public.media_assets")).rows,
      ).toHaveLength(0);
      expect(
        (await pg.query("select * from storage.objects")).rows,
      ).toHaveLength(0);
      await pg.exec("set local role authenticated");
      await pg.query("select set_config('request.jwt.claims',$1,true)", [
        JSON.stringify({ sub: OWNER, aal: "aal2" }),
      ]);
      const snapshot = structuredClone(getStorefrontContent());
      at(snapshot.products).media = {
        src: `/media/${asset}`,
        alt: "Test image",
      };
      const revision = at(
        (
          await pg.query<{ id: string }>(
            "select public.save_cms_draft($1::jsonb,1) as id",
            [JSON.stringify(snapshot)],
          )
        ).rows,
      ).id;
      await pg.query("select public.publish_cms_revision($1,2)", [revision]);
      await pg.exec("set local role anon");
      await pg.query("select set_config('request.jwt.claims','{}',true)");
      expect(
        (await pg.query("select * from public.media_assets")).rows,
      ).toHaveLength(1);
      expect(
        (await pg.query("select * from storage.objects")).rows,
      ).toHaveLength(1);
    });
  });
  it.each([A, B])(
    "isolates customer %s in both directions and rejects identity changes",
    async (user) => {
      await actor(user, "aal2", async () => {
        const other = user === A ? B : A;
        expect((await pg.query("select id from public.profiles")).rows).toEqual(
          [{ id: user }],
        );
        expect(
          (
            await pg.query(
              "update public.profiles set display_name='other' where id=$1 returning id",
              [other],
            )
          ).rows,
        ).toHaveLength(0);
        await denied(() =>
          pg.query("update public.profiles set id=$1 where id=$2", [
            other,
            user,
          ]),
        );
        const product = at(
          (
            await pg.query<{ id: string }>(
              "select id from public.products limit 1",
            )
          ).rows,
        ).id;
        await pg.query(
          "insert into public.wishlists(user_id,product_id) values($1,$2)",
          [user, product],
        );
        expect(
          (await pg.query("select user_id from public.wishlists")).rows,
        ).toEqual([{ user_id: user }]);
      });
    },
  );
  it("rolls back the entire publication when a variant tries to switch product", async () => {
    await actor(OWNER, "aal2", async () => {
      const snapshot = structuredClone(getStorefrontContent());
      const moved = at(at(snapshot.products, 1).variants);
      at(snapshot.products).variants = [moved];
      at(snapshot.products, 1).variants = at(
        snapshot.products,
        1,
      ).variants.filter((v) => v.id !== moved.id);
      const revision = at(
        (
          await pg.query<{ id: string }>(
            "select public.save_cms_draft($1::jsonb,1) as id",
            [JSON.stringify(snapshot)],
          )
        ).rows,
      ).id;
      await pg.exec("savepoint failing_publish");
      await expect(
        pg.query("select public.publish_cms_revision($1,2)", [revision]),
      ).rejects.toThrow(/cannot change product/);
      await pg.exec("rollback to savepoint failing_publish");
      expect(
        (await pg.query("select status from public.products")).rows.every(
          (row) => (row as { status: string }).status === "published",
        ),
      ).toBe(true);
      expect(
        (await pg.query("select public.published_storefront() as p")).rows[0],
      ).toHaveProperty("p.revision", "db-1");
    });
  });
  it("anonymous sees published catalog, not profiles, draft history or private memberships", async () => {
    await actor(null, "aal1", async () => {
      expect(
        (await pg.query("select * from public.products")).rows,
      ).toHaveLength(4);
      expect(
        (await pg.query("select public.published_storefront() as content"))
          .rows[0],
      ).toHaveProperty("content.schemaVersion", 2);
      await denied(() => pg.query("select * from public.profiles"));
      await denied(() => pg.query("select * from private.role_memberships"));
      await denied(() =>
        pg.query("select public.save_cms_draft($1::jsonb,1)", [
          JSON.stringify(getStorefrontContent()),
        ]),
      );
    });
  });
  it("A cannot read/update B, spoof membership or insert another user's wishlist", async () => {
    await actor(A, "aal2", async () => {
      expect(
        (await pg.query("select * from public.profiles")).rows,
      ).toHaveLength(1);
      expect(
        (await pg.query("select * from public.cms_revisions")).rows,
      ).toHaveLength(0);
      expect(
        (await pg.query("select public.owner_status() as status")).rows[0],
      ).toHaveProperty("status.owner", false);
      expect(
        (
          await pg.query(
            "update public.profiles set display_name='hacked' where id=$1 returning id",
            [B],
          )
        ).rows,
      ).toHaveLength(0);
      const product = (
        await pg.query<{ id: string }>("select id from public.products limit 1")
      ).rows[0]?.id;
      await expect(
        pg.query(
          "insert into public.wishlists(user_id,product_id) values($1,$2)",
          [B, product],
        ),
      ).rejects.toThrow();
    });
  });
  it("Owner AAL1 cannot read draft history or mutate CMS", async () => {
    await actor(OWNER, "aal1", async () => {
      expect(
        (await pg.query("select * from public.cms_revisions")).rows,
      ).toHaveLength(0);
      await expect(
        pg.query("select public.save_cms_draft($1::jsonb,1)", [
          JSON.stringify(getStorefrontContent()),
        ]),
      ).rejects.toThrow(/AAL2/);
    });
  });
  it("Owner AAL2 saves draft without publishing, publishes atomically and restores as new revision", async () => {
    await actor(OWNER, "aal2", async () => {
      const content = structuredClone(getStorefrontContent());
      content.announcement.text = "SQL banner test";
      at(at(content.products, 0).variants).priceVnd = 99000;
      const draft = (
        await pg.query<{ id: string }>(
          "select public.save_cms_draft($1::jsonb,1) as id",
          [JSON.stringify(content)],
        )
      ).rows[0]?.id;
      expect(
        (await pg.query("select public.published_storefront() as p")).rows[0],
      ).not.toHaveProperty("p.announcement.text", "SQL banner test");
      await pg.query("select public.publish_cms_revision($1,2)", [draft]);
      expect(
        (await pg.query("select public.published_storefront() as p")).rows[0],
      ).toHaveProperty("p.announcement.text", "SQL banner test");
      expect(
        (
          await pg.query(
            "select price_vnd from public.product_variants where variant_key='canva-1'",
          )
        ).rows[0],
      ).toHaveProperty("price_vnd", 99000);
      await pg.query("select public.publish_cms_revision($1,2)", [draft]);
      expect(
        (await pg.query("select * from public.cms_publications")).rows,
      ).toHaveLength(1);
      const old = (
        await pg.query<{ id: string }>(
          "select id from public.cms_revisions where version=1",
        )
      ).rows[0]?.id;
      await pg.query("select public.restore_cms_draft($1,2)", [old]);
      expect(
        (await pg.query("select * from public.cms_revisions")).rows,
      ).toHaveLength(3);
      expect(
        (await pg.query("select public.published_storefront() as p")).rows[0],
      ).toHaveProperty("p.announcement.text", "SQL banner test");
    });
  });
  it("rejects stale writes and mutation of immutable history", async () => {
    await actor(OWNER, "aal2", async () => {
      await expect(
        pg.query("select public.save_cms_draft($1::jsonb,0)", [
          JSON.stringify(getStorefrontContent()),
        ]),
      ).rejects.toThrow(/conflict/);
    });
    await expect(
      pg.exec("update public.cms_revisions set version=99"),
    ).rejects.toThrow(/Immutable/);
  });
  it("rejects malformed raw RPC payload, including unsafe URLs and null art", async () => {
    for (const modify of [
      (p: ReturnType<typeof getStorefrontContent>) => {
        p.announcement.href = "javascript:alert(1)";
      },
      (p: ReturnType<typeof getStorefrontContent>) => {
        at(at(p.products, 1).variants).id = at(at(p.products, 0).variants).id;
      },
    ]) {
      const content = structuredClone(getStorefrontContent());
      modify(content);
      await actor(OWNER, "aal2", async () => {
        await expect(
          pg.query("select public.save_cms_draft($1::jsonb,1)", [
            JSON.stringify(content),
          ]),
        ).rejects.toThrow();
      });
    }
    const invalid = {
      ...getStorefrontContent(),
      products: getStorefrontContent().products.map((product) => ({
        ...product,
        art: null,
      })),
    };
    await actor(OWNER, "aal2", async () => {
      await expect(
        pg.query("select public.save_cms_draft($1::jsonb,1)", [
          JSON.stringify(invalid),
        ]),
      ).rejects.toThrow();
    });
  });
  it("rechecks revoked Owner membership rather than JWT metadata", async () => {
    await pg.query(
      "update private.role_memberships set revoked_at=now() where user_id=$1",
      [OWNER],
    );
    try {
      await actor(OWNER, "aal2", async () => {
        expect(
          (await pg.query("select public.hubby_owner() as allowed")).rows[0],
        ).toHaveProperty("allowed", false);
      });
    } finally {
      await pg.query(
        "update private.role_memberships set revoked_at=null where user_id=$1",
        [OWNER],
      );
    }
  });
  it("enforces private draft media and Owner AAL2 upload policy", async () => {
    await actor(null, "aal1", async () => {
      expect(
        (await pg.query("select * from public.media_assets")).rows,
      ).toHaveLength(0);
      await expect(
        pg.query(
          "insert into storage.objects(bucket_id,name) values('hubby-media','arbitrary/file.png')",
        ),
      ).rejects.toThrow();
    });
    await actor(OWNER, "aal1", async () => {
      await expect(
        pg.query(
          "insert into storage.objects(bucket_id,name) values('hubby-media',$1)",
          [`${OWNER}/asset.png`],
        ),
      ).rejects.toThrow();
    });
    await actor(OWNER, "aal2", async () => {
      expect(
        (
          await pg.query(
            "insert into storage.objects(bucket_id,name) values('hubby-media',$1) returning id",
            [`${OWNER}/asset.png`],
          )
        ).rows,
      ).toHaveLength(1);
    });
  });
});

function at<T>(values: T[], index = 0): T {
  const value = values[index];
  if (value === undefined) throw new Error("Expected fixture row");
  return value;
}
