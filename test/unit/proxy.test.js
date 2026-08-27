// test/unit/proxy.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  rewriteModel,
  resolveAlias,
  isStreamRequest,
  buildMessagesUrl,
} from '../../src/proxy.js';

test('rewriteModel replaces model field without mutating input', () => {
  const body = { model: 'claude-opus-5', messages: [{ role: 'user', content: 'hi' }] };
  const out = rewriteModel(body, 'MiniMaxAI/MiniMax-M3');
  assert.equal(out.model, 'MiniMaxAI/MiniMax-M3');
  assert.equal(body.model, 'claude-opus-5');
  assert.deepEqual(out.messages, body.messages);
});

test('resolveAlias accepts the configured alias', () => {
  const r1 = resolveAlias({ model: 'claude-opus-5' }, 'claude-opus-5');
  assert.deepEqual(r1, { ok: true, alias: 'claude-opus-5' });
});

test('resolveAlias accepts legacy claude-sonnet-4-6 alias', () => {
  const r2 = resolveAlias({ model: 'claude-sonnet-4-6' }, 'claude-opus-5');
  assert.deepEqual(r2, { ok: true, alias: 'claude-sonnet-4-6' });
});

test('resolveAlias rejects a different model', () => {
  const r = resolveAlias({ model: 'gpt-4' }, 'claude-opus-5');
  assert.equal(r.ok, false);
  assert.match(r.reason, /unsupported model/);
});

test('resolveAlias rejects missing model', () => {
  const r = resolveAlias({}, 'claude-opus-5');
  assert.equal(r.ok, false);
  assert.match(r.reason, /missing required field/);
});

test('resolveAlias rejects non-object', () => {
  assert.equal(resolveAlias(null, 'claude-opus-5').ok, false);
  assert.equal(resolveAlias('x', 'claude-opus-5').ok, false);
});

test('isStreamRequest true only when stream:true', () => {
  assert.equal(isStreamRequest({ stream: true }), true);
  assert.equal(isStreamRequest({ stream: false }), false);
  assert.equal(isStreamRequest({}), false);
  assert.equal(isStreamRequest(null), false);
});

test('buildMessagesUrl appends /v1/messages and strips trailing slashes', () => {
  assert.equal(buildMessagesUrl('https://api.gmi-serving.com'), 'https://api.gmi-serving.com/v1/messages');
  assert.equal(buildMessagesUrl('https://api.gmi-serving.com///'), 'https://api.gmi-serving.com/v1/messages');
});
