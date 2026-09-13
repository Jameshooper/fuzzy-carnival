'use strict';

/**
 * Extracts structured recipe data from a recipe webpage URL.
 *
 * Unlike the grocery-store integration, this stands on solid ground:
 * almost every recipe site (AllRecipes, NYT Cooking, Serious Eats, BBC
 * Good Food, and the vast majority of food blogs via plugins like WP
 * Recipe Maker / Tasty Recipes) embeds a schema.org `Recipe` JSON-LD
 * block deliberately, specifically so it can be read by machines (it's
 * how Google builds recipe rich-snippets). We read that same block.
 *
 * If a page has no such block, we fall back to just the page <title> /
 * og:description so the user at least gets a starting point instead of
 * an error, and can fill in the rest — or paste the visible text into
 * the Import screen instead, which uses the heuristic text parser.
 */

const MAX_BYTES = 4 * 1024 * 1024; // 4MB cap on fetched HTML
const FETCH_TIMEOUT_MS = 8000;

const BROWSER_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 ' +
  '(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

function isBlockedHost(hostname) {
  const h = hostname.toLowerCase();
  if (h === 'localhost' || h === '0.0.0.0' || h === '::1') return true;
  if (h.endsWith('.local')) return true;
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = m.slice(1).map(Number);
    // Loopback, private-use, and link-local (which also covers cloud
    // metadata endpoints like 169.254.169.254).
    if (a === 127 || a === 10) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }
  return false;
}

// Basic same-host guard against SSRF-by-accident (a pasted link pointing
// at the server's own LAN). This is not exhaustive DNS-rebinding-proof
// hardening — it's a proportionate check for a personal, auth-gated tool,
// not a public multi-tenant boundary.
async function fetchHtml(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('That doesn’t look like a valid URL.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only http:// and https:// links are supported.');
  }
  if (isBlockedHost(parsed.hostname)) {
    throw new Error('That address isn’t allowed.');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(parsed.toString(), {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': BROWSER_UA, Accept: 'text/html,application/xhtml+xml' },
    });
    if (!res.ok) throw new Error(`The page returned an error (HTTP ${res.status}).`);
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('html')) throw new Error('That link didn’t return a web page.');
    if (!res.body) return await res.text();

    const reader = res.body.getReader();
    const chunks = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > MAX_BYTES) throw new Error('That page is too large to import.');
      chunks.push(value);
    }
    return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8');
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------- HTML/JSON-LD parsing ------------------------- */

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“',
  mdash: '—', ndash: '–', hellip: '…', bull: '•',
  deg: '°', copy: '©', reg: '®', trade: '™',
  times: '×', divide: '÷', plusmn: '±', micro: 'µ',
  frac12: '½', frac14: '¼', frac34: '¾',
};

function decodeEntities(str) {
  return String(str).replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (whole, code) => {
    if (code[0] === '#') {
      const num = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(num) ? String.fromCodePoint(num) : whole;
    }
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}

function stripHtml(str) {
  return decodeEntities(String(str).replace(/<[^>]+>/g, ' ')).replace(/[ \t]+/g, ' ').trim();
}

function findJsonLdRecipe(html) {
  const scripts = html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const m of scripts) {
    let data;
    try {
      data = JSON.parse(m[1].trim());
    } catch {
      continue; // malformed JSON-LD is common; just skip that block
    }
    const found = findRecipeNode(data);
    if (found) return found;
  }
  return null;
}

function findRecipeNode(node) {
  if (!node) return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findRecipeNode(item);
      if (found) return found;
    }
    return null;
  }
  if (typeof node !== 'object') return null;
  const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
  if (types.includes('Recipe')) return node;
  if (node['@graph']) return findRecipeNode(node['@graph']);
  return null;
}

function parseISODuration(iso) {
  if (!iso || typeof iso !== 'string') return '';
  const m = iso.match(/^P(?:\d+D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i);
  if (!m) return '';
  const [, h, min] = m;
  const parts = [];
  if (h) parts.push(`${h} hr`);
  if (min) parts.push(`${min} min`);
  return parts.join(' ');
}

function flattenInstructions(instr) {
  if (!instr) return [];
  if (typeof instr === 'string') {
    return stripHtml(instr).split(/\n+/).map((s) => s.trim()).filter(Boolean);
  }
  if (Array.isArray(instr)) return instr.flatMap(flattenInstructions);
  if (typeof instr === 'object') {
    if (instr['@type'] === 'HowToSection' && instr.itemListElement) {
      return flattenInstructions(instr.itemListElement);
    }
    if (instr.text) return [stripHtml(instr.text)];
    if (instr.name) return [stripHtml(instr.name)];
  }
  return [];
}

function flattenIngredients(ing) {
  if (!ing) return [];
  const arr = Array.isArray(ing) ? ing : [ing];
  return arr.map((i) => (typeof i === 'string' ? stripHtml(i) : '')).filter(Boolean);
}

function extractImageUrl(image, baseUrl) {
  let url = '';
  if (typeof image === 'string') url = image;
  else if (Array.isArray(image)) url = extractImageUrl(image[0], baseUrl);
  else if (image && typeof image === 'object') url = image.url || '';
  if (!url) return '';
  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return '';
  }
}

function yieldToServings(y) {
  if (!y) return '';
  const v = Array.isArray(y) ? y[0] : y;
  return v == null ? '' : stripHtml(String(v));
}

function categoryToTags(cat) {
  if (!cat) return [];
  const arr = Array.isArray(cat) ? cat : [cat];
  return arr.flatMap((c) => String(c).split(',')).map((t) => t.trim()).filter(Boolean).slice(0, 8);
}

function extractPageTitle(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? stripHtml(m[1]) : '';
}

function extractMeta(html, name) {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']*)["']`,
    'i'
  );
  const m = html.match(re);
  return m ? decodeEntities(m[1]).trim() : '';
}

/**
 * Fetches `url` and returns a recipe draft in the same shape as
 * parse.js's parseSharedText(), plus an extra `imageUrl` field (a page
 * image the caller may optionally download and attach).
 */
async function extractRecipeFromUrl(url) {
  const html = await fetchHtml(url);
  const node = findJsonLdRecipe(html);

  if (node) {
    return {
      title: stripHtml(node.name || extractPageTitle(html) || 'Imported recipe'),
      description: node.description ? stripHtml(node.description) : '',
      ingredients: flattenIngredients(node.recipeIngredient || node.ingredients),
      instructions: flattenInstructions(node.recipeInstructions),
      servings: yieldToServings(node.recipeYield),
      prepTime: parseISODuration(node.prepTime),
      cookTime: parseISODuration(node.cookTime) || parseISODuration(node.totalTime),
      tags: categoryToTags(node.recipeCategory),
      sourceUrl: url,
      notes: '',
      imageUrl: extractImageUrl(node.image, url),
      structured: true,
    };
  }

  // No machine-readable recipe found — hand back what little we can so
  // the user isn't left with a blank form, and they can fill in the rest
  // (or paste the visible ingredient/instruction text separately).
  return {
    title: extractPageTitle(html) || 'Imported recipe',
    description: extractMeta(html, 'og:description') || extractMeta(html, 'description'),
    ingredients: [],
    instructions: [],
    servings: '',
    prepTime: '',
    cookTime: '',
    tags: [],
    sourceUrl: url,
    notes: "Couldn't find structured recipe data on this page — check the ingredients/instructions manually, or paste the recipe's visible text into Import instead.",
    imageUrl: extractImageUrl(extractMeta(html, 'og:image'), url),
    structured: false,
  };
}

module.exports = { extractRecipeFromUrl, parseISODuration, stripHtml };
