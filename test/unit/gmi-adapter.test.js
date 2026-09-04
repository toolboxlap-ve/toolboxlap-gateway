// test/unit/gmi-adapter.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { GmiProviderAdapter, gmiProviderAdapter } from '../../src/providers/gmi-provider.js';
import { globalProviderRegistry } from '../../src/providers/provider-registry.js';
import { createCanonicalRequest } from '../../src/canonical/index.js';

function startMock(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

test('GmiProviderAdapter exposes expected metadata and capabilities', () => {
  const adapter = new GmiProviderAdapter();
  assert.equal(adapter.id, 'gmi');
  assert.equal(adapter.displayName, 'GMI Cloud');
  assert.equal(adapter.defaultBaseUrl, 'https://api.gmi-serving.com');
  assert.equal(adapter.nativeProtocol, 'anthropic');
  assert.equal(adapter.capabilities.streaming, true);
  assert.equal(adapter.capabilities.tools, true);
});

test('GmiProviderAdapter is automatically registered in globalProviderRegistry', () => {
  assert.equal(globalProviderRegistry.has('gmi'), true);
  assert.equal(globalProviderRegistry.get('gmi'), gmiProviderAdapter);
});

test('GmiProviderAdapter.buildMessagesUrl strips trailing slashes', () => {
  const adapter = new GmiProviderAdapter();
  assert.equal(adapter.buildMessagesUrl('https://api.gmi-serving.com'), 'https://api.gmi-serving.com/v1/messages');
  assert.equal(adapter.buildMessagesUrl('https://api.gmi-serving.com///'), 'https://api.gmi-serving.com/v1/messages');
});

test('GmiProviderAdapter.forward throws MISSING_API_KEY when apiKey is missing', async () => {
  const adapter = new GmiProviderAdapter();
  await assert.rejects(
    async () => adapter.forward({ body: {} }, {}),
    (err) => err.code === 'MISSING_API_KEY' && /not configured/.test(err.message)
  );
});

test('GmiProviderAdapter.forward executes non-streaming upstream request', async () => {
  const mock = await startMock((req, res) => {
    assert.equal(req.headers.authorization, 'Bearer test-key');
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ id: 'msg_1', content: [{ type: 'text', text: 'pong' }] }));
  });

  try {
    const adapter = new GmiProviderAdapter();
    const result = await adapter.forward(
      { body: { model: 'MiniMaxAI/MiniMax-M3' } },
      { apiKey: 'test-key', baseUrl: mock.url, timeoutMs: 5000 }
    );
    assert.equal(result.status, 200);
    assert.equal(result.isStreaming, false);
    const buf = Buffer.from(await new Response(result.body).arrayBuffer());
    const json = JSON.parse(buf.toString());
    assert.equal(json.content[0].text, 'pong');
  } finally {
    await mock.close();
  }
});

test('GmiProviderAdapter.execute returns a CanonicalResponse', async () => {
  const mock = await startMock((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      id: 'msg_canon_1',
      model: 'MiniMaxAI/MiniMax-M3',
      content: [{ type: 'text', text: 'canonical text' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 5, output_tokens: 15 },
    }));
  });

  try {
    const adapter = new GmiProviderAdapter();
    const req = createCanonicalRequest({ targetModel: 'MiniMaxAI/MiniMax-M3' });
    const resp = await adapter.execute(req, { apiKey: 'test-key', baseUrl: mock.url, timeoutMs: 5000 });
    assert.equal(resp.id, 'msg_canon_1');
    assert.equal(resp.model, 'MiniMaxAI/MiniMax-M3');
    assert.equal(resp.content[0].text, 'canonical text');
    assert.equal(resp.usage.inputTokens, 5);
    assert.equal(resp.usage.outputTokens, 15);
    assert.equal(resp.usage.totalTokens, 20);
  } finally {
    await mock.close();
  }
});
