'use strict';
const path = require('path');
const { installDomPolyfills } = require('./domPolyfills');

// pdfjs-dist (Mozilla's own PDF.js, actively maintained, zero
// dependencies of its own) ships ESM-only, so it's loaded via a dynamic
// import() from this CommonJS module — that's the standard, supported
// way to consume an ESM package from CJS in Node.
//
// Why not the popular `pdf-parse` package: its bundled legacy pdf.js
// builds (v1.10.100 / v2.0.550) turned out to throw "bad XRef entry" on
// perfectly valid, freshly-generated PDFs under this project's Node
// version — a real compatibility bug, not a fluke of any one file. Going
// straight to a current pdfjs-dist avoids that entirely and is the more
// current, better-maintained engine anyway.
//
// Some PDFs need DOMMatrix/Path2D/ImageData (browser-only globals) even
// for plain text extraction — certain embedded font types compute glyph
// widths by interpreting literal drawing operators, which touches the
// same code as canvas rendering even though this app never renders a
// page. installDomPolyfills() provides just enough of those APIs.
installDomPolyfills();

const PKG_ROOT = path.dirname(require.resolve('pdfjs-dist/package.json'));
const STANDARD_FONTS_URL = path.join(PKG_ROOT, 'standard_fonts') + '/';
const CMAPS_URL = path.join(PKG_ROOT, 'cmaps') + '/';

let pdfjsLibPromise = null;
function loadPdfjs() {
  if (!pdfjsLibPromise) pdfjsLibPromise = import('pdfjs-dist/legacy/build/pdf.mjs');
  return pdfjsLibPromise;
}

const MAX_PAGES = 30; // recipes are short — bound worst-case parse time

/**
 * Extracts plain text from a PDF buffer, in reading order, one line per
 * distinct vertical text position (a reasonable approximation of visual
 * line breaks for the kind of simple, mostly-text documents a recipe
 * export produces).
 */
async function extractTextFromPdf(buffer) {
  const pdfjsLib = await loadPdfjs();
  let doc;
  try {
    doc = await pdfjsLib.getDocument({
      data: new Uint8Array(buffer),
      useWorkerFetch: false,
      isEvalSupported: false,
      standardFontDataUrl: STANDARD_FONTS_URL,
      cMapUrl: CMAPS_URL,
      cMapPacked: true,
    }).promise;
  } catch (err) {
    if (err && err.name === 'PasswordException') {
      throw new Error('That PDF is password-protected — remove the password and try again.');
    }
    throw new Error("Couldn't read that PDF — it may be corrupted or not a real PDF file.");
  }

  try {
    const pageCount = Math.min(doc.numPages, MAX_PAGES);
    const pageTexts = [];
    for (let i = 1; i <= pageCount; i++) {
      try {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        let lastY = null;
        let text = '';
        for (const item of content.items) {
          if (lastY !== null && item.transform[5] !== lastY) text += '\n';
          text += item.str;
          lastY = item.transform[5];
        }
        pageTexts.push(text);
        page.cleanup();
      } catch (err) {
        // A single page failing (an unusual embedded font, a malformed
        // content stream, etc.) shouldn't sink the whole import — skip
        // it and keep whatever other pages give us. If every page fails
        // this way, the caller's "no readable text found" check on the
        // combined (empty) result takes over with a friendly message,
        // rather than a raw internal error reaching the UI.
        console.warn(`[recipe-box] PDF page ${i} text extraction failed:`, err.message);
      }
    }
    return pageTexts.join('\n\n');
  } finally {
    await doc.destroy();
  }
}

module.exports = { extractTextFromPdf };
