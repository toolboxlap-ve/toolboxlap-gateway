// test/unit/logger.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLogger, _internals } from '../../src/logger.js';

test('redactValue replaces top-level secret keys', () => {
  const r = _internals.redactValue({ gmiApiKey: 'sk-abc', localGatewayToken: 'lt', model: 'm' });
  assert.equal(r.gmiApiKey, '[REDACTED]');
  assert.equal(r.localGatewayToken, '[REDACTED]');
  assert.equal(r.model, 'm');
});

test('redactValue recursively scrubs nested objects', () => {
  const r = _internals.redactValue({ headers: { authorization: 'Bearer x', 'x-api-key': 'y', 'content-type': 'json' } });
  assert.equal(r.headers.authorization, '[REDACTED]');
  assert.equal(r.headers['x-api-key'], '[REDACTED]');
  assert.equal(r.headers['content-type'], 'json');
});

test('logger does not emit below threshold', () => {
  const orig = process.stdout.write.bind(process.stdout);
  let called = 0;
  process.stdout.write = (...a) => { called++; return orig(...a); };
  try {
    const log = createLogger('warn');
    log.debug('hidden');
    log.info('hidden');
  } finally {
    process.stdout.write = orig;
  }
  assert.equal(called, 0);
});

test('logger emits info to stdout', () => {
  const chunks = [];
  const orig = process.stdout.write.bind(process.stdout);
  process.stdout.write = (s) => { chunks.push(String(s)); return true; };
  try {
    const log = createLogger('info', 'req-1');
    log.info('hello', { model: 'x', gmiApiKey: 'should-not-appear' });
  } finally {
    process.stdout.write = orig;
  }
  const out = chunks.join('');
  assert.match(out, /req-1/);
  assert.match(out, /hello/);
  assert.match(out, /\[REDACTED\]/);
  assert.doesNotMatch(out, /should-not-appear/);
});

test('logger does not leak Authorization header', () => {
  const chunks = [];
  const orig = process.stdout.write.bind(process.stdout);
  process.stdout.write = (s) => { chunks.push(String(s)); return true; };
  try {
    const log = createLogger('info');
    log.info('req', { headers: { authorization: 'Bearer SUPER-SECRET', 'content-type': 'application/json' } });
  } finally {
    process.stdout.write = orig;
  }
  const out = chunks.join('');
  assert.doesNotMatch(out, /SUPER-SECRET/);
  assert.match(out, /\[REDACTED\]/);
});
