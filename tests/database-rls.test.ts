import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getStorefrontContent } from "../app/content/fixtures";

const OWNER = "11111111-1111-4111-8111-111111111111",
  A = "22222222-2222-4222-8222-222222222222",
  B = "33333333-3333-4333-8333-333333333333";
let pg: PGlite;
beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`create role anon;create role authenticated;create schema auth;create schema storage;
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
  await pg.exec("set hubby.environment='staging'");
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
