// src/canonical/events.js
// Canonical streaming chunk event definitions & factories. Completely provider-agnostic.

export const STREAM_EVENT_TYPES = Object.freeze({
  MESSAGE_START: 'message_start',
  CONTENT_BLOCK_START: 'content_block_start',
  TEXT_DELTA: 'text_delta',
  TOOL_CALL_DELTA: 'tool_call_delta',
  CONTENT_BLOCK_STOP: 'content_block_stop',
  MESSAGE_DELTA: 'message_delta',
  MESSAGE_STOP: 'message_stop',
  ERROR: 'error',
});

/**
 * Create a validated, frozen CanonicalStreamChunk.
 * @param {string} type
 * @param {Record<string, any>} [payload]
 * @returns {Record<string, any>}
 */
export function createCanonicalStreamChunk(type, payload = {}) {
  const validTypes = Object.values(STREAM_EVENT_TYPES);
  if (!validTypes.includes(type)) {
    throw new Error(`Invalid canonical stream chunk type: '${type}'. Expected one of: ${validTypes.join(', ')}`);
  }
  return Object.freeze({
    type,
    ...payload,
  });
}

export const CanonicalStream = {
  messageStart: (id, model) =>
    createCanonicalStreamChunk(STREAM_EVENT_TYPES.MESSAGE_START, { id, model }),

  contentBlockStart: (index, blockType, extra = {}) =>
    createCanonicalStreamChunk(STREAM_EVENT_TYPES.CONTENT_BLOCK_START, { index, blockType, ...extra }),

  textDelta: (index, text) =>
    createCanonicalStreamChunk(STREAM_EVENT_TYPES.TEXT_DELTA, { index, text: String(text || '') }),

  toolCallDelta: (index, argumentsChunk) =>
    createCanonicalStreamChunk(STREAM_EVENT_TYPES.TOOL_CALL_DELTA, { index, argumentsChunk: String(argumentsChunk || '') }),

  contentBlockStop: (index) =>
    createCanonicalStreamChunk(STREAM_EVENT_TYPES.CONTENT_BLOCK_STOP, { index }),

  messageDelta: (stopReason, usage = {}) =>
    createCanonicalStreamChunk(STREAM_EVENT_TYPES.MESSAGE_DELTA, { stopReason, usage }),

  messageStop: () =>
    createCanonicalStreamChunk(STREAM_EVENT_TYPES.MESSAGE_STOP),

  error: (code, message, status = 500) =>
    createCanonicalStreamChunk(STREAM_EVENT_TYPES.ERROR, { code, message, status }),
};
