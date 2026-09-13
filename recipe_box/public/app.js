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

// Scales the leading quantity in an ingredient line (including a simple
// range like "3-4 cloves"); text with no leading quantity ("Salt to
// taste") is returned unchanged.
function scaleIngredientText(text, multiplier) {
  if (multiplier === 1) return text;
  const first = matchLeadingNumber(text);
  if (!first) return text;

  const rest = text.slice(first.length);
  const rangeSep = rest.match(/^\s*(-|–|to)\s*/);
  if (rangeSep) {
    const afterSep = rest.slice(rangeSep[0].length);
    const second = matchLeadingNumber(afterSep);
    if (second) {
      const tail = afterSep.slice(second.length);
      return `${formatScaledNumber(first.value * multiplier)}-${formatScaledNumber(second.value * multiplier)}${tail}`;
    }
  }
  return `${formatScaledNumber(first.value * multiplier)}${rest}`;
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
    <div class="detail-hero ${r.imagePath ? '' : 'no-image'}" style="${r.imagePath ? `background-image:url('${escapeAttr(r.imagePath)}')` : ''}">${r.imagePath ? '' : '🍽️'}</div>
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

      <div class="section-title-row">
        <h3 class="section-title">Ingredients</h3>
        <button class="btn btn-ghost btn-small" id="btn-check-stores">🛒 Check store prices</button>
      </div>
      <p id="store-note" class="store-note" hidden></p>
      <ul class="ingredient-list">
        ${r.ingredients.map((ing, i) => `<li data-ingredient="${escapeAttr(ing)}"><input type="checkbox" id="ing-${i}" /><label for="ing-${i}" id="ing-label-${i}">${escapeHtml(ing)}</label><span class="store-badges" id="store-badges-${i}"></span></li>`).join('')}
      </ul>` : ''}

    ${r.instructions.length ? `
      <h3 class="section-title">Instructions</h3>
      <ol class="instruction-list">
        ${r.instructions.map((step) => `<li>${escapeHtml(step)}</li>`).join('')}
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
  document.getElementById('btn-share').addEventListener('click', () => shareRecipe(r, scale));

  const checkBtn = document.getElementById('btn-check-stores');
  if (checkBtn) checkBtn.addEventListener('click', () => checkStorePrices(r, checkBtn));

  function applyScale(newScale) {
    scale = newScale;
    r.ingredients.forEach((ing, i) => {
      const label = document.getElementById(`ing-label-${i}`);
      if (label) label.textContent = scaleIngredientText(ing, scale);
    });
    const servingsEl = document.getElementById('meta-servings');
    if (servingsEl) servingsEl.textContent = scaleServingsText(r.servings, scale);
  }

  const scaleChips = [...document.querySelectorAll('.scale-chip')];
  const scaleCustomInput = document.getElementById('scale-custom');
  scaleChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      scaleChips.forEach((c) => c.classList.toggle('active', c === chip));
      if (scaleCustomInput) scaleCustomInput.value = '';
      applyScale(Number(chip.dataset.scale));
    });
  });
  if (scaleCustomInput) {
    scaleCustomInput.addEventListener('input', () => {
      const val = Number(scaleCustomInput.value);
      if (!val || val <= 0) return;
      scaleChips.forEach((c) => c.classList.remove('active'));
      applyScale(val);
    });
  }
}

async function checkStorePrices(r, btn) {
  btn.disabled = true;
  btn.textContent = 'Checking…';
  try {
    const results = await api('/api/stores/check', {
      method: 'POST',
      body: JSON.stringify({ ingredients: r.ingredients }),
    });

    const byIngredient = new Map();
    for (const item of results) {
      if (!byIngredient.has(item.ingredient)) byIngredient.set(item.ingredient, []);
      byIngredient.get(item.ingredient).push(item);
    }

    r.ingredients.forEach((ing, i) => {
      const el = document.getElementById(`store-badges-${i}`);
      if (!el) return;
      const items = byIngredient.get(ing) || [];
      el.innerHTML = items
        .map((it) => {
          const label = it.found
            ? `${escapeHtml(it.storeName)}${it.price != null ? ` · ${it.price.toFixed(2)} €` : ''}`
            : `${escapeHtml(it.storeName)} 🔍`;
          const href = it.found && it.url ? it.url : it.searchUrl;
          return `<a class="store-pill${it.found ? ' found' : ''}" href="${escapeAttr(href)}" target="_blank" rel="noopener">${label}</a>`;
        })
        .join('');
    });

    const note = document.getElementById('store-note');
    note.textContent =
      'Prices shown are best-effort where available (currently Prisma only) and may be out of date or missing — tap a store name to search for it yourself. Citymarket currently offers a search link only.';
    note.hidden = false;

    btn.textContent = '🛒 Recheck prices';
  } catch (err) {
    toast(err.message);
    btn.textContent = '🛒 Check store prices';
  } finally {
    btn.disabled = false;
  }
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

function recipeToShareText(r, scale = 1) {
  const lines = [r.title, ''];
  const servings = scale !== 1 ? scaleServingsText(r.servings, scale) : r.servings;
  const meta = [servings ? `Serves: ${servings}` : '', r.prepTime ? `Prep time: ${r.prepTime}` : '', r.cookTime ? `Cook time: ${r.cookTime}` : ''].filter(Boolean);
  if (scale !== 1) meta.push(`scaled ×${formatScaledNumber(scale)}`);
  if (meta.length) lines.push(meta.join(' | '), '');
  if (r.ingredients.length) {
    lines.push('Ingredients:');
    r.ingredients.forEach((i) => lines.push(`- ${scale !== 1 ? scaleIngredientText(i, scale) : i}`));
    lines.push('');
  }
  if (r.instructions.length) {
    lines.push('Instructions:');
    r.instructions.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
    lines.push('');
  }
  if (r.notes) lines.push('Notes:', r.notes, '');
  if (r.sourceUrl) lines.push(r.sourceUrl);
  return lines.join('\n').trim();
}

async function shareRecipe(r, scale = 1) {
  const text = recipeToShareText(r, scale);
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
