#!/usr/bin/env node
/**
 * Generates the PWA app icons as real PNG files with no external
 * dependencies (pure Node + zlib). Produces a rounded-square icon with a
 * simple "chef's hat + fork" glyph in a food-app color palette.
 *
 * Run: node tools/generate-icons.js
 * Output: public/icons/icon-192.png, icon-512.png, icon-maskable-512.png,
 *         public/icons/apple-touch-icon.png (180x180)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT_DIR = path.join(__dirname, '..', 'public', 'icons');
fs.mkdirSync(OUT_DIR, { recursive: true });

const BG = [0xe8, 0x5d, 0x2c, 0xff]; // warm terracotta
const FG = [0xff, 0xf6, 0xec, 0xff]; // cream

function makeCanvas(size) {
  const px = new Array(size);
  for (let y = 0; y < size; y++) {
    px[y] = new Array(size);
    for (let x = 0; x < size; x++) px[y][x] = null;
  }
  return px;
}

function fillRoundedSquare(px, size, radius, color) {
  const r = radius;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let inside = true;
      // corner checks
      const corners = [
        [r, r],
        [size - r, r],
        [r, size - r],
        [size - r, size - r],
      ];
      if (x < r && y < r) inside = dist(x, y, r, r) <= r;
      else if (x >= size - r && y < r) inside = dist(x, y, size - r, r) <= r;
      else if (x < r && y >= size - r) inside = dist(x, y, r, size - r) <= r;
      else if (x >= size - r && y >= size - r) inside = dist(x, y, size - r, size - r) <= r;
      if (inside) px[y][x] = color;
    }
  }
}

function fillCircle(px, size, cx, cy, r, color) {
  for (let y = Math.max(0, cy - r); y <= Math.min(size - 1, cy + r); y++) {
    for (let x = Math.max(0, cx - r); x <= Math.min(size - 1, cx + r); x++) {
      if (dist(x, y, cx, cy) <= r) px[y][x] = color;
    }
  }
}

function fillRect(px, size, x0, y0, x1, y1, color) {
  for (let y = Math.max(0, Math.round(y0)); y <= Math.min(size - 1, Math.round(y1)); y++) {
    for (let x = Math.max(0, Math.round(x0)); x <= Math.min(size - 1, Math.round(x1)); x++) {
      px[y][x] = color;
    }
  }
}

function dist(x, y, cx, cy) {
  return Math.hypot(x - cx, y - cy);
}

// Draws a simple fork-and-spoon "utensils" glyph centered in the icon,
// scaled from a unit box [0,1]x[0,1] into pixel space.
function drawUtensils(px, size, pad) {
  const s = size;
  const box = s - pad * 2;
  const u = (v) => pad + v * box; // unit -> pixel

  // Spoon (left): handle + bowl
  fillRect(px, s, u(0.28), u(0.42), u(0.36), u(0.86), FG);
  fillCircle(px, s, Math.round(u(0.32)), Math.round(u(0.28)), Math.round(box * 0.12), FG);

  // Fork (right): handle + tines
  fillRect(px, s, u(0.64), u(0.5), u(0.72), u(0.86), FG);
  for (const off of [0.58, 0.64, 0.7, 0.76]) {
    fillRect(px, s, u(off), u(0.14), u(off + 0.025), u(0.5), FG);
  }
  fillRect(px, s, u(0.56), u(0.46), u(0.8), u(0.52), FG);
}

function encodePNG(px, size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const c = px[y][x] || [0, 0, 0, 0];
      raw[o++] = c[0];
      raw[o++] = c[1];
      raw[o++] = c[2];
      raw[o++] = c[3];
    }
  }
  const idatData = zlib.deflateSync(raw, { level: 9 });

  const chunks = [];
  chunks.push(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])); // signature

  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(Buffer.concat([typeBuf, data])) >>> 0, 0);
    return Buffer.concat([len, typeBuf, data, crc]);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  chunks.push(chunk('IHDR', ihdr));
  chunks.push(chunk('IDAT', idatData));
  chunks.push(chunk('IEND', Buffer.alloc(0)));

  return Buffer.concat(chunks);
}

function buildIcon(size, { maskableSafe }) {
  const px = makeCanvas(size);
  if (maskableSafe) {
    // Maskable icons get cropped to a circle by the OS — fill edge to edge
    // and keep the glyph within the ~80% "safe zone".
    fillRect(px, size, 0, 0, size - 1, size - 1, BG);
    drawUtensils(px, size, size * 0.22);
  } else {
    fillRoundedSquare(px, size, Math.round(size * 0.2), BG);
    drawUtensils(px, size, size * 0.16);
  }
  return encodePNG(px, size);
}

const targets = [
  { file: 'icon-192.png', size: 192, maskableSafe: false },
  { file: 'icon-512.png', size: 512, maskableSafe: false },
  { file: 'icon-maskable-512.png', size: 512, maskableSafe: true },
  { file: 'apple-touch-icon.png', size: 180, maskableSafe: false },
];

for (const t of targets) {
  const buf = buildIcon(t.size, t);
  fs.writeFileSync(path.join(OUT_DIR, t.file), buf);
  console.log('wrote', t.file, buf.length, 'bytes');
}
