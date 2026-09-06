/**
 * Junie build script.
 *
 * Produces a dual CJS + ESM package:
 *   dist/index.js     — CommonJS (root "type": "commonjs")
 *   dist/index.d.ts   — canonical TypeScript declarations
 *   dist/esm/index.js — ESM (marked by dist/esm/package.json)
 */
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

console.log('[junie] Compiling CommonJS build...');
execSync('tsc -p tsconfig.build.cjs.json', { stdio: 'inherit' });

console.log('[junie] Compiling ESM build...');
execSync('tsc -p tsconfig.build.esm.json', { stdio: 'inherit' });

console.log('[junie] Marking ESM output...');
mkdirSync('dist/esm', { recursive: true });
writeFileSync('dist/esm/package.json', `${JSON.stringify({ type: 'module' }, null, 2)}\n`);

console.log('[junie] Build complete.');
