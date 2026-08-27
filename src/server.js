// src/server.js
// HTTP server: /health, /v1/models, /v1/messages.
// Auth: optional bearer token (LOCAL_GATEWAY_TOKEN). Dev mode (localhost + no
// token) accepts anonymous requests.

import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EventEmitter } from 'node:events';

import { loadConfig, isDevMode, isLoopbackHost, validateExposureConfig } from './config.js';
import { createLogger } from './logger.js';
import {
  forwardToUpstream,
  rewriteModel,
  resolveAlias,
  isStreamRequest,
} from './proxy.js';

const JSON_CT = 'application/json';

function jsonResponse(res, status, body, extraHeaders = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': JSON_CT,
    'content-length': Buffer.byteLength(payload),
    ...extraHeaders,
  });
  res.end(payload);
}

function errorResponse(res, status, type, message, extra = {}) {
  // Anthropic-style error envelope
  const body = { type: 'error', error: { type, message, ...extra } };
  jsonResponse(res, status, body);
}

function readJsonBody(req, maxBytes = 10 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        const e = new Error('payload too large');
        e.code = 'PAYLOAD_TOO_LARGE';
        reject(e);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (size === 0) {
        // Empty body
        resolve({});
        return;
      }
      try {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve(JSON.parse(text));
      } catch (e) {
        const err = new Error(`malformed JSON: ${e.message}`);
        err.code = 'MALFORMED_JSON';
        reject(err);
      }
    });
    req.on('error', (e) => {
      const err = new Error(`request read error: ${e.message}`);
      err.code = 'READ_ERROR';
      reject(err);
    });
  });
}

function getRequestId(req) {
  return req.headers['x-request-id'] || randomUUID();
}

/**
 * Optional local-bearer auth. In dev mode (localhost + no token) the
 * request is accepted. Otherwise Authorization: Bearer <token> is required
 * and compared in constant time.
 */
function checkAuth(req, cfg) {
  if (isDevMode(cfg)) return { ok: true, dev: true };
  if (!cfg.localGatewayToken) {
    return { ok: false, reason: 'local gateway token is required' };
  }
  const auth = req.headers['authorization'] || '';
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  if (!m) return { ok: false, reason: 'missing bearer token' };
  const supplied = m[1];
  const expected = cfg.localGatewayToken;
  if (supplied.length !== expected.length) return { ok: false, reason: 'invalid token' };
  let diff = 0;
  for (let i = 0; i < supplied.length; i++) diff |= supplied.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) return { ok: false, reason: 'invalid token' };
  return { ok: true, dev: false };
}

/**
 * Map an upstream error to a useful local HTTP response.
 * The message is sanitized — never includes the API key.
 */
function upstreamErrorToHttp(err) {
  const code = err?.code;
  if (code === 'MISSING_API_KEY') {
    return { status: 500, type: 'configuration_error', message: 'upstream API key is not configured on the gateway' };
  }
  if (code === 'UPSTREAM_TIMEOUT') {
    return { status: 504, type: 'upstream_timeout', message: 'upstream request timed out' };
  }
  if (code === 'UPSTREAM_CONNECT_FAIL') {
    return { status: 502, type: 'upstream_unreachable', message: 'failed to reach upstream provider' };
  }
  return { status: 502, type: 'upstream_error', message: err?.message || 'upstream error' };
}

/**
 * Build the Anthropic-compatible /v1/models list. Returns one Claude-style
 * alias so Claude Desktop sees it as an available model.
 *
 * @param {import('./config.js').AppConfig} cfg
 * @param {string} [alias]  Optional live alias override (used so the response
 *   reflects model changes made after start).
 * @param {string} [upstreamId]  Optional live upstream model id (used for
 *   the metadata block — never exposed in plaintext, only its presence).
 */
function listModels(cfg, alias, upstreamId) {
  const id = alias || cfg.claudeModelAlias;
  // Anthropic-style: { data: [{ id, type, display_name, ... }] }
  return {
    object: 'list',
    data: [
      {
        id,
        type: 'model',
        display_name: id,
        created: 0,
        owned_by: 'toolbox-gateway',
        // We expose the routing info so it's discoverable but never the key.
        metadata: {
          gateway: cfg.gatewayName,
          gateway_version: cfg.gatewayVersion,
          upstream_provider: new URL(cfg.gmiBaseUrl).host,
          upstream_model_set: !!upstreamId,
        },
      },
    ],
  };
}

/**
 * Create the HTTP request handler. Pure function — accepts a config so tests
 * can construct one without booting the server.
 * @param {import('./config.js').AppConfig} cfg
 * @param {object} [deps]  Injection points for tests.
 * @param {(req: any, cfg: any) => Promise<any>} [deps.forward]  Defaults to forwardToUpstream.
 * @param {EventEmitter} [deps.events]  Emits `request` events with safe
 *   metadata (endpoint, alias, upstream model, status, duration, streaming)
 *   when a /v1/messages request completes. Never includes bodies or headers.
 * @param {() => { alias: string, model: string }} [deps.resolveModels]
 *   Live alias/model lookup. When provided it is consulted per request so the
 *   gateway picks up model changes without a restart.
 */
export function createRequestHandler(cfg, deps = {}) {
  const forward = deps.forward || forwardToUpstream;
  const events = deps.events instanceof EventEmitter ? deps.events : null;

  // Safe, structured completion event for the UI activity feed + statistics.
  function emitRequest(meta) {
    if (!events) return;
    try {
      events.emit('request', {
        endpoint: '/v1/messages',
        alias: meta.alias ?? null,
        upstreamModel: meta.upstreamModel ?? null,
        status: meta.status,
        durationMs: Date.now() - meta.start,
        streaming: meta.streaming === true,
        requestId: meta.requestId,
      });
    } catch { /* activity must never break request handling */ }
  }

  function currentModels() {
    if (typeof deps.resolveModels === 'function') {
      try {
        const r = deps.resolveModels();
        if (r && typeof r.alias === 'string' && typeof r.model === 'string') return r;
      } catch { /* fall back to static cfg */ }
    }
    return { alias: cfg.claudeModelAlias, model: cfg.upstreamModel };
  }

  return async function handler(req, res) {
    const requestId = getRequestId(req);
    const log = createLogger(cfg.logLevel, requestId);
    const start = Date.now();
    res.setHeader('x-request-id', requestId);

    try {
      // Network-visible binds require authentication on every route. The
      // startup validator ensures the token itself is strong; this request
      // guard is defense in depth and prevents unauthenticated discovery.
      const auth = checkAuth(req, cfg);
      if (!isLoopbackHost(cfg.host) && !auth.ok) {
        log.warn('auth rejected', { reason: auth.reason });
        return errorResponse(res, 401, 'authentication_error', 'invalid or missing local gateway token');
      }

      // ---- Routing ----
      if (req.method === 'GET' && req.url === '/health') {
        const live = currentModels();
        return jsonResponse(res, 200, {
          status: 'ok',
          gateway: cfg.gatewayName,
          version: cfg.gatewayVersion,
          upstream_provider: new URL(cfg.gmiBaseUrl).host,
          configured_model_alias: live.alias,
          actual_model_id: live.model,
          auth_mode: isDevMode(cfg) ? 'dev' : (cfg.localGatewayToken ? 'bearer' : 'open'),
        });
      }

      if (req.method === 'GET' && (req.url === '/v1/models' || req.url.startsWith('/v1/models?'))) {
        const live = currentModels();
        return jsonResponse(res, 200, listModels(cfg, live.alias, live.model));
      }

      if (req.method === 'POST' && (req.url === '/v1/messages' || req.url.startsWith('/v1/messages?'))) {
        const models = currentModels();

        // ---- Auth ----
        if (!auth.ok) {
          log.warn('auth rejected', { reason: auth.reason });
          emitRequest({ start, requestId, status: 401 });
          return errorResponse(res, 401, 'authentication_error', 'invalid or missing local gateway token');
        }

        // ---- Parse body ----
        let body;
        try {
          body = await readJsonBody(req);
        } catch (e) {
          if (e.code === 'MALFORMED_JSON') {
            emitRequest({ start, requestId, status: 400 });
            return errorResponse(res, 400, 'invalid_request_error', e.message);
          }
          if (e.code === 'PAYLOAD_TOO_LARGE') {
            emitRequest({ start, requestId, status: 413 });
            return errorResponse(res, 413, 'invalid_request_error', 'request body too large');
          }
          emitRequest({ start, requestId, status: 400 });
          return errorResponse(res, 400, 'invalid_request_error', e.message);
        }

        // ---- Validate model alias ----
        const alias = resolveAlias(body, models.alias);
        if (!alias.ok) {
          emitRequest({ start, requestId, status: 400 });
          return errorResponse(res, 400, 'invalid_request_error', alias.reason);
        }

        // ---- Rewrite to upstream model ----
        const upstreamBody = rewriteModel(body, models.model);
        const streaming = isStreamRequest(upstreamBody);

        log.info('incoming request', {
          endpoint: '/v1/messages',
          alias: alias.alias,
          routed_to: models.model,
          streaming,
          auth: auth.dev ? 'dev' : 'bearer',
        });

        // ---- Forward ----
        let upstream;
        try {
          upstream = await forward(
            { body: upstreamBody, requestId },
            cfg,
            res,
          );
        } catch (e) {
          const mapped = upstreamErrorToHttp(e);
          log.error('upstream failure', { code: e?.code, status: mapped.status, message: e?.message });
          emitRequest({ start, requestId, alias: alias.alias, upstreamModel: models.model, streaming, status: mapped.status });
          return errorResponse(res, mapped.status, mapped.type, mapped.message);
        }

        // ---- Non-streaming response ----
        if (!upstream.isStreaming) {
          const buf = Buffer.from(await new Response(upstream.body).arrayBuffer());
          res.writeHead(upstream.status, {
            'content-type': upstream.contentType || JSON_CT,
            'content-length': buf.length,
          });
          res.end(buf);
          emitRequest({ start, requestId, alias: alias.alias, upstreamModel: models.model, streaming: false, status: upstream.status });
          log.info('upstream response', {
            endpoint: '/v1/messages',
            alias: alias.alias,
            routed_to: models.model,
            status: upstream.status,
            duration_ms: Date.now() - start,
          });
          return;
        }

        // ---- Streaming response (SSE passthrough) ----
        res.writeHead(upstream.status, {
          'content-type': upstream.contentType || 'text/event-stream',
          'cache-control': 'no-cache',
          'connection': 'keep-alive',
        });
        const nodeStream = Readable.fromWeb(upstream.body);
        let bytes = 0;
        await new Promise((resolve, reject) => {
          nodeStream.on('data', (chunk) => {
            bytes += chunk.length;
            if (!res.write(chunk)) {
              nodeStream.pause();
              res.once('drain', () => nodeStream.resume());
            }
          });
          nodeStream.on('end', () => {
            if (upstream._streamTimer) clearTimeout(upstream._streamTimer);
            res.end();
            resolve();
          });
          nodeStream.on('error', (err) => {
            if (upstream._streamTimer) clearTimeout(upstream._streamTimer);
            try { res.end(); } catch {}
            reject(err);
          });
          req.on('close', () => {
            if (upstream._streamTimer) clearTimeout(upstream._streamTimer);
            try { upstream._abort?.abort(); } catch {}
            try { nodeStream.destroy(); } catch {}
            resolve();
          });
        });
        log.info('upstream response (stream)', {
          endpoint: '/v1/messages',
          alias: alias.alias,
          routed_to: models.model,
          status: upstream.status,
          duration_ms: Date.now() - start,
          bytes,
        });
        emitRequest({ start, requestId, alias: alias.alias, upstreamModel: models.model, streaming: true, status: upstream.status });
        return;
      }

      // ---- 404 ----
      return errorResponse(res, 404, 'not_found_error', `no route for ${req.method} ${req.url}`);
    } catch (e) {
      // Last-resort guard
      log.error('unhandled error', { message: e?.message, stack: e?.stack });
      if (!res.headersSent) errorResponse(res, 500, 'internal_error', 'internal gateway error');
      else try { res.end(); } catch {}
    }
  };
}

/**
 * Start the gateway. Returns a promise that resolves once listening, and
 * a close() function to stop it. close() stops accepting new connections,
 * destroys the ones still open (so the port is released immediately instead
 * of waiting out keep-alive timeouts), and resolves once the socket is free.
 * @param {import('./config.js').AppConfig} [cfg]  Optional injected config (tests).
 * @param {object} [deps]  Same injection points as createRequestHandler.
 */
export async function startServer(cfg, deps = {}) {
  const config = cfg || loadConfig();
  validateExposureConfig(config);
  const handler = createRequestHandler(config, deps);
  const server = http.createServer(handler);

  const bound = await new Promise((resolve, reject) => {
    const onErr = (e) => reject(e);
    server.once('error', onErr);
    server.listen(config.port, config.host, () => {
      server.off('error', onErr);
      resolve(server.address());
    });
  });
  const actualPort = bound.port;

  const log = createLogger(config.logLevel);
  const url = `http://${config.host}:${actualPort}`;
  log.info('gateway listening', {
    url,
    alias: config.claudeModelAlias,
    upstream_model: config.upstreamModel,
    upstream_base: config.gmiBaseUrl,
    auth_mode: isDevMode(config) ? 'dev' : (config.localGatewayToken ? 'bearer' : 'open'),
  });

  return {
    server,
    url,
    port: actualPort,
    close: () => new Promise((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      server.close(() => done());
      // Destroy any open (keep-alive / in-flight) connections so the port is
      // released right away. Only THIS server's sockets are touched.
      try { server.closeAllConnections?.(); } catch { /* older runtimes */ }
      // Safety net: never hang the caller.
      setTimeout(done, 3000);
    }),
  };
}

// Run when invoked directly (node src/server.js)
const isDirect = (() => {
  if (!process.argv[1]) return false;
  try {
    return path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();

if (isDirect) {
  const handle = startServer();
  const shutdown = (signal) => {
    handle.then((h) => h.close()).finally(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  handle.catch((e) => {
    // eslint-disable-next-line no-console
    console.error('Failed to start gateway:', e?.message || e);
    process.exit(1);
  });
}
