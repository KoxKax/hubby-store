import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const source = JSON.parse(readFileSync(new URL('../.private/presentation-v2.json', import.meta.url), 'utf8'));
const raw = JSON.parse(readFileSync(new URL('../.private/published.json', import.meta.url), 'utf8'));
if (source.revision !== raw.revision || source.schemaVersion !== 2 || !Array.isArray(source.products)) throw new Error('Snapshot mismatch.');
const columns = ['Type','SKU','Name','Published','Visibility in catalog','Short description','Description','Regular price','In stock?','Stock','Backorders allowed?','Categories','Images','Parent','Position','Attribute 1 name','Attribute 1 value(s)','Attribute 1 visible','Attribute 1 global','Meta: _hubby_catalog_key','Meta: _hubby_source_variant','Meta: _hubby_source_slug','Meta: _hubby_price_configured','Meta: _hubby_source_product','Meta: _hubby_source_revision'];
const categories = new Map(source.categories.map(c => [c.id,c.name]));
const rows = [];
const identity = new Set();
for (const [position, product] of source.products.entries()) {
  const parentSku = 'hubby-' + product.id;
  if (identity.has(parentSku)) throw new Error('Duplicate product SKU.');
  identity.add(parentSku);
  const image = product.media?.src ? new URL(product.media.src, 'https://hubby.dpdns.org').href : '';
  rows.push({'Type':'variable','SKU':parentSku,'Name':product.name,'Published':'1','Visibility in catalog':'visible','Short description':product.tagline,'Description':product.description,'In stock?':'0','Backorders allowed?':'0','Categories':categories.get(product.category),'Images':image,'Position':position,'Attribute 1 name':'Gói','Attribute 1 value(s)':product.variants.map(v=>v.label).join(', '),'Attribute 1 visible':'1','Attribute 1 global':'0','Meta: _hubby_catalog_key':product.id,'Meta: _hubby_source_slug':product.slug,'Meta: _hubby_source_product':JSON.stringify(product),'Meta: _hubby_source_revision':source.revision});
  for (const variant of product.variants) {
    if (identity.has(variant.id)) throw new Error('Duplicate variant SKU.');
    identity.add(variant.id);
    const priced = variant.priceConfigured !== false;
    if (priced && (!Number.isSafeInteger(variant.priceVnd) || variant.priceVnd < 0)) throw new Error('Invalid VND price.');
    rows.push({'Type':'variation, virtual','SKU':variant.id,'Name':product.name + ' — ' + variant.label,'Published':'1','Visibility in catalog':'visible','Regular price':priced ? String(variant.priceVnd) : '', 'In stock?':'0','Backorders allowed?':'0','Parent':parentSku,'Attribute 1 name':'Gói','Attribute 1 value(s)':variant.label,'Attribute 1 visible':'1','Attribute 1 global':'0','Meta: _hubby_source_variant':variant.id,'Meta: _hubby_price_configured':priced ? 'yes' : 'no','Meta: _hubby_source_revision':source.revision});
  }
}
const quote = value => '"' + String(value ?? '').replaceAll('"','""') + '"';
const csv = '\ufeff' + [columns, ...rows.map(row => columns.map(column => row[column] ?? ''))].map(row=>row.map(quote).join(',')).join('\r\n') + '\r\n';
const directory = fileURLToPath(new URL('../.private/migration/', import.meta.url));
mkdirSync(directory,{recursive:true});
const filename = `hubby-catalog-${source.revision}.csv`;
writeFileSync(directory+filename,csv,{flag:'wx'});
const manifest = {sourceRevision:source.revision,products:source.products.length,variants:rows.length-source.products.length,rows:rows.length,csv:filename,sha256:createHash('sha256').update(csv).digest('hex'),stockPolicy:'All out of stock until actual supplier readiness; synthetic stock not imported.',draftPolicy:'Published source only. Unpublished source draft remains in Supabase.',identityPolicy:'No customer identities, passwords, keys or orders exported.',requiresPlugin:'Hubby Suppliers 0.2.0 for source metadata normalization',importPolicy:'Import into the new prepared installation. Leave Update existing products unchecked. Do not rerun over later Owner edits.'};
writeFileSync(directory+'manifest.json',JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({file:filename,products:manifest.products,variants:manifest.variants,rows:manifest.rows,sha256:manifest.sha256}));
