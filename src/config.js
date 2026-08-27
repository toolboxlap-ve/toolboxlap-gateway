// src/config.js
// Loads .env via dotenv and exposes a validated, immutable config object.
// Never logs the API key. Surfaces missing-required values to the caller.

import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, existsSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const PROJECT_ROOT = path.resolve(__dirname, '..');

// Pull gateway name + version from the nearest package.json so the
// runtime never disagrees with the packaged application version.
function readPackageMeta() {
  try {
    let dir = __dirname;
    for (let i = 0; i < 6; i++) {
      const candidate = path.join(dir, 'package.json');
      if (existsSync(candidate)) {
        const pkg = JSON.parse(readFileSync(candidate, 'utf8'));
        return {
          name: pkg.productName || pkg.name || 'TOOLBOXLAP Gateway',
          version: pkg.version || '0.2.9',
        };
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  } catch (e) { /* fall through */ }
  return { name: 'TOOLBOXLAP Gateway', version: '0.2.9' };
}
const PKG = readPackageMeta();


function readString(name, fallback, env) {
  const v = env[name];
  if (v === undefined || v === null || v === '') return fallback;
  return String(v).trim();
}

function readInt(name, fallback, env) {
  const v = env[name];
  if (v === undefined || v === null || v === '') return fallback;
  const n = Number.parseInt(String(v).trim(), 10);
  if (!Number.isFinite(n)) {
    throw new Error(`Invalid integer for env ${name}: ${v}`);
  }
  return n;
}

function readLogLevel(env) {
  const v = (env.LOG_LEVEL || 'info').toLowerCase();
  if (['debug', 'info', 'warn', 'error'].includes(v)) return v;
  return 'info';
}

/**
 * @typedef {Object} AppConfig
 * @property {string} host
 * @property {number} port
 * @property {string} gmiBaseUrl
 * @property {string|null} gmiApiKey
 * @property {string} claudeModelAlias
 * @property {string} upstreamModel
 * @property {string|null} localGatewayToken
 * @property {string} logLevel
 * @property {number} upstreamTimeoutMs
 * @property {string} gatewayName
 * @property {string} gatewayVersion
 */

/**
 * Load and validate config from environment.
 * Throws on invalid numeric values. Missing GMI_API_KEY is allowed (deferred
 * to runtime) so the gateway can boot in dev / test modes.
 * @param {object} [env]  Defaults to process.env. Tests can pass a plain object.
 * @returns {AppConfig}
 */
export function loadConfig(env = process.env) {
  const e = env || process.env;
  const cfg = {
    host: readString('HOST', '127.0.0.1', e),
    port: readInt('PORT', 8787, e),
    gmiBaseUrl: readString('GMI_BASE_URL', 'https://api.gmi-serving.com', e).replace(/\/+$/, ''),
    gmiApiKey: readString('GMI_API_KEY', null, e),
    claudeModelAlias: readString('CLAUDE_MODEL_ALIAS', 'claude-opus-5', e),
    upstreamModel: readString('UPSTREAM_MODEL', 'MiniMaxAI/MiniMax-M3', e),
    localGatewayToken: readString('LOCAL_GATEWAY_TOKEN', null, e),
    logLevel: readLogLevel(e),
    upstreamTimeoutMs: readInt('UPSTREAM_TIMEOUT_MS', 120000, e),
    gatewayName: PKG.name,
    gatewayVersion: PKG.version,
  };

  if (cfg.port < 0 || cfg.port > 65535) {
    throw new Error(`Invalid PORT: ${cfg.port}`);
  }
  if (!cfg.gmiBaseUrl.startsWith('http://') && !cfg.gmiBaseUrl.startsWith('https://')) {
    throw new Error(`Invalid GMI_BASE_URL: ${cfg.gmiBaseUrl}`);
  }
  return Object.freeze(cfg);
}

/**
 * Returns true when the gateway is running in development mode:
 * local-only bind AND no token configured.
 */
export function isDevMode(cfg) {
  return isLoopbackHost(cfg.host) && !cfg.localGatewayToken;
}

/** Return true only for explicit local loopback bind addresses. */
export function isLoopbackHost(host) {
  const normalized = String(host || '').trim().toLowerCase().replace(/^\[|\]$/g, '');
  return normalized === '127.0.0.1' || normalized === 'localhost' || normalized === '::1';
}

/**
 * Non-loopback binding is an advanced configuration and must use a token
 * that is not the documented localhost convenience value. Generated GUI
 * tokens are 51 characters; 24 is the minimum accepted for manual setups.
 */
export function isStrongGatewayToken(token) {
  if (typeof token !== 'string') return false;
  const value = token.trim();
  return value.length >= 24 && value.toLowerCase() !== 'toolboxlap';
}

/** Fail closed before listening when a network-visible bind is unsafe. */
export function validateExposureConfig(cfg) {
  if (isLoopbackHost(cfg.host)) return;
  if (!isStrongGatewayToken(cfg.localGatewayToken)) {
    throw new Error(
      `Refusing non-loopback bind '${cfg.host}': configure a strong LOCAL_GATEWAY_TOKEN ` +
      '(at least 24 characters; the default "toolboxlap" token is localhost-only).',
    );
  }
}
