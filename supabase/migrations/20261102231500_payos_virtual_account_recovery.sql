begin;
alter table private.payos_receipts add column actual_receiving_account text;
create table private.payos_account_recoveries (
  order_id uuid primary key references private.commerce_orders(id),
  reference text not null unique references private.payos_receipts(provider_reference),
  actor_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
alter table private.payos_account_recoveries enable row level security;
revoke all on private.payos_account_recoveries from public,anon,authenticated,service_role;

-- Both account fields originate in the HMAC-verified webhook, never the browser.
create function private.record_payos_receipt_v2(p_reference text,p_code bigint,p_link_id text,p_account text,p_amount bigint,p_transferred_at timestamptz,p_virtual_account text)
returns text language plpgsql security definer set search_path='' as $$
declare matched text; result text;
begin
  perform private.require_supplier_service();
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('hubby.payos:'||p_reference,0));
  select receiving_account into matched from private.payos_links where order_code=p_code and payment_link_id=p_link_id;
  if exists(select 1 from private.payos_receipts where provider_reference=p_reference
    and actual_receiving_account is not null and actual_receiving_account is distinct from p_account) then return 'reconciliation'; end if;
  result := private.record_payos_receipt(p_reference,p_code,p_link_id,
    case when matched is not null and p_virtual_account=matched then matched else p_account end,
    p_amount,p_transferred_at);
  update private.payos_receipts set actual_receiving_account=p_account
    where provider_reference=p_reference and actual_receiving_account is null
      and order_code=p_code and payment_link_id=p_link_id and amount_vnd=p_amount
      and transferred_at=p_transferred_at
      and receiving_account=case when matched is not null and p_virtual_account=matched then matched else p_account end;
  return result;
end $$;
create function public.record_payos_receipt_v2(p_reference text,p_code bigint,p_link_id text,p_account text,p_amount bigint,p_transferred_at timestamptz,p_virtual_account text)
returns text language sql security invoker set search_path='' as $$
select private.record_payos_receipt_v2(p_reference,p_code,p_link_id,p_account,p_amount,p_transferred_at,p_virtual_account) $$;

-- Server must first verify the current channel's bank account via payOS and a
-- signed PAID lookup for this exact order. Existing authenticated receipt is
-- mandatory; this never creates a payment from a return URL or a status alone.
create function private.recover_payos_account_receipt(p_actor uuid,p_order uuid,p_reference text,p_confirmed_account text)
returns boolean language plpgsql security definer set search_path='' as $$
declare r private.payos_receipts; l private.payos_links; o private.commerce_orders;
begin
  if p_actor is null then raise insufficient_privilege; end if;
  perform private.require_supplier_service(p_actor);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('hubby.payos:'||p_reference,0));
  select * into o from private.commerce_orders where id=p_order for update;
  select * into l from private.payos_links where order_id=p_order;
  select * into r from private.payos_receipts where provider_reference=p_reference for update;
  if exists(select 1 from private.payos_account_recoveries where order_id=p_order and reference=p_reference) then return true; end if;
  if o.id is null or l.order_id is null or r.provider_reference is null
    or r.outcome<>'reconciliation' or r.order_id is distinct from o.id
    or r.order_code is distinct from l.order_code or r.payment_link_id is distinct from l.payment_link_id
    or r.receiving_account is distinct from p_confirmed_account
    or r.amount_vnd<>l.amount_vnd or r.amount_vnd<>o.total_vnd
    or o.state<>'pending_payment' or not l.reservation_confirmed
    or not private.payos_reservation_is_intact(o.id)
    or r.transferred_at<o.created_at or r.transferred_at>=least(o.expires_at,l.expires_at)
    or r.created_at>=least(o.expires_at,l.expires_at)
    or exists(select 1 from private.commerce_payments where order_id=o.id)
    or exists(select 1 from private.commerce_delivery_units where order_id=o.id)
  then return false; end if;
  insert into private.commerce_payments(order_id,provider,provider_transaction,amount_vnd,direction,verification_state)
    values(o.id,'payos',r.provider_reference,r.amount_vnd,'in','verified');
  update private.payos_receipts set outcome='paid',actual_receiving_account=receiving_account where provider_reference=r.provider_reference;
  update private.commerce_orders set state='paid' where id=o.id;
  insert into private.payos_fulfillment_outbox(order_id) values(o.id);
  insert into private.payos_account_recoveries(order_id,reference,actor_id) values(o.id,r.provider_reference,p_actor);
  return true;
end $$;
create function public.recover_payos_account_receipt(p_actor uuid,p_order uuid,p_reference text,p_confirmed_account text)
returns boolean language sql security invoker set search_path='' as $$ select private.recover_payos_account_receipt(p_actor,p_order,p_reference,p_confirmed_account) $$;

-- Keep the pending database state for casework, but do not ask a customer with
-- an authenticated bank notification to pay again.
create or replace function private.commerce_order_projection(p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',o.id,'code',o.code,'created',floor(extract(epoch from o.created_at)*1000)::bigint,
 'expires',floor(extract(epoch from o.expires_at)*1000)::bigint,
 'state',case when o.state='pending_payment' and exists(select 1 from private.payos_receipts r where r.order_id=o.id) then 'review_required' else o.state end,
 'subtotal',o.subtotal_vnd,'discount',o.discount_vnd,'total',o.total_vnd,
 'paid',coalesce((select sum(amount_vnd) from private.commerce_payments where order_id=o.id and direction='in' and verification_state='verified'),0),
 'refunded',coalesce((select sum(amount_vnd) from private.commerce_payments where order_id=o.id and direction='refund' and verification_state='verified'),0),
 'items',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'product',i.product_name,'label',i.variant_label,'quantity',i.quantity,'price',i.price_vnd) order by i.id)
 from private.commerce_order_items i where i.order_id=o.id),'[]'::jsonb)) from private.commerce_orders o where o.id=p_id;
$$;
create or replace function private.resumable_payos_link(p_order uuid) returns text language sql stable security definer set search_path='' as $$
 select l.checkout_url from private.commerce_orders o join private.commerce_checkout_intents i on i.order_id=o.id join private.payos_links l on l.order_id=o.id
 where o.id=p_order and o.state='pending_payment' and o.expires_at>now() and l.expires_at>now()
 and l.reservation_confirmed and l.amount_vnd=o.total_vnd and i.order_code=l.order_code and i.link_attempted_at is not null
 and l.checkout_url ~ '^https://pay[.]payos[.]vn/' and private.payos_reservation_is_intact(o.id)
 and not exists(select 1 from private.payos_receipts where order_id=o.id)
 and not exists(select 1 from private.commerce_payments where order_id=o.id) limit 1
$$;
revoke all on function private.record_payos_receipt_v2(text,bigint,text,text,bigint,timestamptz,text),public.record_payos_receipt_v2(text,bigint,text,text,bigint,timestamptz,text),
 private.recover_payos_account_receipt(uuid,uuid,text,text),public.recover_payos_account_receipt(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function private.record_payos_receipt_v2(text,bigint,text,text,bigint,timestamptz,text),public.record_payos_receipt_v2(text,bigint,text,text,bigint,timestamptz,text),
 private.recover_payos_account_receipt(uuid,uuid,text,text),public.recover_payos_account_receipt(uuid,uuid,text,text) to service_role;
commit;
