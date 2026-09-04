// src/protocols/openai/index.js
// Concrete OpenAI Chat Completion Protocol implementation.

import { BaseProtocolTranslator } from '../base-protocol.js';
import { canonicalToOpenAiRequest } from './request-translator.js';
import { openAiToCanonicalResponse, mapFinishReason } from './response-translator.js';
import {
  streamOpenAiToCanonical,
  canonicalChunkToOpenAiSse,
  openAiChunkToCanonicalEvents,
  createOpenAiStreamState,
} from './stream-translator.js';

export class OpenAiChatProtocol extends BaseProtocolTranslator {
  get name() {
    return 'openai-chat';
  }

  /**
   * Format a CanonicalRequest into an OpenAI /v1/chat/completions payload.
   * @param {import('../../canonical/request.js').CanonicalRequest} request
   * @returns {Record<string, any>}
   */
  formatRequest(request) {
    return canonicalToOpenAiRequest(request);
  }

  /**
   * Parse an OpenAI Chat Completion response into a CanonicalResponse.
   * @param {Record<string, any>} wireResponse
   * @param {string} [targetModel]
   * @returns {import('../../canonical/response.js').CanonicalResponse}
   */
  parseResponse(wireResponse, targetModel) {
    return openAiToCanonicalResponse(wireResponse, targetModel);
  }

  /**
   * Transform a raw SSE or readable stream into an async iterable of CanonicalStreamChunks.
   * @param {ReadableStream | import('node:stream').Readable | AsyncIterable<any>} stream
   * @param {string} [targetModel]
   * @returns {AsyncGenerator<import('../../canonical/events.js').CanonicalStreamChunk>}
   */
  async *parseStream(stream, targetModel) {
    yield* streamOpenAiToCanonical(stream, targetModel);
  }

  /**
   * Format a CanonicalStreamChunk into an OpenAI SSE line.
   * @param {import('../../canonical/events.js').CanonicalStreamChunk} chunk
   * @param {Object} [meta]
   * @returns {string}
   */
  formatStreamChunk(chunk, meta) {
    return canonicalChunkToOpenAiSse(chunk, meta);
  }

  /**
   * Parse an OpenAI error payload into a normalized error structure.
   * @param {Record<string, any> | string} errorPayload
   * @param {number} [status]
   * @returns {{ code: string, message: string, status: number }}
   */
  parseError(errorPayload, status = 500) {
    let parsed = errorPayload;
    if (typeof errorPayload === 'string') {
      try {
        parsed = JSON.parse(errorPayload);
      } catch {
        parsed = { message: errorPayload };
      }
    }

    const err = parsed?.error || parsed || {};
    const code = err.code || err.type || 'upstream_error';
    const message = err.message || (typeof errorPayload === 'string' ? errorPayload : 'OpenAI upstream error');

    return {
      code: String(code),
      message: String(message),
      status,
    };
  }
}

// Global shared protocol instance
export const openAiChatProtocol = new OpenAiChatProtocol();

// Re-export individual translators for granular testing and use
export {
  canonicalToOpenAiRequest,
  openAiToCanonicalResponse,
  mapFinishReason,
  streamOpenAiToCanonical,
  canonicalChunkToOpenAiSse,
  openAiChunkToCanonicalEvents,
  createOpenAiStreamState,
};
