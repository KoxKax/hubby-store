begin;
create function private.customer_order_for_payos_code(p_code bigint) returns uuid
language plpgsql stable security definer set search_path='' as $$
declare actor uuid := private.customer_actor();
begin
  return (select o.id from private.commerce_orders o join private.commerce_checkout_intents i on i.order_id=o.id where o.user_id=actor and i.order_code=p_code limit 1);
end $$;
create function public.customer_order_for_payos_code(p_code bigint) returns uuid
language sql stable security invoker set search_path='' as $$ select private.customer_order_for_payos_code(p_code) $$;
revoke all on function private.customer_order_for_payos_code(bigint),public.customer_order_for_payos_code(bigint) from public,anon,authenticated,service_role;
grant execute on function private.customer_order_for_payos_code(bigint),public.customer_order_for_payos_code(bigint) to authenticated;
commit;
