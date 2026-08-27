// test/integration/server.test.js
// Boots the gateway with a mock upstream injected via deps.forward, and a
// fake config so the gateway talks to localhost only.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { startServer } from '../../src/server.js';
import { startMockUpstream } from '../mock-upstream.js';

let mock;
let handle;
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
  gatewayVersion: '0.1.0',
};

function withMockUpstreamUrl(mock) {
  return { ...cfgBase, gmiBaseUrl: mock.url };
}

async function postJson(url, body, headers = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, text, json, headers: Object.fromEntries(res.headers) };
}

function getJson(url, headers = {}) {
  return fetch(url, { headers }).then(async (res) => {
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return { status: res.status, text, json, headers: Object.fromEntries(res.headers) };
  });
}

before(async () => {
  mock = await startMockUpstream();
  handle = await startServer(withMockUpstreamUrl(mock));
});

after(async () => {
  await handle.close();
  await mock.close();
});

test('GET /health returns expected shape and never the API key', async () => {
  const r = await getJson(`${handle.url}/health`);
  assert.equal(r.status, 200);
  assert.equal(r.json.status, 'ok');
  assert.equal(r.json.gateway, 'Toolbox Gateway');
  assert.equal(r.json.version, '0.1.0');
  assert.equal(r.json.configured_model_alias, 'claude-opus-5');
  assert.equal(r.json.actual_model_id, 'MiniMaxAI/MiniMax-M3');
  assert.equal(typeof r.json.upstream_provider, 'string');
  // Make sure no secret material is exposed
  const all = JSON.stringify(r.json);
  assert.doesNotMatch(all, /sk-test-key/);
  assert.doesNotMatch(all, /api[_-]?key/i);
});

test('GET /v1/models returns Claude-style alias', async () => {
  const r = await getJson(`${handle.url}/v1/models`);
  assert.equal(r.status, 200);
  assert.equal(r.json.object, 'list');
  assert.ok(Array.isArray(r.json.data));
  const ids = r.json.data.map((m) => m.id);
  assert.ok(ids.includes('claude-opus-5'));
});

test('POST /v1/messages rewrites alias and forwards', async () => {
  mock.receivedBodies.length = 0;
  const r = await postJson(`${handle.url}/v1/messages`, {
    model: 'claude-opus-5',
    max_tokens: 32,
    messages: [{ role: 'user', content: 'ping' }],
  });
  assert.equal(r.status, 200);
  assert.equal(r.json.content[0].text, 'pong');
  // Verify the upstream received the rewritten model and the bearer header
  assert.equal(mock.receivedBodies.length, 1);
  assert.equal(mock.receivedBodies[0].body.model, 'MiniMaxAI/MiniMax-M3');
  assert.equal(mock.receivedBodies[0].headers.authorization, 'Bearer sk-test-key');
  assert.equal(mock.receivedBodies[0].headers['content-type'], 'application/json');
});

test('POST /v1/messages passes through tool definitions and tool_use', async () => {
  // Switch upstream to tool-use mode
  await mock.close();
  mock = await startMockUpstream({ mode: 'tool-use' });
  await handle.close();
  handle = await startServer(withMockUpstreamUrl(mock));

  const r = await postJson(`${handle.url}/v1/messages`, {
    model: 'claude-opus-5',
    max_tokens: 64,
    tools: [
      {
        name: 'get_weather',
        description: 'Get current weather',
        input_schema: {
          type: 'object',
          properties: { location: { type: 'string' } },
          required: ['location'],
        },
      },
    ],
    tool_choice: { type: 'auto' },
    messages: [{ role: 'user', content: 'weather in SF?' }],
  });
  assert.equal(r.status, 200);
  assert.equal(r.json.stop_reason, 'tool_use');
  const block = r.json.content[0];
  assert.equal(block.type, 'tool_use');
  assert.equal(block.name, 'get_weather');
  assert.deepEqual(block.input, { location: 'SF' });
});

test('POST /v1/messages streaming: passes SSE through', async () => {
  await mock.close();
  mock = await startMockUpstream({ mode: 'sse' });
  await handle.close();
  handle = await startServer(withMockUpstreamUrl(mock));

  const r = await fetch(`${handle.url}/v1/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-opus-5',
      max_tokens: 32,
      stream: true,
      messages: [{ role: 'user', content: 'say hi' }],
    }),
  });
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type') || '', /text\/event-stream/);
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let sawHello = false;
  let sawWorld = false;
  let sawMessageStart = false;
  let sawMessageStop = false;
  // Read with a soft timeout so a hang doesn't block the test forever.
  const readWithTimeout = (ms) => new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error('stream read timeout')), ms);
    reader.read().then((v) => { clearTimeout(to); resolve(v); }, (e) => { clearTimeout(to); reject(e); });
  });
  while (true) {
    const { value, done } = await readWithTimeout(5000);
    if (done) break;
    buf += dec.decode(value, { stream: true });
    if (/event: message_start/.test(buf)) sawMessageStart = true;
    if (/event: message_stop/.test(buf)) sawMessageStop = true;
    if (/"text":"Hello"/.test(buf)) sawHello = true;
    if (/"text":" world"/.test(buf)) sawWorld = true;
    if (sawMessageStart && sawHello && sawWorld && sawMessageStop) break;
  }
  assert.equal(sawMessageStart, true, 'expected message_start event in stream');
  assert.equal(sawHello, true, 'expected first text_delta "Hello" in stream');
  assert.equal(sawWorld, true, 'expected second text_delta " world" in stream');
  assert.equal(sawMessageStop, true, 'expected message_stop event in stream');
});

test('POST /v1/messages rejects unknown model', async () => {
  const r = await postJson(`${handle.url}/v1/messages`, {
    model: 'gpt-4o',
    max_tokens: 8,
    messages: [{ role: 'user', content: 'hi' }],
  });
  assert.equal(r.status, 400);
  assert.match(r.json.error.message, /unsupported model/);
});

test('POST /v1/messages rejects malformed JSON with 400', async () => {
  const res = await fetch(`${handle.url}/v1/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{not json',
  });
  const text = await res.text();
  assert.equal(res.status, 400);
  const body = JSON.parse(text);
  assert.match(body.error.message, /malformed JSON/);
});

test('POST /v1/messages surfaces 401 from upstream', async () => {
  await mock.close();
  mock = await startMockUpstream({ mode: 'error', status: 401 });
  await handle.close();
  handle = await startServer(withMockUpstreamUrl(mock));

  const r = await postJson(`${handle.url}/v1/messages`, {
    model: 'claude-opus-5',
    max_tokens: 8,
    messages: [{ role: 'user', content: 'hi' }],
  });
  // We pass through upstream status (transparent proxy). 401 from upstream
  // means the API key is invalid. We never log the key, just the status.
  assert.equal(r.status, 401);
});

test('POST /v1/messages surfaces 429 from upstream', async () => {
  await mock.close();
  mock = await startMockUpstream({ mode: 'error', status: 429 });
  await handle.close();
  handle = await startServer(withMockUpstreamUrl(mock));

  const r = await postJson(`${handle.url}/v1/messages`, {
    model: 'claude-opus-5',
    max_tokens: 8,
    messages: [{ role: 'user', content: 'hi' }],
  });
  assert.equal(r.status, 429);
});

test('POST /v1/messages surfaces 404 from upstream', async () => {
  await mock.close();
  mock = await startMockUpstream({ mode: 'error', status: 404 });
  await handle.close();
  handle = await startServer(withMockUpstreamUrl(mock));

  const r = await postJson(`${handle.url}/v1/messages`, {
    model: 'claude-opus-5',
    max_tokens: 8,
    messages: [{ role: 'user', content: 'hi' }],
  });
  assert.equal(r.status, 404);
});

test('Missing GMI_API_KEY returns 500 configuration_error', async () => {
  await mock.close();
  await handle.close();
  const cfg = { ...withMockUpstreamUrl({ url: 'http://127.0.0.1:1' }), gmiApiKey: null };
  handle = await startServer(cfg);
  const r = await postJson(`${handle.url}/v1/messages`, {
    model: 'claude-opus-5',
    max_tokens: 8,
    messages: [{ role: 'user', content: 'hi' }],
  });
  assert.equal(r.status, 500);
  assert.equal(r.json.error.type, 'configuration_error');
  assert.match(r.json.error.message, /not configured/);
  // Restore for subsequent tests
  mock = await startMockUpstream();
  await handle.close();
  handle = await startServer(withMockUpstreamUrl(mock));
});

test('Bearer token is required when LOCAL_GATEWAY_TOKEN is set', async () => {
  await handle.close();
  const cfg = { ...withMockUpstreamUrl(mock), localGatewayToken: 's3cret' };
  handle = await startServer(cfg);

  // No header → 401
  let r = await postJson(`${handle.url}/v1/messages`, {
    model: 'claude-opus-5', max_tokens: 4, messages: [{ role: 'user', content: 'hi' }],
  });
  assert.equal(r.status, 401);

  // Wrong token → 401
  r = await postJson(`${handle.url}/v1/messages`, {
    model: 'claude-opus-5', max_tokens: 4, messages: [{ role: 'user', content: 'hi' }],
  }, { authorization: 'Bearer wrong' });
  assert.equal(r.status, 401);

  // Correct token → 200
  r = await postJson(`${handle.url}/v1/messages`, {
    model: 'claude-opus-5', max_tokens: 4, messages: [{ role: 'user', content: 'hi' }],
  }, { authorization: 'Bearer s3cret' });
  assert.equal(r.status, 200);
});

test('non-loopback startup refuses missing, default, and weak tokens', async () => {
  for (const localGatewayToken of [null, 'toolboxlap', 'too-short']) {
    await assert.rejects(
      startServer({ ...withMockUpstreamUrl(mock), host: '0.0.0.0', localGatewayToken }),
      /Refusing non-loopback bind/,
    );
  }
});

test('non-loopback startup with a strong token authenticates every route', async () => {
  const token = 'tb_0123456789abcdef0123456789abcdef';
  const networkHandle = await startServer({
    ...withMockUpstreamUrl(mock),
    host: '0.0.0.0',
    localGatewayToken: token,
  });
  const localUrl = networkHandle.url.replace('0.0.0.0', '127.0.0.1');
  try {
    let r = await getJson(`${localUrl}/health`);
    assert.equal(r.status, 401);

    r = await getJson(`${localUrl}/v1/models`, { authorization: `Bearer ${token}` });
    assert.equal(r.status, 200);
  } finally {
    await networkHandle.close();
  }
});

test('404 for unknown routes', async () => {
  const r = await getJson(`${handle.url}/nope`);
  assert.equal(r.status, 404);
  assert.equal(r.json.error.type, 'not_found_error');
});
