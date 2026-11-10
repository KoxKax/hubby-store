-- A Bite "manual" offer can be purchased by API. Its order remains pending
-- until the provider actually delivers; the existing GET poller handles it.
-- Keep offer freshness, price, inventory and Owner authorization guards.
begin;

create or replace function private.set_supplier_binding(
  p_actor uuid, p_variant uuid, p_external text, p_enabled boolean, p_max integer
) returns boolean
language plpgsql security definer set search_path='' as $$
declare offer private.bite_catalog;
begin
  if p_actor is null then raise insufficient_privilege; end if;
  perform private.require_supplier_service(p_actor);
  if p_variant is null or p_external is null
    or p_external !~ '^[A-Za-z0-9_-]{1,80}$'
    or p_enabled is null or p_max is null or p_max not between 1 and 100 then
    raise invalid_parameter_value;
  end if;

  -- Match the variant lock used by checkout when it snapshots the binding.
  perform 1 from public.product_variants where id=p_variant for update;
  if not found then raise invalid_parameter_value; end if;

  if p_enabled then
    if p_external !~ '^[0-9]{1,20}$' then
      raise invalid_parameter_value using message='Unknown Bite identity';
    end if;
    select * into offer from private.bite_catalog where external_id=p_external;
    if offer.external_id is null or not offer.active or not offer.in_stock
      or coalesce(offer.stock,1)=0
      or offer.synced_at<now()-interval '15 minutes'
      or offer.delivery is null or offer.delivery not in ('automatic','manual')
      or offer.currency is distinct from 'USD'
      or offer.price<=0
      or not exists (
        select 1 from private.bite_catalog_sync
        where id and issue is null and last_success>=now()-interval '15 minutes'
      ) then
      raise invalid_parameter_value using message='Bite offer not eligible for API ordering';
    end if;
  end if;

  insert into private.supplier_bindings(variant_id,external_id,enabled,max_pending,updated_by)
    values(p_variant,p_external,p_enabled,p_max,p_actor)
    on conflict(variant_id) do update set
      external_id=excluded.external_id,enabled=excluded.enabled,
      max_pending=excluded.max_pending,updated_by=p_actor,updated_at=now();
  insert into private.supplier_audit(actor_id,action,entity_id,details)
    values(p_actor,'binding_changed',p_variant,
      jsonb_build_object('externalId',p_external,'enabled',p_enabled,'maxPending',p_max));
  return true;
end $$;

commit;
