/**
 * RenegadeSwarm - Decentralized AI Model Distribution Network
 * Copyright (C) 2026 DevNullInc & The RenegadeSwarm Contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function createPng(width, height, drawFn) {
  const rowSize = width * 4 + 1;
  const rawData = Buffer.alloc(rowSize * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0; // Filter: None
    for (let x = 0; x < width; x++) {
      const pixelOffset = rowOffset + 1 + x * 4;
      const [r, g, b, a] = drawFn(x, y, width, height);
      rawData[pixelOffset] = r;
      rawData[pixelOffset + 1] = g;
      rawData[pixelOffset + 2] = b;
      rawData[pixelOffset + 3] = a;
    }
  }

  const compressedData = zlib.deflateSync(rawData);

  // PNG Signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // color type: RGBA
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace

  const ihdrChunk = createChunk('IHDR', ihdrData);
  const idatChunk = createChunk('IDAT', compressedData);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(8 + len + 4);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);

  const crc = crc32(chunk.subarray(4, 8 + len));
  chunk.writeInt32BE(crc, 8 + len);
  return chunk;
}

// CRC32 implementation
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c = c ^ buf[i];
    for (let j = 0; j < 8; j++) {
      c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
  }
  return ~c;
}

// Draw RenegadeSwarm glowing cyan/violet icon
function drawRenegadeIcon(x, y, w, h) {
  const cx = w / 2;
  const cy = h / 2;
  const dx = x - cx;
  const dy = y - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const radius = w * 0.44;

  // Background circle
  if (dist <= radius) {
    // Gradient dark purple/cyan background
    const t = (x + y) / (w + h);
    const bgR = Math.round(14 + t * 20);
    const bgG = Math.round(16 + t * 30);
    const bgB = Math.round(30 + t * 60);

    // Border ring (cyan glow)
    if (dist >= radius - 2) {
      return [0, 220, 255, 255];
    }

    // Draw stylized 'R' / Swarm node
    const nx = x / w;
    const ny = y / h;
    const inStem = nx >= 0.28 && nx <= 0.40 && ny >= 0.25 && ny <= 0.75;
    const inTopLoop = nx >= 0.38 && nx <= 0.68 && ny >= 0.25 && ny <= 0.52 && !(nx >= 0.48 && nx <= 0.58 && ny >= 0.34 && ny <= 0.43);
    const inLeg = nx >= 0.46 && nx <= 0.72 && ny >= 0.48 && ny <= 0.75 && Math.abs((nx - 0.46) - (ny - 0.48)) < 0.16;

    if (inStem || inTopLoop || inLeg) {
      return [0, 245, 255, 255]; // Bright cyan
    }

    return [bgR, bgG, bgB, 255];
  }

  return [0, 0, 0, 0]; // Transparent
}

const buildDir = path.join(__dirname, '../build');
if (!fs.existsSync(buildDir)) {
  fs.mkdirSync(buildDir, { recursive: true });
}

// Generate 32x32 tray icon and 256x256 app icon
const tray32 = createPng(32, 32, drawRenegadeIcon);
fs.writeFileSync(path.join(buildDir, 'tray-icon.png'), tray32);
fs.writeFileSync(path.join(buildDir, 'icon.png'), createPng(256, 256, drawRenegadeIcon));

console.log('Successfully generated build/tray-icon.png and build/icon.png');
console.log('Tray Base64:', tray32.toString('base64'));
