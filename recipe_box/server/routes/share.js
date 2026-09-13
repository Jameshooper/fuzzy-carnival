'use strict';
const express = require('express');
const path = require('path');
const { requireAuth } = require('../auth');
const { parseSharedText } = require('../parse');

const router = express.Router();

// POST /api/parse — used by the "New from shared text" screen to turn
// pasted/shared text into a structured draft. { text, url }
router.post('/api/parse', requireAuth, express.json({ limit: '512kb' }), (req, res) => {
  const { text, url } = req.body || {};
  res.json(parseSharedText(text || '', url || ''));
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
