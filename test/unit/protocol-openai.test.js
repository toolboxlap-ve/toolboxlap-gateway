// test/unit/protocol-openai.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';

import { createCanonicalRequest } from '../../src/canonical/request.js';
import {
  openAiChatProtocol,
  canonicalToOpenAiRequest,
  openAiToCanonicalResponse,
  mapFinishReason,
  streamOpenAiToCanonical,
  canonicalChunkToOpenAiSse,
  openAiChunkToCanonicalEvents,
  createOpenAiStreamState,
} from '../../src/protocols/openai/index.js';

test('canonicalToOpenAiRequest translates basic prompt and model', () => {
  const req = createCanonicalRequest({
    targetModel: 'deepseek-chat',
    messages: [{ role: 'user', content: [{ type: 'text', text: 'Hello AI' }] }],
    temperature: 0.7,
    maxTokens: 100,
    stream: true,
  });

  const openAiReq = canonicalToOpenAiRequest(req);
  assert.equal(openAiReq.model, 'deepseek-chat');
  assert.equal(openAiReq.temperature, 0.7);
  assert.equal(openAiReq.max_tokens, 100);
  assert.equal(openAiReq.stream, true);
  assert.equal(openAiReq.messages.length, 1);
  assert.equal(openAiReq.messages[0].role, 'user');
  assert.equal(openAiReq.messages[0].content, 'Hello AI');
});

test('canonicalToOpenAiRequest translates system prompt into system message', () => {
  const req = createCanonicalRequest({
    systemPrompt: 'You are an expert mathematician.',
    messages: [{ role: 'user', content: 'What is 2+2?' }],
  });

  const openAiReq = canonicalToOpenAiRequest(req);
  assert.equal(openAiReq.messages.length, 2);
  assert.equal(openAiReq.messages[0].role, 'system');
  assert.equal(openAiReq.messages[0].content, 'You are an expert mathematician.');
  assert.equal(openAiReq.messages[1].role, 'user');
  assert.equal(openAiReq.messages[1].content, 'What is 2+2?');
});

test('canonicalToOpenAiRequest translates tools and toolChoice', () => {
  const req = createCanonicalRequest({
    tools: [
      {
        name: 'get_weather',
        description: 'Get temperature',
        inputSchema: {
          type: 'object',
          properties: { city: { type: 'string' } },
          required: ['city'],
        },
      },
    ],
    toolChoice: 'any',
  });

  const openAiReq = canonicalToOpenAiRequest(req);
  assert.equal(Array.isArray(openAiReq.tools), true);
  assert.equal(openAiReq.tools.length, 1);
  assert.equal(openAiReq.tools[0].type, 'function');
  assert.equal(openAiReq.tools[0].function.name, 'get_weather');
  assert.equal(openAiReq.tools[0].function.description, 'Get temperature');
  assert.deepEqual(openAiReq.tools[0].function.parameters.required, ['city']);
  assert.equal(openAiReq.tool_choice, 'required'); // 'any' maps to 'required'
});

test('canonicalToOpenAiRequest maps specific tool choice object', () => {
  const req = createCanonicalRequest({
    tools: [{ name: 'calc', inputSchema: {} }],
    toolChoice: { type: 'tool', name: 'calc' },
  });

  const openAiReq = canonicalToOpenAiRequest(req);
  assert.deepEqual(openAiReq.tool_choice, { type: 'function', function: { name: 'calc' } });
});

test('canonicalToOpenAiRequest translates assistant tool_use and user tool_result', () => {
  const req = createCanonicalRequest({
    messages: [
      { role: 'user', content: 'What is 10 + 20?' },
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Calling calculator...' },
          {
            type: 'tool_use',
            id: 'call_calc_1',
            name: 'calculate',
            input: { expr: '10+20' },
          },
        ],
      },
      {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            toolUseId: 'call_calc_1',
            content: '30',
          },
        ],
      },
    ],
  });

  const openAiReq = canonicalToOpenAiRequest(req);
  assert.equal(openAiReq.messages.length, 3);

  // Assistant message with tool_calls
  const asst = openAiReq.messages[1];
  assert.equal(asst.role, 'assistant');
  assert.equal(asst.content, 'Calling calculator...');
  assert.equal(asst.tool_calls.length, 1);
  assert.equal(asst.tool_calls[0].id, 'call_calc_1');
  assert.equal(asst.tool_calls[0].function.name, 'calculate');
  assert.equal(asst.tool_calls[0].function.arguments, '{"expr":"10+20"}');

  // Tool result message
  const toolMsg = openAiReq.messages[2];
  assert.equal(toolMsg.role, 'tool');
  assert.equal(toolMsg.tool_call_id, 'call_calc_1');
  assert.equal(toolMsg.content, '30');
});

test('canonicalToOpenAiRequest translates image parts to image_url', () => {
  const req = createCanonicalRequest({
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'What is this image?' },
          { type: 'image', mimeType: 'image/jpeg', base64Data: 'QUJD' },
        ],
      },
    ],
  });

  const openAiReq = canonicalToOpenAiRequest(req);
  assert.equal(openAiReq.messages.length, 1);
  const parts = openAiReq.messages[0].content;
  assert.equal(parts.length, 2);
  assert.equal(parts[0].type, 'text');
  assert.equal(parts[1].type, 'image_url');
  assert.equal(parts[1].image_url.url, 'data:image/jpeg;base64,QUJD');
});

test('openAiToCanonicalResponse translates text completion and usage', () => {
  const openAiResp = {
    id: 'chatcmpl-test-1',
    model: 'gpt-4o-mini',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: 'The answer is 42.',
        },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: 15,
      completion_tokens: 8,
      total_tokens: 23,
    },
  };

  const canon = openAiToCanonicalResponse(openAiResp);
  assert.equal(canon.id, 'chatcmpl-test-1');
  assert.equal(canon.model, 'gpt-4o-mini');
  assert.equal(canon.stopReason, 'end_turn');
  assert.equal(canon.content.length, 1);
  assert.equal(canon.content[0].type, 'text');
  assert.equal(canon.content[0].text, 'The answer is 42.');
  assert.equal(canon.usage.inputTokens, 15);
  assert.equal(canon.usage.outputTokens, 8);
  assert.equal(canon.usage.totalTokens, 23);
});

test('openAiToCanonicalResponse translates tool_calls and finish_reason', () => {
  const openAiResp = {
    id: 'chatcmpl-tool-1',
    model: 'gpt-4o',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: 'call_abc_123',
              type: 'function',
              function: {
                name: 'get_weather',
                arguments: '{"location":"Paris","unit":"celsius"}',
              },
            },
          ],
        },
        finish_reason: 'tool_calls',
      },
    ],
  };

  const canon = openAiToCanonicalResponse(openAiResp);
  assert.equal(canon.stopReason, 'tool_use');
  assert.equal(canon.content.length, 1);
  const toolUse = canon.content[0];
  assert.equal(toolUse.type, 'tool_use');
  assert.equal(toolUse.id, 'call_abc_123');
  assert.equal(toolUse.name, 'get_weather');
  assert.deepEqual(toolUse.input, { location: 'Paris', unit: 'celsius' });
});

test('mapFinishReason handles all standard OpenAI finish reasons', () => {
  assert.equal(mapFinishReason('stop'), 'end_turn');
  assert.equal(mapFinishReason('tool_calls'), 'tool_use');
  assert.equal(mapFinishReason('function_call'), 'tool_use');
  assert.equal(mapFinishReason('length'), 'max_tokens');
  assert.equal(mapFinishReason('content_filter'), 'stop_sequence');
  assert.equal(mapFinishReason('unknown', true), 'tool_use');
  assert.equal(mapFinishReason('unknown', false), 'end_turn');
});

test('openAiChunkToCanonicalEvents streams text deltas', () => {
  const state = createOpenAiStreamState('gpt-4o');

  const c1 = { id: 'chatcmpl_s1', model: 'gpt-4o', choices: [{ delta: { role: 'assistant' }, finish_reason: null }] };
  const e1 = openAiChunkToCanonicalEvents(c1, state);
  assert.equal(e1.length, 1);
  assert.equal(e1[0].type, 'message_start');

  const c2 = { choices: [{ delta: { content: 'Hello' }, finish_reason: null }] };
  const e2 = openAiChunkToCanonicalEvents(c2, state);
  assert.equal(e2.length, 2);
  assert.equal(e2[0].type, 'content_block_start');
  assert.equal(e2[1].type, 'text_delta');
  assert.equal(e2[1].text, 'Hello');

  const c3 = { choices: [{ delta: { content: ' world' }, finish_reason: null }] };
  const e3 = openAiChunkToCanonicalEvents(c3, state);
  assert.equal(e3.length, 1);
  assert.equal(e3[0].type, 'text_delta');
  assert.equal(e3[0].text, ' world');

  const c4 = { choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 5, completion_tokens: 2 } };
  const e4 = openAiChunkToCanonicalEvents(c4, state);
  assert.equal(e4.length, 3);
  assert.equal(e4[0].type, 'content_block_stop');
  assert.equal(e4[1].type, 'message_delta');
  assert.equal(e4[1].stopReason, 'end_turn');
  assert.equal(e4[2].type, 'message_stop');
});

test('streamOpenAiToCanonical parses raw SSE stream lines', async () => {
  const ssePayload = [
    'data: {"id":"c1","model":"m1","choices":[{"delta":{"role":"assistant"},"finish_reason":null}]}\n\n',
    'data: {"choices":[{"delta":{"content":"P"},"finish_reason":null}]}\n\n',
    'data: {"choices":[{"delta":{"content":"ong"},"finish_reason":null}]}\n\n',
    'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
    'data: [DONE]\n\n',
  ];

  const stream = Readable.from(ssePayload);
  const events = [];
  for await (const ev of streamOpenAiToCanonical(stream)) {
    events.push(ev);
  }

  const types = events.map((e) => e.type);
  assert.deepEqual(types, [
    'message_start',
    'content_block_start',
    'text_delta',
    'text_delta',
    'content_block_stop',
    'message_delta',
    'message_stop',
  ]);
  assert.equal(events[2].text, 'P');
  assert.equal(events[3].text, 'ong');
});

test('canonicalChunkToOpenAiSse formats chunks into OpenAI SSE syntax', () => {
  const startChunk = { type: 'message_start', id: 'c1', model: 'm1' };
  const sseStart = canonicalChunkToOpenAiSse(startChunk);
  assert.match(sseStart, /^data: /);
  assert.match(sseStart, /chat\.completion\.chunk/);

  const deltaChunk = { type: 'text_delta', text: 'Hi' };
  const sseDelta = canonicalChunkToOpenAiSse(deltaChunk);
  assert.match(sseDelta, /"content":"Hi"/);

  const stopChunk = { type: 'message_stop' };
  const sseStop = canonicalChunkToOpenAiSse(stopChunk);
  assert.equal(sseStop, 'data: [DONE]\n\n');
});

test('openAiChatProtocol parseError normalizes error structures', () => {
  const errObj = {
    error: {
      message: 'Rate limit reached',
      type: 'insufficient_quota',
      code: 'rate_limit_exceeded',
    },
  };
  const parsed1 = openAiChatProtocol.parseError(errObj, 429);
  assert.equal(parsed1.code, 'rate_limit_exceeded');
  assert.equal(parsed1.message, 'Rate limit reached');
  assert.equal(parsed1.status, 429);

  const parsed2 = openAiChatProtocol.parseError(JSON.stringify(errObj), 400);
  assert.equal(parsed2.code, 'rate_limit_exceeded');

  const parsed3 = openAiChatProtocol.parseError('plain error text', 502);
  assert.equal(parsed3.code, 'upstream_error');
  assert.equal(parsed3.message, 'plain error text');
  assert.equal(parsed3.status, 502);
});
