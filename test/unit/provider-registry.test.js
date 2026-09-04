// test/unit/provider-registry.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BaseProvider } from '../../src/providers/base-provider.js';
import { ProviderRegistry } from '../../src/providers/provider-registry.js';

class MockTestProvider extends BaseProvider {
  constructor(id = 'test-mock', name = 'Test Mock') {
    super();
    this._id = id;
    this._name = name;
  }
  get id() { return this._id; }
  get displayName() { return this._name; }
  get defaultBaseUrl() { return 'https://api.mock.test'; }
}

test('ProviderRegistry registers and retrieves a provider instance', () => {
  const reg = new ProviderRegistry();
  const provider = new MockTestProvider('mock-1', 'Mock One');
  reg.register(provider);

  assert.equal(reg.has('mock-1'), true);
  assert.equal(reg.has('MOCK-1'), true); // Case-insensitive
  assert.equal(reg.get('mock-1'), provider);
  assert.equal(reg.get('MOCK-1'), provider);
});

test('ProviderRegistry rejects invalid provider instances', () => {
  const reg = new ProviderRegistry();
  assert.throws(() => {
    reg.register({ id: 'plain-object' });
  }, /Provider must inherit from BaseProvider/);

  assert.throws(() => {
    reg.register(null);
  }, /Provider must inherit from BaseProvider/);
});

test('ProviderRegistry rejects duplicate provider IDs', () => {
  const reg = new ProviderRegistry();
  reg.register(new MockTestProvider('duplicate-id'));
  assert.throws(() => {
    reg.register(new MockTestProvider('DUPLICATE-ID'));
  }, /already registered/);
});

test('ProviderRegistry throws for unknown provider ID with helpful message', () => {
  const reg = new ProviderRegistry();
  reg.register(new MockTestProvider('known-id'));
  assert.throws(() => {
    reg.get('nonexistent');
  }, /Unknown provider: 'nonexistent'. Available providers: \[known-id\]/);
});

test('ProviderRegistry lists registered providers with metadata', () => {
  const reg = new ProviderRegistry();
  reg.register(new MockTestProvider('p1', 'Provider 1'));
  reg.register(new MockTestProvider('p2', 'Provider 2'));

  const list = reg.list();
  assert.equal(list.length, 2);
  assert.equal(list[0].id, 'p1');
  assert.equal(list[0].displayName, 'Provider 1');
  assert.equal(list[1].id, 'p2');
  assert.equal(list[1].displayName, 'Provider 2');
});

test('ProviderRegistry clear removes all registered providers', () => {
  const reg = new ProviderRegistry();
  reg.register(new MockTestProvider('p1'));
  assert.equal(reg.has('p1'), true);
  reg.clear();
  assert.equal(reg.has('p1'), false);
  assert.equal(reg.list().length, 0);
});
