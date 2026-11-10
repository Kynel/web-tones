// Copies the NAM wasm engine (worklet + wasm binary) out of the npm package
// into public/engine so it is served as plain static files in dev and build.
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules/neural-amp-modeler-wasm/dist/engine');
const dest = join(root, 'public/engine');
mkdirSync(dest, { recursive: true });
for (const f of ['nam-worklet.js', 'nam-engine.wasm']) copyFileSync(join(src, f), join(dest, f));
console.log('NAM engine copied to public/engine');
