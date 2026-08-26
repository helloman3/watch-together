const { Resvg } = require('../server/node_modules/@resvg/resvg-js');
const fs = require('fs');
const path = require('path');

function createIco(pngBuffers) {
  const count = pngBuffers.length;
  const headerSize = 6 + (16 * count);
  let totalSize = headerSize;
  for (const item of pngBuffers) {
    totalSize += item.buffer.length;
  }

  const out = Buffer.alloc(totalSize);
  out.writeUInt16LE(0, 0); // Reserved
  out.writeUInt16LE(1, 2); // Type = 1 (ICO)
  out.writeUInt16LE(count, 4); // Count

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
    out.writeUInt32LE(buffer.length, entryOffset + 8); // Size in bytes
    out.writeUInt32LE(currentOffset, entryOffset + 12); // File offset

    buffer.copy(out, currentOffset);
    currentOffset += buffer.length;
  }
  return out;
}

const svgPath = path.resolve(__dirname, '../client/public/logo.svg');
const svg = fs.readFileSync(svgPath, 'utf8');

const sizes = [512, 256, 192, 144, 128, 96, 72, 64, 48, 32, 16];
const rendered = {};

for (const size of sizes) {
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: size }
  });
  const pngData = resvg.render();
  rendered[size] = pngData.asPng();
  console.log(`Rendered ${size}x${size} (${rendered[size].length} bytes)`);
}

// 1. Web & Electron assets
fs.writeFileSync(path.resolve(__dirname, '../client/public/logo-512.png'), rendered[512]);
fs.writeFileSync(path.resolve(__dirname, '../client/public/logo.png'), rendered[512]);
fs.writeFileSync(path.resolve(__dirname, '../client/public/favicon.png'), rendered[64]);
fs.writeFileSync(path.resolve(__dirname, '../client/electron/icon.png'), rendered[512]);

// 2. Windows .ico
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

// 3. Android Mipmap icons
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
    console.log(`Saved Android icons to ${folder} (${size}x${size})`);
  }
}

console.log('🎉 ALL ICONS AND LOGOS GENERATED AND WRITTEN WITH 100% SUCCESS!');
