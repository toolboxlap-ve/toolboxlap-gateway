// src/providers/gmi-provider.js
// GMI Cloud provider adapter implementing the BaseProvider interface.

import { Buffer } from 'node:buffer';
import { BaseProvider } from './base-provider.js';
import { globalProviderRegistry } from './provider-registry.js';
import { createCanonicalResponse } from '../canonical/response.js';
import { gmiManifest } from './manifests/gmi.manifest.js';

export class GmiProviderAdapter extends BaseProvider {
  get manifest() {
    return gmiManifest;
  }

  get id() {
    return 'gmi';
  }

  get displayName() {
    return 'GMI Cloud';
  }

  get defaultBaseUrl() {
    return 'https://api.gmi-serving.com';
  }

  get nativeProtocol() {
    return 'anthropic';
  }

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
   * Build the upstream URL for /v1/messages.
   * @param {string} baseUrl
   * @returns {string}
   */
  buildMessagesUrl(baseUrl) {
    const base = baseUrl || this.defaultBaseUrl;
    return `${base.replace(/\/+$/, '')}/v1/messages`;
  }

  /**
   * Fetch available models from GMI Cloud.
   * @param {string} apiKey
   * @param {string} [baseUrl]
   * @returns {Promise<Array<{id: string, name: string}>>}
   */
  async fetchModels(apiKey, baseUrl) {
    const base = baseUrl || this.defaultBaseUrl;
    const url = new URL('/v1/models', base).toString();
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      const err = new Error(`Failed to fetch GMI models: ${res.status} ${res.statusText}`);
      err.status = res.status;
      throw err;
    }

    const json = await res.json();
    if (!json.data || !Array.isArray(json.data)) {
      throw new Error('Invalid response format from GMI');
    }

    return json.data.map((m) => ({
      id: m.id,
      name: m.id,
    }));
  }

  /**
   * Lightweight connection & authentication probe.
   * @param {string} apiKey
   * @param {string} [baseUrl]
   * @returns {Promise<{ ok: boolean, reason?: string, status?: number, error?: string }>}
   */
  async testConnection(apiKey, baseUrl) {
    try {
      const base = baseUrl || this.defaultBaseUrl;
      const url = new URL('/v1/models', base).toString();
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });
      if (res.status === 200) return { ok: true };
      if (res.status === 401 || res.status === 403) {
        return { ok: false, reason: 'invalid-key', status: res.status };
      }
      return { ok: false, reason: 'upstream-error', status: res.status };
    } catch (e) {
      return { ok: false, reason: 'network-error', error: (e && e.message) || String(e) };
    }
  }

  /**
   * Forward a request directly to the GMI upstream.
   * Encapsulates timeout handling, header sanitation, and stream management.
   * Returns standard ProxyResponse for the server layer.
   *
   * @param {{ body: object, extraHeaders?: object, requestId?: string }} req
   * @param {{ apiKey?: string, baseUrl?: string, timeoutMs?: number }} context
   * @returns {Promise<{ status: number, headers: Headers, body: any, isStreaming: boolean, contentType?: string, _streamTimer?: any, _abort?: AbortController }>}
   */
  async forward(req, context = {}) {
    const apiKey = context.apiKey;
    if (!apiKey) {
      const err = new Error('GMI_API_KEY is not configured');
      err.code = 'MISSING_API_KEY';
      throw err;
    }
    const baseUrl = context.baseUrl || this.defaultBaseUrl;
    const timeoutMs = Number.isFinite(context.timeoutMs) ? context.timeoutMs : 120000;
    const url = this.buildMessagesUrl(baseUrl);

    const headers = {
      'content-type': 'application/json',
      'authorization': `Bearer ${apiKey}`,
      'accept': req.body?.stream ? 'text/event-stream' : 'application/json',
      ...(req.extraHeaders || {}),
    };

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(new Error('upstream timeout')), timeoutMs);

    let upstreamRes;
    try {
      upstreamRes = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(req.body),
        signal: ac.signal,
      });
    } catch (e) {
      clearTimeout(timer);
      if (ac.signal.aborted || e?.name === 'AbortError' || /aborted|timeout/i.test(String(e?.message))) {
        const err = new Error('upstream timeout');
        err.code = 'UPSTREAM_TIMEOUT';
        throw err;
      }
      const err = new Error(`upstream connection failure: ${e?.message || e}`);
      err.code = 'UPSTREAM_CONNECT_FAIL';
      throw err;
    }

    const outHeaders = new Headers();
    upstreamRes.headers.forEach((value, key) => {
      const lower = key.toLowerCase();
      if (lower === 'transfer-encoding' || lower === 'connection' || lower === 'content-length') return;
      outHeaders.set(key, value);
    });

    const ct = upstreamRes.headers.get('content-type') || '';
    const streaming = req.body?.stream === true && (ct.includes('text/event-stream') || upstreamRes.status === 200);

    if (!streaming) {
      clearTimeout(timer);
      const buf = Buffer.from(await upstreamRes.arrayBuffer());
      const body = new ReadableStream({
        start(controller) {
          controller.enqueue(buf);
          controller.close();
        },
      });
      return {
        status: upstreamRes.status,
        headers: outHeaders,
        body,
        isStreaming: false,
        contentType: ct || 'application/json',
      };
    }

    return {
      status: upstreamRes.status,
      headers: outHeaders,
      body: upstreamRes.body,
      isStreaming: true,
      contentType: ct,
      _streamTimer: timer,
      _abort: ac,
    };
  }

  /**
   * Execute non-streaming CanonicalRequest.
   * @param {import('../canonical/request.js').CanonicalRequest} request
   * @param {import('./base-provider.js').ProviderExecutionContext} context
   * @returns {Promise<import('../canonical/response.js').CanonicalResponse>}
   */
  async execute(request, context) {
    const rawRes = await this.forward({ body: request }, context);
    const buf = Buffer.from(await new Response(rawRes.body).arrayBuffer());
    const json = JSON.parse(buf.toString('utf8'));
    return createCanonicalResponse({
      id: json.id,
      model: json.model || request.targetModel,
      content: json.content,
      stopReason: json.stop_reason,
      usage: {
        inputTokens: json.usage?.input_tokens,
        outputTokens: json.usage?.output_tokens,
      },
      rawResponse: json,
    });
  }
}

// Global default instance
export const gmiProviderAdapter = new GmiProviderAdapter();

// Register with the global provider registry
if (!globalProviderRegistry.has(gmiProviderAdapter.id)) {
  globalProviderRegistry.register(gmiProviderAdapter);
}

// Legacy exported functions for backward compatibility with main.js and existing tests
export async function fetchModels(apiKey, baseUrl) {
  return gmiProviderAdapter.fetchModels(apiKey, baseUrl);
}

export async function testConnection(apiKey, baseUrl) {
  return gmiProviderAdapter.testConnection(apiKey, baseUrl);
}
