begin;
-- Extend the existing work projection without changing its purchase/lease gates.
do $migration$
declare definition text;
begin
  definition := pg_get_functiondef('private.claim_bite_work(uuid)'::regprocedure);
  if position('''requiresActivation''' in definition)=0 then
    definition := replace(definition,'''idempotencyKey'',coalesce',
      '''requiresActivation'',exists(select 1 from private.checkout_activation where order_id=j.order_id),''idempotencyKey'',coalesce');
    if position('''requiresActivation''' in definition)=0 then raise exception 'Unknown supplier projection'; end if;
    execute definition;
  end if;
end $migration$;
-- IDs only in the queue; activation payload stays encrypted in checkout_activation.
create table private.canva_telegram_jobs (
  job_id uuid primary key references private.supplier_jobs(id),
  telegram_order_id text unique check (telegram_order_id ~ '^[0-9]{1,20}$'),
  state text not null default 'unlinked' check(state in ('unlinked','queued','sending','sent','attention')),
  random_id bigint not null unique default (('x'||encode(gen_random_bytes(8),'hex'))::bit(64)::bigint),
  message_id integer,
  issue text,
  updated_at timestamptz not null default now()
);
alter table private.canva_telegram_jobs enable row level security;
revoke all on private.canva_telegram_jobs from public,anon,authenticated,service_role;

create function private.canva_telegram_job(p_action text,p_actor uuid default null,p_job uuid default null,p_source text default null,p_telegram text default null,p_message integer default null,p_issue text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j private.supplier_jobs; q private.canva_telegram_jobs; a private.checkout_activation;
begin
  perform private.require_supplier_service(case when p_action in ('list','link') then p_actor else null end);
  if p_action in ('list','link') and p_actor is null then raise insufficient_privilege; end if;
  if p_action='list' then
    return coalesce((select jsonb_agg(jsonb_build_object('jobId',s.id,'orderId',s.order_id,'sourceId',s.provider_order_id,'telegramOrderId',t.telegram_order_id,'state',coalesce(t.state,'unlinked'),'issue',t.issue,'messageId',t.message_id))
      from private.supplier_jobs s join private.checkout_activation c on c.order_id=s.order_id
      left join private.canva_telegram_jobs t on t.job_id=s.id),'[]');
  end if;
  if p_action='claim' then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('hubby.telegram.claim',0));
    if exists(select 1 from private.canva_telegram_jobs where state in ('sending','attention')) then return null; end if;
    select s.* into j from private.supplier_jobs s join private.canva_telegram_jobs t on t.job_id=s.id
      join private.commerce_orders o on o.id=s.order_id
      where t.state='queued' and s.provider_order_id is not null and o.state='paid'
      and exists(select 1 from private.commerce_payments p where p.order_id=o.id and p.provider='payos' and p.direction='in' and p.verification_state='verified')
      order by s.created_at,s.id limit 1 for update of s skip locked;
    if not found then return null; end if;
    select * into q from private.canva_telegram_jobs where job_id=j.id for update;
    select * into a from private.checkout_activation where order_id=j.order_id;
    update private.canva_telegram_jobs set state='sending',updated_at=now() where job_id=j.id;
    return jsonb_build_object('jobId',j.id,'sourceId',j.provider_order_id,'telegramOrderId',q.telegram_order_id,'randomId',q.random_id::text,'requestId',a.request_id,'payload',a.payload);
  end if;
  select * into j from private.supplier_jobs where id=p_job for update;
  if j.id is null then raise invalid_parameter_value; end if;
  if p_action='link' then
    if p_source is null or p_source !~ '^[0-9]{1,20}$' or p_telegram is null or p_telegram !~ '^[0-9]{1,20}$'
      or (j.provider_order_id is not null and j.provider_order_id<>p_source)
      or j.state not in ('uncertain','waiting','queued') or coalesce(j.lease_until,'epoch')>now()
      or not exists(select 1 from private.checkout_activation where order_id=j.order_id)
      or not exists(select 1 from private.commerce_orders o join private.commerce_payments p on p.order_id=o.id where o.id=j.order_id and o.state='paid' and p.provider='payos' and p.direction='in' and p.verification_state='verified')
      or exists(select 1 from private.supplier_jobs where provider_order_id=p_source and id<>j.id)
      then raise invalid_parameter_value using message='Cannot link source order'; end if;
    select * into q from private.canva_telegram_jobs where job_id=j.id for update;
    if found and (q.state not in ('unlinked','queued') or (q.telegram_order_id is not null and q.telegram_order_id<>p_telegram)) then
      raise invalid_parameter_value using message='Telegram link immutable after submission'; end if;
    update private.supplier_jobs set provider_order_id=p_source,state='waiting',provider_status='awaiting_activation',last_issue=null,next_poll=now()+interval '5 minutes' where id=j.id;
    insert into private.canva_telegram_jobs(job_id,telegram_order_id,state) values(j.id,p_telegram,'queued')
      on conflict(job_id) do update set telegram_order_id=excluded.telegram_order_id,state='queued',updated_at=now();
    insert into private.supplier_audit(actor_id,action,entity_id,details) values(p_actor,'telegram_order_linked',j.id,jsonb_build_object('sourceId',p_source,'telegramOrderId',p_telegram));
    return 'true'::jsonb;
  elsif p_action='finish' then
    if p_issue is not null and p_issue not in ('bot_order_not_found','bot_prompt_unverified','telegram_unavailable','account_mismatch','delivery_uncertain') then raise invalid_parameter_value; end if;
    update private.canva_telegram_jobs set state=case when p_message>0 and p_issue is null then 'sent' else 'attention' end,
      message_id=p_message,issue=p_issue,updated_at=now() where job_id=j.id and state='sending';
    return to_jsonb(found);
  end if;
  raise invalid_parameter_value;
end $$;
create function public.canva_telegram_job(p_action text,p_actor uuid default null,p_job uuid default null,p_source text default null,p_telegram text default null,p_message integer default null,p_issue text default null)
returns jsonb language sql security invoker set search_path='' as $$ select private.canva_telegram_job(p_action,p_actor,p_job,p_source,p_telegram,p_message,p_issue) $$;
revoke all on function private.canva_telegram_job(text,uuid,uuid,text,text,integer,text),public.canva_telegram_job(text,uuid,uuid,text,text,integer,text) from public,anon,authenticated;
grant execute on function private.canva_telegram_job(text,uuid,uuid,text,text,integer,text),public.canva_telegram_job(text,uuid,uuid,text,text,integer,text) to service_role;
create function private.queue_canva_telegram() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.provider_order_id is not null and exists(select 1 from private.checkout_activation where order_id=new.order_id) then
    insert into private.canva_telegram_jobs(job_id) values(new.id) on conflict(job_id) do nothing;
  end if;
  return new;
end $$;
revoke all on function private.queue_canva_telegram() from public,anon,authenticated,service_role;
create trigger queue_canva_telegram after insert or update of provider_order_id on private.supplier_jobs
for each row execute function private.queue_canva_telegram();
commit;
