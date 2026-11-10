import { cpSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const runtime = path.join(root, '.runtime', 'site');
if (!existsSync(path.join(runtime, '.hubby-setup-complete'))) throw new Error('Complete WordPress installation first.');
for (const [source, target] of [['plugins/hubby-suppliers', 'wp-content/plugins/hubby-suppliers'], ['themes/hubby', 'wp-content/themes/hubby']]) {
  if (existsSync(path.join(root, source))) cpSync(path.join(root, source), path.join(runtime, target), { recursive: true });
}
const migration = path.join(runtime, '.hubby-migration');
mkdirSync(migration, { recursive: true });
const source = path.join(root, '.private', 'published.json');
if (existsSync(source) && !existsSync(path.join(migration, 'published.json'))) cpSync(source, path.join(migration, 'published.json'));
const presentation = path.join(root, '.private', 'presentation.json');
if (existsSync(presentation) && !existsSync(path.join(migration, 'presentation.json'))) cpSync(presentation, path.join(migration, 'presentation.json'));
const presentationV2 = path.join(root, '.private', 'presentation-v2.json');
if (existsSync(presentationV2) && !existsSync(path.join(migration, 'presentation-v2.json'))) cpSync(presentationV2, path.join(migration, 'presentation-v2.json'));
console.log('Local plugin/theme files synchronized. Existing imported products are not overwritten.');
