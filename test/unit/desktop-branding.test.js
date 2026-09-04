// test/unit/desktop-branding.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXTERNAL_LINKS } from '../../src/external-links.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..', '..');

test('EXTERNAL_LINKS.github points to repository', () => {
  assert.equal(EXTERNAL_LINKS.github, 'https://github.com/toolboxlap-ve/toolboxlap-gateway');
  assert.equal(EXTERNAL_LINKS.website, 'https://toolboxlap.com/');
  assert.equal(EXTERNAL_LINKS.youtube, 'https://www.youtube.com/@TOOLBOXLAP-u1c');
});

test('package.json includes icon configuration in build', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  assert.equal(pkg.build?.win?.icon, 'assets/icon.ico');
  assert.ok(pkg.build?.files?.includes('assets/**/*'));
});

test('assets/icon.ico exists and contains all 8 required resolutions', () => {
  const icoPath = path.join(rootDir, 'assets', 'icon.ico');
  assert.ok(fs.existsSync(icoPath), 'assets/icon.ico must exist');

  const buf = fs.readFileSync(icoPath);
  assert.ok(buf.length > 1000, 'icon.ico should not be empty');

  const reserved = buf.readUInt16LE(0);
  const type = buf.readUInt16LE(2);
  const count = buf.readUInt16LE(4);

  assert.equal(reserved, 0, 'ICO reserved field must be 0');
  assert.equal(type, 1, 'ICO type field must be 1 (icon)');
  assert.equal(count, 8, 'ICO must contain 8 frame resolutions');

  const expectedSizes = [16, 20, 24, 32, 48, 64, 128, 256];
  const actualSizes = [];

  for (let i = 0; i < count; i++) {
    const entryOffset = 6 + i * 16;
    const w = buf.readUInt8(entryOffset) || 256;
    const h = buf.readUInt8(entryOffset + 1) || 256;
    const bpp = buf.readUInt16LE(entryOffset + 6);
    const size = buf.readUInt32LE(entryOffset + 8);
    const offset = buf.readUInt32LE(entryOffset + 12);

    assert.equal(w, h, `Frame ${i} width (${w}) should equal height (${h})`);
    assert.equal(bpp, 32, `Frame ${i} should be 32 bpp`);
    assert.ok(size > 0, `Frame ${i} size must be > 0`);
    assert.ok(offset + size <= buf.length, `Frame ${i} data must reside within file bounds`);

    actualSizes.push(w);
  }

  assert.deepEqual(actualSizes, expectedSizes, 'ICO resolutions must match exactly [16, 20, 24, 32, 48, 64, 128, 256]');
});

test('assets/icon.png exists and is a 256x256 PNG', () => {
  const pngPath = path.join(rootDir, 'assets', 'icon.png');
  assert.ok(fs.existsSync(pngPath), 'assets/icon.png must exist');

  const buf = fs.readFileSync(pngPath);
  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  assert.equal(buf.readUInt32BE(0), 0x89504E47);
  assert.equal(buf.readUInt32BE(4), 0x0D0A1A0A);

  // IHDR width and height at offset 16 and 20
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  assert.equal(width, 256);
  assert.equal(height, 256);
});

test('system tray icons exist and have distinct states', () => {
  const runningPath = path.join(rootDir, 'assets', 'tray-running.png');
  const stoppedPath = path.join(rootDir, 'assets', 'tray-stopped.png');

  assert.ok(fs.existsSync(runningPath), 'assets/tray-running.png must exist');
  assert.ok(fs.existsSync(stoppedPath), 'assets/tray-stopped.png must exist');

  const runningBuf = fs.readFileSync(runningPath);
  const stoppedBuf = fs.readFileSync(stoppedPath);

  // Check 32x32 dimensions
  assert.equal(runningBuf.readUInt32BE(16), 32);
  assert.equal(runningBuf.readUInt32BE(20), 32);
  assert.equal(stoppedBuf.readUInt32BE(16), 32);
  assert.equal(stoppedBuf.readUInt32BE(20), 32);

  // They should not be identical because one has green dot, other has gray dot
  assert.notDeepEqual(runningBuf, stoppedBuf, 'Running and stopped tray icons must have different status dots');
});
