begin;

-- Lightweight Owner-only alert cursor. Unread digests can retain the same
-- count while new stock changes arrive; the monotonically increasing event ID
-- lets the CMS distinguish these changes without loading 50 audit records.
create function private.bite_catalog_alert_status(p_actor uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare latest record;
begin
  if p_actor is null then raise insufficient_privilege; end if;
  perform private.require_supplier_service(p_actor);
  select id,external_id,kind,fields into latest
  from private.bite_catalog_changes order by id desc limit 1;
  return jsonb_build_object(
    'unread', private.bite_catalog_unread_count(p_actor),
    'latestId', coalesce(latest.id, 0),
    'externalId', latest.external_id,
    'kind', latest.kind,
    'fields', coalesce(to_jsonb(latest.fields), '[]'::jsonb)
  );
end $$;

create function public.bite_catalog_alert_status(p_actor uuid)
returns jsonb language sql security invoker set search_path='' as $$
  select private.bite_catalog_alert_status(p_actor)
$$;

revoke all on function private.bite_catalog_alert_status(uuid), public.bite_catalog_alert_status(uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.bite_catalog_alert_status(uuid), public.bite_catalog_alert_status(uuid)
  to service_role;

commit;
