// test/unit/canonical.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createCanonicalRequest,
  createCanonicalResponse,
  createCanonicalStreamChunk,
  CanonicalStream,
  STREAM_EVENT_TYPES,
} from '../../src/canonical/index.js';

test('createCanonicalRequest sets safe defaults and generates requestId if omitted', () => {
  const req = createCanonicalRequest({});
  assert.equal(typeof req.requestId, 'string');
  assert.equal(req.requestId.length > 0, true);
  assert.equal(req.clientModelAlias, '');
  assert.equal(req.targetModel, '');
  assert.deepEqual(req.messages, []);
  assert.equal(req.systemPrompt, null);
  assert.deepEqual(req.tools, []);
  assert.equal(req.toolChoice, 'auto');
  assert.equal(req.stream, false);
  assert.equal(req.maxTokens, null);
  assert.equal(Object.isFrozen(req), true);
});

test('createCanonicalRequest preserves provided parameters', () => {
  const req = createCanonicalRequest({
    requestId: 'req-custom-123',
    clientModelAlias: 'claude-opus-5',
    targetModel: 'MiniMaxAI/MiniMax-M3',
    messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
    systemPrompt: 'Be concise.',
    stream: true,
    maxTokens: 512,
    temperature: 0.7,
  });
  assert.equal(req.requestId, 'req-custom-123');
  assert.equal(req.clientModelAlias, 'claude-opus-5');
  assert.equal(req.targetModel, 'MiniMaxAI/MiniMax-M3');
  assert.equal(req.messages.length, 1);
  assert.equal(req.systemPrompt, 'Be concise.');
  assert.equal(req.stream, true);
  assert.equal(req.maxTokens, 512);
  assert.equal(req.temperature, 0.7);
});

test('createCanonicalResponse calculates totalTokens and sets safe defaults', () => {
  const resp = createCanonicalResponse({
    model: 'MiniMaxAI/MiniMax-M3',
    content: [{ type: 'text', text: 'response text' }],
    usage: { inputTokens: 10, outputTokens: 20 },
  });
  assert.equal(typeof resp.id, 'string');
  assert.equal(resp.id.startsWith('msg_'), true);
  assert.equal(resp.model, 'MiniMaxAI/MiniMax-M3');
  assert.equal(resp.stopReason, 'end_turn');
  assert.equal(resp.content.length, 1);
  assert.equal(resp.usage.inputTokens, 10);
  assert.equal(resp.usage.outputTokens, 20);
  assert.equal(resp.usage.totalTokens, 30);
  assert.equal(Object.isFrozen(resp), true);
  assert.equal(Object.isFrozen(resp.usage), true);
});

test('createCanonicalStreamChunk validates event types', () => {
  const chunk = createCanonicalStreamChunk(STREAM_EVENT_TYPES.TEXT_DELTA, { index: 0, text: 'abc' });
  assert.equal(chunk.type, 'text_delta');
  assert.equal(chunk.text, 'abc');
  assert.equal(Object.isFrozen(chunk), true);

  assert.throws(() => {
    createCanonicalStreamChunk('invalid_event_type', {});
  }, /Invalid canonical stream chunk type/);
});

test('CanonicalStream helper creates expected chunks', () => {
  const start = CanonicalStream.messageStart('msg_1', 'model_1');
  assert.equal(start.type, 'message_start');
  assert.equal(start.id, 'msg_1');
  assert.equal(start.model, 'model_1');

  const delta = CanonicalStream.textDelta(0, 'hello');
  assert.equal(delta.type, 'text_delta');
  assert.equal(delta.text, 'hello');

  const stop = CanonicalStream.messageStop();
  assert.equal(stop.type, 'message_stop');
});
