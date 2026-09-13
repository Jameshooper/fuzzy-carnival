'use strict';
const express = require('express');
const path = require('path');
const multer = require('multer');
const { requireAuth } = require('../auth');
const { parseSharedText } = require('../parse');
const { extractRecipeFromUrl } = require('../recipeExtract');
const { extractTextFromPdf } = require('../pdfExtract');

const router = express.Router();

// PDFs are parsed in memory and never written to disk — nothing to
// clean up, and it keeps a "save a Claude chat as PDF" import from
// leaving files behind.
const pdfUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') return cb(null, true);
    const err = new Error('only PDF files are accepted');
    err.status = 400;
    cb(err);
  },
});

// POST /api/parse — used by the "New from shared text" screen to turn
// pasted/shared text or a pasted recipe link into a structured draft.
// { text, url }. When a URL is given, we try to fetch that page and read
// its schema.org Recipe data first (far more reliable than guessing from
// text) and only fall back to the heuristic text parser if that fails.
router.post('/api/parse', requireAuth, express.json({ limit: '512kb' }), async (req, res) => {
  const { text, url } = req.body || {};
  const trimmedUrl = (url || '').trim();

  if (trimmedUrl) {
    try {
      const draft = await extractRecipeFromUrl(trimmedUrl);
      return res.json(draft);
    } catch (err) {
      const fallback = parseSharedText(text || '', trimmedUrl);
      fallback.notes = [`Couldn't import that link automatically: ${err.message}`, fallback.notes]
        .filter(Boolean)
        .join('\n\n');
      return res.json(fallback);
    }
  }

  res.json(parseSharedText(text || '', ''));
});

// POST /api/parse/pdf — used by the Import screen's "Upload a PDF"
// option (e.g. a Claude conversation saved/exported as a PDF). Extracts
// the PDF's text and runs it through the same heuristic parser used for
// pasted text — a PDF export has no schema.org markup to read, unlike a
// recipe webpage, so this is the best we can do automatically.
router.post('/api/parse/pdf', requireAuth, pdfUpload.single('pdf'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no PDF uploaded' });
  try {
    const text = await extractTextFromPdf(req.file.buffer);
    if (!text.trim()) {
      return res.status(422).json({
        error:
          "That PDF doesn't seem to contain any readable text (it may be a scanned image) — try pasting the recipe text instead.",
      });
    }
    res.json(parseSharedText(text, ''));
  } catch (err) {
    res.status(422).json({ error: err.message });
  }
});

// GET /share-target — the PWA's Web Share Target endpoint. When the user
// picks "Recipe Box" from their phone's OS share sheet (e.g. sharing a
// recipe out of the Claude app, a browser, or a messaging app), Android
// navigates here with ?title=&text=&url=. We hand off to the SPA, which
// reads the query string and opens the import screen pre-filled.
router.get('/share-target', (req, res) => {
  res.sendFile(path.join(__dirname, '..', '..', 'public', 'index.html'));
});

module.exports = router;
