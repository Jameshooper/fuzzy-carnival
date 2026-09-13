'use strict';

/**
 * Prisma / S-kaupat.fi adapter.
 *
 * Prisma is part of the S Group co-op and sells online through the shared
 * s-kaupat.fi platform. S Group has no public product API, so:
 *
 *  - `searchUrl()` always works: it just builds a normal search-page URL a
 *    human would use. This is the reliable baseline the UI falls back to.
 *  - `lookup()` is a genuine best-effort attempt at a live price/stock
 *    check against an old, semi-documented internal search endpoint
 *    (a Findwise-powered search appliance S Group has used for product
 *    search: http://sgroup.findwise.com/api/rest/.../search.json). It is
 *    NOT verified against the current site from this codebase's dev
 *    environment (outbound access to s-kaupat.fi was not reachable while
 *    building this) — it may already be stale, or may stop working at any
 *    time if S Group changes backends. It is wrapped in a short timeout
 *    and fails silently to `null` so the UI just shows the search link
 *    instead of an error.
 *
 * If you capture a real request from your browser's DevTools (Network
 * tab → search for a product on s-kaupat.fi → the XHR/fetch request) and
 * it looks different from this, update REST_ENDPOINT / parseResponse
 * below to match — that's the fastest way to make this reliable.
 */

const SEARCH_URL_TEMPLATE =
  process.env.PRISMA_SEARCH_URL_TEMPLATE || 'https://www.s-kaupat.fi/haku?query={query}';

const REST_ENDPOINT =
  'http://sgroup.findwise.com/api/rest/ident/demoident/searcher/product/search.json';

const LOOKUP_TIMEOUT_MS = 4000;

function searchUrl(query) {
  return SEARCH_URL_TEMPLATE.replace('{query}', encodeURIComponent(query));
}

// Defensively pull a plausible product list out of an unknown response
// shape, since this endpoint's current schema isn't verified.
function extractDocs(data) {
  if (!data || typeof data !== 'object') return [];
  for (const key of ['docs', 'results', 'hits', 'items', 'products']) {
    const val = data[key];
    if (Array.isArray(val)) return val;
    if (val && Array.isArray(val.docs)) return val.docs; // e.g. { hits: { docs: [...] } }
  }
  return [];
}

function firstOf(obj, keys) {
  for (const k of keys) {
    if (obj[k] != null && obj[k] !== '') return obj[k];
  }
  return null;
}

async function lookup(query) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
  try {
    const url = `${REST_ENDPOINT}?${new URLSearchParams({
      q: query,
      hits: '3',
      store_chain: 'pr', // Prisma
      online_store: 'true',
      enriched: 'true',
    })}`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const data = await res.json();
    const docs = extractDocs(data);
    if (!docs.length) return null;

    const doc = docs[0];
    const name = firstOf(doc, ['name', 'title', 'productName']);
    const price = firstOf(doc, ['webPrice', 'price', 'unitPrice']);
    if (!name && price == null) return null; // unrecognized shape — don't guess

    return {
      productName: name || query,
      price: price != null ? Number(price) : null,
      currency: 'EUR',
      inStock: firstOf(doc, ['inStock', 'available']) ?? null,
      url: firstOf(doc, ['url', 'productUrl']) || searchUrl(query),
    };
  } catch {
    return null; // network error, timeout, bad JSON, blocked, etc. — fall back silently
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  id: 'prisma',
  name: 'Prisma',
  homeUrl: 'https://www.s-kaupat.fi/',
  // Experimental / unverified — see module comment above.
  liveLookupSupported: true,
  searchUrl,
  lookup,
};
