import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const config = parseEnv(readFileSync(new URL('../../.dev.vars.staging', import.meta.url), 'utf8'));
if (config.SUPABASE_URL !== 'https://toienefhdorkcexyfnst.supabase.co' || !config.SUPABASE_PUBLISHABLE_KEY?.startsWith('sb_publishable_'))
  throw new Error('Expected the existing Hubby project and publishable key.');
const response = await fetch(config.SUPABASE_URL + '/rest/v1/rpc/published_storefront', {
  method: 'POST', headers: { apikey: config.SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
  body: '{}', signal: AbortSignal.timeout(15000),
});
if (!response.ok) throw new Error('Unable to read the existing public catalog.');
const data = await response.json();
if (data.schemaVersion !== 2 || !Array.isArray(data.products)) throw new Error('Unsupported content schema.');
const directory = fileURLToPath(new URL('../.private/', import.meta.url));
mkdirSync(directory, { recursive: true });
const json = JSON.stringify(data, null, 2) + '\n';
writeFileSync(directory + 'published.json', json, { flag: 'wx' });
console.log(JSON.stringify({ revision: data.revision, products: data.products.length, variants: data.products.reduce((n,p)=>n+p.variants.length,0), sha256: createHash('sha256').update(json).digest('hex') }));
