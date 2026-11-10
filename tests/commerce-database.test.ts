import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const owner = "11111111-1111-4111-8111-111111111111",
  a = "22222222-2222-4222-8222-222222222222",
  b = "33333333-3333-4333-8333-333333333333";
const oa = "44444444-4444-4444-8444-444444444444",
  ob = "55555555-5555-4555-8555-555555555555";
const issuer = "https://isolated-staging.supabase.co/auth/v1";
let pg: PGlite;
async function actor(
  id: string | null,
  role = "authenticated",
  extra: Record<string, unknown> = {},
) {
  await pg.exec(`reset role;set role ${role}`);
  await pg.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({
      sub: id,
      role,
      aal: "aal1",
      iss: issuer,
      is_anonymous: false,
      ...extra,
    }),
  ]);
}
async function operator() {
  await pg.exec("reset role");
}
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
  for (const name of [
    "202610110001_phase2",
    "20261011200620_staging_acl_hardening",
    "20261011201932_current_storefront_contract",
    "20261011211233_staging_owner_access_policy",
    "20261012104111_commerce_customer_foundation",
  ])
    await pg.exec(
      await readFile(
        new URL(`../supabase/migrations/${name}.sql`, import.meta.url),
        "utf8",
      ),
    );
  await pg.query(
    "insert into auth.users(id,email) values($1,'owner@example.test'),($2,'a@example.test'),($3,'b@example.test')",
    [owner, a, b],
  );
  await pg.query(
    "update private.role_memberships set role='owner' where user_id=$1",
    [owner],
  );
  await pg.query(
    "update private.owner_access_policy set password_only_issuer=$1",
    [issuer],
  );
  await pg.exec(`insert into public.products(catalog_key,slug,name,summary,status) values('qa-product','qa-product','Synthetic product','Synthetic only','published');
  insert into public.product_variants(product_id,variant_key,sku,label,price_vnd,demo_stock,enabled) select id,'qa-variant','QA-TEST','Synthetic plan',1000,0,true from public.products where catalog_key='qa-product';`);
  await pg.query(
    "insert into private.commerce_orders(id,user_id,code,subtotal_vnd,total_vnd,expires_at) values($1,$2,'HB1111111111111111',1000,1000,now()+interval '15 minutes'),($3,$4,'HB2222222222222222',1000,1000,now()+interval '15 minutes')",
    [oa, a, ob, b],
  );
  await pg.exec(
    "insert into private.commerce_order_items(order_id,variant_id,product_name,variant_label,quantity,price_vnd) select o.id,v.id,'Synthetic product','Synthetic plan',1,1000 from private.commerce_orders o cross join public.product_variants v",
  );
});
afterAll(async () => {
  await pg?.close();
});
describe("real commerce/support SQL foundation: no live checkout API", () => {
  it("customer projection is owned, redacted and not authorized by metadata", async () => {
    await actor(a, "authenticated", { user_metadata: { role: "owner" } });
    const result = await pg.query<{ p: { orders: Array<{ id: string }> } }>(
      "select public.customer_space() as p",
    );
    expect(result.rows[0]?.p.orders.map((x) => x.id)).toEqual([oa]);
    expect(JSON.stringify(result.rows)).not.toMatch(
      /user_id|email|ciphertext|request_key/,
    );
    expect(
      (await pg.query("select public.customer_order($1::uuid) as p", [ob]))
        .rows,
    ).toEqual([{ p: null }]);
    await expect(
      pg.exec("select public.commerce_admin_space()"),
    ).rejects.toThrow(/Owner required/);
    await actor(b);
    expect(
      (await pg.query("select public.customer_order($1::uuid) as p", [oa]))
        .rows,
    ).toEqual([{ p: null }]);
  });
  it("anon, anonymous Auth and revoked membership cannot access customer data", async () => {
    await actor(null, "anon");
    await expect(pg.exec("select public.customer_space()")).rejects.toThrow(
      /permission denied/,
    );
    await actor(a, "authenticated", { is_anonymous: true });
    await expect(pg.exec("select public.customer_space()")).rejects.toThrow(
      /Verified account/,
    );
    await operator();
    await pg.query(
      "update private.role_memberships set revoked_at=now() where user_id=$1",
      [a],
    );
    await actor(a);
    await expect(pg.exec("select public.customer_space()")).rejects.toThrow(
      /Verified account/,
    );
    await operator();
    await pg.query(
      "update private.role_memberships set revoked_at=null where user_id=$1",
      [a],
    );
  });
  it("private tables and projection helper cannot be called even by Owner", async () => {
    await actor(owner);
    for (const name of [
      "commerce_orders",
      "commerce_order_items",
      "commerce_payments",
      "support_tickets",
      "support_messages",
      "community_submissions",
    ])
      await expect(pg.exec(`select * from private.${name}`)).rejects.toThrow(
        /permission denied/,
      );
    await expect(
      pg.query("select private.commerce_order_projection($1::uuid)", [oa]),
    ).rejects.toThrow(/permission denied/);
    await expect(
      pg.exec(
        "insert into private.commerce_payments(order_id,provider,provider_transaction,amount_vnd,direction,verification_state) values('44444444-4444-4444-8444-444444444444','sepay','forged',1000,'in','verified')",
      ),
    ).rejects.toThrow(/permission denied/);
  });
  it("ticket insert is atomic, idempotent, owned; Owner reply uses CAS", async () => {
    const key = crypto.randomUUID();
    await actor(a);
    const args = [key, oa, "Synthetic support", "Synthetic support message"];
    const query =
      "select public.create_support_ticket($1::uuid,$2::uuid,$3,$4) as id";
    const created = await pg.query<{ id: string }>(query, args);
    const id = created.rows[0]?.id;
    expect((await pg.query(query, args)).rows).toEqual(created.rows);
    await expect(
      pg.query(query, [
        key,
        oa,
        "Synthetic support",
        "Different support message",
      ]),
    ).rejects.toThrow(/Idempotency conflict/);
    await expect(
      pg.query(query, [
        crypto.randomUUID(),
        ob,
        "Wrong order",
        "Synthetic message",
      ]),
    ).rejects.toThrow(/Order not accessible/);
    await actor(b);
    expect(
      JSON.stringify(
        (await pg.query("select public.customer_space() as p")).rows,
      ),
    ).not.toContain("Synthetic support message");
    await actor(owner);
    expect(
      (
        await pg.query(
          "select public.reply_support($1::uuid,1,'Synthetic owner reply',true) as v",
          [id],
        )
      ).rows,
    ).toEqual([{ v: 2 }]);
    await expect(
      pg.query(
        "select public.reply_support($1::uuid,1,'Duplicate owner reply',true)",
        [id],
      ),
    ).rejects.toThrow(/Ticket changed/);
    await actor(a);
    const space = await pg.query<{
      p: { tickets: Array<{ state: string; messages: unknown[] }> };
    }>("select public.customer_space() as p");
    expect(space.rows[0]?.p.tickets[0]?.state).toBe("closed");
    expect(space.rows[0]?.p.tickets[0]?.messages).toHaveLength(2);
  });
  it("feedback/reviews accept bounded anonymous writes with no public reads or testimonials", async () => {
    const key = crypto.randomUUID();
    await actor(null, "anon");
    const query =
      "select public.submit_community($1::uuid,'feedback','idea',$2) as ok";
    const args = [key, "Synthetic feedback only"];
    expect((await pg.query(query, args)).rows).toEqual([{ ok: true }]);
    expect((await pg.query(query, args)).rows).toEqual([{ ok: true }]);
    await expect(
      pg.query(query, [key, "Changed feedback message"]),
    ).rejects.toThrow(/Idempotency conflict/);
    await expect(
      pg.query(
        "select public.submit_community($1::uuid,'review','review','Synthetic review','missing',5)",
        [crypto.randomUUID()],
      ),
    ).rejects.toThrow(/Invalid review/);
    await expect(
      pg.exec("select public.commerce_admin_space()"),
    ).rejects.toThrow(/permission denied/);
    await actor(owner);
    const result = await pg.query<{
      p: { submissions: Array<{ id: string; message: string; state: string }> };
    }>("select public.commerce_admin_space() as p");
    const row = result.rows[0]?.p.submissions.find(
      (x) => x.message === args[1],
    );
    expect(row?.state).toBe("new");
    await pg.query("select public.review_submission($1::uuid)", [row?.id]);
    await actor(a);
    await expect(
      pg.query("select public.review_submission($1::uuid)", [row?.id]),
    ).rejects.toThrow(/Owner required/);
  });
  it("global anonymous quota cannot be bypassed by new idempotency keys", async () => {
    await operator();
    await pg.exec("begin");
    await pg.exec(
      "insert into private.community_submissions(request_key,kind,category,body) select gen_random_uuid(),'feedback','idea','Synthetic quota fixture' from generate_series(1,100)",
    );
    await actor(null, "anon");
    await expect(
      pg.query(
        "select public.submit_community($1::uuid,'feedback','idea','Synthetic over quota')",
        [crypto.randomUUID()],
      ),
    ).rejects.toThrow(/Submission limit/);
    await pg.exec("rollback");
  });
  it("wrong issuer or revoked Owner cannot access operations", async () => {
    await actor(owner, "authenticated", {
      iss: "https://other.supabase.co/auth/v1",
    });
    await expect(
      pg.exec("select public.commerce_admin_space()"),
    ).rejects.toThrow(/Owner required/);
    await operator();
    await pg.query(
      "update private.role_memberships set revoked_at=now() where user_id=$1",
      [owner],
    );
    await actor(owner);
    await expect(
      pg.exec("select public.commerce_admin_space()"),
    ).rejects.toThrow(/Owner required/);
    await operator();
    await pg.query(
      "update private.role_memberships set revoked_at=null where user_id=$1",
      [owner],
    );
  });
  it("new public RPCs are invoker and ledger rejects duplicate provider transactions", async () => {
    await operator();
    const funcs = await pg.query<{ n: number }>(
      "select count(*)::int as n from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='public' and p.proname in ('customer_space','customer_order','create_support_ticket','submit_community','commerce_admin_space','reply_support','review_submission') and not p.prosecdef",
    );
    expect(funcs.rows[0]?.n).toBe(7);
    await pg.query(
      "insert into private.commerce_payments(order_id,provider,provider_transaction,amount_vnd,direction,verification_state) values($1,'sepay','synthetic-verified',1000,'in','verified')",
      [oa],
    );
    await expect(
      pg.query(
        "insert into private.commerce_payments(order_id,provider,provider_transaction,amount_vnd,direction,verification_state) values($1,'sepay','synthetic-verified',1000,'in','verified')",
        [oa],
      ),
    ).rejects.toThrow(/unique constraint/);
    await actor(a);
    const result = await pg.query<{ p: { paid: number } }>(
      "select public.customer_order($1::uuid) as p",
      [oa],
    );
    expect(result.rows[0]?.p.paid).toBe(1000);
  });
});
