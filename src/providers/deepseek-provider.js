// src/providers/deepseek-provider.js
// DeepSeek provider adapter extending OpenAICompatibleProvider.

import { OpenAICompatibleProvider } from './openai-compatible-provider.js';
import { deepSeekManifest } from './manifests/deepseek.manifest.js';
import { globalProviderRegistry } from './provider-registry.js';

export class DeepSeekProvider extends OpenAICompatibleProvider {
  /**
   * @param {Object} [options]
   */
  constructor(options = {}) {
    super({
      id: 'deepseek',
      displayName: 'DeepSeek',
      defaultBaseUrl: 'https://api.deepseek.com',
      manifest: deepSeekManifest,
      ...options,
    });
  }

  get id() {
    return 'deepseek';
  }

  get displayName() {
    return 'DeepSeek';
  }

  get defaultBaseUrl() {
    return 'https://api.deepseek.com';
  }

  get manifest() {
    return deepSeekManifest;
  }
}

// Global default singleton instance
export const deepSeekProvider = new DeepSeekProvider();

// Register with global provider registry
if (!globalProviderRegistry.has(deepSeekProvider.id)) {
  globalProviderRegistry.register(deepSeekProvider);
}
