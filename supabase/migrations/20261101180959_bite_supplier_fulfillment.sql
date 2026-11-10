-- Forward-only preparation. Not applied remotely; no catalog/price/draft writes.
begin;
create table private.supplier_bindings (
  variant_id uuid primary key references public.product_variants(id) on delete restrict,
  supplier text not null default 'bite' check(supplier='bite'),
  external_id text not null check(external_id ~ '^[A-Za-z0-9_-]{1,80}$'),
  enabled boolean not null default false,
  max_pending integer not null default 20 check(max_pending between 1 and 100),
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now()
);
create table private.supplier_jobs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references private.commerce_orders(id) on delete restrict,
  order_item_id uuid not null references private.commerce_order_items(id) on delete restrict,
  variant_id uuid not null references public.product_variants(id) on delete restrict,
  unit_index integer not null check(unit_index between 1 and 20),
  supplier text not null check(supplier='bite'),
  external_id text not null check(external_id ~ '^[A-Za-z0-9_-]{1,80}$'),
  stock_id uuid not null unique default gen_random_uuid(),
  response_id uuid not null unique default gen_random_uuid(),
  state text not null default 'queued' check(state in ('queued','submitting','uncertain','stored','cancelled')),
  token uuid,
  submitted_at timestamptz,
  response jsonb,
  manual_actor uuid references auth.users(id),
  manual_reason text check(manual_reason in ('supplier_confirmed','replacement_provided')),
  manual_at timestamptz,
  created_at timestamptz not null default now(),
  unique(order_item_id,unit_index),
  check((manual_actor is null and manual_reason is null and manual_at is null)
    or (manual_actor is not null and manual_reason is not null and manual_at is not null))
);
create index supplier_jobs_queue on private.supplier_jobs(created_at,id) where state='queued';
create index supplier_jobs_order on private.supplier_jobs(order_id,variant_id,state);
create index supplier_jobs_binding on private.supplier_jobs(variant_id,state);
create table private.supplier_audit (
  id bigint generated always as identity primary key,
  actor_id uuid not null references auth.users(id),
  action text not null check(action in ('binding_changed','evidence_opened','manual_delivery')),
  entity_id uuid not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table private.supplier_bindings enable row level security;
alter table private.supplier_jobs enable row level security;
alter table private.supplier_audit enable row level security;
revoke all on private.supplier_bindings,private.supplier_jobs,private.supplier_audit from public,anon,authenticated,service_role;

create function private.require_supplier_service(p_actor uuid default null) returns void
language plpgsql security definer set search_path='' as $$
begin
  if coalesce(auth.jwt()->>'role','')<>'service_role' then
    raise insufficient_privilege using message='Trusted supplier service required';
  end if;
  if p_actor is not null and not exists(select 1 from private.role_memberships
      where user_id=p_actor and role='owner' and revoked_at is null) then
    raise insufficient_privilege using message='Verified Owner required';
  end if;
end $$;

create function private.set_supplier_binding(p_actor uuid,p_variant uuid,p_external text,p_enabled boolean,p_max integer)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if p_actor is null then raise insufficient_privilege; end if;
  perform private.require_supplier_service(p_actor);
  if p_variant is null or p_external is null or p_external !~ '^[A-Za-z0-9_-]{1,80}$'
    or p_enabled is null or p_max is null or p_max not between 1 and 100 then raise invalid_parameter_value; end if;
  -- Same variant lock as checkout: mapping changes cannot race its snapshot.
  perform 1 from public.product_variants where id=p_variant for update;
  if not found then raise invalid_parameter_value; end if;
  insert into private.supplier_bindings(variant_id,external_id,enabled,max_pending,updated_by)
    values(p_variant,p_external,p_enabled,p_max,p_actor)
    on conflict(variant_id) do update set external_id=excluded.external_id,enabled=excluded.enabled,
      max_pending=excluded.max_pending,updated_by=p_actor,updated_at=now();
  insert into private.supplier_audit(actor_id,action,entity_id,details)
    values(p_actor,'binding_changed',p_variant,jsonb_build_object('externalId',p_external,'enabled',p_enabled,'maxPending',p_max));
  return true;
end $$;

create function private.supplier_admin_state(p_actor uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if p_actor is null then raise insufficient_privilege; end if;
  perform private.require_supplier_service(p_actor);
  return jsonb_build_object(
    'bindings',(select coalesce(jsonb_agg(jsonb_build_object('variantId',variant_id,'externalId',external_id,'enabled',enabled,'maxPending',max_pending) order by variant_id),'[]') from private.supplier_bindings),
    'jobs',(select coalesce(jsonb_agg(jsonb_build_object('id',j.id,'orderCode',o.code,'variantId',j.variant_id,'externalId',j.external_id,
      'state',case when j.state='submitting' and j.submitted_at<now()-interval '2 minutes' then 'uncertain' else j.state end,
      'createdAt',j.created_at,'manual',j.manual_actor is not null) order by j.created_at desc,j.id),'[]')
      from (select * from private.supplier_jobs order by created_at desc,id limit 100) j
      join private.commerce_orders o on o.id=j.order_id));
end $$;

create function private.claim_supplier_purchase() returns jsonb
language plpgsql security definer set search_path='' as $$
declare j private.supplier_jobs; o private.commerce_orders; claim uuid;
begin
  perform private.require_supplier_service();
  -- The order is locked before the job throughout all completion paths.
  select c.* into o from private.commerce_orders c where c.state='paid'
    and exists(select 1 from private.commerce_payments p where p.order_id=c.id
      and p.provider='payos' and p.direction='in' and p.verification_state='verified')
    and exists(select 1 from private.supplier_jobs s where s.order_id=c.id and s.state='queued')
    order by c.created_at,c.id limit 1 for update of c skip locked;
  if not found then return null; end if;
  select * into j from private.supplier_jobs where order_id=o.id and state='queued'
    order by created_at,id limit 1 for update skip locked;
  if not found then return null; end if;
  claim:=gen_random_uuid();
  update private.supplier_jobs set state='submitting',token=claim,submitted_at=now() where id=j.id;
  return jsonb_build_object('id',j.id,'token',claim,'stockId',j.stock_id,'responseId',j.response_id,'variantId',j.variant_id,'externalId',j.external_id);
end $$;

create function private.supplier_sealed_valid(p_value jsonb) returns boolean
language sql immutable set search_path='' as $$
  select coalesce(jsonb_typeof(p_value)='object'
    and jsonb_typeof(p_value->'ciphertext')='string' and length(p_value->>'ciphertext') between 32 and 32000
    and jsonb_typeof(p_value->'nonce')='string' and length(p_value->>'nonce')=16
    and p_value->>'key_version' ~ '^[1-9][0-9]{0,2}$',false)
$$;

create function private.finish_supplier_purchase(p_job uuid,p_token uuid,p_stock jsonb,p_response jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
declare j private.supplier_jobs; o private.commerce_orders;
begin
  perform private.require_supplier_service();
  select c.* into o from private.commerce_orders c join private.supplier_jobs s on s.order_id=c.id where s.id=p_job for update of c;
  select * into j from private.supplier_jobs where id=p_job for update;
  if j.id is null or j.state<>'submitting' or j.token is distinct from p_token then return false; end if;
  if not private.supplier_sealed_valid(p_response) or (p_stock is not null and not private.supplier_sealed_valid(p_stock)) then raise invalid_parameter_value; end if;
  -- Preserve evidence even if an operator changed the order after the POST.
  if p_stock is null or o.state<>'paid' or not exists(select 1 from private.commerce_payments
      where order_id=o.id and provider='payos' and direction='in' and verification_state='verified') then
    update private.supplier_jobs set state='uncertain',response=p_response where id=j.id;
    return true;
  end if;
  insert into private.commerce_stock_units(id,variant_id,ciphertext,nonce,key_version,state,reserved_order_id)
    values(j.stock_id,j.variant_id,p_stock->>'ciphertext',p_stock->>'nonce',(p_stock->>'key_version')::integer,'reserved',j.order_id);
  update private.supplier_jobs set state='stored',response=p_response where id=j.id;
  return true;
end $$;

create function private.read_supplier_evidence(p_actor uuid,p_job uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j private.supplier_jobs;
begin
  if p_actor is null then raise insufficient_privilege; end if;
  perform private.require_supplier_service(p_actor);
  select * into j from private.supplier_jobs where id=p_job;
  if not found then return null; end if;
  insert into private.supplier_audit(actor_id,action,entity_id) values(p_actor,'evidence_opened',j.id);
  return jsonb_build_object('stockId',j.stock_id,'variantId',j.variant_id,'responseId',j.response_id,'response',j.response);
end $$;

create function private.manual_supplier_delivery(p_actor uuid,p_job uuid,p_reason text,p_stock jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
declare j private.supplier_jobs; o private.commerce_orders;
begin
  if p_actor is null then raise insufficient_privilege; end if;
  perform private.require_supplier_service(p_actor);
  if p_reason is null or p_reason not in ('supplier_confirmed','replacement_provided') or not private.supplier_sealed_valid(p_stock) then raise invalid_parameter_value; end if;
  select c.* into o from private.commerce_orders c join private.supplier_jobs s on s.order_id=c.id where s.id=p_job for update of c;
  select * into j from private.supplier_jobs where id=p_job for update;
  if j.id is null or not(j.state in ('queued','uncertain') or (j.state='submitting' and j.submitted_at<now()-interval '2 minutes'))
    or o.state<>'paid' or not exists(select 1 from private.commerce_payments
      where order_id=o.id and provider='payos' and direction='in' and verification_state='verified') then return false; end if;
  insert into private.commerce_stock_units(id,variant_id,ciphertext,nonce,key_version,state,reserved_order_id)
    values(j.stock_id,j.variant_id,p_stock->>'ciphertext',p_stock->>'nonce',(p_stock->>'key_version')::integer,'reserved',j.order_id);
  update private.supplier_jobs set state='stored',manual_actor=p_actor,manual_reason=p_reason,manual_at=now() where id=j.id;
  insert into private.supplier_audit(actor_id,action,entity_id,details) values(p_actor,'manual_delivery',j.id,jsonb_build_object('reason',p_reason));
  return true;
end $$;

-- Supplier reservations represent an obligation, NEVER fake inventory. Only a
-- successful encrypted result creates stock. The same invariant protects links,
-- signed receipts and checkout; later fulfillment still requires real stock.
create or replace function private.payos_reservation_is_intact(p_order uuid)
returns boolean language sql volatile security definer set search_path='' as $$
  select exists(select 1 from private.commerce_orders o where o.id=p_order
    and (select coalesce(sum(quantity),0) from private.commerce_order_items where order_id=p_order) between 1 and 20
    and (select coalesce(sum(quantity),0) from private.commerce_order_items where order_id=p_order)=
      (select count(*) from private.commerce_stock_units where reserved_order_id=p_order and state='reserved')
      +(select count(*) from private.supplier_jobs where order_id=p_order and state in ('queued','submitting','uncertain'))
    and not exists(select 1 from private.commerce_order_items i where i.order_id=p_order and i.quantity <>
      ((select count(*) from private.commerce_stock_units s where s.reserved_order_id=p_order and s.state='reserved' and s.variant_id=i.variant_id)
       +(select count(*) from private.supplier_jobs j where j.order_id=p_order and j.order_item_id=i.id and j.variant_id=i.variant_id and j.state in ('queued','submitting','uncertain'))))
    and not exists(select 1 from private.commerce_stock_units s where s.reserved_order_id=p_order and s.state='reserved'
      and not exists(select 1 from private.commerce_order_items i where i.order_id=p_order and i.variant_id=s.variant_id))
    and not exists(select 1 from private.supplier_jobs j where j.order_id=p_order
      and (j.state='cancelled' or not exists(select 1 from private.commerce_order_items i where i.id=j.order_item_id and i.order_id=p_order and i.variant_id=j.variant_id)))
    and not exists(select 1 from private.commerce_delivery_units where order_id=p_order))
$$;

-- Public invoker wrappers expose only these bounded service operations.
create function public.set_supplier_binding(p_actor uuid,p_variant uuid,p_external text,p_enabled boolean,p_max integer) returns boolean language sql security invoker set search_path='' as $$ select private.set_supplier_binding(p_actor,p_variant,p_external,p_enabled,p_max) $$;
create function public.supplier_admin_state(p_actor uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.supplier_admin_state(p_actor) $$;
create function public.claim_supplier_purchase() returns jsonb language sql security invoker set search_path='' as $$ select private.claim_supplier_purchase() $$;
create function public.finish_supplier_purchase(p_job uuid,p_token uuid,p_stock jsonb,p_response jsonb) returns boolean language sql security invoker set search_path='' as $$ select private.finish_supplier_purchase(p_job,p_token,p_stock,p_response) $$;
create function public.read_supplier_evidence(p_actor uuid,p_job uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.read_supplier_evidence(p_actor,p_job) $$;
create function public.manual_supplier_delivery(p_actor uuid,p_job uuid,p_reason text,p_stock jsonb) returns boolean language sql security invoker set search_path='' as $$ select private.manual_supplier_delivery(p_actor,p_job,p_reason,p_stock) $$;
revoke all on function private.require_supplier_service(uuid),private.supplier_sealed_valid(jsonb),
  private.set_supplier_binding(uuid,uuid,text,boolean,integer),public.set_supplier_binding(uuid,uuid,text,boolean,integer),
  private.supplier_admin_state(uuid),public.supplier_admin_state(uuid),
  private.claim_supplier_purchase(),public.claim_supplier_purchase(),
  private.finish_supplier_purchase(uuid,uuid,jsonb,jsonb),public.finish_supplier_purchase(uuid,uuid,jsonb,jsonb),
  private.read_supplier_evidence(uuid,uuid),public.read_supplier_evidence(uuid,uuid),
  private.manual_supplier_delivery(uuid,uuid,text,jsonb),public.manual_supplier_delivery(uuid,uuid,text,jsonb)
  from public,anon,authenticated,service_role;
grant execute on function
  private.set_supplier_binding(uuid,uuid,text,boolean,integer),public.set_supplier_binding(uuid,uuid,text,boolean,integer),
  private.supplier_admin_state(uuid),public.supplier_admin_state(uuid),
  private.claim_supplier_purchase(),public.claim_supplier_purchase(),
  private.finish_supplier_purchase(uuid,uuid,jsonb,jsonb),public.finish_supplier_purchase(uuid,uuid,jsonb,jsonb),
  private.read_supplier_evidence(uuid,uuid),public.read_supplier_evidence(uuid,uuid),
  private.manual_supplier_delivery(uuid,uuid,text,jsonb),public.manual_supplier_delivery(uuid,uuid,text,jsonb) to service_role;

-- Updated existing checkout/lease/expiry functions follow below.

create or replace function private.reserve_bite_payos_checkout(
  p_request uuid,p_email text,p_guest_hash text,p_lines jsonb,p_user uuid default null,p_bite_ready boolean default false
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
  binding private.supplier_bindings;
  item_id uuid;
  outstanding integer;
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
  if p_user is null or not exists (
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
    select * into binding from private.supplier_bindings where variant_id=v.id and enabled;
    if found then
      if p_bite_ready is distinct from true then raise invalid_parameter_value using message='Supplier credentials unavailable'; end if;
      select count(*) into outstanding from private.supplier_jobs j join private.commerce_orders c on c.id=j.order_id
        where j.variant_id=v.id and j.state in ('queued','submitting','uncertain') and c.state in ('pending_payment','paid');
      if outstanding+qty>binding.max_pending then raise invalid_parameter_value using message='Supplier queue is full'; end if;
      select id into strict item_id from private.commerce_order_items where commerce_order_items.order_id=reserve_bite_payos_checkout.order_id and variant_id=v.id;
      insert into private.supplier_jobs(order_id,order_item_id,variant_id,unit_index,supplier,external_id)
        select reserve_bite_payos_checkout.order_id,item_id,v.id,n,'bite',binding.external_id from generate_series(1,qty) n;
      continue;
    end if;
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
    where id=reserve_bite_payos_checkout.order_id;
  insert into private.commerce_checkout_intents(request_key,order_id,order_code,email,guest_token_hash,cart_hash)
    values(p_request,order_id,provider_code,lower(p_email),p_guest_hash,cart_hash);
  return jsonb_build_object('orderId',order_id,'orderCode',provider_code,
    'total',running_total,'expiresAt',(select expires_at from private.commerce_orders where id=order_id),
    'reused',false);
end $$;

create or replace function private.claim_payos_link_attempt(p_request uuid,p_guest_hash text)
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
  if not private.payos_reservation_is_intact(o.id) then
    raise invalid_parameter_value using message='Reservation invalid';
  end if;
  update private.commerce_checkout_intents set link_attempted_at=now()
    where request_key=p_request;
  return jsonb_build_object('status','claimed','orderId',o.id,
    'orderCode',i.order_code,'total',o.total_vnd,
    'createdAt',floor(extract(epoch from o.created_at)*1000)::bigint,
    'expiresAt',floor(extract(epoch from o.expires_at)*1000)::bigint);
end $$;

create or replace function private.attach_payos_link(
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
    or not private.payos_reservation_is_intact(p_order)
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

create or replace function private.claim_payos_fulfillment() returns jsonb
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
      and not exists(select 1 from private.supplier_jobs s where s.order_id=o.id and s.state<>'stored')
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

create or replace function private.expire_unsubmitted_payos_checkouts(p_limit integer default 10)
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
    if expected_units not between 1 and 20 or not private.payos_reservation_is_intact(candidate.order_id) then continue; end if;

    update private.commerce_stock_units
      set state='available',reserved_order_id=null
      where reserved_order_id=candidate.order_id and state='reserved';
    update private.supplier_jobs set state='cancelled' where order_id=candidate.order_id and state='queued';
    update private.commerce_orders set state='expired'
      where id=candidate.order_id and state='pending_payment';
    released := released+1;
  end loop;
  return released;
end $$;
create function public.reserve_bite_payos_checkout(p_request uuid,p_email text,p_guest_hash text,p_lines jsonb,p_user uuid default null,p_bite_ready boolean default false)
returns jsonb language sql security invoker set search_path='' as $$ select private.reserve_bite_payos_checkout(p_request,p_email,p_guest_hash,p_lines,p_user,p_bite_ready) $$;
revoke all on function private.reserve_bite_payos_checkout(uuid,text,text,jsonb,uuid,boolean),public.reserve_bite_payos_checkout(uuid,text,text,jsonb,uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function private.reserve_bite_payos_checkout(uuid,text,text,jsonb,uuid,boolean),public.reserve_bite_payos_checkout(uuid,text,text,jsonb,uuid,boolean) to service_role;
commit;
