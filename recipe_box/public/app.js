'use strict';

/* ---------------------------------------------------------------------
 * Recipe Box — vanilla-JS single-page app (no build step, phone-first).
 * ------------------------------------------------------------------- */

const els = {
  login: document.getElementById('view-login'),
  main: document.getElementById('view-main'),
  loginForm: document.getElementById('login-form'),
  loginPassword: document.getElementById('login-password'),
  loginError: document.getElementById('login-error'),
  logoutBtn: document.getElementById('btn-logout'),
  search: document.getElementById('search-input'),
  tagChips: document.getElementById('tag-chips'),
  grid: document.getElementById('recipe-grid'),
  emptyState: document.getElementById('empty-state'),
  screens: {
    list: document.getElementById('view-list'),
    detail: document.getElementById('view-detail'),
    form: document.getElementById('view-form'),
    import: document.getElementById('view-import'),
  },
  navBtns: [...document.querySelectorAll('.nav-btn')],
  toast: document.getElementById('toast'),
};

const state = {
  tag: '',
  q: '',
  favoritesOnly: false,
};

/* ---------------------------- API helpers ---------------------------- */

async function api(path, opts = {}) {
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: opts.body && !(opts.body instanceof FormData) ? { 'Content-Type': 'application/json' } : undefined,
    ...opts,
  });
  if (res.status === 401) {
    showLogin();
    throw new Error('authentication required');
  }
  if (!res.ok) {
    let msg = `request failed (${res.status})`;
    try {
      const data = await res.json();
      if (data && data.error) msg = data.error;
    } catch {}
    throw new Error(msg);
  }
  if (res.status === 204) return null;
  const ct = res.headers.get('content-type') || '';
  return ct.includes('application/json') ? res.json() : res.text();
}

function toast(msg) {
  els.toast.textContent = msg;
  els.toast.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (els.toast.hidden = true), 2600);
}

/* ------------------------------ Auth ---------------------------------- */

async function checkSession() {
  const s = await fetch('/api/session', { credentials: 'same-origin' }).then((r) => r.json());
  if (s.authenticated) {
    showMain();
  } else {
    showLogin();
  }
}

function showLogin() {
  els.login.hidden = false;
  els.main.hidden = true;
}

function showMain() {
  els.login.hidden = true;
  els.main.hidden = false;
  router();
}

els.loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  els.loginError.hidden = true;
  try {
    await api('/api/login', { method: 'POST', body: JSON.stringify({ password: els.loginPassword.value }) });
    els.loginPassword.value = '';
    showMain();
  } catch (err) {
    els.loginError.textContent = 'Incorrect password.';
    els.loginError.hidden = false;
  }
});

els.logoutBtn.addEventListener('click', async () => {
  await api('/api/logout', { method: 'POST' });
  showLogin();
});

/* ------------------------------ Router --------------------------------- */

function navigate(hash) {
  if (location.hash === hash) router();
  else location.hash = hash;
}

window.addEventListener('hashchange', router);

function currentRoute() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [name, param] = raw.split('/');
  return { name: name || 'list', param };
}

function setActiveScreen(key) {
  Object.entries(els.screens).forEach(([k, el]) => (el.hidden = k !== key));
  els.navBtns.forEach((b) => b.classList.toggle('active', b.dataset.nav === key || (b.dataset.nav === 'list' && key === 'list')));
}

async function router() {
  const { name, param } = currentRoute();
  toggleAddMenu(false);
  try {
    if (name === 'list') {
      state.favoritesOnly = false;
      setActiveScreen('list');
      await refreshList();
    } else if (name === 'favorites') {
      state.favoritesOnly = true;
      setActiveScreen('list');
      await refreshList();
    } else if (name === 'recipe' && param) {
      setActiveScreen('detail');
      await renderDetail(param);
    } else if (name === 'new') {
      setActiveScreen('form');
      renderForm(null);
    } else if (name === 'edit' && param) {
      setActiveScreen('form');
      const recipe = await api(`/api/recipes/${param}`);
      renderForm(recipe);
    } else if (name === 'import') {
      setActiveScreen('import');
      renderImport();
    } else {
      navigate('#/list');
    }
  } catch (err) {
    if (err.message !== 'authentication required') toast(err.message);
  }
}

els.navBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    const dest = btn.dataset.nav;
    if (dest === 'add') toggleAddMenu();
    else navigate(`#/${dest}`);
  });
});

/* ----------------------------- Add menu ---------------------------------- */
// The "+" FAB offers a choice rather than jumping straight to a blank
// form, since "New recipe"'s only upload is a photo — the link/text/PDF
// import options live on a separate screen that's otherwise easy to miss.

const addMenu = document.getElementById('add-menu');
const addMenuBackdrop = document.getElementById('add-menu-backdrop');

function toggleAddMenu(show) {
  const next = show ?? addMenu.hidden;
  addMenu.hidden = !next;
  addMenuBackdrop.hidden = !next;
}

addMenuBackdrop.addEventListener('click', () => toggleAddMenu(false));
document.getElementById('add-menu-import').addEventListener('click', () => {
  toggleAddMenu(false);
  navigate('#/import');
});
document.getElementById('add-menu-new').addEventListener('click', () => {
  toggleAddMenu(false);
  navigate('#/new');
});

/* --------------------------- List / search ------------------------------ */

let searchDebounce;
els.search.addEventListener('input', () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    state.q = els.search.value.trim();
    refreshList();
  }, 250);
});

async function refreshList() {
  const [recipes, tags] = await Promise.all([
    api(
      `/api/recipes?` +
        new URLSearchParams({
          ...(state.q ? { q: state.q } : {}),
          ...(state.tag ? { tag: state.tag } : {}),
          ...(state.favoritesOnly ? { favorite: '1' } : {}),
        })
    ),
    api('/api/recipes/tags'),
  ]);
  renderTagChips(tags);
  renderGrid(recipes);
}

function renderTagChips(tags) {
  els.tagChips.innerHTML = '';
  if (!tags.length) return;
  const makeChip = (label, value) => {
    const chip = document.createElement('button');
    chip.className = 'chip' + (state.tag === value ? ' active' : '');
    chip.textContent = label;
    chip.addEventListener('click', () => {
      state.tag = state.tag === value ? '' : value;
      refreshList();
    });
    return chip;
  };
  els.tagChips.appendChild(makeChip('All', ''));
  tags.forEach((t) => els.tagChips.appendChild(makeChip(t, t)));
}

function renderGrid(recipes) {
  els.grid.innerHTML = '';
  els.emptyState.hidden = recipes.length > 0;
  for (const r of recipes) {
    const card = document.createElement('div');
    card.className = 'recipe-card';
    const meta = [r.prepTime, r.cookTime, r.servings ? `Serves ${r.servings}` : ''].filter(Boolean).join(' · ');
    card.innerHTML = `
      <div class="thumb" style="${r.imagePath ? `background-image:url('${escapeAttr(r.imagePath)}')` : ''}">${r.imagePath ? '' : '🍽️'}</div>
      <div class="body">
        <p class="title">${escapeHtml(r.title)}</p>
        <p class="meta">${escapeHtml(meta)}</p>
      </div>
      ${r.favorite ? '<div class="fav-badge">★</div>' : ''}
    `;
    card.addEventListener('click', () => navigate(`#/recipe/${r.id}`));
    els.grid.appendChild(card);
  }
}

/* ------------------------------ Scaling ---------------------------------- */
// Client-side only — never sent to the server or saved, so switching
// scale is instant and never touches the stored recipe. Re-derives the
// displayed quantities from the recipe's original ingredient text every
// time, rather than compounding an already-scaled display, so repeated
// scale changes never drift from the real values.

const UNICODE_FRACTIONS = {
  '¼': 1 / 4, '½': 1 / 2, '¾': 3 / 4,
  '⅓': 1 / 3, '⅔': 2 / 3,
  '⅕': 1 / 5, '⅖': 2 / 5, '⅗': 3 / 5, '⅘': 4 / 5,
  '⅙': 1 / 6, '⅚': 5 / 6,
  '⅛': 1 / 8, '⅜': 3 / 8, '⅝': 5 / 8, '⅞': 7 / 8,
};
const UNICODE_FRACTION_CHARS = Object.keys(UNICODE_FRACTIONS).join('');
// Common cooking fractions to snap a scaled result back onto, so "⅓ cup"
// doubled reads as "⅔ cup" rather than "0.67 cup".
const NICE_FRACTIONS = [
  [0, ''], [1 / 8, '⅛'], [1 / 4, '¼'], [1 / 3, '⅓'], [3 / 8, '⅜'], [1 / 2, '½'],
  [5 / 8, '⅝'], [2 / 3, '⅔'], [3 / 4, '¾'], [7 / 8, '⅞'],
];

function matchLeadingNumber(str) {
  let m = str.match(/^(\d+)\s+(\d+)\/(\d+)(?!\d)/); // mixed: "1 1/2"
  if (m) return { value: Number(m[1]) + Number(m[2]) / Number(m[3]), length: m[0].length };
  m = str.match(new RegExp(`^(\\d+)\\s*([${UNICODE_FRACTION_CHARS}])`)); // mixed: "1½" / "1 ½"
  if (m) return { value: Number(m[1]) + UNICODE_FRACTIONS[m[2]], length: m[0].length };
  m = str.match(/^(\d+)\/(\d+)(?!\d)/); // "1/2"
  if (m) return { value: Number(m[1]) / Number(m[2]), length: m[0].length };
  m = str.match(new RegExp(`^([${UNICODE_FRACTION_CHARS}])`)); // "½"
  if (m) return { value: UNICODE_FRACTIONS[m[1]], length: m[0].length };
  m = str.match(/^(\d+(?:\.\d+)?)/); // "2" / "1.5"
  if (m) return { value: Number(m[1]), length: m[0].length };
  return null;
}

function formatScaledNumber(n) {
  if (!Number.isFinite(n) || n <= 0) return '0';
  const whole = Math.floor(n + 1e-9);
  const frac = n - whole;
  if (frac > 0.96) return String(whole + 1);
  for (const [val, glyph] of NICE_FRACTIONS) {
    if (Math.abs(frac - val) < 0.04) {
      if (val === 0) return String(whole || 0);
      return whole ? `${whole}${glyph}` : glyph;
    }
  }
  return String(Math.round(n * 100) / 100); // no close common fraction — plain decimal
}

// ---- Unit conversion (volume/weight → metric or US imperial) ----
// Base units: ml for volume, g for weight. Longest alias wins so
// "tablespoon" doesn't get shadowed by a shorter partial match, and every
// alias requires a following non-letter (or end of string) so "g" can't
// match inside "grapes".
const VOLUME_TO_ML = {
  tsp: 4.92892, tsps: 4.92892, teaspoon: 4.92892, teaspoons: 4.92892,
  tbsp: 14.7868, tbsps: 14.7868, tablespoon: 14.7868, tablespoons: 14.7868,
  'fl oz': 29.5735, floz: 29.5735, 'fluid ounce': 29.5735, 'fluid ounces': 29.5735,
  cup: 236.588, cups: 236.588,
  pint: 473.176, pints: 473.176, pt: 473.176, pts: 473.176,
  quart: 946.353, quarts: 946.353, qt: 946.353, qts: 946.353,
  gallon: 3785.41, gallons: 3785.41, gal: 3785.41,
  ml: 1, mls: 1, milliliter: 1, milliliters: 1, millilitre: 1, millilitres: 1,
  l: 1000, liter: 1000, liters: 1000, litre: 1000, litres: 1000,
};
const WEIGHT_TO_G = {
  oz: 28.3495, ozs: 28.3495, ounce: 28.3495, ounces: 28.3495,
  lb: 453.592, lbs: 453.592, pound: 453.592, pounds: 453.592,
  g: 1, gs: 1, gram: 1, grams: 1,
  kg: 1000, kgs: 1000, kilogram: 1000, kilograms: 1000,
};
const SORTED_VOLUME_ALIASES = Object.keys(VOLUME_TO_ML).sort((a, b) => b.length - a.length);
const SORTED_WEIGHT_ALIASES = Object.keys(WEIGHT_TO_G).sort((a, b) => b.length - a.length);

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Finds a recognized volume/weight unit at the very start of `str`
// (typically what's left right after an ingredient's leading quantity).
function matchUnitToken(str) {
  const lead = str.match(/^\s*/)[0].length;
  const afterSpace = str.slice(lead);
  for (const [aliases, table, baseUnit] of [
    [SORTED_VOLUME_ALIASES, VOLUME_TO_ML, 'ml'],
    [SORTED_WEIGHT_ALIASES, WEIGHT_TO_G, 'g'],
  ]) {
    for (const alias of aliases) {
      const m = afterSpace.match(new RegExp(`^${escapeRegExp(alias)}(?![a-zA-Z])`, 'i'));
      if (m) return { matchedLength: lead + m[0].length, toBase: table[alias], baseUnit };
    }
  }
  return null;
}

function roundMetricNumber(n) {
  if (n < 1) return Math.round(n * 20) / 20; // nearest 0.05
  if (n < 10) return Math.round(n * 4) / 4; // nearest 0.25
  if (n < 250) return Math.round(n / 5) * 5; // nearest 5
  return Math.round(n / 25) * 25; // nearest 25
}

function formatMetricNumber(n) {
  const r = Math.round(roundMetricNumber(n) * 100) / 100;
  return String(r);
}

// Picks one sensible unit for a base (ml or g) value, shared by both ends
// of a range so "3-4 cups" doesn't come back mismatched (e.g. "700 ml -
// 1 l"); returns a converter usable for each endpoint individually.
function chooseMetricUnit(baseValue, baseUnit) {
  if (baseUnit === 'ml') return baseValue >= 1000 ? { factor: 1000, label: 'l' } : { factor: 1, label: 'ml' };
  return baseValue >= 1000 ? { factor: 1000, label: 'kg' } : { factor: 1, label: 'g' };
}

// Picks the smallest unit that still keeps the number in a range recipes
// actually write it in — e.g. prefers "1 cup" over the equivalent but
// much less idiomatic "½ pint" (pint is intentionally not in this
// ladder at all: recipes essentially never size an ingredient in
// pints, unlike cups/quarts/gallons).
function chooseImperialUnit(baseValue, baseUnit) {
  if (baseUnit === 'ml') {
    if (baseValue < 14.79) return { factor: 4.92892, singular: 'tsp', plural: 'tsp' }; // < 1 tbsp
    if (baseValue < 59.15) return { factor: 14.7868, singular: 'tbsp', plural: 'tbsp' }; // < 1/4 cup
    if (baseValue < 946.353) return { factor: 236.588, singular: 'cup', plural: 'cups' }; // < 1 quart
    if (baseValue < 3785.41) return { factor: 946.353, singular: 'quart', plural: 'quarts' }; // < 1 gallon
    return { factor: 3785.41, singular: 'gallon', plural: 'gallons' };
  }
  // Ounces stay ounces up to a full pound (an "8 oz block of cream
  // cheese" is how recipes actually say it, not "½ lb").
  return baseValue < 453.592
    ? { factor: 28.3495, singular: 'oz', plural: 'oz' }
    : { factor: 453.592, singular: 'lb', plural: 'lbs' };
}

// Volume units (and oz) read naturally as eighth-fractions ("1⅛ cups");
// pounds converted from a metric weight read more naturally as a plain
// decimal ("2.2 lbs", the conventional 1 kg ≈ 2.2 lb figure) than forced
// into "2¼ lbs". Rounding is split out from formatting so callers can
// decide singular/plural from the exact value that will be displayed —
// deciding it from the unrounded value could round e.g. 1.057 cups down
// to a displayed "1" while still labeling it plural ("1 cups").
function roundImperialValue(n, unitSingular) {
  return unitSingular === 'lb' ? Math.round(n * 10) / 10 : Math.round(n * 8) / 8;
}
function formatImperialQuantity(rounded, unitSingular) {
  return unitSingular === 'lb' ? String(rounded) : formatScaledNumber(rounded);
}

// Scales (and optionally converts the unit system of) the leading
// quantity in an ingredient line, including a simple range like "3-4
// cloves". Text with no leading quantity ("Salt to taste") is returned
// unchanged; a quantity with no recognized unit ("3 eggs") is scaled but
// never unit-converted, since there's nothing to convert.
function transformIngredientText(text, { multiplier = 1, unitSystem = 'original' } = {}) {
  if (multiplier === 1 && unitSystem === 'original') return text;
  const first = matchLeadingNumber(text);
  if (!first) return text;
  const rest = text.slice(first.length);

  let second = null;
  let tailAfterSecond = null;
  const rangeSep = rest.match(/^\s*(-|–|to)\s*/);
  if (rangeSep) {
    const afterSep = rest.slice(rangeSep[0].length);
    const secondMatch = matchLeadingNumber(afterSep);
    if (secondMatch) {
      second = secondMatch;
      tailAfterSecond = afterSep.slice(secondMatch.length);
    }
  }
  const restForUnit = second ? tailAfterSecond : rest;
  const unit = unitSystem === 'original' ? null : matchUnitToken(restForUnit);

  if (!unit) {
    if (second) return `${formatScaledNumber(first.value * multiplier)}-${formatScaledNumber(second.value * multiplier)}${tailAfterSecond}`;
    return `${formatScaledNumber(first.value * multiplier)}${rest}`;
  }

  const tail = restForUnit.slice(unit.matchedLength);
  const v1Base = first.value * multiplier * unit.toBase;
  const v2Base = second ? second.value * multiplier * unit.toBase : null;
  const refBase = v2Base != null ? Math.max(v1Base, v2Base) : v1Base;

  if (unitSystem === 'metric') {
    const target = chooseMetricUnit(refBase, unit.baseUnit);
    const v1 = formatMetricNumber(v1Base / target.factor);
    if (v2Base == null) return `${v1} ${target.label}${tail}`;
    const v2 = formatMetricNumber(v2Base / target.factor);
    return `${v1}-${v2} ${target.label}${tail}`;
  }

  // imperial
  const target = chooseImperialUnit(refBase, unit.baseUnit);
  const refRounded = roundImperialValue(refBase / target.factor, target.singular);
  const label = refRounded > 1.04 ? target.plural : target.singular;
  const v1 = formatImperialQuantity(roundImperialValue(v1Base / target.factor, target.singular), target.singular);
  if (v2Base == null) return `${v1} ${label}${tail}`;
  const v2 = formatImperialQuantity(roundImperialValue(v2Base / target.factor, target.singular), target.singular);
  return `${v1}-${v2} ${label}${tail}`;
}

// Converts Fahrenheit/Celsius mentions in instruction text (e.g. oven
// temperatures) to the target system; left untouched for 'original'.
function transformInstructionText(text, unitSystem) {
  if (unitSystem === 'original') return text;
  return text.replace(/(\d+(?:\.\d+)?)\s*°?\s*(fahrenheit|celsius|[fc])\b/gi, (whole, numStr, unitStr) => {
    const num = Number(numStr);
    const isF = /^f/i.test(unitStr);
    if (unitSystem === 'metric' && isF) return `${Math.round(((num - 32) * (5 / 9)) / 5) * 5}°C`;
    if (unitSystem === 'imperial' && !isF) return `${Math.round((num * (9 / 5) + 32) / 5) * 5}°F`;
    return whole;
  });
}

function scaleServingsText(text, multiplier) {
  if (multiplier === 1 || !text) return text;
  const trimmed = text.trim();

  // Prefer a number explicitly next to the word "serving(s)" — e.g. "1
  // loaf (8 servings)" should scale the 8, not the loaf count.
  const servingWord = trimmed.match(/(\d+(?:\.\d+)?)(\s*servings?\b)/i);
  if (servingWord) {
    const scaled = formatScaledNumber(Number(servingWord[1]) * multiplier);
    return trimmed.slice(0, servingWord.index) + scaled + servingWord[2] + trimmed.slice(servingWord.index + servingWord[0].length);
  }

  const first = matchLeadingNumber(trimmed);
  if (first) return `${formatScaledNumber(first.value * multiplier)}${trimmed.slice(first.length)}`;
  return `${text} (×${formatScaledNumber(multiplier)})`;
}

/* ------------------------------ Detail ---------------------------------- */

async function renderDetail(id) {
  const r = await api(`/api/recipes/${id}`);
  let scale = 1;
  let unitSystem = 'original';

  const hasServingsMeta = Boolean(r.servings);
  const meta = [
    hasServingsMeta ? `Serves <span id="meta-servings">${escapeHtml(r.servings)}</span>` : '',
    r.prepTime ? `Prep ${escapeHtml(r.prepTime)}` : '',
    r.cookTime ? `Cook ${escapeHtml(r.cookTime)}` : '',
  ].filter(Boolean);

  els.screens.detail.innerHTML = `
    <div class="back-row">
      <button class="back-btn" id="btn-back">‹ Recipes</button>
      <button class="fav-toggle-btn" id="btn-fav" title="Toggle favorite">${r.favorite ? '★' : '☆'}</button>
    </div>
    <div class="detail-hero ${r.imagePath ? '' : 'no-image'}" id="detail-hero" style="${r.imagePath ? `background-image:url('${escapeAttr(r.imagePath)}')` : ''}">
      ${r.imagePath ? '' : `🍽️<button type="button" class="btn btn-ghost btn-small" id="btn-find-photo-detail" style="position:relative;z-index:1;margin-top:10px;background:white;">🔍 Find a photo online</button>`}
    </div>
    <div id="image-search-results-detail"></div>
    <h2 class="detail-title">${escapeHtml(r.title)}</h2>
    ${meta.length ? `<div class="detail-meta">${meta.map((m) => `<span>${m}</span>`).join('')}</div>` : ''}
    ${r.tags.length ? `<div class="detail-tags">${r.tags.map((t) => `<span class="tag-pill">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
    ${r.description ? `<p>${escapeHtml(r.description)}</p>` : ''}

    ${r.ingredients.length ? `
      <div class="scale-row">
        <span class="scale-label">Scale</span>
        <div class="scale-chips">
          <button type="button" class="scale-chip" data-scale="0.5">½×</button>
          <button type="button" class="scale-chip active" data-scale="1">1×</button>
          <button type="button" class="scale-chip" data-scale="2">2×</button>
          <button type="button" class="scale-chip" data-scale="3">3×</button>
        </div>
        <input type="number" id="scale-custom" class="scale-custom-input" placeholder="Custom ×" min="0.1" step="0.25" />
      </div>
      <div class="scale-row">
        <span class="scale-label">Units</span>
        <div class="scale-chips">
          <button type="button" class="unit-chip active" data-unit="original">As written</button>
          <button type="button" class="unit-chip" data-unit="metric">Metric</button>
          <button type="button" class="unit-chip" data-unit="imperial">Imperial</button>
        </div>
      </div>

      <h3 class="section-title">Ingredients</h3>
      <ul class="ingredient-list">
        ${r.ingredients.map((ing, i) => `<li data-ingredient="${escapeAttr(ing)}"><input type="checkbox" id="ing-${i}" /><label for="ing-${i}" id="ing-label-${i}">${escapeHtml(ing)}</label></li>`).join('')}
      </ul>` : ''}

    ${r.instructions.length ? `
      <h3 class="section-title">Instructions</h3>
      <ol class="instruction-list">
        ${r.instructions.map((step, i) => `<li id="instr-${i}">${escapeHtml(step)}</li>`).join('')}
      </ol>` : ''}

    ${r.notes ? `<h3 class="section-title">Notes</h3><div class="notes-block">${escapeHtml(r.notes)}</div>` : ''}
    ${r.sourceUrl ? `<a class="source-link" href="${escapeAttr(r.sourceUrl)}" target="_blank" rel="noopener">View original source ↗</a>` : ''}

    <div class="action-row">
      <button class="btn btn-primary" id="btn-share">📤 Share</button>
      <button class="btn btn-secondary" id="btn-edit">✎ Edit</button>
      <button class="btn btn-danger" id="btn-delete">🗑 Delete</button>
    </div>
  `;

  document.getElementById('btn-back').addEventListener('click', () => navigate('#/list'));
  document.getElementById('btn-edit').addEventListener('click', () => navigate(`#/edit/${r.id}`));
  document.getElementById('btn-fav').addEventListener('click', () => toggleFavorite(r));
  document.getElementById('btn-delete').addEventListener('click', () => deleteRecipe(r));
  document.getElementById('btn-share').addEventListener('click', () => shareRecipe(r, scale, unitSystem));

  const findPhotoBtn = document.getElementById('btn-find-photo-detail');
  if (findPhotoBtn) {
    findPhotoBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      renderImageSearchResults(document.getElementById('image-search-results-detail'), r.title, findPhotoBtn, async (result) => {
        try {
          await api(`/api/recipes/${r.id}/image-from-url`, {
            method: 'POST',
            body: JSON.stringify({ url: result.imageUrl }),
          });
          toast('Photo added');
          renderDetail(r.id);
        } catch (err) {
          toast(err.message);
        }
      });
    });
  }

  function applyTransforms() {
    r.ingredients.forEach((ing, i) => {
      const label = document.getElementById(`ing-label-${i}`);
      if (label) label.textContent = transformIngredientText(ing, { multiplier: scale, unitSystem });
    });
    const servingsEl = document.getElementById('meta-servings');
    if (servingsEl) servingsEl.textContent = scaleServingsText(r.servings, scale);
    r.instructions.forEach((step, i) => {
      const el = document.getElementById(`instr-${i}`);
      if (el) el.textContent = transformInstructionText(step, unitSystem);
    });
  }

  const scaleChips = [...document.querySelectorAll('.scale-chip')];
  const scaleCustomInput = document.getElementById('scale-custom');
  scaleChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      scaleChips.forEach((c) => c.classList.toggle('active', c === chip));
      if (scaleCustomInput) scaleCustomInput.value = '';
      scale = Number(chip.dataset.scale);
      applyTransforms();
    });
  });
  if (scaleCustomInput) {
    scaleCustomInput.addEventListener('input', () => {
      const val = Number(scaleCustomInput.value);
      if (!val || val <= 0) return;
      scaleChips.forEach((c) => c.classList.remove('active'));
      scale = val;
      applyTransforms();
    });
  }

  const unitChips = [...document.querySelectorAll('.unit-chip')];
  unitChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      unitChips.forEach((c) => c.classList.toggle('active', c === chip));
      unitSystem = chip.dataset.unit;
      applyTransforms();
    });
  });
}

async function toggleFavorite(r) {
  await api(`/api/recipes/${r.id}`, {
    method: 'PUT',
    body: JSON.stringify({ ...r, favorite: !r.favorite }),
  });
  renderDetail(r.id);
}

async function deleteRecipe(r) {
  if (!confirm(`Delete "${r.title}"? This can't be undone.`)) return;
  await api(`/api/recipes/${r.id}`, { method: 'DELETE' });
  toast('Recipe deleted');
  navigate('#/list');
}

function recipeToShareText(r, scale = 1, unitSystem = 'original') {
  const lines = [r.title, ''];
  const servings = scale !== 1 ? scaleServingsText(r.servings, scale) : r.servings;
  const meta = [servings ? `Serves: ${servings}` : '', r.prepTime ? `Prep time: ${r.prepTime}` : '', r.cookTime ? `Cook time: ${r.cookTime}` : ''].filter(Boolean);
  const notes = [];
  if (scale !== 1) notes.push(`scaled ×${formatScaledNumber(scale)}`);
  if (unitSystem !== 'original') notes.push(unitSystem === 'metric' ? 'converted to metric' : 'converted to US imperial');
  if (notes.length) meta.push(notes.join(', '));
  if (meta.length) lines.push(meta.join(' | '), '');
  if (r.ingredients.length) {
    lines.push('Ingredients:');
    r.ingredients.forEach((i) => lines.push(`- ${transformIngredientText(i, { multiplier: scale, unitSystem })}`));
    lines.push('');
  }
  if (r.instructions.length) {
    lines.push('Instructions:');
    r.instructions.forEach((s, i) => lines.push(`${i + 1}. ${transformInstructionText(s, unitSystem)}`));
    lines.push('');
  }
  if (r.notes) lines.push('Notes:', r.notes, '');
  if (r.sourceUrl) lines.push(r.sourceUrl);
  return lines.join('\n').trim();
}

async function shareRecipe(r, scale = 1, unitSystem = 'original') {
  const text = recipeToShareText(r, scale, unitSystem);
  if (navigator.share) {
    try {
      await navigator.share({ title: r.title, text, url: r.sourceUrl || undefined });
    } catch (err) {
      if (err.name !== 'AbortError') toast('Could not open share sheet');
    }
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    toast('Recipe copied to clipboard');
  } catch {
    toast('Sharing is not supported on this browser');
  }
}

/* --------------------------- Image search ---------------------------------- */
// Shared by the recipe form and the detail view's "no photo yet" state.
// Searches Openverse (openly-licensed images) by title text and shows a
// row of candidate thumbnails for the user to pick from, rather than
// auto-attaching whatever comes back first — a wrong or irrelevant photo
// picked automatically would be worse than no photo at all.

async function renderImageSearchResults(container, query, triggerBtn, onSelect) {
  if (triggerBtn) {
    triggerBtn.disabled = true;
    triggerBtn.textContent = 'Searching…';
  }
  container.innerHTML = '<p class="muted" style="font-size:0.82rem;margin:8px 0 0;">Searching…</p>';
  try {
    const results = await api(`/api/image-search?q=${encodeURIComponent(query)}`);
    if (!results.length) {
      // Stock-photo search engines match short, generic terms far better
      // than a full recipe-blog-style title ("Caramelized Onion, Goat
      // Cheese & Thyme Chicken Roulade" won't match anything verbatim,
      // but "chicken roulade" might) — let the user narrow it down
      // themselves rather than being stuck with the literal title.
      container.innerHTML = `
        <p class="muted" style="font-size:0.82rem;margin:8px 0 6px;">No photos found for "${escapeHtml(query)}". Long or unusual titles often don't match — try a shorter, more generic search:</p>
        <div class="image-refine-row">
          <input type="text" id="image-refine-input" value="${escapeAttr(query)}" placeholder="e.g. chicken roulade" />
          <button type="button" class="btn btn-secondary btn-small" id="image-refine-btn">Search</button>
        </div>
      `;
      const refineInput = document.getElementById('image-refine-input');
      const retry = () => {
        const q = refineInput.value.trim();
        if (q) renderImageSearchResults(container, q, triggerBtn, onSelect);
      };
      document.getElementById('image-refine-btn').addEventListener('click', retry);
      refineInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          retry();
        }
      });
      return;
    }
    container.innerHTML = `
      <div class="image-results-strip">
        ${results
          .map(
            (r, i) => `
          <button type="button" class="image-result" id="image-result-${i}" title="${escapeAttr(r.creator ? `Photo by ${r.creator}${r.provider ? ` via ${r.provider}` : ''}` : '')}">
            <img src="${escapeAttr(r.thumbnailUrl)}" alt="${escapeAttr(r.title)}" loading="lazy" />
            ${r.license ? `<span class="image-result-license">${escapeHtml(r.license)}</span>` : ''}
          </button>`
          )
          .join('')}
      </div>
      <p class="muted" style="font-size:0.74rem;margin:6px 0 0;">Openly-licensed photos via Openverse — tap one's credit to see the source.</p>
    `;
    results.forEach((r, i) => {
      document.getElementById(`image-result-${i}`).addEventListener('click', () => {
        onSelect(r);
        container.innerHTML = '';
      });
    });
  } catch (err) {
    container.innerHTML = `<p class="error-text" style="font-size:0.82rem;margin:8px 0 0;">${escapeHtml(err.message)}</p>`;
  } finally {
    if (triggerBtn) {
      triggerBtn.disabled = false;
      triggerBtn.textContent = '🔍 Find a photo online';
    }
  }
}

/* ------------------------------- Form ------------------------------------ */

function createListEditor(container, items, placeholder) {
  container.innerHTML = '';
  const rows = [];

  function addRow(value = '') {
    const row = document.createElement('div');
    row.className = 'list-editor-row';
    row.innerHTML = `<input type="text" value="${escapeAttr(value)}" placeholder="${placeholder}" />
      <button type="button" class="remove-btn" aria-label="Remove">✕</button>`;
    row.querySelector('.remove-btn').addEventListener('click', () => {
      row.remove();
    });
    container.insertBefore(row, addBtn);
    rows.push(row);
  }

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'add-row-btn';
  addBtn.textContent = '+ Add';
  addBtn.addEventListener('click', () => addRow());

  container.appendChild(addBtn);
  (items && items.length ? items : ['']).forEach((v) => addRow(v));

  return () =>
    [...container.querySelectorAll('.list-editor-row input')]
      .map((i) => i.value.trim())
      .filter(Boolean);
}

function renderForm(recipe, prefillNotice) {
  const isEdit = Boolean(recipe && recipe.id);
  const r = recipe || {
    title: '', description: '', ingredients: [], instructions: [], servings: '',
    prepTime: '', cookTime: '', tags: [], sourceUrl: '', notes: '', imagePath: '', favorite: false,
  };
  // A draft parsed from an imported link may carry a page image we
  // haven't downloaded yet — show it as a live preview and only fetch it
  // server-side on save, so we don't waste downloads on discarded drafts.
  const previewImage = r.imagePath || r.imageUrl || '';

  els.screens.form.innerHTML = `
    <div class="back-row">
      <button class="back-btn" id="btn-cancel">‹ Cancel</button>
      <h2 style="margin:0;font-size:1.05rem;">${isEdit ? 'Edit recipe' : 'New recipe'}</h2>
      <span></span>
    </div>
    ${!isEdit ? `<p class="muted" style="margin:0 0 14px;">Have recipe text from Claude or another app? <a href="#/import">Paste it instead →</a></p>` : ''}

    <form id="recipe-form">
      <div class="image-preview" id="image-preview" style="${previewImage ? `background-image:url('${escapeAttr(previewImage)}')` : ''}">${previewImage ? '' : 'No photo yet'}</div>
      <div class="form-group">
        <label>Photo</label>
        <input type="file" id="image-file" accept="image/*" />
        <button type="button" class="btn btn-ghost btn-small" id="btn-find-photo" style="margin-top:8px;">🔍 Find a photo online</button>
        <div id="image-search-results"></div>
      </div>

      <div class="form-group">
        <label for="f-title">Title *</label>
        <input type="text" id="f-title" value="${escapeAttr(r.title)}" required />
      </div>

      <div class="form-group">
        <label for="f-description">Description</label>
        <textarea id="f-description" rows="2">${escapeHtml(r.description)}</textarea>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label for="f-servings">Servings</label>
          <input type="text" id="f-servings" value="${escapeAttr(r.servings)}" placeholder="4" />
        </div>
        <div class="form-group">
          <label for="f-prep">Prep time</label>
          <input type="text" id="f-prep" value="${escapeAttr(r.prepTime)}" placeholder="15 min" />
        </div>
        <div class="form-group">
          <label for="f-cook">Cook time</label>
          <input type="text" id="f-cook" value="${escapeAttr(r.cookTime)}" placeholder="30 min" />
        </div>
      </div>

      <div class="form-group">
        <label>Ingredients</label>
        <div class="list-editor" id="ingredients-editor"></div>
      </div>

      <div class="form-group">
        <label>Instructions</label>
        <div class="list-editor" id="instructions-editor"></div>
      </div>

      <div class="form-group">
        <label for="f-tags">Tags (comma separated)</label>
        <input type="text" id="f-tags" value="${escapeAttr((r.tags || []).join(', '))}" placeholder="dinner, vegetarian, quick" />
      </div>

      <div class="form-group">
        <label for="f-notes">Notes</label>
        <textarea id="f-notes" rows="3">${escapeHtml(r.notes)}</textarea>
      </div>

      <div class="form-group">
        <label for="f-source">Source URL</label>
        <input type="url" id="f-source" value="${escapeAttr(r.sourceUrl)}" placeholder="https://…" />
      </div>

      <div class="form-actions">
        <button type="button" class="btn btn-secondary" id="btn-cancel-2">Cancel</button>
        <button type="submit" class="btn btn-primary">${isEdit ? 'Save changes' : 'Save recipe'}</button>
      </div>
    </form>
  `;

  const getIngredients = createListEditor(document.getElementById('ingredients-editor'), r.ingredients, 'e.g. 2 cups flour');
  const getInstructions = createListEditor(document.getElementById('instructions-editor'), r.instructions, 'e.g. Preheat oven to 350°F');

  let pendingImageFile = null;
  let pendingImageUrl = r.imageUrl || ''; // cleared if the user picks their own file instead
  document.getElementById('image-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    pendingImageFile = file;
    pendingImageUrl = '';
    const preview = document.getElementById('image-preview');
    preview.style.backgroundImage = `url('${URL.createObjectURL(file)}')`;
    preview.textContent = '';
  });

  document.getElementById('btn-find-photo').addEventListener('click', (e) => {
    const query = document.getElementById('f-title').value.trim();
    if (!query) return toast('Enter a title first');
    renderImageSearchResults(document.getElementById('image-search-results'), query, e.target, (result) => {
      pendingImageFile = null;
      pendingImageUrl = result.imageUrl;
      document.getElementById('image-file').value = '';
      const preview = document.getElementById('image-preview');
      preview.style.backgroundImage = `url('${result.thumbnailUrl}')`;
      preview.textContent = '';
    });
  });

  const cancel = () => navigate(isEdit ? `#/recipe/${r.id}` : '#/list');
  document.getElementById('btn-cancel').addEventListener('click', cancel);
  document.getElementById('btn-cancel-2').addEventListener('click', cancel);

  document.getElementById('recipe-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      title: document.getElementById('f-title').value.trim(),
      description: document.getElementById('f-description').value.trim(),
      servings: document.getElementById('f-servings').value.trim(),
      prepTime: document.getElementById('f-prep').value.trim(),
      cookTime: document.getElementById('f-cook').value.trim(),
      ingredients: getIngredients(),
      instructions: getInstructions(),
      tags: document.getElementById('f-tags').value.split(',').map((t) => t.trim()).filter(Boolean),
      notes: document.getElementById('f-notes').value.trim(),
      sourceUrl: document.getElementById('f-source').value.trim(),
      favorite: r.favorite || false,
      ...(pendingImageUrl ? { sourceImageUrl: pendingImageUrl } : {}),
    };
    if (!payload.title) return toast('Title is required');

    try {
      const saved = isEdit
        ? await api(`/api/recipes/${r.id}`, { method: 'PUT', body: JSON.stringify(payload) })
        : await api('/api/recipes', { method: 'POST', body: JSON.stringify(payload) });

      if (pendingImageFile) {
        const fd = new FormData();
        fd.append('image', pendingImageFile);
        await api(`/api/recipes/${saved.id}/image`, { method: 'POST', body: fd });
      }
      toast(isEdit ? 'Recipe updated' : 'Recipe saved');
      navigate(`#/recipe/${saved.id}`);
    } catch (err) {
      toast(err.message);
    }
  });
}

/* ------------------------------- Import ----------------------------------- */

let importPrefill = null; // set by handleShareTarget()

function renderImport() {
  const pre = importPrefill || { text: '', url: '' };
  importPrefill = null;

  els.screens.import.innerHTML = `
    <div class="back-row">
      <button class="back-btn" id="btn-cancel">‹ Cancel</button>
      <h2 style="margin:0;font-size:1.05rem;">Import recipe</h2>
      <span></span>
    </div>
    <p class="import-intro">
      Paste a link to a recipe page and we'll read it automatically — or paste recipe
      text copied from a Claude conversation, a website, or shared from another app,
      and we'll do our best to turn it into a recipe you can review and save. You can
      also share text directly into Recipe Box from your phone's share sheet.
    </p>
    <div class="form-group">
      <label for="import-url">Recipe link</label>
      <input type="url" id="import-url" value="${escapeAttr(pre.url || '')}" placeholder="https://example.com/some-recipe" />
    </div>
    <div class="form-group">
      <label for="import-text">…or paste recipe text</label>
      <textarea id="import-text" rows="8" placeholder="Paste ingredients &amp; instructions here…">${escapeHtml(pre.text || '')}</textarea>
    </div>
    <button class="btn btn-primary btn-block" id="btn-parse">Parse recipe →</button>

    <div class="import-divider"><span>or</span></div>
    <div class="form-group">
      <label for="import-pdf">Upload a PDF</label>
      <input type="file" id="import-pdf" accept="application/pdf" />
      <p class="muted" style="margin:6px 0 0;font-size:0.8rem;">
        E.g. a Claude conversation saved or exported as a PDF.
      </p>
    </div>

    <div id="import-review"></div>
  `;

  document.getElementById('btn-cancel').addEventListener('click', () => navigate('#/list'));
  document.getElementById('btn-parse').addEventListener('click', async () => {
    let text = document.getElementById('import-text').value;
    let url = document.getElementById('import-url').value.trim();

    // A bare link pasted into the text box (common when sharing/copying
    // just a URL) counts as the link, not text to heuristically parse.
    if (!url && /^https?:\/\/\S+$/i.test(text.trim())) {
      url = text.trim();
      text = '';
    }

    if (!url && !text.trim()) return toast('Paste a recipe link or some recipe text first');

    const btn = document.getElementById('btn-parse');
    btn.disabled = true;
    btn.textContent = url ? 'Fetching recipe…' : 'Parsing…';
    try {
      const draft = await api('/api/parse', { method: 'POST', body: JSON.stringify({ text, url }) });
      setActiveScreen('form');
      renderForm(draft);
    } catch (err) {
      toast(err.message);
      btn.disabled = false;
      btn.textContent = 'Parse recipe →';
    }
  });

  document.getElementById('import-pdf').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const input = e.target;
    input.disabled = true;
    toast('Reading PDF…');
    try {
      const fd = new FormData();
      fd.append('pdf', file);
      const draft = await api('/api/parse/pdf', { method: 'POST', body: fd });
      setActiveScreen('form');
      renderForm(draft);
    } catch (err) {
      toast(err.message);
      input.disabled = false;
      input.value = '';
    }
  });

  if (pre.text) {
    // Arrived via the OS share target with content already in hand —
    // parse immediately so the user lands on a ready-to-review form.
    document.getElementById('btn-parse').click();
  }
}

/* --------------------------- Share target intake --------------------------- */
// The manifest's share_target points OS shares (e.g. from the Claude app)
// at /share-target?title=&text=&url=. Our server just serves index.html for
// that path, so pick the params up here and route into the import flow.
function handleShareTarget() {
  if (location.pathname !== '/share-target') return false;
  const params = new URLSearchParams(location.search);
  const title = params.get('title') || '';
  const text = params.get('text') || '';
  const url = params.get('url') || '';
  importPrefill = { text: [title, text].filter(Boolean).join('\n'), url };
  history.replaceState(null, '', '/#/import');
  return true;
}

/* --------------------------------- Utils ----------------------------------- */

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function escapeAttr(str) {
  return escapeHtml(str).replace(/`/g, '&#96;');
}

/* --------------------------------- Boot ------------------------------------ */

(async function boot() {
  handleShareTarget();
  await checkSession();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
})();
