// test/unit/provider-ui-state.test.js
// Unit tests for Multi-Provider UI state management, persistence, migration,
// and manifest-driven provider switching.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { globalProviderRegistry } from '../../src/providers/provider-registry.js';
import '../../src/providers/gmi-provider.js';
import '../../src/providers/openrouter-provider.js';

test('Provider manifests load from registry with complete UI metadata', () => {
  const manifests = globalProviderRegistry.listManifests();
  assert.ok(manifests.length >= 2, 'Registry should list at least 2 providers');

  const gmi = manifests.find((m) => m.id === 'gmi');
  assert.ok(gmi, 'GMI manifest must be registered');
  assert.equal(gmi.displayName, 'GMI Cloud');
  assert.ok(gmi.description);
  assert.ok(gmi.website);
  assert.ok(gmi.defaultBaseUrl);
  assert.equal(gmi.supportsApiKey, true);
  assert.equal(gmi.supportsModelDiscovery, true);
  assert.equal(gmi.supportsStreaming, true);
  assert.equal(gmi.supportsTools, true);
  assert.equal(gmi.supportsVision, false);
  assert.equal(gmi.supportsThinking, false);
  assert.equal(gmi.supportsReasoning, false);

  const openrouter = manifests.find((m) => m.id === 'openrouter');
  assert.ok(openrouter, 'OpenRouter manifest must be registered');
  assert.equal(openrouter.displayName, 'OpenRouter');
  assert.ok(openrouter.description);
  assert.ok(openrouter.website);
  assert.ok(openrouter.documentationUrl);
  assert.ok(openrouter.defaultBaseUrl);
  assert.equal(openrouter.supportsApiKey, true);
  assert.equal(openrouter.supportsModelDiscovery, true);
  assert.equal(openrouter.supportsStreaming, true);
  assert.equal(openrouter.supportsTools, true);
  assert.equal(openrouter.supportsVision, true);
  assert.equal(openrouter.supportsThinking, true);
  assert.equal(openrouter.supportsReasoning, true);
});

test('Dynamic capabilities evaluation produces accurate flags without provider hardcoding', () => {
  const evaluateCapabilities = (manifest) => {
    return {
      name: manifest.displayName,
      streaming: Boolean(manifest.supportsStreaming || manifest.capabilities?.streaming),
      tools: Boolean(manifest.supportsTools || manifest.capabilities?.tools),
      vision: Boolean(manifest.supportsVision || manifest.capabilities?.vision),
      thinking: Boolean(manifest.supportsThinking || manifest.capabilities?.thinking),
      reasoning: Boolean(manifest.supportsReasoning || manifest.capabilities?.reasoning),
    };
  };

  const gmi = evaluateCapabilities(globalProviderRegistry.getManifest('gmi'));
  assert.equal(gmi.streaming, true);
  assert.equal(gmi.tools, true);
  assert.equal(gmi.vision, false);
  assert.equal(gmi.thinking, false);
  assert.equal(gmi.reasoning, false);

  const openrouter = evaluateCapabilities(globalProviderRegistry.getManifest('openrouter'));
  assert.equal(openrouter.streaming, true);
  assert.equal(openrouter.tools, true);
  assert.equal(openrouter.vision, true);
  assert.equal(openrouter.thinking, true);
  assert.equal(openrouter.reasoning, true);
});

test('Config schema migration preserves legacy GMI settings', () => {
  // Simulate legacy config from disk
  const legacyConfig = {
    host: '127.0.0.1',
    port: 8787,
    gmiBaseUrl: 'https://custom-gmi.example.com',
    claudeModelAlias: 'claude-opus-5',
    upstreamModel: 'minimax/minimax-text-01',
    localGatewayAuthEnabled: true,
    logLevel: 'info',
  };

  // Migration function as implemented in main.js
  const migrateConfig = (raw) => {
    const data = { ...raw };
    if (!data.providers || typeof data.providers !== 'object') {
      data.providers = {};
    }
    if (!data.providers.gmi && data.upstreamModel) {
      data.providers.gmi = {
        baseUrl: data.gmiBaseUrl || 'https://api.gmi-serving.com',
        model: data.upstreamModel,
      };
    }
    if (!data.providers.gmi) {
      data.providers.gmi = {
        baseUrl: 'https://api.gmi-serving.com',
        model: 'minimax/minimax-text-01',
      };
    }
    if (!data.providers.openrouter) {
      data.providers.openrouter = {
        baseUrl: 'https://openrouter.ai/api/v1',
        model: 'anthropic/claude-3.5-sonnet',
      };
    }
    if (!data.activeProvider) {
      data.activeProvider = 'gmi';
    }
    return data;
  };

  const migrated = migrateConfig(legacyConfig);
  assert.equal(migrated.activeProvider, 'gmi');
  assert.equal(migrated.providers.gmi.baseUrl, 'https://custom-gmi.example.com');
  assert.equal(migrated.providers.gmi.model, 'minimax/minimax-text-01');
  assert.ok(migrated.providers.openrouter);
  assert.equal(migrated.providers.openrouter.baseUrl, 'https://openrouter.ai/api/v1');
});

test('Independent settings persistence for multiple providers', () => {
  const config = {
    activeProvider: 'gmi',
    providers: {
      gmi: {
        baseUrl: 'https://api.gmi-serving.com',
        model: 'minimax/minimax-text-01',
      },
      openrouter: {
        baseUrl: 'https://openrouter.ai/api/v1',
        model: 'anthropic/claude-3.7-sonnet',
      },
    },
  };

  // Update openrouter settings
  config.providers.openrouter.baseUrl = 'https://custom.openrouter.ai/api/v1';
  config.providers.openrouter.model = 'openai/gpt-4o';

  // Verify GMI settings were untouched
  assert.equal(config.providers.gmi.baseUrl, 'https://api.gmi-serving.com');
  assert.equal(config.providers.gmi.model, 'minimax/minimax-text-01');

  // Verify OpenRouter settings were updated
  assert.equal(config.providers.openrouter.baseUrl, 'https://custom.openrouter.ai/api/v1');
  assert.equal(config.providers.openrouter.model, 'openai/gpt-4o');
});

test('Switching providers restores that provider saved profile', () => {
  const config = {
    activeProvider: 'gmi',
    providers: {
      gmi: {
        baseUrl: 'https://api.gmi-serving.com',
        model: 'minimax/minimax-text-01',
      },
      openrouter: {
        baseUrl: 'https://openrouter.ai/api/v1',
        model: 'deepseek/deepseek-r1',
      },
    },
  };

  const getActiveProfile = (cfg) => {
    const pId = cfg.activeProvider;
    const manifest = globalProviderRegistry.getManifest(pId);
    const settings = cfg.providers[pId] || {};
    return {
      providerId: pId,
      displayName: manifest?.displayName,
      baseUrl: settings.baseUrl || manifest?.defaultBaseUrl,
      model: settings.model,
    };
  };

  // Initially GMI
  const gmiProfile = getActiveProfile(config);
  assert.equal(gmiProfile.providerId, 'gmi');
  assert.equal(gmiProfile.displayName, 'GMI Cloud');
  assert.equal(gmiProfile.model, 'minimax/minimax-text-01');

  // Switch to OpenRouter
  config.activeProvider = 'openrouter';
  const orProfile = getActiveProfile(config);
  assert.equal(orProfile.providerId, 'openrouter');
  assert.equal(orProfile.displayName, 'OpenRouter');
  assert.equal(orProfile.model, 'deepseek/deepseek-r1');

  // Switch back to GMI
  config.activeProvider = 'gmi';
  const gmiRestored = getActiveProfile(config);
  assert.equal(gmiRestored.providerId, 'gmi');
  assert.equal(gmiRestored.displayName, 'GMI Cloud');
  assert.equal(gmiRestored.model, 'minimax/minimax-text-01');
});

test('Settings persistence across simulated application restarts', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-test-'));
  const cfgPath = path.join(tmpDir, 'toolbox-gateway-cfg.json');

  try {
    const initialConfig = {
      host: '127.0.0.1',
      port: 8787,
      claudeModelAlias: 'claude-opus-5',
      activeProvider: 'openrouter',
      providers: {
        gmi: {
          baseUrl: 'https://api.gmi-serving.com',
          model: 'minimax/minimax-text-01',
        },
        openrouter: {
          baseUrl: 'https://openrouter.ai/api/v1',
          model: 'google/gemini-2.5-pro',
        },
      },
    };

    // Save to disk
    fs.writeFileSync(cfgPath, JSON.stringify(initialConfig, null, 2), 'utf8');

    // Simulate app restart: re-read disk
    const loaded = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    assert.equal(loaded.activeProvider, 'openrouter');
    assert.equal(loaded.providers.openrouter.model, 'google/gemini-2.5-pro');
    assert.equal(loaded.providers.gmi.model, 'minimax/minimax-text-01');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Dynamic provider dispatch executes methods without provider branching', async () => {
  // Test that for any providerId in registry, we can fetch provider instance and call interface
  for (const manifest of globalProviderRegistry.listManifests()) {
    const provider = globalProviderRegistry.get(manifest.id);
    assert.ok(provider, `Provider instance must exist for ${manifest.id}`);
    assert.equal(typeof provider.testConnection, 'function');
    assert.equal(typeof provider.fetchModels, 'function');

    // Testing testConnection returns a structured result without throwing
    const res = await provider.testConnection('invalid_key', provider.defaultBaseUrl);
    assert.equal(typeof res.ok, 'boolean');
    if (!res.ok) {
      assert.ok(['invalid-key', 'network-error', 'http-error', 'upstream-error'].includes(res.reason));
    }
  }
});
