'use strict';
const path = require('path');

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
    }
    return pageTexts.join('\n\n');
  } finally {
    await doc.destroy();
  }
}

module.exports = { extractTextFromPdf };
