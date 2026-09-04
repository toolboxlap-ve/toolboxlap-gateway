// src/protocols/base-protocol.js
// Abstract base class defining the uniform Protocol Translator contract.

export class BaseProtocolTranslator {
  /**
   * Protocol machine name (e.g. 'openai-chat', 'anthropic').
   * @returns {string}
   */
  get name() {
    throw new Error(`[${this.constructor.name}] 'name' getter must be implemented.`);
  }

  /**
   * Translate a CanonicalRequest into the wire request payload.
   * @param {import('../canonical/request.js').CanonicalRequest} request
   * @returns {Record<string, any>}
   */
  formatRequest(request) {
    throw new Error(`[${this.constructor.name}] formatRequest() not implemented.`);
  }

  /**
   * Translate a wire response payload into a CanonicalResponse.
   * @param {Record<string, any>} wireResponse
   * @param {string} [targetModel]
   * @returns {import('../canonical/response.js').CanonicalResponse}
   */
  parseResponse(wireResponse, targetModel) {
    throw new Error(`[${this.constructor.name}] parseResponse() not implemented.`);
  }

  /**
   * Transform a raw SSE or readable stream into an async iterable of CanonicalStreamChunks.
   * @param {ReadableStream | import('node:stream').Readable} stream
   * @returns {AsyncIterable<import('../canonical/events.js').CanonicalStreamChunk>}
   */
  async *parseStream(stream) {
    throw new Error(`[${this.constructor.name}] parseStream() not implemented.`);
  }

  /**
   * Format a CanonicalStreamChunk into the protocol's wire SSE string.
   * @param {import('../canonical/events.js').CanonicalStreamChunk} chunk
   * @returns {string}
   */
  formatStreamChunk(chunk) {
    throw new Error(`[${this.constructor.name}] formatStreamChunk() not implemented.`);
  }

  /**
   * Parse an upstream error payload into a normalized error structure.
   * @param {Record<string, any> | string} errorPayload
   * @param {number} [status]
   * @returns {{ code: string, message: string, status: number }}
   */
  parseError(errorPayload, status = 500) {
    throw new Error(`[${this.constructor.name}] parseError() not implemented.`);
  }
}
