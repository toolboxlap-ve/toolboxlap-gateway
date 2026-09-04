// src/providers/openai-compatible-provider.js
// Generic, reusable OpenAI-compatible provider implementing common HTTP, streaming,
// model listing, connection probe, timeout, and error normalization behaviors.

import { BaseProvider } from './base-provider.js';
import { openAiChatProtocol } from '../protocols/openai/index.js';

export class OpenAICompatibleProvider extends BaseProvider {
  /**
   * @param {Object} [options]
   * @param {string} [options.id]
   * @param {string} [options.displayName]
   * @param {string} [options.defaultBaseUrl]
   * @param {import('../protocols/base-protocol.js').BaseProtocolTranslator} [options.protocol]
   * @param {Partial<import('./base-provider.js').ProviderCapabilities>} [options.capabilities]
   * @param {number} [options.defaultTimeoutMs]
   */
  constructor(options = {}) {
    super();
    this._id = options.id || '';
    this._displayName = options.displayName || '';
    this._defaultBaseUrl = options.defaultBaseUrl || '';
    this._protocol = options.protocol || openAiChatProtocol;
    this._capabilities = options.capabilities || null;
    this._manifest = options.manifest || null;
    this._defaultTimeoutMs = options.defaultTimeoutMs || 120000;
  }

  get id() {
    return this._id || 'openai-compatible';
  }

  get displayName() {
    return this._displayName || 'OpenAI Compatible';
  }

  get defaultBaseUrl() {
    return this._defaultBaseUrl || '';
  }

  get nativeProtocol() {
    return 'openai-chat';
  }

  get protocol() {
    return this._protocol;
  }

  get capabilities() {
    return Object.freeze({
      streaming: true,
      tools: true,
      toolChoice: true,
      parallelToolCalls: true,
      vision: true,
      systemPrompts: true,
      thinking: false,
      maxContextTokens: 128000,
      ...(this._capabilities || {}),
    });
  }

  /**
   * Build the chat completions endpoint URL.
   * Automatically handles base URLs that already contain /v1.
   * @param {string} [baseUrl]
   * @returns {string}
   */
  buildChatCompletionsUrl(baseUrl) {
    const base = (baseUrl || this.defaultBaseUrl || '').replace(/\/+$/, '');
    if (!base) return '/v1/chat/completions';
    return base.endsWith('/v1') ? `${base}/chat/completions` : `${base}/v1/chat/completions`;
  }

  /**
   * Build the models endpoint URL.
   * Automatically handles base URLs that already contain /v1.
   * @param {string} [baseUrl]
   * @returns {string}
   */
  buildModelsUrl(baseUrl) {
    const base = (baseUrl || this.defaultBaseUrl || '').replace(/\/+$/, '');
    if (!base) return '/v1/models';
    return base.endsWith('/v1') ? `${base}/models` : `${base}/v1/models`;
  }

  /**
   * Build standard request headers.
   * @param {string} [apiKey]
   * @param {Record<string, string>} [extraHeaders]
   * @returns {Record<string, string>}
   */
  getDefaultHeaders(apiKey, extraHeaders = {}) {
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...extraHeaders,
    };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }
    return headers;
  }

  /**
   * Create an AbortController combining an external signal and a timeout.
   * @private
   * @param {AbortSignal} [externalSignal]
   * @param {number} [timeoutMs]
   * @returns {{ signal: AbortSignal, cleanup: () => void, isTimeout: () => boolean }}
   */
  _createCombinedSignal(externalSignal, timeoutMs) {
    const ac = new AbortController();
    let timedOut = false;
    let timer = null;

    if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
      timer = setTimeout(() => {
        timedOut = true;
        const err = new Error('upstream timeout');
        err.name = 'TimeoutError';
        err.code = 'UPSTREAM_TIMEOUT';
        ac.abort(err);
      }, timeoutMs);
    }

    const onAbort = () => {
      if (timer) clearTimeout(timer);
      ac.abort(externalSignal.reason);
    };

    if (externalSignal) {
      if (externalSignal.aborted) {
        if (timer) clearTimeout(timer);
        ac.abort(externalSignal.reason);
      } else {
        externalSignal.addEventListener('abort', onAbort, { once: true });
      }
    }

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      if (externalSignal) {
        externalSignal.removeEventListener('abort', onAbort);
      }
    };

    return {
      signal: ac.signal,
      cleanup,
      isTimeout: () => timedOut || (ac.signal.aborted && (/timeout/i.test(String(ac.signal.reason?.message || '')) || ac.signal.reason?.code === 'UPSTREAM_TIMEOUT')),
    };
  }

  /**
   * Format an upstream error response into a normalized Error object.
   * @private
   * @param {Response} response
   * @returns {Promise<Error>}
   */
  async _handleErrorResponse(response) {
    let rawText = '';
    try {
      rawText = await response.text();
    } catch {
      rawText = '';
    }

    const parsed = this.protocol.parseError(rawText, response.status);
    const err = new Error(parsed.message || `Upstream error with status ${response.status}`);
    err.code = parsed.code || 'UPSTREAM_ERROR';
    err.status = parsed.status || response.status;
    err.raw = rawText;
    return err;
  }

  /**
   * Execute non-streaming completion.
   * @param {import('../canonical/request.js').CanonicalRequest} request
   * @param {import('./base-provider.js').ProviderExecutionContext} [context]
   * @param {AbortSignal} [signal]
   * @returns {Promise<import('../canonical/response.js').CanonicalResponse>}
   */
  async execute(request, context = {}, signal) {
    const targetModel = request.targetModel || request.model;
    const wireRequest = this.protocol.formatRequest(request);
    wireRequest.stream = false;

    const url = this.buildChatCompletionsUrl(context.baseUrl);
    const headers = this.getDefaultHeaders(context.apiKey, context.extraHeaders);
    const timeoutMs = Number.isFinite(context.timeoutMs) ? context.timeoutMs : this._defaultTimeoutMs;
    const maxRetries = Number.isInteger(context.retries) ? context.retries : 0;
    const retryDelayMs = Number.isFinite(context.retryDelayMs) ? context.retryDelayMs : 50;

    let attempt = 0;
    while (true) {
      attempt++;
      const { signal: reqSignal, cleanup, isTimeout } = this._createCombinedSignal(signal, timeoutMs);

      try {
        const res = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(wireRequest),
          signal: reqSignal,
        });

        cleanup();

        if (!res.ok) {
          const isTransient = res.status === 429 || res.status >= 500;
          if (isTransient && attempt <= maxRetries && (!signal || !signal.aborted)) {
            await new Promise((r) => setTimeout(r, retryDelayMs * attempt));
            continue;
          }
          throw await this._handleErrorResponse(res);
        }

        const json = await res.json();
        return this.protocol.parseResponse(json, targetModel);
      } catch (e) {
        cleanup();

        if (isTimeout()) {
          const err = new Error('upstream timeout');
          err.code = 'UPSTREAM_TIMEOUT';
          err.status = 504;
          throw err;
        }

        if (signal && signal.aborted) {
          const err = new Error('request aborted');
          err.code = 'ABORTED';
          err.status = 499;
          throw err;
        }

        // If error was already parsed and thrown as an HTTP error above
        if (e.status) {
          throw e;
        }

        // Transient network error retry
        if (attempt <= maxRetries && (!signal || !signal.aborted)) {
          await new Promise((r) => setTimeout(r, retryDelayMs * attempt));
          continue;
        }

        const err = new Error(`upstream connection failure: ${e?.message || e}`);
        err.code = 'UPSTREAM_CONNECT_FAIL';
        err.status = 502;
        throw err;
      }
    }
  }

  /**
   * Execute streaming completion.
   * @param {import('../canonical/request.js').CanonicalRequest} request
   * @param {import('./base-provider.js').ProviderExecutionContext} [context]
   * @param {AbortSignal} [signal]
   * @returns {AsyncGenerator<import('../canonical/events.js').CanonicalStreamChunk>}
   */
  async *stream(request, context = {}, signal) {
    const targetModel = request.targetModel || request.model;
    const wireRequest = this.protocol.formatRequest(request);
    wireRequest.stream = true;

    const url = this.buildChatCompletionsUrl(context.baseUrl);
    const headers = this.getDefaultHeaders(context.apiKey, {
      ...context.extraHeaders,
      'Accept': 'text/event-stream',
    });
    const timeoutMs = Number.isFinite(context.timeoutMs) ? context.timeoutMs : this._defaultTimeoutMs;

    const { signal: reqSignal, cleanup, isTimeout } = this._createCombinedSignal(signal, timeoutMs);

    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(wireRequest),
        signal: reqSignal,
      });
    } catch (e) {
      cleanup();

      if (isTimeout()) {
        const err = new Error('upstream timeout');
        err.code = 'UPSTREAM_TIMEOUT';
        err.status = 504;
        throw err;
      }

      if (signal && signal.aborted) {
        const err = new Error('request aborted');
        err.code = 'ABORTED';
        err.status = 499;
        throw err;
      }

      const err = new Error(`upstream connection failure: ${e?.message || e}`);
      err.code = 'UPSTREAM_CONNECT_FAIL';
      err.status = 502;
      throw err;
    }

    if (!res.ok) {
      cleanup();
      throw await this._handleErrorResponse(res);
    }

    try {
      yield* this.protocol.parseStream(res.body, targetModel);
    } finally {
      cleanup();
    }
  }

  /**
   * Fetch available models from the OpenAI-compatible endpoint.
   * @param {string} [apiKey]
   * @param {string} [baseUrl]
   * @param {Object} [options]
   * @param {number} [options.timeoutMs]
   * @param {Record<string, string>} [options.extraHeaders]
   * @param {AbortSignal} [options.signal]
   * @returns {Promise<Array<{id: string, name: string, contextLength?: number}>>}
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
      const err = new Error(`Failed to fetch models: ${e?.message || e}`);
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
      ...(m.context_length || m.max_model_len ? { contextLength: m.context_length || m.max_model_len } : {}),
    }));
  }

  /**
   * Test connection and credentials against the /models endpoint.
   * @param {string} [apiKey]
   * @param {string} [baseUrl]
   * @param {Object} [options]
   * @returns {Promise<import('./base-provider.js').ProviderTestResult>}
   */
  async testConnection(apiKey, baseUrl, options = {}) {
    const url = this.buildModelsUrl(baseUrl);
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
}
