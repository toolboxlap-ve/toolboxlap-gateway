// src/canonical/request.js
// Canonical internal request model. Completely provider-agnostic.

import { randomUUID } from 'node:crypto';

/**
 * @typedef {Object} CanonicalTextPart
 * @property {'text'} type
 * @property {string} text
 */

/**
 * @typedef {Object} CanonicalImagePart
 * @property {'image'} type
 * @property {string} mimeType
 * @property {string} base64Data
 */

/**
 * @typedef {Object} CanonicalToolUsePart
 * @property {'tool_use'} type
 * @property {string} id
 * @property {string} name
 * @property {Record<string, any>} input
 */

/**
 * @typedef {Object} CanonicalToolResultPart
 * @property {'tool_result'} type
 * @property {string} toolUseId
 * @property {string} content
 * @property {boolean} [isError]
 */

/**
 * @typedef {CanonicalTextPart | CanonicalImagePart | CanonicalToolUsePart | CanonicalToolResultPart} CanonicalContentPart
 */

/**
 * @typedef {Object} CanonicalMessage
 * @property {'user' | 'assistant' | 'system'} role
 * @property {Array<CanonicalContentPart>} content
 */

/**
 * @typedef {Object} CanonicalTool
 * @property {string} name
 * @property {string} [description]
 * @property {Record<string, any>} inputSchema
 */

/**
 * @typedef {Object} CanonicalRequest
 * @property {string} requestId
 * @property {string} clientModelAlias
 * @property {string} targetModel
 * @property {Array<CanonicalMessage>} messages
 * @property {string|null} systemPrompt
 * @property {Array<CanonicalTool>} tools
 * @property {'auto' | 'any' | { type: 'tool', name: string } | 'none'} toolChoice
 * @property {number|null} maxTokens
 * @property {number|null} temperature
 * @property {number|null} topP
 * @property {boolean} stream
 * @property {Record<string, any>} extraParams
 */

/**
 * Create and validate a CanonicalRequest object.
 * @param {Partial<CanonicalRequest>} data
 * @returns {CanonicalRequest}
 */
export function createCanonicalRequest(data = {}) {
  const requestId = typeof data.requestId === 'string' && data.requestId ? data.requestId : randomUUID();
  const clientModelAlias = typeof data.clientModelAlias === 'string' ? data.clientModelAlias : '';
  const targetModel = typeof data.targetModel === 'string' ? data.targetModel : clientModelAlias;
  const messages = Array.isArray(data.messages) ? data.messages : [];
  const systemPrompt = typeof data.systemPrompt === 'string' ? data.systemPrompt : null;
  const tools = Array.isArray(data.tools) ? data.tools : [];
  const toolChoice = data.toolChoice !== undefined && data.toolChoice !== null ? data.toolChoice : 'auto';
  const stream = data.stream === true;
  const maxTokens = Number.isFinite(data.maxTokens) ? data.maxTokens : null;
  const temperature = Number.isFinite(data.temperature) ? data.temperature : null;
  const topP = Number.isFinite(data.topP) ? data.topP : null;
  const extraParams = data.extraParams && typeof data.extraParams === 'object' ? { ...data.extraParams } : {};

  return Object.freeze({
    requestId,
    clientModelAlias,
    targetModel,
    messages,
    systemPrompt,
    tools,
    toolChoice,
    maxTokens,
    temperature,
    topP,
    stream,
    extraParams,
  });
}
