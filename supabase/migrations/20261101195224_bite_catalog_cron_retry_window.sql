-- The Worker cron fires every five minutes, while next_due is calculated
-- from the *end* of the preceding sync. Allow a small scheduling margin so
-- a cron tick a few seconds before next_due cannot starve retries forever.
-- Service/Owner authorization and the active lease remain unchanged.
begin;

create or replace function private.claim_bite_catalog_sync(
  p_actor uuid default null,
  p_force boolean default false
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  s private.bite_catalog_sync;
  claim uuid := gen_random_uuid();
begin
  perform private.require_supplier_service(p_actor);
  if p_force and p_actor is null then raise insufficient_privilege; end if;

  select * into s from private.bite_catalog_sync where id for update;
  if s.lease_until > now()
    or (not p_force and s.next_due > now() + interval '30 seconds') then
    return null;
  end if;

  if s.next_page = 1 then s.generation := gen_random_uuid(); end if;
  if s.next_page > 100 then
    update private.bite_catalog_sync
      set issue='page_limit', next_due=now()+interval '1 hour'
      where id;
    return null;
  end if;

  update private.bite_catalog_sync
    set generation=s.generation,
        token=claim,
        lease_until=now()+interval '2 minutes'
    where id;

  return jsonb_build_object(
    'token', claim,
    'generation', s.generation,
    'page', s.next_page
  );
end $$;

commit;
