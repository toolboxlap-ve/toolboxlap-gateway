// src/canonical/response.js
// Canonical internal response model. Completely provider-agnostic.

import { randomUUID } from 'node:crypto';

/**
 * @typedef {Object} CanonicalUsage
 * @property {number} inputTokens
 * @property {number} outputTokens
 * @property {number} totalTokens
 */

/**
 * @typedef {Object} CanonicalResponse
 * @property {string} id
 * @property {string} model
 * @property {Array<import('./request.js').CanonicalContentPart>} content
 * @property {'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence'} stopReason
 * @property {CanonicalUsage} usage
 * @property {Record<string, any>} [rawResponse]
 */

/**
 * Create and validate a CanonicalResponse object.
 * @param {Partial<CanonicalResponse>} data
 * @returns {CanonicalResponse}
 */
export function createCanonicalResponse(data = {}) {
  const id = typeof data.id === 'string' && data.id ? data.id : `msg_${randomUUID().replace(/-/g, '')}`;
  const model = typeof data.model === 'string' ? data.model : '';
  const content = Array.isArray(data.content) ? data.content : [];
  const stopReason = typeof data.stopReason === 'string' ? data.stopReason : 'end_turn';

  const inputTokens = Number.isFinite(data.usage?.inputTokens) ? data.usage.inputTokens : 0;
  const outputTokens = Number.isFinite(data.usage?.outputTokens) ? data.usage.outputTokens : 0;
  const totalTokens = Number.isFinite(data.usage?.totalTokens)
    ? data.usage.totalTokens
    : inputTokens + outputTokens;

  const usage = Object.freeze({
    inputTokens,
    outputTokens,
    totalTokens,
  });

  return Object.freeze({
    id,
    model,
    content,
    stopReason,
    usage,
    rawResponse: data.rawResponse ?? null,
  });
}
