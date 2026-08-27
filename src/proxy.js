// src/proxy.js
// Upstream HTTP client. Routes Anthropic Messages API style requests to the
// configured provider (GMI Cloud by default). Supports streaming pass-through.
//
// V0.1: only GMI provider is implemented. The structure is provider-agnostic
// so V0.2 can add other backends (minimax direct, openrouter, zai, qwen,
// deepseek, local openai-compatible) without changing the server surface.

import { Buffer } from 'node:buffer';

/**
 * @typedef {Object} ProxyRequest
 * @property {object} body           The full request body (Anthropic Messages API shape).
 * @property {object} extraHeaders   Extra headers to merge (e.g. anthropic-version).
 * @property {string} [requestId]    For logging correlation.
 * @property {(line: string) => void} [onEvent]  Optional callback for SSE event lines.
 */

/**
 * @typedef {Object} ProxyResponse
 * @property {number} status
 * @property {Headers} headers
 * @property {ReadableStream<Uint8Array> | null} body
 * @property {boolean} isStreaming
 * @property {string} [contentType]
 */

/**
 * Build the upstream URL for /v1/messages.
 * @param {string} baseUrl
 * @returns {string}
 */
export function buildMessagesUrl(baseUrl) {
  // GMI's Anthropic-compatible endpoint is the same /v1/messages path.
  return `${baseUrl.replace(/\/+$/, '')}/v1/messages`;
}

/**
 * Replace the model field in an Anthropic-style body with the upstream model.
 * Returns a new object (does not mutate the input).
 * @param {object} body
 * @param {string} upstreamModel
 */
export function rewriteModel(body, upstreamModel) {
  if (!body || typeof body !== 'object') return body;
  return { ...body, model: upstreamModel };
}

/**
 * Validate that the body has a model field, and that it matches the expected
 * alias (or is missing). Returns the resolved alias.
 * @param {object} body
 * @param {string} expectedAlias
 * @returns {{ ok: true, alias: string } | { ok: false, reason: string }}
 */
export function resolveAlias(body, expectedAlias) {
  if (!body || typeof body !== 'object') {
    return { ok: false, reason: 'request body must be a JSON object' };
  }
  if (!body.model) {
    return { ok: false, reason: "missing required field 'model'" };
  }
  if (body.model !== expectedAlias && body.model !== 'claude-sonnet-4-6') {
    return {
      ok: false,
      reason: `unsupported model '${body.model}'; expected '${expectedAlias}' or 'claude-sonnet-4-6'`,
    };
  }
  return { ok: true, alias: body.model };
}

/**
 * Decide whether a request should be streamed. Mirrors the Anthropic API
 * contract: streaming happens when `stream: true` is set on the body.
 */
export function isStreamRequest(body) {
  return !!(body && body.stream === true);
}

/**
 * Forward a request to the upstream provider.
 *
 * - Non-streaming: returns a ProxyResponse with the upstream body as a
 *   ReadableStream that the caller can read once.
 * - Streaming: sets `isStreaming: true` and leaves the body to be piped.
 *
 * Throws on network / timeout errors. The caller is responsible for
 * translating thrown errors into HTTP responses.
 *
 * @param {ProxyRequest} req
 * @param {import('./config.js').AppConfig} cfg
 * @param {import('node:http').ServerResponse} [httpRes]  Required for streaming to pipe chunks.
 * @returns {Promise<ProxyResponse>}
 */
export async function forwardToUpstream(req, cfg, httpRes) {
  if (!cfg.gmiApiKey) {
    const err = new Error('GMI_API_KEY is not configured');
    err.code = 'MISSING_API_KEY';
    throw err;
  }
  const url = buildMessagesUrl(cfg.gmiBaseUrl);
  const headers = {
    'content-type': 'application/json',
    'authorization': `Bearer ${cfg.gmiApiKey}`,
    'accept': req.body?.stream ? 'text/event-stream' : 'application/json',
    ...(req.extraHeaders || {}),
  };

  // AbortController for timeout. We use the upstream's body stream; if it
  // stalls past the timeout, the controller fires and fetch rejects.
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(new Error('upstream timeout')), cfg.upstreamTimeoutMs);

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
    if (e?.name === 'AbortError' || /aborted/i.test(String(e?.message))) {
      const err = new Error('upstream timeout');
      err.code = 'UPSTREAM_TIMEOUT';
      throw err;
    }
    const err = new Error(`upstream connection failure: ${e?.message || e}`);
    err.code = 'UPSTREAM_CONNECT_FAIL';
    throw err;
  }

  // Build response headers, stripping hop-by-hop / problematic transfer-encoding.
  const outHeaders = new Headers();
  upstreamRes.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (lower === 'transfer-encoding' || lower === 'connection' || lower === 'content-length') return;
    outHeaders.set(key, value);
  });

  const ct = upstreamRes.headers.get('content-type') || '';
  const streaming = req.body?.stream === true && (ct.includes('text/event-stream') || upstreamRes.status === 200);

  // For non-streaming, drain the body into a fresh ReadableStream so the
  // caller can read it after the timer is cleared.
  if (!streaming) {
    clearTimeout(timer);
    // Buffer the upstream body so we can clear the timer and return a
    // self-contained response.
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

  // Streaming: return the raw body. The caller (server.js) is responsible
  // for piping it and clearing the timer when the stream ends.
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
