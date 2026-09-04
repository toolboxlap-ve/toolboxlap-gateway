// src/providers/provider-registry.js
// Central Provider Registry for managing provider adapters and manifests.

import { BaseProvider } from './base-provider.js';
import { ProviderManifest, loadProviderManifest } from './manifest.js';

export class ProviderRegistry {
  constructor() {
    /** @type {Map<string, BaseProvider>} */
    this._providers = new Map();
    /** @type {Map<string, ProviderManifest>} */
    this._manifests = new Map();
  }

  /**
   * Register a standalone provider manifest.
   * @param {ProviderManifest | Record<string, any>} manifestSource
   * @returns {ProviderManifest}
   */
  registerManifest(manifestSource) {
    const manifest = loadProviderManifest(manifestSource);
    const normalizedId = manifest.id.toLowerCase();
    if (this._manifests.has(normalizedId)) {
      throw new Error(`Manifest with id '${manifest.id}' is already registered. Duplicate manifest forbidden.`);
    }
    this._manifests.set(normalizedId, manifest);
    return manifest;
  }

  /**
   * Register a provider instance.
   * @param {BaseProvider} provider
   */
  register(provider) {
    if (!provider || !(provider instanceof BaseProvider)) {
      throw new TypeError('Provider must inherit from BaseProvider.');
    }
    const id = provider.id;
    if (!id || typeof id !== 'string' || !/^[a-z0-9-_]+$/i.test(id)) {
      throw new Error(`Invalid provider id: '${id}'. Must be a non-empty alphanumeric string.`);
    }
    const normalizedId = id.toLowerCase();
    if (this._providers.has(normalizedId)) {
      throw new Error(`Provider with id '${id}' is already registered. Duplicate registration forbidden.`);
    }
    this._providers.set(normalizedId, provider);

    // Automatically register provider's manifest if available
    if (provider.manifest && !this._manifests.has(normalizedId)) {
      try {
        const manifest = loadProviderManifest(provider.manifest);
        this._manifests.set(normalizedId, manifest);
      } catch {
        // Fallback: ignore manifest registration failure on custom provider instances
      }
    }
  }

  /**
   * Retrieve a provider by id (case-insensitive).
   * @param {string} id
   * @returns {BaseProvider}
   */
  get(id) {
    if (!id || typeof id !== 'string') {
      throw new Error(`Invalid provider id: '${id}'. Must be a non-empty string.`);
    }
    const normalizedId = id.toLowerCase();
    const provider = this._providers.get(normalizedId);
    if (!provider) {
      const available = Array.from(this._providers.keys()).join(', ') || 'none';
      throw new Error(`Unknown provider: '${id}'. Available providers: [${available}].`);
    }
    return provider;
  }

  /**
   * Check if a provider is registered.
   * @param {string} id
   * @returns {boolean}
   */
  has(id) {
    if (!id || typeof id !== 'string') return false;
    return this._providers.has(id.toLowerCase());
  }

  /**
   * Retrieve a provider manifest by id (case-insensitive).
   * @param {string} id
   * @returns {ProviderManifest | null}
   */
  getManifest(id) {
    if (!id || typeof id !== 'string') return null;
    const normalizedId = id.toLowerCase();
    return this._manifests.get(normalizedId) || this._providers.get(normalizedId)?.manifest || null;
  }

  /**
   * Check if a provider manifest is registered.
   * @param {string} id
   * @returns {boolean}
   */
  hasManifest(id) {
    if (!id || typeof id !== 'string') return false;
    const normalizedId = id.toLowerCase();
    return this._manifests.has(normalizedId) || this._providers.has(normalizedId);
  }

  /**
   * List all registered provider manifests.
   * @returns {Array<ProviderManifest>}
   */
  listManifests() {
    const map = new Map(this._manifests);
    for (const [id, provider] of this._providers) {
      if (!map.has(id) && provider.manifest) {
        map.set(id, provider.manifest);
      }
    }
    return Array.from(map.values());
  }

  /**
   * List metadata for all registered providers (backward compatible).
   * @returns {Array<{ id: string, displayName: string, defaultBaseUrl: string, nativeProtocol: string, capabilities: object }>}
   */
  list() {
    return Array.from(this._providers.values()).map((p) => ({
      id: p.id,
      displayName: p.displayName,
      defaultBaseUrl: p.defaultBaseUrl,
      nativeProtocol: p.nativeProtocol,
      capabilities: p.capabilities,
    }));
  }

  /**
   * Clear all registered providers and manifests (primarily for tests).
   */
  clear() {
    this._providers.clear();
    this._manifests.clear();
  }
}

// Global shared singleton instance
export const globalProviderRegistry = new ProviderRegistry();
