'use strict';
const express = require('express');
const { requireAuth } = require('../auth');
const { asyncHandler } = require('../asyncHandler');
const stores = require('../stores');

const router = express.Router();
router.use(requireAuth);
router.use(express.json({ limit: '256kb' }));

// GET /api/stores — which store adapters exist, and whether each one
// currently attempts real live price/stock lookups or is search-link-only.
router.get('/', (req, res) => {
  res.json(stores.list());
});

// POST /api/stores/links — pure URL building, no outbound network calls.
// Safe to call automatically whenever a recipe is opened.
router.post('/links', (req, res) => {
  const ingredients = Array.isArray(req.body?.ingredients) ? req.body.ingredients : [];
  const links = {};
  for (const ingredient of ingredients) {
    links[ingredient] = stores.searchLinks(ingredient);
  }
  res.json(links);
});

// POST /api/stores/check — attempts live price/availability lookups.
// Only call this in response to an explicit user action (a "Check
// prices" button), not automatically, since it may make outbound
// requests to third-party store sites.
router.post('/check', asyncHandler(async (req, res) => {
  const ingredients = Array.isArray(req.body?.ingredients) ? req.body.ingredients : [];
  if (!ingredients.length) return res.json([]);
  if (ingredients.length > 60) {
    return res.status(400).json({ error: 'too many ingredients (max 60)' });
  }
  const results = await stores.checkIngredients(ingredients);
  res.json(results);
}));

module.exports = router;
