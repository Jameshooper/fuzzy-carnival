'use strict';
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');

const { DATA_DIR } = require('./db');
const authRoutes = require('./routes/auth');
const recipeRoutes = require('./routes/recipes');
const shareRoutes = require('./routes/share');
const imageSearchRoutes = require('./routes/images');

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

app.disable('x-powered-by');
app.set('trust proxy', true);
app.use(cookieParser());

app.get('/healthz', (req, res) => res.json({ ok: true }));

app.use('/api', authRoutes);
app.use('/api/recipes', recipeRoutes);
app.use('/api/image-search', imageSearchRoutes);
app.use('/', shareRoutes); // exposes /api/parse and /share-target

app.use('/uploads', express.static(path.join(DATA_DIR, 'uploads'), { maxAge: '30d' }));
app.use(
  express.static(PUBLIC_DIR, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('sw.js')) {
        // Never cache the service worker so updates roll out promptly.
        res.setHeader('Cache-Control', 'no-cache');
      }
    },
  })
);

// SPA fallback for client-side routes (#/... hash routing means this is
// really only needed for direct loads of "/").
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'server error' });
});

app.listen(PORT, () => {
  console.log(`[recipe-box] listening on http://0.0.0.0:${PORT}`);
});

// Belt-and-suspenders: every route handler that can throw asynchronously
// should already be wrapped in asyncHandler (see server/asyncHandler.js),
// which routes rejections through the error middleware above instead of
// here. These two handlers are the last line of defense for anything
// that still slips through — logging loudly and staying up beats the
// alternative (Node's default is to crash the whole process on an
// unhandled rejection), since a crash here doesn't just fail one
// request, it silently kills every other request in flight and the
// container restarts with no error visible anywhere but this log.
process.on('unhandledRejection', (reason) => {
  console.error('[recipe-box] unhandled promise rejection (this is a bug — please report it):', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[recipe-box] uncaught exception (this is a bug — please report it):', err);
});
