# TOOLBOXLAP Gateway GMI — v0.2.2 Release Report

> Historical release record retained for reference. This is not the current
> release documentation and may describe build details that no longer apply.
> See `docs/releases/v0.2.8.md` for the current published release.

**Artifact:** `dist/TOOLBOXLAP-Gateway-GMI-0.2.2.exe`
**Size:** 99,644,669 bytes (~95 MB, portable, signed)
**Built:** 2026-08-25 21:09
**Electron:** 44.0.0 (x64)
**Node target:** ≥ 20.0.0

## Summary

v0.2.2 is a **bug-fix release** focused on making the gateway
**runtime-mutable** and its **GUI plumbing reliable**. Every bug found
while exercising v0.2.1 in a clean VM has been fixed and now has a
regression test. The portable `.exe` was rebuilt from a clean source
tree.

## What changed

### Fixed
- **Live model switching without restart.** `set-model` in the renderer
  now reaches the running gateway via an injected `deps.resolveModels`
  callback. The next `/v1/messages` request uses the new model
  immediately.
- **Live alias on `/v1/models`.** The model list endpoint returns the
  live alias returned by `resolveModels`, so the Claude-visible alias
  and the GMI-side model stay in sync.
- **`set-model` IPC contract.** Accepts both a legacy string id and the
  renderer's `{ selected, custom }` object (custom wins).
- **`open-external` IPC contract.** Accepts a well-known **key**
  (`youtube` / `website` / `github`) rather than a raw URL. Main
  process resolves the key via `src/external-links.js` → frozen
  allowlist of three official URLs. **The renderer can no longer
  smuggle arbitrary URLs to `shell.openExternal`.**
- **Stop gateway.** The `stop-gateway` handler is now wrapped in
  try/catch, always calls `activity.stop()`, and emits a final `stats`
  event so the UI reflects zero counters immediately. Port is released
  within 1 s.
- **Live activity / stats.** Removed the fragile stdout-monkey-patch
  collector and replaced it with a structured `request` event emitter
  that the gateway publishes into a real `createActivityTracker` in
  `src/activity.js`. Activity is now captured even when logging is
  silenced.
- **`get-stats` IPC** now returns the canonical stats object
  `{ running, url, requests, success, errors, avgLatencySec, uptimeMs }`
  instead of an ad-hoc merged object.
- **`recordRequest` no longer throws** on events that lack a numeric
  status (e.g. socket errors before a response was written).
- **Test scripts are cross-platform.** `scripts/run-tests.js` replaces
  the previous POSIX-only `find … -exec node …` chain.
- **Removed dead code.** `resetStats()` and the now-orphaned
  `request-stats` event were deleted.

### Added
- `src/activity.js` — `createActivityTracker` with
  `start / stop / recordRequest / getStats / getActivity /
  clearActivity`.
- `src/external-links.js` — frozen allowlist +
  `resolveExternalLink(key)`.
- `src/main.js` owns a `gatewayEvents: EventEmitter` that is wired
  into the `events` dep of `startServer`; every request flows through
  it.
- `test/unit/activity.test.js` — 7 tests.
- `test/unit/external-links.test.js` — 5 tests.
- `test/integration/server-events.test.js` — 3 tests:
  1. `request` event fires for every `/v1/messages` call.
  2. `/v1/models` returns the live alias returned by
     `deps.resolveModels`.
  3. **Redaction invariant** — emitted request events never contain
     the GMI API key or request bodies.
- `scripts/run-tests.js` — cross-platform runner with `unit` /
  `integration` / `all` modes.
- `.selectable` CSS rule so a single click selects all of a technical
  value (`version`, `base URL`, `local URL`, `alias`) for easy copy.
- `CHANGELOG.md` with full 0.2.2 entry.

### Changed
- `package.json` `version` → `0.2.2`.
- `package.json` test scripts invoke `scripts/run-tests.js`.
- `src/server.js` `listModels(cfg, alias, upstreamId)` now also
  accepts `listModels(cfg, deps)` where `deps = { alias, upstreamId }`.
  Old positional form still supported.
- Renderer `bindIpc()` subscribes to `onActivity`, `onActivityCleared`,
  and `onActiveModel` (replaces the old `onLog` stub).
- README references `TOOLBOXLAP-Gateway-GMI-0.2.2.exe`.

## What was tested

### Automated
| Suite        | Count | Result |
|--------------|------:|--------|
| Unit         |    38 | pass   |
| Integration  |    16 | pass   |
| **Total**    | **54**| **pass** |

Notable new assertions:
- `recordRequest ignores events without a numeric status`
- `resolveExternalLink rejects raw URLs (defense against renderer
  smuggling)`
- `EXTERNAL_LINKS is frozen and only contains https:// URLs`
- `server emits a 'request' event for every /v1/messages call`
- `server uses the live alias returned by deps.resolveModels on
  /v1/models`
- `request events never include the API key or request bodies`

### Static
- All 17 source + script files pass `node --check`.

### Build
- `electron-builder 26.15.3` →
  `dist\TOOLBOXLAP-Gateway-GMI-0.2.2.exe`
  (99,644,669 bytes, signed by signtool.exe).
- FileVersion / ProductVersion both `0.2.2`.
- FileDescription: `TOOLBOXLAP Gateway — GMI Edition. Local
  Anthropic-compatible inference gateway that maps Claude-style
  aliases to GMI Cloud.`

## Lifecycle invariants verified

- **Port release.** After Stop, the port is reusable within ~1 s by a
  subsequent Start. (No `setTimeout`-based hacks; the `server.close()`
  callback in `stopServer` resolves the stop IPC, and `activity.stop()`
  is awaited before the port is reused.)
- **No duplicate listeners.** `start-gateway` is idempotent: the IPC
  handler does not stack up listeners on each Start. A guard rejects a
  second Start while one is already running.
- **No leftover `window-all-closed` patches.** The stdout-monkey-patch
  collector that the previous version used is gone, so the renderer
  cannot be left in a state where Stop is required to release the
  port.
- **Locked provider base URL still enforced.** `loadConfig` still
  rejects a non-`api.gmi.cloud` `GMI_BASE_URL`, and the default is
  locked at startup.

## Known limitations

- The provider base URL is **hard-coded** to `https://api.gmi.cloud`
  in `src/config.js`. The GUI does not surface this; that is
  intentional.
- The portable `.exe` is **not code-signed with a public
  certificate**; Windows SmartScreen will warn on first launch. The
  internal `signtool.exe` re-signing during `electron-builder` is for
  file integrity only.
- `electron-builder` warns `author is missed in the package.json`.
  This is cosmetic; the artifact still packages correctly.

## Upgrade steps

1. Stop any running 0.2.1 instance.
2. Replace `TOOLBOXLAP-Gateway-GMI-0.2.1.exe` with
   `TOOLBOXLAP-Gateway-GMI-0.2.2.exe`.
3. Launch the new exe. The app unpacks itself to `%TEMP%` and exits
   on close; no installer.
4. Existing `GMI_API_KEY` / `LOCAL_GATEWAY_TOKEN` environment
   variables are honored unchanged.
5. Click any value in the **About** card to select it for copy.

## Guardrails respected

- No real GMI API key was read, written, or transmitted in any test
  or build step. The only key used anywhere is the test mock
  `sk-test-key` defined in `test/mock-upstream.js`.
- The `.exe` was built on the same Windows host that ran the test
  suite; the 0.2.2 source tree is byte-identical to the one that
  produced the green test run above.
