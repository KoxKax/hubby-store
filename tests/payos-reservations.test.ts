import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let pg: PGlite;
const requestKey = "aaaa1111-aaaa-4111-8111-aaaa1111aaaa";
const guestHash = "a".repeat(64);
const email = "customer@example.test";
const line = [{ variantKey: "qa-variant", quantity: 1 }];

async function act(role: "service_role" | "anon" | "authenticated") {
  await pg.exec(`reset role;set role ${role}`);
  await pg.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({ role }),
  ]);
}
async function operator() {
  await pg.exec("reset role");
}
async function reserve(key: string, items: unknown = line, address = email) {
  const result = await pg.query<{ value: Record<string, unknown> }>(
    "select public.reserve_payos_checkout($1::uuid,$2,$3,$4::jsonb,null) as value",
    [key, address, guestHash, JSON.stringify(items)],
  );
  return result.rows[0]?.value;
}

async function reserveForUser(key: string, userId: string, address: string) {
  return pg.query(
    "select public.reserve_payos_checkout($1::uuid,$2,$3,$4::jsonb,$5::uuid)",
    [key, address, guestHash, JSON.stringify(line), userId],
  );
}

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
    create function auth.jwt() returns jsonb language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb)$$;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(auth.jwt()->>'sub','')::uuid$$;
    grant usage on schema public,auth,storage to anon,authenticated,service_role;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text);
    alter table storage.objects enable row level security;`);
  for (const migration of [
    "202610110001_phase2",
    "20261011200620_staging_acl_hardening",
    "20261011201932_current_storefront_contract",
    "20261011211233_staging_owner_access_policy",
    "20261012104111_commerce_customer_foundation",
    "20261026135651_payos_settlement_foundation",
    "20261026151418_commerce_payos_reservations",
  ])
    await pg.exec(
      await readFile(
        new URL(`../supabase/migrations/${migration}.sql`, import.meta.url),
        "utf8",
      ),
    );
  await pg.exec(`insert into public.products(catalog_key,slug,name,summary,status)
    values('qa-product','qa-product','Test product','Test item','published');
    insert into public.product_variants(product_id,variant_key,sku,label,price_vnd,demo_stock,enabled)
    select id,'qa-variant','QA-VARIANT','Test plan',49000,999,true
    from public.products where catalog_key='qa-product';`);
});

afterAll(async () => pg?.close());

describe("transactional payOS checkout reservations in isolated PostgreSQL", () => {
  it("rejects unconfirmed or mismatched signed-in identities at the database boundary", async () => {
    const userId = "20202020-2020-4020-8020-202020202020";
    await operator();
    await pg.query("insert into auth.users(id,email) values($1,$2)", [
      userId,
      email,
    ]);
    await act("service_role");
    await expect(
      reserveForUser("cccc1111-aaaa-4111-8111-aaaa1111aaaa", userId, email),
    ).rejects.toThrow(/Verified customer email mismatch/);
    await operator();
    await pg.query(
      "update auth.users set email_confirmed_at=now() where id=$1",
      [userId],
    );
    await act("service_role");
    await expect(
      reserveForUser(
        "cccc2222-aaaa-4222-8222-aaaa2222aaaa",
        userId,
        "different@example.test",
      ),
    ).rejects.toThrow(/Verified customer email mismatch/);
    // Once verified, identity validation succeeds; reservation still requires
    // actual encrypted stock and must fail closed if none is available.
    await expect(
      reserveForUser("cccc3333-aaaa-4333-8333-aaaa3333aaaa", userId, email),
    ).rejects.toThrow(/No verified inventory/);
    await operator();
  });

  it("does not treat CMS demo_stock as purchased inventory", async () => {
    await act("service_role");
    await expect(reserve(requestKey)).rejects.toThrow(/No verified inventory/);
    await operator();
    const count = await pg.query<{ n: number }>(
      "select count(*)::int as n from private.commerce_orders",
    );
    expect(count.rows[0]?.n).toBe(0);
  });

  it("reserves real encrypted inventory, locks totals and reuses idempotency", async () => {
    await operator();
    await pg.exec(`insert into private.commerce_stock_units(variant_id,ciphertext,nonce,key_version)
      select id,'TEST-only-encrypted-payload-not-a-real-account','syntheticNonce0001',1
      from public.product_variants where variant_key='qa-variant';`);
    await act("service_role");
    const first = await reserve(requestKey);
    expect(first).toMatchObject({ total: 49000, reused: false });
    expect(typeof first?.orderCode).toBe("number");
    expect(await reserve(requestKey)).toMatchObject({
      orderId: first?.orderId,
      orderCode: first?.orderCode,
      reused: true,
    });
    await expect(
      reserve(requestKey, line, "other@example.test"),
    ).rejects.toThrow(/idempotency conflict/);
    await expect(
      reserve("aaaa2222-aaaa-4222-8222-aaaa2222aaaa"),
    ).rejects.toThrow(/No verified inventory/);
    await operator();
    const units = await pg.query<{ state: string; reserved_order_id: string }>(
      "select state,reserved_order_id from private.commerce_stock_units",
    );
    expect(units.rows).toEqual([
      { state: "reserved", reserved_order_id: first?.orderId },
    ]);
  });

  it("attaches exactly one provider link to the confirmed reservation", async () => {
    await act("service_role");
    const original = await reserve(requestKey);
    const params = [
      original?.orderId,
      original?.orderCode,
      "12345678901234567890123456789012",
      "0000000001234",
      49000,
      "https://pay.payos.vn/web/12345678901234567890123456789012",
    ];
    const attach =
      "select public.attach_payos_link($1::uuid,$2::bigint,$3,$4,$5::bigint,$6) as attached";
    const first = await pg.query<{ attached: boolean }>(attach, params);
    expect(first.rows[0]?.attached).toBe(true);
    const again = await pg.query<{ attached: boolean }>(attach, params);
    expect(again.rows[0]?.attached).toBe(true);
    const changed = await pg.query<{ attached: boolean }>(attach, [
      ...params.slice(0, 2),
      "12345678901234567890123456789013",
      ...params.slice(3),
    ]);
    expect(changed.rows[0]?.attached).toBe(false);
    const linked = await pg.query<{ value: Record<string, unknown> }>(
      "select public.claim_payos_link_attempt($1::uuid,$2) as value",
      [requestKey, guestHash],
    );
    expect(linked.rows[0]?.value).toMatchObject({
      status: "linked",
      orderCode: original?.orderCode,
    });
    await expect(
      pg.query("select public.claim_payos_link_attempt($1::uuid,$2)", [
        requestKey,
        "b".repeat(64),
      ]),
    ).rejects.toThrow(/proof mismatch/);
  });

  it("claims provider create-link only once and fails closed on an uncertain response", async () => {
    await operator();
    await pg.exec(`insert into private.commerce_stock_units(variant_id,ciphertext,nonce,key_version)
      select id,'TEST-claim-guard-ciphertext-not-real-account','syntheticNonce0002',1
      from public.product_variants where variant_key='qa-variant';`);
    await act("service_role");
    const key = "aaaa3333-aaaa-4333-8333-aaaa3333aaaa";
    const order = await reserve(key);
    const cmd = "select public.claim_payos_link_attempt($1::uuid,$2) as value";
    const first = await pg.query<{ value: Record<string, unknown> }>(cmd, [
      key,
      guestHash,
    ]);
    expect(first.rows[0]?.value).toMatchObject({
      status: "claimed",
      orderId: order?.orderId,
      total: 49000,
    });
    const second = await pg.query<{ value: Record<string, unknown> }>(cmd, [
      key,
      guestHash,
    ]);
    expect(second.rows[0]?.value).toMatchObject({ status: "uncertain" });
  });

  it("rejects variants without an Owner-configured selling price", async () => {
    await operator();
    await pg.exec(
      "update public.product_variants set price_configured=false where variant_key='qa-variant'",
    );
    await act("service_role");
    await expect(
      reserve("aaaa4444-aaaa-4444-8444-aaaa4444aaaa"),
    ).rejects.toThrow(/unpriced/);
    await operator();
    await pg.exec(
      "update public.product_variants set price_configured=true where variant_key='qa-variant'",
    );
  });

  it("rejects public role access and cart/price manipulation", async () => {
    await act("anon");
    await expect(
      reserve("bbbb1111-aaaa-4111-8111-aaaa1111aaaa"),
    ).rejects.toThrow(/permission denied/);
    await act("authenticated");
    await expect(
      reserve("bbbb1111-aaaa-4111-8111-aaaa1111aaaa"),
    ).rejects.toThrow(/permission denied/);
    await act("service_role");
    await expect(
      reserve("bbbb1111-aaaa-4111-8111-aaaa1111aaaa", [
        { variantKey: "qa-variant", quantity: 1, priceVnd: 1 },
      ]),
    ).rejects.toThrow(/Invalid cart item/);
    await expect(
      reserve("bbbb1111-aaaa-4111-8111-aaaa1111aaaa", [
        { variantKey: "qa-variant", quantity: 1 },
        { variantKey: "qa-variant", quantity: 1 },
      ]),
    ).rejects.toThrow(/Duplicate variant/);
  });
});
