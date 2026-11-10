import type { StorefrontContent } from "../content/types";

// Operator tooling only; never imported by a route or exposed as an RPC.
// No Owner identity is fabricated. The first public content snapshot is marked
// as an operator staging import, not an authenticated customer/Owner publication.
export function initialStagingImportSql(content: StorefrontContent) {
  const images = [
    content.announcement.media,
    ...content.products.map((p) => p.media),
    ...(content.experience?.slides.map((s) => s.media) ?? []),
  ];
  if (images.some(Boolean))
    throw new Error(
      "Migrate and review media separately before initial import",
    );
  if (content.experience?.reviews.length)
    throw new Error(
      "Public reviews require a separate verified-content review before import",
    );
  const serialized = JSON.stringify({
    ...content,
    revision: "staging-import-1",
  });
  if (new TextEncoder().encode(serialized).length > 190_000)
    throw new Error("Import envelope too large");
  const literal = `'${serialized.replaceAll("'", "''")}'::jsonb`;
  let suffix = 0;
  while (serialized.includes(`$hubby_import_${suffix}$`)) suffix++;
  const delimiter = `$hubby_import_${suffix}$`;
  return `begin;
set local standard_conforming_strings=on;
set local hubby.environment='staging';
do ${delimiter}
declare doc public.cms_documents; rev uuid; payload jsonb=${literal};
begin
 if current_setting('hubby.environment',true)<>'staging' then raise exception 'Staging only';end if;
 select * into doc from public.cms_documents where slug='storefront' for update;
 if doc.id is null or doc.head_version<>0 or doc.published_revision_id is not null
 or exists(select 1 from public.cms_revisions) or exists(select 1 from public.products)
 or exists(select 1 from auth.users) then raise exception 'Initial import requires untouched staging';end if;
 perform private.cms_valid(payload);
 perform private.materialize_storefront(payload);
 insert into public.cms_revisions(document_id,version,schema_version,payload,author_id)
 values(doc.id,1,2,payload,null) returning id into rev;
 update public.cms_documents set head_version=1,published_revision_id=rev where id=doc.id;
 insert into private.cms_audit(actor_id,action,revision_id) values(null,'staging_content_import',rev);
 -- cms_publications.actor_id requires a real Auth actor. Do not invent one:
 -- this bootstrap is recorded in the immutable revision and private import audit.
end ${delimiter};
commit;`;
}
