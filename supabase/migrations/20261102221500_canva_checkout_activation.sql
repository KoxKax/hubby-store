begin;
create table private.checkout_activation (
  request_id uuid primary key,
  order_id uuid not null unique references private.commerce_orders(id),
  fingerprint text not null check(fingerprint ~ '^[0-9a-f]{64}$'),
  payload jsonb not null check(private.supplier_sealed_valid(payload)),
  created_at timestamptz not null default now()
);
alter table private.checkout_activation enable row level security;
revoke all on private.checkout_activation from public,anon,authenticated,service_role;

create function private.reserve_activation_checkout(
  p_request uuid,p_email text,p_guest_hash text,p_lines jsonb,p_user uuid,
  p_bite_ready boolean,p_activation jsonb,p_fingerprint text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; existing private.checkout_activation; needs_email boolean;
begin
  perform private.require_supplier_service();
  if jsonb_typeof(p_lines) is distinct from 'array' then raise invalid_parameter_value; end if;
  needs_email := exists(select 1 from jsonb_array_elements(p_lines) e where e->>'variantKey'='canva-36');
  if needs_email then
    if p_activation is null or not private.supplier_sealed_valid(p_activation)
      or p_fingerprint is null or p_fingerprint !~ '^[0-9a-f]{64}$' then
      raise invalid_parameter_value using message='Canva activation email required';
    end if;
    if exists(select 1 from jsonb_array_elements(p_lines) e where e->>'variantKey'='canva-36' and e->>'quantity' is distinct from '1') then
      raise invalid_parameter_value using message='One Canva invitation per checkout';
    end if;
  elsif p_activation is not null or p_fingerprint is not null then raise invalid_parameter_value;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('hubby.checkout:'||p_request::text,0));
  select * into existing from private.checkout_activation where request_id=p_request;
  if found and existing.fingerprint is distinct from p_fingerprint then
    raise invalid_parameter_value using message='Activation idempotency conflict';
  end if;
  result := private.reserve_bite_payos_checkout(p_request,p_email,p_guest_hash,p_lines,p_user,p_bite_ready);
  if needs_email then
    insert into private.checkout_activation(request_id,order_id,fingerprint,payload)
    values(p_request,(result->>'orderId')::uuid,p_fingerprint,p_activation)
    on conflict(request_id) do nothing;
  end if;
  return result;
end $$;
create function public.reserve_activation_checkout(
  p_request uuid,p_email text,p_guest_hash text,p_lines jsonb,p_user uuid,
  p_bite_ready boolean,p_activation jsonb,p_fingerprint text
) returns jsonb language sql security invoker set search_path='' as $$
  select private.reserve_activation_checkout(p_request,p_email,p_guest_hash,p_lines,p_user,p_bite_ready,p_activation,p_fingerprint)
$$;

create function private.supplier_activation_admin(p_actor uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if p_actor is null then raise insufficient_privilege; end if;
  perform private.require_supplier_service(p_actor);
  return (select coalesce(jsonb_agg(jsonb_build_object('jobId',j.id,'requestId',a.request_id,'payload',a.payload)),'[]')
    from (select id,order_id from private.supplier_jobs order by created_at desc,id limit 100) j
    join private.checkout_activation a on a.order_id=j.order_id);
end $$;
create function public.supplier_activation_admin(p_actor uuid) returns jsonb
language sql security invoker set search_path='' as $$ select private.supplier_activation_admin(p_actor) $$;
revoke all on function private.reserve_activation_checkout(uuid,text,text,jsonb,uuid,boolean,jsonb,text),
  public.reserve_activation_checkout(uuid,text,text,jsonb,uuid,boolean,jsonb,text),
  private.supplier_activation_admin(uuid),public.supplier_activation_admin(uuid) from public,anon,authenticated;
grant execute on function private.reserve_activation_checkout(uuid,text,text,jsonb,uuid,boolean,jsonb,text),
  public.reserve_activation_checkout(uuid,text,text,jsonb,uuid,boolean,jsonb,text),
  private.supplier_activation_admin(uuid),public.supplier_activation_admin(uuid) to service_role;
commit;
