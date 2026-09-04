// test/unit/provider-manifest.test.js
// Unit tests for ProviderManifest and ProviderRegistry manifest integration.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ProviderManifest,
  createProviderManifest,
  validateProviderManifest,
  loadProviderManifest,
} from '../../src/providers/manifest.js';
import { gmiManifest } from '../../src/providers/manifests/gmi.manifest.js';
import { ProviderRegistry, globalProviderRegistry } from '../../src/providers/provider-registry.js';
import { BaseProvider } from '../../src/providers/base-provider.js';
import { gmiProviderAdapter } from '../../src/providers/gmi-provider.js';

class MockProviderWithManifest extends BaseProvider {
  constructor(manifest) {
    super();
    this._manifest = manifest;
  }
  get id() { return this._manifest.id; }
  get displayName() { return this._manifest.displayName; }
  get defaultBaseUrl() { return this._manifest.defaultBaseUrl; }
  get nativeProtocol() { return this._manifest.protocol; }
  get manifest() { return this._manifest; }
}

test('createProviderManifest creates a valid, frozen manifest with defaults', () => {
  const manifest = createProviderManifest({
    id: 'test-llm',
    displayName: 'Test LLM',
    defaultBaseUrl: 'https://api.test-llm.com/v1',
    protocol: 'openai-chat',
    description: 'A test provider description',
  });

  assert.equal(manifest.id, 'test-llm');
  assert.equal(manifest.displayName, 'Test LLM');
  assert.equal(manifest.defaultBaseUrl, 'https://api.test-llm.com/v1');
  assert.equal(manifest.protocol, 'openai-chat');
  assert.equal(manifest.description, 'A test provider description');
  assert.equal(manifest.supportsApiKey, true);
  assert.equal(manifest.supportsModelDiscovery, true);
  assert.equal(manifest.supportsStreaming, true);
  assert.equal(manifest.supportsTools, false);
  assert.equal(manifest.capabilities.maxContextTokens, 128000);
  assert.ok(Object.isFrozen(manifest));
  assert.ok(Object.isFrozen(manifest.capabilities));
});

test('validateProviderManifest detects missing or invalid fields', () => {
  // Empty object
  const res1 = validateProviderManifest({});
  assert.equal(res1.valid, false);
  assert.ok(res1.errors.some((e) => e.includes('id')));
  assert.ok(res1.errors.some((e) => e.includes('displayName')));
  assert.ok(res1.errors.some((e) => e.includes('defaultBaseUrl')));
  assert.ok(res1.errors.some((e) => e.includes('protocol')));

  // Invalid id characters
  const res2 = validateProviderManifest({
    id: 'invalid id with spaces!',
    displayName: 'Invalid',
    defaultBaseUrl: 'https://api.test.com',
    protocol: 'openai-chat',
  });
  assert.equal(res2.valid, false);
  assert.ok(res2.errors.some((e) => e.includes('alphanumeric')));

  // Unsupported protocol
  const res3 = validateProviderManifest({
    id: 'valid-id',
    displayName: 'Valid',
    defaultBaseUrl: 'https://api.test.com',
    protocol: 'unknown-protocol',
  });
  assert.equal(res3.valid, false);
  assert.ok(res3.errors.some((e) => e.includes('protocol')));
});

test('loadProviderManifest loads from object or JSON string', () => {
  const json = JSON.stringify({
    id: 'json-provider',
    displayName: 'JSON Provider',
    defaultBaseUrl: 'https://api.json.com/v1',
    protocol: 'openai-chat',
    website: 'https://json.com',
  });

  const manifest = loadProviderManifest(json);
  assert.equal(manifest.id, 'json-provider');
  assert.equal(manifest.displayName, 'JSON Provider');
  assert.equal(manifest.website, 'https://json.com');

  const reloaded = loadProviderManifest(manifest);
  assert.equal(reloaded, manifest);
});

test('loadProviderManifest throws on malformed JSON', () => {
  assert.throws(() => {
    loadProviderManifest('invalid-json{');
  }, /Failed to parse manifest JSON/);
});

test('ProviderRegistry registers standalone manifests and detects duplicates', () => {
  const reg = new ProviderRegistry();
  const manifest = createProviderManifest({
    id: 'standalone-p1',
    displayName: 'Standalone P1',
    defaultBaseUrl: 'https://p1.test.com',
    protocol: 'openai-chat',
  });

  reg.registerManifest(manifest);
  assert.equal(reg.hasManifest('standalone-p1'), true);
  assert.equal(reg.hasManifest('STANDALONE-P1'), true); // Case-insensitive
  assert.equal(reg.getManifest('standalone-p1'), manifest);

  // Duplicate registration should throw
  assert.throws(() => {
    reg.registerManifest(manifest);
  }, /already registered. Duplicate manifest forbidden/);
});

test('ProviderRegistry enumerates manifests and includes registered providers', () => {
  const reg = new ProviderRegistry();

  // 1. Standalone manifest
  const m1 = createProviderManifest({
    id: 'm1',
    displayName: 'Manifest One',
    defaultBaseUrl: 'https://m1.test',
    protocol: 'openai-chat',
  });
  reg.registerManifest(m1);

  // 2. Provider with manifest
  const m2 = createProviderManifest({
    id: 'm2',
    displayName: 'Manifest Two',
    defaultBaseUrl: 'https://m2.test',
    protocol: 'anthropic',
  });
  const p2 = new MockProviderWithManifest(m2);
  reg.register(p2);

  const list = reg.listManifests();
  assert.equal(list.length, 2);
  assert.equal(list[0].id, 'm1');
  assert.equal(list[1].id, 'm2');
});

test('ProviderRegistry clear removes registered manifests', () => {
  const reg = new ProviderRegistry();
  reg.registerManifest({
    id: 'clear-test',
    displayName: 'Clear Test',
    defaultBaseUrl: 'https://clear.test',
    protocol: 'openai-chat',
  });
  assert.equal(reg.hasManifest('clear-test'), true);
  reg.clear();
  assert.equal(reg.hasManifest('clear-test'), false);
  assert.equal(reg.listManifests().length, 0);
});

test('GMI provider has valid registered manifest in globalProviderRegistry', () => {
  assert.ok(gmiManifest instanceof ProviderManifest);
  assert.equal(gmiManifest.id, 'gmi');
  assert.equal(gmiManifest.displayName, 'GMI Cloud');
  assert.equal(gmiManifest.protocol, 'anthropic');
  assert.equal(gmiManifest.supportsStreaming, true);
  assert.equal(gmiManifest.supportsTools, true);
  assert.equal(gmiManifest.website, 'https://gmi-serving.com');

  assert.equal(globalProviderRegistry.hasManifest('gmi'), true);
  const registeredManifest = globalProviderRegistry.getManifest('gmi');
  assert.equal(registeredManifest.id, 'gmi');
  assert.equal(registeredManifest.displayName, 'GMI Cloud');
});
