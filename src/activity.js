// src/activity.js
// Pure activity/statistics tracker for the gateway session. The Electron main
// process feeds it structured request events emitted by the HTTP server (see
// server.js deps.events) and forwards the resulting snapshots to the renderer
// over IPC. No stdout parsing, no monkey-patching.
//
// Every field handled here is safe metadata only. Request bodies, prompts,
// tool payloads, API keys and Authorization headers must never reach this
// module.

const MAX_ACTIVITY = 200;

/**
 * @typedef {Object} RequestEvent
 * @property {string} endpoint       e.g. '/v1/messages'
 * @property {string|null} alias     Claude-visible alias (null if unknown)
 * @property {string|null} upstreamModel
 * @property {number} status         HTTP status returned to the caller
 * @property {number} durationMs
 * @property {boolean} streaming
 */

export function createActivityTracker() {
  let startedAt = null;
  let requests = 0;
  let success = 0;
  let errors = 0;
  let totalLatencyMs = 0;
  const activity = [];

  function recordRequest(evt) {
    if (!evt || typeof evt.status !== 'number') return null;
    const entry = {
      // Keep a short local time for display; full epoch also available.
      t: new Date().toTimeString().slice(0, 8),
      timestamp: Date.now(),
      endpoint: typeof evt.endpoint === 'string' ? evt.endpoint : '/v1/messages',
      alias: typeof evt.alias === 'string' ? evt.alias : null,
      model: typeof evt.upstreamModel === 'string' ? evt.upstreamModel : null,
      status: evt.status,
      latency: Number.isFinite(evt.durationMs) ? evt.durationMs / 1000 : 0,
      latencyMs: Number.isFinite(evt.durationMs) ? evt.durationMs : 0,
      streaming: evt.streaming === true,
    };
    requests += 1;
    if (evt.status >= 200 && evt.status < 400) success += 1;
    else errors += 1;
    if (entry.latencyMs > 0) totalLatencyMs += entry.latencyMs;
    activity.unshift(entry);
    if (activity.length > MAX_ACTIVITY) activity.length = MAX_ACTIVITY;
    return entry;
  }

  return {
    /** Begin a fresh session (zeroes counters and uptime). */
    start() {
      startedAt = Date.now();
      requests = 0;
      success = 0;
      errors = 0;
      totalLatencyMs = 0;
      activity.length = 0;
    },
    /** End the session; uptime freezes at zero, counters are kept for display. */
    stop() {
      startedAt = null;
    },
    clearActivity() {
      activity.length = 0;
    },
    recordRequest,
    getStats({ running = false, url = null } = {}) {
      return {
        running,
        url,
        startedAt,
        uptimeMs: startedAt ? Date.now() - startedAt : 0,
        requests,
        success,
        errors,
        avgLatencySec: requests > 0 ? (totalLatencyMs / requests) / 1000 : 0,
      };
    },
    getActivity(limit = MAX_ACTIVITY) {
      return activity.slice(0, limit);
    },
  };
}
