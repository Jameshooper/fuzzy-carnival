'use strict';
const prisma = require('./prisma');
const citymarket = require('./citymarket');

const adapters = [prisma, citymarket];

function list() {
  return adapters.map((a) => ({
    id: a.id,
    name: a.name,
    homeUrl: a.homeUrl,
    liveLookupSupported: a.liveLookupSupported,
  }));
}

// Every ingredient × every store is checked concurrently, but we cap how
// many outbound lookups run at once so a big recipe doesn't fire off
// dozens of simultaneous requests at a third-party site.
const MAX_CONCURRENT = 4;

async function checkIngredients(ingredientNames) {
  const jobs = [];
  for (const ingredient of ingredientNames) {
    for (const store of adapters) {
      jobs.push({ ingredient, store });
    }
  }

  const results = [];
  let cursor = 0;
  async function worker() {
    while (cursor < jobs.length) {
      const { ingredient, store } = jobs[cursor++];
      let data = null;
      try {
        data = await store.lookup(ingredient);
      } catch {
        data = null;
      }
      results.push({
        ingredient,
        store: store.id,
        storeName: store.name,
        searchUrl: store.searchUrl(ingredient),
        found: Boolean(data),
        ...(data || {}),
      });
    }
  }

  const workers = Array.from({ length: Math.min(MAX_CONCURRENT, jobs.length) }, worker);
  await Promise.all(workers);
  return results;
}

function searchLinks(ingredientName) {
  return adapters.map((a) => ({ store: a.id, storeName: a.name, url: a.searchUrl(ingredientName) }));
}

module.exports = { list, checkIngredients, searchLinks };
