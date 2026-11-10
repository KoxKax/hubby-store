-- Prepared locally. Requires all preceding payOS migrations. Do not apply to
-- remote staging until stock/payment UAT and secret rotation are complete.
-- Owner casework audit: never auto-refund, auto-settle, or re-issue stock.
begin;

-- Append-only manual review history, separate from authoritative bank/payment
-- and delivery state. An operator's "resolved" is NOT proof of settlement.
create table private.payos_review_events (
  id bigint generated always as identity primary key,
  kind text not null check(kind in ('receipt_review','link_unknown','delivery_exhausted')),
  case_id text not null check(length(case_id) between 1 and 120),
  actor_id uuid not null references auth.users(id) on delete restrict,
  action text not null check(action in ('note','resolve','reopen')),
  status text not null check(status in ('open','resolved')),
  note text not null check(length(btrim(note)) between 3 and 1000),
  created_at timestamptz not null default now()
);
create index payos_review_events_case_latest
  on private.payos_review_events(kind,case_id,id desc);
alter table private.payos_review_events enable row level security;
revoke all on private.payos_review_events from public,anon,authenticated,service_role;

create function private.payos_review_case(
  p_kind text,p_case_id text,p_actor_id uuid,p_action text,p_note text
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  next_status text;
  existing_status text;
  is_case boolean := false;
  review_id bigint;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise insufficient_privilege using message='Trusted payment operations service required';
  end if;
  if p_kind is null or p_kind not in ('receipt_review','link_unknown','delivery_exhausted')
    or p_case_id is null or length(p_case_id) not between 1 and 120
    or p_actor_id is null or p_action is null or p_action not in ('note','resolve','reopen')
    or p_note is null or length(btrim(p_note)) not between 3 and 1000 then
    raise invalid_parameter_value using message='Invalid payment review input';
  end if;
  -- This RPC is only called by a verified Owner server action. Never trust a
  -- client-supplied actor ID, and also verify the membership again in SQL.
  if not exists(select 1 from private.role_memberships
     where user_id=p_actor_id and role='owner' and revoked_at is null) then
    raise insufficient_privilege using message='Owner required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('hubby.payos.review:'||p_kind||':'||p_case_id,0)
  );
  if p_kind='receipt_review' then
    select exists(select 1 from private.payos_receipts
      where provider_reference=p_case_id and outcome='reconciliation') into is_case;
  elsif p_kind='link_unknown' then
    select exists(select 1 from private.commerce_checkout_intents i
      where i.order_id::text=p_case_id and i.link_attempted_at is not null
      and not exists(select 1 from private.payos_links l where l.order_id=i.order_id)) into is_case;
  else
    select exists(select 1 from private.payos_fulfillment_outbox b
      where b.order_id::text=p_case_id and b.attempts>=4 and b.status<>'completed') into is_case;
  end if;
  if not is_case then
    raise invalid_parameter_value using message='Payment review case no longer available';
  end if;
  select status into existing_status from private.payos_review_events
    where kind=p_kind and case_id=p_case_id order by id desc limit 1;
  next_status := case p_action when 'resolve' then 'resolved'
    when 'reopen' then 'open' else coalesce(existing_status,'open') end;
  insert into private.payos_review_events(kind,case_id,actor_id,action,status,note)
    values(p_kind,p_case_id,p_actor_id,p_action,next_status,btrim(p_note))
    returning id into review_id;
  return pg_catalog.jsonb_build_object('id',review_id,'status',next_status);
end $$;

create function public.payos_review_case(
  p_kind text,p_case_id text,p_actor_id uuid,p_action text,p_note text
) returns jsonb language sql volatile security invoker set search_path='' as $$
  select private.payos_review_case(p_kind,p_case_id,p_actor_id,p_action,p_note)
$$;
revoke all on function private.payos_review_case(text,text,uuid,text,text),
  public.payos_review_case(text,text,uuid,text,text)
  from public,anon,authenticated,service_role;
grant execute on function private.payos_review_case(text,text,uuid,text,text),
  public.payos_review_case(text,text,uuid,text,text) to service_role;

create function private.payos_reconciliation_queue(p_limit integer default 40,p_status text default 'open')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  result jsonb;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise insufficient_privilege using message='Trusted payment operations service required';
  end if;
  if p_limit is null or p_limit not between 1 and 100 then
    raise invalid_parameter_value using message='Invalid payment queue limit';
  end if;
  if p_status is null or p_status not in ('open','resolved') then
    raise invalid_parameter_value using message='Invalid payment review filter';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'kind', q.kind,
    'caseId', q.case_id,
    'orderCode', q.order_code,
    'orderId', q.order_id,
    'occurredAt', floor(extract(epoch from q.occurred_at)*1000)::bigint,
    'amountVnd', q.amount_vnd,
    'reviewStatus',coalesce(q.review_status,'open'),
    'reviewNote',q.review_note,
    'reviewedAt',case when q.reviewed_at is null then null
      else floor(extract(epoch from q.reviewed_at)*1000)::bigint end
  ) order by q.occurred_at desc,q.order_code),'[]'::jsonb)
  into result from (
    select src.*, latest.status as review_status,
      latest.note as review_note,latest.created_at as reviewed_at
    from (
    -- HMAC-authenticated receipts that failed the strict payment acceptance
    -- rules: late, unknown, duplicate payment or mismatched bank information.
    select 'receipt_review'::text as kind, r.provider_reference as case_id, r.order_code,
      r.order_id,r.transferred_at as occurred_at,r.amount_vnd
    from private.payos_receipts r where r.outcome='reconciliation'
    union all
    -- Once link creation was attempted, a timeout is ambiguous. These stock
    -- reservations must NOT be returned to inventory by an expiry job.
    select 'link_unknown', i.order_id::text,i.order_code,i.order_id,i.link_attempted_at,
      o.total_vnd
    from private.commerce_checkout_intents i
      join private.commerce_orders o on o.id=i.order_id
    where i.link_attempted_at is not null
      and not exists(select 1 from private.payos_links l where l.order_id=i.order_id)
    union all
    -- Exhausted automatic deliveries require manual inspection; paid status
    -- alone must never imply that encrypted goods were delivered.
    select 'delivery_exhausted',b.order_id::text,i.order_code,b.order_id,
      coalesce(b.lease_until,b.created_at),o.total_vnd
    from private.payos_fulfillment_outbox b
      join private.commerce_checkout_intents i on i.order_id=b.order_id
      join private.commerce_orders o on o.id=b.order_id
    where b.attempts>=4 and b.status<>'completed'
    ) src
    left join lateral (
      select e.status,e.note,e.created_at from private.payos_review_events e
      where e.kind=src.kind and e.case_id=src.case_id
      order by e.id desc limit 1
    ) latest on true
    where coalesce(latest.status,'open')=p_status
  order by src.occurred_at desc,src.order_code
  limit p_limit) q;
  return result;
end $$;

create function public.payos_reconciliation_queue(p_limit integer default 40,p_status text default 'open')
returns jsonb language sql stable security invoker set search_path='' as $$
  select private.payos_reconciliation_queue(p_limit,p_status)
$$;
revoke all on function private.payos_reconciliation_queue(integer,text),
  public.payos_reconciliation_queue(integer,text)
  from public,anon,authenticated,service_role;
grant execute on function private.payos_reconciliation_queue(integer,text),
  public.payos_reconciliation_queue(integer,text) to service_role;
commit;
