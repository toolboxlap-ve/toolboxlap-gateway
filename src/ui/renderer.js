// src/ui/renderer.js
// TOOLBOXLAP Gateway - GMI Edition renderer.
// contextIsolation: true, nodeIntegration: false. All privileged ops go via window.api.

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

const BRAND = 'TOOLBOXLAP';
const EDITION = 'GMI Edition';
const LINKS = {
    youtube: 'https://www.youtube.com/@TOOLBOXLAP-u1c',
    website: 'https://toolboxlap.com/',
    github: 'https://github.com/toolboxlap-ve',
};

// Compact inline SVG icons (no external deps).
const SVG = {
    youtube: '<svg viewBox="0 0 24 24" aria-hidden="true" width="14" height="14" fill="currentColor"><path d="M21.6 7.2a2.5 2.5 0 0 0-1.7-1.8C18.3 5 12 5 12 5s-6.3 0-7.9.4A2.5 2.5 0 0 0 2.4 7.2 26 26 0 0 0 2 12a26 26 0 0 0 .4 4.8 2.5 2.5 0 0 0 1.7 1.8C5.7 19 12 19 12 19s6.3 0 7.9-.4a2.5 2.5 0 0 0 1.7-1.8A26 26 0 0 0 22 12a26 26 0 0 0-.4-4.8zM10 15V9l5.2 3z"/></svg>',
    website: '<svg viewBox="0 0 24 24" aria-hidden="true" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
    github: '<svg viewBox="0 0 24 24" aria-hidden="true" width="14" height="14" fill="currentColor"><path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.55v-2.13c-3.2.7-3.87-1.36-3.87-1.36-.52-1.34-1.28-1.7-1.28-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.2 1.77 1.2 1.03 1.77 2.71 1.26 3.37.97.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.47.11-3.07 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.64 1.6.24 2.78.12 3.07.74.81 1.18 1.84 1.18 3.1 0 4.43-2.69 5.41-5.26 5.69.41.36.78 1.06.78 2.14v3.17c0 .3.21.66.8.55C20.22 21.39 23.5 17.07 23.5 12 23.5 5.65 18.35.5 12 .5z"/></svg>',
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>',
    stop: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6 6h12v12H6z"/></svg>',
    copy: '<svg viewBox="0 0 24 24" aria-hidden="true" width="12" height="12" fill="currentColor"><path d="M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h11v14z"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true" width="12" height="12" fill="currentColor"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>',
    eye: '<svg viewBox="0 0 24 24" aria-hidden="true" width="14" height="14" fill="currentColor"><path d="M12 5C7 5 2.7 8.1 1 12c1.7 3.9 6 7 11 7s9.3-3.1 11-7c-1.7-3.9-6-7-11-7zm0 12a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-8a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"/></svg>',
    eyeOff: '<svg viewBox="0 0 24 24" aria-hidden="true" width="14" height="14" fill="currentColor"><path d="M2 4l2-2 18 18-2 2-3.4-3.4A12.9 12.9 0 0 1 12 19c-5 0-9.3-3.1-11-7a12.4 12.4 0 0 1 4.1-4.5L2 4zm10 5a3 3 0 0 1 3 3l-3-3zm-5.5 2.4A10 10 0 0 0 3.4 12a13 13 0 0 0 4.6 4.5L6.5 11.4zM12 5c5 0 9.3 3.1 11 7a12.4 12.4 0 0 1-3.3 4.1l-2.4-2.4A5 5 0 0 0 12 7a5 5 0 0 0-1.2.2L8.4 4.7A12.9 12.9 0 0 1 12 5z"/></svg>',
};

const AMP = String.fromCharCode(38) + 'amp;';
const LT = String.fromCharCode(38) + 'lt;';
const GT = String.fromCharCode(38) + 'gt;';
const QUOT = String.fromCharCode(38) + 'quot;';
function esc(s) {
    if (s == null) return '';
    return String(s)
        .replace(/&/g, AMP)
        .replace(/</g, LT)
        .replace(/>/g, GT)
        .replace(/"/g, QUOT);
}

const state = {
    config: null,
    hasApiKey: false,
    models: [],
    selectedModel: '',
    customModel: '',
    activeModel: '',
    status: 'stopped',
    stats: { running: false, requests: 0, success: 0, errors: 0, avgLatencySec: 0, uptimeMs: 0, url: null, activity: [] },
    connectionState: { state: 'not-configured' },
    logs: [],
    logExpanded: false,
    apiKeyVisible: false,
    localTokenVisible: false,
    appVersion: '',
};

function fmtUptime(ms) {
    if (!ms || ms < 0) return '00:00:00';
    const s = Math.floor(ms / 1000);
    const hh = String(Math.floor(s / 3600)).padStart(2, '0');
    const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    return hh + ':' + mm + ':' + ss;
}
function fmtLatency(sec) {
    if (sec == null || sec <= 0) return '-';
    if (sec < 1) return Math.round(sec * 1000) + 'ms';
    return sec.toFixed(1) + 's';
}

function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val == null ? '' : String(val);
}
function setVal(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val == null ? '' : String(val);
}
function showMsg(id, text, kind) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text || '';
    el.className = 'msg' + (kind ? ' ' + kind : '');
    el.style.display = text ? '' : 'none';
}

function renderHeader() {
    const v = state.appVersion || '0.2.9';
    setText('app-version', 'v' + v);
    setText('about-version', 'v' + v);
}

function renderStatusPill() {
    const pill = $('#status-pill');
    if (!pill) return;
    pill.setAttribute('data-state', state.status);
    let label = 'STOPPED';
    if (state.status === 'starting') label = 'STARTING';
    else if (state.status === 'running') label = 'RUNNING';
    else if (state.status === 'error') label = 'ERROR';
    setText('status-label', label);
}

function renderConnection() {
    if (state.config) setText('provider-badge', state.config.provider || 'GMI Cloud');
}

function renderModel() {
    const sel = $('#model-select');
    if (sel) {
        const prevVal = state.selectedModel;
        sel.innerHTML = '';
        const ph = document.createElement('option');
        ph.value = '';
        ph.textContent = state.models.length ? '- select a model -' : '- fetch models to populate -';
        sel.appendChild(ph);
        for (const m of state.models) {
            const opt = document.createElement('option');
            opt.value = m.id;
            opt.textContent = m.label || m.name || m.id;
            sel.appendChild(opt);
        }
        if (prevVal && state.models.find(m => m.id === prevVal)) sel.value = prevVal;
    }
    setVal('model-custom', state.customModel || '');
    setText('active-model-val', state.activeModel || '-');
    const amMsg = $('#active-model-msg');
    if (amMsg) amMsg.style.display = state.activeModel ? '' : 'none';
    setText('alias-to', state.activeModel || '-');
}

function renderStats() {
    const s = state.stats || {};
    const host = (state.config && state.config.host) || '127.0.0.1';
    const port = (state.config && state.config.port) || 8787;
    const url = s.url || ('http://' + host + ':' + port);
    setText('gateway-endpoint', url.replace(/^https?:\/\//, ''));
    setText('st-requests', String(s.requests || 0));
    setText('st-success', String(s.success || 0));
    setText('st-errors', String(s.errors || 0));
    setText('st-avg', fmtLatency(s.avgLatencySec));
    setText('st-uptime', fmtUptime(s.uptimeMs));
    const btn = $('#toggle-gateway');
    if (btn) {
        if (s.running) {
            btn.innerHTML = '<span class="btn-icon">' + SVG.stop + '</span><span>Stop Gateway</span>';
            btn.classList.remove('primary');
            btn.classList.add('danger');
            btn.setAttribute('data-state', 'running');
        } else {
            btn.innerHTML = '<span class="btn-icon">' + SVG.play + '</span><span>Start Gateway</span>';
            btn.classList.remove('danger');
            btn.classList.add('primary');
            btn.setAttribute('data-state', 'stopped');
        }
    }
}

function renderAdvanced() {
    if (!state.config) return;
    setVal('adv-host', state.config.host || '127.0.0.1');
    setVal('adv-port', state.config.port || 8787);
    setVal('adv-alias', state.config.claudeModelAlias || 'claude-opus-5');
    setVal('adv-token', state.config.localGatewayToken || '');
    const auth = $('#adv-auth'); if (auth) auth.checked = !!state.config.localGatewayAuthEnabled;
    const ll = $('#adv-loglevel'); if (ll) ll.value = state.config.logLevel || 'info';
    setText('about-baseurl', state.config.gmiBaseUrl || 'https://api.gmi-serving.com');
    setText('about-local', 'http://' + (state.config.host || '127.0.0.1') + ':' + (state.config.port || 8787));
    setText('about-alias', state.config.claudeModelAlias || 'claude-opus-5');
}

function renderClaudeSetup() {
    if (!state.config) return;
    const url = 'http://' + state.config.host + ':' + state.config.port;
    setText('claude-url', url);
    setText('alias-from', state.config.claudeModelAlias || 'claude-opus-5');
    const tokenEl = $('#claude-token');
    if (tokenEl) {
        const tok = state.config.localGatewayToken || '';
        tokenEl.textContent = tok || '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022';
        tokenEl.classList.toggle('masked', !tok);
    }
    setText('alias-to', state.activeModel || '-');
}

function renderActivity() {
    const list = $('#log-container');
    if (!list) return;
    const rows = (state.stats && state.stats.activity) || [];
    if (!rows.length) {
        list.innerHTML = '<div class="log-empty">No activity yet. Start the gateway and make a request.</div>';
        return;
    }
    const parts = [];
    for (const a of rows) {
        const ok = a.status >= 200 && a.status < 400;
        parts.push(
            '<div class="activity-row ' + (ok ? 'ok' : 'err') + '">' +
            '<span class="t">' + esc(a.t) + '</span>' +
            '<span class="m" title="' + esc(a.model) + '">' + esc(a.model) + '</span>' +
            '<span class="s">' + a.status + '</span>' +
            '<span class="l">' + esc(fmtLatency(a.latency)) + '</span>' +
            '</div>'
        );
    }
    list.innerHTML = parts.join('');
}

// ============================================================
// External links - delegated via IPC to shell.openExternal
// ============================================================
function openLink(key) {
    if (window.api && typeof window.api.openExternal === 'function') {
        window.api.openExternal(key);
    }
}

function bindExternalLinks() {
    const map = {
        youtube: '#link-youtube',
        website: '#link-website',
        github: '#link-github',
    };
    for (const key in map) {
        const el = document.querySelector(map[key]);
        if (!el) continue;
        el.addEventListener('click', (e) => {
            e.preventDefault();
            openLink(key);
        });
    }
}

// ============================================================
// Copy buttons
// ============================================================
function flashCopied(btn) {
    if (!btn) return;
    const orig = btn.dataset.orig || btn.textContent;
    btn.dataset.orig = orig;
    btn.innerHTML = '<span class="btn-icon">' + SVG.check + '</span><span>Copied</span>';
    btn.classList.add('copied');
    setTimeout(() => {
        btn.innerHTML = '<span class="btn-icon">' + SVG.copy + '</span><span>' + orig + '</span>';
        btn.classList.remove('copied');
    }, 1200);
}

function bindCopyButtons() {
    const buttons = document.querySelectorAll('button[data-copy]');
    buttons.forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-copy');
            const target = document.getElementById(id);
            if (!target) return;
            let text = target.value || target.dataset.fullValue || target.textContent || '';
            if (target.classList.contains('masked') || !text || text.indexOf('\u2022') !== -1) {
                // Pull the actual token from config without showing it in the UI.
                if (state.config && state.config.localGatewayToken && (id === 'claude-token' || id === 'adv-token')) {
                    text = state.config.localGatewayToken;
                }
            }
            try {
                await navigator.clipboard.writeText(text);
                flashCopied(btn);
            } catch (e) {
                // Fallback
                const ta = document.createElement('textarea');
                ta.value = text;
                document.body.appendChild(ta);
                ta.select();
                try { document.execCommand('copy'); flashCopied(btn); } catch { }
                document.body.removeChild(ta);
            }
        });
    });
}

// ============================================================
// Tabs
// ============================================================
function bindTabs() {
    const tabs = document.querySelectorAll('.tab-btn');
    const contents = document.querySelectorAll('.tab-content');
    tabs.forEach(t => {
        t.addEventListener('click', () => {
            const targetId = t.getAttribute('data-tab');
            tabs.forEach(btn => btn.classList.remove('active'));
            contents.forEach(panel => {
                panel.classList.remove('active');
                panel.style.display = 'none';
            });
            t.classList.add('active');
            const targetPanel = document.querySelector(`.tab-content[data-tab="${targetId}"]`);
            if (targetPanel) {
                targetPanel.classList.add('active');
                targetPanel.style.display = 'block';
            }
        });
    });
}

// ============================================================
// Key visibility
// ============================================================
function bindApiKeyVisibility() {
    const apiKey = document.getElementById('api-key');
    const btn = document.getElementById('api-key-toggle');
    if (apiKey && btn) {
        btn.addEventListener('click', () => {
            state.apiKeyVisible = !state.apiKeyVisible;
            apiKey.type = state.apiKeyVisible ? 'text' : 'password';
            btn.innerHTML = '<span class="btn-icon">' + (state.apiKeyVisible ? SVG.eyeOff : SVG.eye) + '</span><span>' + (state.apiKeyVisible ? 'Hide' : 'Show') + '</span>';
        });
    }
    const token = document.getElementById('adv-token');
    const tBtn = document.getElementById('adv-token-toggle');
    if (token && tBtn) {
        tBtn.addEventListener('click', () => {
            state.localTokenVisible = !state.localTokenVisible;
            token.type = state.localTokenVisible ? 'text' : 'password';
            tBtn.innerHTML = '<span class="btn-icon">' + (state.localTokenVisible ? SVG.eyeOff : SVG.eye) + '</span><span>' + (state.localTokenVisible ? 'Hide' : 'Show') + '</span>';
        });
    }
}

// ============================================================
// Event wiring
// ============================================================
function bindEvents() {
    // API key
    const apiKey = document.getElementById('api-key');
    const btnSave = document.getElementById('api-key-save');
    const btnTest = document.getElementById('api-key-test');
    if (btnSave) btnSave.addEventListener('click', async () => {
        const key = apiKey ? apiKey.value : '';
        if (!key) { showMsg('api-key-msg', 'Enter a GMI API key first.', 'err'); return; }
        showMsg('api-key-msg', 'Saving...', '');
        try {
            const r = await window.api.setApiKey(key);
            if (r && r.ok) {
                state.hasApiKey = true;
                showMsg('api-key-msg', 'API key saved securely.', 'ok');
            } else {
                showMsg('api-key-msg', (r && r.error) || 'Failed to save API key.', 'err');
            }
        } catch (e) { showMsg('api-key-msg', e && e.message || String(e), 'err'); }
    });
    if (btnTest) btnTest.addEventListener('click', async () => {
        showMsg('api-key-msg', 'Testing connection...', '');
        try {
            const r = await window.api.testConnection();
            if (r && r.ok) {
                state.connectionState = { state: 'connected' };
                showMsg('api-key-msg', 'Connected to GMI Cloud.', 'ok');
            } else if (r && r.reason === 'invalid-key') {
                state.connectionState = { state: 'invalid-key' };
                showMsg('api-key-msg', 'Invalid key. Check your GMI API key.', 'err');
            } else if (r && r.reason === 'network-error') {
                state.connectionState = { state: 'network-error' };
                showMsg('api-key-msg', 'Network error. Check your internet connection.', 'err');
            } else {
                showMsg('api-key-msg', (r && r.error) || 'Connection failed.', 'err');
            }
        } catch (e) { showMsg('api-key-msg', e && e.message || String(e), 'err'); }
    });

    // Models
    const btnFetch = document.getElementById('fetch-models');
    const sel = document.getElementById('model-select');
    const custom = document.getElementById('model-custom');
    if (btnFetch) btnFetch.addEventListener('click', async () => {
        showMsg('models-msg', 'Fetching models...', '');
        try {
            const r = await window.api.fetchModels();
            if (r && r.ok) {
                state.models = r.models || [];
                state.selectedModel = '';
                renderModel();
                showMsg('models-msg', state.models.length + ' models found.', 'ok');
            } else {
                showMsg('models-msg', (r && r.error) || 'Failed to fetch models.', 'err');
            }
        } catch (e) { showMsg('models-msg', e && e.message || String(e), 'err'); }
    });
    if (sel) sel.addEventListener('change', async () => {
        state.selectedModel = sel.value;
        if (state.selectedModel) {
            // Drop the custom value when user picks a fetched one.
            state.customModel = '';
            setVal('model-custom', '');
        }
        try { await window.api.setModel({ selected: state.selectedModel, custom: state.customModel }); } catch { }
    });
    if (custom) custom.addEventListener('change', async () => {
        state.customModel = custom.value.trim();
        try { await window.api.setModel({ selected: state.selectedModel, custom: state.customModel }); } catch { }
    });

    // Start / stop
    const tog = document.getElementById('toggle-gateway');
    if (tog) tog.addEventListener('click', async () => {
        if (state.stats && state.stats.running) {
            showMsg('gateway-msg', 'Stopping...', '');
            try { const r = await window.api.stopGateway(); showMsg('gateway-msg', 'Stopped.', 'ok'); } catch (e) { showMsg('gateway-msg', e.message, 'err'); }
        } else {
            showMsg('gateway-msg', 'Starting...', '');
            try {
                const r = await window.api.startGateway();
                if (r && r.ok) {
                    showMsg('gateway-msg', 'Running on ' + r.url, 'ok');
                    state.status = 'running';
                } else {
                    showMsg('gateway-msg', (r && r.error) || 'Failed to start.', 'err');
                    state.status = 'error';
                }
                renderStatusPill();
            } catch (e) { showMsg('gateway-msg', e.message, 'err'); }
        }
    });

    // Advanced
    const advSave = document.getElementById('adv-save');
    if (advSave) advSave.addEventListener('click', async () => {
        const cfg = {
            host: (document.getElementById('adv-host') || {}).value,
            port: parseInt(((document.getElementById('adv-port') || {}).value || '8787'), 10),
            claudeModelAlias: (document.getElementById('adv-alias') || {}).value,
            localGatewayAuthEnabled: !!(document.getElementById('adv-auth') || {}).checked,
            logLevel: (document.getElementById('adv-loglevel') || {}).value,
        };
        showMsg('adv-save-msg', 'Saving...', '');
        try {
            const r = await window.api.updateConfig(cfg);
            if (r && r.ok) {
                state.config = r.config || state.config;
                renderAdvanced();
                renderStats();
                renderClaudeSetup();
                showMsg('adv-save-msg', 'Saved.', 'ok');
            } else {
                showMsg('adv-save-msg', (r && r.error) || 'Save failed.', 'err');
            }
        } catch (e) { showMsg('adv-save-msg', e.message, 'err'); }
    });
    const regen = document.getElementById('adv-token-regen');
    if (regen) regen.addEventListener('click', async () => {
        if (!confirm('Regenerate the Local Gateway Token? You will need to re-enter it in Claude Desktop.')) return;
        try {
            const r = await window.api.regenerateLocalToken();
            if (r && r.ok && r.token) {
                state.config = state.config || {};
                state.config.localGatewayToken = r.token;
                setVal('adv-token', r.token);
                renderClaudeSetup();
                showMsg('adv-save-msg', 'Local token regenerated.', 'ok');
            } else {
                showMsg('adv-save-msg', (r && r.error) || 'Failed.', 'err');
            }
        } catch (e) { showMsg('adv-save-msg', e.message, 'err'); }
    });

    // Activity
    const clear = document.getElementById('log-clear');
    if (clear) clear.addEventListener('click', () => {
        state.stats = state.stats || {};
        state.stats.activity = [];
        renderActivity();
    });
    const expand = document.getElementById('log-expand');
    if (expand) expand.addEventListener('click', () => {
        state.logExpanded = !state.logExpanded;
        const c = document.getElementById('log-container');
        if (c) c.classList.toggle('expanded', state.logExpanded);
        if (expand) expand.textContent = state.logExpanded ? 'Collapse' : 'Expand';
    });
}

// ============================================================
// IPC subscriptions
// ============================================================
function bindIpc() {
    if (!window.api) return;
    if (typeof window.api.onStatus === 'function') {
        window.api.onStatus((evt) => {
            if (!evt) return;
            state.status = evt.status || state.status;
            renderStatusPill();
        });
    }
    if (typeof window.api.onStats === 'function') {
        window.api.onStats((stats) => {
            if (!stats) return;
            state.stats = Object.assign({}, state.stats, stats);
            if (stats.activeModel) state.activeModel = stats.activeModel;
            renderStats();
            renderModel();
            renderActivity();
        });
    }
    if (typeof window.api.onActivity === 'function') {
        window.api.onActivity((row) => {
            if (!row) return;
            state.stats = state.stats || {};
            state.stats.activity = state.stats.activity || [];
            state.stats.activity.unshift(row);
            if (state.stats.activity.length > 200) state.stats.activity.length = 200;
            renderActivity();
        });
    }
    if (typeof window.api.onActivityCleared === 'function') {
        window.api.onActivityCleared(() => {
            state.stats = state.stats || {};
            state.stats.activity = [];
            renderActivity();
        });
    }
    if (typeof window.api.onActiveModel === 'function') {
        window.api.onActiveModel((id) => {
            if (typeof id === 'string' && id) {
                state.activeModel = id;
                renderModel();
            }
        });
    }
}

// ============================================================
// Init
// ============================================================
async function init() {
    bindTabs();
    bindExternalLinks();
    bindCopyButtons();
    bindApiKeyVisibility();
    bindEvents();
    bindIpc();

    try {
        const init = await window.api.getInit();
        if (init) {
            state.config = init.config || state.config;
            state.hasApiKey = !!init.hasApiKey;
            state.models = init.models || [];
            state.selectedModel = init.selectedModel || '';
            state.customModel = init.customModel || '';
            state.activeModel = init.activeModel || '';
            state.status = init.status || 'stopped';
            state.stats = init.stats || state.stats;
            state.appVersion = init.appVersion || state.appVersion;
        }
    } catch (e) { /* ignore */ }

    renderHeader();
    renderConnection();
    renderModel();
    renderStats();
    renderAdvanced();
    renderClaudeSetup();
    renderStatusPill();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// Expose to global so debug console (if needed) can poke.
window.__toolboxlap = { state, render: { renderStats, renderActivity, renderModel, renderAdvanced, renderClaudeSetup } };
