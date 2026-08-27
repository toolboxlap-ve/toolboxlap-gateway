// scripts/postbuild.js
// Post-build hook: copy build/launch.cmd to dist/win-unpacked/Launch.cmd
// so that users on machines with a poisoned ELECTRON_RUN_AS_NODE env var
// have a working launcher. The portable executable also has a CJS preflight
// shim (src/main.cjs), so it does not depend on a separate custom NSIS file.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outputName = process.argv[2] || 'dist';
const dist = path.resolve(root, outputName);
const unpacked = path.join(dist, 'win-unpacked');
const src = path.join(root, 'build', 'launch.cmd');
const dest = path.join(unpacked, 'Launch.cmd');

if (!fs.existsSync(unpacked)) {
  console.warn(`[postbuild] no win-unpacked dir at ${unpacked}; skipping Launch.cmd copy`);
  process.exit(0);
}

if (!fs.existsSync(src)) {
  console.error(`[postbuild] source not found: ${src}`);
  process.exit(1);
}

fs.copyFileSync(src, dest);
console.log(`[postbuild] copied ${src} -> ${dest}`);
