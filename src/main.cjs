// src/main.cjs
// CJS shim that runs before main.js. Used so that we can run a preflight
// check that works regardless of how the entrypoint is loaded:
//
// - In normal Electron main process mode, the CJS shim runs, detects that
//   we're already in main process mode, and re-exports main.js via dynamic
//   import() so the rest of the ESM application runs unchanged.
//
// - In Node mode (ELECTRON_RUN_AS_NODE=1 set in the env), the CJS shim
//   detects that we're in Node mode, re-spawns the EXE with the env var
//   cleared, and exits. The spawned EXE then runs this same shim in main
//   process mode and continues normally.
//
// Putting the shim in CJS ensures it works in both loading modes —
// Electron's main binary treats the entrypoint as CJS even when our
// package.json says "type": "module".

const { spawn } = require('node:child_process');
const { writeFileSync, appendFileSync } = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const isElectronBinary = !!(process.versions && process.versions.electron);
const inMainProcess = process.type === 'browser';

if (isElectronBinary && !inMainProcess) {
  // We're in Node mode. Re-spawn the EXE with ELECTRON_RUN_AS_NODE cleared.
  const childArgv = process.argv.slice(1);
  const env = Object.assign({}, process.env);
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(process.execPath, childArgv, {
    env,
    stdio: 'inherit',
    windowsHide: true,
    detached: false,
  });
  child.on('exit', (code, signal) => {
    if (signal) {
      try { process.kill(process.pid, signal); } catch (_) { /* ignore */ }
    } else {
      process.exit(code == null ? 0 : code);
    }
  });
  child.on('error', (e) => {
    process.exit(1);
  });
  // Hold open. The exit handler above will terminate us.
  setInterval(() => {}, 60000);
} else {
  // Normal main process mode. Load the ESM main.js dynamically.
  // Use eval to invoke dynamic import() in CJS context.
  const dynamicImport = new Function('specifier', 'return import(specifier);');
  dynamicImport('./main.js').catch((e) => {
    // Re-throw so Electron's crash handler picks it up.
    throw e;
  });
}
