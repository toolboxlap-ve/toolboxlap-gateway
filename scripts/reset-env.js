// scripts/reset-env.js
// Convenience: copy .env.example to .env, overwriting any existing .env.
// Use this to revert local config to a clean state. Safe to run anytime.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const src = path.join(ROOT, '.env.example');
const dst = path.join(ROOT, '.env');

if (!fs.existsSync(src)) {
  console.error('Missing .env.example; cannot reset.');
  process.exit(1);
}
fs.copyFileSync(src, dst);
console.log(`.env reset from .env.example -> ${dst}`);
