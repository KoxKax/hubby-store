import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const owner = "44444444-4444-4444-8444-444444444444";
const stranger = "55555555-5555-4555-8555-555555555555";
const code = 1_000_300_001;
let pg: PGlite;
let orderId: string;
let stockId: string;

async function role(
  value: "anon" | "authenticated" | "service_role" | "postgres",
) {
  await pg.exec(
    value === "postgres" ? "reset role" : `reset role; set role ${value}`,
  );
  await pg.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({ role: value }),
  ]);
}

async function requeue(actor = owner, note = "Đã xác nhận dịch vụ khôi phục.") {
  const result = await pg.query<{ requeue_exhausted_payos_delivery: boolean }>(
    "select public.requeue_exhausted_payos_delivery($1,$2,$3)",
    [orderId, actor, note],
  );
  return result.rows[0]?.requeue_exhausted_payos_delivery;
}

async function exhausted() {
  await role("postgres");
  await pg.query(
    `update private.payos_fulfillment_outbox set status='failed', attempts=4,
      last_issue='service_unavailable', claim_token=null, lease_until=null
      where order_id=$1`,
    [orderId],
  );
  await role("service_role");
}

async function snapshot() {
  await role("postgres");
  const result = await pg.query<{
    status: string;
    attempts: number;
    last_issue: string | null;
    claim_token: string | null;
    lease_until: string | null;
  }>(
    "select status,attempts,last_issue,claim_token,lease_until from private.payos_fulfillment_outbox where order_id=$1",
    [orderId],
  );
  return result.rows[0];
}

async function auditCount() {
  await role("postgres");
  const { rows } = await pg.query<{ count: number }>(
    "select count(*)::integer as count from private.payos_delivery_requeue_audit where order_id=$1",
    [orderId],
  );
  return rows[0]?.count;
}

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
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
    "20261027190000_payos_reconciliation_queue",
    "20261028043000_payos_exhausted_delivery_requeue",
  ]) {
    await pg.exec(
      await readFile(
        new URL(`../supabase/migrations/${migration}.sql`, import.meta.url),
        "utf8",
      ),
    );
  }
  await pg.exec(`insert into public.products(catalog_key,slug,name,summary,status)
    values('qa-requeue-product','qa-requeue-product','QA product','QA item','published');
    insert into public.product_variants(product_id,variant_key,sku,label,price_vnd,demo_stock,enabled)
      select id,'qa-requeue-variant','QA-REQUEUE','QA plan',49000,1,true
      from public.products where catalog_key='qa-requeue-product';`);
  await pg.query(
    "insert into auth.users(id,email) values($1,'owner@example.test'),($2,'outsider@example.test')",
    [owner, stranger],
  );
  await pg.query(
    "update private.role_memberships set role='owner' where user_id=$1",
    [owner],
  );
  const order = await pg.query<{ id: string }>(
    `insert into private.commerce_orders(code,subtotal_vnd,total_vnd,expires_at)
      values('HB0000000000000031',49000,49000,now()+interval '1 hour') returning id`,
  );
  const createdOrder = order.rows[0]?.id;
  if (!createdOrder) throw Error("Missing synthetic order");
  orderId = createdOrder;
  await pg.query(
    `insert into private.commerce_order_items(order_id,variant_id,product_name,variant_label,quantity,price_vnd)
     select $1,id,'QA product','QA plan',1,49000 from public.product_variants where variant_key='qa-requeue-variant'`,
    [orderId],
  );
  const unit = await pg.query<{ id: string }>(
    `insert into private.commerce_stock_units(variant_id,ciphertext,nonce,key_version,state,reserved_order_id)
     select id,repeat('X',40),'TEST-requeue-nonce-1',1,'reserved',$1
     from public.product_variants where variant_key='qa-requeue-variant' returning id`,
    [orderId],
  );
  const createdStock = unit.rows[0]?.id;
  if (!createdStock) throw Error("Missing synthetic stock");
  stockId = createdStock;
  await pg.query(
    `insert into private.payos_links(order_id,order_code,payment_link_id,receiving_account,amount_vnd,checkout_url,reservation_confirmed,expires_at)
     values($1,$2,'qa-requeue-link-123456','000000001234',49000,'https://pay.payos.vn/web/qa-requeue-link-123456',true,now()+interval '1 hour')`,
    [orderId, code],
  );
  await role("service_role");
  const paid = await pg.query<{ record_payos_receipt: string }>(
    "select public.record_payos_receipt($1,$2,$3,$4,$5,now())",
    [
      "qa-requeue-payment",
      code,
      "qa-requeue-link-123456",
      "000000001234",
      49000,
    ],
  );
  expect(paid.rows[0]?.record_payos_receipt).toBe("paid");
  await exhausted();
});

describe("payOS exhausted delivery requeue SQL — isolated database", () => {
  it("denies direct anonymous/authenticated callers, even forged JWT service claim", async () => {
    await role("anon");
    await expect(requeue()).rejects.toThrow(/permission denied/);
    await role("authenticated");
    await pg.query("select set_config('request.jwt.claims',$1,false)", [
      JSON.stringify({ role: "service_role" }),
    ]);
    await expect(requeue()).rejects.toThrow(/permission denied/);
  });

  it("requires a real active Owner and valid note", async () => {
    await role("service_role");
    await expect(requeue(stranger)).rejects.toThrow(/Owner required/);
    await expect(requeue(owner, "bad")).rejects.toThrow(
      /Invalid delivery recovery request/,
    );
  });

  it("rejects unpaid, unverified, processing, non-exhausted, and unsafe delivery faults", async () => {
    await role("postgres");
    const cases: [string, string][] = [
      [
        "update private.commerce_orders set state='pending_payment' where id=$1",
        "update private.commerce_orders set state='paid' where id=$1",
      ],
      [
        "update private.commerce_payments set verification_state='reconciliation' where order_id=$1",
        "update private.commerce_payments set verification_state='verified' where order_id=$1",
      ],
      [
        "update private.payos_fulfillment_outbox set attempts=3 where order_id=$1",
        "update private.payos_fulfillment_outbox set attempts=4 where order_id=$1",
      ],
      [
        "update private.payos_fulfillment_outbox set status='processing' where order_id=$1",
        "update private.payos_fulfillment_outbox set status='failed' where order_id=$1",
      ],
      [
        "update private.payos_fulfillment_outbox set last_issue='decrypt_failed' where order_id=$1",
        "update private.payos_fulfillment_outbox set last_issue='service_unavailable' where order_id=$1",
      ],
      [
        "update private.payos_fulfillment_outbox set last_issue='stock_mismatch' where order_id=$1",
        "update private.payos_fulfillment_outbox set last_issue='service_unavailable' where order_id=$1",
      ],
      [
        "update private.payos_fulfillment_outbox set lease_until=now()+interval '1 minute' where order_id=$1",
        "update private.payos_fulfillment_outbox set lease_until=null where order_id=$1",
      ],
      [
        "update private.commerce_stock_units set state='available',reserved_order_id=null where id=$1",
        "update private.commerce_stock_units set state='reserved',reserved_order_id=$2 where id=$1",
      ],
    ];
    for (const [change, restore] of cases) {
      const target = change.includes("commerce_stock_units")
        ? stockId
        : orderId;
      await pg.query(change, [target]);
      await role("service_role");
      expect(await requeue()).toBe(false);
      await role("postgres");
      await pg.query(
        restore,
        change.includes("commerce_stock_units") ? [target, orderId] : [target],
      );
    }
    await role("service_role");
  });

  it("rejects partial delivery; no audit/stock change occurs on rejection", async () => {
    await role("postgres");
    const item = await pg.query<{ id: string }>(
      "select id from private.commerce_order_items where order_id=$1",
      [orderId],
    );
    const orderedItemId = item.rows[0]?.id;
    if (!orderedItemId) throw Error("Missing synthetic item");
    await pg.query(
      "insert into private.commerce_delivery_units(stock_unit_id,order_id,order_item_id) values($1,$2,$3)",
      [stockId, orderId, orderedItemId],
    );
    await role("service_role");
    expect(await requeue()).toBe(false);
    await role("postgres");
    await pg.query(
      "delete from private.commerce_delivery_units where order_id=$1",
      [orderId],
    );
    expect(await auditCount()).toBe(0);
  });

  it("never restores fulfillment once a verified refund is recorded", async () => {
    await exhausted();
    await role("postgres");
    await pg.query(
      `insert into private.commerce_payments(order_id,provider,provider_transaction,amount_vnd,direction,verification_state)
        values($1,'payos','qa-refund-1',49000,'refund','verified')`,
      [orderId],
    );
    await role("service_role");
    expect(await requeue()).toBe(false);
    await role("postgres");
    await pg.query(
      "delete from private.commerce_payments where provider_transaction='qa-refund-1'",
    );
    expect(await auditCount()).toBe(0);
  });

  it("resets exactly one eligible task, logs an audit and refuses replay", async () => {
    await exhausted();
    expect(await requeue()).toBe(true);
    expect(await requeue()).toBe(false);
    const job = await snapshot();
    expect(job).toMatchObject({
      status: "held",
      attempts: 0,
      last_issue: null,
      claim_token: null,
      lease_until: null,
    });
    expect(await auditCount()).toBe(1);
    const other = await pg.query<{ state: string }>(
      "select state from private.commerce_orders where id=$1",
      [orderId],
    );
    const stock = await pg.query<{ state: string; reserved_order_id: string }>(
      "select state,reserved_order_id from private.commerce_stock_units where id=$1",
      [stockId],
    );
    expect(other.rows[0]?.state).toBe("paid");
    expect(stock.rows[0]).toMatchObject({
      state: "reserved",
      reserved_order_id: orderId,
    });
    expect(
      (
        await pg.query(
          "select * from private.commerce_delivery_units where order_id=$1",
          [orderId],
        )
      ).rows,
    ).toHaveLength(0);
  });

  it("limits each order to three audited recoveries", async () => {
    for (let attempt = 1; attempt <= 2; attempt++) {
      await exhausted();
      expect(await requeue()).toBe(true);
    }
    await exhausted();
    expect(await requeue()).toBe(false);
    expect(await auditCount()).toBe(3);
    expect((await snapshot())?.attempts).toBe(4);
  });
});

afterAll(async () => pg?.close());
