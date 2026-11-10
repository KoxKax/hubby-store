-- Supabase pg-safeupdate rejects unqualified UPDATE for API roles, even inside
-- definer RPCs. Keep the protection enabled; update only rows needing change.
begin;
create or replace function private.materialize_storefront_base(p jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare item jsonb; v jsonb; category jsonb; selected_product uuid; selected_category uuid;
begin
 perform private.cms_valid(p);
 update public.categories set enabled=false where enabled=true;
 for category in select * from jsonb_array_elements(p->'categories') loop
  insert into public.categories(slug,name,description,enabled) values(category->>'id',category->>'name',category->>'description',true)
  on conflict(slug) do update set name=excluded.name,description=excluded.description,enabled=true;
 end loop;
 update public.products set status='archived' where status<>'archived';
 update public.product_variants set enabled=false where enabled=true;
 for item in select * from jsonb_array_elements(p->'products') loop
  insert into public.products(catalog_key,slug,name,summary,status) values(item->>'id',item->>'slug',item->>'name',item->>'tagline','published')
  on conflict(catalog_key) do update set slug=excluded.slug,name=excluded.name,summary=excluded.summary,status='published',updated_at=now() returning id into selected_product;
  select id into selected_category from public.categories where slug=item->>'category';
  delete from public.product_categories pc where pc.product_id=selected_product;
  insert into public.product_categories(product_id,category_id) values(selected_product,selected_category);
  for v in select * from jsonb_array_elements(item->'variants') loop
   if exists(select 1 from public.product_variants pv where variant_key=v->>'id' and pv.product_id<>selected_product)
   then raise exception 'Variant cannot change product';end if;
   insert into public.product_variants(product_id,variant_key,sku,label,price_vnd,demo_stock,enabled)
   values(selected_product,v->>'id',v->>'id',v->>'label',(v->>'priceVnd')::bigint,(v->>'stock')::integer,true)
   on conflict(variant_key) do update set label=excluded.label,price_vnd=excluded.price_vnd,demo_stock=excluded.demo_stock,enabled=true;
  end loop;
 end loop;
 update public.media_assets set status='draft' where status='published';
 update public.media_assets set status='published' where id in(select substring(pr#>>'{media,src}' from 8)::uuid
 from jsonb_array_elements(p->'products') pr where pr ? 'media');
end $$;
revoke all on function private.materialize_storefront_base(jsonb) from public,anon,authenticated,service_role;
commit;
