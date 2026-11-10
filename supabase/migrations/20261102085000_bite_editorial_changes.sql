begin;

-- Supplier snapshots remain authoritative for prices and availability. Owner copy
-- is separate, so scheduled syncs cannot overwrite reviewed descriptions.
create table private.bite_catalog_copy (
  external_id text primary key references private.bite_catalog(external_id),
  description_vi text not null check (char_length(description_vi) between 12 and 3000),
  review_status text not null default 'needs_review' check(review_status in ('needs_review','ready','verify')),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create table private.bite_catalog_changes (
  id bigint generated always as identity primary key,
  external_id text not null,
  kind text not null check (kind in ('new','updated','removed','returned')),
  fields text[] not null,
  before_value jsonb,
  after_value jsonb,
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid
);
create index bite_changes_unread on private.bite_catalog_changes(created_at desc) where acknowledged_at is null;
create index bite_changes_history on private.bite_catalog_changes(created_at desc);
alter table private.bite_catalog_copy enable row level security;
alter table private.bite_catalog_changes enable row level security;
revoke all on private.bite_catalog_copy,private.bite_catalog_changes from public,anon,authenticated,service_role;

create function private.capture_bite_catalog_change() returns trigger
language plpgsql security definer set search_path='' as $$
declare changes text[]:=array[]::text[]; change_kind text:='updated'; before_data jsonb; after_data jsonb;
begin
  -- The initial catalog import does not generate 164 misleading alerts.
  if not exists(select 1 from private.bite_catalog_sync where id and last_success is not null) then return new; end if;
  if tg_op='INSERT' then
    changes:=array['new']; change_kind:='new';
  else
    if old.active and not new.active then
      changes:=array['active']; change_kind:='removed';
    elsif not old.active and new.active then
      changes:=array['active']; change_kind:='returned';
    end if;
    if old.price is distinct from new.price or old.normal_price is distinct from new.normal_price or old.currency is distinct from new.currency then changes:=array_append(changes,'price'); end if;
    if old.stock is distinct from new.stock or old.in_stock is distinct from new.in_stock then changes:=array_append(changes,'stock'); end if;
    if old.name is distinct from new.name or old.description is distinct from new.description or old.delivery is distinct from new.delivery or old.category is distinct from new.category then changes:=array_append(changes,'details'); end if;
    if old.promotion is distinct from new.promotion then changes:=array_append(changes,'promotion'); end if;
  end if;
  if cardinality(changes)=0 then return new; end if;
  if tg_op='UPDATE' then
    before_data:=jsonb_build_object('name',old.name,'description',old.description,'category',old.category,'delivery',old.delivery,'promotion',old.promotion,'price',old.price,'normalPrice',old.normal_price,'currency',old.currency,'stock',old.stock,'inStock',old.in_stock,'active',old.active);
  end if;
  after_data:=jsonb_build_object('name',new.name,'description',new.description,'category',new.category,'delivery',new.delivery,'promotion',new.promotion,'price',new.price,'normalPrice',new.normal_price,'currency',new.currency,'stock',new.stock,'inStock',new.in_stock,'active',new.active);
  insert into private.bite_catalog_changes(external_id,kind,fields,before_value,after_value)
    values(new.external_id,change_kind,changes,before_data,after_data);
  return new;
end $$;
create trigger bite_catalog_change_after_insert after insert on private.bite_catalog for each row execute function private.capture_bite_catalog_change();
create trigger bite_catalog_change_after_update after update on private.bite_catalog for each row execute function private.capture_bite_catalog_change();

create function private.bite_catalog_changes_admin(p_actor uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if p_actor is null then raise insufficient_privilege; end if;
  perform private.require_supplier_service(p_actor);
  return jsonb_build_object(
    'unread',(select count(*) from private.bite_catalog_changes where acknowledged_at is null),
    'items',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'externalId',external_id,'kind',kind,'fields',fields,'before',before_value,'after',after_value,'createdAt',created_at,'read',acknowledged_at is not null) order by id desc),'[]'::jsonb)
      from (select * from private.bite_catalog_changes order by id desc limit 100) c));
end $$;
create function private.bite_catalog_ack_changes(p_actor uuid) returns integer
language plpgsql security definer set search_path='' as $$
declare n integer;
begin
  if p_actor is null then raise insufficient_privilege; end if;
  perform private.require_supplier_service(p_actor);
  update private.bite_catalog_changes set acknowledged_at=now(),acknowledged_by=p_actor where acknowledged_at is null;
  get diagnostics n=row_count;
  return n;
end $$;
create function private.bite_catalog_save_copy(p_actor uuid,p_external text,p_description text,p_status text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  if p_actor is null then raise insufficient_privilege; end if;
  perform private.require_supplier_service(p_actor);
  if p_external !~ '^[0-9]{1,20}$' or char_length(coalesce(p_description,'')) not between 12 and 3000 or p_status not in ('ready','verify','needs_review') then raise invalid_parameter_value; end if;
  insert into private.bite_catalog_copy(external_id,description_vi,review_status,updated_by)
  values(p_external,btrim(p_description),p_status,p_actor)
  on conflict (external_id) do update set description_vi=excluded.description_vi,review_status=excluded.review_status,updated_at=now(),updated_by=p_actor;
  return true;
end $$;

create or replace function private.bite_catalog_admin(p_actor uuid,p_search text default '',p_page integer default 1) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if p_actor is null then raise insufficient_privilege; end if;
  perform private.require_supplier_service(p_actor);
  if p_page is null or p_page not between 1 and 334 or p_search is null or length(p_search)>100 then raise invalid_parameter_value; end if;
  return jsonb_build_object('sync',(select jsonb_build_object('lastSuccess',last_success,'issue',issue,'nextPage',next_page,'running',coalesce(lease_until>now(),false)) from private.bite_catalog_sync where id),
    'total',(select count(*) from private.bite_catalog where p_search='' or position(lower(p_search) in lower(name||' '||external_id||' '||category))>0),
    'items',(select coalesce(jsonb_agg(jsonb_build_object('externalId',c.external_id,'name',c.name,'description',c.description,'editorialDescription',e.description_vi,'editorialStatus',e.review_status,'category',c.category,'price',c.price::text,'previousPrice',c.previous_price::text,'normalPrice',c.normal_price::text,'currency',c.currency,'stock',c.stock,'inStock',c.in_stock,'promotion',c.promotion,'delivery',c.delivery,'syncedAt',c.synced_at,'active',c.active) order by c.name,c.external_id),'[]'::jsonb)
      from(select * from private.bite_catalog where p_search='' or position(lower(p_search) in lower(name||' '||external_id||' '||category))>0 order by name,external_id offset (p_page-1)*30 limit 30)c
      left join private.bite_catalog_copy e on e.external_id=c.external_id));
end $$;

-- Service-role only RPC wrappers, same trust boundary as existing supplier functions.
create function public.bite_catalog_changes_admin(p_actor uuid) returns jsonb language sql security invoker set search_path='' as $$select private.bite_catalog_changes_admin(p_actor)$$;
create function public.bite_catalog_ack_changes(p_actor uuid) returns integer language sql security invoker set search_path='' as $$select private.bite_catalog_ack_changes(p_actor)$$;
create function public.bite_catalog_save_copy(p_actor uuid,p_external text,p_description text,p_status text) returns boolean language sql security invoker set search_path='' as $$select private.bite_catalog_save_copy(p_actor,p_external,p_description,p_status)$$;
revoke all on function private.capture_bite_catalog_change(),private.bite_catalog_changes_admin(uuid),private.bite_catalog_ack_changes(uuid),private.bite_catalog_save_copy(uuid,text,text,text),public.bite_catalog_changes_admin(uuid),public.bite_catalog_ack_changes(uuid),public.bite_catalog_save_copy(uuid,text,text,text) from public,anon,authenticated,service_role;
grant execute on function private.bite_catalog_changes_admin(uuid),private.bite_catalog_ack_changes(uuid),private.bite_catalog_save_copy(uuid,text,text,text),public.bite_catalog_changes_admin(uuid),public.bite_catalog_ack_changes(uuid),public.bite_catalog_save_copy(uuid,text,text,text) to service_role;
commit;
