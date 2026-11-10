-- Forward-only supplier hardening. Existing CMS, Owner prices and paid ledger are untouched.
begin;

alter table private.supplier_jobs
  add column quoted_source_price numeric(20,6),
  add column quoted_source_currency text;

-- Reserve across every Hubby variant mapped to the same Bite offer, while
-- still enforcing the Owner's per-variant queue ceiling.
create or replace function private.guard_bite_reservation() returns trigger
language plpgsql security definer set search_path='' as $$
declare offer private.bite_catalog; binding private.supplier_bindings;
        source_outstanding integer; variant_outstanding integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('bite.offer:'||new.external_id,0));
  select * into binding from private.supplier_bindings
    where variant_id=new.variant_id and external_id=new.external_id and enabled;
  select * into offer from private.bite_catalog where external_id=new.external_id;
  if binding.variant_id is null or offer.external_id is null or not offer.active
    or not offer.in_stock or offer.synced_at<now()-interval '15 minutes'
    or exists(select 1 from private.bite_catalog_sync where issue is not null) then
    raise invalid_parameter_value using message='Bite offer unavailable or stale';
  end if;
  select count(*),count(*) filter (where j.variant_id=new.variant_id)
    into source_outstanding,variant_outstanding
    from private.supplier_jobs j join private.commerce_orders o on o.id=j.order_id
    where j.external_id=new.external_id
      and j.state in ('queued','submitting','uncertain','waiting','failed','file_ready')
      and o.state in ('pending_payment','paid');
  if source_outstanding>=coalesce(offer.stock,1)
    or variant_outstanding>=binding.max_pending then
    raise invalid_parameter_value using message='Bite stock or queue reserved';
  end if;
  new.quoted_source_price:=offer.price;
  new.quoted_source_currency:=offer.currency;
  new.idempotency_key:='hubby-bite:'||new.id::text;
  return new;
end $$;

-- One automatic POST only. After an ambiguous network response the job stays
-- unresolved until an operator reconciles it; Bite's idempotency TTL is unknown.
-- GET polling still resumes safely for a previously recorded provider order.
create or replace function private.claim_bite_work(p_job uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j private.supplier_jobs; o private.commerce_orders;
        claim uuid:=gen_random_uuid(); mode text;
begin
  perform private.require_supplier_service();
  select c.* into o from private.commerce_orders c where c.state='paid'
    and exists(select 1 from private.commerce_payments p where p.order_id=c.id
      and p.provider='payos' and p.direction='in' and p.verification_state='verified')
    and exists(select 1 from private.supplier_jobs s where s.order_id=c.id
      and (p_job is null or s.id=p_job)
      and s.state in ('queued','waiting','uncertain','submitting')
      and s.next_poll<=now() and coalesce(s.lease_until,'epoch')<now()
      and (
        (s.provider_order_id is not null and s.poll_attempts<100)
        or (s.state='queued' and s.provider_order_id is null
          and s.submitted_at is null and s.purchase_attempts=0
          and exists(select 1 from private.bite_catalog b
            where b.external_id=s.external_id and b.active and b.in_stock
              and b.synced_at>=now()-interval '15 minutes'
              and b.price=s.quoted_source_price
              and b.currency is not distinct from s.quoted_source_currency
              and not exists(select 1 from private.bite_catalog_sync where issue is not null)))
      ))
    order by c.created_at,c.id limit 1 for update of c skip locked;
  if not found then return null; end if;
  select * into j from private.supplier_jobs s where s.order_id=o.id
    and (p_job is null or s.id=p_job)
    and s.state in ('queued','waiting','uncertain','submitting')
    and s.next_poll<=now() and coalesce(s.lease_until,'epoch')<now()
    and (
      (s.provider_order_id is not null and s.poll_attempts<100)
      or (s.state='queued' and s.provider_order_id is null
        and s.submitted_at is null and s.purchase_attempts=0
        and exists(select 1 from private.bite_catalog b
          where b.external_id=s.external_id and b.active and b.in_stock
            and b.synced_at>=now()-interval '15 minutes'
            and b.price=s.quoted_source_price
            and b.currency is not distinct from s.quoted_source_currency
            and not exists(select 1 from private.bite_catalog_sync where issue is not null)))
    )
    order by case when s.provider_order_id is not null then 0 else 1 end,
      s.created_at,s.id limit 1 for update skip locked;
  if not found then return null; end if;
  mode:=case when j.provider_order_id is null then 'purchase' else 'poll' end;
  update private.supplier_jobs set token=claim,lease_until=now()+interval '2 minutes',
    idempotency_key=coalesce(idempotency_key,'hubby-bite:'||id::text),
    state=case when mode='purchase' then 'submitting' else state end,
    submitted_at=case when mode='purchase' then now() else submitted_at end,
    purchase_attempts=purchase_attempts+case when mode='purchase' then 1 else 0 end,
    poll_attempts=poll_attempts+case when mode='poll' then 1 else 0 end
    where id=j.id;
  return jsonb_build_object('id',j.id,'token',claim,'stockId',j.stock_id,
    'responseId',j.response_id,'variantId',j.variant_id,'externalId',j.external_id,
    'mode',mode,'providerOrderId',j.provider_order_id,
    'idempotencyKey',coalesce(j.idempotency_key,'hubby-bite:'||j.id::text));
end $$;

-- Expose remaining availability accurately for a variant when several
-- variants share one source offer. Both limits are independently binding:
-- global source stock and this variant's Owner-configured queue ceiling.
create or replace function private.bite_public_availability() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  perform private.require_supplier_service();
  return (select coalesce(jsonb_agg(jsonb_build_object('variantKey',v.variant_key,'stock',case
    when b.variant_id is null or not b.enabled then
      (select count(*) from private.commerce_stock_units s where s.variant_id=v.id and s.state='available')
    when c.external_id is null or not c.active or not c.in_stock
      or c.synced_at<now()-interval '15 minutes'
      or exists(select 1 from private.bite_catalog_sync where issue is not null) then 0
    else least(
      greatest(0,coalesce(c.stock,1)-
        (select count(*) from private.supplier_jobs j
          join private.commerce_orders o on o.id=j.order_id
          where j.external_id=b.external_id and j.state in
            ('queued','submitting','uncertain','waiting','failed','file_ready')
            and o.state in ('pending_payment','paid'))),
      greatest(0,b.max_pending-
        (select count(*) from private.supplier_jobs j
          join private.commerce_orders o on o.id=j.order_id
          where j.variant_id=v.id and j.external_id=b.external_id
            and j.state in ('queued','submitting','uncertain','waiting','failed','file_ready')
            and o.state in ('pending_payment','paid')))
    ) end)),'[]')
    from public.product_variants v
    left join private.supplier_bindings b on b.variant_id=v.id
    left join private.bite_catalog c on c.external_id=b.external_id);
end $$;

commit;
