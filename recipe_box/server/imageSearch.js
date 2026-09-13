'use strict';

/**
 * Searches for a recipe photo by text query (typically the recipe
 * title) using the Openverse API — a public search over openly-licensed
 * (Creative Commons / public domain) images aggregated from Wikimedia
 * Commons, Flickr, museums, and other providers. No API key required
 * for the search volumes a personal app generates, and — unlike the
 * grocery-store integration — this is exactly the use case the API is
 * built and documented for, not an undocumented endpoint we're guessing
 * the shape of.
 *
 * https://api.openverse.org/v1/images/
 */

const SEARCH_ENDPOINT = 'https://api.openverse.org/v1/images/';
const TIMEOUT_MS = 8000;

async function searchImages(query, { limit = 12 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const url = `${SEARCH_ENDPOINT}?${new URLSearchParams({
      q: query,
      page_size: String(Math.min(limit, 20)),
      mature: 'false',
    })}`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        // Openverse asks API consumers to identify themselves via UA.
        'User-Agent': 'RecipeBox/1.0 (self-hosted personal recipe app; no homepage)',
        Accept: 'application/json',
      },
    });
    if (!res.ok) {
      const bodyText = await res.text().catch(() => '');
      throw new Error(`Image search failed (HTTP ${res.status})${bodyText ? `: ${bodyText.slice(0, 300)}` : ''}`);
    }
    const data = await res.json();
    const rawResults = Array.isArray(data.results) ? data.results : [];

    const mapped = rawResults
      .map((r) => ({
        id: r.id || '',
        title: r.title || '',
        thumbnailUrl: r.thumbnail || r.url || '',
        imageUrl: r.url || r.thumbnail || '',
        sourceUrl: r.foreign_landing_url || '',
        creator: r.creator || '',
        provider: r.provider || r.source || '',
        license: r.license ? String(r.license).toUpperCase() : '',
        licenseVersion: r.license_version || '',
      }))
      .filter((r) => r.thumbnailUrl && r.imageUrl);

    // Diagnostic: distinguish "Openverse genuinely has nothing for this
    // query" from "Openverse returned results but our field-name
    // assumptions dropped all of them" — the latter would mean the
    // response shape doesn't match what's documented/expected.
    if (rawResults.length && !mapped.length) {
      console.warn(
        `[recipe-box] image search "${query}": Openverse returned ${rawResults.length} raw result(s) but 0 survived parsing — sample keys: ${Object.keys(rawResults[0] || {}).join(', ')}`
      );
    } else if (typeof data.result_count === 'number') {
      console.log(`[recipe-box] image search "${query}": Openverse result_count=${data.result_count}, page returned ${rawResults.length}, usable ${mapped.length}`);
    }

    return mapped;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { searchImages };
