// Syntax parsing only; does not boot WordPress, contact a provider or run tests.
import { PHP } from '@php-wasm/universal';
import { loadNodeRuntime } from '@php-wasm/node';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? files(file) : file.endsWith('.php') ? [file] : [];
  });
}
const sources = ['plugins', 'themes', 'local-mu-plugins'].flatMap((dir) => files(path.join(root, dir)));
const php = new PHP(await loadNodeRuntime('8.3', { emscriptenOptions: { processId: process.pid } }));
let failed = false;
try {
  for (const file of sources) {
    php.writeFile('/source.php', readFileSync(file));
    const result = await php.run({ code: "<?php try { token_get_all(file_get_contents('/source.php'), TOKEN_PARSE); echo 'OK'; } catch (ParseError $e) { http_response_code(400); echo 'Parse error at line ' . $e->getLine(); }" });
    const success = result.text === 'OK';
    failed ||= !success;
    console.log(path.relative(root, file) + ': ' + result.text);
  }
} finally { php.exit(); }
process.exitCode = failed ? 1 : 0;
