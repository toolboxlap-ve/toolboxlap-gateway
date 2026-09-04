// scripts/generate-icons.cjs
// Generates official multi-size TOOLBOXLAP Gateway icon assets:
// - assets/icon.ico (contains 16, 20, 24, 32, 48, 64, 128, 256)
// - assets/icon.png (256x256 high-resolution app icon)
// - assets/tray-running.png (32x32 tray icon with vibrant green status dot)
// - assets/tray-stopped.png (32x32 tray icon with subtle gray status dot)
// Also syncs to build/icon.ico and src/assets/ for runtime & packaging availability.

const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

function createIco(pngBuffersWithSizes) {
  const count = pngBuffersWithSizes.length;
  const headerSize = 6;
  const dirEntrySize = 16;
  let offset = headerSize + count * dirEntrySize;

  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // 1 = ICO
  header.writeUInt16LE(count, 4); // count of images

  const dirEntries = [];
  const imageBuffers = [];

  for (const item of pngBuffersWithSizes) {
    const entry = Buffer.alloc(dirEntrySize);
    const w = item.width >= 256 ? 0 : item.width;
    const h = item.height >= 256 ? 0 : item.height;
    entry.writeUInt8(w, 0);
    entry.writeUInt8(h, 1);
    entry.writeUInt8(0, 2); // 0 = no palette
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(item.buffer.length, 8); // size of image in bytes
    entry.writeUInt32LE(offset, 12); // offset from beginning of file

    dirEntries.push(entry);
    imageBuffers.push(item.buffer);
    offset += item.buffer.length;
  }

  return Buffer.concat([header, ...dirEntries, ...imageBuffers]);
}

function getIconHtml(size, statusDot = null) {
  // Stroke width adjusted for pixel sharpness at tiny vs large sizes
  const strokeWidth = size <= 20 ? 2.6 : size <= 32 ? 2.3 : size <= 48 ? 2.1 : 2.0;
  const cornerRadius = Math.max(3, Math.round(size * 0.22));
  const padding = Math.max(1, Math.round(size * 0.04));
  const boxSize = size - padding * 2;

  let dotSvg = '';
  if (statusDot) {
    const isRunning = statusDot === 'running';
    const dotColor = isRunning ? '#22c55e' : '#64748b';
    const dotGlow = isRunning ? '#4ade80' : '#94a3b8';
    // Status dot in bottom right
    dotSvg = `
      <g id="status-dot">
        <!-- Outer dark boundary to separate from background -->
        <circle cx="25" cy="25" r="6.2" fill="#07090f" />
        <circle cx="25" cy="25" r="5" fill="url(#dotGrad)" />
        ${isRunning ? '<circle cx="25" cy="25" r="5.2" fill="none" stroke="' + dotGlow + '" stroke-width="1.2" opacity="0.8" />' : ''}
        <circle cx="23.8" cy="23.8" r="1.8" fill="#ffffff" opacity="${isRunning ? '0.6' : '0.3'}" />
      </g>
    `;
  }

  return `<!doctype html>
  <html>
  <head>
    <meta charset="utf-8" />
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body {
        width: ${size}px;
        height: ${size}px;
        background: transparent;
        overflow: hidden;
        display: flex;
        align-items: center;
        justify-content: center;
      }
    </style>
  </head>
  <body>
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <!-- Background linear gradient -->
        <linearGradient id="bgGrad" x1="0" y1="0" x2="${size}" y2="${size}" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#101827" />
          <stop offset="50%" stop-color="#0c101a" />
          <stop offset="100%" stop-color="#07090f" />
        </linearGradient>

        <!-- Border neon gradient -->
        <linearGradient id="borderGrad" x1="0" y1="0" x2="${size}" y2="${size}" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#00d4ff" stop-opacity="0.85" />
          <stop offset="50%" stop-color="#2a8cff" stop-opacity="0.7" />
          <stop offset="100%" stop-color="#8b5cf6" stop-opacity="0.6" />
        </linearGradient>

        <!-- Top layer cyan-to-blue gradient -->
        <linearGradient id="topLayerGrad" x1="3" y1="3" x2="21" y2="11" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#00f2fe" />
          <stop offset="100%" stop-color="#00b4d8" />
        </linearGradient>

        <!-- Middle layer electric blue gradient -->
        <linearGradient id="midLayerGrad" x1="3" y1="12" x2="21" y2="16" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#38bdf8" />
          <stop offset="100%" stop-color="#1d4ed8" />
        </linearGradient>

        <!-- Bottom layer violet gradient -->
        <linearGradient id="botLayerGrad" x1="3" y1="17" x2="21" y2="21" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#a855f7" />
          <stop offset="100%" stop-color="#6366f1" />
        </linearGradient>

        <!-- Status dot gradient -->
        <linearGradient id="dotGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${statusDot === 'running' ? '#4ade80' : '#94a3b8'}" />
          <stop offset="100%" stop-color="${statusDot === 'running' ? '#16a34a' : '#475569'}" />
        </linearGradient>
      </defs>

      <!-- Rounded App Tile Container -->
      <rect x="${padding}" y="${padding}" width="${boxSize}" height="${boxSize}" rx="${cornerRadius}" ry="${cornerRadius}"
        fill="url(#bgGrad)" stroke="url(#borderGrad)" stroke-width="${Math.max(1, size * 0.03)}" />

      <!-- Inner ambient glow -->
      <rect x="${padding + 1}" y="${padding + 1}" width="${boxSize - 2}" height="${boxSize - 2}" rx="${Math.max(2, cornerRadius - 1)}"
        fill="none" stroke="rgba(0, 212, 255, 0.12)" stroke-width="1" />

      <!-- Official 3-tier Isometric Stack Vector -->
      <g transform="translate(${size * 0.2}, ${size * 0.2}) scale(${size * 0.6 / 24})">
        <!-- Top Rhombus Layer: filled with gradient and crisp outline -->
        <path d="M3 7l9-4 9 4-9 4-9-4z"
          fill="url(#topLayerGrad)"
          stroke="#00f2fe"
          stroke-width="${strokeWidth * 0.7}"
          stroke-linecap="round"
          stroke-linejoin="round" />

        <!-- Middle Layer Chevron -->
        <path d="M3 12l9 4 9-4"
          stroke="url(#midLayerGrad)"
          stroke-width="${strokeWidth}"
          stroke-linecap="round"
          stroke-linejoin="round" />

        <!-- Bottom Layer Chevron -->
        <path d="M3 17l9 4 9-4"
          stroke="url(#botLayerGrad)"
          stroke-width="${strokeWidth}"
          stroke-linecap="round"
          stroke-linejoin="round" />
      </g>

      ${dotSvg}
    </svg>
  </body>
  </html>`;
}

async function renderImage(size, statusDot = null) {
  const win = new BrowserWindow({
    width: size,
    height: size,
    show: false,
    frame: false,
    transparent: true,
    webPreferences: { offscreen: true }
  });

  const html = getIconHtml(size, statusDot);
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  await new Promise(resolve => setTimeout(resolve, 80));
  const image = await win.webContents.capturePage();
  win.close();
  return image;
}

app.whenReady().then(async () => {
  try {
    const rootDir = path.resolve(__dirname, '..');
    const assetsDir = path.join(rootDir, 'assets');
    const buildDir = path.join(rootDir, 'build');
    const srcAssetsDir = path.join(rootDir, 'src', 'assets');

    [assetsDir, buildDir, srcAssetsDir].forEach(dir => {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    });

    console.log('Rendering master 256x256 TOOLBOXLAP Gateway icon...');
    const masterImage = await renderImage(256);
    const masterPng = masterImage.toPNG();

    console.log('Generating multi-size icon frames [16, 20, 24, 32, 48, 64, 128, 256]...');
    const sizes = [16, 20, 24, 32, 48, 64, 128, 256];
    const icoItems = [];

    for (const s of sizes) {
      let buf;
      if (s === 256) {
        buf = masterPng;
      } else {
        const resized = masterImage.resize({ width: s, height: s, quality: 'best' });
        buf = resized.toPNG();
      }
      icoItems.push({ width: s, height: s, buffer: buf });
      console.log(`  ✓ Frame ${s}x${s}: ${buf.length} bytes (W=${buf.readUInt32BE(16)}, H=${buf.readUInt32BE(20)})`);
      fs.writeFileSync(path.join(assetsDir, `icon-${s}.png`), buf);
      fs.writeFileSync(path.join(srcAssetsDir, `icon-${s}.png`), buf);
    }

    // 1. Build and save multi-size ICO containing all 8 resolutions
    const icoBuffer = createIco(icoItems);
    const icoPath = path.join(assetsDir, 'icon.ico');
    fs.writeFileSync(icoPath, icoBuffer);
    fs.writeFileSync(path.join(buildDir, 'icon.ico'), icoBuffer);
    fs.writeFileSync(path.join(srcAssetsDir, 'icon.ico'), icoBuffer);
    console.log(`✓ Generated multi-size Windows ICO (${icoBuffer.length} bytes) -> assets/icon.ico & build/icon.ico`);

    // 2. Save master 256x256 icon.png
    fs.writeFileSync(path.join(assetsDir, 'icon.png'), masterPng);
    fs.writeFileSync(path.join(srcAssetsDir, 'icon.png'), masterPng);
    console.log(`✓ Saved master icon.png (${masterPng.length} bytes)`);

    // 3. Render and save tray-running.png (32x32 with green status dot)
    console.log('Rendering system tray state icons...');
    const trayRunningMaster = await renderImage(256, 'running');
    const trayRunningBuf = trayRunningMaster.resize({ width: 32, height: 32, quality: 'best' }).toPNG();
    fs.writeFileSync(path.join(assetsDir, 'tray-running.png'), trayRunningBuf);
    fs.writeFileSync(path.join(srcAssetsDir, 'tray-running.png'), trayRunningBuf);
    console.log(`✓ Generated tray-running.png (32x32, ${trayRunningBuf.length} bytes, W=${trayRunningBuf.readUInt32BE(16)}, H=${trayRunningBuf.readUInt32BE(20)})`);

    // 4. Render and save tray-stopped.png (32x32 with gray status dot)
    const trayStoppedMaster = await renderImage(256, 'stopped');
    const trayStoppedBuf = trayStoppedMaster.resize({ width: 32, height: 32, quality: 'best' }).toPNG();
    fs.writeFileSync(path.join(assetsDir, 'tray-stopped.png'), trayStoppedBuf);
    fs.writeFileSync(path.join(srcAssetsDir, 'tray-stopped.png'), trayStoppedBuf);
    console.log(`✓ Generated tray-stopped.png (32x32, ${trayStoppedBuf.length} bytes, W=${trayStoppedBuf.readUInt32BE(16)}, H=${trayStoppedBuf.readUInt32BE(20)})`);

    console.log('All icons generated successfully!');
  } catch (err) {
    console.error('Failed to generate icons:', err);
    process.exit(1);
  } finally {
    app.quit();
  }
});
