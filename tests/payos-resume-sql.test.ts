import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let pg: PGlite;
const owner = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const stranger = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const guestEmail = "guest@example.test";
const ownerEmail = "owner@example.test";
const guestHash = "a".repeat(64);
let guestOrder = "";
let registeredOrder = "";
let guestCode = "";
const existingLink = "https://pay.payos.vn/web/synthetic-resume-link";

async function actor(
  role: "service_role" | "anon" | "authenticated",
  user?: string,
) {
  await pg.exec(`reset role; set role ${role}`);
  await pg.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({ role, ...(user ? { sub: user } : {}) }),
  ]);
}
async function operator() {
  await pg.exec("reset role");
}
async function guestResume(
  hash = guestHash,
  email = guestEmail,
  code = guestCode,
) {
  return (
    await pg.query<{ value: string | null }>(
      "select public.resume_guest_payos_link($1,$2,$3) as value",
      [code, email, hash],
    )
  ).rows[0]?.value;
}
async function accountResume(id = registeredOrder) {
  return (
    await pg.query<{ value: string | null }>(
      "select public.resume_registered_payos_link($1::uuid) as value",
      [id],
    )
  ).rows[0]?.value;
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
    "20261027204704_payos_resume_existing_link",
  ])
    await pg.exec(
      await readFile(
        new URL(`../supabase/migrations/${migration}.sql`, import.meta.url),
        "utf8",
      ),
    );
  await pg.query(
    "insert into auth.users(id,email,email_confirmed_at) values($1,$2,now()),($3,$4,now())",
    [owner, ownerEmail, stranger, "other@example.test"],
  );
  await pg.exec(`insert into public.products(catalog_key,slug,name,summary,status)
    values('qa-product','qa-product','Synthetic product','Synthetic only','published');
    insert into public.product_variants(product_id,variant_key,sku,label,price_vnd,demo_stock,enabled)
    select id,'qa-variant','QA-VARIANT','Synthetic plan',49000,0,true from public.products;
    insert into private.commerce_stock_units(variant_id,ciphertext,nonce,key_version)
    select id,'SYNTHETIC-ENCRYPTED-UNIT-NEVER-DELIVER','syntheticNonce0001',1 from public.product_variants;
    insert into private.commerce_stock_units(variant_id,ciphertext,nonce,key_version)
    select id,'SYNTHETIC-ENCRYPTED-UNIT-NEVER-DELIVER','syntheticNonce0002',1 from public.product_variants;`);
  await actor("service_role");
  const reserve = async (request: string, email: string, id: string | null) => {
    const result = await pg.query<{
      value: { orderId: string; orderCode: number };
    }>(
      "select public.reserve_payos_checkout($1::uuid,$2,$3,$4::jsonb,$5::uuid) as value",
      [
        request,
        email,
        guestHash,
        JSON.stringify([{ variantKey: "qa-variant", quantity: 1 }]),
        id,
      ],
    );
    if (!result.rows[0])
      throw new Error("Synthetic checkout reservation missing");
    return result.rows[0].value;
  };
  const first = await reserve(
    "aaaaaaaa-1111-4111-8111-111111111111",
    guestEmail,
    null,
  );
  const second = await reserve(
    "aaaaaaaa-2222-4222-8222-222222222222",
    ownerEmail,
    owner,
  );
  guestOrder = first.orderId;
  guestCode = `HB${guestOrder.replaceAll("-", "").slice(0, 16).toUpperCase()}`;
  registeredOrder = second.orderId;
  await operator();
  await pg.query(
    "update private.commerce_checkout_intents set link_attempted_at=now() where order_id in ($1,$2)",
    [guestOrder, registeredOrder],
  );
  await pg.query(
    `insert into private.payos_links(order_id,order_code,payment_link_id,receiving_account,amount_vnd,checkout_url,reservation_confirmed,expires_at)
    select o.id,i.order_code,'synthetic-link-'||i.order_code,'synthetic-account',o.total_vnd,$3,true,o.expires_at
    from private.commerce_orders o join private.commerce_checkout_intents i on i.order_id=o.id
    where o.id in ($1,$2)`,
    [guestOrder, registeredOrder, existingLink],
  );
});
afterAll(async () => pg?.close());

describe("payOS resume SQL ownership, expiry and stock integrity", () => {
  it("lets only the verified Auth owner recover the registered order", async () => {
    await actor("authenticated", owner);
    expect(await accountResume()).toBe(existingLink);
    expect(await accountResume(guestOrder)).toBeNull();
    await actor("authenticated", stranger);
    expect(await accountResume()).toBeNull();
    await actor("anon");
    await expect(accountResume()).rejects.toThrow();
  });

  it("requires a privileged guest reader with the exact code, email, and proof", async () => {
    await actor("authenticated", owner);
    await expect(guestResume()).rejects.toThrow();
    await actor("service_role");
    expect(await guestResume()).toBe(existingLink);
    expect(await guestResume("b".repeat(64))).toBeNull();
    expect(await guestResume(guestHash, "wrong@example.test")).toBeNull();
    expect(
      await guestResume(guestHash, guestEmail, "HBFFFFFFFFFFFFFFFF"),
    ).toBeNull();
    await expect(accountResume()).rejects.toThrow();
  });

  it("fails closed after link expiry, state changes or missing reserved inventory", async () => {
    await operator();
    await pg.query(
      "update private.payos_links set created_at=now()-interval '20 minutes',expires_at=now()-interval '1 second' where order_id=$1",
      [guestOrder],
    );
    await actor("service_role");
    expect(await guestResume()).toBeNull();
    await operator();
    await pg.query(
      "update private.payos_links set expires_at=now()+interval '5 minutes' where order_id=$1",
      [guestOrder],
    );
    await pg.query(
      "update private.commerce_orders set state='paid' where id=$1",
      [guestOrder],
    );
    await actor("service_role");
    expect(await guestResume()).toBeNull();
    await operator();
    await pg.query(
      "update private.commerce_orders set state='pending_payment' where id=$1",
      [guestOrder],
    );
    await pg.query(
      "update private.commerce_stock_units set state='quarantined',reserved_order_id=null where reserved_order_id=$1",
      [guestOrder],
    );
    await actor("service_role");
    expect(await guestResume()).toBeNull();
  });
});
