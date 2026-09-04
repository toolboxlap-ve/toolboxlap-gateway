// test/unit/openrouter-provider.test.js
// Unit tests for OpenRouterProvider and OpenRouter manifest.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { OpenRouterProvider, openRouterProvider } from '../../src/providers/openrouter-provider.js';
import { openRouterManifest } from '../../src/providers/manifests/openrouter.manifest.js';
import { OpenAICompatibleProvider } from '../../src/providers/openai-compatible-provider.js';
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

test('OpenRouterProvider inherits from OpenAICompatibleProvider with correct metadata', () => {
  const provider = new OpenRouterProvider();
  assert.ok(provider instanceof OpenAICompatibleProvider);
  assert.equal(provider.id, 'openrouter');
  assert.equal(provider.displayName, 'OpenRouter');
  assert.equal(provider.defaultBaseUrl, 'https://openrouter.ai/api/v1');
  assert.equal(provider.nativeProtocol, 'openai-chat');
  assert.equal(provider.capabilities.streaming, true);
  assert.equal(provider.capabilities.tools, true);
  assert.equal(provider.capabilities.vision, true);
});

test('OpenRouterProvider is automatically registered in globalProviderRegistry', () => {
  assert.equal(globalProviderRegistry.has('openrouter'), true);
  assert.equal(globalProviderRegistry.get('openrouter'), openRouterProvider);
});

test('OpenRouter manifest is valid and registered in globalProviderRegistry', () => {
  assert.equal(openRouterManifest.id, 'openrouter');
  assert.equal(openRouterManifest.displayName, 'OpenRouter');
  assert.equal(openRouterManifest.protocol, 'openai-chat');
  assert.equal(openRouterManifest.supportsApiKey, true);
  assert.equal(openRouterManifest.supportsStreaming, true);
  assert.equal(openRouterManifest.supportsTools, true);
  assert.equal(openRouterManifest.supportsVision, true);
  assert.equal(openRouterManifest.website, 'https://openrouter.ai');

  assert.equal(globalProviderRegistry.hasManifest('openrouter'), true);
  const regManifest = globalProviderRegistry.getManifest('openrouter');
  assert.equal(regManifest.id, 'openrouter');
});

test('getDefaultHeaders sets OpenRouter attribution headers', () => {
  const provider = new OpenRouterProvider();
  const headers = provider.getDefaultHeaders('sk-or-v1-testkey');

  assert.equal(headers['Authorization'], 'Bearer sk-or-v1-testkey');
  assert.equal(headers['Content-Type'], 'application/json');
  assert.equal(headers['HTTP-Referer'], 'https://github.com/Toolbox-Gateway');
  assert.equal(headers['X-Title'], 'TOOLBOXLAP Gateway');

  // Allows overriding attribution headers
  const customHeaders = provider.getDefaultHeaders('sk-or-test', {
    'HTTP-Referer': 'https://custom-app.org',
    'X-Title': 'Custom Title',
  });
  assert.equal(customHeaders['HTTP-Referer'], 'https://custom-app.org');
  assert.equal(customHeaders['X-Title'], 'Custom Title');
});

test('fetchModels retrieves and normalizes OpenRouter model attributes', async () => {
  const mock = await startMock((req, res) => {
    assert.equal(req.url, '/v1/models');
    assert.equal(req.headers['http-referer'], 'https://github.com/Toolbox-Gateway');
    assert.equal(req.headers['x-title'], 'TOOLBOXLAP Gateway');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      data: [
        {
          id: 'anthropic/claude-3.5-sonnet',
          name: 'Anthropic: Claude 3.5 Sonnet',
          description: 'High intelligence and speed',
          context_length: 200000,
          pricing: {
            prompt: '0.000003',
            completion: '0.000015',
          },
        },
        {
          id: 'openai/gpt-4o',
        },
      ],
    }));
  });

  try {
    const provider = new OpenRouterProvider();
    const models = await provider.fetchModels('test-key', mock.url);

    assert.equal(models.length, 2);
    assert.equal(models[0].id, 'anthropic/claude-3.5-sonnet');
    assert.equal(models[0].name, 'Anthropic: Claude 3.5 Sonnet');
    assert.equal(models[0].description, 'High intelligence and speed');
    assert.equal(models[0].contextLength, 200000);
    assert.equal(models[0].pricing.prompt, '0.000003');
    assert.equal(models[0].pricing.completion, '0.000015');

    assert.equal(models[1].id, 'openai/gpt-4o');
    assert.equal(models[1].name, 'openai/gpt-4o');
  } finally {
    await mock.close();
  }
});

test('testConnection probes /auth/key for credential verification', async () => {
  let statusToReturn = 200;
  const mock = await startMock((req, res) => {
    assert.equal(req.url, '/v1/auth/key');
    assert.equal(req.headers['authorization'], 'Bearer or-key-123');
    res.writeHead(statusToReturn, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ data: { label: 'My Key', limit: null } }));
  });

  try {
    const provider = new OpenRouterProvider();

    // Valid key
    statusToReturn = 200;
    const okRes = await provider.testConnection('or-key-123', mock.url);
    assert.equal(okRes.ok, true);

    // Invalid key (401)
    statusToReturn = 401;
    const failRes = await provider.testConnection('or-key-123', mock.url);
    assert.equal(failRes.ok, false);
    assert.equal(failRes.reason, 'invalid-key');
    assert.equal(failRes.status, 401);
  } finally {
    await mock.close();
  }
});

test('execute sends OpenRouter request with attribution headers and parses CanonicalResponse', async () => {
  let capturedHeaders = null;
  const mock = await startMock((req, res) => {
    capturedHeaders = req.headers;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      id: 'gen-123',
      model: 'anthropic/claude-3.5-sonnet',
      choices: [
        {
          message: { role: 'assistant', content: 'OpenRouter response' },
          finish_reason: 'stop',
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    }));
  });

  try {
    const provider = new OpenRouterProvider();
    const req = createCanonicalRequest({
      targetModel: 'anthropic/claude-3.5-sonnet',
      messages: [{ role: 'user', content: 'Hello OpenRouter' }],
    });

    const resp = await provider.execute(req, {
      apiKey: 'sk-or-test-key',
      baseUrl: mock.url,
    });

    assert.equal(capturedHeaders['http-referer'], 'https://github.com/Toolbox-Gateway');
    assert.equal(capturedHeaders['x-title'], 'TOOLBOXLAP Gateway');
    assert.equal(capturedHeaders['authorization'], 'Bearer sk-or-test-key');

    assert.equal(resp.id, 'gen-123');
    assert.equal(resp.model, 'anthropic/claude-3.5-sonnet');
    assert.equal(resp.content[0].text, 'OpenRouter response');
    assert.equal(resp.usage.totalTokens, 15);
  } finally {
    await mock.close();
  }
});

test('stream yields CanonicalStreamChunks from OpenRouter SSE stream', async () => {
  const mock = await startMock((req, res) => {
    assert.equal(req.headers['http-referer'], 'https://github.com/Toolbox-Gateway');
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.write('data: {"id":"gen-s1","choices":[{"delta":{"content":"Streaming from "}}]}\n\n');
    res.write('data: {"id":"gen-s1","choices":[{"delta":{"content":"OpenRouter"}}]}\n\n');
    res.write('data: {"id":"gen-s1","choices":[{"delta":{},"finish_reason":"stop"}]}\n\n');
    res.write('data: [DONE]\n\n');
    res.end();
  });

  try {
    const provider = new OpenRouterProvider();
    const req = createCanonicalRequest({
      targetModel: 'openai/gpt-4o-mini',
      stream: true,
      messages: [{ role: 'user', content: 'Stream please' }],
    });

    const stream = provider.stream(req, {
      apiKey: 'sk-or-test',
      baseUrl: mock.url,
    });

    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    const textParts = chunks.filter((c) => c.type === 'text_delta').map((c) => c.text);
    assert.equal(textParts.join(''), 'Streaming from OpenRouter');
  } finally {
    await mock.close();
  }
});
