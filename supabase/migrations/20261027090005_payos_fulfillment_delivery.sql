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
