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
