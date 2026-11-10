-- Local-only: retrieve an already-issued payOS checkout URL for a verified
-- browser/owner. No provider requests, new reservations, or state mutation.
-- Never deploy this before the prerequisite checkout/stock migrations pass UAT.
begin;

create function private.resumable_payos_link(p_order uuid)
returns text language sql stable security definer set search_path='' as $$
  select l.checkout_url from private.commerce_orders o
    join private.commerce_checkout_intents i on i.order_id=o.id
    join private.payos_links l on l.order_id=o.id
    where o.id=p_order and o.state='pending_payment'
      and o.expires_at>now() and l.expires_at>now()
      and l.reservation_confirmed=true
      and l.amount_vnd=o.total_vnd and i.order_code=l.order_code
      and i.link_attempted_at is not null
      and l.checkout_url ~ '^https://pay\.payos\.vn/'
      and (select count(*) from private.commerce_stock_units s
        where s.reserved_order_id=o.id and s.state='reserved') > 0
      and (select count(*) from private.commerce_stock_units s
        where s.reserved_order_id=o.id and s.state='reserved') =
        (select coalesce(sum(quantity),0) from private.commerce_order_items
          where order_id=o.id)
    limit 1
$$;

-- auth.uid() is checked in the DB, never accepted from a browser parameter.
create function private.resume_registered_payos_link(p_order uuid)
returns text language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=private.customer_actor();
begin
  if p_order is null or not exists(
    select 1 from private.commerce_orders where id=p_order and user_id=actor
  ) then return null; end if;
  return private.resumable_payos_link(p_order);
end $$;

-- Guest access requires the exact browser-bound SHA-256 proof, code and email.
create function private.resume_guest_payos_link(
  p_code text,p_email text,p_guest_hash text
) returns text language plpgsql stable security definer set search_path='' as $$
declare matched uuid;
begin
  if coalesce(auth.jwt()->>'role','')<>'service_role' then
    raise insufficient_privilege using message='Trusted payment reader required';
  end if;
  if p_code is null or p_code !~ '^HB[A-F0-9]{16}$'
    or p_email is null or length(p_email) not between 3 and 254
    or p_guest_hash is null or p_guest_hash !~ '^[a-f0-9]{64}$'
  then return null; end if;
  select o.id into matched from private.commerce_orders o
    join private.commerce_checkout_intents i on i.order_id=o.id
    where o.code=p_code and o.user_id is null
      and i.email=lower(btrim(p_email)) and i.guest_token_hash=p_guest_hash;
  if matched is null then return null; end if;
  return private.resumable_payos_link(matched);
end $$;

create function public.resume_registered_payos_link(p_order uuid)
returns text language sql stable security invoker set search_path='' as $$
  select private.resume_registered_payos_link(p_order)
$$;
create function public.resume_guest_payos_link(
  p_code text,p_email text,p_guest_hash text
) returns text language sql stable security invoker set search_path='' as $$
  select private.resume_guest_payos_link(p_code,p_email,p_guest_hash)
$$;

revoke all on function private.resumable_payos_link(uuid),
  private.resume_registered_payos_link(uuid),public.resume_registered_payos_link(uuid),
  private.resume_guest_payos_link(text,text,text),
  public.resume_guest_payos_link(text,text,text)
  from public,anon,authenticated,service_role;
grant execute on function private.resume_registered_payos_link(uuid),
  public.resume_registered_payos_link(uuid) to authenticated;
grant execute on function private.resume_guest_payos_link(text,text,text),
  public.resume_guest_payos_link(text,text,text) to service_role;
commit;
