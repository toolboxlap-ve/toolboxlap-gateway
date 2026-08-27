// test/unit/config.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadConfig,
  isDevMode,
  isLoopbackHost,
  isStrongGatewayToken,
  validateExposureConfig,
} from '../../src/config.js';

test('loadConfig uses defaults when env is empty', () => {
  const cfg = loadConfig({});
  assert.equal(cfg.host, '127.0.0.1');
  assert.equal(cfg.port, 8787);
  assert.equal(cfg.gmiBaseUrl, 'https://api.gmi-serving.com');
  assert.equal(cfg.gmiApiKey, null);
  assert.equal(cfg.claudeModelAlias, 'claude-opus-5');
  assert.equal(cfg.upstreamModel, 'MiniMaxAI/MiniMax-M3');
  assert.equal(cfg.localGatewayToken, null);
  assert.equal(cfg.logLevel, 'info');
});

test('loadConfig trims trailing slashes on GMI_BASE_URL', () => {
  const cfg = loadConfig({ GMI_BASE_URL: 'https://api.gmi-serving.com///' });
  assert.equal(cfg.gmiBaseUrl, 'https://api.gmi-serving.com');
});

test('loadConfig rejects non-http base URL', () => {
  assert.throws(() => loadConfig({ GMI_BASE_URL: 'ftp://example' }), /Invalid GMI_BASE_URL/);
});

test('loadConfig rejects out-of-range port', () => {
  assert.throws(() => loadConfig({ PORT: '99999' }), /Invalid PORT/);
});

test('isDevMode true for localhost + no token', () => {
  const cfg = loadConfig({ HOST: '127.0.0.1', LOCAL_GATEWAY_TOKEN: '' });
  assert.equal(isDevMode(cfg), true);
});

test('isDevMode false when token is set', () => {
  const cfg = loadConfig({ HOST: '127.0.0.1', LOCAL_GATEWAY_TOKEN: 'secret' });
  assert.equal(isDevMode(cfg), false);
});

test('isDevMode false when bound to non-loopback', () => {
  const cfg = loadConfig({ HOST: '0.0.0.0', LOCAL_GATEWAY_TOKEN: '' });
  assert.equal(isDevMode(cfg), false);
});

test('loadConfig freezes the returned object', () => {
  const cfg = loadConfig({});
  assert.equal(Object.isFrozen(cfg), true);
});

test('loadConfig reads LOCAL_GATEWAY_TOKEN and GMI_API_KEY', () => {
  const cfg = loadConfig({ GMI_API_KEY: 'sk-abc', LOCAL_GATEWAY_TOKEN: 'local-xyz' });
  assert.equal(cfg.gmiApiKey, 'sk-abc');
  assert.equal(cfg.localGatewayToken, 'local-xyz');
});

test('loopback detection accepts IPv4, hostname, and IPv6 loopback only', () => {
  assert.equal(isLoopbackHost('127.0.0.1'), true);
  assert.equal(isLoopbackHost('localhost'), true);
  assert.equal(isLoopbackHost('::1'), true);
  assert.equal(isLoopbackHost('[::1]'), true);
  assert.equal(isLoopbackHost('0.0.0.0'), false);
  assert.equal(isLoopbackHost('192.168.1.20'), false);
});

test('non-loopback exposure fails closed without a strong token', () => {
  assert.throws(
    () => validateExposureConfig({ host: '0.0.0.0', localGatewayToken: null }),
    /Refusing non-loopback bind/,
  );
  assert.throws(
    () => validateExposureConfig({ host: '0.0.0.0', localGatewayToken: 'toolboxlap' }),
    /localhost-only/,
  );
  assert.throws(
    () => validateExposureConfig({ host: '192.168.1.20', localGatewayToken: 'too-short' }),
    /at least 24 characters/,
  );
});

test('loopback remains open-capable and non-loopback accepts a strong token', () => {
  assert.doesNotThrow(() => validateExposureConfig({ host: '127.0.0.1', localGatewayToken: null }));
  assert.equal(isStrongGatewayToken('tb_0123456789abcdef0123456789abcdef'), true);
  assert.doesNotThrow(() => validateExposureConfig({
    host: '0.0.0.0',
    localGatewayToken: 'tb_0123456789abcdef0123456789abcdef',
  }));
});
