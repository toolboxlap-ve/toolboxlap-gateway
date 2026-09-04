// src/providers/manifest.js
// Provider Manifest model, validation, and factory functions.

export const SUPPORTED_PROTOCOLS = Object.freeze(['anthropic', 'openai-chat', 'custom']);

/**
 * Validate a ProviderManifest object.
 * @param {Record<string, any>} data
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateProviderManifest(data) {
  const errors = [];
  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['Manifest must be a non-null object.'] };
  }

  // id: required, alphanumeric with hyphens or underscores
  if (!data.id || typeof data.id !== 'string') {
    errors.push("Field 'id' is required and must be a non-empty string.");
  } else if (!/^[a-z0-9-_]+$/i.test(data.id)) {
    errors.push(`Field 'id' '${data.id}' must only contain alphanumeric characters, hyphens, or underscores.`);
  }

  // displayName: required string
  if (!data.displayName || typeof data.displayName !== 'string') {
    errors.push("Field 'displayName' is required and must be a non-empty string.");
  }

  // defaultBaseUrl: required string
  if (!data.defaultBaseUrl || typeof data.defaultBaseUrl !== 'string') {
    errors.push("Field 'defaultBaseUrl' is required and must be a non-empty string.");
  }

  // protocol: required and one of SUPPORTED_PROTOCOLS
  if (!data.protocol || typeof data.protocol !== 'string') {
    errors.push("Field 'protocol' is required and must be a non-empty string.");
  } else if (!SUPPORTED_PROTOCOLS.includes(data.protocol)) {
    errors.push(`Field 'protocol' must be one of: ${SUPPORTED_PROTOCOLS.join(', ')}. Got '${data.protocol}'.`);
  }

  // website & documentationUrl: optional strings
  if (data.website != null && typeof data.website !== 'string') {
    errors.push("Field 'website' must be a string if provided.");
  }
  if (data.documentationUrl != null && typeof data.documentationUrl !== 'string') {
    errors.push("Field 'documentationUrl' must be a string if provided.");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export class ProviderManifest {
  /**
   * @param {Record<string, any>} data
   */
  constructor(data = {}) {
    const validation = validateProviderManifest(data);
    if (!validation.valid) {
      throw new Error(`Invalid provider manifest: ${validation.errors.join('; ')}`);
    }

    this.id = data.id.toLowerCase();
    this.displayName = String(data.displayName);
    this.description = typeof data.description === 'string' ? data.description : '';
    this.website = typeof data.website === 'string' ? data.website : '';
    this.documentationUrl = typeof data.documentationUrl === 'string' ? data.documentationUrl : '';
    this.defaultBaseUrl = String(data.defaultBaseUrl).replace(/\/+$/, '');
    this.protocol = data.protocol;
    this.icon = typeof data.icon === 'string' ? data.icon : '';

    const caps = data.capabilities || {};
    this.capabilities = Object.freeze({
      streaming: caps.streaming !== false,
      tools: Boolean(caps.tools),
      toolChoice: Boolean(caps.toolChoice),
      parallelToolCalls: Boolean(caps.parallelToolCalls),
      vision: Boolean(caps.vision),
      systemPrompts: caps.systemPrompts !== false,
      thinking: Boolean(caps.thinking),
      reasoning: Boolean(caps.reasoning),
      maxContextTokens: Number.isInteger(caps.maxContextTokens) ? caps.maxContextTokens : 128000,
    });

    this.supportsApiKey = data.supportsApiKey !== false;
    this.supportsModelDiscovery = data.supportsModelDiscovery !== false;
    this.supportsStreaming = data.supportsStreaming != null ? Boolean(data.supportsStreaming) : this.capabilities.streaming;
    this.supportsVision = data.supportsVision != null ? Boolean(data.supportsVision) : this.capabilities.vision;
    this.supportsTools = data.supportsTools != null ? Boolean(data.supportsTools) : this.capabilities.tools;
    this.supportsThinking = data.supportsThinking != null ? Boolean(data.supportsThinking) : this.capabilities.thinking;
    this.supportsReasoning = data.supportsReasoning != null ? Boolean(data.supportsReasoning) : this.capabilities.reasoning;

    this.metadata = Object.freeze({ ...(data.metadata || {}) });
    Object.freeze(this);
  }
}

/**
 * Create a validated, immutable ProviderManifest instance.
 * @param {Record<string, any>} data
 * @returns {ProviderManifest}
 */
export function createProviderManifest(data) {
  return new ProviderManifest(data);
}

/**
 * Load a manifest from an object or JSON string.
 * @param {string | Record<string, any>} source
 * @returns {ProviderManifest}
 */
export function loadProviderManifest(source) {
  if (typeof source === 'string') {
    let parsed;
    try {
      parsed = JSON.parse(source);
    } catch (e) {
      throw new Error(`Failed to parse manifest JSON: ${e.message}`);
    }
    return createProviderManifest(parsed);
  }
  if (source instanceof ProviderManifest) {
    return source;
  }
  return createProviderManifest(source);
}
