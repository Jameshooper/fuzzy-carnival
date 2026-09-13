'use strict';
const express = require('express');
const { requireAuth } = require('../auth');
const { asyncHandler } = require('../asyncHandler');
const { searchImages } = require('../imageSearch');

const router = express.Router();
router.use(requireAuth);

// GET /api/image-search?q=... — used by the "Find a photo online" button
// on both the recipe form and an existing recipe with no photo. Only
// runs when the user explicitly taps that button, same as the store
// price check — never automatically.
router.get('/', asyncHandler(async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'missing search query' });
  try {
    const results = await searchImages(q);
    console.log(`[recipe-box] image search "${q}" -> ${results.length} result(s)`);
    res.json(results);
  } catch (err) {
    console.error(`[recipe-box] image search "${q}" failed:`, err.message);
    res.status(502).json({ error: "Couldn't search for images right now — try again, or upload one manually." });
  }
}));

module.exports = router;
