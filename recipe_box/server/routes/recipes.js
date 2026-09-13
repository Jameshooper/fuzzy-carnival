'use strict';
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const { db, DATA_DIR } = require('../db');
const { requireAuth } = require('../auth');
const { asyncHandler } = require('../asyncHandler');

const router = express.Router();
router.use(requireAuth);
router.use(express.json({ limit: '2mb' }));

const upload = multer({
  storage: multer.diskStorage({
    destination: path.join(DATA_DIR, 'uploads'),
    filename: (req, file, cb) => {
      const ext = (path.extname(file.originalname) || '.jpg').toLowerCase().slice(0, 5);
      cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
    },
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(new Error('only image uploads are allowed'));
  },
});

// Best-effort fetch of an external image (e.g. a recipe page's og:image,
// surfaced by the link-import flow) into local storage. Never throws —
// a failed download just means the recipe saves without a photo.
async function downloadImageToUploads(url) {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(parsed.toString(), { signal: controller.signal, redirect: 'follow' });
      if (!res.ok) return '';
      const ct = res.headers.get('content-type') || '';
      if (!/^image\//.test(ct)) return '';
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 8 * 1024 * 1024) return '';
      const ext = (ct.split('/')[1] || 'jpg').split(';')[0].replace(/[^a-z0-9]/gi, '').slice(0, 5) || 'jpg';
      const filename = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
      fs.writeFileSync(path.join(DATA_DIR, 'uploads', filename), buf);
      return `/uploads/${filename}`;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return '';
  }
}

function toJson(value) {
  try {
    return JSON.stringify(Array.isArray(value) ? value : []);
  } catch {
    return '[]';
  }
}

function fromJson(value) {
  try {
    return JSON.parse(value || '[]');
  } catch {
    return [];
  }
}

function serializeRow(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    ingredients: fromJson(row.ingredients),
    instructions: fromJson(row.instructions),
    servings: row.servings,
    prepTime: row.prep_time,
    cookTime: row.cook_time,
    tags: fromJson(row.tags),
    sourceUrl: row.source_url,
    imagePath: row.image_path,
    notes: row.notes,
    favorite: Boolean(row.favorite),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function summarize(row) {
  const full = serializeRow(row);
  return {
    id: full.id,
    title: full.title,
    tags: full.tags,
    servings: full.servings,
    prepTime: full.prepTime,
    cookTime: full.cookTime,
    imagePath: full.imagePath,
    favorite: full.favorite,
    updatedAt: full.updatedAt,
  };
}

// GET /api/recipes?q=&tag=&favorite=1
router.get('/', (req, res) => {
  const { q, tag, favorite } = req.query;
  let sql = 'SELECT * FROM recipes WHERE 1=1';
  const params = [];

  if (q) {
    sql += ' AND (title LIKE ? OR ingredients LIKE ? OR tags LIKE ?)';
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  if (favorite === '1') {
    sql += ' AND favorite = 1';
  }
  sql += ' ORDER BY datetime(updated_at) DESC';

  let rows = db.prepare(sql).all(...params);
  if (tag) {
    rows = rows.filter((r) => fromJson(r.tags).includes(tag));
  }
  res.json(rows.map(summarize));
});

router.get('/tags', (req, res) => {
  const rows = db.prepare('SELECT tags FROM recipes').all();
  const set = new Set();
  for (const r of rows) fromJson(r.tags).forEach((t) => set.add(t));
  res.json([...set].sort((a, b) => a.localeCompare(b)));
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM recipes WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not found' });
  res.json(serializeRow(row));
});

function validate(body) {
  const title = (body.title || '').trim();
  if (!title) return 'title is required';
  return null;
}

router.post('/', asyncHandler(async (req, res) => {
  const body = req.body || {};
  const err = validate(body);
  if (err) return res.status(400).json({ error: err });

  // When a recipe is created from an imported link, the draft carries an
  // external image URL (e.g. the page's og:image) rather than an
  // uploaded file. Fetch it in now, best-effort, so the recipe already
  // has a photo. A manually-uploaded file (via POST /:id/image, after
  // creation) always takes priority over this.
  let imagePath = body.imagePath || '';
  if (!imagePath && body.sourceImageUrl) {
    imagePath = await downloadImageToUploads(body.sourceImageUrl);
  }

  const now = new Date().toISOString();
  const info = db
    .prepare(
      `INSERT INTO recipes
        (title, description, ingredients, instructions, servings, prep_time, cook_time, tags, source_url, image_path, notes, favorite, created_at, updated_at)
       VALUES (@title, @description, @ingredients, @instructions, @servings, @prep_time, @cook_time, @tags, @source_url, @image_path, @notes, @favorite, @created_at, @updated_at)`
    )
    .run({
      title: body.title.trim(),
      description: body.description || '',
      ingredients: toJson(body.ingredients),
      instructions: toJson(body.instructions),
      servings: body.servings || '',
      prep_time: body.prepTime || '',
      cook_time: body.cookTime || '',
      tags: toJson(body.tags),
      source_url: body.sourceUrl || '',
      image_path: imagePath,
      notes: body.notes || '',
      favorite: body.favorite ? 1 : 0,
      created_at: now,
      updated_at: now,
    });

  const row = db.prepare('SELECT * FROM recipes WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(serializeRow(row));
}));

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM recipes WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });

  const body = req.body || {};
  const err = validate(body);
  if (err) return res.status(400).json({ error: err });

  db.prepare(
    `UPDATE recipes SET
      title = @title, description = @description, ingredients = @ingredients,
      instructions = @instructions, servings = @servings, prep_time = @prep_time,
      cook_time = @cook_time, tags = @tags, source_url = @source_url,
      image_path = @image_path, notes = @notes, favorite = @favorite, updated_at = @updated_at
     WHERE id = @id`
  ).run({
    id: req.params.id,
    title: body.title.trim(),
    description: body.description || '',
    ingredients: toJson(body.ingredients),
    instructions: toJson(body.instructions),
    servings: body.servings || '',
    prep_time: body.prepTime || '',
    cook_time: body.cookTime || '',
    tags: toJson(body.tags),
    source_url: body.sourceUrl || '',
    image_path: body.imagePath != null ? body.imagePath : existing.image_path,
    notes: body.notes || '',
    favorite: body.favorite ? 1 : 0,
    updated_at: new Date().toISOString(),
  });

  const row = db.prepare('SELECT * FROM recipes WHERE id = ?').get(req.params.id);
  res.json(serializeRow(row));
});

router.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM recipes WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'not found' });
  res.status(204).end();
});

router.post('/:id/image', upload.single('image'), (req, res) => {
  const existing = db.prepare('SELECT * FROM recipes WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  if (!req.file) return res.status(400).json({ error: 'no image uploaded' });

  const imagePath = `/uploads/${req.file.filename}`;
  db.prepare('UPDATE recipes SET image_path = ?, updated_at = ? WHERE id = ?').run(
    imagePath,
    new Date().toISOString(),
    req.params.id
  );
  res.json({ imagePath });
});

// POST /:id/image-from-url — attaches a chosen result from the "Find a
// photo online" search to an existing recipe, downloading it server-side
// the same way an imported link's og:image is attached on create.
router.post('/:id/image-from-url', asyncHandler(async (req, res) => {
  const existing = db.prepare('SELECT * FROM recipes WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'not found' });
  const url = (req.body?.url || '').trim();
  if (!url) return res.status(400).json({ error: 'missing url' });

  const imagePath = await downloadImageToUploads(url);
  if (!imagePath) {
    return res.status(502).json({ error: "Couldn't download that image — try a different result." });
  }
  db.prepare('UPDATE recipes SET image_path = ?, updated_at = ? WHERE id = ?').run(
    imagePath,
    new Date().toISOString(),
    req.params.id
  );
  res.json({ imagePath });
}));

module.exports = router;
