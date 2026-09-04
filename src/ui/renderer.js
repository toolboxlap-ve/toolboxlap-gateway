// src/ui/renderer.js
// TOOLBOXLAP Gateway - Dynamic Multi-Provider Management UI.
// contextIsolation: true, nodeIntegration: false. All privileged ops go via window.api.
// 100% Manifest-driven: zero provider-specific hardcoded conditions.

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

const BRAND = 'TOOLBOXLAP';
const EDITION = 'Multi-Provider';

// Compact inline SVG icons (no external deps).
const SVG = {
    youtube: '<svg viewBox="0 0 24 24" aria-hidden="true" width="14" height="14" fill="currentColor"><path d="M21.6 7.2a2.5 2.5 0 0 0-1.7-1.8C18.3 5 12 5 12 5s-6.3 0-7.9.4A2.5 2.5 0 0 0 2.4 7.2 26 26 0 0 0 2 12a26 26 0 0 0 .4 4.8 2.5 2.5 0 0 0 1.7 1.8C5.7 19 12 19 12 19s6.3 0 7.9-.4a2.5 2.5 0 0 0 1.7-1.8A26 26 0 0 0 22 12a26 26 0 0 0-.4-4.8zM10 15V9l5.2 3z"/></svg>',
    website: '<svg viewBox="0 0 24 24" aria-hidden="true" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
    docs: '<svg viewBox="0 0 24 24" aria-hidden="true" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
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

// Global UI State
const state = {
    config: null,
    providers: [],          // array of ProviderManifest objects
    activeProviderId: '',   // active provider id string
    activeManifest: null,   // ProviderManifest for the active provider
    providerSettings: {},   // { baseUrl, model, hasApiKey }
    hasApiKey: false,
    models: [],
    cachedModels: [],
    favorites: [],
    modelsSource: 'none',   // 'fetched' | 'cached' | 'none'
    searchQuery: '',
    dropdownOpen: false,
    focusedIndex: -1,
    filteredModelsList: [],
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
    if (sec == null || sec <= 0) return '—';
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

// ============================================================
// Manifest-driven Rendering
// ============================================================

function renderProviderSelect() {
    const sel = document.getElementById('provider-select');
    if (!sel) return;
    sel.innerHTML = '';
    for (const manifest of state.providers) {
        const opt = document.createElement('option');
        opt.value = manifest.id;
        opt.textContent = manifest.displayName || manifest.id;
        sel.appendChild(opt);
    }
    if (state.activeProviderId) {
        sel.value = state.activeProviderId;
    }
}

function renderProviderDetails() {
    const manifest = state.activeManifest;
    if (!manifest) return;

    // 1. Display Name & Badges
    const name = manifest.displayName || manifest.id;
    setText('provider-badge', name);
    setText('summary-provider', name);
    setText('about-provider', name);

    // 2. Description
    setText('provider-desc', manifest.description || '');

    // 3. Official Links (Website & Documentation)
    const linksContainer = document.getElementById('provider-links');
    if (linksContainer) {
        linksContainer.innerHTML = '';
        if (manifest.website) {
            const btnWeb = document.createElement('button');
            btnWeb.type = 'button';
            btnWeb.className = 'provider-link-btn';
            btnWeb.innerHTML = '<span class="btn-icon">' + SVG.website + '</span><span>' + esc(manifest.website.replace(/^https?:\/\//, '')) + '</span>';
            btnWeb.addEventListener('click', () => openExternalUrl(manifest.website));
            linksContainer.appendChild(btnWeb);
        }
        if (manifest.documentationUrl) {
            const btnDocs = document.createElement('button');
            btnDocs.type = 'button';
            btnDocs.className = 'provider-link-btn';
            btnDocs.innerHTML = '<span class="btn-icon">' + SVG.docs + '</span><span>Documentation</span>';
            btnDocs.addEventListener('click', () => openExternalUrl(manifest.documentationUrl));
            linksContainer.appendChild(btnDocs);
        }
    }

    // 4. Capabilities (Streaming, Tools, Vision, Thinking, Reasoning)
    const capsContainer = document.getElementById('capabilities-row');
    if (capsContainer) {
        capsContainer.innerHTML = '';
        const capDefs = [
            { key: 'supportsStreaming', label: 'Streaming' },
            { key: 'supportsTools', label: 'Tools' },
            { key: 'supportsVision', label: 'Vision' },
            { key: 'supportsThinking', label: 'Thinking' },
            { key: 'supportsReasoning', label: 'Reasoning' },
        ];
        for (const def of capDefs) {
            const isSupported = Boolean(manifest[def.key] || (manifest.capabilities && manifest.capabilities[def.key.replace('supports', '').toLowerCase()]));
            const chip = document.createElement('span');
            chip.className = 'capability-chip ' + (isSupported ? 'supported' : 'unsupported');
            chip.innerHTML = (isSupported ? '<span class="chip-icon">' + SVG.check + '</span>' : '<span class="chip-icon">•</span>') + '<span>' + esc(def.label) + '</span>';
            capsContainer.appendChild(chip);
        }

        // Context Window indicator if available
        const maxTokens = manifest.capabilities?.maxContextTokens;
        if (maxTokens) {
            const chip = document.createElement('span');
            chip.className = 'capability-chip supported';
            const formatted = maxTokens >= 1000000 ? `${(maxTokens / 1000000).toFixed(1).replace('.0', '')}M ctx` : `${Math.round(maxTokens / 1000)}k ctx`;
            chip.innerHTML = '<span class="chip-icon">◈</span><span>' + esc(formatted) + '</span>';
            capsContainer.appendChild(chip);
        }
    }

    // 5. Base URL
    const baseUrlInput = document.getElementById('provider-base-url');
    if (baseUrlInput) {
        const currentBaseUrl = state.providerSettings?.baseUrl || manifest.defaultBaseUrl || '';
        baseUrlInput.value = currentBaseUrl;
        setText('about-baseurl', currentBaseUrl);
    }

    // 6. API Key Field (only if supportsApiKey=true)
    const apiKeyRow = document.getElementById('api-key-row');
    if (apiKeyRow) {
        if (manifest.supportsApiKey) {
            apiKeyRow.style.display = '';
            const keyInput = document.getElementById('api-key');
            if (keyInput) {
                keyInput.value = '';
                keyInput.placeholder = state.hasApiKey ? '••••••••  (API key saved securely)' : 'API Key (stored securely on this device)';
            }
        } else {
            apiKeyRow.style.display = 'none';
        }
    }

    // 7. Fetch Models Button (only if supported)
    const fetchBtn = document.getElementById('fetch-models');
    if (fetchBtn) {
        if (manifest.supportsModelDiscovery) {
            fetchBtn.style.display = '';
            fetchBtn.disabled = false;
        } else {
            fetchBtn.style.display = 'none';
        }
    }
}

function renderHeader() {
    const v = state.appVersion || '1.0.0-beta';
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
    setText('summary-status', label);
    renderLiveStatusBar();
}

function renderConnection() {
    const name = state.activeManifest?.displayName || state.activeProviderId || '—';
    setText('provider-badge', name);
    setText('summary-provider', name);
    setText('about-provider', name);
    renderLiveStatusBar();
}

function renderLiveStatusBar() {
    const banner = document.getElementById('gateway-live-banner');
    const isRunning = state.status === 'running' || (state.stats && state.stats.running);
    const providerName = state.activeManifest?.displayName || state.activeProviderId || '—';
    const actualModel = state.activeModel || (state.stats && state.stats.activeModel) || 'None selected';
    const clientAlias = (state.config && state.config.claudeModelAlias) || 'claude-opus-5';

    if (banner) {
        banner.style.display = isRunning ? 'flex' : 'none';
        setText('live-provider-name', providerName);
        setText('live-actual-model', actualModel);
        setText('live-client-alias', clientAlias);
    }

    setText('summary-provider', providerName);
    setText('summary-model', actualModel);
    setText('summary-alias', clientAlias);
}

function renderModelDropdown() {
    const menu = document.getElementById('model-dropdown-menu');
    const clearBtn = document.getElementById('model-search-clear');
    const toggleBtn = document.getElementById('model-dropdown-toggle');
    const cacheBadge = document.getElementById('models-cache-badge');
    const emptyMsg = document.getElementById('model-dropdown-empty');
    const favGroup = document.getElementById('model-favorites-group');
    const favItems = document.getElementById('model-favorites-items');
    const allGroup = document.getElementById('model-all-group');
    const allItems = document.getElementById('model-all-items');
    const allTitle = document.getElementById('model-all-title');

    if (!menu) return;

    // 1. Cache badge
    if (cacheBadge) {
        if (state.modelsSource === 'cached' && state.models.length > 0) {
            cacheBadge.style.display = 'inline-block';
            cacheBadge.textContent = `${state.models.length} cached`;
        } else {
            cacheBadge.style.display = 'none';
        }
    }

    // 2. Clear button visibility
    if (clearBtn) {
        clearBtn.style.display = state.searchQuery ? 'inline-flex' : 'none';
    }

    // 3. Dropdown open state
    menu.style.display = state.dropdownOpen ? 'flex' : 'none';
    if (toggleBtn) toggleBtn.setAttribute('aria-expanded', state.dropdownOpen ? 'true' : 'false');

    if (!state.dropdownOpen) return;

    // Filter models
    const q = (state.searchQuery || '').toLowerCase().trim();
    const matches = state.models.filter((m) => {
        if (!q) return true;
        const id = (m.id || '').toLowerCase();
        const name = (m.name || '').toLowerCase();
        const desc = (m.description || '').toLowerCase();
        return id.includes(q) || name.includes(q) || desc.includes(q);
    });

    // Partition into favorites and regular
    const favSet = new Set(state.favorites || []);
    const favModels = [];
    const regularModels = [];

    for (const m of matches) {
        if (favSet.has(m.id)) {
            favModels.push(m);
        } else {
            regularModels.push(m);
        }
    }

    // Combined list for keyboard navigation
    state.filteredModelsList = [...favModels, ...regularModels];

    if (state.filteredModelsList.length === 0) {
        if (emptyMsg) {
            emptyMsg.style.display = 'block';
            emptyMsg.textContent = state.models.length === 0
                ? 'No models available. Click "Fetch Models" to populate.'
                : 'No models match your search.';
        }
        if (favGroup) favGroup.style.display = 'none';
        if (allGroup) allGroup.style.display = 'none';
        return;
    }

    if (emptyMsg) emptyMsg.style.display = 'none';

    function createModelItemElement(m, globalIdx) {
        const item = document.createElement('div');
        item.className = 'model-item';
        if (m.id === state.activeModel || m.id === state.selectedModel) {
            item.classList.add('selected');
        }
        if (globalIdx === state.focusedIndex) {
            item.classList.add('focused');
        }
        item.dataset.modelId = m.id;

        const isFav = favSet.has(m.id);

        const info = document.createElement('div');
        info.className = 'model-item-info';

        const nameEl = document.createElement('div');
        nameEl.className = 'model-item-name';
        nameEl.textContent = m.name || m.id;

        const metaEl = document.createElement('div');
        metaEl.className = 'model-item-meta';

        const idEl = document.createElement('span');
        idEl.className = 'model-item-id';
        idEl.textContent = m.id;
        metaEl.appendChild(idEl);

        if (m.contextLength) {
            const ctxEl = document.createElement('span');
            ctxEl.className = 'model-item-ctx';
            ctxEl.textContent = m.contextLength >= 1000000 ? `${(m.contextLength / 1000000).toFixed(1)}M ctx` : `${Math.round(m.contextLength / 1000)}k ctx`;
            metaEl.appendChild(ctxEl);
        }

        info.appendChild(nameEl);
        info.appendChild(metaEl);

        const starBtn = document.createElement('button');
        starBtn.type = 'button';
        starBtn.className = 'btn-star' + (isFav ? ' active' : '');
        starBtn.title = isFav ? 'Remove from favorites' : 'Add to favorites';
        starBtn.innerHTML = isFav ? '★' : '☆';
        starBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await onToggleFavorite(m.id);
        });

        item.appendChild(info);
        item.appendChild(starBtn);

        item.addEventListener('click', async () => {
            await onSelectModel(m.id);
        });

        return item;
    }

    // Populate favorites
    if (favGroup && favItems) {
        favItems.innerHTML = '';
        if (favModels.length > 0) {
            favGroup.style.display = 'flex';
            favModels.forEach((m, i) => {
                favItems.appendChild(createModelItemElement(m, i));
            });
        } else {
            favGroup.style.display = 'none';
        }
    }

    // Populate all / others
    if (allGroup && allItems) {
        allItems.innerHTML = '';
        if (regularModels.length > 0) {
            allGroup.style.display = 'flex';
            if (allTitle) {
                allTitle.textContent = favModels.length > 0 ? 'Other Models' : 'All Models';
            }
            const offset = favModels.length;
            regularModels.forEach((m, i) => {
                allItems.appendChild(createModelItemElement(m, offset + i));
            });
        } else {
            allGroup.style.display = 'none';
        }
    }
}

async function onSelectModel(modelId) {
    if (!modelId) return;
    state.selectedModel = modelId;
    state.activeModel = modelId;
    state.customModel = '';
    setVal('model-custom', '');
    state.dropdownOpen = false;
    state.searchQuery = '';
    state.focusedIndex = -1;

    const input = document.getElementById('model-search-input');
    const selectedObj = state.models.find((m) => m.id === modelId);
    if (input) {
        input.value = selectedObj ? (selectedObj.name && selectedObj.name !== selectedObj.id ? `${selectedObj.name} (${selectedObj.id})` : selectedObj.id) : modelId;
    }

    // Keep hidden select in sync for backward compatibility
    const sel = document.getElementById('model-select');
    if (sel) sel.value = modelId;

    renderModel();
    renderLiveStatusBar();
    await persistModelChoice(modelId);
}

async function onToggleFavorite(modelId) {
    if (!modelId || !window.api || typeof window.api.toggleFavorite !== 'function') return;
    try {
        const r = await window.api.toggleFavorite(state.activeProviderId, modelId);
        if (r && r.ok && Array.isArray(r.favorites)) {
            state.favorites = r.favorites;
            renderModelDropdown();
        }
    } catch (e) {
        console.warn('Failed to toggle favorite:', e);
    }
}

function renderModel() {
    const sel = document.getElementById('model-select');
    if (sel) {
        const prevVal = state.selectedModel || state.activeModel;
        sel.innerHTML = '';
        const ph = document.createElement('option');
        ph.value = '';
        ph.textContent = state.models.length ? '— Select a model —' : '— Fetch models to populate —';
        sel.appendChild(ph);
        for (const m of state.models) {
            const opt = document.createElement('option');
            opt.value = m.id;
            opt.textContent = m.name ? `${m.name} (${m.id})` : (m.label || m.id);
            sel.appendChild(opt);
        }
        if (prevVal && state.models.find((m) => m.id === prevVal)) {
            sel.value = prevVal;
        }
    }

    // Update search input text if not currently focused with a custom search
    const input = document.getElementById('model-search-input');
    if (input && document.activeElement !== input) {
        const currentM = state.models.find((m) => m.id === state.activeModel);
        if (currentM) {
            input.value = currentM.name && currentM.name !== currentM.id ? `${currentM.name} (${currentM.id})` : currentM.id;
        } else if (state.activeModel) {
            input.value = state.activeModel;
        } else {
            input.value = '';
        }
    }

    renderModelDropdown();

    const isCustom = !state.models.find((m) => m.id === state.activeModel);
    setVal('model-custom', state.customModel || (isCustom ? state.activeModel : ''));
    setText('active-model-val', state.activeModel || '—');
    const amMsg = $('#active-model-msg');
    if (amMsg) amMsg.style.display = state.activeModel ? '' : 'none';
    setText('alias-to', state.activeModel || '—');
    setText('summary-model', state.activeModel || 'None selected');

    renderLiveStatusBar();
}

function renderStats() {
    const s = state.stats || {};
    const host = (state.config && state.config.host) || '127.0.0.1';
    const port = (state.config && state.config.port) || 8787;
    const url = s.url || ('http://' + host + ':' + port);
    setText('gateway-endpoint', url.replace(/^https?:\/\//, ''));
    setText('summary-port', String(port));
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
    const baseUrl = state.providerSettings?.baseUrl || state.activeManifest?.defaultBaseUrl || '—';
    setText('about-baseurl', baseUrl);
    setText('about-local', 'http://' + (state.config.host || '127.0.0.1') + ':' + (state.config.port || 8787));
    setText('about-alias', state.config.claudeModelAlias || 'claude-opus-5');
}

function renderClaudeSetup() {
    if (!state.config) return;
    const url = 'http://' + (state.config.host || '127.0.0.1') + ':' + (state.config.port || 8787);
    setText('claude-url', url);
    setText('alias-from', state.config.claudeModelAlias || 'claude-opus-5');
    const tokenEl = $('#claude-token');
    if (tokenEl) {
        const tok = state.config.localGatewayToken || '';
        tokenEl.textContent = tok || '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022';
        tokenEl.classList.toggle('masked', !tok);
    }
    setText('alias-to', state.activeModel || '—');
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
function openExternalUrl(url) {
    if (window.api && typeof window.api.openExternal === 'function') {
        window.api.openExternal(url);
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
            openExternalUrl(key);
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
                if (state.config && state.config.localGatewayToken && (id === 'claude-token' || id === 'adv-token')) {
                    text = state.config.localGatewayToken;
                }
            }
            try {
                await navigator.clipboard.writeText(text);
                flashCopied(btn);
            } catch (e) {
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
// Model Selection Helper
// ============================================================
async function persistModelChoice(modelId) {
    if (!modelId) return;
    try {
        const r = await window.api.setModel({
            providerId: state.activeProviderId,
            selected: modelId,
        });
        if (r && r.ok) {
            state.activeModel = modelId;
            state.providerSettings = state.providerSettings || {};
            state.providerSettings.model = modelId;
            renderModel();
            renderClaudeSetup();
        }
    } catch { /* ignore */ }
}

// ============================================================
// Provider Switching
// ============================================================
async function onProviderChange(newProviderId) {
    if (!newProviderId || newProviderId === state.activeProviderId) return;

    showMsg('api-key-msg', '', '');
    showMsg('provider-baseurl-msg', '', '');
    showMsg('models-msg', '', '');

    try {
        const res = await window.api.setProvider(newProviderId);
        if (res && res.ok) {
            state.activeProviderId = res.providerId;
            state.activeManifest = res.manifest || state.providers.find(p => p.id === res.providerId);
            state.providerSettings = res.settings || {};
            state.hasApiKey = !!res.settings?.hasApiKey;

            // Restore cached models and favorites for this provider
            const cached = Array.isArray(res.settings?.cachedModels) ? res.settings.cachedModels : [];
            state.models = cached;
            state.cachedModels = cached;
            state.favorites = Array.isArray(res.settings?.favorites) ? res.settings.favorites : [];
            state.modelsSource = cached.length > 0 ? 'cached' : 'none';
            state.searchQuery = '';
            state.dropdownOpen = false;

            state.activeModel = res.settings?.model || '';
            state.selectedModel = state.activeModel;
            state.customModel = '';

            // Update UI components dynamically
            renderProviderDetails();
            renderConnection();
            renderModel();
            renderAdvanced();
            renderClaudeSetup();
            renderLiveStatusBar();
        } else {
            showMsg('api-key-msg', (res && res.error) || 'Failed to switch provider', 'err');
        }
    } catch (e) {
        showMsg('api-key-msg', (e && e.message) || String(e), 'err');
    }
}

// ============================================================
// Model Combobox Search & Navigation
// ============================================================
function bindModelCombobox() {
    const input = document.getElementById('model-search-input');
    const toggleBtn = document.getElementById('model-dropdown-toggle');
    const clearBtn = document.getElementById('model-search-clear');
    const combobox = document.getElementById('model-combobox');

    if (!input) return;

    // Search while typing
    input.addEventListener('input', (e) => {
        state.searchQuery = e.target.value;
        state.dropdownOpen = true;
        state.focusedIndex = -1;
        renderModelDropdown();
    });

    // Open dropdown on focus
    input.addEventListener('focus', () => {
        state.dropdownOpen = true;
        renderModelDropdown();
    });

    // Toggle dropdown button
    if (toggleBtn) {
        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            state.dropdownOpen = !state.dropdownOpen;
            if (state.dropdownOpen && input) input.focus();
            renderModelDropdown();
        });
    }

    // Clear search button
    if (clearBtn) {
        clearBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            state.searchQuery = '';
            input.value = '';
            input.focus();
            state.dropdownOpen = true;
            renderModelDropdown();
        });
    }

    // Keyboard navigation
    input.addEventListener('keydown', async (e) => {
        if (!state.dropdownOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            state.dropdownOpen = true;
            renderModelDropdown();
            return;
        }

        const count = state.filteredModelsList ? state.filteredModelsList.length : 0;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (count > 0) {
                state.focusedIndex = (state.focusedIndex + 1) % count;
                renderModelDropdown();
                scrollFocusedItemIntoView();
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (count > 0) {
                state.focusedIndex = (state.focusedIndex - 1 + count) % count;
                renderModelDropdown();
                scrollFocusedItemIntoView();
            }
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (state.focusedIndex >= 0 && state.focusedIndex < count) {
                const chosen = state.filteredModelsList[state.focusedIndex];
                if (chosen) {
                    await onSelectModel(chosen.id);
                }
            } else if (input.value.trim()) {
                const q = input.value.trim().toLowerCase();
                const match = state.models.find((m) => m.id.toLowerCase() === q || (m.name && m.name.toLowerCase() === q));
                await onSelectModel(match ? match.id : input.value.trim());
            }
        } else if (e.key === 'Escape') {
            state.dropdownOpen = false;
            renderModelDropdown();
        }
    });

    function scrollFocusedItemIntoView() {
        const menu = document.getElementById('model-dropdown-menu');
        const focused = menu?.querySelector('.model-item.focused');
        if (focused) {
            focused.scrollIntoView({ block: 'nearest' });
        }
    }

    // Close when clicking outside
    document.addEventListener('click', (e) => {
        if (combobox && !combobox.contains(e.target)) {
            if (state.dropdownOpen) {
                state.dropdownOpen = false;
                state.searchQuery = '';
                renderModel();
            }
        }
    });
}

// ============================================================
// Event wiring
// ============================================================
function bindEvents() {
    // Provider Select
    const providerSelect = document.getElementById('provider-select');
    if (providerSelect) {
        providerSelect.addEventListener('change', (e) => {
            onProviderChange(e.target.value);
        });
    }

    // Provider Base URL Save
    const btnBaseUrlSave = document.getElementById('provider-baseurl-save');
    if (btnBaseUrlSave) {
        btnBaseUrlSave.addEventListener('click', async () => {
            const baseUrlInput = document.getElementById('provider-base-url');
            const url = (baseUrlInput?.value || '').trim();
            showMsg('provider-baseurl-msg', 'Saving...', '');
            try {
                const r = await window.api.saveProviderSettings({
                    providerId: state.activeProviderId,
                    baseUrl: url,
                });
                if (r && r.ok) {
                    state.providerSettings = state.providerSettings || {};
                    state.providerSettings.baseUrl = url;
                    setText('about-baseurl', url);
                    showMsg('provider-baseurl-msg', 'Base URL saved.', 'ok');
                } else {
                    showMsg('provider-baseurl-msg', (r && r.error) || 'Failed to save Base URL.', 'err');
                }
            } catch (e) {
                showMsg('provider-baseurl-msg', (e && e.message) || String(e), 'err');
            }
        });
    }

    // API Key Save & Test
    const apiKey = document.getElementById('api-key');
    const btnSave = document.getElementById('api-key-save');
    const btnTest = document.getElementById('api-key-test');

    if (btnSave) {
        btnSave.addEventListener('click', async () => {
            const key = (apiKey?.value || '').trim();
            if (!key) {
                showMsg('api-key-msg', 'Enter an API key first.', 'err');
                return;
            }
            showMsg('api-key-msg', 'Saving...', '');
            try {
                const r = await window.api.saveProviderSettings({
                    providerId: state.activeProviderId,
                    apiKey: key,
                });
                if (r && r.ok) {
                    state.hasApiKey = true;
                    if (apiKey) {
                        apiKey.value = '';
                        apiKey.placeholder = '••••••••  (API key saved securely)';
                    }
                    showMsg('api-key-msg', 'API key saved securely.', 'ok');
                } else {
                    showMsg('api-key-msg', (r && r.error) || 'Failed to save API key.', 'err');
                }
            } catch (e) {
                showMsg('api-key-msg', (e && e.message) || String(e), 'err');
            }
        });
    }

    if (btnTest) {
        btnTest.addEventListener('click', async () => {
            showMsg('api-key-msg', 'Testing connection...', '');
            try {
                const r = await window.api.testConnection(state.activeProviderId);
                const providerName = state.activeManifest?.displayName || state.activeProviderId;
                if (r && r.ok) {
                    state.connectionState = { state: 'connected' };
                    showMsg('api-key-msg', `Connected to ${providerName}.`, 'ok');
                } else if (r && r.reason === 'invalid-key') {
                    state.connectionState = { state: 'invalid-key' };
                    showMsg('api-key-msg', 'Invalid API key.', 'err');
                } else if (r && r.reason === 'no-key') {
                    state.connectionState = { state: 'not-configured' };
                    showMsg('api-key-msg', 'No API key configured.', 'err');
                } else if (r && r.reason === 'network-error') {
                    state.connectionState = { state: 'network-error' };
                    showMsg('api-key-msg', 'Network error. Check connection and Base URL.', 'err');
                } else {
                    showMsg('api-key-msg', (r && r.error) || 'Connection failed.', 'err');
                }
            } catch (e) {
                showMsg('api-key-msg', (e && e.message) || String(e), 'err');
            }
        });
    }

    // Models Fetch & Select
    const btnFetch = document.getElementById('fetch-models');
    const sel = document.getElementById('model-select');
    const custom = document.getElementById('model-custom');
    const customSave = document.getElementById('model-custom-save');

    if (btnFetch) {
        btnFetch.addEventListener('click', async () => {
            showMsg('models-msg', 'Fetching models...', '');
            try {
                const r = await window.api.fetchModels(state.activeProviderId);
                if (r && r.ok) {
                    state.models = Array.isArray(r.models) ? r.models : [];
                    state.cachedModels = state.models;
                    state.modelsSource = 'fetched';
                    renderModel();
                    showMsg('models-msg', `${state.models.length} models loaded.`, 'ok');
                } else {
                    showMsg('models-msg', (r && r.error) || 'Failed to fetch models.', 'err');
                }
            } catch (e) {
                showMsg('models-msg', (e && e.message) || String(e), 'err');
            }
        });
    }

    if (sel) {
        sel.addEventListener('change', async () => {
            const val = sel.value;
            if (val) {
                state.selectedModel = val;
                state.customModel = '';
                setVal('model-custom', '');
                await persistModelChoice(val);
            }
        });
    }

    const onCustomSave = async () => {
        const val = (custom?.value || '').trim();
        if (!val) return;
        state.customModel = val;
        state.selectedModel = val;
        if (sel) sel.value = '';
        await persistModelChoice(val);
    };

    if (custom) custom.addEventListener('change', onCustomSave);
    if (customSave) customSave.addEventListener('click', onCustomSave);

    // Gateway Start / Stop
    const tog = document.getElementById('toggle-gateway');
    if (tog) {
        tog.addEventListener('click', async () => {
            if (state.stats && state.stats.running) {
                showMsg('gateway-msg', 'Stopping...', '');
                try {
                    const r = await window.api.stopGateway();
                    showMsg('gateway-msg', 'Stopped.', 'ok');
                } catch (e) {
                    showMsg('gateway-msg', e.message, 'err');
                }
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
                } catch (e) {
                    showMsg('gateway-msg', e.message, 'err');
                }
            }
        });
    }

    // Advanced Save
    const advSave = document.getElementById('adv-save');
    if (advSave) {
        advSave.addEventListener('click', async () => {
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
            } catch (e) {
                showMsg('adv-save-msg', e.message, 'err');
            }
        });
    }

    const regen = document.getElementById('adv-token-regen');
    if (regen) {
        regen.addEventListener('click', async () => {
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
            } catch (e) {
                showMsg('adv-save-msg', e.message, 'err');
            }
        });
    }

    // Activity
    const clear = document.getElementById('log-clear');
    if (clear) {
        clear.addEventListener('click', () => {
            state.stats = state.stats || {};
            state.stats.activity = [];
            renderActivity();
        });
    }

    const expand = document.getElementById('log-expand');
    if (expand) {
        expand.addEventListener('click', () => {
            state.logExpanded = !state.logExpanded;
            const c = document.getElementById('log-container');
            if (c) c.classList.toggle('expanded', state.logExpanded);
            if (expand) expand.textContent = state.logExpanded ? 'Collapse' : 'Expand';
        });
    }
}

// ============================================================
// IPC Subscriptions
// ============================================================
function bindIpc() {
    if (!window.api) return;

    if (typeof window.api.onStatus === 'function') {
        window.api.onStatus((evt) => {
            if (!evt) return;
            state.status = evt.state || evt.status || state.status;
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
                state.selectedModel = id;
                renderModel();
            }
        });
    }

    if (typeof window.api.onActiveProvider === 'function') {
        window.api.onActiveProvider((pId) => {
            if (pId && pId !== state.activeProviderId) {
                state.activeProviderId = pId;
                state.activeManifest = state.providers.find(p => p.id === pId) || state.activeManifest;
                renderProviderSelect();
                renderProviderDetails();
                renderConnection();
                renderLiveStatusBar();
            }
        });
    }

    if (typeof window.api.onFavorites === 'function') {
        window.api.onFavorites((data) => {
            if (data && data.providerId === state.activeProviderId && Array.isArray(data.favorites)) {
                state.favorites = data.favorites;
                renderModelDropdown();
            }
        });
    }
}

// ============================================================
// Initialization
// ============================================================
async function init() {
    bindTabs();
    bindExternalLinks();
    bindCopyButtons();
    bindApiKeyVisibility();
    bindModelCombobox();
    bindEvents();
    bindIpc();

    try {
        const initData = await window.api.getInit();
        if (initData) {
            state.config = initData.config || state.config;
            state.providers = Array.isArray(initData.providers) ? initData.providers : [];
            state.activeProviderId = initData.activeProviderId || (state.providers[0] && state.providers[0].id) || '';
            state.activeManifest = initData.activeManifest || state.providers.find(p => p.id === state.activeProviderId) || state.providers[0] || null;
            state.providerSettings = initData.providerSettings || {};
            state.hasApiKey = !!initData.hasApiKey;

            const cached = Array.isArray(initData.cachedModels) ? initData.cachedModels : (Array.isArray(initData.providerSettings?.cachedModels) ? initData.providerSettings.cachedModels : []);
            state.models = cached;
            state.cachedModels = cached;
            state.favorites = Array.isArray(initData.favorites) ? initData.favorites : (Array.isArray(initData.providerSettings?.favorites) ? initData.providerSettings.favorites : []);
            state.modelsSource = cached.length > 0 ? 'cached' : 'none';

            state.selectedModel = initData.selectedModel || state.providerSettings.model || '';
            state.customModel = initData.customModel || '';
            state.activeModel = initData.activeModel || state.providerSettings.model || '';
            state.status = initData.status || 'stopped';
            state.stats = initData.stats || state.stats;
            state.appVersion = initData.appVersion || state.appVersion;
        }
    } catch (e) {
        console.warn('Initialization error:', e);
    }

    renderProviderSelect();
    renderProviderDetails();
    renderHeader();
    renderConnection();
    renderModel();
    renderStats();
    renderAdvanced();
    renderClaudeSetup();
    renderStatusPill();
    renderLiveStatusBar();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// Expose to global for debug console or testing verification if needed.
window.__toolboxlap = {
    state,
    render: {
        renderProviderSelect,
        renderProviderDetails,
        renderStats,
        renderActivity,
        renderModel,
        renderAdvanced,
        renderClaudeSetup
    },
    onProviderChange,
};
