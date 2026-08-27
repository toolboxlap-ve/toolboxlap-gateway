# Building TOOLBOXLAP Gateway — GMI Edition

These instructions build the Windows x64 portable application from source.

## Prerequisites

- Windows 10 or Windows 11, x64
- Node.js 22.12.0 or newer
- npm included with Node.js
- PowerShell
- Internet access for the initial dependency installation

The Node minimum follows the declared requirement of Electron 44.0.0. The application itself is packaged with Electron; end users of the portable executable do not need a separate Node installation.

## Clean dependency installation

For a checked-out repository with `package-lock.json`:

```powershell
npm ci
```

Use `npm install` only when intentionally changing dependencies or regenerating the lockfile. Never place API keys in build commands, package metadata, or source files.

## Validation

```powershell
npm run check
npm run test:unit
npm run test:integration
npm test
```

The integration suite uses a local mock upstream and does not require a real GMI API key.

## Standard production build

```powershell
npm run build
```

Electron Builder produces:

- Portable executable: `dist/TOOLBOXLAP-Gateway-GMI-0.2.9.exe`
- Unpacked application: `dist/win-unpacked/`

The `postbuild` hook copies `build/launch.cmd` into the unpacked directory. The portable executable uses `src/main.cjs` as its preflight entry point; no `build/portable.nsi` file is required by the current build configuration.

Electron downloads are cached under the ignored `.cache/electron/` directory so builds do not depend on a writable user-profile cache.

## Isolated candidate build

To preserve an existing `dist/` directory while testing release-preparation changes:

```powershell
npm run build:candidate
```

This produces the equivalent output under `candidate-dist/`. Both output directories are intentionally ignored by Git.

## Verify SHA-256

```powershell
Get-FileHash .\candidate-dist\TOOLBOXLAP-Gateway-GMI-0.2.9.exe -Algorithm SHA256
```

Compare the full 64-character digest. Any source, dependency, packaging, or security change can change the executable bytes. A newly built candidate must not be represented as the previously published binary unless its digest is identical.

## Launch verification

Launch the portable executable from its output directory. For an isolated test that does not reuse normal application data, pass a temporary Chromium user-data directory:

```powershell
.\candidate-dist\TOOLBOXLAP-Gateway-GMI-0.2.9.exe --user-data-dir="$PWD\candidate-launch-data"
```

Confirm that the main window opens, reports v0.2.9, and can start the default `127.0.0.1:8787` gateway. Do not use a production GMI key for build verification.

## Release assets

Do not commit `dist/`, `candidate-dist/`, unpacked Electron files, installers, archives, or generated checksums. Release binaries and their checksums belong in the future GitHub Release.
