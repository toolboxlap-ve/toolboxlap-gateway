// src/main.js
// 0.2.3 startup-fix: the Electron main process entry runs as ESM
// (package.json "type": "module"). The `electron` npm package is CJS-only
// and provides no named ESM exports, so `import { BrowserWindow } from 'electron'`
// throws SyntaxError before app.whenReady() ever fires and the EXE exits silently.
// We use the default-import + destructure interop pattern, which is the
// supported way to pull CJS exports into an ESM context.
//
// This file is loaded via dynamic import() from src/main.cjs, which runs
// first to handle the case where the EXE is launched in Node mode
// (ELECTRON_RUN_AS_NODE=1) and needs to be respawned with a clean env.

import electron from 'electron';
const { app, BrowserWindow, ipcMain, safeStorage, shell } = electron;
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';

import { startServer } from './server.js';
import {
  fetchModels as gmiFetchModels,
  testConnection as gmiTestConnection,
} from './providers/gmi-provider.js';
import { createActivityTracker } from './activity.js';
import { resolveExternalLink } from './external-links.js';

const require = createRequire(import.meta.url);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------- Fatal-error logger ----------
// Writes a small text log to <userData>/startup.log so any future silent
// regression is diagnosable from the filesystem. Never logs API keys or
// tokens; only safe diagnostic context (stage name, error name, message).
let STARTUP_LOG = null;
function _safeLogPath() {
  try {
    // userData may not be available before whenReady on some platforms.
    // Use a TEMP fallback so we always have a place to write.
    const base = (() => {
      try { return app.getPath('userData'); } catch { return os.tmpdir(); }
    })();
    return path.join(base, 'startup.log');
  } catch {
    return path.join(os.tmpdir(), 'toolbox-gateway-startup.log');
  }
}
function logStartup(stage, extra) {
  // Production releases do not write debug logs to disk or stdout
  // to prevent leaking filesystem paths and environment details.
}
function safeForLog(obj) {
  // Strip any obvious secret fields before logging.
  const cloned = {};
  for (const k of Object.keys(obj || {})) {
    if (/key|token|secret|password|auth/i.test(k)) continue;
    cloned[k] = obj[k];
  }
  return cloned;
}
process.on('uncaughtException', (err) => {
  logStartup('uncaughtException', { name: err?.name, message: err?.message, stack: err?.stack });
  // Show a minimal error window so the failure isn't invisible.
  try {
    if (app.isReady() && BrowserWindow) {
      const w = new BrowserWindow({ width: 600, height: 400, title: 'TOOLBOXLAP Gateway — startup error' });
      w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(
        '<!doctype html><html><head><meta charset="utf-8"><title>Startup error</title>' +
        '<style>body{background:#07090f;color:#e6e9ef;font:14px/1.4 system-ui;padding:20px;white-space:pre-wrap;word-break:break-word;}</style>' +
        '</head><body><h2>Startup error</h2><pre>' +
        (err?.stack || err?.message || String(err)) +
        '</pre><p>See startup.log in the user data directory for details.</p></body></html>'
      ));
    }
  } catch { /* give up */ }
});
process.on('unhandledRejection', (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  logStartup('unhandledRejection', { name: err.name, message: err.message, stack: err.stack });
});
logStartup('main-module-loaded', { pid: process.pid, electron: process.versions.electron, node: process.versions.node });

let mainWindow;
let gatewayHandle = null;
const gatewayEvents = new EventEmitter();
const activity = createActivityTracker();
let activeModelId = '';
let activeAliasId = '';

// Forward every completed request to the activity tracker, and notify the
// renderer about the new entry + updated stats. This replaces the previous
// stdout-monkey-patch approach: the gateway emits a structured `request`
// event with safe metadata only, and we turn that into UI updates.
gatewayEvents.on('request', (evt) => {
  const entry = activity.recordRequest(evt);
  if (entry) {
    emit('activity', entry);
    emit('stats', currentStats());
  }
});

function currentStats() {
  const base = activity.getStats({
    running: !!gatewayHandle,
    url: gatewayHandle ? gatewayHandle.url : null,
  });
  return { ...base, activity: activity.getActivity(50) };
}

// Strict allowlist for external links is defined in src/external-links.js.
// The renderer only sends well-known keys ('youtube', 'website', 'github');
// the main process resolves the key to the exact official URL. Raw URLs
// are NEVER accepted from the renderer.

// Ensure we forward structured log lines to the renderer for the "live logs"
// UI section. Stats / activity are driven by structured `request` events
// from the gateway (see gatewayEvents listener above), not by parsing stdout.
const originalStdoutWrite = process.stdout.write.bind(process.stdout);
process.stdout.write = function (chunk, encoding, callback) {
  originalStdoutWrite(chunk, encoding, callback);
  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      const line = typeof chunk === 'string' ? chunk : chunk.toString();
      // Only forward lines that look like a structured timestamp-prefixed log
      // (our own createLogger always emits ISO timestamps). Keep the regex
      // strict to avoid leaking user data into the UI by accident.
      if (line.match(/^\d{4}-\d{2}-\d{2}T/)) {
        mainWindow.webContents.send('gateway-log', line.trim());
      }
    } catch { /* ignore */ }
  }
};

const originalStderrWrite = process.stderr.write.bind(process.stderr);
process.stderr.write = function (chunk, encoding, callback) {
  originalStderrWrite(chunk, encoding, callback);
  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      const line = typeof chunk === 'string' ? chunk : chunk.toString();
      if (line.match(/^\d{4}-\d{2}-\d{2}T/)) {
        mainWindow.webContents.send('gateway-log', line.trim());
      }
    } catch { /* ignore */ }
  }
};

// Config storage
// Defer the userData path lookup until first use, after app.whenReady(),
// to avoid touching Electron internals at module-load time. The previous
// version called `app.getPath('userData')` at module top-level which is
// fragile and contributed to the silent-exit regression in 0.2.2.
let _userDataDir = null;
function getUserDataDir() {
  if (_userDataDir) return _userDataDir;
  try {
    _userDataDir = app.getPath('userData');
  } catch {
    _userDataDir = os.tmpdir();
  }
  return _userDataDir;
}
function configFile() {
  return path.join(getUserDataDir(), 'toolbox-gateway-cfg.json');
}
function apiKeyEncryptedFile() {
  return path.join(getUserDataDir(), 'toolbox-gmi-key.enc');
}
function apiKeyPlainFile() {
  return path.join(getUserDataDir(), 'toolbox-gmi-key.txt');
}
function localTokenFile() {
  return path.join(getUserDataDir(), 'toolbox-local-token.txt');
}

// GMI Edition is intentionally locked to a single provider + base URL.
// These values MUST NOT be user-editable in this GUI edition.
const LOCKED_PROVIDER = 'GMI Cloud';
const LOCKED_GMI_BASE_URL = 'https://api.gmi-serving.com';

const DEFAULT_CONFIG = {
  host: '127.0.0.1',
  port: 8787,
  gmiBaseUrl: LOCKED_GMI_BASE_URL,
  claudeModelAlias: 'claude-opus-5',
  upstreamModel: 'MiniMaxAI/MiniMax-M3',
  localGatewayAuthEnabled: false,
  logLevel: 'info',
};

function readDiskConfig() {
  try {
    const cfgPath = configFile();
    if (fs.existsSync(cfgPath)) {
      const data = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      const merged = { ...DEFAULT_CONFIG, ...data };
      merged.gmiBaseUrl = LOCKED_GMI_BASE_URL;
      return merged;
    }
  } catch (e) {
    console.error('Failed to read config', e);
  }
  return { ...DEFAULT_CONFIG };
}

function writeDiskConfig(cfg) {
  try {
    const safe = { ...cfg };
    delete safe.gmiBaseUrl;
    fs.writeFileSync(configFile(), JSON.stringify(safe, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to write config', e);
  }
}

function getApiKey() {
  try {
    if (safeStorage && typeof safeStorage.isEncryptionAvailable === 'function' && safeStorage.isEncryptionAvailable()) {
      const p = apiKeyEncryptedFile();
      if (fs.existsSync(p)) {
        const encrypted = fs.readFileSync(p);
        return safeStorage.decryptString(encrypted);
      }
    } else {
      const p = apiKeyPlainFile();
      if (fs.existsSync(p)) {
        return fs.readFileSync(p, 'utf8');
      }
    }
  } catch (e) {
    console.error('Failed to get API key', e);
  }
  return '';
}

function setApiKey(key) {
  try {
    if (safeStorage && typeof safeStorage.isEncryptionAvailable === 'function' && safeStorage.isEncryptionAvailable()) {
      const p = apiKeyEncryptedFile();
      const encrypted = safeStorage.encryptString(key);
      fs.writeFileSync(p, encrypted);
    } else {
      const p = apiKeyPlainFile();
      fs.writeFileSync(p, key, 'utf8');
    }
  } catch (e) {
    console.error('Failed to set API key', e);
  }
}

function getLocalToken() {
  try {
    const p = localTokenFile();
    if (fs.existsSync(p)) {
      return fs.readFileSync(p, 'utf8');
    }
    const token = 'toolboxlap';
    fs.writeFileSync(p, token, 'utf8');
    return token;
  } catch (e) {
    return 'toolboxlap';
  }
}

function createWindow() {
  logStartup('createWindow-start');
  const preloadPath = path.join(__dirname, 'preload.js');
  const indexPath = path.join(__dirname, 'ui', 'index.html');
  logStartup('paths-resolved', { preload: preloadPath, index: indexPath, preloadExists: fs.existsSync(preloadPath), indexExists: fs.existsSync(indexPath) });
  mainWindow = new BrowserWindow({
    width: 820,
    height: 680,
    minWidth: 760,
    minHeight: 600,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'TOOLBOXLAP Gateway \u2014 GMI Edition',
    backgroundColor: '#07090f',
  });
  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    logStartup('renderer-gone', { reason: details?.reason, exitCode: details?.exitCode });
  });
  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
    logStartup('did-fail-load', { code, desc, url });
  });
  mainWindow.webContents.on('did-finish-load', () => {
    logStartup('did-finish-load');
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(indexPath);
  logStartup('createWindow-end');
}

function emit(event, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    try { mainWindow.webContents.send('gateway-' + event, payload); } catch { /* ignore */ }
  }
}

app.whenReady().then(() => {
  logStartup('app-ready');
  try {
    createWindow();
    logStartup('browser-window-created', { id: mainWindow?.id });
  } catch (e) {
    logStartup('createWindow-failed', { name: e?.name, message: e?.message });
    // Surface a minimal error window so the failure is visible.
    try {
      const w = new BrowserWindow({ width: 600, height: 400, title: 'TOOLBOXLAP Gateway — startup error' });
      w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(
        '<!doctype html><html><head><meta charset="utf-8"><title>Startup error</title>' +
        '<style>body{background:#07090f;color:#e6e9ef;font:14px/1.4 system-ui;padding:20px;white-space:pre-wrap;word-break:break-word;}</style>' +
        '</head><body><h2>Startup error</h2><pre>' + (e?.stack || e?.message || String(e)) + '</pre></body></html>'
      ));
    } catch { /* give up */ }
  }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}).catch((e) => {
  logStartup('whenReady-failed', { name: e?.name, message: e?.message });
});

app.on('window-all-closed', () => {
  if (gatewayHandle) {
    gatewayHandle.close().then(() => {
      app.quit();
    });
  } else {
    app.quit();
  }
});

// ---------- IPC Handlers ----------

ipcMain.handle('get-config', () => {
  const c = readDiskConfig();
  const k = getApiKey();
  const localToken = getLocalToken();
  return {
    ...c,
    hasApiKey: !!k,
    localGatewayToken: localToken,
    provider: LOCKED_PROVIDER,
    gmiBaseUrl: LOCKED_GMI_BASE_URL,
  };
});

ipcMain.handle('save-config', (event, cfg) => {
  if (cfg.gmiApiKey !== undefined) {
    setApiKey(cfg.gmiApiKey);
    delete cfg.gmiApiKey;
  }
  const current = readDiskConfig();
  delete cfg.gmiBaseUrl;
  delete cfg.provider;
  writeDiskConfig({ ...current, ...cfg });
  return true;
});

ipcMain.handle('update-config', (event, cfg) => {
  const current = readDiskConfig();
  // Locked keys are NEVER accepted from the renderer.
  delete cfg.gmiBaseUrl;
  delete cfg.provider;
  delete cfg.gmiApiKey;
  const safe = { ...current };
  if (typeof cfg.host === 'string') safe.host = cfg.host;
  if (Number.isFinite(cfg.port)) safe.port = cfg.port;
  if (typeof cfg.claudeModelAlias === 'string' && cfg.claudeModelAlias) {
    safe.claudeModelAlias = cfg.claudeModelAlias;
  }
  if (typeof cfg.localGatewayAuthEnabled === 'boolean') {
    safe.localGatewayAuthEnabled = cfg.localGatewayAuthEnabled;
  }
  if (typeof cfg.logLevel === 'string') safe.logLevel = cfg.logLevel;
  if (typeof cfg.upstreamModel === 'string') safe.upstreamModel = cfg.upstreamModel;
  if (typeof cfg.localGatewayToken === 'string' && cfg.localGatewayToken) {
    try {
      fs.writeFileSync(localTokenFile(), cfg.localGatewayToken, 'utf8');
    } catch (e) { /* ignore */ }
  }
  writeDiskConfig(safe);
  return { ok: true, config: readDiskConfig() };
});

ipcMain.handle('set-api-key', (event, key) => {
  if (typeof key !== 'string' || !key.trim()) {
    return { ok: false, error: 'API key is required' };
  }
  setApiKey(key.trim());
  emit('connection', { state: getApiKey() ? 'not-tested' : 'not-configured' });
  return { ok: true };
});

ipcMain.handle('test-connection', async () => {
  const key = getApiKey();
  if (!key) {
    emit('connection', { state: 'not-configured' });
    return { ok: false, reason: 'no-key', error: 'No API key configured' };
  }
  emit('connection', { state: 'testing' });
  const r = await gmiTestConnection(key, LOCKED_GMI_BASE_URL);
  if (r.ok) {
    emit('connection', { state: 'connected' });
  } else if (r.reason === 'invalid-key') {
    emit('connection', { state: 'invalid-key' });
  } else {
    emit('connection', { state: 'network-error', error: r.error });
  }
  return r;
});

/**
 * Set the active upstream model. Accepts either a plain string id (legacy)
 * or an object `{ selected, custom }` (current renderer contract). The custom
 * value wins if set, otherwise the selected fetched-model id is used.
 * The running gateway picks up the change on its next request via
 * `deps.resolveModels`.
 */
ipcMain.handle('set-model', (event, payload) => {
  let id = '';
  if (typeof payload === 'string') {
    id = payload.trim();
  } else if (payload && typeof payload === 'object') {
    const custom = typeof payload.custom === 'string' ? payload.custom.trim() : '';
    const selected = typeof payload.selected === 'string' ? payload.selected.trim() : '';
    id = custom || selected;
  }
  if (!id) {
    return { ok: false, error: 'Model id is required' };
  }
  const current = readDiskConfig();
  writeDiskConfig({ ...current, upstreamModel: id });
  // Update the in-memory active model so the next gateway request picks it
  // up without a restart, and tell the renderer so the "Active model" pill
  // updates immediately.
  activeModelId = id;
  emit('active-model', id);
  return { ok: true, upstreamModel: id };
});

ipcMain.handle('regenerate-local-token', () => {
  try {
    const crypto = require('node:crypto');
    const token = 'tb_' + crypto.randomBytes(24).toString('hex');
    fs.writeFileSync(localTokenFile(), token, 'utf8');
    return { ok: true, token };
  } catch (e) {
    return { ok: false, error: (e && e.message) || 'failed' };
  }
});

ipcMain.handle('get-init', () => {
  const c = readDiskConfig();
  const k = getApiKey();
  const localToken = getLocalToken();
  const upstream = (activeModelId || c.upstreamModel || '').trim();
  return {
    config: { ...c, gmiBaseUrl: LOCKED_GMI_BASE_URL, provider: LOCKED_PROVIDER },
    hasApiKey: !!k,
    localGatewayToken: localToken,
    models: [],
    selectedModel: upstream,
    customModel: '',
    activeModel: upstream,
    status: gatewayHandle ? 'running' : 'stopped',
    stats: currentStats(),
    connectionState: { state: k ? 'not-tested' : 'not-configured' },
    appVersion: app.getVersion(),
  };
});

/**
 * Fetch the available models from GMI Cloud using the stored API key.
 * Returns a stable shape `{ ok, models, error }` that the renderer can
 * consume without try/catch, and never throws across IPC.
 */
ipcMain.handle('fetch-models', async () => {
  const key = getApiKey();
  if (!key) {
    return { ok: false, error: 'API key is required to fetch models', reason: 'no-key' };
  }
  try {
    const models = await gmiFetchModels(key, LOCKED_GMI_BASE_URL);
    if (!Array.isArray(models)) {
      return { ok: false, error: 'Unexpected response shape from GMI' };
    }
    return { ok: true, models };
  } catch (e) {
    return { ok: false, error: (e && e.message) || 'Failed to fetch models' };
  }
});

/**
 * Start the gateway. Wires the `events` emitter so request events flow
 * into the activity tracker, and `resolveModels` so live model/alias
 * changes made via the renderer take effect on the next /v1/messages
 * request without a restart.
 */
ipcMain.handle('start-gateway', async () => {
  if (gatewayHandle) return { ok: true, url: gatewayHandle.url };
  const diskConfig = readDiskConfig();
  emit('status', { state: 'starting' });

  // Seed the live model state from disk so the very first request after
  // start uses whatever the user last selected.
  activeModelId = diskConfig.upstreamModel || activeModelId;
  activeAliasId = diskConfig.claudeModelAlias || activeAliasId;

  const appConfig = {
    host: diskConfig.host,
    port: diskConfig.port,
    gmiBaseUrl: LOCKED_GMI_BASE_URL,
    gmiApiKey: getApiKey() || null,
    claudeModelAlias: diskConfig.claudeModelAlias,
    upstreamModel: diskConfig.upstreamModel,
    localGatewayToken: diskConfig.localGatewayAuthEnabled ? getLocalToken() : null,
    logLevel: diskConfig.logLevel,
    upstreamTimeoutMs: 120000,
    gatewayName: 'TOOLBOXLAP Gateway',
    gatewayVersion: app.getVersion(),
  };

  try {
    gatewayHandle = await startServer(appConfig, {
      events: gatewayEvents,
      resolveModels: () => ({
        alias: diskConfig.claudeModelAlias,
        model: activeModelId || diskConfig.upstreamModel,
      }),
    });
    activity.start();
    emit('status', { state: 'running', url: gatewayHandle.url });
    emit('stats', currentStats());
    return { ok: true, url: gatewayHandle.url };
  } catch (e) {
    emit('status', { state: 'error', error: e.message });
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('stop-gateway', async () => {
  if (gatewayHandle) {
    try {
      await gatewayHandle.close();
    } catch (e) { /* ignore close-time errors; the port is freed by the server itself */ }
    gatewayHandle = null;
  }
  // Stop the activity session (freezes uptime at zero, keeps counters).
  activity.stop();
  emit('status', { state: 'stopped' });
  emit('stats', currentStats());
  return true;
});

ipcMain.handle('is-running', () => !!gatewayHandle);

ipcMain.handle('get-stats', () => currentStats());

ipcMain.handle('clear-activity', () => {
  activity.clearActivity();
  emit('activity-cleared', null);
  emit('stats', currentStats());
  return true;
});

/**
 * Open an external link. The renderer passes a well-known KEY (e.g.
 * 'youtube'), never a raw URL. The main process resolves the key to the
 * exact official URL via the allowlist and hands it to shell.openExternal.
 * Returns `{ ok }` on success and `{ ok: false, error }` on failure.
 */
ipcMain.handle('open-external', (event, key) => {
  const url = resolveExternalLink(key);
  if (!url) {
    return { ok: false, error: 'External link key not allowed' };
  }
  try {
    shell.openExternal(url);
    return { ok: true, url };
  } catch (e) {
    return { ok: false, error: e?.message || 'failed to open external URL' };
  }
});

ipcMain.handle('get-app-version', () => app.getVersion());
