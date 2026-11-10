-- Prepared local foundation ONLY. Do not apply remotely before real checkout,
-- stock reservation, private service credentials and delivery UAT are ready.
-- No existing CMS, catalog, Owner accounts or commerce data are rewritten.
begin;

create table private.payos_links (
  order_id uuid primary key references private.commerce_orders(id) on delete restrict,
  order_code bigint not null unique check (order_code between 1 and 99999999999),
  payment_link_id text not null unique check (length(payment_link_id) between 8 and 120),
  receiving_account text not null check (length(receiving_account) between 4 and 40),
  amount_vnd bigint not null check (amount_vnd between 2000 and 100000000000),
  checkout_url text not null check (checkout_url ~ '^https://pay\.payos\.vn/'),
  -- Only the future transactional stock-reservation RPC may set this true.
  -- There is currently no such RPC, so checkout and settlement remain gated.
  reservation_confirmed boolean not null default false,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  check (expires_at > created_at)
);

create table private.payos_receipts (
  provider_reference text primary key check (length(provider_reference) between 1 and 120),
  order_id uuid references private.commerce_orders(id) on delete restrict,
  order_code bigint not null,
  payment_link_id text not null,
  receiving_account text not null,
  amount_vnd bigint not null check (amount_vnd between 2000 and 100000000000),
  transferred_at timestamptz not null,
  outcome text not null check (outcome in ('paid','reconciliation')),
  created_at timestamptz not null default now()
);
create index payos_receipts_order_created on private.payos_receipts(order_id,created_at desc);

create table private.payos_fulfillment_outbox (
  order_id uuid primary key references private.commerce_orders(id) on delete restrict,
  -- A future delivery worker must explicitly implement processing and retries.
  status text not null default 'held' check(status in ('held','processing','completed','failed')),
  created_at timestamptz not null default now()
);

alter table private.payos_links enable row level security;
alter table private.payos_receipts enable row level security;
alter table private.payos_fulfillment_outbox enable row level security;
revoke all on private.payos_links,private.payos_receipts,private.payos_fulfillment_outbox
  from public,anon,authenticated,service_role;
grant usage on schema private to service_role;

-- Fail closed until the later inventory migration replaces this guard.
-- A Boolean marker alone is never proof that paid stock was reserved.
create function private.payos_reservation_is_intact(p_order uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select false
$$;
revoke all on function private.payos_reservation_is_intact(uuid)
  from public,anon,authenticated,service_role;

-- Invoked by a server-side service-role client ONLY after HMAC verification.
-- A single RPC transaction locks the order, deduplicates bank references, and
-- persists either a receipt requiring reconciliation or one verified payment.
-- It never delivers credentials or starts an external supplier purchase.
create function private.record_payos_receipt(
  p_reference text, p_code bigint, p_link_id text, p_account text,
  p_amount bigint, p_transferred_at timestamptz
) returns text language plpgsql security definer set search_path = '' as $$
declare
  existing private.payos_receipts;
  linked private.payos_links;
  ordered private.commerce_orders;
  verdict text := 'reconciliation';
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise insufficient_privilege using message='Trusted service required';
  end if;
  if p_reference is null or length(p_reference) not between 1 and 120
    or p_code is null or p_code not between 1 and 99999999999
    or p_link_id is null or length(p_link_id) not between 8 and 120
    or p_account is null or length(p_account) not between 4 and 40
    or p_amount is null or p_amount not between 2000 and 100000000000
    or p_transferred_at is null then
    raise invalid_parameter_value using message='Invalid signed receipt';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('hubby.payos:'||p_reference,0));
  select * into existing from private.payos_receipts where provider_reference=p_reference;
  if found then
    if existing.order_code<>p_code or existing.payment_link_id<>p_link_id
      or existing.receiving_account<>p_account or existing.amount_vnd<>p_amount
      or existing.transferred_at<>p_transferred_at then
      -- Same bank reference with changed signed fields is not settled twice.
      return 'reconciliation';
    end if;
    return 'duplicate';
  end if;

  select * into linked from private.payos_links where order_code=p_code;
  if found then
    select * into ordered from private.commerce_orders where id=linked.order_id for update;
    -- Lock serializes distinct references targeting the same order.
    if linked.payment_link_id=p_link_id and linked.receiving_account=p_account
      and linked.amount_vnd=p_amount and ordered.total_vnd=p_amount
      and ordered.state='pending_payment' and linked.reservation_confirmed
      and private.payos_reservation_is_intact(ordered.id)
      and now()<linked.expires_at and now()<ordered.expires_at
      and p_transferred_at>=ordered.created_at and p_transferred_at<linked.expires_at
      and not exists(select 1 from private.commerce_payments
        where order_id=ordered.id and provider='payos' and direction='in' and verification_state='verified')
      then verdict:='paid'; end if;
  end if;
  insert into private.payos_receipts(
    provider_reference,order_id,order_code,payment_link_id,receiving_account,
    amount_vnd,transferred_at,outcome
  ) values (
    p_reference,case when linked.order_id is not null then linked.order_id else null end,
    p_code,p_link_id,p_account,p_amount,p_transferred_at,verdict
  );
  if verdict='paid' then
    insert into private.commerce_payments(order_id,provider,provider_transaction,amount_vnd,direction,verification_state)
      values(ordered.id,'payos',p_reference,p_amount,'in','verified');
    update private.commerce_orders set state='paid' where id=ordered.id;
    insert into private.payos_fulfillment_outbox(order_id) values(ordered.id);
  end if;
  return verdict;
end $$;

-- The public schema is Data API-accessible; only service_role may call its
-- explicit wrapper. The real secret key must never be used in browser code.
create function public.record_payos_receipt(
  p_reference text, p_code bigint, p_link_id text, p_account text,
  p_amount bigint, p_transferred_at timestamptz
) returns text language sql security invoker set search_path = '' as $$
  select private.record_payos_receipt(p_reference,p_code,p_link_id,p_account,p_amount,p_transferred_at)
$$;
revoke all on function private.record_payos_receipt(text,bigint,text,text,bigint,timestamptz),
  public.record_payos_receipt(text,bigint,text,text,bigint,timestamptz)
  from public,anon,authenticated,service_role;
grant execute on function private.record_payos_receipt(text,bigint,text,text,bigint,timestamptz),
  public.record_payos_receipt(text,bigint,text,text,bigint,timestamptz)
  to service_role;
commit;
