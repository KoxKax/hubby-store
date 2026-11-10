-- Local-only follow-up after payOS reservations and delivery migrations.
-- Browser-bound 256-bit secret is never stored in cleartext. No anonymous
-- PostgREST role is granted access to these privileged lookup functions.
begin;

create function private.guest_order_by_proof(
  p_code text, p_email text, p_guest_hash text
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare matched uuid;
begin
  if coalesce(auth.jwt()->>'role','')<>'service_role' then
    raise insufficient_privilege using message='Trusted guest order reader required';
  end if;
  if p_code is null or p_code !~ '^HB[A-F0-9]{16}$'
    or p_email is null or length(p_email) not between 3 and 254
    or p_guest_hash is null or p_guest_hash !~ '^[a-f0-9]{64}$'
  then return null; end if;

  select o.id into matched from private.commerce_orders o
    join private.commerce_checkout_intents i on i.order_id=o.id
    where o.code=p_code and o.user_id is null
      and i.email=lower(btrim(p_email))
      and i.guest_token_hash=p_guest_hash;
  if matched is null then return null; end if;
  return private.commerce_order_projection(matched);
end $$;

-- Ciphertext is accessible to trusted Worker only when receipt, outbox,
-- full variant-matched delivery, and the browser-held proof all match.
-- Mirrors the registered-delivery integrity checks without granting a
-- guest access to another account's data or to order IDs alone.
create function private.read_guest_payos_delivery(
  p_code text, p_email text, p_guest_hash text
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare claimed_order uuid; expected integer; actual integer;
begin
  if coalesce(auth.jwt()->>'role','')<>'service_role' then
    raise insufficient_privilege using message='Trusted guest delivery reader required';
  end if;
  if p_code is null or p_code !~ '^HB[A-F0-9]{16}$'
    or p_email is null or length(p_email) not between 3 and 254
    or p_guest_hash is null or p_guest_hash !~ '^[a-f0-9]{64}$'
  then return null; end if;

  select o.id into claimed_order from private.commerce_orders o
    join private.commerce_checkout_intents i on i.order_id=o.id
    join private.payos_fulfillment_outbox b on b.order_id=o.id
    where o.code=p_code and o.user_id is null
      and i.email=lower(btrim(p_email))
      and i.guest_token_hash=p_guest_hash
      and o.state='delivered' and b.status='completed'
      and exists(select 1 from private.commerce_payments p
        where p.order_id=o.id and p.provider='payos' and p.direction='in'
          and p.verification_state='verified');
  if claimed_order is null then return null; end if;

  select coalesce(sum(quantity),0) into expected from private.commerce_order_items
    where order_id=claimed_order;
  select count(*) into actual from private.commerce_delivery_units d
    join private.commerce_stock_units s on s.id=d.stock_unit_id
    where d.order_id=claimed_order and s.state='delivered'
      and s.reserved_order_id is null;
  if expected not between 1 and 20 or actual<>expected or exists(
    select 1 from private.commerce_order_items i where i.order_id=claimed_order
      and (select count(*) from private.commerce_delivery_units d
        join private.commerce_stock_units s on s.id=d.stock_unit_id
        where d.order_id=claimed_order and d.order_item_id=i.id
          and s.variant_id=i.variant_id and s.state='delivered')<>i.quantity
  ) or exists(
    select 1 from private.commerce_delivery_units d
      join private.commerce_stock_units s on s.id=d.stock_unit_id
      left join private.commerce_order_items i on i.id=d.order_item_id
    where d.order_id=claimed_order and (i.id is null or i.order_id<>claimed_order
        or i.variant_id<>s.variant_id or s.state<>'delivered')
  ) then return null; end if;

  return (select coalesce(jsonb_agg(jsonb_build_object(
    'id',s.id,'variantId',s.variant_id,'ciphertext',s.ciphertext,
    'nonce',s.nonce,'key_version',s.key_version) order by s.id),'[]'::jsonb)
    from private.commerce_delivery_units d
    join private.commerce_stock_units s on s.id=d.stock_unit_id
    where d.order_id=claimed_order);
end $$;

create function public.guest_order_by_proof(
  p_code text,p_email text,p_guest_hash text
) returns jsonb language sql stable security invoker set search_path='' as $$
  select private.guest_order_by_proof(p_code,p_email,p_guest_hash)
$$;
create function public.read_guest_payos_delivery(
  p_code text,p_email text,p_guest_hash text
) returns jsonb language sql stable security invoker set search_path='' as $$
  select private.read_guest_payos_delivery(p_code,p_email,p_guest_hash)
$$;

revoke all on function private.guest_order_by_proof(text,text,text),
  public.guest_order_by_proof(text,text,text),
  private.read_guest_payos_delivery(text,text,text),
  public.read_guest_payos_delivery(text,text,text)
  from public,anon,authenticated,service_role;
grant execute on function private.guest_order_by_proof(text,text,text),
  public.guest_order_by_proof(text,text,text),
  private.read_guest_payos_delivery(text,text,text),
  public.read_guest_payos_delivery(text,text,text)
  to service_role;
commit;
