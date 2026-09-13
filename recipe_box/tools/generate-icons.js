#!/usr/bin/env node
/**
 * Generates the PWA app icons (and the Home Assistant add-on icon/logo)
 * as real PNG files with no external dependencies (pure Node + zlib).
 * Produces a rounded-square icon with a simple "spoon + fork" glyph in a
 * food-app color palette.
 *
 * Run: node tools/generate-icons.js
 * Output:
 *   public/icons/icon-192.png, icon-512.png, icon-maskable-512.png,
 *   public/icons/apple-touch-icon.png (180x180)
 *   icon.png (128x128), logo.png (250x100) — Home Assistant add-on assets
 */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const ICONS_DIR = path.join(ROOT, 'public', 'icons');
fs.mkdirSync(ICONS_DIR, { recursive: true });

const BG = [0xe8, 0x5d, 0x2c, 0xff]; // warm terracotta
const FG = [0xff, 0xf6, 0xec, 0xff]; // cream

function makeCanvas(w, h) {
  const px = new Array(h);
  for (let y = 0; y < h; y++) px[y] = new Array(w).fill(null);
  return px;
}

function dist(x, y, cx, cy) {
  return Math.hypot(x - cx, y - cy);
}

function fillRoundedRect(px, w, h, radius, color) {
  const r = Math.min(radius, w / 2, h / 2);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let inside = true;
      if (x < r && y < r) inside = dist(x, y, r, r) <= r;
      else if (x >= w - r && y < r) inside = dist(x, y, w - r, r) <= r;
      else if (x < r && y >= h - r) inside = dist(x, y, r, h - r) <= r;
      else if (x >= w - r && y >= h - r) inside = dist(x, y, w - r, h - r) <= r;
      if (inside) px[y][x] = color;
    }
  }
}

function fillCircle(px, w, h, cx, cy, r, color) {
  for (let y = Math.max(0, cy - r); y <= Math.min(h - 1, cy + r); y++) {
    for (let x = Math.max(0, cx - r); x <= Math.min(w - 1, cx + r); x++) {
      if (dist(x, y, cx, cy) <= r) px[y][x] = color;
    }
  }
}

function fillRect(px, w, h, x0, y0, x1, y1, color) {
  for (let y = Math.max(0, Math.round(y0)); y <= Math.min(h - 1, Math.round(y1)); y++) {
    for (let x = Math.max(0, Math.round(x0)); x <= Math.min(w - 1, Math.round(x1)); x++) {
      px[y][x] = color;
    }
  }
}

// Draws a simple fork-and-spoon "utensils" glyph inside the given box
// (in pixel coordinates), scaled from a unit box [0,1]x[0,1].
function drawUtensils(px, w, h, box) {
  const { x: bx, y: by, size: box$ } = box;
  const u = (v) => bx + v * box$;
  const uy = (v) => by + v * box$;

  // Spoon (left): handle + bowl
  fillRect(px, w, h, u(0.28), uy(0.42), u(0.36), uy(0.86), FG);
  fillCircle(px, w, h, Math.round(u(0.32)), Math.round(uy(0.28)), Math.round(box$ * 0.12), FG);

  // Fork (right): handle + tines
  fillRect(px, w, h, u(0.64), uy(0.5), u(0.72), uy(0.86), FG);
  for (const off of [0.58, 0.64, 0.7, 0.76]) {
    fillRect(px, w, h, u(off), uy(0.14), u(off + 0.025), uy(0.5), FG);
  }
  fillRect(px, w, h, u(0.56), uy(0.46), u(0.8), uy(0.52), FG);
}

function encodePNG(px, w, h) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  let o = 0;
  for (let y = 0; y < h; y++) {
    raw[o++] = 0; // filter: none
    for (let x = 0; x < w; x++) {
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
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
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

// Square app icon (PWA / apple-touch-icon style).
function buildSquareIcon(size, { maskableSafe }) {
  const px = makeCanvas(size, size);
  if (maskableSafe) {
    // Maskable icons get cropped to a circle by the OS — fill edge to edge
    // and keep the glyph within the ~80% "safe zone".
    fillRect(px, size, size, 0, 0, size - 1, size - 1, BG);
    const pad = size * 0.22;
    drawUtensils(px, size, size, { x: pad, y: pad, size: size - pad * 2 });
  } else {
    fillRoundedRect(px, size, size, Math.round(size * 0.2), BG);
    const pad = size * 0.16;
    drawUtensils(px, size, size, { x: pad, y: pad, size: size - pad * 2 });
  }
  return encodePNG(px, size, size);
}

// Wide logo (Home Assistant add-on "logo.png") — same glyph, centered on
// a rounded rectangular banner.
function buildLogo(w, h) {
  const px = makeCanvas(w, h);
  fillRoundedRect(px, w, h, Math.round(Math.min(w, h) * 0.16), BG);
  const glyphSize = h * 0.7;
  drawUtensils(px, w, h, { x: (w - glyphSize) / 2, y: h * 0.15, size: glyphSize });
  return encodePNG(px, w, h);
}

const squareTargets = [
  { file: path.join(ICONS_DIR, 'icon-192.png'), size: 192, maskableSafe: false },
  { file: path.join(ICONS_DIR, 'icon-512.png'), size: 512, maskableSafe: false },
  { file: path.join(ICONS_DIR, 'icon-maskable-512.png'), size: 512, maskableSafe: true },
  { file: path.join(ICONS_DIR, 'apple-touch-icon.png'), size: 180, maskableSafe: false },
  // Home Assistant add-on icon (min 128x128).
  { file: path.join(ROOT, 'icon.png'), size: 128, maskableSafe: false },
];

for (const t of squareTargets) {
  const buf = buildSquareIcon(t.size, t);
  fs.writeFileSync(t.file, buf);
  console.log('wrote', path.relative(ROOT, t.file), buf.length, 'bytes');
}

// Home Assistant add-on logo (min 250x100).
{
  const buf = buildLogo(250, 100);
  const file = path.join(ROOT, 'logo.png');
  fs.writeFileSync(file, buf);
  console.log('wrote', path.relative(ROOT, file), buf.length, 'bytes');
}
