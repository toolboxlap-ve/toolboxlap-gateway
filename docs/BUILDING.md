# Building TOOLBOXLAP Gateway v1.0 Beta

These instructions build the Windows x64 portable multi-provider application
from source.

## Prerequisites

- Windows 10 or Windows 11, x64
- Node.js 22.12.0 or newer
- npm included with Node.js
- PowerShell
- Internet access for the initial dependency installation

End users of the packaged portable executable do not need a separate Node.js
installation.

## Install and validate

For a checkout containing `package-lock.json`:

```powershell
npm ci
npm run check
npm test
```

The unit and integration suites use local mocks and do not require live
provider credentials. Do not run live GMI, OpenRouter, or DeepSeek validation
scripts with production credentials as part of routine build verification.

## Build

```powershell
npm run build
```

Electron Builder writes generated output under the ignored `dist/` directory.
The configured portable artifact is:

```text
dist/TOOLBOXLAP-Gateway-v1.0-Beta-Portable.exe
```

The build also creates an unpacked application under `dist/win-unpacked/`.
The post-build hook copies `build/launch.cmd` into that unpacked directory.

## Verify a candidate

Before distributing a candidate:

1. Run `npm run check` and `npm test`.
2. Confirm the application reports package version `1.0.0-beta`.
3. Confirm the default gateway binds to `127.0.0.1:8787`.
4. Confirm GMI Cloud, OpenRouter, and DeepSeek appear in the provider selector.
5. Use test-only provider credentials when manually testing external services.
6. Calculate the SHA-256 digest from the exact final artifact:

```powershell
Get-FileHash .\dist\TOOLBOXLAP-Gateway-v1.0-Beta-Portable.exe -Algorithm SHA256
```

Do not reuse a checksum after rebuilding; any source, dependency, packaging, or
security change can alter the executable.

## Release assets

Do not commit `dist/`, `candidate-dist/`, `release/`, unpacked Electron
files, installers, archives, generated checksums, caches, logs, or runtime
user-data. The portable EXE belongs on the release/download host or in a
separately approved GitHub Release, not in source control.

The project is licensed under `GPL-3.0-only`, and the packaged application
includes the repository's `LICENSE` file.
