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
const { app, BrowserWindow, ipcMain, safeStorage, shell, Tray, Menu, nativeImage } = electron;
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';

import { startServer } from './server.js';
import { globalProviderRegistry } from './providers/provider-registry.js';
import './providers/gmi-provider.js';
import './providers/openrouter-provider.js';
import './providers/deepseek-provider.js';
import { createActivityTracker } from './activity.js';
import { resolveExternalLink } from './external-links.js';

const require = createRequire(import.meta.url);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ASSETS_DIR = (() => {
  const rootAssets = path.join(__dirname, '..', 'assets');
  if (fs.existsSync(rootAssets)) return rootAssets;
  const localAssets = path.join(__dirname, 'assets');
  if (fs.existsSync(localAssets)) return localAssets;
  return rootAssets;
})();

function getAppIconPath() {
  const ico = path.join(ASSETS_DIR, 'icon.ico');
  if (fs.existsSync(ico)) return ico;
  const png = path.join(ASSETS_DIR, 'icon.png');
  if (fs.existsSync(png)) return png;
  return null;
}

function getTrayIcon(state = 'stopped') {
  const fileName = state === 'running' ? 'tray-running.png' : 'tray-stopped.png';
  const p = path.join(ASSETS_DIR, fileName);
  if (fs.existsSync(p)) {
    return nativeImage.createFromPath(p);
  }
  const fallback = getAppIconPath();
  return fallback ? nativeImage.createFromPath(fallback) : null;
}

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
      const w = new BrowserWindow({ width: 600, height: 400, title: 'TOOLBOXLAP Gateway — startup error', icon: getAppIconPath() });
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
function apiKeyEncryptedFile(providerId = 'gmi') {
  return path.join(getUserDataDir(), `toolbox-key-${providerId}.enc`);
}
function apiKeyPlainFile(providerId = 'gmi') {
  return path.join(getUserDataDir(), `toolbox-key-${providerId}.txt`);
}
function legacyApiKeyEncryptedFile() {
  return path.join(getUserDataDir(), 'toolbox-gmi-key.enc');
}
function legacyApiKeyPlainFile() {
  return path.join(getUserDataDir(), 'toolbox-gmi-key.txt');
}
function localTokenFile() {
  return path.join(getUserDataDir(), 'toolbox-local-token.txt');
}

const DEFAULT_CONFIG = {
  host: '127.0.0.1',
  port: 8787,
  activeProvider: 'openrouter',
  claudeModelAlias: 'claude-opus-5',
  localGatewayAuthEnabled: false,
  logLevel: 'info',
  providers: {
    gmi: {
      baseUrl: 'https://api.gmi-serving.com',
      model: 'MiniMaxAI/MiniMax-M3',
      favorites: [],
      cachedModels: [],
    },
    openrouter: {
      baseUrl: 'https://openrouter.ai/api/v1',
      model: '',
      favorites: [],
      cachedModels: [],
    },
    deepseek: {
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-chat',
      favorites: [],
      cachedModels: [],
    },
  },
};

function readDiskConfig() {
  try {
    const cfgPath = configFile();
    if (fs.existsSync(cfgPath)) {
      const data = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      const merged = { ...DEFAULT_CONFIG, ...data };
      merged.providers = { ...DEFAULT_CONFIG.providers, ...(data.providers || {}) };

      // Legacy single-provider migration
      if (data.upstreamModel && (!data.providers || !data.providers.gmi)) {
        merged.providers.gmi = {
          baseUrl: data.gmiBaseUrl || DEFAULT_CONFIG.providers.gmi.baseUrl,
          model: data.upstreamModel,
        };
      }
      if (!merged.activeProvider) {
        merged.activeProvider = 'openrouter';
      }
      return merged;
    }
  } catch (e) {
    console.error('Failed to read config', e);
  }
  return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
}

function writeDiskConfig(cfg) {
  try {
    fs.writeFileSync(configFile(), JSON.stringify(cfg, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to write config', e);
  }
}

function ensureFirstRunDirectories() {
  try {
    const userData = getUserDataDir();
    if (!fs.existsSync(userData)) {
      fs.mkdirSync(userData, { recursive: true });
    }
    const logsDir = path.join(userData, 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    const cfgPath = configFile();
    if (!fs.existsSync(cfgPath)) {
      writeDiskConfig(DEFAULT_CONFIG);
    }
    if (safeStorage && typeof safeStorage.isEncryptionAvailable === 'function') {
      logStartup('safeStorage-available', { available: safeStorage.isEncryptionAvailable() });
    }
  } catch (e) {
    console.error('Failed to initialize first run directories', e);
  }
}

function getApiKey(providerId = 'gmi') {
  const normId = (providerId || 'gmi').toLowerCase();
  try {
    const isEnc = safeStorage && typeof safeStorage.isEncryptionAvailable === 'function' && safeStorage.isEncryptionAvailable();
    if (isEnc) {
      const p = apiKeyEncryptedFile(normId);
      if (fs.existsSync(p)) {
        return safeStorage.decryptString(fs.readFileSync(p));
      }
      if (normId === 'gmi') {
        const leg = legacyApiKeyEncryptedFile();
        if (fs.existsSync(leg)) {
          return safeStorage.decryptString(fs.readFileSync(leg));
        }
      }
    }
    const plain = apiKeyPlainFile(normId);
    if (fs.existsSync(plain)) {
      return fs.readFileSync(plain, 'utf8');
    }
    if (normId === 'gmi') {
      const legPlain = legacyApiKeyPlainFile();
      if (fs.existsSync(legPlain)) {
        return fs.readFileSync(legPlain, 'utf8');
      }
    }
  } catch (e) {
    console.error('Failed to get API key for', normId, e);
  }
  return '';
}

function setApiKey(providerIdOrKey, maybeKey) {
  let providerId = 'gmi';
  let key = '';
  if (maybeKey === undefined) {
    key = String(providerIdOrKey || '');
    const cfg = readDiskConfig();
    providerId = cfg.activeProvider || 'gmi';
  } else {
    providerId = String(providerIdOrKey || 'gmi');
    key = String(maybeKey || '');
  }
  const normId = providerId.toLowerCase();
  try {
    const isEnc = safeStorage && typeof safeStorage.isEncryptionAvailable === 'function' && safeStorage.isEncryptionAvailable();
    if (isEnc) {
      const p = apiKeyEncryptedFile(normId);
      fs.writeFileSync(p, safeStorage.encryptString(key));
    } else {
      const p = apiKeyPlainFile(normId);
      fs.writeFileSync(p, key, 'utf8');
    }
  } catch (e) {
    console.error('Failed to set API key for', normId, e);
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
  const appIcon = getAppIconPath();
  mainWindow = new BrowserWindow({
    width: 820,
    height: 680,
    minWidth: 760,
    minHeight: 600,
    icon: appIcon,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'TOOLBOXLAP Gateway',
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

let tray = null;

function showAndFocusMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.focus();
}

function openLogsLocation() {
  try {
    const startupLog = _safeLogPath();
    const userData = getUserDataDir();
    if (fs.existsSync(startupLog)) {
      shell.showItemInFolder(startupLog);
    } else {
      shell.openPath(userData);
    }
  } catch (_) {
    try { shell.openPath(getUserDataDir()); } catch (_) { /* ignore */ }
  }
}

function buildTrayMenu(isRunning) {
  const template = [
    { label: 'TOOLBOXLAP Gateway', enabled: false },
    { type: 'separator' },
    { label: isRunning ? '● Running' : '● Stopped', enabled: false },
    { type: 'separator' },
    {
      label: 'Open Dashboard',
      click: () => {
        showAndFocusMainWindow();
      },
    },
    {
      label: 'Open Logs',
      click: () => {
        openLogsLocation();
      },
    },
    {
      label: 'Restart Gateway',
      click: async () => {
        await restartGatewayInternal();
      },
    },
    {
      label: isRunning ? 'Stop Gateway' : 'Start Gateway',
      click: async () => {
        if (isRunning) {
          await stopGatewayInternal();
        } else {
          await startGatewayInternal();
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.quit();
      },
    },
  ];
  return Menu.buildFromTemplate(template);
}

function updateTray(state) {
  if (!tray || tray.isDestroyed()) return;
  const isRunning = state === 'running' || (state !== 'stopped' && !!gatewayHandle);
  const icon = getTrayIcon(isRunning ? 'running' : 'stopped');
  if (icon) {
    tray.setImage(icon);
  }
  const tooltip = isRunning ? 'TOOLBOXLAP Gateway — Running' : 'TOOLBOXLAP Gateway — Stopped';
  tray.setToolTip(tooltip);
  tray.setContextMenu(buildTrayMenu(isRunning));
}

function createTray() {
  if (tray && !tray.isDestroyed()) return;
  try {
    const initialIcon = getTrayIcon('stopped');
    if (!initialIcon) return;
    tray = new Tray(initialIcon);
    tray.setToolTip('TOOLBOXLAP Gateway — Stopped');
    tray.setContextMenu(buildTrayMenu(false));

    tray.on('click', () => {
      showAndFocusMainWindow();
    });
    tray.on('double-click', () => {
      showAndFocusMainWindow();
    });
  } catch (e) {
    logStartup('createTray-error', { message: e?.message });
  }
}

app.whenReady().then(() => {
  logStartup('app-ready');
  ensureFirstRunDirectories();
  try {
    createWindow();
    createTray();
    logStartup('browser-window-created', { id: mainWindow?.id });
  } catch (e) {
    logStartup('createWindow-failed', { name: e?.name, message: e?.message });
    // Surface a minimal error window so the failure is visible.
    try {
      const w = new BrowserWindow({ width: 600, height: 400, title: 'TOOLBOXLAP Gateway — startup error', icon: getAppIconPath() });
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
  if (tray && !tray.isDestroyed()) {
    try { tray.destroy(); } catch (_) { /* ignore */ }
    tray = null;
  }
  if (gatewayHandle) {
    gatewayHandle.close().then(() => {
      app.quit();
    });
  } else {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (tray && !tray.isDestroyed()) {
    try { tray.destroy(); } catch (_) { /* ignore */ }
    tray = null;
  }
});

// ---------- IPC Handlers ----------

ipcMain.handle('list-providers', () => {
  return globalProviderRegistry.listManifests();
});

ipcMain.handle('get-provider-settings', (event, providerId) => {
  const cfg = readDiskConfig();
  const pId = (providerId || cfg.activeProvider || 'gmi').toLowerCase();
  const manifest = globalProviderRegistry.getManifest(pId);
  const defaultBaseUrl = manifest ? manifest.defaultBaseUrl : '';
  const pSettings = (cfg.providers && cfg.providers[pId]) || {};
  return {
    providerId: pId,
    baseUrl: pSettings.baseUrl || defaultBaseUrl,
    model: pSettings.model || '',
    hasApiKey: !!getApiKey(pId),
    manifest: manifest || null,
    cachedModels: Array.isArray(pSettings.cachedModels) ? pSettings.cachedModels : [],
    favorites: Array.isArray(pSettings.favorites) ? pSettings.favorites : [],
  };
});

ipcMain.handle('set-provider', (event, providerId) => {
  if (!providerId || !globalProviderRegistry.has(providerId)) {
    return { ok: false, error: `Unknown provider: '${providerId}'` };
  }
  const pId = providerId.toLowerCase();
  const cfg = readDiskConfig();
  cfg.activeProvider = pId;
  const manifest = globalProviderRegistry.getManifest(pId);
  const pSettings = (cfg.providers && cfg.providers[pId]) || {};
  activeModelId = pSettings.model || '';
  const cachedModels = Array.isArray(pSettings.cachedModels) ? pSettings.cachedModels : [];
  const favorites = Array.isArray(pSettings.favorites) ? pSettings.favorites : [];
  writeDiskConfig(cfg);
  emit('active-provider', pId);
  emit('active-model', activeModelId);
  return {
    ok: true,
    providerId: pId,
    manifest,
    settings: {
      baseUrl: pSettings.baseUrl || manifest?.defaultBaseUrl || '',
      model: activeModelId,
      hasApiKey: !!getApiKey(pId),
      cachedModels,
      favorites,
    },
  };
});

ipcMain.handle('save-provider-settings', (event, payload) => {
  const cfg = readDiskConfig();
  const pId = (payload?.providerId || cfg.activeProvider || 'gmi').toLowerCase();
  if (!cfg.providers) cfg.providers = {};
  if (!cfg.providers[pId]) cfg.providers[pId] = {};

  if (payload.baseUrl !== undefined) {
    cfg.providers[pId].baseUrl = payload.baseUrl;
  }
  if (payload.model !== undefined) {
    cfg.providers[pId].model = payload.model;
    if (cfg.activeProvider === pId) {
      activeModelId = payload.model;
      emit('active-model', activeModelId);
    }
  }
  if (typeof payload.apiKey === 'string') {
    setApiKey(pId, payload.apiKey.trim());
  }
  writeDiskConfig(cfg);
  return {
    ok: true,
    providerId: pId,
    settings: cfg.providers[pId],
    hasApiKey: !!getApiKey(pId),
  };
});

ipcMain.handle('get-config', () => {
  const c = readDiskConfig();
  const activePId = (c.activeProvider || 'gmi').toLowerCase();
  const k = getApiKey(activePId);
  const localToken = getLocalToken();
  const manifest = globalProviderRegistry.getManifest(activePId);
  const pSettings = (c.providers && c.providers[activePId]) || {};
  return {
    ...c,
    provider: manifest?.displayName || activePId,
    gmiBaseUrl: pSettings.baseUrl || manifest?.defaultBaseUrl || '',
    upstreamModel: activeModelId || pSettings.model || '',
    hasApiKey: !!k,
    localGatewayToken: localToken,
  };
});

ipcMain.handle('save-config', (event, cfg) => {
  const current = readDiskConfig();
  const merged = { ...current, ...cfg };
  writeDiskConfig(merged);
  return true;
});

ipcMain.handle('update-config', (event, cfg) => {
  const current = readDiskConfig();
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
  if (typeof cfg.localGatewayToken === 'string' && cfg.localGatewayToken) {
    try {
      fs.writeFileSync(localTokenFile(), cfg.localGatewayToken, 'utf8');
    } catch (e) { /* ignore */ }
  }
  writeDiskConfig(safe);
  return { ok: true, config: readDiskConfig() };
});

ipcMain.handle('set-api-key', (event, arg1, arg2) => {
  let providerId = '';
  let key = '';
  if (arg2 === undefined) {
    key = arg1;
    const cfg = readDiskConfig();
    providerId = cfg.activeProvider || 'gmi';
  } else {
    providerId = arg1;
    key = arg2;
  }
  if (typeof key !== 'string' || !key.trim()) {
    return { ok: false, error: 'API key is required' };
  }
  setApiKey(providerId, key.trim());
  emit('connection', { state: getApiKey(providerId) ? 'not-tested' : 'not-configured' });
  return { ok: true };
});

ipcMain.handle('test-connection', async (event, providerId) => {
  const cfg = readDiskConfig();
  const pId = (providerId || cfg.activeProvider || 'gmi').toLowerCase();
  if (!globalProviderRegistry.has(pId)) {
    return { ok: false, reason: 'unknown-provider', error: `Provider '${pId}' not found` };
  }
  const provider = globalProviderRegistry.get(pId);
  const key = getApiKey(pId);
  const manifest = globalProviderRegistry.getManifest(pId);
  const pSettings = (cfg.providers && cfg.providers[pId]) || {};
  const baseUrl = pSettings.baseUrl || provider.defaultBaseUrl;

  if (manifest?.supportsApiKey && !key) {
    emit('connection', { state: 'not-configured' });
    return { ok: false, reason: 'no-key', error: 'No API key configured' };
  }

  emit('connection', { state: 'testing' });
  const r = await provider.testConnection(key, baseUrl);
  if (r.ok) {
    emit('connection', { state: 'connected' });
  } else if (r.reason === 'invalid-key') {
    emit('connection', { state: 'invalid-key' });
  } else {
    emit('connection', { state: 'network-error', error: r.error });
  }
  return r;
});

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
  const pId = (payload?.providerId || current.activeProvider || 'gmi').toLowerCase();
  if (!current.providers) current.providers = {};
  if (!current.providers[pId]) current.providers[pId] = {};
  current.providers[pId].model = id;
  writeDiskConfig(current);

  if (current.activeProvider === pId) {
    activeModelId = id;
    emit('active-model', id);
  }
  return { ok: true, upstreamModel: id, providerId: pId };
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
  const activePId = (c.activeProvider || 'gmi').toLowerCase();
  const activeManifest = globalProviderRegistry.getManifest(activePId);
  const pSettings = (c.providers && c.providers[activePId]) || {};
  const k = getApiKey(activePId);
  const localToken = getLocalToken();
  const upstream = (activeModelId || pSettings.model || '').trim();
  const cachedModels = Array.isArray(pSettings.cachedModels) ? pSettings.cachedModels : [];
  const favorites = Array.isArray(pSettings.favorites) ? pSettings.favorites : [];
  return {
    config: { ...c, provider: activeManifest?.displayName || activePId },
    activeProviderId: activePId,
    activeManifest,
    providers: globalProviderRegistry.listManifests(),
    providerSettings: {
      baseUrl: pSettings.baseUrl || activeManifest?.defaultBaseUrl || '',
      model: upstream,
      hasApiKey: !!k,
      cachedModels,
      favorites,
    },
    hasApiKey: !!k,
    localGatewayToken: localToken,
    models: cachedModels,
    cachedModels,
    favorites,
    selectedModel: upstream,
    customModel: '',
    activeModel: upstream,
    status: gatewayHandle ? 'running' : 'stopped',
    stats: currentStats(),
    connectionState: { state: k ? 'not-tested' : 'not-configured' },
    appVersion: app.getVersion(),
  };
});

ipcMain.handle('fetch-models', async (event, providerId) => {
  const cfg = readDiskConfig();
  const pId = (providerId || cfg.activeProvider || 'gmi').toLowerCase();
  if (!globalProviderRegistry.has(pId)) {
    return { ok: false, error: `Provider '${pId}' not found` };
  }
  const provider = globalProviderRegistry.get(pId);
  const key = getApiKey(pId);
  const manifest = globalProviderRegistry.getManifest(pId);
  const pSettings = (cfg.providers && cfg.providers[pId]) || {};
  const baseUrl = pSettings.baseUrl || provider.defaultBaseUrl;

  if (manifest?.supportsApiKey && !key) {
    return { ok: false, error: 'API key is required to fetch models', reason: 'no-key' };
  }

  try {
    const models = await provider.fetchModels(key, baseUrl);
    const modelList = Array.isArray(models) ? models : [];
    // Cache to disk
    const current = readDiskConfig();
    if (!current.providers) current.providers = {};
    if (!current.providers[pId]) current.providers[pId] = {};
    current.providers[pId].cachedModels = modelList;
    writeDiskConfig(current);
    return { ok: true, models: modelList };
  } catch (e) {
    return { ok: false, error: (e && e.message) || 'Failed to fetch models' };
  }
});

ipcMain.handle('toggle-favorite-model', (event, providerId, modelId) => {
  if (!modelId || typeof modelId !== 'string') {
    return { ok: false, error: 'Model ID is required' };
  }
  const cfg = readDiskConfig();
  const pId = (providerId || cfg.activeProvider || 'gmi').toLowerCase();
  if (!cfg.providers) cfg.providers = {};
  if (!cfg.providers[pId]) cfg.providers[pId] = {};
  const favs = Array.isArray(cfg.providers[pId].favorites) ? [...cfg.providers[pId].favorites] : [];
  const idx = favs.indexOf(modelId);
  if (idx === -1) {
    favs.push(modelId);
  } else {
    favs.splice(idx, 1);
  }
  cfg.providers[pId].favorites = favs;
  writeDiskConfig(cfg);
  emit('favorites', { providerId: pId, favorites: favs });
  return { ok: true, providerId: pId, favorites: favs };
});

async function startGatewayInternal() {
  if (gatewayHandle) return { ok: true, url: gatewayHandle.url };
  const diskConfig = readDiskConfig();
  const activePId = (diskConfig.activeProvider || 'gmi').toLowerCase();
  const pSettings = (diskConfig.providers && diskConfig.providers[activePId]) || {};
  const pManifest = globalProviderRegistry.getManifest(activePId);

  emit('status', { state: 'starting' });
  updateTray('starting');

  activeModelId = pSettings.model || activeModelId;
  activeAliasId = diskConfig.claudeModelAlias || activeAliasId;

  const appConfig = {
    host: diskConfig.host,
    port: diskConfig.port,
    activeProvider: activePId,
    apiKey: getApiKey(activePId) || null,
    baseUrl: pSettings.baseUrl || pManifest?.defaultBaseUrl,
    gmiBaseUrl: pSettings.baseUrl || pManifest?.defaultBaseUrl || 'https://api.gmi-serving.com',
    gmiApiKey: getApiKey(activePId) || null,
    claudeModelAlias: diskConfig.claudeModelAlias,
    upstreamModel: activeModelId || pSettings.model || diskConfig.upstreamModel,
    localGatewayToken: diskConfig.localGatewayAuthEnabled ? getLocalToken() : null,
    logLevel: diskConfig.logLevel,
    upstreamTimeoutMs: 120000,
    gatewayName: 'TOOLBOXLAP Gateway',
    gatewayVersion: app.getVersion(),
  };

  try {
    gatewayHandle = await startServer(appConfig, {
      events: gatewayEvents,
      resolveModels: () => {
        const c = readDiskConfig();
        const p = (c.activeProvider || 'gmi').toLowerCase();
        const s = (c.providers && c.providers[p]) || {};
        return {
          alias: c.claudeModelAlias,
          model: activeModelId || s.model || c.upstreamModel,
        };
      },
      resolveProvider: () => {
        const c = readDiskConfig();
        const pId = (c.activeProvider || 'gmi').toLowerCase();
        const s = (c.providers && c.providers[pId]) || {};
        const manifest = globalProviderRegistry.getManifest(pId);
        return {
          providerId: pId,
          apiKey: getApiKey(pId) || null,
          baseUrl: s.baseUrl || manifest?.defaultBaseUrl,
          timeoutMs: 120000,
        };
      },
    });
    activity.start();
    updateTray('running');
    emit('status', { state: 'running', url: gatewayHandle.url });
    emit('stats', currentStats());
    return { ok: true, url: gatewayHandle.url };
  } catch (e) {
    updateTray('error');
    emit('status', { state: 'error', error: e.message });
    return { ok: false, error: e.message };
  }
}

async function stopGatewayInternal() {
  if (gatewayHandle) {
    try {
      await gatewayHandle.close();
    } catch (e) { /* ignore close-time errors; the port is freed by the server itself */ }
    gatewayHandle = null;
  }
  // Stop the activity session (freezes uptime at zero, keeps counters).
  activity.stop();
  updateTray('stopped');
  emit('status', { state: 'stopped' });
  emit('stats', currentStats());
  return true;
}

async function restartGatewayInternal() {
  await stopGatewayInternal();
  return await startGatewayInternal();
}

ipcMain.handle('start-gateway', async () => {
  return await startGatewayInternal();
});

ipcMain.handle('stop-gateway', async () => {
  return await stopGatewayInternal();
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
