// scripts/run-tests.js
// Cross-platform test runner. Globs test files under the directories passed
// in (or the default unit/integration split) and hands them to `node --test`
// via process.execPath. The default npm test command runs both.

import { spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

/**
 * Recursively collect files under `root` whose name matches `pattern`
 * (basic `*` glob only — sufficient for `*.test.js`).
 */
async function collectTests(root, pattern) {
  const re = new RegExp('^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
  const out = [];
  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) await walk(full);
      else if (re.test(e.name)) out.push(full);
    }
  }
  try {
    await walk(root);
  } catch (e) {
    if (e && e.code === 'ENOENT') return out;
    throw e;
  }
  return out.sort();
}

function runNodeTests(files, { reporter = 'spec' } = {}) {
  return new Promise((resolve, reject) => {
    const args = ['--test', `--test-reporter=${reporter}`, ...files];
    const child = spawn(process.execPath, args, {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
      env: process.env,
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve(0);
      else reject(new Error(`node --test exited with code ${code}`));
    });
  });
}

function parseArgs(argv) {
  // usage: node scripts/run-tests.js [unit|integration|all] [--reporter NAME]
  const args = { target: 'all', reporter: 'spec' };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--reporter') args.reporter = argv[++i];
    else if (a === 'unit' || a === 'integration' || a === 'all') args.target = a;
  }
  return args;
}

async function main() {
  const { target, reporter } = parseArgs(process.argv);
  const buckets = [];
  if (target === 'unit' || target === 'all') {
    buckets.push({ root: path.join(PROJECT_ROOT, 'test', 'unit'), pattern: '*.test.js', label: 'unit' });
  }
  if (target === 'integration' || target === 'all') {
    buckets.push({ root: path.join(PROJECT_ROOT, 'test', 'integration'), pattern: '*.test.js', label: 'integration' });
  }
  for (const b of buckets) {
    const files = await collectTests(b.root, b.pattern);
    if (!files.length) {
      // eslint-disable-next-line no-console
      console.log(`(no ${b.label} test files found in ${b.root})`);
      continue;
    }
    // eslint-disable-next-line no-console
    console.log(`\n=== ${b.label} tests (${files.length}) ===`);
    try {
      await runNodeTests(files, { reporter });
    } catch (e) {
      throw e;
    }
  }
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e && e.message || e);
  process.exit(1);
});
