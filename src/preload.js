// src/preload.js
// Narrow bridge between renderer and main process.
// contextIsolation: true, nodeIntegration: false. NEVER expose node, fs, or
// arbitrary IPC. Only the allow-listed channels below.
const { contextBridge, ipcRenderer } = require('electron');

// Helper for safe event subscriptions that return an unsubscribe function.
function subscribe(channel, cb) {
  const listener = (_e, payload) => {
    try { cb(payload); } catch (_) { /* swallow */ }
  };
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('api', {
  // ---------- Config / state ----------
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (cfg) => ipcRenderer.invoke('save-config', cfg),
  updateConfig: (cfg) => ipcRenderer.invoke('update-config', cfg),
  getInit: () => ipcRenderer.invoke('get-init'),

  // ---------- GMI credentials / connection ----------
  setApiKey: (key) => ipcRenderer.invoke('set-api-key', key),
  testConnection: () => ipcRenderer.invoke('test-connection'),

  // ---------- Models ----------
  fetchModels: () => ipcRenderer.invoke('fetch-models'),
  setModel: (id) => ipcRenderer.invoke('set-model', id),

  // ---------- Gateway lifecycle ----------
  startGateway: () => ipcRenderer.invoke('start-gateway'),
  stopGateway: () => ipcRenderer.invoke('stop-gateway'),
  isRunning: () => ipcRenderer.invoke('is-running'),

  // ---------- Local token ----------
  regenerateLocalToken: () => ipcRenderer.invoke('regenerate-local-token'),

  // ---------- External links ----------
  openExternal: (url) => ipcRenderer.invoke('open-external', url),

  // ---------- App info ----------
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // ---------- Stats / activity ----------
  getStats: () => ipcRenderer.invoke('get-stats'),
  clearActivity: () => ipcRenderer.invoke('clear-activity'),

  // ---------- Clipboard (renderer-side helper, no IPC needed for write) ----------
  copyToClipboard: (text) => {
    // contextBridge cannot return promises across directly with arbitrary
    // arguments, so we just forward to navigator.clipboard in the renderer.
    // Kept as a placeholder for API symmetry.
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return Promise.reject(new Error('Clipboard API unavailable'));
  },

  // ---------- Event subscriptions (each returns an unsubscribe fn) ----------
  onStatus: (cb) => subscribe('gateway-status', cb),
  onStats: (cb) => subscribe('gateway-stats', cb),
  onLog: (cb) => subscribe('gateway-log', cb),
  onActivity: (cb) => subscribe('gateway-activity', cb),
  onActivityCleared: (cb) => subscribe('gateway-activity-cleared', cb),
  onConnection: (cb) => subscribe('gateway-connection', cb),
  onActiveModel: (cb) => subscribe('gateway-active-model', cb),
});
