import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let pg: PGlite;
const requestKey = "aaaa1111-aaaa-4111-8111-aaaa1111aaaa";
const guestHash = "a".repeat(64);
const email = "guest@example.test";
let orderId: string;
let orderCode: string;
let claimOrderId: string;
let claimOrderCode: string;

async function role(
  name: "service_role" | "anon" | "authenticated",
  userId?: string,
) {
  await pg.exec(`reset role;set role ${name}`);
  await pg.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({ role: name, ...(userId ? { sub: userId } : {}) }),
  ]);
}

async function operator() {
  await pg.exec("reset role");
}

async function lookup(
  functionName: "guest_order_by_proof" | "read_guest_payos_delivery",
  hash = guestHash,
  contact = email,
  code = orderCode,
) {
  const result = await pg.query<{ result: unknown }>(
    `select public.${functionName}($1,$2,$3) as result`,
    [code, contact, hash],
  );
  return result.rows[0]?.result;
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
    "20261027090005_payos_fulfillment_delivery",
    "20261027173103_guest_order_browser_proof",
    "20261027182545_verified_guest_order_claim",
  ]) {
    await pg.exec(
      await readFile(
        new URL(`../supabase/migrations/${migration}.sql`, import.meta.url),
        "utf8",
      ),
    );
  }
  await pg.exec(`insert into public.products(catalog_key,slug,name,summary,status)
    values('qa-product','qa-product','Synthetic product','Synthetic test','published');
    insert into public.product_variants(product_id,variant_key,sku,label,price_vnd,demo_stock,enabled)
    select id,'qa-variant','QA-VARIANT','Synthetic plan',49000,0,true
    from public.products where catalog_key='qa-product';
    insert into private.commerce_stock_units(variant_id,ciphertext,nonce,key_version)
    select id,'SYNTHETIC-ENCRYPTED-UNIT-CANNOT-DECRYPT','syntheticNonce0001',1
    from public.product_variants where variant_key='qa-variant';`);
  await role("service_role");
  const reserved = await pg.query<{ result: { orderId: string } }>(
    "select public.reserve_payos_checkout($1::uuid,$2,$3,$4::jsonb,null) as result",
    [
      requestKey,
      email,
      guestHash,
      JSON.stringify([{ variantKey: "qa-variant", quantity: 1 }]),
    ],
  );
  orderId = reserved.rows[0]?.result.orderId ?? "";
  orderCode = `HB${orderId.replaceAll("-", "").slice(0, 16).toUpperCase()}`;
  await operator();
  await pg.exec(`insert into private.commerce_stock_units(variant_id,ciphertext,nonce,key_version)
    select id,'SYNTHETIC-ENCRYPTED-CLAIM-UNIT-NOT-DECRYPTABLE','syntheticNonce0002',1
    from public.product_variants where variant_key='qa-variant';`);
  await role("service_role");
  const claimReservation = await pg.query<{ result: { orderId: string } }>(
    "select public.reserve_payos_checkout($1::uuid,$2,$3,$4::jsonb,null) as result",
    [
      "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      email,
      "b".repeat(64),
      JSON.stringify([{ variantKey: "qa-variant", quantity: 1 }]),
    ],
  );
  claimOrderId = claimReservation.rows[0]?.result.orderId ?? "";
  claimOrderCode = `HB${claimOrderId.replaceAll("-", "").slice(0, 16).toUpperCase()}`;
});

describe("verified customer guest-order claim SQL", () => {
  const ownerId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const strangerId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

  it("requires a confirmed account email and an exact checkout email and code", async () => {
    await operator();
    await pg.query(`insert into auth.users(id,email) values($1,$2),($3,$4)`, [
      ownerId,
      email,
      strangerId,
      "stranger@example.test",
    ]);
    await role("authenticated", ownerId);
    const claim = (code = claimOrderCode, address = email) =>
      pg.query<{ result: unknown }>(
        "select public.claim_verified_guest_order($1,$2) as result",
        [code, address],
      );
    expect((await claim()).rows[0]?.result).toBeNull();
    await operator();
    await pg.query(
      "update auth.users set email_confirmed_at=now() where id=$1 or id=$2",
      [ownerId, strangerId],
    );
    await role("authenticated", ownerId);
    expect(
      (await claim(claimOrderCode, "other@example.test")).rows[0]?.result,
    ).toBeNull();
    expect((await claim("HBFFFFFFFFFFFFFFFF")).rows[0]?.result).toBeNull();
    expect((await claim("12345678")).rows[0]?.result).toBeNull();
    const original = await pg
      .query<{ user_id: string | null }>(
        "select user_id from private.commerce_orders where id=$1",
        [claimOrderId],
      )
      .catch(() => null);
    // Privileged table access must remain unavailable to the customer role.
    expect(original).toBeNull();
  });

  it("claims atomically, records one audit event and never reassigns it", async () => {
    await role("authenticated", strangerId);
    expect(
      (
        await pg.query<{ result: unknown }>(
          "select public.claim_verified_guest_order($1,$2) as result",
          [claimOrderCode, "stranger@example.test"],
        )
      ).rows[0]?.result,
    ).toBeNull();
    await role("authenticated", ownerId);
    const claim = () =>
      pg.query<{ result: { id: string; code: string } | null }>(
        "select public.claim_verified_guest_order($1,$2) as result",
        [claimOrderCode, email],
      );
    expect((await claim()).rows[0]?.result).toMatchObject({
      id: claimOrderId,
      code: claimOrderCode,
    });
    expect((await claim()).rows[0]?.result).toMatchObject({ id: claimOrderId });
    expect(
      (
        await pg.query<{ result: { id: string } | null }>(
          "select public.customer_order_by_code($1) as result",
          [claimOrderCode],
        )
      ).rows[0]?.result,
    ).toMatchObject({ id: claimOrderId });
    // Once claimed, the old browser proof must no longer disclose the order.
    // The verified account is now the only customer-facing reader.
    await role("service_role");
    expect(
      await lookup(
        "guest_order_by_proof",
        "b".repeat(64),
        email,
        claimOrderCode,
      ),
    ).toBeNull();
    expect(
      await lookup(
        "read_guest_payos_delivery",
        "b".repeat(64),
        email,
        claimOrderCode,
      ),
    ).toBeNull();
    await role("authenticated", strangerId);
    expect(
      (
        await pg.query<{ result: unknown }>(
          "select public.customer_order_by_code($1) as result",
          [claimOrderCode],
        )
      ).rows[0]?.result,
    ).toBeNull();
    expect(
      (
        await pg.query<{ result: unknown }>(
          "select public.claim_verified_guest_order($1,$2) as result",
          [claimOrderCode, email],
        )
      ).rows[0]?.result,
    ).toBeNull();
    await operator();
    const check = await pg.query<{
      user_id: string;
      count: number;
      state: string;
      reserved: number;
    }>(
      `select o.user_id,o.state,
         (select count(*)::integer from private.guest_order_claim_events e
            where e.order_id=o.id) as count,
         (select count(*)::integer from private.commerce_stock_units s
            where s.reserved_order_id=o.id) as reserved
       from private.commerce_orders o where o.id=$1`,
      [claimOrderId],
    );
    expect(check.rows[0]).toMatchObject({
      user_id: ownerId,
      count: 1,
      state: "pending_payment",
      reserved: 1,
    });
  });

  it("rejects anonymous and service roles for both RPCs", async () => {
    for (const actor of ["anon", "service_role"] as const) {
      await role(actor);
      await expect(
        pg.query("select public.customer_order_by_code($1)", [claimOrderCode]),
      ).rejects.toThrow();
      await expect(
        pg.query("select public.claim_verified_guest_order($1,$2)", [
          claimOrderCode,
          email,
        ]),
      ).rejects.toThrow();
    }
  });
});

afterAll(async () => pg?.close());

describe("browser-bound guest order SQL access", () => {
  it("projects only an exact guest order with email and hashed browser proof", async () => {
    await role("service_role");
    await expect(lookup("guest_order_by_proof")).resolves.toMatchObject({
      id: orderId,
      code: orderCode,
      total: 49000,
      state: "pending_payment",
    });
    expect(await lookup("guest_order_by_proof", "b".repeat(64))).toBeNull();
    expect(
      await lookup("guest_order_by_proof", guestHash, "other@example.test"),
    ).toBeNull();
    expect(
      await lookup(
        "guest_order_by_proof",
        guestHash,
        email,
        "HBFFFFFFFFFFFFFFFF",
      ),
    ).toBeNull();
    expect(await lookup("read_guest_payos_delivery")).toBeNull();
  });

  it("blocks unauthenticated and customer database roles from both RPCs", async () => {
    for (const actor of ["anon", "authenticated"] as const) {
      await role(actor);
      await expect(lookup("guest_order_by_proof")).rejects.toThrow();
      await expect(lookup("read_guest_payos_delivery")).rejects.toThrow();
    }
  });

  it("releases ciphertext only after verified payment and complete matching delivery", async () => {
    await operator();
    await pg.query(
      `insert into private.payos_fulfillment_outbox(order_id,status) values($1,'completed')`,
      [orderId],
    );
    await pg.query(
      "update private.commerce_orders set state='delivered' where id=$1",
      [orderId],
    );
    await role("service_role");
    expect(await lookup("read_guest_payos_delivery")).toBeNull();

    await operator();
    await pg.query(
      `insert into private.commerce_payments(order_id,provider,provider_transaction,amount_vnd,direction,verification_state)
       values($1,'payos','synthetic-transfer',49000,'in','verified')`,
      [orderId],
    );
    await role("service_role");
    expect(await lookup("read_guest_payos_delivery")).toBeNull();

    await operator();
    await pg.query(
      `insert into private.commerce_delivery_units(stock_unit_id,order_id,order_item_id)
       select s.id,$1,i.id from private.commerce_stock_units s
       join private.commerce_order_items i on i.order_id=$1 and i.variant_id=s.variant_id
       where s.reserved_order_id=$1`,
      [orderId],
    );
    await pg.query(
      "update private.commerce_stock_units set state='delivered',reserved_order_id=null where reserved_order_id=$1",
      [orderId],
    );
    await role("service_role");
    expect(await lookup("read_guest_payos_delivery")).toEqual([
      expect.objectContaining({
        ciphertext: "SYNTHETIC-ENCRYPTED-UNIT-CANNOT-DECRYPT",
        key_version: 1,
      }),
    ]);
    expect(
      await lookup("read_guest_payos_delivery", "b".repeat(64)),
    ).toBeNull();
  });
});
