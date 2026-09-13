'use strict';

/**
 * Minimal polyfills for a couple of things pdfjs-dist's Node.js
 * integration code assumes exist, which don't on every Node version this
 * app might run on (notably the Home Assistant add-on's Alpine base
 * image, which — as of this writing — ships a Node.js build old enough
 * to be missing both of these):
 *
 * 1. `process.getBuiltinModule(name)` — a Node API pdfjs-dist uses
 *    internally (to load `fs`/`module` for reading its standard font and
 *    CMap data files, and to optionally `require("@napi-rs/canvas")`)
 *    instead of a plain `require()`, since it also needs to run in
 *    contexts without one (the browser, a bundled ESM build). Where it's
 *    missing, pdfjs-dist catches the resulting TypeError and just warns
 *    ("Cannot access the `require` function...", "Unable to load font
 *    data...") rather than crashing — but that also means it silently
 *    can't read its own bundled standard-font/CMap files, which can
 *    reduce text-extraction fidelity for non-embedded fonts. A plain
 *    `require()` reaches the exact same builtins on any Node version, so
 *    polyfilling `process.getBuiltinModule` with that fixes this at the
 *    root rather than tolerating each downstream symptom.
 *
 * 2. `DOMMatrix` / `Path2D` / `ImageData` — browser-only globals some
 *    embedded font types (Type3 in particular, whose glyphs are literal
 *    drawing operators rather than outlines) need interpreted even just
 *    to compute text positions during plain getTextContent(), not only
 *    for actual canvas rendering (which this app never does — no
 *    `page.render()` call anywhere here). pdfjs-dist tries to source
 *    these from an optional `@napi-rs/canvas` package we deliberately
 *    don't install (see pdfExtract.js), so without our own polyfill it
 *    falls back to a bare warning and those code paths genuinely break.
 *    We tried the `dommatrix` npm package first; it's missing the
 *    self-mutating methods (`preMultiplySelf`, `invertSelf`,
 *    `multiplySelf`) pdf.js actually calls, so this implements the
 *    2D-affine subset of the spec directly instead — plain,
 *    well-understood matrix math, and we know exactly what's supported.
 */

function installNodeBuiltinModulePolyfill() {
  if (typeof process.getBuiltinModule !== 'function') {
    process.getBuiltinModule = (name) => require(name);
  }
}

class DOMMatrixPolyfill {
  constructor(init) {
    this.a = 1;
    this.b = 0;
    this.c = 0;
    this.d = 1;
    this.e = 0;
    this.f = 0;
    if (!init) return;
    if (Array.isArray(init) || ArrayBuffer.isView(init)) {
      if (init.length === 6) {
        [this.a, this.b, this.c, this.d, this.e, this.f] = init;
      } else if (init.length === 16) {
        // 4x4 matrix — take the 2D-relevant subset (column-major, per spec).
        [this.a, this.b, , , this.c, this.d, , , , , , , this.e, this.f] = init;
      }
    } else if (typeof init === 'object') {
      const { a, b, c, d, e, f } = init;
      if (a != null) this.a = a;
      if (b != null) this.b = b;
      if (c != null) this.c = c;
      if (d != null) this.d = d;
      if (e != null) this.e = e;
      if (f != null) this.f = f;
    }
  }

  get m11() { return this.a; }
  get m12() { return this.b; }
  get m21() { return this.c; }
  get m22() { return this.d; }
  get m41() { return this.e; }
  get m42() { return this.f; }

  multiply(other) {
    return new DOMMatrixPolyfill([this.a, this.b, this.c, this.d, this.e, this.f]).multiplySelf(other);
  }

  multiplySelf(other) {
    const m2 = other instanceof DOMMatrixPolyfill ? other : new DOMMatrixPolyfill(other);
    const { a: a1, b: b1, c: c1, d: d1, e: e1, f: f1 } = this;
    const { a: a2, b: b2, c: c2, d: d2, e: e2, f: f2 } = m2;
    this.a = a1 * a2 + c1 * b2;
    this.b = b1 * a2 + d1 * b2;
    this.c = a1 * c2 + c1 * d2;
    this.d = b1 * c2 + d1 * d2;
    this.e = a1 * e2 + c1 * f2 + e1;
    this.f = b1 * e2 + d1 * f2 + f1;
    return this;
  }

  preMultiplySelf(other) {
    const m2 = other instanceof DOMMatrixPolyfill ? other : new DOMMatrixPolyfill(other);
    const result = m2.multiply(this);
    this.a = result.a;
    this.b = result.b;
    this.c = result.c;
    this.d = result.d;
    this.e = result.e;
    this.f = result.f;
    return this;
  }

  invertSelf() {
    const { a, b, c, d, e, f } = this;
    const det = a * d - b * c;
    if (!det) {
      // The spec sets every field to NaN for a non-invertible matrix.
      // We use identity instead, since a NaN transform would silently
      // vanish any text that flows through it.
      this.a = this.d = 1;
      this.b = this.c = this.e = this.f = 0;
      return this;
    }
    this.a = d / det;
    this.b = -b / det;
    this.c = -c / det;
    this.d = a / det;
    this.e = (c * f - d * e) / det;
    this.f = (b * e - a * f) / det;
    return this;
  }

  translate(tx = 0, ty = 0) {
    return this.multiply({ a: 1, b: 0, c: 0, d: 1, e: tx, f: ty });
  }

  translateSelf(tx = 0, ty = 0) {
    return this.multiplySelf({ a: 1, b: 0, c: 0, d: 1, e: tx, f: ty });
  }

  scale(sx = 1, sy = sx) {
    return this.multiply({ a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 });
  }

  scaleSelf(sx = 1, sy = sx) {
    return this.multiplySelf({ a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 });
  }

  transformPoint(point = { x: 0, y: 0 }) {
    return {
      x: this.a * point.x + this.c * point.y + this.e,
      y: this.b * point.x + this.d * point.y + this.f,
    };
  }

  toString() {
    return `matrix(${this.a}, ${this.b}, ${this.c}, ${this.d}, ${this.e}, ${this.f})`;
  }
}

// This app never renders a page to a canvas (no page.render() call
// anywhere) — only getTextContent(). Some font code paths build Path2D
// objects along the way regardless, so this just needs to not throw; the
// paths themselves are never drawn.
class Path2DPolyfill {
  addPath() { return this; }
  moveTo() { return this; }
  lineTo() { return this; }
  bezierCurveTo() { return this; }
  quadraticCurveTo() { return this; }
  closePath() { return this; }
  rect() { return this; }
  arc() { return this; }
  ellipse() { return this; }
}

class ImageDataPolyfill {
  constructor(dataOrWidth, widthOrHeight, height) {
    if (typeof dataOrWidth === 'number') {
      this.width = dataOrWidth;
      this.height = widthOrHeight;
      this.data = new Uint8ClampedArray(this.width * this.height * 4);
    } else {
      this.data = dataOrWidth;
      this.width = widthOrHeight;
      this.height = height;
    }
  }
}

let installed = false;
function installDomPolyfills() {
  if (installed) return;
  installed = true;
  installNodeBuiltinModulePolyfill();
  if (typeof globalThis.DOMMatrix === 'undefined') globalThis.DOMMatrix = DOMMatrixPolyfill;
  if (typeof globalThis.Path2D === 'undefined') globalThis.Path2D = Path2DPolyfill;
  if (typeof globalThis.ImageData === 'undefined') globalThis.ImageData = ImageDataPolyfill;
}

module.exports = { installDomPolyfills, DOMMatrixPolyfill, Path2DPolyfill, ImageDataPolyfill };
