'use strict';
const express = require('express');
const path = require('path');
const { requireAuth } = require('../auth');
const { parseSharedText } = require('../parse');
const { extractRecipeFromUrl } = require('../recipeExtract');

const router = express.Router();

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

// GET /share-target — the PWA's Web Share Target endpoint. When the user
// picks "Recipe Box" from their phone's OS share sheet (e.g. sharing a
// recipe out of the Claude app, a browser, or a messaging app), Android
// navigates here with ?title=&text=&url=. We hand off to the SPA, which
// reads the query string and opens the import screen pre-filled.
router.get('/share-target', (req, res) => {
  res.sendFile(path.join(__dirname, '..', '..', 'public', 'index.html'));
});

module.exports = router;
