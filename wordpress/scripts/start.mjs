import { existsSync, mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const runtime = path.join(root, '.runtime', 'site');
mkdirSync(runtime, { recursive: true });
const installed = existsSync(path.join(runtime, '.hubby-setup-complete'));
const args = [
  '--require', path.join(root, 'scripts', 'loopback-only.cjs'),
  path.join(root, 'node_modules', '@wp-playground', 'cli', 'wp-playground.js'),
  'server', '--port=9400', '--site-url=http://127.0.0.1:9400',
  '--php=8.3', '--wp=7.1.4', '--workers=6', '--login',
  '--define', 'WP_ENVIRONMENT_TYPE', 'local',
  '--mount-dir-before-install', runtime, '/wordpress',
  '--mount-dir', path.join(root, 'local-mu-plugins'), '/wordpress/wp-content/mu-plugins',
];
if (installed) args.push('--wordpress-install-mode=do-not-attempt-installing');
else {
  if (existsSync(path.join(runtime, 'wp-load.php')))
    args.push('--wordpress-install-mode=install-from-existing-files-if-needed');
  args.push('--blueprint=' + path.join(root, 'blueprint.json'));
}
console.log('Hubby WordPress local: http://127.0.0.1:9400/wp-admin/');
console.log('Local development only. No cloud secrets, provider purchases or public hosting.');
const child = spawn(process.execPath, args, { cwd: root, stdio: 'inherit' });
child.on('error', () => { console.error('Unable to start local WordPress.'); process.exitCode = 1; });
child.on('exit', (code) => { process.exitCode = code ?? 1; });
process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
