// test/unit/activity.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createActivityTracker } from '../../src/activity.js';

test('start() zeroes counters and freezes uptime at 0 while stopped', () => {
  const t = createActivityTracker();
  t.recordRequest({ status: 200, durationMs: 50, upstreamModel: 'a' });
  t.stop();
  const s = t.getStats();
  assert.equal(s.uptimeMs, 0);
  assert.equal(s.requests, 1);
  t.start();
  const s2 = t.getStats();
  assert.equal(s2.requests, 0);
  assert.equal(s2.uptimeMs >= 0, true);
});

test('recordRequest counts 2xx/3xx as success and 4xx/5xx as errors', () => {
  const t = createActivityTracker();
  t.start();
  t.recordRequest({ status: 200, durationMs: 10, upstreamModel: 'a' });
  t.recordRequest({ status: 301, durationMs: 10, upstreamModel: 'a' });
  t.recordRequest({ status: 404, durationMs: 10, upstreamModel: 'a' });
  t.recordRequest({ status: 500, durationMs: 10, upstreamModel: 'a' });
  const s = t.getStats({ running: true });
  assert.equal(s.requests, 4);
  assert.equal(s.success, 2);
  assert.equal(s.errors, 2);
});

test('avgLatencySec is the mean of recorded latencies', () => {
  const t = createActivityTracker();
  t.start();
  t.recordRequest({ status: 200, durationMs: 100, upstreamModel: 'a' });
  t.recordRequest({ status: 200, durationMs: 300, upstreamModel: 'a' });
  const s = t.getStats();
  assert.equal(s.avgLatencySec, 0.2); // (100+300)/2 ms → 0.2 sec
});

test('recordRequest ignores events without a numeric status', () => {
  const t = createActivityTracker();
  t.start();
  const r = t.recordRequest({ durationMs: 10, upstreamModel: 'a' });
  assert.equal(r, null);
  const s = t.getStats();
  assert.equal(s.requests, 0);
});

test('getActivity returns newest first and caps at the requested limit', () => {
  const t = createActivityTracker();
  for (let i = 0; i < 10; i++) {
    t.recordRequest({ status: 200, durationMs: i + 1, upstreamModel: 'm' + i });
  }
  const a = t.getActivity(3);
  assert.equal(a.length, 3);
  assert.equal(a[0].model, 'm9');
  assert.equal(a[2].model, 'm7');
});

test('clearActivity empties the activity buffer but keeps counters', () => {
  const t = createActivityTracker();
  t.recordRequest({ status: 200, durationMs: 10, upstreamModel: 'a' });
  t.clearActivity();
  assert.equal(t.getActivity(10).length, 0);
  assert.equal(t.getStats().requests, 1);
});

test('getStats propagates running and url', () => {
  const t = createActivityTracker();
  t.start();
  const s = t.getStats({ running: true, url: 'http://127.0.0.1:9999' });
  assert.equal(s.running, true);
  assert.equal(s.url, 'http://127.0.0.1:9999');
});
