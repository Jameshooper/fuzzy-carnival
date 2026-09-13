'use strict';

/**
 * Minimal polyfills for the browser-only globals some of pdfjs-dist's
 * font/glyph-processing code references — notably `DOMMatrix`, which
 * certain embedded font types (Type3 in particular, whose glyphs are
 * literal drawing operators rather than outlines) need interpreted even
 * just to compute text positions during plain getTextContent(), not
 * only for actual canvas rendering (which this app never does — no
 * `page.render()` call anywhere here).
 *
 * Node.js has no DOM, so these don't exist by default. We tried the
 * `dommatrix` npm package first, but it's missing the self-mutating
 * methods (`preMultiplySelf`, `invertSelf`, `multiplySelf`) pdf.js
 * actually calls — so this implements the 2D-affine subset of the
 * DOMMatrix spec directly. It's plain, well-understood matrix math, not
 * a lot of code, and it means we know exactly what's supported.
 */

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
  if (typeof globalThis.DOMMatrix === 'undefined') globalThis.DOMMatrix = DOMMatrixPolyfill;
  if (typeof globalThis.Path2D === 'undefined') globalThis.Path2D = Path2DPolyfill;
  if (typeof globalThis.ImageData === 'undefined') globalThis.ImageData = ImageDataPolyfill;
}

module.exports = { installDomPolyfills, DOMMatrixPolyfill, Path2DPolyfill, ImageDataPolyfill };
