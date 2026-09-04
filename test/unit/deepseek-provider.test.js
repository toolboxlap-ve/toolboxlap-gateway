// test/unit/deepseek-provider.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DeepSeekProvider, deepSeekProvider } from '../../src/providers/deepseek-provider.js';
import { deepSeekManifest } from '../../src/providers/manifests/deepseek.manifest.js';
import { OpenAICompatibleProvider } from '../../src/providers/openai-compatible-provider.js';
import { globalProviderRegistry } from '../../src/providers/provider-registry.js';
import http from 'node:http';

test('DeepSeekProvider inherits from OpenAICompatibleProvider with correct metadata', () => {
  assert.ok(deepSeekProvider instanceof OpenAICompatibleProvider);
  assert.equal(deepSeekProvider.id, 'deepseek');
  assert.equal(deepSeekProvider.displayName, 'DeepSeek');
  assert.equal(deepSeekProvider.defaultBaseUrl, 'https://api.deepseek.com');
  assert.equal(deepSeekProvider.nativeProtocol, 'openai-chat');
});

test('DeepSeekProvider is automatically registered in globalProviderRegistry', () => {
  assert.ok(globalProviderRegistry.has('deepseek'));
  const registered = globalProviderRegistry.get('deepseek');
  assert.equal(registered.id, 'deepseek');
  assert.equal(registered.displayName, 'DeepSeek');
});

test('DeepSeek manifest is valid and registered in globalProviderRegistry', () => {
  const manifest = globalProviderRegistry.getManifest('deepseek');
  assert.ok(manifest);
  assert.equal(manifest.id, 'deepseek');
  assert.equal(manifest.displayName, 'DeepSeek');
  assert.equal(manifest.protocol, 'openai-chat');
  assert.equal(manifest.defaultBaseUrl, 'https://api.deepseek.com');
  assert.equal(manifest.supportsApiKey, true);
  assert.equal(manifest.supportsModelDiscovery, true);
  assert.equal(manifest.supportsStreaming, true);
  assert.equal(manifest.supportsTools, true);
  assert.equal(manifest.supportsReasoning, true);
});

test('buildChatCompletionsUrl and buildModelsUrl generate correct DeepSeek endpoints', () => {
  assert.equal(deepSeekProvider.buildChatCompletionsUrl('https://api.deepseek.com'), 'https://api.deepseek.com/v1/chat/completions');
  assert.equal(deepSeekProvider.buildChatCompletionsUrl('https://api.deepseek.com/v1'), 'https://api.deepseek.com/v1/chat/completions');
  assert.equal(deepSeekProvider.buildModelsUrl('https://api.deepseek.com'), 'https://api.deepseek.com/v1/models');
  assert.equal(deepSeekProvider.buildModelsUrl('https://api.deepseek.com/v1'), 'https://api.deepseek.com/v1/models');
});

test('fetchModels and testConnection work with standard OpenAI endpoints', async () => {
  const mockServer = http.createServer((req, res) => {
    if (req.url === '/v1/models' || req.url === '/models') {
      if (req.headers.authorization !== 'Bearer sk-deepseek-test') {
        res.writeHead(401, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        object: 'list',
        data: [
          { id: 'deepseek-chat', object: 'model' },
          { id: 'deepseek-reasoner', object: 'model' },
        ],
      }));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  await new Promise((r) => mockServer.listen(0, '127.0.0.1', r));
  const baseUrl = `http://127.0.0.1:${mockServer.address().port}`;

  try {
    // 1. fetchModels with valid key
    const models = await deepSeekProvider.fetchModels('sk-deepseek-test', baseUrl);
    assert.equal(models.length, 2);
    assert.equal(models[0].id, 'deepseek-chat');
    assert.equal(models[1].id, 'deepseek-reasoner');

    // 2. testConnection with valid key
    const testRes = await deepSeekProvider.testConnection('sk-deepseek-test', baseUrl);
    assert.equal(testRes.ok, true);

    // 3. testConnection with invalid key
    const testFail = await deepSeekProvider.testConnection('bad-key', baseUrl);
    assert.equal(testFail.ok, false);
    assert.equal(testFail.reason, 'invalid-key');
  } finally {
    mockServer.close();
  }
});
