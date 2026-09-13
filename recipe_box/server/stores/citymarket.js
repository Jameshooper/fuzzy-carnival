'use strict';

/**
 * (K-)Citymarket / K-Ruoka.fi adapter.
 *
 * IMPORTANT: Citymarket is a Kesko (K Group) chain — a *different* company
 * and a completely separate online store from Prisma/S-kaupat (S Group).
 * It sells online through k-ruoka.fi, which also has no public API.
 *
 * Known third-party scrapers for k-ruoka.fi work by replaying a real
 * browser's internal API request, including headers like
 * `x-k-build-number` and `x-k-experiments` whose valid values change with
 * every K-Ruoka frontend deploy and have to be refreshed by hand. Without
 * a currently-valid captured request there is nothing honest to hardcode
 * here — a guessed header would just fail (or silently misbehave) in a
 * way that's indistinguishable from "working" until it breaks.
 *
 * So for now `lookup()` always returns null (no network call is made at
 * all) and the UI shows the search-link fallback, which always works.
 *
 * To wire up real live lookups: open k-ruoka.fi in a browser, search for
 * a product, open DevTools → Network → find the search XHR/fetch request,
 * and copy its URL + headers + a sample response here. Then fill in
 * REST_ENDPOINT/headers/parseResponse the same way prisma.js does.
 */

const SEARCH_URL_TEMPLATE =
  process.env.CITYMARKET_SEARCH_URL_TEMPLATE || 'https://www.k-ruoka.fi/kauppa/haku?query={query}';

function searchUrl(query) {
  return SEARCH_URL_TEMPLATE.replace('{query}', encodeURIComponent(query));
}

async function lookup() {
  return null; // not implemented yet — see module comment above
}

module.exports = {
  id: 'citymarket',
  name: 'Citymarket',
  homeUrl: 'https://www.k-ruoka.fi/',
  // Not implemented yet — see module comment above. lookup() always
  // returns null so the UI shows the search link instead.
  liveLookupSupported: false,
  searchUrl,
  lookup,
};
