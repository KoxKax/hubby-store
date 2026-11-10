-- Expand current CMS contract without rewriting immutable history or seeding data.
begin;
alter table public.products add column terms jsonb;
alter table public.product_variants add column price_configured boolean not null default true;
-- Historical snapshots omit priceConfigured and retain their previous semantics.
-- Every new Owner SKU supplies false until an actual price is configured.
alter function private.cms_valid(jsonb) rename to cms_valid_base;
alter function private.materialize_storefront(jsonb) rename to materialize_storefront_base;

create function private.cms_media_ids(p jsonb) returns setof uuid
language sql immutable set search_path='' as $$
 select substring(src from 8)::uuid from (
  select x#>>'{media,src}' as src from jsonb_array_elements(p->'products') x
  union all select p#>>'{announcement,media,src}'
  union all select x#>>'{media,src}' from jsonb_array_elements(coalesce(p#>'{experience,slides}','[]'::jsonb)) x
 ) refs where src is not null
$$;
create function private.cms_media_valid(p jsonb) returns void
language plpgsql set search_path='' as $$
declare media_id uuid;
begin
 if not private.shape(p,array['src','alt']) or not private.short_text(p->'alt',160)
 or coalesce(p->>'src','') !~ '^/media/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
 then raise exception 'Invalid managed media' using errcode='22023'; end if;
 media_id=substring(p->>'src' from 8)::uuid;
 if not exists(select 1 from public.media_assets m join storage.objects o
 on o.bucket_id='hubby-media' and o.name=m.object_path where m.id=media_id)
 then raise exception 'Missing media object' using errcode='22023'; end if;
end $$;

create function private.cms_valid(p jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare base jsonb; item jsonb; v jsonb; e jsonb; entry jsonb; name text; list_name text;
begin
 if not private.shape(p,array['schemaVersion','revision','brand','announcement','shop','categories','products','sections','steps','support','faqs','coupon','policies'],array['experience'])
 or octet_length(p::text)>200000 then raise exception 'Invalid CMS envelope' using errcode='22023';end if;
 -- Validate extensions before stripping them for the retained strict legacy validator.
 if not private.shape(p->'announcement',array['text','cta','href'],array['media']) then raise exception 'Invalid announcement';end if;
 if p->'announcement' ? 'media' then perform private.cms_media_valid(p#>'{announcement,media}');end if;
 if jsonb_typeof(p->'products') is distinct from 'array' then raise exception 'Invalid products';end if;
 for item in select * from jsonb_array_elements(p->'products') loop
  if not private.shape(item,array['id','slug','name','category','tagline','description','monogram','art','features','variants','deliveryLabel','activationRequired'],array['badge','media','terms']) then raise exception 'Invalid product shape';end if;
  if item ? 'terms' then
   if not private.shape(item->'terms',array['warranty','receipt','activationNote'])
   or not private.short_text(item#>'{terms,warranty}',240) or not private.short_text(item#>'{terms,receipt}',500)
   or not private.short_text(item#>'{terms,activationNote}',500) then raise exception 'Invalid product terms';end if;
  end if;
  if item ? 'media' then perform private.cms_media_valid(item->'media');end if;
  if jsonb_typeof(item->'variants') is distinct from 'array' then raise exception 'Invalid variants';end if;
  for v in select * from jsonb_array_elements(item->'variants') loop
   if not private.shape(v,array['id','label','priceVnd','stock'],array['priceConfigured'])
   or (v ? 'priceConfigured' and jsonb_typeof(v->'priceConfigured') is distinct from 'boolean')
   then raise exception 'Invalid price configuration';end if;
  end loop;
 end loop;
 if p ? 'experience' then
  e=p->'experience';
  if not private.shape(e,array['intro','notices','slides','reviews','illustrativePurchases','telegramUrl'],array['activityNotifications'])
  or not private.shape(e->'intro',array['eyebrow','title','accent','description'])
  or not private.short_text(e#>'{intro,eyebrow}',80) or not private.short_text(e#>'{intro,title}',120)
  or not private.short_text(e#>'{intro,accent}',120) or not private.short_text(e#>'{intro,description}',320)
  or jsonb_typeof(e->'illustrativePurchases') is distinct from 'boolean'
  or (e ? 'activityNotifications' and jsonb_typeof(e->'activityNotifications') is distinct from 'boolean')
  then raise exception 'Invalid experience';end if;
  if e->'telegramUrl'<>'null'::jsonb and (not private.short_text(e->'telegramUrl',200)
  or e->>'telegramUrl' !~ '^https://t\.me/[A-Za-z0-9_]{5,64}$') then raise exception 'Invalid Telegram URL';end if;
  foreach list_name in array array['notices','slides','reviews'] loop
   if jsonb_typeof(e->list_name) is distinct from 'array' then raise exception 'Invalid experience list';end if;
   if jsonb_array_length(e->list_name)>(case when list_name='notices' then 8 else 12 end)
   or (list_name='notices' and jsonb_array_length(e->list_name)<1)
   or (select count(*) from jsonb_array_elements(e->list_name))<>(select count(distinct x->>'id') from jsonb_array_elements(e->list_name) x)
   then raise exception 'Invalid experience list length or duplicate ID';end if;
   for entry in select * from jsonb_array_elements(e->list_name) loop
    if not private.short_text(entry->'id',80) or coalesce(entry->>'id','')!~'^[a-z0-9]+(-[a-z0-9]+)*$' then raise exception 'Invalid experience ID';end if;
    if list_name='notices' then
     if not private.shape(entry,array['id','text','href']) or not private.short_text(entry->'text',180)
     or not private.short_text(entry->'href',200) or entry->>'href'!~'^/(?!/)[a-zA-Z0-9/#?=&_-]*$' then raise exception 'Invalid notice';end if;
    elsif list_name='slides' then
     if not private.shape(entry,array['id','title','description','theme','href'],array['media'])
     or not private.short_text(entry->'title',160) or not private.short_text(entry->'description',240)
     or coalesce(entry->>'theme','') not in ('mint','peach','lavender') or not private.short_text(entry->'href',200)
     or entry->>'href'!~'^/(?!/)[a-zA-Z0-9/#?=&_-]*$' then raise exception 'Invalid slide';end if;
     if entry ? 'media' then perform private.cms_media_valid(entry->'media');end if;
    else
     if not private.shape(entry,array['id','name','text','product']) or not private.short_text(entry->'name',80)
     or not private.short_text(entry->'text',1000) or not private.short_text(entry->'product',80) then raise exception 'Invalid review';end if;
    end if;
   end loop;
  end loop;
 end if;
 base=p-'experience';
 base=jsonb_set(base,'{announcement}',(p->'announcement')-'media');
 base=jsonb_set(base,'{products}',coalesce((select jsonb_agg(jsonb_set(x-'terms','{variants}',
 (select jsonb_agg(variant_entry.value-'priceConfigured') from jsonb_array_elements(x->'variants') variant_entry(value))))
 from jsonb_array_elements(p->'products') x),'[]'::jsonb));
 perform private.cms_valid_base(base);
end $$;

create function private.materialize_storefront(p jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
 -- Base implementation revalidates, preserves stable keys and fails atomic
 -- publication if a variant moves to a different product.
 perform private.materialize_storefront_base(p);
 update public.products pr set terms=x->'terms' from jsonb_array_elements(p->'products') x where pr.catalog_key=x->>'id';
 update public.product_variants pv set price_configured=coalesce((v->>'priceConfigured')::boolean,true)
 from jsonb_array_elements(p->'products') x cross join lateral jsonb_array_elements(x->'variants') v where pv.variant_key=v->>'id';
 update public.media_assets set status='published' where id in(select private.cms_media_ids(p));
end $$;

revoke all on function private.cms_valid_base(jsonb),private.materialize_storefront_base(jsonb),private.cms_media_ids(jsonb),private.cms_media_valid(jsonb),private.cms_valid(jsonb),private.materialize_storefront(jsonb) from public,anon,authenticated,service_role;
-- Existing invoker RPC signatures, Owner/AAL2 guards and table RLS stay unchanged.
commit;
