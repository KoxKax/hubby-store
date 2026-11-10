begin;
create table private.bite_catalog (
  external_id text primary key check(external_id ~ '^[0-9]{1,20}$'),
  name text not null, description text not null, category text not null,
  price numeric(20,6) not null check(price>=0), previous_price numeric(20,6), normal_price numeric(20,6),
  currency text, stock integer check(stock>=0), in_stock boolean not null,
  promotion text not null, delivery text not null, active boolean not null default true,
  synced_at timestamptz not null default now(), generation uuid not null
);
create table private.bite_catalog_sync (
  id boolean primary key default true check(id), generation uuid not null default gen_random_uuid(),
  next_page integer not null default 1 check(next_page between 1 and 101),
  token uuid, lease_until timestamptz, next_due timestamptz not null default now(),
  last_success timestamptz, issue text
);
insert into private.bite_catalog_sync(id) values(true);
alter table private.bite_catalog enable row level security;
alter table private.bite_catalog_sync enable row level security;
revoke all on private.bite_catalog,private.bite_catalog_sync from public,anon,authenticated,service_role;
alter table private.supplier_jobs
  add column idempotency_key text unique,
  add column provider_order_id text,
  add column provider_status text,
  add column provider_amount numeric(20,6),
  add column provider_currency text,
  add column purchase_attempts integer not null default 0,
  add column poll_attempts integer not null default 0,
  add column polled_at timestamptz,
  add column next_poll timestamptz not null default now(),
  add column lease_until timestamptz,
  add column last_issue text;
alter table private.supplier_jobs drop constraint supplier_jobs_state_check;
alter table private.supplier_jobs add constraint supplier_jobs_state_check check(state in ('queued','submitting','uncertain','waiting','failed','file_ready','stored','cancelled'));
create unique index bite_provider_order_once on private.supplier_jobs(provider_order_id) where provider_order_id is not null;
create index bite_jobs_poll on private.supplier_jobs(next_poll,created_at) where state in ('waiting','uncertain','submitting');

create function private.claim_bite_catalog_sync(p_actor uuid default null,p_force boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s private.bite_catalog_sync; claim uuid:=gen_random_uuid();
begin
  perform private.require_supplier_service(p_actor);
  if p_force and p_actor is null then raise insufficient_privilege; end if;
  select * into s from private.bite_catalog_sync where id for update;
  if s.lease_until>now() or (not p_force and s.next_due>now()) then return null; end if;
  if s.next_page=1 then s.generation:=gen_random_uuid(); end if;
  if s.next_page>100 then
    update private.bite_catalog_sync set issue='page_limit',next_due=now()+interval '1 hour' where id;
    return null;
  end if;
  update private.bite_catalog_sync set generation=s.generation,token=claim,lease_until=now()+interval '2 minutes' where id;
  return jsonb_build_object('token',claim,'generation',s.generation,'page',s.next_page);
end $$;
create function private.store_bite_catalog_page(p_token uuid,p_generation uuid,p_page integer,p_items jsonb,p_done boolean) returns boolean
language plpgsql security definer set search_path='' as $$
declare s private.bite_catalog_sync; item jsonb;
begin
  perform private.require_supplier_service();
  select * into s from private.bite_catalog_sync where id for update;
  if s.token is distinct from p_token or s.generation is distinct from p_generation or s.next_page<>p_page or s.lease_until<=now() then return false; end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items)>100 or p_done is null then raise invalid_parameter_value; end if;
  for item in select value from jsonb_array_elements(p_items) loop
    if item->>'externalId' !~ '^[0-9]{1,20}$' or length(item->>'name') not between 1 and 300 or item->>'price' !~ '^[0-9]{1,12}(\.[0-9]{1,6})?$' then raise invalid_parameter_value; end if;
    insert into private.bite_catalog(external_id,name,description,category,price,normal_price,currency,stock,in_stock,promotion,delivery,generation)
      values(item->>'externalId',item->>'name',item->>'description',item->>'category',(item->>'price')::numeric,(item->>'normalPrice')::numeric,item->>'currency',(item->>'stock')::integer,(item->>'inStock')::boolean,item->>'promotion',item->>'delivery',p_generation)
      on conflict(external_id) do update set name=excluded.name,description=excluded.description,category=excluded.category,
        previous_price=case when bite_catalog.price is distinct from excluded.price then bite_catalog.price else bite_catalog.previous_price end,
        price=excluded.price,normal_price=excluded.normal_price,currency=excluded.currency,stock=excluded.stock,in_stock=excluded.in_stock,
        promotion=excluded.promotion,delivery=excluded.delivery,generation=p_generation,active=true,synced_at=now();
  end loop;
  if p_done then
    update private.bite_catalog set active=false,in_stock=false where generation<>p_generation;
    update private.bite_catalog_sync set next_page=1,last_success=now(),issue=null,token=null,lease_until=null,next_due=now()+interval '5 minutes' where id;
  else
    update private.bite_catalog_sync set next_page=p_page+1,issue=null,lease_until=now()+interval '2 minutes',next_due=now() where id;
  end if;
  return true;
end $$;
create function private.fail_bite_catalog_sync(p_token uuid,p_issue text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  perform private.require_supplier_service();
  update private.bite_catalog_sync set issue=left(p_issue,80),token=null,lease_until=null,next_due=now()+interval '5 minutes' where id and token=p_token;
  return found;
end $$;
create function private.bite_catalog_admin(p_actor uuid,p_search text default '',p_page integer default 1) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if p_actor is null then raise insufficient_privilege; end if;
  perform private.require_supplier_service(p_actor);
  if p_page is null or p_page not between 1 and 334 or p_search is null or length(p_search)>100 then raise invalid_parameter_value; end if;
  return jsonb_build_object('sync',(select jsonb_build_object('lastSuccess',last_success,'issue',issue,'nextPage',next_page,'running',coalesce(lease_until>now(),false)) from private.bite_catalog_sync where id),
    'total',(select count(*) from private.bite_catalog where p_search='' or position(lower(p_search) in lower(name||' '||external_id||' '||category))>0),
    'items',(select coalesce(jsonb_agg(jsonb_build_object('externalId',external_id,'name',name,'description',description,'category',category,'price',price::text,'previousPrice',previous_price::text,'normalPrice',normal_price::text,'currency',currency,'stock',stock,'inStock',in_stock,'promotion',promotion,'delivery',delivery,'syncedAt',synced_at,'active',active) order by name,external_id),'[]')
      from(select * from private.bite_catalog where p_search='' or position(lower(p_search) in lower(name||' '||external_id||' '||category))>0 order by name,external_id offset (p_page-1)*30 limit 30)t));
end $$;

-- New obligations require fresh source availability. No CMS or price writes.
create function private.guard_bite_reservation() returns trigger
language plpgsql security definer set search_path='' as $$
declare offer private.bite_catalog; outstanding integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('bite.offer:'||new.external_id,0));
  select * into offer from private.bite_catalog where external_id=new.external_id;
  if offer.external_id is null or not offer.active or not offer.in_stock or offer.synced_at<now()-interval '15 minutes'
    or exists(select 1 from private.bite_catalog_sync where issue is not null) then
    raise invalid_parameter_value using message='Bite offer unavailable or stale'; end if;
  select count(*) into outstanding from private.supplier_jobs j join private.commerce_orders o on o.id=j.order_id
    where j.external_id=new.external_id and j.state in ('queued','submitting','uncertain','waiting','file_ready','failed') and o.state in ('pending_payment','paid');
  if outstanding>=coalesce(offer.stock,1) then raise invalid_parameter_value using message='Bite stock reserved'; end if;
  new.idempotency_key:='hubby-bite:'||new.id::text;
  return new;
end $$;
create trigger guard_bite_reservation before insert on private.supplier_jobs for each row execute function private.guard_bite_reservation();

create function private.claim_bite_work(p_job uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j private.supplier_jobs; o private.commerce_orders; claim uuid:=gen_random_uuid(); mode text;
begin
  perform private.require_supplier_service();
  select c.* into o from private.commerce_orders c where c.state='paid'
    and exists(select 1 from private.commerce_payments p where p.order_id=c.id and p.provider='payos' and p.direction='in' and p.verification_state='verified')
    and exists(select 1 from private.supplier_jobs s where s.order_id=c.id and (p_job is null or s.id=p_job)
      and s.state in ('queued','waiting','uncertain','submitting') and s.next_poll<=now() and coalesce(s.lease_until,'epoch')<now()
      and (s.state='queued' or (s.provider_order_id is not null and s.poll_attempts<100)
        or (s.idempotency_key is not null and s.purchase_attempts<3 and s.submitted_at>now()-interval '1 hour')))
    order by c.created_at,c.id limit 1 for update of c skip locked;
  if not found then return null; end if;
  select * into j from private.supplier_jobs s where s.order_id=o.id and (p_job is null or s.id=p_job)
    and s.state in ('queued','waiting','uncertain','submitting') and s.next_poll<=now() and coalesce(s.lease_until,'epoch')<now()
    and (s.state='queued' or (s.provider_order_id is not null and s.poll_attempts<100)
      or (s.idempotency_key is not null and s.purchase_attempts<3 and s.submitted_at>now()-interval '1 hour'))
    order by case when s.provider_order_id is not null then 0 else 1 end,s.created_at,s.id limit 1 for update skip locked;
  if not found then return null; end if;
  mode:=case when j.provider_order_id is null then 'purchase' else 'poll' end;
  -- Legacy ambiguous POSTs with no persisted key are never replayed.
  if mode='purchase' and j.idempotency_key is null and j.submitted_at is not null then return null; end if;
  update private.supplier_jobs set token=claim,lease_until=now()+interval '2 minutes',
    idempotency_key=coalesce(idempotency_key,'hubby-bite:'||id::text),
    state=case when mode='purchase' then 'submitting' else state end,
    submitted_at=case when mode='purchase' then coalesce(submitted_at,now()) else submitted_at end,
    purchase_attempts=purchase_attempts+case when mode='purchase' then 1 else 0 end,
    poll_attempts=poll_attempts+case when mode='poll' then 1 else 0 end
    where id=j.id;
  return jsonb_build_object('id',j.id,'token',claim,'stockId',j.stock_id,'responseId',j.response_id,'variantId',j.variant_id,'externalId',j.external_id,
    'mode',mode,'providerOrderId',j.provider_order_id,'idempotencyKey',coalesce(j.idempotency_key,'hubby-bite:'||j.id::text));
end $$;

create function private.finish_bite_work(p_job uuid,p_token uuid,p_result jsonb,p_stock jsonb,p_response jsonb,p_issue text default null) returns boolean
language plpgsql security definer set search_path='' as $$
declare j private.supplier_jobs; o private.commerce_orders; source_id text:=p_result->>'orderId'; outcome text:=p_result->>'outcome';
begin
  perform private.require_supplier_service();
  select c.* into o from private.commerce_orders c join private.supplier_jobs s on s.order_id=c.id where s.id=p_job for update of c;
  select * into j from private.supplier_jobs where id=p_job for update;
  if j.id is null or j.state not in ('submitting','waiting','uncertain') or j.token is distinct from p_token then return false; end if;
  if not private.supplier_sealed_valid(p_response) or (p_stock is not null and not private.supplier_sealed_valid(p_stock))
    or outcome not in ('received','waiting','failed','file_ready','uncertain') then raise invalid_parameter_value; end if;
  if source_id is not null and (source_id !~ '^[0-9]{1,20}$' or (j.provider_order_id is not null and j.provider_order_id<>source_id)) then raise invalid_parameter_value; end if;
  if p_stock is not null and (outcome<>'received' or source_id is null or o.state<>'paid' or not exists(select 1 from private.commerce_payments where order_id=o.id and provider='payos' and direction='in' and verification_state='verified')) then return false; end if;
  if p_stock is not null then
    insert into private.commerce_stock_units(id,variant_id,ciphertext,nonce,key_version,state,reserved_order_id)
      values(j.stock_id,j.variant_id,p_stock->>'ciphertext',p_stock->>'nonce',(p_stock->>'key_version')::integer,'reserved',j.order_id);
  end if;
  update private.supplier_jobs set state=case when p_stock is not null then 'stored' when outcome in ('waiting','failed','file_ready') then outcome else 'uncertain' end,
    provider_order_id=coalesce(source_id,provider_order_id),provider_status=coalesce(p_result->>'status',provider_status),
    provider_amount=coalesce((p_result->>'amount')::numeric,provider_amount),provider_currency=coalesce(p_result->>'currency',provider_currency),
    response=p_response,last_issue=left(p_issue,80),polled_at=now(),lease_until=null,next_poll=now()+interval '5 minutes' where id=j.id;
  return true;
end $$;
create function private.request_bite_order_poll(p_actor uuid,p_job uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  if p_actor is null then raise insufficient_privilege; end if;
  perform private.require_supplier_service(p_actor);
  -- Explicit admin refresh is GET-only. It never reopens a purchase.
  update private.supplier_jobs set next_poll=now(),poll_attempts=0,state='waiting'
    where id=p_job and provider_order_id is not null and state in ('waiting','uncertain','failed','file_ready') and coalesce(lease_until,'epoch')<now();
  return found;
end $$;
create function private.bite_public_availability() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  perform private.require_supplier_service();
  return (select coalesce(jsonb_agg(jsonb_build_object('variantKey',v.variant_key,'stock',case
    when b.variant_id is null or not b.enabled then (select count(*) from private.commerce_stock_units s where s.variant_id=v.id and s.state='available')
    when c.external_id is null or not c.active or not c.in_stock or c.synced_at<now()-interval '15 minutes'
      or exists(select 1 from private.bite_catalog_sync where issue is not null) then 0
    else greatest(0,least(b.max_pending,coalesce(c.stock,1))-(select count(*) from private.supplier_jobs j join private.commerce_orders o on o.id=j.order_id where j.external_id=b.external_id and j.state in ('queued','submitting','uncertain','waiting','failed','file_ready') and o.state in ('pending_payment','paid'))) end)),'[]')
    from public.product_variants v left join private.supplier_bindings b on b.variant_id=v.id left join private.bite_catalog c on c.external_id=b.external_id);
end $$;

create or replace function private.payos_reservation_is_intact(p_order uuid)
returns boolean language sql volatile security definer set search_path='' as $$
  select exists(select 1 from private.commerce_orders o where o.id=p_order
    and (select coalesce(sum(quantity),0) from private.commerce_order_items where order_id=p_order) between 1 and 20
    and (select coalesce(sum(quantity),0) from private.commerce_order_items where order_id=p_order)=
      (select count(*) from private.commerce_stock_units where reserved_order_id=p_order and state='reserved')
      +(select count(*) from private.supplier_jobs where order_id=p_order and state in ('queued','submitting','uncertain','waiting','failed','file_ready'))
    and not exists(select 1 from private.commerce_order_items i where i.order_id=p_order and i.quantity <>
      ((select count(*) from private.commerce_stock_units s where s.reserved_order_id=p_order and s.state='reserved' and s.variant_id=i.variant_id)
       +(select count(*) from private.supplier_jobs j where j.order_id=p_order and j.order_item_id=i.id and j.variant_id=i.variant_id and j.state in ('queued','submitting','uncertain','waiting','failed','file_ready'))))
    and not exists(select 1 from private.commerce_stock_units s where s.reserved_order_id=p_order and s.state='reserved'
      and not exists(select 1 from private.commerce_order_items i where i.order_id=p_order and i.variant_id=s.variant_id))
    and not exists(select 1 from private.supplier_jobs j where j.order_id=p_order
      and (j.state='cancelled' or not exists(select 1 from private.commerce_order_items i where i.id=j.order_item_id and i.order_id=p_order and i.variant_id=j.variant_id)))
    and not exists(select 1 from private.commerce_delivery_units where order_id=p_order))
$$;

create or replace function private.manual_supplier_delivery(p_actor uuid,p_job uuid,p_reason text,p_stock jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
declare j private.supplier_jobs; o private.commerce_orders;
begin
  if p_actor is null then raise insufficient_privilege; end if;
  perform private.require_supplier_service(p_actor);
  if p_reason is null or p_reason not in ('supplier_confirmed','replacement_provided') or not private.supplier_sealed_valid(p_stock) then raise invalid_parameter_value; end if;
  select c.* into o from private.commerce_orders c join private.supplier_jobs s on s.order_id=c.id where s.id=p_job for update of c;
  select * into j from private.supplier_jobs where id=p_job for update;
  if j.id is null or not((j.state in ('queued','uncertain','waiting','failed','file_ready') and coalesce(j.lease_until,'epoch')<now()) or (j.state='submitting' and j.submitted_at<now()-interval '2 minutes' and coalesce(j.lease_until,'epoch')<now()))
    or o.state<>'paid' or not exists(select 1 from private.commerce_payments
      where order_id=o.id and provider='payos' and direction='in' and verification_state='verified') then return false; end if;
  insert into private.commerce_stock_units(id,variant_id,ciphertext,nonce,key_version,state,reserved_order_id)
    values(j.stock_id,j.variant_id,p_stock->>'ciphertext',p_stock->>'nonce',(p_stock->>'key_version')::integer,'reserved',j.order_id);
  update private.supplier_jobs set state='stored',manual_actor=p_actor,manual_reason=p_reason,manual_at=now() where id=j.id;
  insert into private.supplier_audit(actor_id,action,entity_id,details) values(p_actor,'manual_delivery',j.id,jsonb_build_object('reason',p_reason));
  return true;
end $$;

create or replace function private.supplier_admin_state(p_actor uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if p_actor is null then raise insufficient_privilege; end if;
  perform private.require_supplier_service(p_actor);
  return jsonb_build_object(
    'bindings',(select coalesce(jsonb_agg(jsonb_build_object('variantId',variant_id,'externalId',external_id,'enabled',enabled,'maxPending',max_pending) order by variant_id),'[]') from private.supplier_bindings),
    'jobs',(select coalesce(jsonb_agg(jsonb_build_object('id',j.id,'orderCode',o.code,'variantId',j.variant_id,'externalId',j.external_id,
      'state',case when j.state='submitting' and j.submitted_at<now()-interval '2 minutes' then 'uncertain' else j.state end,
      'createdAt',j.created_at,'manual',j.manual_actor is not null,'providerOrderId',j.provider_order_id,'providerStatus',j.provider_status,'amount',j.provider_amount::text,'currency',j.provider_currency,'polledAt',j.polled_at,'issue',j.last_issue,'idempotent',j.idempotency_key is not null) order by j.created_at desc,j.id),'[]')
      from (select * from private.supplier_jobs order by created_at desc,id limit 100) j
      join private.commerce_orders o on o.id=j.order_id));
end $$;
-- Bounded service-only public wrappers, with all grants explicit in this transaction.
do $wrappers$
declare f record; args text; callargs text;
begin
  for f in select p.oid,p.proname,pg_get_function_arguments(p.oid) as declaration,pg_get_function_result(p.oid) as result,p.proargnames
    from pg_proc p where p.pronamespace='private'::regnamespace and p.proname in ('claim_bite_catalog_sync','store_bite_catalog_page','fail_bite_catalog_sync','bite_catalog_admin','claim_bite_work','finish_bite_work','request_bite_order_poll','bite_public_availability') loop
    args:=pg_get_function_identity_arguments(f.oid);
    callargs:=coalesce(array_to_string(f.proargnames,','),'');
    execute format('create function public.%I(%s) returns %s language sql security invoker set search_path='''' as %L',f.proname,f.declaration,f.result,format('select private.%I(%s)',f.proname,callargs));
    execute format('revoke all on function private.%I(%s),public.%I(%s) from public,anon,authenticated,service_role',f.proname,args,f.proname,args);
    execute format('grant execute on function private.%I(%s),public.%I(%s) to service_role',f.proname,args,f.proname,args);
  end loop;
end $wrappers$;
revoke all on function private.guard_bite_reservation() from public,anon,authenticated,service_role;
commit;
