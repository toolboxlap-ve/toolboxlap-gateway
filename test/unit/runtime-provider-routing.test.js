// test/unit/runtime-provider-routing.test.js
// Tests the runtime provider routing fix:
// - Dynamic provider resolution via globalProviderRegistry
// - Automatic protocol translation between Anthropic format and OpenAI/Canonical format
// - Support for GMI (native Anthropic) and OpenRouter (OpenAI-compatible)
// - Streaming, non-streaming, and tool-use conversions

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  anthropicToCanonicalRequest,
  canonicalToAnthropicResponse,
  canonicalChunkToAnthropicSse,
  forwardToUpstream,
} from '../../src/proxy.js';
import { globalProviderRegistry } from '../../src/providers/provider-registry.js';
import '../../src/providers/gmi-provider.js';
import '../../src/providers/openrouter-provider.js';
import { CanonicalStream } from '../../src/canonical/events.js';
import { createRequestHandler } from '../../src/server.js';
import http from 'node:http';

test('anthropicToCanonicalRequest translates text and parameters correctly', () => {
  const anthropicBody = {
    model: 'claude-opus-5',
    max_tokens: 1024,
    temperature: 0.7,
    system: 'You are a helpful assistant',
    messages: [
      { role: 'user', content: 'Hello there!' },
    ],
  };

  const canonicalReq = anthropicToCanonicalRequest(anthropicBody, {
    requestId: 'req-123',
    clientModelAlias: 'claude-opus-5',
    targetModel: 'nvidia/nemotron-3.5-lightning:free',
  });

  assert.equal(canonicalReq.clientModelAlias, 'claude-opus-5');
  assert.equal(canonicalReq.targetModel, 'nvidia/nemotron-3.5-lightning:free');
  assert.equal(canonicalReq.maxTokens, 1024);
  assert.equal(canonicalReq.temperature, 0.7);
  assert.equal(canonicalReq.systemPrompt, 'You are a helpful assistant');
  assert.equal(canonicalReq.messages.length, 1);
  assert.equal(canonicalReq.messages[0].role, 'user');
  assert.equal(canonicalReq.messages[0].content[0].text, 'Hello there!');
});

test('anthropicToCanonicalRequest translates tools correctly', () => {
  const anthropicBody = {
    model: 'claude-opus-5',
    messages: [{ role: 'user', content: 'What is the weather?' }],
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
    tool_choice: { type: 'tool', name: 'get_weather' },
  };

  const canonicalReq = anthropicToCanonicalRequest(anthropicBody, {
    clientModelAlias: 'claude-opus-5',
    targetModel: 'nvidia/nemotron-3.5-lightning:free',
  });

  assert.equal(canonicalReq.tools.length, 1);
  assert.equal(canonicalReq.tools[0].name, 'get_weather');
  assert.equal(canonicalReq.tools[0].description, 'Get current weather');
  assert.deepEqual(canonicalReq.tools[0].inputSchema, {
    type: 'object',
    properties: { location: { type: 'string' } },
    required: ['location'],
  });
  assert.deepEqual(canonicalReq.toolChoice, { type: 'tool', name: 'get_weather' });
});

test('canonicalToAnthropicResponse formats assistant text response correctly', () => {
  const canonicalRes = {
    id: 'msg-abc-123',
    model: 'nvidia/nemotron-3.5-lightning:free',
    message: {
      role: 'assistant',
      content: 'Hello! How can I help you today?',
    },
    finishReason: 'stop',
    usage: {
      inputTokens: 15,
      outputTokens: 8,
    },
  };

  const anthropicRes = canonicalToAnthropicResponse(canonicalRes, 'claude-opus-5');

  assert.equal(anthropicRes.id, 'msg-abc-123');
  assert.equal(anthropicRes.type, 'message');
  assert.equal(anthropicRes.role, 'assistant');
  assert.equal(anthropicRes.model, 'claude-opus-5');
  assert.equal(anthropicRes.stop_reason, 'end_turn');
  assert.deepEqual(anthropicRes.content, [
    { type: 'text', text: 'Hello! How can I help you today?' },
  ]);
  assert.deepEqual(anthropicRes.usage, {
    input_tokens: 15,
    output_tokens: 8,
  });
});

test('canonicalToAnthropicResponse formats tool call response correctly', () => {
  const canonicalRes = {
    id: 'msg-abc-456',
    model: 'nvidia/nemotron-3.5-lightning:free',
    message: {
      role: 'assistant',
      content: 'Let me look that up for you.',
      toolCalls: [
        {
          id: 'call_xyz789',
          name: 'get_weather',
          arguments: { location: 'San Francisco' },
        },
      ],
    },
    finishReason: 'tool_calls',
    usage: {
      inputTokens: 25,
      outputTokens: 12,
    },
  };

  const anthropicRes = canonicalToAnthropicResponse(canonicalRes, 'claude-opus-5');

  assert.equal(anthropicRes.id, 'msg-abc-456');
  assert.equal(anthropicRes.stop_reason, 'tool_use');
  assert.equal(anthropicRes.content.length, 2);
  assert.deepEqual(anthropicRes.content[0], {
    type: 'text',
    text: 'Let me look that up for you.',
  });
  assert.deepEqual(anthropicRes.content[1], {
    type: 'tool_use',
    id: 'call_xyz789',
    name: 'get_weather',
    input: { location: 'San Francisco' },
  });
});

test('canonicalChunkToAnthropicSse formats full SSE lifecycle correctly', () => {
  // 1. message_start
  const sseStart = canonicalChunkToAnthropicSse(
    CanonicalStream.messageStart('msg_test1', 'target_model'),
    { clientModel: 'claude-opus-5' }
  );
  assert.match(sseStart, /event: message_start/);
  assert.match(sseStart, /"model":"claude-opus-5"/);
  assert.match(sseStart, /"id":"msg_test1"/);

  // 2. content_block_start (text)
  const sseTextStart = canonicalChunkToAnthropicSse(
    CanonicalStream.contentBlockStart(0, 'text')
  );
  assert.match(sseTextStart, /event: content_block_start/);
  assert.match(sseTextStart, /"type":"text"/);

  // 3. text_delta
  const sseDelta = canonicalChunkToAnthropicSse(
    CanonicalStream.textDelta(0, 'Hello world')
  );
  assert.match(sseDelta, /event: content_block_delta/);
  assert.match(sseDelta, /"type":"text_delta"/);
  assert.match(sseDelta, /"text":"Hello world"/);

  // 4. content_block_stop
  const sseStop = canonicalChunkToAnthropicSse(
    CanonicalStream.contentBlockStop(0)
  );
  assert.match(sseStop, /event: content_block_stop/);

  // 5. message_delta
  const sseMsgDelta = canonicalChunkToAnthropicSse(
    CanonicalStream.messageDelta('end_turn', { outputTokens: 2 })
  );
  assert.match(sseMsgDelta, /event: message_delta/);
  assert.match(sseMsgDelta, /"stop_reason":"end_turn"/);

  // 6. message_stop
  const sseMsgStop = canonicalChunkToAnthropicSse(
    CanonicalStream.messageStop()
  );
  assert.match(sseMsgStop, /event: message_stop/);
});

test('canonicalChunkToAnthropicSse formats tool_use streaming blocks correctly', () => {
  // content_block_start with tool_use
  const toolStartChunk = {
    type: 'content_block_start',
    index: 1,
    blockType: 'tool_use',
    id: 'call_abc123',
    name: 'fetch_stock',
  };
  const sseToolStart = canonicalChunkToAnthropicSse(toolStartChunk);
  assert.match(sseToolStart, /event: content_block_start/);
  assert.match(sseToolStart, /"type":"tool_use"/);
  assert.match(sseToolStart, /"name":"fetch_stock"/);
  assert.match(sseToolStart, /"id":"call_abc123"/);

  // tool_call_delta
  const sseToolDelta = canonicalChunkToAnthropicSse(
    CanonicalStream.toolCallDelta(1, '{"symbol":"AAPL"}')
  );
  assert.match(sseToolDelta, /event: content_block_delta/);
  assert.match(sseToolDelta, /"type":"input_json_delta"/);
  assert.match(sseToolDelta, /"partial_json":"\{\\"symbol\\":\\"AAPL\\"\}"/);
});

test('forwardToUpstream routes through GMI when activeProvider is gmi', async () => {
  const gmiProvider = globalProviderRegistry.get('gmi');
  const originalForward = gmiProvider.forward;

  let calledWith = null;
  gmiProvider.forward = async (req, ctx) => {
    calledWith = { req, ctx };
    return {
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(Buffer.from(JSON.stringify({ id: 'msg-gmi' })));
          controller.close();
        },
      }),
      isStreaming: false,
    };
  };

  try {
    const res = await forwardToUpstream(
      {
        body: { model: 'claude-opus-5', messages: [{ role: 'user', content: 'hi' }] },
        requestId: 'req-gmi-1',
      },
      {
        activeProvider: 'gmi',
        gmiApiKey: 'sk-gmi-key',
        gmiBaseUrl: 'https://api.gmi-serving.com',
      }
    );

    assert.ok(calledWith, 'gmiProvider.forward should have been called');
    assert.equal(calledWith.ctx.apiKey, 'sk-gmi-key');
    assert.equal(calledWith.ctx.baseUrl, 'https://api.gmi-serving.com');
    assert.equal(res.status, 200);
  } finally {
    gmiProvider.forward = originalForward;
  }
});

test('forwardToUpstream routes non-streaming requests to openrouter provider', async () => {
  const openrouterProvider = globalProviderRegistry.get('openrouter');
  const originalExecute = openrouterProvider.execute;

  let executedReq = null;
  let executedCtx = null;
  openrouterProvider.execute = async (req, ctx) => {
    executedReq = req;
    executedCtx = ctx;
    return {
      id: 'chatcmpl-or-123',
      model: 'nvidia/nemotron-3.5-lightning:free',
      message: {
        role: 'assistant',
        content: 'Hello from OpenRouter via Canonical',
      },
      finishReason: 'stop',
      usage: { inputTokens: 10, outputTokens: 5 },
    };
  };

  try {
    const res = await forwardToUpstream(
      {
        body: {
          model: 'nvidia/nemotron-3.5-lightning:free',
          messages: [{ role: 'user', content: 'test openrouter' }],
        },
        requestId: 'req-or-1',
      },
      {
        activeProvider: 'openrouter',
        apiKey: 'sk-or-v1-testkey',
        baseUrl: 'https://openrouter.ai/api/v1',
      }
    );

    assert.ok(executedReq, 'openrouterProvider.execute should have been called');
    assert.equal(executedCtx.apiKey, 'sk-or-v1-testkey');
    assert.equal(executedCtx.baseUrl, 'https://openrouter.ai/api/v1');
    assert.equal(executedReq.messages[0].content[0].text, 'test openrouter');

    // Verify response is translated back into Anthropic schema
    const text = await new Response(res.body).text();
    const json = JSON.parse(text);
    assert.equal(json.id, 'chatcmpl-or-123');
    assert.equal(json.type, 'message');
    assert.equal(json.role, 'assistant');
    assert.equal(json.content[0].text, 'Hello from OpenRouter via Canonical');
    assert.equal(json.stop_reason, 'end_turn');
  } finally {
    openrouterProvider.execute = originalExecute;
  }
});

test('forwardToUpstream routes streaming requests to openrouter provider', async () => {
  const openrouterProvider = globalProviderRegistry.get('openrouter');
  const originalStream = openrouterProvider.stream;

  let streamedReq = null;
  openrouterProvider.stream = async function* (req, ctx) {
    streamedReq = req;
    yield CanonicalStream.messageStart('msg-stream-1', 'nvidia/nemotron-3.5-lightning:free');
    yield CanonicalStream.contentBlockStart(0, 'text');
    yield CanonicalStream.textDelta(0, 'Streaming ');
    yield CanonicalStream.textDelta(0, 'response');
    yield CanonicalStream.contentBlockStop(0);
    yield CanonicalStream.messageDelta('end_turn', { outputTokens: 2 });
    yield CanonicalStream.messageStop();
  };

  try {
    const res = await forwardToUpstream(
      {
        body: {
          model: 'nvidia/nemotron-3.5-lightning:free',
          stream: true,
          messages: [{ role: 'user', content: 'stream please' }],
        },
        requestId: 'req-or-stream-1',
      },
      {
        activeProvider: 'openrouter',
        apiKey: 'sk-or-v1-testkey',
        baseUrl: 'https://openrouter.ai/api/v1',
      }
    );

    assert.ok(streamedReq, 'openrouterProvider.stream should have been called');
    assert.equal(res.isStreaming, true);
    assert.equal(res.contentType, 'text/event-stream');

    const sseText = await new Response(res.body).text();
    assert.match(sseText, /event: message_start/);
    assert.match(sseText, /event: content_block_start/);
    assert.match(sseText, /Streaming /);
    assert.match(sseText, /response/);
    assert.match(sseText, /event: content_block_stop/);
    assert.match(sseText, /event: message_delta/);
    assert.match(sseText, /event: message_stop/);
  } finally {
    openrouterProvider.stream = originalStream;
  }
});

test('Server dynamically switches provider without restart via resolveProvider dependency', async () => {
  let activeProv = 'gmi';
  const handler = createRequestHandler(
    {
      host: '127.0.0.1',
      port: 0,
      claudeModelAlias: 'claude-opus-5',
      upstreamModel: 'default-model',
      gmiBaseUrl: 'https://api.gmi-serving.com',
      gmiApiKey: 'sk-gmi',
    },
    {
      resolveProvider: () => ({
        providerId: activeProv,
        apiKey: activeProv === 'gmi' ? 'sk-gmi' : 'sk-openrouter',
        baseUrl: activeProv === 'gmi' ? 'https://api.gmi-serving.com' : 'https://openrouter.ai/api/v1',
        timeoutMs: 60000,
      }),
      resolveModels: () => ({
        alias: 'claude-opus-5',
        model: activeProv === 'gmi' ? 'gmi-model' : 'openrouter-model',
      }),
    }
  );

  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. Initially GMI
    const resGmi = await fetch(`${baseUrl}/health`).then((r) => r.json());
    assert.equal(resGmi.active_provider, 'gmi');
    assert.equal(resGmi.actual_model_id, 'gmi-model');

    // 2. Switch active provider to openrouter
    activeProv = 'openrouter';
    const resOr = await fetch(`${baseUrl}/health`).then((r) => r.json());
    assert.equal(resOr.active_provider, 'openrouter');
    assert.equal(resOr.actual_model_id, 'openrouter-model');
    assert.equal(resOr.upstream_provider, 'openrouter.ai');
  } finally {
    server.close();
  }
});
