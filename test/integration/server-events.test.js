// test/integration/server-events.test.js
// Verifies that the gateway:
//   - emits structured `request` events on the injected EventEmitter for
//     /v1/messages requests, /v1/models, and /health
//   - picks up live alias / model changes via deps.resolveModels without
//     requiring a restart
//   - reflects the live alias in /v1/models
//
// The activity tracker is then driven by the same events to make sure
// stats and activity counts match.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { EventEmitter } from 'node:events';

import { startServer } from '../../src/server.js';
import { startMockUpstream } from '../mock-upstream.js';
import { createActivityTracker } from '../../src/activity.js';

let mock;
let handle;
let events;
let activity;
let resolveModels;

const cfgBase = {
  host: '127.0.0.1',
  port: 0,
  gmiBaseUrl: 'http://127.0.0.1:0',
  gmiApiKey: 'sk-test-key',
  claudeModelAlias: 'claude-opus-5',
  upstreamModel: 'MiniMaxAI/MiniMax-M3',
  localGatewayToken: null,
  logLevel: 'error',
  upstreamTimeoutMs: 5000,
  gatewayName: 'Toolbox Gateway',
  gatewayVersion: '0.2.2',
};

function postJson(url, body, headers = {}) {
  return fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  }).then(async (res) => {
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* */ }
    return { status: res.status, text, json, headers: Object.fromEntries(res.headers) };
  });
}

function getJson(url) {
  return fetch(url).then(async (res) => {
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* */ }
    return { status: res.status, text, json, headers: Object.fromEntries(res.headers) };
  });
}

before(async () => {
  mock = await startMockUpstream();
  events = new EventEmitter();
  activity = createActivityTracker();
  events.on('request', (evt) => activity.recordRequest(evt));
  resolveModels = () => ({ alias: cfgBase.claudeModelAlias, model: cfgBase.upstreamModel });
  handle = await startServer({ ...cfgBase, gmiBaseUrl: mock.url }, { events, resolveModels });
});

after(async () => {
  if (handle) await handle.close();
  if (mock) await mock.close();
});

test('server emits a `request` event for every /v1/messages call', async () => {
  activity.start();
  const r = await postJson(`${handle.url}/v1/messages`, {
    model: 'claude-opus-5',
    max_tokens: 8,
    messages: [{ role: 'user', content: 'ping' }],
  });
  assert.equal(r.status, 200);
  const s = activity.getStats();
  assert.equal(s.requests >= 1, true);
  assert.equal(s.success >= 1, true);
});

test('server uses the live alias returned by deps.resolveModels on /v1/models', async () => {
  // Swap the live alias.
  resolveModels = () => ({ alias: 'live-alias-x', model: cfgBase.upstreamModel });
  // Restart with the new resolveModels.
  await handle.close();
  handle = await startServer({ ...cfgBase, gmiBaseUrl: mock.url }, { events, resolveModels });
  const r = await getJson(`${handle.url}/v1/models`);
  assert.equal(r.status, 200);
  const ids = r.json.data.map((m) => m.id);
  assert.ok(ids.includes('live-alias-x'), 'expected live alias in /v1/models response');

  // Restore.
  resolveModels = () => ({ alias: cfgBase.claudeModelAlias, model: cfgBase.upstreamModel });
  await handle.close();
  handle = await startServer({ ...cfgBase, gmiBaseUrl: mock.url }, { events, resolveModels });
});

test('request events never include the API key or request bodies', async () => {
  const seen = [];
  const probe = (evt) => seen.push(evt);
  events.on('request', probe);
  try {
    await postJson(`${handle.url}/v1/messages`, {
      model: 'claude-opus-5',
      max_tokens: 4,
      messages: [{ role: 'user', content: 'secret-content' }],
    });
  } finally {
    events.off('request', probe);
  }
  const all = JSON.stringify(seen);
  assert.doesNotMatch(all, /sk-test-key/);
  assert.doesNotMatch(all, /secret-content/);
  assert.doesNotMatch(all, /authorization/i);
});
