// scripts/smoke-gmi.js
// Optional real-upstream smoke test. Gated on a non-empty GMI_API_KEY.
// Sends a tiny prompt, verifies a valid Anthropic-style response, and
// reports the routed model.
//
// Usage:
//   GMI_API_KEY=... node scripts/smoke-gmi.js
//   npm run smoke:gmi   (reads .env)

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

// Best-effort .env loader (no dotenv dependency here so this file is robust).
if (existsSync(path.join(ROOT, '.env'))) {
  for (const line of readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m) continue;
    if (m[1].startsWith('#')) continue;
    if (process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

const BASE = process.env.GMI_BASE_URL || 'https://api.gmi-serving.com';
const KEY = process.env.GMI_API_KEY || '';
const ALIAS = process.env.CLAUDE_MODEL_ALIAS || 'claude-opus-5';
const UPSTREAM = process.env.UPSTREAM_MODEL || 'MiniMaxAI/MiniMax-M3';
const PORT = Number.parseInt(process.env.PORT || '8787', 10);
const HOST = process.env.HOST || '127.0.0.1';
const GW = `http://${HOST}:${PORT}`;

if (!KEY) {
  console.error('[smoke:gmi] GMI_API_KEY is not set. Aborting to avoid wasting real tokens.');
  console.error('[smoke:gmi] Set it in .env or via env var, then re-run.');
  process.exit(2);
}

async function main() {
  console.log(`[smoke:gmi] gateway:  ${GW}`);
  console.log(`[smoke:gmi] alias:    ${ALIAS}`);
  console.log(`[smoke:gmi] upstream: ${BASE}  model=${UPSTREAM}`);

  // 1) Hit /health
  const healthRes = await fetch(`${GW}/health`);
  const health = await healthRes.json();
  console.log('[smoke:gmi] /health ->', healthRes.status, JSON.stringify(health));
  if (healthRes.status !== 200) {
    throw new Error('gateway /health did not return 200 — is it running? Try start-gateway.cmd');
  }
  if (health.actual_model_id !== UPSTREAM) {
    throw new Error(`gateway reports actual_model_id=${health.actual_model_id} but UPSTREAM_MODEL=${UPSTREAM}`);
  }

  // 2) Send a minimal prompt
  const body = {
    model: ALIAS,
    max_tokens: 16,
    messages: [{ role: 'user', content: 'Reply with the single word: ok' }],
  };
  const r = await fetch(`${GW}/v1/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch {}
  console.log(`[smoke:gmi] /v1/messages -> ${r.status} (${text.length} bytes)`);
  if (r.status !== 200) {
    console.error('[smoke:gmi] upstream error body:', text);
    throw new Error(`upstream returned status ${r.status}`);
  }
  if (!parsed || parsed.type !== 'message' || !Array.isArray(parsed.content)) {
    throw new Error('response is not a valid Anthropic Messages API message');
  }
  const text0 = parsed.content.find((b) => b.type === 'text');
  console.log('[smoke:gmi] response text:', text0 ? JSON.stringify(text0.text) : '(no text block)');
  console.log('[smoke:gmi] stop_reason:', parsed.stop_reason);
  console.log('[smoke:gmi] usage:', JSON.stringify(parsed.usage || {}));
  console.log('[smoke:gmi] OK');
}

main().catch((e) => {
  console.error('[smoke:gmi] FAILED:', e?.message || e);
  process.exit(1);
});
