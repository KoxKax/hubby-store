-- Phase 2 only: run against an isolated Supabase staging project after authorization.
-- No inventory secrets, payment accounts, orders or production provisioning here.
begin;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.role_memberships (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('customer','owner')),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz
);
create unique index single_active_owner on private.role_memberships(role) where role='owner' and revoked_at is null;
alter table private.role_memberships enable row level security;

create function public.owner_status() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('owner', exists(select 1 from private.role_memberships where user_id=auth.uid() and role='owner' and revoked_at is null), 'aal2', coalesce(auth.jwt()->>'aal'='aal2',false));
$$;
create function public.hubby_owner() returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(auth.jwt()->>'aal'='aal2',false) and exists(select 1 from private.role_memberships where user_id=auth.uid() and role='owner' and revoked_at is null);
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (length(display_name) between 1 and 80),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy profile_self_read on public.profiles for select to authenticated using(id=auth.uid());
create policy profile_self_edit on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
create function private.new_user() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.profiles(id,display_name) values(new.id,left(coalesce(nullif(btrim(new.raw_user_meta_data->>'display_name'),''),'Khách hàng'),80));
 insert into private.role_memberships(user_id,role) values(new.id,'customer');
 return new;
end $$;
create trigger hubby_new_user after insert on auth.users for each row execute function private.new_user();

create table public.categories (
  id uuid primary key default gen_random_uuid(), slug text not null unique check(slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null, description text not null, enabled boolean not null default true
);
create table public.products (
  id uuid primary key default gen_random_uuid(), catalog_key text not null unique, slug text not null unique,
  name text not null, summary text not null, status text not null check(status in ('published','archived')),
  updated_at timestamptz not null default now()
);
create table public.product_categories (
  product_id uuid references public.products(id) on delete restrict,
  category_id uuid references public.categories(id) on delete restrict,
  primary key(product_id,category_id)
);
create table public.product_variants (
  id uuid primary key default gen_random_uuid(), product_id uuid not null references public.products(id),
  variant_key text not null unique, sku text not null unique, label text not null,
  price_vnd bigint not null check(price_vnd between 0 and 1000000000),
  demo_stock integer not null check(demo_stock between 0 and 999), enabled boolean not null default true
);
create index variants_product on public.product_variants(product_id,enabled);
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_categories enable row level security;
alter table public.product_variants enable row level security;
create policy category_public on public.categories for select to anon,authenticated using(enabled or public.hubby_owner());
create policy product_public on public.products for select to anon,authenticated using(status='published' or public.hubby_owner());
create policy category_link_public on public.product_categories for select to anon,authenticated using(exists(select 1 from public.products p where p.id=product_id and p.status='published') or public.hubby_owner());
create policy variant_public on public.product_variants for select to anon,authenticated using((enabled and exists(select 1 from public.products p where p.id=product_id and p.status='published')) or public.hubby_owner());

create table public.media_assets (
  id uuid primary key default gen_random_uuid(), object_path text not null unique,
  mime text not null check(mime in ('image/png','image/jpeg','image/webp','image/avif')),
  byte_size integer not null check(byte_size between 12 and 2097152),
  alt text not null check(length(alt) between 1 and 160), source_license text not null check(length(source_license) between 1 and 500),
  checksum text not null check(checksum ~ '^[a-f0-9]{64}$'), status text not null default 'draft' check(status in ('draft','published')),
  uploaded_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
  check(object_path ~ '^[a-f0-9-]{36}/[a-f0-9-]{36}\.(png|jpg|webp|avif)$')
);
alter table public.media_assets enable row level security;
create policy media_read on public.media_assets for select to anon,authenticated using(status='published' or public.hubby_owner());
create policy media_owner_insert on public.media_assets for insert to authenticated with check(public.hubby_owner() and uploaded_by=auth.uid() and status='draft' and object_path=auth.uid()::text||'/'||id::text||case mime when 'image/jpeg' then '.jpg' when 'image/png' then '.png' when 'image/webp' then '.webp' else '.avif' end);
create policy media_owner_edit on public.media_assets for update to authenticated using(public.hubby_owner()) with check(public.hubby_owner());

create table public.cms_documents (
  id uuid primary key default gen_random_uuid(), slug text not null unique check(slug='storefront'),
  head_version integer not null default 0 check(head_version>=0), published_revision_id uuid
);
create table public.cms_revisions (
  id uuid primary key default gen_random_uuid(), document_id uuid not null references public.cms_documents(id),
  version integer not null check(version>0), schema_version integer not null check(schema_version=2),
  payload jsonb not null, author_id uuid, created_at timestamptz not null default now(),
  unique(document_id,version), unique(document_id,id)
);
alter table public.cms_documents add foreign key(id,published_revision_id) references public.cms_revisions(document_id,id);
create table public.cms_publications (
  id uuid primary key default gen_random_uuid(), document_id uuid not null, revision_id uuid not null,
  actor_id uuid not null, created_at timestamptz not null default now(),
  foreign key(document_id,revision_id) references public.cms_revisions(document_id,id)
);
create table private.cms_audit (
  id uuid primary key default gen_random_uuid(), actor_id uuid, action text not null, revision_id uuid,
  created_at timestamptz not null default now()
);
alter table private.cms_audit enable row level security;
alter table public.cms_documents enable row level security;
alter table public.cms_revisions enable row level security;
alter table public.cms_publications enable row level security;
create policy cms_docs_owner on public.cms_documents for select to authenticated using(public.hubby_owner());
create policy cms_revisions_owner on public.cms_revisions for select to authenticated using(public.hubby_owner());
create policy cms_publications_owner on public.cms_publications for select to authenticated using(public.hubby_owner());
create function private.immutable_revision() returns trigger language plpgsql set search_path='' as $$begin raise exception 'Immutable CMS history' using errcode='55000'; end $$;
create trigger immutable_cms before update or delete on public.cms_revisions for each row execute function private.immutable_revision();
create trigger immutable_publication before update or delete on public.cms_publications for each row execute function private.immutable_revision();
create trigger immutable_audit before update or delete on private.cms_audit for each row execute function private.immutable_revision();
insert into public.cms_documents(slug) values('storefront');

create table public.wishlists (
  user_id uuid references auth.users(id) on delete cascade, product_id uuid references public.products(id),
  created_at timestamptz not null default now(), primary key(user_id,product_id)
);
create table public.recent_views (
  user_id uuid references auth.users(id) on delete cascade, product_id uuid references public.products(id),
  last_viewed_at timestamptz not null default now(), primary key(user_id,product_id)
);
alter table public.wishlists enable row level security;
alter table public.recent_views enable row level security;
create policy own_wishlists on public.wishlists for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid() and exists(select 1 from public.products p where p.id=product_id and p.status='published'));
create policy own_recent on public.recent_views for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid() and exists(select 1 from public.products p where p.id=product_id and p.status='published'));

-- Validate the raw RPC boundary too: clients can call PostgREST without our UI.
create function private.shape(p jsonb, required text[], optional text[] default '{}') returns boolean language plpgsql immutable set search_path='' as $$
begin
 if jsonb_typeof(p) is distinct from 'object' then return false; end if;
 return p ?& required and not exists(select 1 from jsonb_object_keys(p) k where not(k=any(required||optional)));
end $$;
create function private.short_text(p jsonb, max_length integer) returns boolean language sql immutable set search_path='' as $$select coalesce(jsonb_typeof(p)='string' and length(btrim(p#>>'{}')) between 1 and max_length,false)$$;
create function private.cms_valid(p jsonb) returns void language plpgsql security definer set search_path='' as $$
declare v jsonb; c jsonb; s jsonb; item jsonb; name text; media_id uuid;
begin
 if not private.shape(p,array['schemaVersion','revision','brand','announcement','shop','categories','products','sections','steps','support','faqs','coupon','policies']) or p->>'schemaVersion'<>'2' or not private.short_text(p->'revision',80) or octet_length(p::text)>200000 then raise exception 'Invalid CMS envelope' using errcode='22023'; end if;
 if not private.shape(p->'brand',array['name','tagline','footer']) then raise exception 'Invalid brand';end if;
 foreach name in array array['name','tagline','footer'] loop if not private.short_text(p->'brand'->name,240) then raise exception 'Invalid brand text';end if;end loop;
 if not private.shape(p->'announcement',array['text','cta','href']) or not private.short_text(p#>'{announcement,text}',180) or not private.short_text(p#>'{announcement,cta}',80) or coalesce(p#>>'{announcement,href}','')!~'^/(?!/)[a-zA-Z0-9/#?=&_-]*$' then raise exception 'Invalid announcement';end if;
 if not private.shape(p->'shop',array['eyebrow','title','accent','description','searchPlaceholder','allLabel','resultsLabel']) then raise exception 'Invalid shop';end if;
 foreach name in array array['eyebrow','title','accent','description','searchPlaceholder','allLabel','resultsLabel'] loop if not private.short_text(p->'shop'->name,320) then raise exception 'Invalid shop text';end if;end loop;
 foreach name in array array['categories','products','sections','steps','faqs','policies'] loop if jsonb_typeof(p->name) is distinct from 'array' or jsonb_array_length(p->name)<1 then raise exception 'Invalid CMS list';end if;end loop;
 if jsonb_array_length(p->'products')>19 or jsonb_array_length(p->'categories')>12 or jsonb_array_length(p->'sections')>12 or jsonb_array_length(p->'steps')>5 or jsonb_array_length(p->'faqs')>20 or jsonb_array_length(p->'policies')>8 then raise exception 'Too many CMS entries';end if;
 if (select count(*) from jsonb_array_elements(p->'categories'))<>(select count(distinct x->>'id') from jsonb_array_elements(p->'categories') x) then raise exception 'Duplicate category';end if;
 for c in select * from jsonb_array_elements(p->'categories') loop
  if not private.shape(c,array['id','name','description','icon']) or not private.short_text(c->'id',80) or coalesce(c->>'id','')!~'^[a-z0-9]+(-[a-z0-9]+)*$' or not private.short_text(c->'name',80) or not private.short_text(c->'description',180) or coalesce(c->>'icon','') not in ('sparkles','grid','play','layers') then raise exception 'Invalid category';end if;
 end loop;
 if (select count(*) from jsonb_array_elements(p->'products'))<>(select count(distinct x->>'id') from jsonb_array_elements(p->'products') x) or (select count(*) from jsonb_array_elements(p->'products'))<>(select count(distinct x->>'slug') from jsonb_array_elements(p->'products') x) then raise exception 'Duplicate product';end if;
 for item in select * from jsonb_array_elements(p->'products') loop
  if not private.shape(item,array['id','slug','name','category','tagline','description','monogram','art','features','variants','deliveryLabel','activationRequired'],array['badge','media']) then raise exception 'Invalid product shape';end if;
  foreach name in array array['id','slug','category'] loop if not private.short_text(item->name,80) or item->>name!~'^[a-z0-9]+(-[a-z0-9]+)*$' then raise exception 'Invalid product key';end if;end loop;
  if not exists(select 1 from jsonb_array_elements(p->'categories') x where x->>'id'=item->>'category') then raise exception 'Missing category';end if;
  foreach name in array array['name','tagline','description','monogram','deliveryLabel'] loop if not private.short_text(item->name,5000) then raise exception 'Invalid product text';end if;end loop;
  if item ? 'badge' and not private.short_text(item->'badge',50) then raise exception 'Invalid badge';end if;
  if coalesce(item->>'art','') not in ('canva','capcut','google','netflix') or jsonb_typeof(item->'activationRequired') is distinct from 'boolean' or jsonb_typeof(item->'features') is distinct from 'array' or jsonb_array_length(item->'features') not between 1 and 12 then raise exception 'Invalid product attributes';end if;
  for v in select * from jsonb_array_elements(item->'features') loop if not private.short_text(v,240) then raise exception 'Invalid feature';end if;end loop;
  if jsonb_typeof(item->'variants') is distinct from 'array' or jsonb_array_length(item->'variants') not between 1 and 8 then raise exception 'Invalid variants';end if;
  for v in select * from jsonb_array_elements(item->'variants') loop
   if not private.shape(v,array['id','label','priceVnd','stock']) or not private.short_text(v->'id',80) or v->>'id'!~'^[a-z0-9]+(-[a-z0-9]+)*$' or not private.short_text(v->'label',80) then raise exception 'Invalid variant';end if;
   foreach name in array array['priceVnd','stock'] loop if jsonb_typeof(v->name) is distinct from 'number' or (v->>name)::numeric<0 or floor((v->>name)::numeric)<>(v->>name)::numeric then raise exception 'Invalid integer';end if;end loop;
   if (v->>'priceVnd')::numeric>1000000000 or (v->>'stock')::numeric>999 then raise exception 'Variant bounds exceeded';end if;
  end loop;
  if item ? 'media' then
   if not private.shape(item->'media',array['src','alt']) or not private.short_text(item#>'{media,alt}',160) or coalesce(item#>>'{media,src}','')!~'^/media/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' then raise exception 'Invalid media';end if;
   media_id=substring(item#>>'{media,src}' from 8)::uuid;
   if not exists(select 1 from public.media_assets where id=media_id) then raise exception 'Missing media';end if;
  end if;
 end loop;
 if (select count(*) from jsonb_array_elements(p->'products') pr cross join lateral jsonb_array_elements(pr->'variants') variant_entry(value))<>(select count(distinct variant_entry.value->>'id') from jsonb_array_elements(p->'products') pr cross join lateral jsonb_array_elements(pr->'variants') variant_entry(value)) then raise exception 'Duplicate variant';end if;
 if (select count(*) from jsonb_array_elements(p->'sections'))<>(select count(distinct x->>'id') from jsonb_array_elements(p->'sections') x) or (select count(*) from jsonb_array_elements(p->'sections') x where x->>'kind'='featured')<>1 then raise exception 'Invalid sections';end if;
 for s in select * from jsonb_array_elements(p->'sections') loop
  if not private.shape(s,array['id','kind','title','subtitle','enabled','sortOrder'],array['productIds']) or not private.short_text(s->'id',80) or coalesce(s->>'id','')!~'^[a-z0-9]+(-[a-z0-9]+)*$' or coalesce(s->>'kind','') not in ('featured','categories','how_it_works','support') or not private.short_text(s->'title',160) or not private.short_text(s->'subtitle',320) or jsonb_typeof(s->'enabled') is distinct from 'boolean' or jsonb_typeof(s->'sortOrder') is distinct from 'number' or (s->>'sortOrder')::numeric not between 0 and 100 or floor((s->>'sortOrder')::numeric)<>(s->>'sortOrder')::numeric then raise exception 'Invalid section';end if;
  if s ? 'productIds' then if jsonb_typeof(s->'productIds') is distinct from 'array' or jsonb_array_length(s->'productIds')>19 then raise exception 'Invalid section IDs';end if;
   for v in select * from jsonb_array_elements(s->'productIds') loop if jsonb_typeof(v) is distinct from 'string' or not exists(select 1 from jsonb_array_elements(p->'products') x where x->>'id'=v#>>'{}') then raise exception 'Missing featured product';end if;end loop;
  end if;
 end loop;
 for v in select * from jsonb_array_elements(p->'steps') loop if not private.shape(v,array['title','description']) or not private.short_text(v->'title',120) or not private.short_text(v->'description',320) then raise exception 'Invalid steps';end if;end loop;
 if not private.shape(p->'support',array['title','description','fanpageUrl']) or not private.short_text(p#>'{support,title}',160) or not private.short_text(p#>'{support,description}',320) then raise exception 'Invalid support';end if;
 if p#>'{support,fanpageUrl}'<>'null'::jsonb and (not private.short_text(p#>'{support,fanpageUrl}',500) or coalesce(p#>>'{support,fanpageUrl}','')!~'^https://[^/@[:space:]]+([/?#][^[:space:]]*)?$') then raise exception 'Invalid Fanpage';end if;
 for v in select * from jsonb_array_elements(p->'faqs') loop if not private.shape(v,array['question','answer']) or not private.short_text(v->'question',320) or not private.short_text(v->'answer',2000) then raise exception 'Invalid FAQ';end if;end loop;
 if not private.shape(p->'coupon',array['code','percent','maxDiscountVnd']) or coalesce(p#>>'{coupon,code}','')!~'^[A-Z0-9_-]{1,30}$' or jsonb_typeof(p#>'{coupon,percent}') is distinct from 'number' or jsonb_typeof(p#>'{coupon,maxDiscountVnd}') is distinct from 'number' then raise exception 'Invalid coupon';end if;
 if (p#>>'{coupon,percent}')::numeric not between 0 and 100 or floor((p#>>'{coupon,percent}')::numeric)<>(p#>>'{coupon,percent}')::numeric or (p#>>'{coupon,maxDiscountVnd}')::numeric not between 0 and 1000000000 or floor((p#>>'{coupon,maxDiscountVnd}')::numeric)<>(p#>>'{coupon,maxDiscountVnd}')::numeric then raise exception 'Invalid coupon amount';end if;
 if (select count(*) from jsonb_array_elements(p->'policies'))<>(select count(distinct x->>'slug') from jsonb_array_elements(p->'policies') x) then raise exception 'Duplicate policy';end if;
 for v in select * from jsonb_array_elements(p->'policies') loop if not private.shape(v,array['slug','title','body']) or coalesce(v->>'slug','')!~'^[a-z0-9]+(-[a-z0-9]+)*$' or not private.short_text(v->'title',120) or not private.short_text(v->'body',10000) then raise exception 'Invalid policy';end if;end loop;
end $$;

create function public.save_cms_draft(p_payload jsonb,p_expected_version integer) returns uuid language plpgsql security definer set search_path='' as $$
declare doc public.cms_documents; revision uuid;
begin
 if not public.hubby_owner() then raise exception 'Owner AAL2 required' using errcode='42501';end if;
 perform private.cms_valid(p_payload);
 select * into doc from public.cms_documents where slug='storefront' for update;
 if doc.head_version<>p_expected_version then raise exception 'CMS version conflict' using errcode='40001';end if;
 insert into public.cms_revisions(document_id,version,schema_version,payload,author_id) values(doc.id,doc.head_version+1,2,jsonb_set(p_payload,'{revision}',to_jsonb('db-'||(doc.head_version+1)::text)),auth.uid()) returning id into revision;
 update public.cms_documents set head_version=head_version+1 where id=doc.id;
 insert into private.cms_audit(actor_id,action,revision_id) values(auth.uid(),'draft_saved',revision);
 return revision;
end $$;
create function public.restore_cms_draft(p_revision_id uuid,p_expected_version integer) returns uuid language plpgsql security definer set search_path='' as $$
declare payload jsonb;
begin
 if not public.hubby_owner() then raise exception 'Owner AAL2 required' using errcode='42501';end if;
 select r.payload into payload from public.cms_revisions r join public.cms_documents d on d.id=r.document_id where r.id=p_revision_id and d.slug='storefront';
 if payload is null then raise exception 'Missing revision';end if;
 return public.save_cms_draft(payload,p_expected_version);
end $$;
create function private.materialize_storefront(p jsonb) returns void language plpgsql security definer set search_path='' as $$
declare item jsonb; v jsonb; category jsonb; selected_product uuid; selected_category uuid;
begin
 perform private.cms_valid(p);
 update public.categories set enabled=false;
 for category in select * from jsonb_array_elements(p->'categories') loop
  insert into public.categories(slug,name,description,enabled) values(category->>'id',category->>'name',category->>'description',true) on conflict(slug) do update set name=excluded.name,description=excluded.description,enabled=true;
 end loop;
 update public.products set status='archived';
 update public.product_variants set enabled=false;
 for item in select * from jsonb_array_elements(p->'products') loop
  insert into public.products(catalog_key,slug,name,summary,status) values(item->>'id',item->>'slug',item->>'name',item->>'tagline','published') on conflict(catalog_key) do update set slug=excluded.slug,name=excluded.name,summary=excluded.summary,status='published',updated_at=now() returning id into selected_product;
  select id into selected_category from public.categories where slug=item->>'category';
  delete from public.product_categories pc where pc.product_id=selected_product;
  insert into public.product_categories(product_id,category_id) values(selected_product,selected_category);
  for v in select * from jsonb_array_elements(item->'variants') loop
   if exists(select 1 from public.product_variants pv where variant_key=v->>'id' and pv.product_id<>selected_product) then raise exception 'Variant cannot change product';end if;
   insert into public.product_variants(product_id,variant_key,sku,label,price_vnd,demo_stock,enabled) values(selected_product,v->>'id',v->>'id',v->>'label',(v->>'priceVnd')::bigint,(v->>'stock')::integer,true) on conflict(variant_key) do update set label=excluded.label,price_vnd=excluded.price_vnd,demo_stock=excluded.demo_stock,enabled=true;
  end loop;
 end loop;
 update public.media_assets set status='draft' where status='published';
 update public.media_assets set status='published' where id in(select substring(pr#>>'{media,src}' from 8)::uuid from jsonb_array_elements(p->'products') pr where pr ? 'media');
end $$;
create function public.publish_cms_revision(p_revision_id uuid,p_expected_version integer) returns uuid language plpgsql security definer set search_path='' as $$
declare doc public.cms_documents; rev public.cms_revisions;
begin
 if not public.hubby_owner() then raise exception 'Owner AAL2 required' using errcode='42501';end if;
 select * into doc from public.cms_documents where slug='storefront' for update;
 if doc.head_version<>p_expected_version then raise exception 'CMS version conflict' using errcode='40001';end if;
 select * into rev from public.cms_revisions where id=p_revision_id and document_id=doc.id and version=doc.head_version;
 if rev.id is null then raise exception 'Only latest draft can publish';end if;
 if doc.published_revision_id=rev.id then return rev.id;end if;
 perform private.cms_valid(rev.payload);
 perform private.materialize_storefront(rev.payload);
 update public.cms_documents set published_revision_id=rev.id where id=doc.id;
 insert into public.cms_publications(document_id,revision_id,actor_id) values(doc.id,rev.id,auth.uid());
 insert into private.cms_audit(actor_id,action,revision_id) values(auth.uid(),'published',rev.id);
 return rev.id;
end $$;
create function public.published_storefront() returns jsonb language sql stable security definer set search_path='' as $$select r.payload from public.cms_documents d join public.cms_revisions r on r.id=d.published_revision_id and r.document_id=d.id where d.slug='storefront'$$;

-- Supabase Storage: a private bucket. Draft files never get a public bucket URL.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('hubby-media','hubby-media',false,2097152,array['image/png','image/jpeg','image/webp','image/avif']);
create policy hubby_media_read on storage.objects for select to anon,authenticated using(bucket_id='hubby-media' and (public.hubby_owner() or exists(select 1 from public.media_assets m where m.object_path=name and m.status='published')));
create policy hubby_media_upload on storage.objects for insert to authenticated with check(bucket_id='hubby-media' and public.hubby_owner() and split_part(name,'/',1)=auth.uid()::text);
-- No object UPDATE/DELETE permission from the app: uploads use random unique names.

revoke all on public.profiles,public.categories,public.products,public.product_categories,public.product_variants,public.media_assets,public.cms_documents,public.cms_revisions,public.cms_publications,public.wishlists,public.recent_views from anon,authenticated;
grant select on public.categories,public.products,public.product_categories,public.product_variants,public.media_assets to anon,authenticated;
grant select on public.profiles,public.cms_documents,public.cms_revisions,public.cms_publications to authenticated;
grant update(display_name) on public.profiles to authenticated;
grant insert on public.media_assets to authenticated;
grant update(alt,source_license) on public.media_assets to authenticated;
grant select,insert,delete on public.wishlists to authenticated;
grant select,insert,update,delete on public.recent_views to authenticated;
revoke all on all functions in schema private from public,anon,authenticated;
revoke all on function public.owner_status(),public.hubby_owner(),public.published_storefront(),public.save_cms_draft(jsonb,integer),public.restore_cms_draft(uuid,integer),public.publish_cms_revision(uuid,integer) from public;
grant execute on function public.owner_status(),public.hubby_owner(),public.published_storefront() to anon,authenticated;
grant execute on function public.save_cms_draft(jsonb,integer),public.restore_cms_draft(uuid,integer),public.publish_cms_revision(uuid,integer) to authenticated;
commit;
