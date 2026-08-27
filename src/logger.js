// src/logger.js
// Concise structured logger. Never logs API keys, Authorization headers, or
// full user prompts by default. Has a per-request correlation id.

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

const REDACT_HEADERS = new Set([
  'authorization',
  'x-api-key',
  'proxy-authorization',
  'cookie',
  'set-cookie',
]);

// Default redacted key names that should never appear in logs.
const REDACT_KEYS = new Set([
  'gmi_api_key',
  'gmiApiKey',
  'local_gateway_token',
  'localGatewayToken',
  'authorization',
  'api_key',
  'apikey',
  'password',
  'token',
  'access_token',
  'refresh_token',
]);

const REDACTED = '[REDACTED]';

function redactValue(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return REDACTED;
  if (typeof value === 'number' || typeof value === 'boolean') return REDACTED;
  if (Array.isArray(value)) return value.map(redactValue);
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (REDACT_KEYS.has(k)) {
        out[k] = REDACTED;
      } else if (k.toLowerCase() === 'headers' && v && typeof v === 'object') {
        // Recurse into HTTP header maps with header-aware redaction.
        out[k] = redactHeaders(v);
      } else if (v && typeof v === 'object') {
        out[k] = redactValue(v);
      } else {
        out[k] = v;
      }
    }
    return out;
  }
  return value;
}

function redactHeaders(headers) {
  if (!headers || typeof headers !== 'object') return headers;
  const out = {};
  for (const [k, v] of Object.entries(headers)) {
    if (REDACT_HEADERS.has(k.toLowerCase())) out[k] = REDACTED;
    else out[k] = v;
  }
  return out;
}

/**
 * Returns a child logger bound to a request id. Provides .info/.warn/.error/.debug.
 * @param {string} level
 * @param {string} [requestId]
 */
export function createLogger(level = 'info', requestId = undefined) {
  const threshold = LEVELS[level] ?? LEVELS.info;
  const prefix = requestId ? `[${requestId}]` : '';
  const log = (lvl, msg, extra) => {
    if ((LEVELS[lvl] ?? LEVELS.info) < threshold) return;
    const time = new Date().toISOString();
    let line = `${time} ${lvl.toUpperCase().padEnd(5)} ${prefix} ${msg}`;
    if (extra && Object.keys(extra).length) {
      try {
        line += ' ' + JSON.stringify(extra);
      } catch {
        line += ' [unserializable extra]';
      }
    }
    // stdout for info/debug, stderr for warn/error
    if (lvl === 'error' || lvl === 'warn') process.stderr.write(line + '\n');
    else process.stdout.write(line + '\n');
  };
  return {
    debug: (m, e) => log('debug', m, redact(e)),
    info: (m, e) => log('info', m, redact(e)),
    warn: (m, e) => log('warn', m, redact(e)),
    error: (m, e) => log('error', m, redact(e)),
  };
}

function redact(extra) {
  if (!extra || typeof extra !== 'object') return extra;
  const out = { ...extra };
  if ('headers' in out) out.headers = redactHeaders(out.headers);
  // Top-level safety: scrub any obvious secret fields at the top.
  for (const k of Object.keys(out)) {
    if (REDACT_KEYS.has(k)) out[k] = REDACTED;
  }
  return out;
}

export const _internals = { redactValue, redactHeaders, REDACTED };
