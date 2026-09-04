// src/providers/base-provider.js
// BaseProvider abstract class defining the uniform Provider SDK contract.

import { createProviderManifest } from './manifest.js';

/**
 * @typedef {Object} ProviderCapabilities
 * @property {boolean} streaming
 * @property {boolean} tools
 * @property {boolean} toolChoice
 * @property {boolean} parallelToolCalls
 * @property {boolean} vision
 * @property {boolean} systemPrompts
 * @property {boolean} thinking
 * @property {number} maxContextTokens
 */

/**
 * @typedef {Object} ProviderExecutionContext
 * @property {string} apiKey
 * @property {string} baseUrl
 * @property {number} timeoutMs
 * @property {Record<string, string>} [extraHeaders]
 * @property {object} [logger]
 */

/**
 * @typedef {Object} ProviderTestResult
 * @property {boolean} ok
 * @property {'invalid-key' | 'network-error' | 'upstream-error' | 'not-configured'} [reason]
 * @property {number} [status]
 * @property {string} [error]
 */

export class BaseProvider {
  /**
   * Unique machine identifier for this provider (e.g. 'gmi', 'openrouter', 'deepseek').
   * @returns {string}
   */
  get id() {
    return '';
  }

  /**
   * Human-readable display name (e.g. 'GMI Cloud', 'DeepSeek').
   * @returns {string}
   */
  get displayName() {
    return '';
  }

  /**
   * Default upstream base URL.
   * @returns {string}
   */
  get defaultBaseUrl() {
    return '';
  }

  /**
   * Native upstream protocol ('anthropic' | 'openai-chat' | 'custom').
   * @returns {'anthropic' | 'openai-chat' | 'custom'}
   */
  get nativeProtocol() {
    return 'custom';
  }

  /**
   * Static capabilities supported by this provider.
   * @returns {ProviderCapabilities}
   */
  get capabilities() {
    return Object.freeze({
      streaming: true,
      tools: true,
      toolChoice: true,
      parallelToolCalls: false,
      vision: false,
      systemPrompts: true,
      thinking: false,
      maxContextTokens: 128000,
    });
  }

  /**
   * Return the ProviderManifest describing this provider.
   * @returns {import('./manifest.js').ProviderManifest}
   */
  get manifest() {
    if (this._manifest) return this._manifest;
    return createProviderManifest({
      id: this.id || 'unknown',
      displayName: this.displayName || this.id || 'Unknown',
      defaultBaseUrl: this.defaultBaseUrl || '',
      protocol: this.nativeProtocol || 'custom',
      capabilities: this.capabilities,
    });
  }

  /**
   * Validate provider configuration.
   * @param {Record<string, any>} [config]
   * @returns {{ valid: boolean, errors?: string[] }}
   */
  validateConfig(config = {}) {
    return { valid: true };
  }

  /**
   * Test connection and credentials.
   * @param {string} apiKey
   * @param {string} baseUrl
   * @returns {Promise<ProviderTestResult>}
   */
  async testConnection(apiKey, baseUrl) {
    throw new Error('Not implemented');
  }

  /**
   * Fetch available models from the provider.
   * @param {string} apiKey
   * @param {string} baseUrl
   * @returns {Promise<Array<{id: string, name: string, contextLength?: number}>>}
   */
  async fetchModels(apiKey, baseUrl) {
    throw new Error('Not implemented');
  }

  /**
   * Execute non-streaming completion.
   * @param {import('../canonical/request.js').CanonicalRequest} request
   * @param {ProviderExecutionContext} context
   * @param {AbortSignal} [signal]
   * @returns {Promise<import('../canonical/response.js').CanonicalResponse>}
   */
  async execute(request, context, signal) {
    throw new Error('Not implemented');
  }

  /**
   * Execute streaming completion.
   * @param {import('../canonical/request.js').CanonicalRequest} request
   * @param {ProviderExecutionContext} context
   * @param {AbortSignal} [signal]
   * @returns {Promise<AsyncIterable<import('../canonical/events.js').CanonicalStreamChunk>>}
   */
  async stream(request, context, signal) {
    throw new Error('Not implemented');
  }
}
