-- A verified email owner may explicitly attach their historical guest order
-- to the same authenticated customer. No payment or stock state is touched.
begin;

create table private.guest_order_claim_events (
  order_id uuid primary key references private.commerce_orders(id) on delete restrict,
  actor_id uuid not null references auth.users(id) on delete restrict,
  claimed_at timestamptz not null default now()
);
create index guest_order_claim_events_actor on private.guest_order_claim_events(actor_id,claimed_at desc);
alter table private.guest_order_claim_events enable row level security;
revoke all on private.guest_order_claim_events from public,anon,authenticated,service_role;

create function private.claim_verified_guest_order(p_code text,p_email text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  actor uuid := private.customer_actor();
  verified_email text;
  normalized_email text := lower(btrim(coalesce(p_email,'')));
  found_order uuid;
  current_owner uuid;
begin
  if p_code is null or p_code !~ '^HB[A-F0-9]{16}$'
    or length(normalized_email) not between 3 and 254 then
    return null;
  end if;
  select lower(btrim(u.email)) into verified_email
    from auth.users u where u.id=actor and u.email_confirmed_at is not null;
  if verified_email is null or verified_email<>normalized_email then
    return null;
  end if;
  -- Lock the order, not the checkout intent. Concurrent actors cannot both claim.
  select o.id,o.user_id into found_order,current_owner
    from private.commerce_orders o
    join private.commerce_checkout_intents ci on ci.order_id=o.id
    where o.code=p_code and lower(btrim(ci.email))=verified_email
    for update of o;
  if not found or (current_owner is not null and current_owner<>actor) then
    return null;
  end if;
  if current_owner is null then
    update private.commerce_orders set user_id=actor where id=found_order;
    insert into private.guest_order_claim_events(order_id,actor_id)
      values(found_order,actor);
  end if;
  return private.commerce_order_projection(found_order);
end $$;

create function private.customer_order_by_code(p_code text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid := private.customer_actor(); found_order uuid;
begin
  if p_code is null or p_code !~ '^HB[A-F0-9]{16}$' then return null; end if;
  select id into found_order from private.commerce_orders
    where code=p_code and user_id=actor;
  if not found then return null; end if;
  return private.commerce_order_projection(found_order);
end $$;

create function public.claim_verified_guest_order(p_code text,p_email text)
returns jsonb language sql security invoker set search_path='' as $$
  select private.claim_verified_guest_order(p_code,p_email)
$$;
create function public.customer_order_by_code(p_code text)
returns jsonb language sql stable security invoker set search_path='' as $$
  select private.customer_order_by_code(p_code)
$$;

revoke all on function private.claim_verified_guest_order(text,text),
  private.customer_order_by_code(text),
  public.claim_verified_guest_order(text,text),
  public.customer_order_by_code(text)
  from public,anon,authenticated,service_role;
grant execute on function private.claim_verified_guest_order(text,text),
  private.customer_order_by_code(text),
  public.claim_verified_guest_order(text,text),
  public.customer_order_by_code(text) to authenticated;
commit;
