-- Fix variable scoping, email pattern and guest parity with existing proof checkout.
begin;
CREATE OR REPLACE FUNCTION private.reserve_bite_payos_checkout(p_request uuid, p_email text, p_guest_hash text, p_lines jsonb, p_user uuid DEFAULT NULL::uuid, p_bite_ready boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
<<checkout>>
declare
  item jsonb;
  v public.product_variants;
  unit_id uuid;
  existing private.commerce_checkout_intents;
  order_id uuid;
  readable_code text;
  provider_code bigint;
  line_count integer;
  qty integer;
  running_total bigint := 0;
  required_units integer := 0;
  picked integer;
  binding private.supplier_bindings;
  item_id uuid;
  outstanding integer;
  snapshot jsonb := '[]'::jsonb;
  cart_hash text;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise insufficient_privilege using message='Trusted checkout service required';
  end if;
  if p_request is null or p_email is null or length(p_email) not between 3 and 254
    or p_email !~* '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'
    or p_guest_hash is null or p_guest_hash !~ '^[0-9a-f]{64}$'
    or jsonb_typeof(p_lines) is distinct from 'array'
    or jsonb_array_length(p_lines) not between 1 and 20 then
    raise invalid_parameter_value using message='Invalid checkout input';
  end if;
  if p_user is not null and not exists (
    select 1 from auth.users u where u.id=p_user
      and lower(u.email)=lower(p_email)
      and u.email_confirmed_at is not null
  ) then
    raise invalid_parameter_value using message='Verified customer email mismatch';
  end if;
  -- Canonicalize cart and lock variants in consistent order for concurrency.
  select count(distinct entry.value->>'variantKey') into line_count
  from jsonb_array_elements(p_lines) as entry(value);
  if line_count <> jsonb_array_length(p_lines) then
    raise invalid_parameter_value using message='Duplicate variant';
  end if;
  select encode(pg_catalog.sha256(convert_to(p_lines::text || '|' || lower(p_email),'UTF8')),'hex')
    into cart_hash;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('hubby.checkout:'||p_request::text,0));
  select * into existing from private.commerce_checkout_intents where request_key=p_request;
  if found then
    if existing.email<>lower(p_email) or existing.guest_token_hash<>p_guest_hash
      or existing.cart_hash<>cart_hash then
      raise invalid_parameter_value using message='Checkout idempotency conflict';
    end if;
    return jsonb_build_object('orderId',existing.order_id,'orderCode',existing.order_code,
      'reused',true);
  end if;

  order_id := gen_random_uuid();
  readable_code := 'HB'||upper(substring(replace(order_id::text,'-','') from 1 for 16));
  provider_code := nextval('private.payos_order_code_seq'::regclass);
  -- First insert order, then validate and allocate under one rollback boundary.
  insert into private.commerce_orders(id,user_id,code,subtotal_vnd,total_vnd,expires_at)
  values(order_id,p_user,readable_code,1,1,now()+interval '15 minutes');
  for item in
    select entry.value from jsonb_array_elements(p_lines) as entry(value)
    order by entry.value->>'variantKey'
  loop
    if jsonb_typeof(item) is distinct from 'object'
      or (select count(*) from jsonb_object_keys(item))<>2
      or not(item ? 'variantKey' and item ? 'quantity')
      or jsonb_typeof(item->'variantKey') is distinct from 'string'
      or jsonb_typeof(item->'quantity') is distinct from 'number'
      or (item->>'quantity') !~ '^[1-9][0-9]?$' then
      raise invalid_parameter_value using message='Invalid cart item';
    end if;
    qty := (item->>'quantity')::integer;
    if qty > 20 or item->>'variantKey' !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
      raise invalid_parameter_value using message='Invalid cart item';
    end if;
    select pv.* into v from public.product_variants pv
      join public.products p on p.id=pv.product_id
      where pv.variant_key=item->>'variantKey' and pv.enabled
        and p.status='published' and pv.price_configured=true and pv.price_vnd>=2000
      for update of pv;
    if not found then
      raise invalid_parameter_value using message='Variant unavailable or unpriced';
    end if;
    running_total := running_total + v.price_vnd * qty;
    required_units := required_units + qty;
    -- Bound one automatic delivery batch to 20 sealed units on Workers Free.
    if required_units > 20 then
      raise invalid_parameter_value using message='Checkout exceeds delivery unit limit';
    end if;
    if running_total > 100000000000 then
      raise invalid_parameter_value using message='Checkout total too large';
    end if;
    insert into private.commerce_order_items(order_id,variant_id,product_name,variant_label,quantity,price_vnd)
      select order_id,v.id,p.name,v.label,qty,v.price_vnd
      from public.products p where p.id=v.product_id;
    select * into binding from private.supplier_bindings where variant_id=v.id and enabled;
    if found then
      if p_bite_ready is distinct from true then raise invalid_parameter_value using message='Supplier credentials unavailable'; end if;
      select count(*) into outstanding from private.supplier_jobs j join private.commerce_orders c on c.id=j.order_id
        where j.variant_id=v.id and j.state in ('queued','submitting','uncertain') and c.state in ('pending_payment','paid');
      if outstanding+qty>binding.max_pending then raise invalid_parameter_value using message='Supplier queue is full'; end if;
      select id into strict item_id from private.commerce_order_items where commerce_order_items.order_id=checkout.order_id and variant_id=v.id;
      insert into private.supplier_jobs(order_id,order_item_id,variant_id,unit_index,supplier,external_id)
        select checkout.order_id,item_id,v.id,n,'bite',binding.external_id from generate_series(1,qty) n;
      continue;
    end if;
    picked := 0;
    for unit_id in select id from private.commerce_stock_units
      where variant_id=v.id and state='available'
      order by id limit qty for update skip locked
    loop
      update private.commerce_stock_units set state='reserved',reserved_order_id=order_id
        where id=unit_id;
      picked := picked+1;
    end loop;
    if picked<>qty then
      raise invalid_parameter_value using message='No verified inventory for this variant';
    end if;
  end loop;
  if required_units<1 or running_total<2000 then
    raise invalid_parameter_value using message='Checkout total too small';
  end if;
  update private.commerce_orders set subtotal_vnd=running_total,total_vnd=running_total
    where id=checkout.order_id;
  insert into private.commerce_checkout_intents(request_key,order_id,order_code,email,guest_token_hash,cart_hash)
    values(p_request,order_id,provider_code,lower(p_email),p_guest_hash,cart_hash);
  return jsonb_build_object('orderId',order_id,'orderCode',provider_code,
    'total',running_total,'expiresAt',(select expires_at from private.commerce_orders where id=order_id),
    'reused',false);
end $function$;

commit;

