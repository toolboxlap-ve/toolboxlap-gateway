# Changelog

All notable changes to **TOOLBOXLAP Gateway — GMI Edition** are documented
here. The format is loosely based on [Keep a Changelog](https://keepachangelog.com).

## [Unreleased]

## [0.2.9] — 2026-08-27

### Security
- Refuse non-loopback startup unless an explicit Local Gateway Token of at
  least 24 characters is configured.
- Reject the public `toolboxlap` convenience token for non-loopback binds.
- Require bearer authentication on every route when listening beyond
  loopback, while preserving unauthenticated localhost development use.
- Expanded `.gitignore` and secret protection for environment files, runtime
  credentials, logs, caches, build outputs, and release artifacts.

### Added
- Added security tests for loopback detection, strong-token validation,
  fail-closed non-loopback startup, and authentication on non-loopback routes.
- Added Windows CI, contribution and security guidance, issue templates, and a
  pull request template for the public repository.

### Documentation
- Prepared public build instructions and release documentation.
- Added the GNU General Public License v3.0.
- Clarified encrypted credential storage and the possible plaintext fallback.

### Changed
- Aligned package, UI fallback, build, and current documentation version
  metadata at v0.2.9.

## [0.2.8] — 2026-08-26

- Current published Windows release.
- Verified artifact: `TOOLBOXLAP-Gateway-GMI-0.2.8.exe`.
- Verified SHA-256:
  `BF5F5A1EA740FE9575789E9E845A07C8035983E4E073313E0C38CECE0E2643EF`.
- The retained repository does not contain enough historical information to
  establish a more detailed v0.2.7 → v0.2.8 change list without speculation.

## [0.2.7] — date unavailable

- Added the `toolboxlap` convenience Local Gateway Token on first startup.
- Preserved an existing saved token during upgrade.

## [0.2.6] — date unavailable

- Changed the default Claude-visible alias to `claude-opus-5`.
- Retained compatibility with the legacy `claude-sonnet-4-6` alias.
- Updated GUI alias labels and placeholders.

## [0.2.5] — date unavailable

- Fixed CSS/tab navigation behavior for the lower GUI sections.
- Updated renderer navigation for Advanced, Claude Setup, Live Activity, and
  About.
- Moved normal displayed version reporting to application metadata.

## [0.2.4] — date unavailable

- A versioned Windows artifact is retained locally, but detailed historical
  release information is unavailable in this source copy.

## [0.2.3] — date unavailable

- Added the CommonJS preflight shim used to launch the Electron ESM main
  process reliably when `ELECTRON_RUN_AS_NODE` is present.
- Added launcher handling that clears Electron/Node environment variables.
- Exact historical release details beyond these retained source comments are
  unavailable.

## [0.2.2] — 2026-08-25

### Fixed
- **Live model switching without restart.** Setting the active model from
  the GUI now propagates to the running gateway via `deps.resolveModels`.
  The next `/v1/messages` request uses the new model immediately.
- **Live alias is honored.** `/v1/models` now returns the live alias
  returned by `resolveModels`, so the Claude-visible alias and the
  GMI-side model stay in sync.
- **`fetch-models` IPC.** The handler now returns the documented
  `{ ok, models, error }` shape that the renderer expects.
- **`set-model` IPC.** Accepts both the legacy string id and the
  renderer's `{ selected, custom }` object; the custom value wins.
- **`open-external` IPC.** Accepts a well-known **key** (`youtube`,
  `website`, `github`) rather than a raw URL. The main process
  resolves the key to the exact official URL via
  `src/external-links.js`. The renderer can no longer smuggle
  arbitrary URLs to `shell.openExternal`.
- **Stop gateway.** Releases the port reliably and resets the activity
  session cleanly so a subsequent Start works on the first try.
- **Live activity / stats.** Replaced the fragile stdout-monkey-patch
  with structured `request` events emitted by the gateway into an
  injected `EventEmitter`, consumed by a real `createActivityTracker`
  in `src/activity.js`. No more dependency on log-line format.
- **`get-stats` IPC** now returns the canonical stats object
  (`{ running, url, requests, success, errors, avgLatencySec,
  uptimeMs }`) instead of an ad-hoc merged object.
- **Test scripts** are now cross-platform via `scripts/run-tests.js`,
  which globs test files properly on Windows.
- **`recordRequest` ignores malformed events** (no numeric status)
  instead of throwing.

### Added
- `src/activity.js` — `createActivityTracker` with
  `start / stop / recordRequest / getStats / getActivity /
  clearActivity`.
- `src/external-links.js` — frozen allowlist of three official URLs
  plus `resolveExternalLink(key)`.
- New unit tests: `test/unit/activity.test.js`,
  `test/unit/external-links.test.js`.
- New integration test: `test/integration/server-events.test.js`
  exercising the event-driven activity pipeline, the live-alias
  propagation, and the redaction invariant on emitted events.
- `scripts/run-tests.js` — cross-platform test runner.

### Changed
- `package.json` test scripts use `scripts/run-tests.js`.
- `src/server.js` `listModels(cfg, alias, upstreamId)` → now also
  accepts `listModels(cfg, deps)` where `deps = { alias, upstreamId }`
  so the live alias can be injected from the caller. The old
  positional form is still supported.
- `src/main.js` no longer monkey-patches `process.stdout.write`.

## [0.2.1] — 2026-08-XX

- Initial GMI-locked build. (See README for full feature list.)
