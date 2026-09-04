// test/unit/openai-compatible-provider.test.js
// Unit tests for the reusable OpenAICompatibleProvider base class.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { OpenAICompatibleProvider } from '../../src/providers/openai-compatible-provider.js';
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

test('Subclass inherits all provider behavior with minimal definitions', () => {
  class MinimalProvider extends OpenAICompatibleProvider {
    get id() {
      return 'custom-mini';
    }
    get displayName() {
      return 'Custom Mini';
    }
    get defaultBaseUrl() {
      return 'https://api.custom-mini.ai/v1';
    }
  }

  const provider = new MinimalProvider();
  assert.equal(provider.id, 'custom-mini');
  assert.equal(provider.displayName, 'Custom Mini');
  assert.equal(provider.defaultBaseUrl, 'https://api.custom-mini.ai/v1');
  assert.equal(provider.nativeProtocol, 'openai-chat');
  assert.equal(provider.capabilities.streaming, true);
  assert.equal(provider.capabilities.tools, true);
  assert.equal(provider.capabilities.parallelToolCalls, true);
  assert.equal(provider.capabilities.vision, true);
  assert.equal(provider.capabilities.systemPrompts, true);
  assert.equal(provider.buildChatCompletionsUrl(), 'https://api.custom-mini.ai/v1/chat/completions');
  assert.equal(provider.buildModelsUrl(), 'https://api.custom-mini.ai/v1/models');
});

test('Constructor accepts custom options and defaults correctly', () => {
  const custom = new OpenAICompatibleProvider({
    id: 'local-test',
    displayName: 'Local Test',
    defaultBaseUrl: 'http://localhost:11434/v1',
  });

  assert.equal(custom.id, 'local-test');
  assert.equal(custom.displayName, 'Local Test');
  assert.equal(custom.defaultBaseUrl, 'http://localhost:11434/v1');
  assert.equal(custom.buildChatCompletionsUrl(), 'http://localhost:11434/v1/chat/completions');
});

test('buildChatCompletionsUrl and buildModelsUrl handle base URLs with or without /v1 and trailing slashes', () => {
  const provider = new OpenAICompatibleProvider();

  // Without /v1
  assert.equal(provider.buildChatCompletionsUrl('https://api.example.com'), 'https://api.example.com/v1/chat/completions');
  assert.equal(provider.buildModelsUrl('https://api.example.com'), 'https://api.example.com/v1/models');

  // With /v1
  assert.equal(provider.buildChatCompletionsUrl('https://api.example.com/v1'), 'https://api.example.com/v1/chat/completions');
  assert.equal(provider.buildModelsUrl('https://api.example.com/v1'), 'https://api.example.com/v1/models');

  // With trailing slashes
  assert.equal(provider.buildChatCompletionsUrl('https://api.example.com/v1///'), 'https://api.example.com/v1/chat/completions');
  assert.equal(provider.buildModelsUrl('https://api.example.com///'), 'https://api.example.com/v1/models');
});

test('getDefaultHeaders sets authorization and extra headers', () => {
  const provider = new OpenAICompatibleProvider();

  const headersWithKey = provider.getDefaultHeaders('sk-test-123', { 'X-Custom': 'val' });
  assert.equal(headersWithKey['Authorization'], 'Bearer sk-test-123');
  assert.equal(headersWithKey['Content-Type'], 'application/json');
  assert.equal(headersWithKey['X-Custom'], 'val');

  // Without API key (e.g. Ollama local)
  const headersWithoutKey = provider.getDefaultHeaders(undefined);
  assert.equal(headersWithoutKey['Authorization'], undefined);
  assert.equal(headersWithoutKey['Content-Type'], 'application/json');
});

test('execute() sends formatted OpenAI request and returns CanonicalResponse', async () => {
  let receivedBody = null;
  let receivedHeaders = null;

  const mock = await startMock((req, res) => {
    receivedHeaders = req.headers;
    let bodyStr = '';
    req.on('data', (c) => { bodyStr += c; });
    req.on('end', () => {
      receivedBody = JSON.parse(bodyStr);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        id: 'chatcmpl-test-1',
        model: 'generic-model',
        choices: [
          {
            message: { role: 'assistant', content: 'Hello from OpenAI compatible endpoint' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 },
      }));
    });
  });

  try {
    const provider = new OpenAICompatibleProvider();
    const req = createCanonicalRequest({
      targetModel: 'generic-model',
      messages: [{ role: 'user', content: 'Say hello' }],
      systemPrompt: 'Be friendly',
    });

    const response = await provider.execute(req, {
      apiKey: 'test-secret-key',
      baseUrl: mock.url,
      timeoutMs: 5000,
    });

    assert.equal(receivedHeaders['authorization'], 'Bearer test-secret-key');
    assert.equal(receivedBody.model, 'generic-model');
    assert.equal(receivedBody.messages[0].role, 'system');
    assert.equal(receivedBody.messages[0].content, 'Be friendly');
    assert.equal(receivedBody.messages[1].role, 'user');
    assert.equal(receivedBody.stream, false);

    assert.equal(response.id, 'chatcmpl-test-1');
    assert.equal(response.model, 'generic-model');
    assert.equal(response.content[0].type, 'text');
    assert.equal(response.content[0].text, 'Hello from OpenAI compatible endpoint');
    assert.equal(response.stopReason, 'end_turn');
    assert.equal(response.usage.inputTokens, 12);
    assert.equal(response.usage.outputTokens, 8);
    assert.equal(response.usage.totalTokens, 20);
  } finally {
    await mock.close();
  }
});

test('stream() consumes OpenAI SSE chunks and yields CanonicalStreamChunks', async () => {
  const mock = await startMock((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.write('data: {"id":"chatcmpl-s1","choices":[{"delta":{"role":"assistant","content":"Streamed "}}]}\n\n');
    res.write('data: {"id":"chatcmpl-s1","choices":[{"delta":{"content":"chunks"}}]}\n\n');
    res.write('data: {"id":"chatcmpl-s1","choices":[{"delta":{},"finish_reason":"stop"}]}\n\n');
    res.write('data: [DONE]\n\n');
    res.end();
  });

  try {
    const provider = new OpenAICompatibleProvider();
    const req = createCanonicalRequest({
      targetModel: 'stream-model',
      stream: true,
      messages: [{ role: 'user', content: 'Stream test' }],
    });

    const stream = provider.stream(req, {
      apiKey: 'test-key',
      baseUrl: mock.url,
      timeoutMs: 5000,
    });

    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    assert.ok(chunks.length >= 3);
    const textDeltas = chunks.filter((c) => c.type === 'text_delta').map((c) => c.text);
    assert.equal(textDeltas.join(''), 'Streamed chunks');

    const stopChunk = chunks.find((c) => c.type === 'content_block_stop');
    assert.ok(stopChunk);
  } finally {
    await mock.close();
  }
});

test('fetchModels() parses standard OpenAI model lists', async () => {
  const mock = await startMock((req, res) => {
    assert.equal(req.url, '/v1/models');
    assert.equal(req.headers.authorization, 'Bearer models-key');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      object: 'list',
      data: [
        { id: 'model-1', name: 'Model 1', context_length: 32768 },
        { id: 'model-2' },
      ],
    }));
  });

  try {
    const provider = new OpenAICompatibleProvider();
    const models = await provider.fetchModels('models-key', mock.url);
    assert.equal(models.length, 2);
    assert.equal(models[0].id, 'model-1');
    assert.equal(models[0].name, 'Model 1');
    assert.equal(models[0].contextLength, 32768);
    assert.equal(models[1].id, 'model-2');
    assert.equal(models[1].name, 'model-2');
  } finally {
    await mock.close();
  }
});

test('testConnection() handles 200, 401, 500, and network error', async () => {
  let statusToReturn = 200;
  const mock = await startMock((req, res) => {
    res.writeHead(statusToReturn, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: statusToReturn }));
  });

  try {
    const provider = new OpenAICompatibleProvider();

    // 200 OK
    statusToReturn = 200;
    const okRes = await provider.testConnection('key', mock.url);
    assert.equal(okRes.ok, true);

    // 401 Invalid Key
    statusToReturn = 401;
    const keyRes = await provider.testConnection('bad-key', mock.url);
    assert.equal(keyRes.ok, false);
    assert.equal(keyRes.reason, 'invalid-key');
    assert.equal(keyRes.status, 401);

    // 500 Upstream Error
    statusToReturn = 500;
    const errRes = await provider.testConnection('key', mock.url);
    assert.equal(errRes.ok, false);
    assert.equal(errRes.reason, 'upstream-error');
    assert.equal(errRes.status, 500);

    // Network error (server unreachable)
    const netRes = await provider.testConnection('key', 'http://127.0.0.1:1');
    assert.equal(netRes.ok, false);
    assert.equal(netRes.reason, 'network-error');
    assert.ok(netRes.error);
  } finally {
    await mock.close();
  }
});

test('execute() aborts on upstream timeout with UPSTREAM_TIMEOUT and status 504', async () => {
  const mock = await startMock((req, res) => {
    // Intentionally delay longer than the timeout
    setTimeout(() => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{}');
    }, 250);
  });

  try {
    const provider = new OpenAICompatibleProvider();
    const req = createCanonicalRequest({ targetModel: 'slow-model' });

    await assert.rejects(
      async () => {
        await provider.execute(req, {
          baseUrl: mock.url,
          timeoutMs: 40,
        });
      },
      (err) => err.code === 'UPSTREAM_TIMEOUT' && err.status === 504
    );
  } finally {
    await mock.close();
  }
});

test('execute() normalizes upstream HTTP error responses with status and code', async () => {
  const mock = await startMock((req, res) => {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: {
        message: 'The model `invalid-id` does not exist',
        type: 'invalid_request_error',
        code: 'model_not_found',
      },
    }));
  });

  try {
    const provider = new OpenAICompatibleProvider();
    const req = createCanonicalRequest({ targetModel: 'invalid-id' });

    await assert.rejects(
      async () => {
        await provider.execute(req, { baseUrl: mock.url });
      },
      (err) => {
        assert.equal(err.status, 400);
        assert.equal(err.code, 'model_not_found');
        assert.match(err.message, /invalid-id/);
        return true;
      }
    );
  } finally {
    await mock.close();
  }
});

test('execute() retries transient failures when configured', async () => {
  let callCount = 0;
  const mock = await startMock((req, res) => {
    callCount++;
    if (callCount === 1) {
      // First attempt fails with 429 rate limit
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'Rate limited', code: 'rate_limit' } }));
      return;
    }

    // Second attempt succeeds
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      id: 'chatcmpl-retry',
      choices: [{ message: { content: 'Succeeded on retry' }, finish_reason: 'stop' }],
    }));
  });

  try {
    const provider = new OpenAICompatibleProvider();
    const req = createCanonicalRequest({ targetModel: 'test-model' });

    const resp = await provider.execute(req, {
      baseUrl: mock.url,
      retries: 2,
      retryDelayMs: 15,
    });

    assert.equal(callCount, 2);
    assert.equal(resp.content[0].text, 'Succeeded on retry');
  } finally {
    await mock.close();
  }
});
