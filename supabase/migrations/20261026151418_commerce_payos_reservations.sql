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
