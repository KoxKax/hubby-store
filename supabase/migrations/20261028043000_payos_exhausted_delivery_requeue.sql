-- Locally prepared ONLY. Requires all prior payOS fulfillment and review migrations.
-- No remote migration, payment activation or stock reissue is authorized.
begin;

create table private.payos_delivery_requeue_audit (
  id bigint generated always as identity primary key,
  order_id uuid not null references private.commerce_orders(id) on delete restrict,
  actor_id uuid not null references auth.users(id) on delete restrict,
  previous_attempts smallint not null check (previous_attempts = 4),
  previous_issue text not null check (previous_issue = 'service_unavailable'),
  note text not null check (length(btrim(note)) between 10 and 1000),
  created_at timestamptz not null default now()
);
create index payos_delivery_requeue_audit_order
  on private.payos_delivery_requeue_audit(order_id, id desc);
alter table private.payos_delivery_requeue_audit enable row level security;
revoke all on private.payos_delivery_requeue_audit
  from public, anon, authenticated, service_role;

-- One Owner-authorized, audited reset of the bounded retry budget.
-- Does not decrypt, deliver, settle, reserve or replace inventory.
create function private.requeue_exhausted_payos_delivery(
  p_order uuid, p_actor uuid, p_note text
) returns boolean language plpgsql volatile security definer set search_path='' as $$
declare
  job private.payos_fulfillment_outbox;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise insufficient_privilege using message='Trusted delivery operations service required';
  end if;
  if p_order is null or p_actor is null or p_note is null
    or length(btrim(p_note)) not between 10 and 1000 then
    raise invalid_parameter_value using message='Invalid delivery recovery request';
  end if;
  if not exists(select 1 from private.role_memberships m
    where m.user_id=p_actor and m.role='owner' and m.revoked_at is null) then
    raise insufficient_privilege using message='Owner required';
  end if;

  -- Lock the same outbox row used by claim/complete/fail. A concurrent retry
  -- or a repeated POST cannot reset the counter twice.
  select * into job from private.payos_fulfillment_outbox
    where order_id=p_order for update;
  if not found or job.status<>'failed' or job.attempts<>4
    or job.last_issue is distinct from 'service_unavailable'
    or job.lease_until is not null
    or not exists(select 1 from private.commerce_orders o
      where o.id=p_order and o.state='paid')
    or not exists(select 1 from private.commerce_payments p
      where p.order_id=p_order and p.provider='payos'
        and p.direction='in' and p.verification_state='verified')
    or exists(select 1 from private.commerce_payments p
      where p.order_id=p_order and p.direction='refund'
        and p.verification_state='verified')
    or not private.payos_reservation_is_intact(p_order)
    or exists(select 1 from private.commerce_delivery_units d
      where d.order_id=p_order)
    or (select count(*) from private.payos_delivery_requeue_audit a
      where a.order_id=p_order)>=3 then
    return false;
  end if;

  update private.payos_fulfillment_outbox
    set status='held', attempts=0, next_attempt_at=now(),
        claim_token=null, lease_until=null, last_issue=null
    where order_id=p_order;
  insert into private.payos_delivery_requeue_audit(
    order_id,actor_id,previous_attempts,previous_issue,note
  ) values(p_order,p_actor,job.attempts,job.last_issue,btrim(p_note));
  return true;
end $$;

create function public.requeue_exhausted_payos_delivery(
  p_order uuid, p_actor uuid, p_note text
) returns boolean language sql volatile security invoker set search_path='' as $$
  select private.requeue_exhausted_payos_delivery(p_order,p_actor,p_note)
$$;
revoke all on function
  private.requeue_exhausted_payos_delivery(uuid,uuid,text),
  public.requeue_exhausted_payos_delivery(uuid,uuid,text)
  from public, anon, authenticated, service_role;
grant execute on function
  private.requeue_exhausted_payos_delivery(uuid,uuid,text),
  public.requeue_exhausted_payos_delivery(uuid,uuid,text)
  to service_role;
commit;
