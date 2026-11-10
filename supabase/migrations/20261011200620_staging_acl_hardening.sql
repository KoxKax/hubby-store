-- Forward-only staging hardening. Keep the initial migration reproducible.
-- Supabase default privileges may explicitly grant function EXECUTE to anon.
begin;
alter function public.owner_status() set schema private;
alter function public.hubby_owner() set schema private;
alter function public.published_storefront() set schema private;
alter function public.save_cms_draft(jsonb,integer) set schema private;
alter function public.restore_cms_draft(uuid,integer) set schema private;
alter function public.publish_cms_revision(uuid,integer) set schema private;

-- Only guarded implementations have elevated privileges. Public RPC wrappers
-- use the caller's permissions and expose no private tables or arbitrary SQL.
create function public.owner_status() returns jsonb
language sql stable security invoker set search_path='' as $$select private.owner_status()$$;
create function public.hubby_owner() returns boolean
language sql stable security invoker set search_path='' as $$select private.hubby_owner()$$;
create function public.published_storefront() returns jsonb
language sql stable security invoker set search_path='' as $$select private.published_storefront()$$;
create function public.save_cms_draft(p_payload jsonb,p_expected_version integer) returns uuid
language sql security invoker set search_path='' as $$select private.save_cms_draft(p_payload,p_expected_version)$$;
create function public.restore_cms_draft(p_revision_id uuid,p_expected_version integer) returns uuid
language sql security invoker set search_path='' as $$select private.restore_cms_draft(p_revision_id,p_expected_version)$$;
create function public.publish_cms_revision(p_revision_id uuid,p_expected_version integer) returns uuid
language sql security invoker set search_path='' as $$select private.publish_cms_revision(p_revision_id,p_expected_version)$$;

revoke all on all tables in schema private from public,anon,authenticated;
revoke all on all functions in schema private from public,anon,authenticated,service_role;
grant usage on schema private to anon,authenticated;
grant execute on function private.owner_status(),private.hubby_owner(),private.published_storefront() to anon,authenticated;
grant execute on function private.save_cms_draft(jsonb,integer),private.restore_cms_draft(uuid,integer),private.publish_cms_revision(uuid,integer) to authenticated;
revoke all on function public.owner_status(),public.hubby_owner(),public.published_storefront(),public.save_cms_draft(jsonb,integer),public.restore_cms_draft(uuid,integer),public.publish_cms_revision(uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.owner_status(),public.hubby_owner(),public.published_storefront() to anon,authenticated;
grant execute on function public.save_cms_draft(jsonb,integer),public.restore_cms_draft(uuid,integer),public.publish_cms_revision(uuid,integer) to authenticated;

alter policy profile_self_read on public.profiles using(id=(select auth.uid()));
alter policy profile_self_edit on public.profiles using(id=(select auth.uid())) with check(id=(select auth.uid()));
alter policy media_owner_insert on public.media_assets with check(
 (select public.hubby_owner()) and uploaded_by=(select auth.uid()) and status='draft'
 and object_path=(select auth.uid())::text||'/'||id::text||case mime when 'image/jpeg' then '.jpg' when 'image/png' then '.png' when 'image/webp' then '.webp' else '.avif' end
);
alter policy own_wishlists on public.wishlists using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()) and exists(select 1 from public.products p where p.id=product_id and p.status='published'));
alter policy own_recent on public.recent_views using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()) and exists(select 1 from public.products p where p.id=product_id and p.status='published'));
alter policy hubby_media_upload on storage.objects with check(bucket_id='hubby-media' and (select public.hubby_owner()) and split_part(name,'/',1)=(select auth.uid())::text);

create index cms_documents_publication_fk on public.cms_documents(id,published_revision_id);
create index cms_publications_revision_fk on public.cms_publications(document_id,revision_id);
create index media_assets_uploader_fk on public.media_assets(uploaded_by);
create index product_categories_category_fk on public.product_categories(category_id);
create index wishlists_product_fk on public.wishlists(product_id);
create index recent_views_product_fk on public.recent_views(product_id);
commit;
