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
-- Local-only draft. Apply only after encrypted inventory, service-only RPC,
-- payOS link and refund/expiry UAT are validated against an isolated database.
-- Deliberately ignores product_variants.demo_stock: it is synthetic CMS copy.
begin;

create table private.commerce_stock_units (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references public.product_variants(id) on delete restrict,
  -- AES-256-GCM payload encrypted by the Worker; encryption keys stay outside DB.
  ciphertext text not null check(length(ciphertext) between 32 and 32000),
  nonce text not null check(length(nonce) between 16 and 32),
  key_version integer not null check(key_version between 1 and 1000),
  state text not null default 'available'
    check(state in ('available','reserved','delivered','quarantined')),
  reserved_order_id uuid references private.commerce_orders(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(key_version,nonce),
  check((state='reserved' and reserved_order_id is not null)
        or (state<>'reserved' and reserved_order_id is null))
);
create index commerce_stock_available on private.commerce_stock_units(variant_id,id)
  where state='available';
create index commerce_stock_order on private.commerce_stock_units(reserved_order_id)
  where state='reserved';

create sequence private.payos_order_code_seq as bigint start with 2000000000
  increment by 1 maxvalue 99999999999 no cycle;
revoke all on sequence private.payos_order_code_seq from public,anon,authenticated;

create table private.commerce_checkout_intents (
  request_key uuid primary key,
  order_id uuid not null unique references private.commerce_orders(id) on delete restrict,
  order_code bigint not null unique check(order_code between 1 and 99999999999),
  email text not null check(length(email) between 3 and 254),
  guest_token_hash text not null check(guest_token_hash ~ '^[0-9a-f]{64}$'),
  cart_hash text not null check(cart_hash ~ '^[0-9a-f]{64}$'),
  -- A claim is durable before any non-idempotent provider request is sent.
  link_attempted_at timestamptz,
  created_at timestamptz not null default now()
);

alter table private.commerce_stock_units enable row level security;
alter table private.commerce_checkout_intents enable row level security;
revoke all on private.commerce_stock_units,private.commerce_checkout_intents
  from public,anon,authenticated,service_role;
grant usage on schema private to service_role;

-- One database transaction: validated catalog price, unique idempotency key,
-- separate numeric provider code, and real preloaded inventory reservation.
-- No coupon is silently honored without server-validated eligibility rules.
create function private.reserve_payos_checkout(
  p_request uuid,p_email text,p_guest_hash text,p_lines jsonb,p_user uuid default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  item jsonb;
  v public.product_variants;
  unit_id uuid;
  existing private.commerce_checkout_intents;
  order_id uuid;
  readable_code text;
  provider_code bigint;
  line_count integer;
  qty integer;
  running_total bigint := 0;
  required_units integer := 0;
  picked integer;
  snapshot jsonb := '[]'::jsonb;
  cart_hash text;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise insufficient_privilege using message='Trusted checkout service required';
  end if;
  if p_request is null or p_email is null or length(p_email) not between 3 and 254
    or p_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    or p_guest_hash is null or p_guest_hash !~ '^[0-9a-f]{64}$'
    or jsonb_typeof(p_lines) is distinct from 'array'
    or jsonb_array_length(p_lines) not between 1 and 20 then
    raise invalid_parameter_value using message='Invalid checkout input';
  end if;
  if p_user is not null and not exists (
    select 1 from auth.users u where u.id=p_user
      and lower(u.email)=lower(p_email)
      and u.email_confirmed_at is not null
  ) then
    raise invalid_parameter_value using message='Verified customer email mismatch';
  end if;
  -- Canonicalize cart and lock variants in consistent order for concurrency.
  select count(distinct entry.value->>'variantKey') into line_count
  from jsonb_array_elements(p_lines) as entry(value);
  if line_count <> jsonb_array_length(p_lines) then
    raise invalid_parameter_value using message='Duplicate variant';
  end if;
  select encode(pg_catalog.sha256(convert_to(p_lines::text || '|' || lower(p_email),'UTF8')),'hex')
    into cart_hash;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('hubby.checkout:'||p_request::text,0));
  select * into existing from private.commerce_checkout_intents where request_key=p_request;
  if found then
    if existing.email<>lower(p_email) or existing.guest_token_hash<>p_guest_hash
      or existing.cart_hash<>cart_hash then
      raise invalid_parameter_value using message='Checkout idempotency conflict';
    end if;
    return jsonb_build_object('orderId',existing.order_id,'orderCode',existing.order_code,
      'reused',true);
  end if;

  order_id := gen_random_uuid();
  readable_code := 'HB'||upper(substring(replace(order_id::text,'-','') from 1 for 16));
  provider_code := nextval('private.payos_order_code_seq'::regclass);
  -- First insert order, then validate and allocate under one rollback boundary.
  insert into private.commerce_orders(id,user_id,code,subtotal_vnd,total_vnd,expires_at)
  values(order_id,p_user,readable_code,1,1,now()+interval '15 minutes');
  for item in
    select entry.value from jsonb_array_elements(p_lines) as entry(value)
    order by entry.value->>'variantKey'
  loop
    if jsonb_typeof(item) is distinct from 'object'
      or (select count(*) from jsonb_object_keys(item))<>2
      or not(item ? 'variantKey' and item ? 'quantity')
      or jsonb_typeof(item->'variantKey') is distinct from 'string'
      or jsonb_typeof(item->'quantity') is distinct from 'number'
      or (item->>'quantity') !~ '^[1-9][0-9]?$' then
      raise invalid_parameter_value using message='Invalid cart item';
    end if;
    qty := (item->>'quantity')::integer;
    if qty > 20 or item->>'variantKey' !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
      raise invalid_parameter_value using message='Invalid cart item';
    end if;
    select pv.* into v from public.product_variants pv
      join public.products p on p.id=pv.product_id
      where pv.variant_key=item->>'variantKey' and pv.enabled
        and p.status='published' and pv.price_configured=true and pv.price_vnd>=2000
      for update of pv;
    if not found then
      raise invalid_parameter_value using message='Variant unavailable or unpriced';
    end if;
    running_total := running_total + v.price_vnd * qty;
    required_units := required_units + qty;
    -- Bound one automatic delivery batch to 20 sealed units on Workers Free.
    if required_units > 20 then
      raise invalid_parameter_value using message='Checkout exceeds delivery unit limit';
    end if;
    if running_total > 100000000000 then
      raise invalid_parameter_value using message='Checkout total too large';
    end if;
    insert into private.commerce_order_items(order_id,variant_id,product_name,variant_label,quantity,price_vnd)
      select order_id,v.id,p.name,v.label,qty,v.price_vnd
      from public.products p where p.id=v.product_id;
    picked := 0;
    for unit_id in select id from private.commerce_stock_units
      where variant_id=v.id and state='available'
      order by id limit qty for update skip locked
    loop
      update private.commerce_stock_units set state='reserved',reserved_order_id=order_id
        where id=unit_id;
      picked := picked+1;
    end loop;
    if picked<>qty then
      raise invalid_parameter_value using message='No verified inventory for this variant';
    end if;
  end loop;
  if required_units<1 or running_total<2000 then
    raise invalid_parameter_value using message='Checkout total too small';
  end if;
  update private.commerce_orders set subtotal_vnd=running_total,total_vnd=running_total
    where id=order_id;
  insert into private.commerce_checkout_intents(request_key,order_id,order_code,email,guest_token_hash,cart_hash)
    values(p_request,order_id,provider_code,lower(p_email),p_guest_hash,cart_hash);
  return jsonb_build_object('orderId',order_id,'orderCode',provider_code,
    'total',running_total,'expiresAt',(select expires_at from private.commerce_orders where id=order_id),
    'reused',false);
end $$;

-- Claim at most one non-idempotent create-link attempt per reserved order.
-- A timeout or lost response needs operator reconciliation with payOS using
-- its numeric order code, never a blind second POST creating a new link.
create function private.claim_payos_link_attempt(p_request uuid,p_guest_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  i private.commerce_checkout_intents;
  o private.commerce_orders;
  l private.payos_links;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise insufficient_privilege using message='Trusted payment service required';
  end if;
  select * into i from private.commerce_checkout_intents where request_key=p_request for update;
  if not found or i.guest_token_hash is distinct from p_guest_hash then
    raise insufficient_privilege using message='Checkout proof mismatch';
  end if;
  select * into o from private.commerce_orders where id=i.order_id for update;
  if o.state<>'pending_payment' or o.expires_at<=now() then
    return jsonb_build_object('status','closed');
  end if;
  select * into l from private.payos_links where order_id=o.id;
  if found then
    return jsonb_build_object('status','linked','checkoutUrl',l.checkout_url,
      'orderId',o.id,'orderCode',i.order_code);
  end if;
  if i.link_attempted_at is not null then
    return jsonb_build_object('status','uncertain','orderCode',i.order_code);
  end if;
  if (select count(*) from private.commerce_stock_units
      where reserved_order_id=o.id and state='reserved')
    is distinct from (select sum(quantity) from private.commerce_order_items where order_id=o.id) then
    raise invalid_parameter_value using message='Reservation invalid';
  end if;
  update private.commerce_checkout_intents set link_attempted_at=now()
    where request_key=p_request;
  return jsonb_build_object('status','claimed','orderId',o.id,
    'orderCode',i.order_code,'total',o.total_vnd,
    'createdAt',floor(extract(epoch from o.created_at)*1000)::bigint,
    'expiresAt',floor(extract(epoch from o.expires_at)*1000)::bigint);
end $$;

-- Attach the only accepted provider link to a reserved checkout.
-- Late/second mismatched link must go to operator reconciliation.
create function private.attach_payos_link(
  p_order uuid,p_code bigint,p_link_id text,p_account text,p_amount bigint,
  p_url text
) returns boolean language plpgsql security definer set search_path='' as $$
declare o private.commerce_orders; i private.commerce_checkout_intents; existing private.payos_links;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise insufficient_privilege using message='Trusted payment service required';
  end if;
  select * into o from private.commerce_orders where id=p_order for update;
  select * into i from private.commerce_checkout_intents where order_id=p_order;
  if o.id is null or i.order_code is distinct from p_code
    or o.total_vnd is distinct from p_amount or o.state<>'pending_payment'
    or o.expires_at<=now() or p_link_id is null or length(p_link_id) not between 8 and 120
    or p_account is null or length(p_account) not between 4 and 40
    or p_url is null or p_url !~ '^https://pay\.payos\.vn/'
    or (select count(*) from private.commerce_stock_units where reserved_order_id=p_order and state='reserved')
       is distinct from (select sum(quantity) from private.commerce_order_items where order_id=p_order)
  then raise invalid_parameter_value using message='Cannot attach unreserved link'; end if;
  select * into existing from private.payos_links where order_id=p_order;
  if found then
    return existing.order_code=p_code and existing.payment_link_id=p_link_id
      and existing.receiving_account=p_account and existing.amount_vnd=p_amount
      and existing.checkout_url=p_url;
  end if;
  insert into private.payos_links(order_id,order_code,payment_link_id,receiving_account,
    amount_vnd,checkout_url,reservation_confirmed,expires_at)
  values(p_order,p_code,p_link_id,p_account,p_amount,p_url,true,o.expires_at);
  return true;
end $$;

create function public.reserve_payos_checkout(
  p_request uuid,p_email text,p_guest_hash text,p_lines jsonb,p_user uuid default null
) returns jsonb language sql security invoker set search_path='' as $$
  select private.reserve_payos_checkout(p_request,p_email,p_guest_hash,p_lines,p_user)
$$;
create function public.attach_payos_link(
  p_order uuid,p_code bigint,p_link_id text,p_account text,p_amount bigint,p_url text
) returns boolean language sql security invoker set search_path='' as $$
  select private.attach_payos_link(p_order,p_code,p_link_id,p_account,p_amount,p_url)
$$;
create function public.claim_payos_link_attempt(p_request uuid,p_guest_hash text)
returns jsonb language sql security invoker set search_path='' as $$
  select private.claim_payos_link_attempt(p_request,p_guest_hash)
$$;
revoke all on function private.reserve_payos_checkout(uuid,text,text,jsonb,uuid),
  public.reserve_payos_checkout(uuid,text,text,jsonb,uuid),
  private.attach_payos_link(uuid,bigint,text,text,bigint,text),
  public.attach_payos_link(uuid,bigint,text,text,bigint,text),
  private.claim_payos_link_attempt(uuid,text),
  public.claim_payos_link_attempt(uuid,text)
  from public,anon,authenticated,service_role;
grant execute on function private.reserve_payos_checkout(uuid,text,text,jsonb,uuid),
  public.reserve_payos_checkout(uuid,text,text,jsonb,uuid),
  private.attach_payos_link(uuid,bigint,text,text,bigint,text),
  public.attach_payos_link(uuid,bigint,text,text,bigint,text),
  private.claim_payos_link_attempt(uuid,text),
  public.claim_payos_link_attempt(uuid,text) to service_role;
grant usage,select on sequence private.payos_order_code_seq to service_role;
commit;
-- Prepared LOCALLY. Do not apply to the hosted database before payOS UAT,
-- secret rotation and the Owner's inventory/delivery policy are accepted.
-- All entry points below are service-only; customers never read this schema.
begin;

create table private.commerce_delivery_units (
  stock_unit_id uuid primary key references private.commerce_stock_units(id) on delete restrict,
  order_id uuid not null references private.commerce_orders(id) on delete restrict,
  order_item_id uuid not null references private.commerce_order_items(id) on delete restrict,
  delivered_at timestamptz not null default now()
);
create index commerce_delivery_order on private.commerce_delivery_units(order_id);
alter table private.commerce_delivery_units enable row level security;
revoke all on private.commerce_delivery_units from public,anon,authenticated,service_role;

-- The settlement RPC installed by the first migration deliberately denies
-- payment until real inventory exists. Replace its guard once all stock and
-- order-item tables are present; verify quantities per variant as well as total.
create or replace function private.payos_reservation_is_intact(p_order uuid)
returns boolean language sql volatile security definer set search_path='' as $$
  select exists (
    select 1 from private.commerce_orders o
    where o.id=p_order
      and (select coalesce(sum(quantity),0) from private.commerce_order_items i
           where i.order_id=p_order) between 1 and 20
      and (select count(*) from private.commerce_stock_units s
           where s.reserved_order_id=p_order and s.state='reserved') =
          (select sum(quantity) from private.commerce_order_items i
           where i.order_id=p_order)
      and not exists (
        select 1 from private.commerce_order_items i
        where i.order_id=p_order
          and (select count(*) from private.commerce_stock_units s
               where s.reserved_order_id=p_order and s.state='reserved'
                 and s.variant_id=i.variant_id) <> i.quantity
      )
      and not exists (
        select 1 from private.commerce_stock_units s
        where s.reserved_order_id=p_order and s.state='reserved'
          and not exists (
            select 1 from private.commerce_order_items i
            where i.order_id=p_order and i.variant_id=s.variant_id
          )
      )
      and not exists (
        select 1 from private.commerce_delivery_units d where d.order_id=p_order
      )
  )
$$;
revoke all on function private.payos_reservation_is_intact(uuid)
  from public,anon,authenticated,service_role;

alter table private.payos_fulfillment_outbox
  add column claim_token uuid,
  add column lease_until timestamptz,
  add column attempts smallint not null default 0 check(attempts between 0 and 4),
  add column next_attempt_at timestamptz not null default now(),
  add column last_issue text check(last_issue in ('stock_mismatch','decrypt_failed','service_unavailable'));
create index payos_outbox_next on private.payos_fulfillment_outbox(next_attempt_at,created_at)
  where status in ('held','failed','processing');

-- Only the trusted Worker may provision already encrypted units. The caller
-- must create a UUID and AES-GCM ciphertext bound to that UUID and variant.
create function private.provision_payos_stock(
  p_id uuid,p_variant uuid,p_ciphertext text,p_nonce text,p_key_version integer
) returns boolean language plpgsql security definer set search_path='' as $$
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise insufficient_privilege using message='Trusted inventory service required';
  end if;
  if p_id is null or p_variant is null or p_ciphertext is null
    or length(p_ciphertext) not between 32 and 32000 or p_nonce is null
    or length(p_nonce) not between 16 and 32 or p_key_version not between 1 and 1000
    or not exists(select 1 from public.product_variants where id=p_variant) then
    raise invalid_parameter_value using message='Invalid encrypted inventory';
  end if;
  insert into private.commerce_stock_units(id,variant_id,ciphertext,nonce,key_version)
    values(p_id,p_variant,p_ciphertext,p_nonce,p_key_version);
  return true;
end $$;

-- One lease at a time. A claimed unit stays reserved until the Worker proves
-- Owner-only aggregation: no ciphertext or credentials in these results.
create function private.payos_stock_counts() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise insufficient_privilege using message='Trusted inventory service required';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'variantId', totals.variant_id,
      'available', totals.available,
      'reserved', totals.reserved,
      'delivered', totals.delivered,
      'quarantined', totals.quarantined
    ) order by totals.variant_id),'[]'::jsonb)
    from (
      select s.variant_id,
        count(*) filter(where s.state='available')::integer as available,
        count(*) filter(where s.state='reserved')::integer as reserved,
        count(*) filter(where s.state='delivered')::integer as delivered,
        count(*) filter(where s.state='quarantined')::integer as quarantined
      from private.commerce_stock_units s group by s.variant_id
    ) totals
  );
end $$;

-- One lease at a time. A claimed unit stays reserved until the Worker proves
-- that every encrypted payload opens correctly. No plaintext enters Postgres.
create function private.claim_payos_fulfillment() returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  job private.payos_fulfillment_outbox;
  lease uuid;
  units jsonb;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise insufficient_privilege using message='Trusted delivery service required';
  end if;
  select b.* into job from private.payos_fulfillment_outbox b
    join private.commerce_orders o on o.id=b.order_id
    where o.state='paid' and b.attempts<4
      and b.next_attempt_at<=now()
      and (b.status in ('held','failed')
        or (b.status='processing' and b.lease_until<now()))
    order by b.created_at,b.order_id limit 1 for update of b skip locked;
  if not found then return null; end if;
  lease := gen_random_uuid();
  update private.payos_fulfillment_outbox
    set status='processing',claim_token=lease,lease_until=now()+interval '2 minutes',
        attempts=attempts+1,last_issue=null
    where order_id=job.order_id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',s.id,'variantId',s.variant_id,'ciphertext',s.ciphertext,
    'nonce',s.nonce,'key_version',s.key_version) order by s.id),'[]'::jsonb)
  into units from private.commerce_stock_units s
    where s.reserved_order_id=job.order_id and s.state='reserved';
  return jsonb_build_object('orderId',job.order_id,'lease',lease,'units',units);
end $$;

-- Single transaction commits delivery rows, unique stock ownership, order
-- status and outbox status. A replay of a completed lease is harmless.
create function private.complete_payos_fulfillment(p_order uuid,p_lease uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare
  job private.payos_fulfillment_outbox;
  ordered private.commerce_orders;
  expected integer;
  actual integer;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise insufficient_privilege using message='Trusted delivery service required';
  end if;
  if p_order is null or p_lease is null then
    raise invalid_parameter_value using message='Invalid lease';
  end if;
  select * into job from private.payos_fulfillment_outbox
    where order_id=p_order for update;
  if not found then return false; end if;
  if job.status='completed' then return job.claim_token=p_lease; end if;
  if job.status<>'processing' or job.claim_token is distinct from p_lease
    or job.lease_until<=now() then return false; end if;
  select * into ordered from private.commerce_orders where id=p_order for update;
  if ordered.state<>'paid' or not exists(
    select 1 from private.commerce_payments
    where order_id=p_order and provider='payos' and direction='in'
      and verification_state='verified'
  ) then return false; end if;
  select coalesce(sum(quantity),0) into expected from private.commerce_order_items
    where order_id=p_order;
  select count(*) into actual from private.commerce_stock_units
    where reserved_order_id=p_order and state='reserved';
  if expected=0 or actual<>expected or exists(
    select 1 from private.commerce_order_items i
    where i.order_id=p_order and i.quantity <> (
      select count(*) from private.commerce_stock_units s
      where s.state='reserved' and s.reserved_order_id=p_order and s.variant_id=i.variant_id
    )
  ) or exists(select 1 from private.commerce_delivery_units where order_id=p_order)
  then return false; end if;
  insert into private.commerce_delivery_units(stock_unit_id,order_id,order_item_id)
    select s.id,p_order,i.id from private.commerce_stock_units s
    join private.commerce_order_items i on i.order_id=p_order and i.variant_id=s.variant_id
    where s.reserved_order_id=p_order and s.state='reserved';
  update private.commerce_stock_units set state='delivered',reserved_order_id=null
    where reserved_order_id=p_order and state='reserved';
  update private.commerce_orders set state='delivered' where id=p_order;
  update private.payos_fulfillment_outbox
    set status='completed',lease_until=null,next_attempt_at=now()
    where order_id=p_order;
  return true;
end $$;

-- Failure is explicit and retried with a bounded backoff; never mint another
-- unit or silently mark an order delivered on corrupted ciphertext.
create function private.fail_payos_fulfillment(
  p_order uuid,p_lease uuid,p_issue text
) returns boolean language plpgsql security definer set search_path='' as $$
declare job private.payos_fulfillment_outbox;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise insufficient_privilege using message='Trusted delivery service required';
  end if;
  if p_issue not in ('stock_mismatch','decrypt_failed','service_unavailable') then
    raise invalid_parameter_value using message='Invalid delivery issue';
  end if;
  select * into job from private.payos_fulfillment_outbox
    where order_id=p_order for update;
  if not found or job.status<>'processing' or job.claim_token is distinct from p_lease
    then return false; end if;
  update private.payos_fulfillment_outbox
    set status='failed',lease_until=null,last_issue=p_issue,
      next_attempt_at=now()+make_interval(mins=>case
        when job.attempts=1 then 1 when job.attempts=2 then 5 else 30 end)
    where order_id=p_order;
  return true;
end $$;

-- The Worker may retrieve ciphertext only for a verified, completed and
-- registered customer's own order. Guest delivery requires a separate
-- order-scoped proof and is intentionally unavailable in this first version.
-- Even a service caller receives no rows for another customer, pending
-- settlement, incomplete inventory, or partially delivered orders.
create function private.read_payos_delivery(p_order uuid,p_actor uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare expected integer; actual integer;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise insufficient_privilege using message='Trusted delivery reader required';
  end if;
  if p_order is null or p_actor is null or not exists(
    select 1 from private.commerce_orders o
    join private.payos_fulfillment_outbox b on b.order_id=o.id
    where o.id=p_order and o.user_id=p_actor and o.state='delivered'
      and b.status='completed'
      and exists(select 1 from private.commerce_payments p
        where p.order_id=o.id and p.provider='payos' and p.direction='in'
          and p.verification_state='verified')
  ) then return null; end if;
  select coalesce(sum(quantity),0) into expected from private.commerce_order_items
    where order_id=p_order;
  select count(*) into actual from private.commerce_delivery_units d
    join private.commerce_stock_units s on s.id=d.stock_unit_id
    where d.order_id=p_order and s.state='delivered'
      and s.reserved_order_id is null;
  if expected not between 1 and 20 or actual<>expected or exists(
    select 1 from private.commerce_order_items i where i.order_id=p_order
      and (select count(*) from private.commerce_delivery_units d
        join private.commerce_stock_units s on s.id=d.stock_unit_id
        where d.order_id=p_order and d.order_item_id=i.id
          and s.variant_id=i.variant_id and s.state='delivered')<>i.quantity
  ) or exists(
    select 1 from private.commerce_delivery_units d
    join private.commerce_stock_units s on s.id=d.stock_unit_id
    left join private.commerce_order_items i on i.id=d.order_item_id
    where d.order_id=p_order and (i.id is null or i.order_id<>p_order
      or i.variant_id<>s.variant_id or s.state<>'delivered')
  ) then return null; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
    'id',s.id,'variantId',s.variant_id,'ciphertext',s.ciphertext,
    'nonce',s.nonce,'key_version',s.key_version) order by s.id),'[]'::jsonb)
    from private.commerce_delivery_units d
    join private.commerce_stock_units s on s.id=d.stock_unit_id
    where d.order_id=p_order);
end $$;

create function public.provision_payos_stock(
  p_id uuid,p_variant uuid,p_ciphertext text,p_nonce text,p_key_version integer
) returns boolean language sql security invoker set search_path='' as $$
  select private.provision_payos_stock(p_id,p_variant,p_ciphertext,p_nonce,p_key_version)
$$;
create function public.payos_stock_counts() returns jsonb
language sql security invoker set search_path='' as $$
  select private.payos_stock_counts()
$$;
create function public.claim_payos_fulfillment() returns jsonb
language sql security invoker set search_path='' as $$
  select private.claim_payos_fulfillment()
$$;
create function public.complete_payos_fulfillment(p_order uuid,p_lease uuid)
returns boolean language sql security invoker set search_path='' as $$
  select private.complete_payos_fulfillment(p_order,p_lease)
$$;
create function public.fail_payos_fulfillment(
  p_order uuid,p_lease uuid,p_issue text
) returns boolean language sql security invoker set search_path='' as $$
  select private.fail_payos_fulfillment(p_order,p_lease,p_issue)
$$;
create function public.read_payos_delivery(p_order uuid,p_actor uuid)
returns jsonb language sql security invoker set search_path='' as $$
  select private.read_payos_delivery(p_order,p_actor)
$$;

revoke all on function
  private.provision_payos_stock(uuid,uuid,text,text,integer),
  public.provision_payos_stock(uuid,uuid,text,text,integer),
  private.payos_stock_counts(),public.payos_stock_counts(),
  private.claim_payos_fulfillment(),public.claim_payos_fulfillment(),
  private.complete_payos_fulfillment(uuid,uuid),
  public.complete_payos_fulfillment(uuid,uuid),
  private.fail_payos_fulfillment(uuid,uuid,text),
  public.fail_payos_fulfillment(uuid,uuid,text),
  private.read_payos_delivery(uuid,uuid),public.read_payos_delivery(uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function
  private.provision_payos_stock(uuid,uuid,text,text,integer),
  public.provision_payos_stock(uuid,uuid,text,text,integer),
  private.payos_stock_counts(),public.payos_stock_counts(),
  private.claim_payos_fulfillment(),public.claim_payos_fulfillment(),
  private.complete_payos_fulfillment(uuid,uuid),
  public.complete_payos_fulfillment(uuid,uuid),
  private.fail_payos_fulfillment(uuid,uuid,text),
  public.fail_payos_fulfillment(uuid,uuid,text),
  private.read_payos_delivery(uuid,uuid),public.read_payos_delivery(uuid,uuid)
  to service_role;
commit;
-- Local staging draft. Never run on the hosted database before transaction UAT.
-- Reclaim ONLY expired reservations for which the durable payOS create-link
-- attempt was never claimed. An attempted/linked checkout can have money in
-- transit and must NOT release stock without provider/bank reconciliation.
begin;

create function private.expire_unsubmitted_payos_checkouts(p_limit integer default 10)
returns integer language plpgsql security definer set search_path='' as $$
declare
  candidate record;
  expected_units integer;
  released integer := 0;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise insufficient_privilege using message='Trusted payment maintenance service required';
  end if;
  if p_limit is null or p_limit not between 1 and 20 then
    raise invalid_parameter_value using message='Invalid maintenance batch limit';
  end if;

  -- Match claim_payos_link_attempt lock ordering: intent before order.
  -- SKIP LOCKED avoids racing an in-progress claim or another maintainer.
  for candidate in
    select i.request_key,i.order_id,i.order_code from private.commerce_checkout_intents i
      join private.commerce_orders o on o.id=i.order_id
    where i.link_attempted_at is null and o.state='pending_payment'
      and o.expires_at<=now()
    order by o.expires_at,i.request_key
    limit p_limit for update of i skip locked
  loop
    perform 1 from private.commerce_orders o where o.id=candidate.order_id for update;
    if not exists (
      select 1 from private.commerce_orders o
        join private.commerce_checkout_intents i on i.order_id=o.id
      where o.id=candidate.order_id and o.state='pending_payment'
        and o.expires_at<=now() and i.link_attempted_at is null
    ) or exists (
      select 1 from private.payos_links where order_id=candidate.order_id
    ) or exists (
      select 1 from private.payos_receipts
      where order_id=candidate.order_id or order_code=candidate.order_code
    ) or exists (
      select 1 from private.commerce_payments where order_id=candidate.order_id
    ) or exists (
      select 1 from private.payos_fulfillment_outbox where order_id=candidate.order_id
    ) or exists (
      select 1 from private.commerce_delivery_units where order_id=candidate.order_id
    ) then continue; end if;

    select coalesce(sum(quantity),0)::integer into expected_units
      from private.commerce_order_items where order_id=candidate.order_id;
    -- Never quietly repair inconsistent reservations. Preserve them for audit.
    if expected_units not between 1 and 20
      or (select count(*) from private.commerce_stock_units
          where reserved_order_id=candidate.order_id and state='reserved')<>expected_units
      or exists (
        select 1 from private.commerce_order_items item
        where item.order_id=candidate.order_id and item.quantity <>
          (select count(*) from private.commerce_stock_units stock
            where stock.reserved_order_id=candidate.order_id
              and stock.state='reserved' and stock.variant_id=item.variant_id)
      ) then continue; end if;

    update private.commerce_stock_units
      set state='available',reserved_order_id=null
      where reserved_order_id=candidate.order_id and state='reserved';
    update private.commerce_orders set state='expired'
      where id=candidate.order_id and state='pending_payment';
    released := released+1;
  end loop;
  return released;
end $$;

create function public.expire_unsubmitted_payos_checkouts(p_limit integer default 10)
returns integer language sql security invoker set search_path='' as $$
  select private.expire_unsubmitted_payos_checkouts(p_limit)
$$;
revoke all on function
  private.expire_unsubmitted_payos_checkouts(integer),
  public.expire_unsubmitted_payos_checkouts(integer)
  from public,anon,authenticated,service_role;
grant execute on function
  private.expire_unsubmitted_payos_checkouts(integer),
  public.expire_unsubmitted_payos_checkouts(integer)
  to service_role;
commit;
-- Local-only follow-up after payOS reservations and delivery migrations.
-- Browser-bound 256-bit secret is never stored in cleartext. No anonymous
-- PostgREST role is granted access to these privileged lookup functions.
begin;

create function private.guest_order_by_proof(
  p_code text, p_email text, p_guest_hash text
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare matched uuid;
begin
  if coalesce(auth.jwt()->>'role','')<>'service_role' then
    raise insufficient_privilege using message='Trusted guest order reader required';
  end if;
  if p_code is null or p_code !~ '^HB[A-F0-9]{16}$'
    or p_email is null or length(p_email) not between 3 and 254
    or p_guest_hash is null or p_guest_hash !~ '^[a-f0-9]{64}$'
  then return null; end if;

  select o.id into matched from private.commerce_orders o
    join private.commerce_checkout_intents i on i.order_id=o.id
    where o.code=p_code and o.user_id is null
      and i.email=lower(btrim(p_email))
      and i.guest_token_hash=p_guest_hash;
  if matched is null then return null; end if;
  return private.commerce_order_projection(matched);
end $$;

-- Ciphertext is accessible to trusted Worker only when receipt, outbox,
-- full variant-matched delivery, and the browser-held proof all match.
-- Mirrors the registered-delivery integrity checks without granting a
-- guest access to another account's data or to order IDs alone.
create function private.read_guest_payos_delivery(
  p_code text, p_email text, p_guest_hash text
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare claimed_order uuid; expected integer; actual integer;
begin
  if coalesce(auth.jwt()->>'role','')<>'service_role' then
    raise insufficient_privilege using message='Trusted guest delivery reader required';
  end if;
  if p_code is null or p_code !~ '^HB[A-F0-9]{16}$'
    or p_email is null or length(p_email) not between 3 and 254
    or p_guest_hash is null or p_guest_hash !~ '^[a-f0-9]{64}$'
  then return null; end if;

  select o.id into claimed_order from private.commerce_orders o
    join private.commerce_checkout_intents i on i.order_id=o.id
    join private.payos_fulfillment_outbox b on b.order_id=o.id
    where o.code=p_code and o.user_id is null
      and i.email=lower(btrim(p_email))
      and i.guest_token_hash=p_guest_hash
      and o.state='delivered' and b.status='completed'
      and exists(select 1 from private.commerce_payments p
        where p.order_id=o.id and p.provider='payos' and p.direction='in'
          and p.verification_state='verified');
  if claimed_order is null then return null; end if;

  select coalesce(sum(quantity),0) into expected from private.commerce_order_items
    where order_id=claimed_order;
  select count(*) into actual from private.commerce_delivery_units d
    join private.commerce_stock_units s on s.id=d.stock_unit_id
    where d.order_id=claimed_order and s.state='delivered'
      and s.reserved_order_id is null;
  if expected not between 1 and 20 or actual<>expected or exists(
    select 1 from private.commerce_order_items i where i.order_id=claimed_order
      and (select count(*) from private.commerce_delivery_units d
        join private.commerce_stock_units s on s.id=d.stock_unit_id
        where d.order_id=claimed_order and d.order_item_id=i.id
          and s.variant_id=i.variant_id and s.state='delivered')<>i.quantity
  ) or exists(
    select 1 from private.commerce_delivery_units d
      join private.commerce_stock_units s on s.id=d.stock_unit_id
      left join private.commerce_order_items i on i.id=d.order_item_id
    where d.order_id=claimed_order and (i.id is null or i.order_id<>claimed_order
        or i.variant_id<>s.variant_id or s.state<>'delivered')
  ) then return null; end if;

  return (select coalesce(jsonb_agg(jsonb_build_object(
    'id',s.id,'variantId',s.variant_id,'ciphertext',s.ciphertext,
    'nonce',s.nonce,'key_version',s.key_version) order by s.id),'[]'::jsonb)
    from private.commerce_delivery_units d
    join private.commerce_stock_units s on s.id=d.stock_unit_id
    where d.order_id=claimed_order);
end $$;

create function public.guest_order_by_proof(
  p_code text,p_email text,p_guest_hash text
) returns jsonb language sql stable security invoker set search_path='' as $$
  select private.guest_order_by_proof(p_code,p_email,p_guest_hash)
$$;
create function public.read_guest_payos_delivery(
  p_code text,p_email text,p_guest_hash text
) returns jsonb language sql stable security invoker set search_path='' as $$
  select private.read_guest_payos_delivery(p_code,p_email,p_guest_hash)
$$;

revoke all on function private.guest_order_by_proof(text,text,text),
  public.guest_order_by_proof(text,text,text),
  private.read_guest_payos_delivery(text,text,text),
  public.read_guest_payos_delivery(text,text,text)
  from public,anon,authenticated,service_role;
grant execute on function private.guest_order_by_proof(text,text,text),
  public.guest_order_by_proof(text,text,text),
  private.read_guest_payos_delivery(text,text,text),
  public.read_guest_payos_delivery(text,text,text)
  to service_role;
commit;
-- A verified email owner may explicitly attach their historical guest order
-- to the same authenticated customer. No payment or stock state is touched.
begin;

create table private.guest_order_claim_events (
  order_id uuid primary key references private.commerce_orders(id) on delete restrict,
  actor_id uuid not null references auth.users(id) on delete restrict,
  claimed_at timestamptz not null default now()
);
create index guest_order_claim_events_actor on private.guest_order_claim_events(actor_id,claimed_at desc);
alter table private.guest_order_claim_events enable row level security;
revoke all on private.guest_order_claim_events from public,anon,authenticated,service_role;

create function private.claim_verified_guest_order(p_code text,p_email text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor uuid := private.customer_actor();
  verified_email text;
  normalized_email text := lower(btrim(coalesce(p_email,'')));
  found_order uuid;
  current_owner uuid;
begin
  if p_code is null or p_code !~ '^HB[A-F0-9]{16}$'
    or length(normalized_email) not between 3 and 254 then
    return null;
  end if;
  select lower(btrim(u.email)) into verified_email
    from auth.users u where u.id=actor and u.email_confirmed_at is not null;
  if verified_email is null or verified_email<>normalized_email then
    return null;
  end if;
  -- Lock the order, not the checkout intent. Concurrent actors cannot both claim.
  select o.id,o.user_id into found_order,current_owner
    from private.commerce_orders o
    join private.commerce_checkout_intents ci on ci.order_id=o.id
    where o.code=p_code and lower(btrim(ci.email))=verified_email
    for update of o;
  if not found or (current_owner is not null and current_owner<>actor) then
    return null;
  end if;
  if current_owner is null then
    update private.commerce_orders set user_id=actor where id=found_order;
    insert into private.guest_order_claim_events(order_id,actor_id)
      values(found_order,actor);
  end if;
  return private.commerce_order_projection(found_order);
end $$;

create function private.customer_order_by_code(p_code text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid := private.customer_actor(); found_order uuid;
begin
  if p_code is null or p_code !~ '^HB[A-F0-9]{16}$' then return null; end if;
  select id into found_order from private.commerce_orders
    where code=p_code and user_id=actor;
  if not found then return null; end if;
  return private.commerce_order_projection(found_order);
end $$;

create function public.claim_verified_guest_order(p_code text,p_email text)
returns jsonb language sql security invoker set search_path='' as $$
  select private.claim_verified_guest_order(p_code,p_email)
$$;
create function public.customer_order_by_code(p_code text)
returns jsonb language sql stable security invoker set search_path='' as $$
  select private.customer_order_by_code(p_code)
$$;

revoke all on function private.claim_verified_guest_order(text,text),
  private.customer_order_by_code(text),
  public.claim_verified_guest_order(text,text),
  public.customer_order_by_code(text)
  from public,anon,authenticated,service_role;
grant execute on function private.claim_verified_guest_order(text,text),
  private.customer_order_by_code(text),
  public.claim_verified_guest_order(text,text),
  public.customer_order_by_code(text) to authenticated;
commit;
-- Prepared locally. Requires all preceding payOS migrations. Do not apply to
-- remote staging until stock/payment UAT and secret rotation are complete.
-- Owner casework audit: never auto-refund, auto-settle, or re-issue stock.
begin;

-- Append-only manual review history, separate from authoritative bank/payment
-- and delivery state. An operator's "resolved" is NOT proof of settlement.
create table private.payos_review_events (
  id bigint generated always as identity primary key,
  kind text not null check(kind in ('receipt_review','link_unknown','delivery_exhausted')),
  case_id text not null check(length(case_id) between 1 and 120),
  actor_id uuid not null references auth.users(id) on delete restrict,
  action text not null check(action in ('note','resolve','reopen')),
  status text not null check(status in ('open','resolved')),
  note text not null check(length(btrim(note)) between 3 and 1000),
  created_at timestamptz not null default now()
);
create index payos_review_events_case_latest
  on private.payos_review_events(kind,case_id,id desc);
alter table private.payos_review_events enable row level security;
revoke all on private.payos_review_events from public,anon,authenticated,service_role;

create function private.payos_review_case(
  p_kind text,p_case_id text,p_actor_id uuid,p_action text,p_note text
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  next_status text;
  existing_status text;
  is_case boolean := false;
  review_id bigint;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise insufficient_privilege using message='Trusted payment operations service required';
  end if;
  if p_kind is null or p_kind not in ('receipt_review','link_unknown','delivery_exhausted')
    or p_case_id is null or length(p_case_id) not between 1 and 120
    or p_actor_id is null or p_action is null or p_action not in ('note','resolve','reopen')
    or p_note is null or length(btrim(p_note)) not between 3 and 1000 then
    raise invalid_parameter_value using message='Invalid payment review input';
  end if;
  -- This RPC is only called by a verified Owner server action. Never trust a
  -- client-supplied actor ID, and also verify the membership again in SQL.
  if not exists(select 1 from private.role_memberships
     where user_id=p_actor_id and role='owner' and revoked_at is null) then
    raise insufficient_privilege using message='Owner required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('hubby.payos.review:'||p_kind||':'||p_case_id,0)
  );
  if p_kind='receipt_review' then
    select exists(select 1 from private.payos_receipts
      where provider_reference=p_case_id and outcome='reconciliation') into is_case;
  elsif p_kind='link_unknown' then
    select exists(select 1 from private.commerce_checkout_intents i
      where i.order_id::text=p_case_id and i.link_attempted_at is not null
      and not exists(select 1 from private.payos_links l where l.order_id=i.order_id)) into is_case;
  else
    select exists(select 1 from private.payos_fulfillment_outbox b
      where b.order_id::text=p_case_id and b.attempts>=4 and b.status<>'completed') into is_case;
  end if;
  if not is_case then
    raise invalid_parameter_value using message='Payment review case no longer available';
  end if;
  select status into existing_status from private.payos_review_events
    where kind=p_kind and case_id=p_case_id order by id desc limit 1;
  next_status := case p_action when 'resolve' then 'resolved'
    when 'reopen' then 'open' else coalesce(existing_status,'open') end;
  insert into private.payos_review_events(kind,case_id,actor_id,action,status,note)
    values(p_kind,p_case_id,p_actor_id,p_action,next_status,btrim(p_note))
    returning id into review_id;
  return pg_catalog.jsonb_build_object('id',review_id,'status',next_status);
end $$;

create function public.payos_review_case(
  p_kind text,p_case_id text,p_actor_id uuid,p_action text,p_note text
) returns jsonb language sql volatile security invoker set search_path='' as $$
  select private.payos_review_case(p_kind,p_case_id,p_actor_id,p_action,p_note)
$$;
revoke all on function private.payos_review_case(text,text,uuid,text,text),
  public.payos_review_case(text,text,uuid,text,text)
  from public,anon,authenticated,service_role;
grant execute on function private.payos_review_case(text,text,uuid,text,text),
  public.payos_review_case(text,text,uuid,text,text) to service_role;

create function private.payos_reconciliation_queue(p_limit integer default 40,p_status text default 'open')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  result jsonb;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise insufficient_privilege using message='Trusted payment operations service required';
  end if;
  if p_limit is null or p_limit not between 1 and 100 then
    raise invalid_parameter_value using message='Invalid payment queue limit';
  end if;
  if p_status is null or p_status not in ('open','resolved') then
    raise invalid_parameter_value using message='Invalid payment review filter';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'kind', q.kind,
    'caseId', q.case_id,
    'orderCode', q.order_code,
    'orderId', q.order_id,
    'occurredAt', floor(extract(epoch from q.occurred_at)*1000)::bigint,
    'amountVnd', q.amount_vnd,
    'reviewStatus',coalesce(q.review_status,'open'),
    'reviewNote',q.review_note,
    'reviewedAt',case when q.reviewed_at is null then null
      else floor(extract(epoch from q.reviewed_at)*1000)::bigint end
  ) order by q.occurred_at desc,q.order_code),'[]'::jsonb)
  into result from (
    select src.*, latest.status as review_status,
      latest.note as review_note,latest.created_at as reviewed_at
    from (
    -- HMAC-authenticated receipts that failed the strict payment acceptance
    -- rules: late, unknown, duplicate payment or mismatched bank information.
    select 'receipt_review'::text as kind, r.provider_reference as case_id, r.order_code,
      r.order_id,r.transferred_at as occurred_at,r.amount_vnd
    from private.payos_receipts r where r.outcome='reconciliation'
    union all
    -- Once link creation was attempted, a timeout is ambiguous. These stock
    -- reservations must NOT be returned to inventory by an expiry job.
    select 'link_unknown', i.order_id::text,i.order_code,i.order_id,i.link_attempted_at,
      o.total_vnd
    from private.commerce_checkout_intents i
      join private.commerce_orders o on o.id=i.order_id
    where i.link_attempted_at is not null
      and not exists(select 1 from private.payos_links l where l.order_id=i.order_id)
    union all
    -- Exhausted automatic deliveries require manual inspection; paid status
    -- alone must never imply that encrypted goods were delivered.
    select 'delivery_exhausted',b.order_id::text,i.order_code,b.order_id,
      coalesce(b.lease_until,b.created_at),o.total_vnd
    from private.payos_fulfillment_outbox b
      join private.commerce_checkout_intents i on i.order_id=b.order_id
      join private.commerce_orders o on o.id=b.order_id
    where b.attempts>=4 and b.status<>'completed'
    ) src
    left join lateral (
      select e.status,e.note,e.created_at from private.payos_review_events e
      where e.kind=src.kind and e.case_id=src.case_id
      order by e.id desc limit 1
    ) latest on true
    where coalesce(latest.status,'open')=p_status
  order by src.occurred_at desc,src.order_code
  limit p_limit) q;
  return result;
end $$;

create function public.payos_reconciliation_queue(p_limit integer default 40,p_status text default 'open')
returns jsonb language sql stable security invoker set search_path='' as $$
  select private.payos_reconciliation_queue(p_limit,p_status)
$$;
revoke all on function private.payos_reconciliation_queue(integer,text),
  public.payos_reconciliation_queue(integer,text)
  from public,anon,authenticated,service_role;
grant execute on function private.payos_reconciliation_queue(integer,text),
  public.payos_reconciliation_queue(integer,text) to service_role;
commit;
-- Local-only migration. Do not apply remotely without staged payOS UAT.
-- No ciphertext or plaintext credentials leave the private schema.
begin;

create table private.commerce_stock_quarantine_audit (
  id bigint generated always as identity primary key,
  stock_unit_id uuid not null references private.commerce_stock_units(id) on delete restrict,
  actor_id uuid not null references auth.users(id) on delete restrict,
  reason text not null check(reason in ('invalid','compromised','expired','other')),
  created_at timestamptz not null default now()
);
create index commerce_stock_quarantine_audit_stock
  on private.commerce_stock_quarantine_audit(stock_unit_id,created_at);
alter table private.commerce_stock_quarantine_audit enable row level security;
revoke all on private.commerce_stock_quarantine_audit
  from public,anon,authenticated,service_role;

-- Only non-secret identifiers/statuses. Cap at 100 even for privileged callers.
create function private.list_payos_stock_units(p_limit integer default 50)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise insufficient_privilege using message='Trusted inventory service required';
  end if;
  if p_limit is null or p_limit not between 1 and 100 then
    raise invalid_parameter_value using message='Invalid page size';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',s.id,'variantId',s.variant_id,'state',s.state,
      'createdAt',s.created_at) order by s.created_at desc,s.id desc),'[]'::jsonb)
    from (select id,variant_id,state,created_at
      from private.commerce_stock_units
      where state in ('available','quarantined')
      order by created_at desc,id desc limit p_limit) s
  );
end $$;

-- Atomic compare-and-set: already reserved/delivered/quarantined units are
-- NEVER mutated. Owner identity comes from verified server session only.
create function private.quarantine_payos_stock(
  p_stock uuid,p_actor uuid,p_reason text
) returns boolean language plpgsql security definer set search_path='' as $$
declare changed uuid;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise insufficient_privilege using message='Trusted inventory service required';
  end if;
  if p_stock is null or p_actor is null or p_reason is null
    or p_reason not in ('invalid','compromised','expired','other')
    or not exists(select 1 from private.role_memberships
      where user_id=p_actor and role='owner' and revoked_at is null) then
    raise invalid_parameter_value using message='Invalid quarantine request';
  end if;
  update private.commerce_stock_units
     set state='quarantined'
   where id=p_stock and state='available' and reserved_order_id is null
   returning id into changed;
  if changed is null then return false; end if;
  insert into private.commerce_stock_quarantine_audit(stock_unit_id,actor_id,reason)
    values(changed,p_actor,p_reason);
  return true;
end $$;

create function public.list_payos_stock_units(p_limit integer default 50)
returns jsonb language sql security invoker set search_path='' as $$
  select private.list_payos_stock_units(p_limit)
$$;
create function public.quarantine_payos_stock(
  p_stock uuid,p_actor uuid,p_reason text
) returns boolean language sql security invoker set search_path='' as $$
  select private.quarantine_payos_stock(p_stock,p_actor,p_reason)
$$;

revoke all on function
  private.list_payos_stock_units(integer),public.list_payos_stock_units(integer),
  private.quarantine_payos_stock(uuid,uuid,text),public.quarantine_payos_stock(uuid,uuid,text)
  from public,anon,authenticated,service_role;
grant execute on function
  private.list_payos_stock_units(integer),public.list_payos_stock_units(integer),
  private.quarantine_payos_stock(uuid,uuid,text),public.quarantine_payos_stock(uuid,uuid,text)
  to service_role;
commit;
-- Local-only: retrieve an already-issued payOS checkout URL for a verified
-- browser/owner. No provider requests, new reservations, or state mutation.
-- Never deploy this before the prerequisite checkout/stock migrations pass UAT.
begin;

create function private.resumable_payos_link(p_order uuid)
returns text language sql stable security definer set search_path='' as $$
  select l.checkout_url from private.commerce_orders o
    join private.commerce_checkout_intents i on i.order_id=o.id
    join private.payos_links l on l.order_id=o.id
    where o.id=p_order and o.state='pending_payment'
      and o.expires_at>now() and l.expires_at>now()
      and l.reservation_confirmed=true
      and l.amount_vnd=o.total_vnd and i.order_code=l.order_code
      and i.link_attempted_at is not null
      and l.checkout_url ~ '^https://pay\.payos\.vn/'
      and (select count(*) from private.commerce_stock_units s
        where s.reserved_order_id=o.id and s.state='reserved') > 0
      and (select count(*) from private.commerce_stock_units s
        where s.reserved_order_id=o.id and s.state='reserved') =
        (select coalesce(sum(quantity),0) from private.commerce_order_items
          where order_id=o.id)
    limit 1
$$;

-- auth.uid() is checked in the DB, never accepted from a browser parameter.
create function private.resume_registered_payos_link(p_order uuid)
returns text language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=private.customer_actor();
begin
  if p_order is null or not exists(
    select 1 from private.commerce_orders where id=p_order and user_id=actor
  ) then return null; end if;
  return private.resumable_payos_link(p_order);
end $$;

-- Guest access requires the exact browser-bound SHA-256 proof, code and email.
create function private.resume_guest_payos_link(
  p_code text,p_email text,p_guest_hash text
) returns text language plpgsql stable security definer set search_path='' as $$
declare matched uuid;
begin
  if coalesce(auth.jwt()->>'role','')<>'service_role' then
    raise insufficient_privilege using message='Trusted payment reader required';
  end if;
  if p_code is null or p_code !~ '^HB[A-F0-9]{16}$'
    or p_email is null or length(p_email) not between 3 and 254
    or p_guest_hash is null or p_guest_hash !~ '^[a-f0-9]{64}$'
  then return null; end if;
  select o.id into matched from private.commerce_orders o
    join private.commerce_checkout_intents i on i.order_id=o.id
    where o.code=p_code and o.user_id is null
      and i.email=lower(btrim(p_email)) and i.guest_token_hash=p_guest_hash;
  if matched is null then return null; end if;
  return private.resumable_payos_link(matched);
end $$;

create function public.resume_registered_payos_link(p_order uuid)
returns text language sql stable security invoker set search_path='' as $$
  select private.resume_registered_payos_link(p_order)
$$;
create function public.resume_guest_payos_link(
  p_code text,p_email text,p_guest_hash text
) returns text language sql stable security invoker set search_path='' as $$
  select private.resume_guest_payos_link(p_code,p_email,p_guest_hash)
$$;

revoke all on function private.resumable_payos_link(uuid),
  private.resume_registered_payos_link(uuid),public.resume_registered_payos_link(uuid),
  private.resume_guest_payos_link(text,text,text),
  public.resume_guest_payos_link(text,text,text)
  from public,anon,authenticated,service_role;
grant execute on function private.resume_registered_payos_link(uuid),
  public.resume_registered_payos_link(uuid) to authenticated;
grant execute on function private.resume_guest_payos_link(text,text,text),
  public.resume_guest_payos_link(text,text,text) to service_role;
commit;
-- Locally prepared ONLY. Requires all prior payOS fulfillment and review migrations.
-- No remote migration, payment activation or stock reissue is authorized.
begin;

create table private.payos_delivery_requeue_audit (
  id bigint generated always as identity primary key,
  order_id uuid not null references private.commerce_orders(id) on delete restrict,
  actor_id uuid not null references auth.users(id) on delete restrict,
  previous_attempts smallint not null check (previous_attempts = 4),
  previous_issue text not null check (previous_issue = 'service_unavailable'),
  note text not null check (length(btrim(note)) between 10 and 1000),
  created_at timestamptz not null default now()
);
create index payos_delivery_requeue_audit_order
  on private.payos_delivery_requeue_audit(order_id, id desc);
alter table private.payos_delivery_requeue_audit enable row level security;
revoke all on private.payos_delivery_requeue_audit
  from public, anon, authenticated, service_role;

-- One Owner-authorized, audited reset of the bounded retry budget.
-- Does not decrypt, deliver, settle, reserve or replace inventory.
create function private.requeue_exhausted_payos_delivery(
  p_order uuid, p_actor uuid, p_note text
) returns boolean language plpgsql volatile security definer set search_path='' as $$
declare
  job private.payos_fulfillment_outbox;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise insufficient_privilege using message='Trusted delivery operations service required';
  end if;
  if p_order is null or p_actor is null or p_note is null
    or length(btrim(p_note)) not between 10 and 1000 then
    raise invalid_parameter_value using message='Invalid delivery recovery request';
  end if;
  if not exists(select 1 from private.role_memberships m
    where m.user_id=p_actor and m.role='owner' and m.revoked_at is null) then
    raise insufficient_privilege using message='Owner required';
  end if;

  -- Lock the same outbox row used by claim/complete/fail. A concurrent retry
  -- or a repeated POST cannot reset the counter twice.
  select * into job from private.payos_fulfillment_outbox
    where order_id=p_order for update;
  if not found or job.status<>'failed' or job.attempts<>4
    or job.last_issue is distinct from 'service_unavailable'
    or job.lease_until is not null
    or not exists(select 1 from private.commerce_orders o
      where o.id=p_order and o.state='paid')
    or not exists(select 1 from private.commerce_payments p
      where p.order_id=p_order and p.provider='payos'
        and p.direction='in' and p.verification_state='verified')
    or exists(select 1 from private.commerce_payments p
      where p.order_id=p_order and p.direction='refund'
        and p.verification_state='verified')
    or not private.payos_reservation_is_intact(p_order)
    or exists(select 1 from private.commerce_delivery_units d
      where d.order_id=p_order)
    or (select count(*) from private.payos_delivery_requeue_audit a
      where a.order_id=p_order)>=3 then
    return false;
  end if;

  update private.payos_fulfillment_outbox
    set status='held', attempts=0, next_attempt_at=now(),
        claim_token=null, lease_until=null, last_issue=null
    where order_id=p_order;
  insert into private.payos_delivery_requeue_audit(
    order_id,actor_id,previous_attempts,previous_issue,note
  ) values(p_order,p_actor,job.attempts,job.last_issue,btrim(p_note));
  return true;
end $$;

create function public.requeue_exhausted_payos_delivery(
  p_order uuid, p_actor uuid, p_note text
) returns boolean language sql volatile security invoker set search_path='' as $$
  select private.requeue_exhausted_payos_delivery(p_order,p_actor,p_note)
$$;
revoke all on function
  private.requeue_exhausted_payos_delivery(uuid,uuid,text),
  public.requeue_exhausted_payos_delivery(uuid,uuid,text)
  from public, anon, authenticated, service_role;
grant execute on function
  private.requeue_exhausted_payos_delivery(uuid,uuid,text),
  public.requeue_exhausted_payos_delivery(uuid,uuid,text)
  to service_role;
commit;
