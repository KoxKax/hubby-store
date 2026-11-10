import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let pg: PGlite;
const origin = "https://fake-staging.supabase.co/auth/v1";
const referenceSql =
  "select public.record_payos_receipt($1,$2::bigint,$3,$4,$5::bigint,$6::timestamptz) as result";
const amount = 49000;
const account = "000000001234";
const link = "12345678901234567890123456789012";

async function actor(role: "service_role" | "anon" | "authenticated") {
  await pg.exec(`reset role;set role ${role}`);
  await pg.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({ role, iss: origin }),
  ]);
}
async function trusted() {
  await pg.exec("reset role");
}
async function createOrder(code: number, reserved: boolean) {
  await trusted();
  const result = await pg.query<{ id: string }>(
    "insert into private.commerce_orders(code,subtotal_vnd,total_vnd,created_at,expires_at) values($1,$2,$2,now()-interval '1 minute',now()+interval '10 minutes') returning id",
    [`HB${code.toString(16).toUpperCase().padStart(16, "0")}`, amount],
  );
  const id = result.rows[0]?.id;
  if (!id) throw Error("Synthetic order was not created");
  await pg.query(
    `insert into private.commerce_order_items
      (order_id,variant_id,product_name,variant_label,quantity,price_vnd)
      select $1,id,'Test product','Test plan',1,$2
      from public.product_variants where variant_key='qa-payos-variant'`,
    [id, amount],
  );
  if (reserved) {
    const nonce = btoa(
      String.fromCharCode(...crypto.getRandomValues(new Uint8Array(12))),
    );
    await pg.query(
      `insert into private.commerce_stock_units(variant_id,ciphertext,nonce,key_version,state,reserved_order_id)
       select id,'TEST-only-synthetic-not-a-real-account',$2,1,'reserved',$1
       from public.product_variants where variant_key='qa-payos-variant'`,
      [id, nonce],
    );
  }
  await pg.query(
    "insert into private.payos_links(order_id,order_code,payment_link_id,receiving_account,amount_vnd,checkout_url,reservation_confirmed,created_at,expires_at) values($1,$2,$3,$4,$5,$6,$7,now()-interval '1 minute',now()+interval '10 minutes')",
    [
      id,
      code,
      `${link.slice(0, -String(code).length)}${code}`,
      account,
      amount,
      "https://pay.payos.vn/web/12345678901234567890123456789012",
      reserved,
    ],
  );
  return { id, code, link: `${link.slice(0, -String(code).length)}${code}` };
}
async function record(
  ref: string,
  code: number,
  actualLink: string,
  paidAmount = amount,
  date = new Date(),
) {
  const result = await pg.query<{ result: string }>(referenceSql, [
    ref,
    code,
    actualLink,
    account,
    paidAmount,
    date.toISOString(),
  ]);
  return result.rows[0]?.result;
}

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`create role anon;create role authenticated;create role service_role;
    create schema auth;create schema storage;
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
    "20261027200013_payos_stock_quarantine",
  ]) {
    await pg.exec(
      await readFile(
        new URL(`../supabase/migrations/${migration}.sql`, import.meta.url),
        "utf8",
      ),
    );
  }
  await pg.exec(`insert into public.products(catalog_key,slug,name,summary,status)
    values('qa-payos-product','qa-payos-product','Test product','Test item','published');
    insert into public.product_variants(product_id,variant_key,sku,label,price_vnd,demo_stock,enabled)
    select id,'qa-payos-variant','QA-PAYOS','Test plan',49000,999,true
    from public.products where catalog_key='qa-payos-product';`);
});

describe("Owner stock quarantine; local Postgres transaction and RLS", () => {
  it("hides secrets and atomically rejects reserved, delivered, and duplicate quarantine", async () => {
    const ownerId = "44444444-4444-4444-8444-444444444444";
    const outsiderId = "55555555-5555-4555-8555-555555555555";
    const stockIds = [
      "66666666-6666-4666-8666-666666666661",
      "66666666-6666-4666-8666-666666666662",
      "66666666-6666-4666-8666-666666666663",
    ] as const;
    await trusted();
    await pg.query(
      "insert into auth.users(id,email) values($1,'qa-owner@example.test'),($2,'qa-outsider@example.test')",
      [ownerId, outsiderId],
    );
    await pg.query(
      "update private.role_memberships set role='owner' where user_id=$1",
      [ownerId],
    );
    const order = await createOrder(100022, false);
    for (const [index, state] of [
      "available",
      "reserved",
      "delivered",
    ].entries()) {
      await pg.query(
        `insert into private.commerce_stock_units
          (id,variant_id,ciphertext,nonce,key_version,state,reserved_order_id)
         select $1,id,'TEST-synthetic-secret-do-not-expose',$2,1,$3,$4
         from public.product_variants where variant_key='qa-payos-variant'`,
        [
          stockIds[index],
          `synthetic-stock-nonce-${index}`,
          state,
          state === "reserved" ? order.id : null,
        ],
      );
    }
    await actor("anon");
    await expect(
      pg.query("select public.list_payos_stock_units(50)"),
    ).rejects.toThrow(/permission denied/);
    await expect(
      pg.query("select public.quarantine_payos_stock($1,$2,'invalid')", [
        stockIds[0],
        ownerId,
      ]),
    ).rejects.toThrow(/permission denied/);
    await actor("authenticated");
    await expect(
      pg.query("select public.list_payos_stock_units(50)"),
    ).rejects.toThrow(/permission denied/);
    await actor("service_role");
    const list = await pg.query<{ list_payos_stock_units: string }>(
      "select public.list_payos_stock_units(50)",
    );
    const units = JSON.parse(
      JSON.stringify(list.rows[0]?.list_payos_stock_units),
    );
    expect(JSON.stringify(units)).not.toContain("TEST-synthetic-secret");
    expect(units.some((unit: { id: string }) => unit.id === stockIds[0])).toBe(
      true,
    );
    expect(units.some((unit: { id: string }) => unit.id === stockIds[1])).toBe(
      false,
    );
    await expect(
      pg.query("select public.quarantine_payos_stock($1,$2,'invalid')", [
        stockIds[0],
        outsiderId,
      ]),
    ).rejects.toThrow(/Invalid quarantine request/);
    const attempt = (id: string) =>
      pg.query<{ quarantine_payos_stock: boolean }>(
        "select public.quarantine_payos_stock($1,$2,'compromised')",
        [id, ownerId],
      );
    expect((await attempt(stockIds[0])).rows[0]?.quarantine_payos_stock).toBe(
      true,
    );
    for (const id of stockIds) {
      expect((await attempt(id)).rows[0]?.quarantine_payos_stock).toBe(false);
    }
    await trusted();
    expect(
      (
        await pg.query<{ state: string }>(
          "select state from private.commerce_stock_units where id=$1",
          [stockIds[0]],
        )
      ).rows[0]?.state,
    ).toBe("quarantined");
    expect(
      (
        await pg.query<{ n: number }>(
          "select count(*)::integer as n from private.commerce_stock_quarantine_audit where stock_unit_id=$1",
          [stockIds[0]],
        )
      ).rows[0]?.n,
    ).toBe(1);
  });
});
afterAll(async () => pg?.close());

describe("payOS durable settlement foundation; isolated Postgres only", () => {
  it("rejects even forged service claims from the public roles", async () => {
    const order = await createOrder(100001, true);
    await actor("anon");
    await pg.query("select set_config('request.jwt.claims',$1,false)", [
      JSON.stringify({ role: "service_role" }),
    ]);
    await expect(
      record("test-unauthorized", order.code, order.link),
    ).rejects.toThrow(/permission denied/);
    await actor("authenticated");
    await expect(
      record("test-unauthorized", order.code, order.link),
    ).rejects.toThrow(/permission denied/);
  });

  it("persists verified payment only once, creates one held delivery job", async () => {
    const order = await createOrder(100002, true);
    const paidAt = new Date();
    await actor("service_role");
    expect(
      await record("bank-ref-1", order.code, order.link, amount, paidAt),
    ).toBe("paid");
    expect(
      await record("bank-ref-1", order.code, order.link, amount, paidAt),
    ).toBe("duplicate");
    expect(await record("bank-ref-2", order.code, order.link)).toBe(
      "reconciliation",
    );
    await trusted();
    const payment = await pg.query<{ count: number }>(
      "select count(*)::int as count from private.commerce_payments where order_id=$1",
      [order.id],
    );
    expect(payment.rows[0]?.count).toBe(1);
    const outbox = await pg.query<{ status: string }>(
      "select status from private.payos_fulfillment_outbox where order_id=$1",
      [order.id],
    );
    expect(outbox.rows).toEqual([{ status: "held" }]);
    expect(
      (
        await pg.query<{ state: string }>(
          "select state from private.commerce_orders where id=$1",
          [order.id],
        )
      ).rows[0]?.state,
    ).toBe("paid");
  });

  it("records unmatched amount and missing reservation for manual reconciliation", async () => {
    const unreserved = await createOrder(100003, false);
    const reserved = await createOrder(100004, true);
    await actor("service_role");
    expect(
      await record("bank-unreserved", unreserved.code, unreserved.link),
    ).toBe("reconciliation");
    expect(
      await record(
        "bank-wrong-amount",
        reserved.code,
        reserved.link,
        amount + 1000,
      ),
    ).toBe("reconciliation");
    expect(
      await record("bank-wrong-link", reserved.code, "wrong-link-id-12345678"),
    ).toBe("reconciliation");
    expect(await record("bank-ref-3", reserved.code, reserved.link)).toBe(
      "paid",
    );
    await trusted();
    expect(
      (
        await pg.query<{ count: number }>(
          "select count(*)::int as count from private.payos_receipts where outcome='reconciliation' and order_id in ($1,$2)",
          [unreserved.id, reserved.id],
        )
      ).rows[0]?.count,
    ).toBe(3);
  });

  it("rejects a forged reservation flag even with a matching paid amount", async () => {
    const forged = await createOrder(100009, false);
    await actor("service_role");
    expect(
      await record("bank-forged-reservation", forged.code, forged.link),
    ).toBe("reconciliation");
    await trusted();
    expect(
      (
        await pg.query<{ total: number }>(
          "select count(*)::int as total from private.commerce_payments where order_id=$1",
          [forged.id],
        )
      ).rows[0]?.total,
    ).toBe(0);
  });

  it("refuses settlement with a reserved unit belonging to another variant", async () => {
    const mismatched = await createOrder(100010, true);
    await trusted();
    await pg.exec(`insert into public.products(catalog_key,slug,name,summary,status)
      values('qa-other-product','qa-other-product','Other product','Test item','published');
      insert into public.product_variants(product_id,variant_key,sku,label,price_vnd,demo_stock,enabled)
      select id,'qa-other-variant','QA-OTHER','Another plan',49000,999,true
      from public.products where catalog_key='qa-other-product';`);
    await pg.query(
      `update private.commerce_stock_units
       set variant_id=(select id from public.product_variants where variant_key='qa-other-variant')
       where reserved_order_id=$1`,
      [mismatched.id],
    );
    await actor("service_role");
    expect(
      await record("bank-mismatched-stock", mismatched.code, mismatched.link),
    ).toBe("reconciliation");
  });

  it("never settles an expired order or a transfer older than the order", async () => {
    const expired = await createOrder(100005, true);
    const olderTransfer = await createOrder(100006, true);
    await trusted();
    await pg.query(
      "update private.payos_links set expires_at=now()-interval '1 second' where order_id=$1",
      [expired.id],
    );
    await actor("service_role");
    expect(await record("bank-expired", expired.code, expired.link)).toBe(
      "reconciliation",
    );
    expect(
      await record(
        "bank-too-early",
        olderTransfer.code,
        olderTransfer.link,
        amount,
        new Date(Date.now() - 10 * 60_000),
      ),
    ).toBe("reconciliation");
    await trusted();
    const payments = await pg.query<{ count: number }>(
      "select count(*)::int as count from private.commerce_payments where order_id in ($1,$2)",
      [expired.id, olderTransfer.id],
    );
    expect(payments.rows[0]?.count).toBe(0);
  });

  it("does not overwrite an already stored reference with conflicting signed fields", async () => {
    const first = await createOrder(100007, true);
    const next = await createOrder(100008, true);
    const transferred = new Date();
    await actor("service_role");
    expect(
      await record(
        "bank-conflict",
        first.code,
        first.link,
        amount,
        transferred,
      ),
    ).toBe("paid");
    expect(
      await record("bank-conflict", next.code, next.link, amount, transferred),
    ).toBe("reconciliation");
    await trusted();
    const payments = await pg.query<{ count: number }>(
      "select count(*)::int as count from private.commerce_payments where order_id in ($1,$2)",
      [first.id, next.id],
    );
    expect(payments.rows[0]?.count).toBe(1);
    const receipt = await pg.query<{ order_code: string }>(
      "select order_code::text from private.payos_receipts where provider_reference='bank-conflict'",
    );
    expect(receipt.rows[0]?.order_code).toBe(String(first.code));
  });
});
