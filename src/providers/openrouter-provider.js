// src/providers/openrouter-provider.js
// OpenRouter provider adapter extending OpenAICompatibleProvider.

import { OpenAICompatibleProvider } from './openai-compatible-provider.js';
import { openRouterManifest } from './manifests/openrouter.manifest.js';
import { globalProviderRegistry } from './provider-registry.js';

export class OpenRouterProvider extends OpenAICompatibleProvider {
  /**
   * @param {Object} [options]
   */
  constructor(options = {}) {
    super({
      id: 'openrouter',
      displayName: 'OpenRouter',
      defaultBaseUrl: 'https://openrouter.ai/api/v1',
      manifest: openRouterManifest,
      ...options,
    });
  }

  get id() {
    return 'openrouter';
  }

  get displayName() {
    return 'OpenRouter';
  }

  get defaultBaseUrl() {
    return 'https://openrouter.ai/api/v1';
  }

  get manifest() {
    return openRouterManifest;
  }

  /**
   * Build request headers including OpenRouter-specific attribution headers.
   * @param {string} [apiKey]
   * @param {Record<string, string>} [extraHeaders]
   * @returns {Record<string, string>}
   */
  getDefaultHeaders(apiKey, extraHeaders = {}) {
    const headers = super.getDefaultHeaders(apiKey, extraHeaders);
    if (!headers['HTTP-Referer']) {
      headers['HTTP-Referer'] = 'https://github.com/Toolbox-Gateway';
    }
    if (!headers['X-Title']) {
      headers['X-Title'] = 'TOOLBOXLAP Gateway';
    }
    return headers;
  }

  /**
   * Fetch and normalize models from OpenRouter's model discovery endpoint.
   * @param {string} [apiKey]
   * @param {string} [baseUrl]
   * @param {Object} [options]
   * @returns {Promise<Array<{id: string, name: string, description?: string, contextLength?: number, pricing?: object}>>}
   */
  async fetchModels(apiKey, baseUrl, options = {}) {
    const url = this.buildModelsUrl(baseUrl);
    const headers = this.getDefaultHeaders(apiKey, options.extraHeaders);
    const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 15000;
    const { signal, cleanup, isTimeout } = this._createCombinedSignal(options.signal, timeoutMs);

    let res;
    try {
      res = await fetch(url, {
        method: 'GET',
        headers,
        signal,
      });
    } catch (e) {
      cleanup();
      if (isTimeout()) {
        const err = new Error('upstream timeout');
        err.code = 'UPSTREAM_TIMEOUT';
        err.status = 504;
        throw err;
      }
      const err = new Error(`Failed to fetch OpenRouter models: ${e?.message || e}`);
      err.code = 'UPSTREAM_CONNECT_FAIL';
      err.status = 502;
      throw err;
    } finally {
      cleanup();
    }

    if (!res.ok) {
      throw await this._handleErrorResponse(res);
    }

    const json = await res.json();
    const rawList = Array.isArray(json) ? json : (Array.isArray(json?.data) ? json.data : []);

    return rawList.map((m) => ({
      id: m.id,
      name: m.name || m.id,
      description: m.description || '',
      ...(m.context_length ? { contextLength: m.context_length } : {}),
      ...(m.pricing ? {
        pricing: {
          prompt: m.pricing.prompt,
          completion: m.pricing.completion,
        },
      } : {}),
    }));
  }

  /**
   * Test connection and credentials.
   * Probes /auth/key when apiKey is present for precise credential verification.
   * @param {string} [apiKey]
   * @param {string} [baseUrl]
   * @param {Object} [options]
   * @returns {Promise<import('./base-provider.js').ProviderTestResult>}
   */
  async testConnection(apiKey, baseUrl, options = {}) {
    if (apiKey) {
      const base = (baseUrl || this.defaultBaseUrl).replace(/\/+$/, '');
      const url = base.endsWith('/v1') ? `${base}/auth/key` : `${base}/v1/auth/key`;
      const headers = this.getDefaultHeaders(apiKey, options.extraHeaders);
      const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 10000;
      const { signal, cleanup } = this._createCombinedSignal(options.signal, timeoutMs);

      try {
        const res = await fetch(url, {
          method: 'GET',
          headers,
          signal,
        });
        cleanup();

        if (res.status === 200) {
          return { ok: true };
        }
        if (res.status === 401 || res.status === 403) {
          return { ok: false, reason: 'invalid-key', status: res.status };
        }
        return { ok: false, reason: 'upstream-error', status: res.status };
      } catch (e) {
        cleanup();
        return { ok: false, reason: 'network-error', error: e?.message || String(e) };
      }
    }

    return super.testConnection(apiKey, baseUrl, options);
  }
}

// Global default singleton instance
export const openRouterProvider = new OpenRouterProvider();

// Register with global provider registry
if (!globalProviderRegistry.has(openRouterProvider.id)) {
  globalProviderRegistry.register(openRouterProvider);
}
