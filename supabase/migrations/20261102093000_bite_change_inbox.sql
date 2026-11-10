begin;

-- Keep the original RPCs for Workers already deployed. The new inbox API
-- pages changes and acknowledges only IDs the Owner actually reviewed.
create function private.bite_catalog_changes_page(p_actor uuid,p_page integer,p_unread_only boolean)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if p_actor is null then raise insufficient_privilege; end if;
  perform private.require_supplier_service(p_actor);
  if p_page is null or p_page not between 1 and 100000 or p_unread_only is null then raise invalid_parameter_value; end if;
  return jsonb_build_object(
    'unread',(select count(*) from private.bite_catalog_changes where acknowledged_at is null),
    'total',(select count(*) from private.bite_catalog_changes where not p_unread_only or acknowledged_at is null),
    'items',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'externalId',external_id,'kind',kind,'fields',fields,'before',before_value,'after',after_value,'createdAt',created_at,'read',acknowledged_at is not null) order by id desc),'[]'::jsonb)
      from (select * from private.bite_catalog_changes where not p_unread_only or acknowledged_at is null order by id desc offset (p_page-1)*50 limit 50) c));
end $$;

create function private.bite_catalog_ack_page(p_actor uuid,p_ids bigint[])
returns integer language plpgsql security definer set search_path='' as $$
declare n integer;
begin
  if p_actor is null then raise insufficient_privilege; end if;
  perform private.require_supplier_service(p_actor);
  if p_ids is null or cardinality(p_ids) not between 1 and 50 then raise invalid_parameter_value; end if;
  update private.bite_catalog_changes set acknowledged_at=now(), acknowledged_by=p_actor
    where id=any(p_ids) and acknowledged_at is null;
  get diagnostics n=row_count;
  return n;
end $$;

create function private.bite_catalog_unread_count(p_actor uuid)
returns integer language plpgsql stable security definer set search_path='' as $$
begin
  if p_actor is null then raise insufficient_privilege; end if;
  perform private.require_supplier_service(p_actor);
  return (select count(*)::integer from private.bite_catalog_changes where acknowledged_at is null);
end $$;

create function public.bite_catalog_changes_page(p_actor uuid,p_page integer,p_unread_only boolean)
returns jsonb language sql security invoker set search_path='' as $$select private.bite_catalog_changes_page(p_actor,p_page,p_unread_only)$$;
create function public.bite_catalog_ack_page(p_actor uuid,p_ids bigint[])
returns integer language sql security invoker set search_path='' as $$select private.bite_catalog_ack_page(p_actor,p_ids)$$;
create function public.bite_catalog_unread_count(p_actor uuid)
returns integer language sql security invoker set search_path='' as $$select private.bite_catalog_unread_count(p_actor)$$;

revoke all on function private.bite_catalog_changes_page(uuid,integer,boolean),private.bite_catalog_ack_page(uuid,bigint[]),private.bite_catalog_unread_count(uuid),public.bite_catalog_changes_page(uuid,integer,boolean),public.bite_catalog_ack_page(uuid,bigint[]),public.bite_catalog_unread_count(uuid) from public,anon,authenticated,service_role;
grant execute on function private.bite_catalog_changes_page(uuid,integer,boolean),private.bite_catalog_ack_page(uuid,bigint[]),private.bite_catalog_unread_count(uuid),public.bite_catalog_changes_page(uuid,integer,boolean),public.bite_catalog_ack_page(uuid,bigint[]),public.bite_catalog_unread_count(uuid) to service_role;
commit;
