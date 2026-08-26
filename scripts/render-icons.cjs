const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

function createIco(pngBuffers) {
  const count = pngBuffers.length;
  let headerSize = 6 + (16 * count);
  let totalSize = headerSize;
  for (const item of pngBuffers) {
    totalSize += item.buffer.length;
  }

  const out = Buffer.alloc(totalSize);
  out.writeUInt16LE(0, 0); // Reserved
  out.writeUInt16LE(1, 2); // ICO Type
  out.writeUInt16LE(count, 4); // Number of images

  let currentOffset = headerSize;
  for (let i = 0; i < count; i++) {
    const { size, buffer } = pngBuffers[i];
    const entryOffset = 6 + (i * 16);
    out.writeUInt8(size >= 256 ? 0 : size, entryOffset + 0); // Width
    out.writeUInt8(size >= 256 ? 0 : size, entryOffset + 1); // Height
    out.writeUInt8(0, entryOffset + 2); // Colors
    out.writeUInt8(0, entryOffset + 3); // Reserved
    out.writeUInt16LE(1, entryOffset + 4); // Color planes
    out.writeUInt16LE(32, entryOffset + 6); // Bits per pixel
    out.writeUInt32LE(buffer.length, entryOffset + 8); // Size
    out.writeUInt32LE(currentOffset, entryOffset + 12); // Offset

    buffer.copy(out, currentOffset);
    currentOffset += buffer.length;
  }
  return out;
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 512,
    height: 512,
    show: false,
    webPreferences: { offscreen: true }
  });

  const svgPath = path.resolve(__dirname, '../client/public/logo.svg');
  const svgContent = fs.readFileSync(svgPath, 'utf8');
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { width: 512px; height: 512px; overflow: hidden; background: transparent; }
          svg { width: 512px; height: 512px; display: block; }
        </style>
      </head>
      <body>${svgContent}</body>
    </html>
  `;

  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  await new Promise(r => setTimeout(r, 600));

  const image512 = await win.webContents.capturePage({ x: 0, y: 0, width: 512, height: 512 });
  
  const sizes = [512, 256, 192, 144, 128, 96, 72, 64, 48, 32, 16];
  const rendered = {};
  for (const s of sizes) {
    const resized = s === 512 ? image512 : image512.resize({ width: s, height: s, quality: 'best' });
    rendered[s] = resized.toPNG();
  }

  // 1. Save PNGs in client/public and client/electron
  fs.writeFileSync(path.resolve(__dirname, '../client/public/logo-512.png'), rendered[512]);
  fs.writeFileSync(path.resolve(__dirname, '../client/public/favicon.png'), rendered[64]);
  fs.writeFileSync(path.resolve(__dirname, '../client/electron/icon.png'), rendered[512]);

  // 2. Generate and save .ico files
  const icoBuffers = [
    { size: 256, buffer: rendered[256] },
    { size: 128, buffer: rendered[128] },
    { size: 64, buffer: rendered[64] },
    { size: 48, buffer: rendered[48] },
    { size: 32, buffer: rendered[32] },
    { size: 16, buffer: rendered[16] }
  ];
  const icoData = createIco(icoBuffers);
  fs.writeFileSync(path.resolve(__dirname, '../client/public/favicon.ico'), icoData);
  fs.writeFileSync(path.resolve(__dirname, '../client/electron/icon.ico'), icoData);
  fs.writeFileSync(path.resolve(__dirname, '../favicon.ico'), icoData);

  // 3. Android mipmap icons
  const androidResDir = path.resolve(__dirname, '../client/android/app/src/main/res');
  const mipmapMap = {
    'mipmap-mdpi': 48,
    'mipmap-hdpi': 72,
    'mipmap-xhdpi': 96,
    'mipmap-xxhdpi': 144,
    'mipmap-xxxhdpi': 192
  };

  for (const [folder, size] of Object.entries(mipmapMap)) {
    const targetDir = path.join(androidResDir, folder);
    if (fs.existsSync(targetDir)) {
      const buf = rendered[size];
      fs.writeFileSync(path.join(targetDir, 'ic_launcher.png'), buf);
      fs.writeFileSync(path.join(targetDir, 'ic_launcher_round.png'), buf);
      fs.writeFileSync(path.join(targetDir, 'ic_launcher_foreground.png'), buf);
    }
  }

  console.log('✅ ALL ICONS GENERATED SUCCESSFULLY FOR WINDOWS, WEB & ANDROID!');
  app.quit();
});
