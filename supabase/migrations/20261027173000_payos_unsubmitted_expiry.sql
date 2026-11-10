-- Local staging draft. Never run on the hosted database before transaction UAT.
-- Reclaim ONLY expired reservations for which the durable payOS create-link
-- attempt was never claimed. An attempted/linked checkout can have money in
-- transit and must NOT release stock without provider/bank reconciliation.
begin;

create function private.expire_unsubmitted_payos_checkouts(p_limit integer default 10)
returns integer language plpgsql security definer set search_path='' as $$
declare
  candidate record;
  expected_units integer;
  released integer := 0;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise insufficient_privilege using message='Trusted payment maintenance service required';
  end if;
  if p_limit is null or p_limit not between 1 and 20 then
    raise invalid_parameter_value using message='Invalid maintenance batch limit';
  end if;

  -- Match claim_payos_link_attempt lock ordering: intent before order.
  -- SKIP LOCKED avoids racing an in-progress claim or another maintainer.
  for candidate in
    select i.request_key,i.order_id,i.order_code from private.commerce_checkout_intents i
      join private.commerce_orders o on o.id=i.order_id
    where i.link_attempted_at is null and o.state='pending_payment'
      and o.expires_at<=now()
    order by o.expires_at,i.request_key
    limit p_limit for update of i skip locked
  loop
    perform 1 from private.commerce_orders o where o.id=candidate.order_id for update;
    if not exists (
      select 1 from private.commerce_orders o
        join private.commerce_checkout_intents i on i.order_id=o.id
      where o.id=candidate.order_id and o.state='pending_payment'
        and o.expires_at<=now() and i.link_attempted_at is null
    ) or exists (
      select 1 from private.payos_links where order_id=candidate.order_id
    ) or exists (
      select 1 from private.payos_receipts
      where order_id=candidate.order_id or order_code=candidate.order_code
    ) or exists (
      select 1 from private.commerce_payments where order_id=candidate.order_id
    ) or exists (
      select 1 from private.payos_fulfillment_outbox where order_id=candidate.order_id
    ) or exists (
      select 1 from private.commerce_delivery_units where order_id=candidate.order_id
    ) then continue; end if;

    select coalesce(sum(quantity),0)::integer into expected_units
      from private.commerce_order_items where order_id=candidate.order_id;
    -- Never quietly repair inconsistent reservations. Preserve them for audit.
    if expected_units not between 1 and 20
      or (select count(*) from private.commerce_stock_units
          where reserved_order_id=candidate.order_id and state='reserved')<>expected_units
      or exists (
        select 1 from private.commerce_order_items item
        where item.order_id=candidate.order_id and item.quantity <>
          (select count(*) from private.commerce_stock_units stock
            where stock.reserved_order_id=candidate.order_id
              and stock.state='reserved' and stock.variant_id=item.variant_id)
      ) then continue; end if;

    update private.commerce_stock_units
      set state='available',reserved_order_id=null
      where reserved_order_id=candidate.order_id and state='reserved';
    update private.commerce_orders set state='expired'
      where id=candidate.order_id and state='pending_payment';
    released := released+1;
  end loop;
  return released;
end $$;

create function public.expire_unsubmitted_payos_checkouts(p_limit integer default 10)
returns integer language sql security invoker set search_path='' as $$
  select private.expire_unsubmitted_payos_checkouts(p_limit)
$$;
revoke all on function
  private.expire_unsubmitted_payos_checkouts(integer),
  public.expire_unsubmitted_payos_checkouts(integer)
  from public,anon,authenticated,service_role;
grant execute on function
  private.expire_unsubmitted_payos_checkouts(integer),
  public.expire_unsubmitted_payos_checkouts(integer)
  to service_role;
commit;
