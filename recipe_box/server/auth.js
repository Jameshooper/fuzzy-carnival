'use strict';
const crypto = require('crypto');

const SESSION_SECRET =
  process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const APP_PASSWORD = process.env.RECIPE_APP_PASSWORD || '';
const COOKIE_NAME = 'recipebox_session';
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

if (!process.env.SESSION_SECRET) {
  console.warn(
    '[recipe-box] SESSION_SECRET not set — using a random secret generated at ' +
      'startup. Sessions will not survive a restart. Set SESSION_SECRET in ' +
      'your environment to avoid this.'
  );
}
if (!APP_PASSWORD) {
  console.warn(
    '[recipe-box] RECIPE_APP_PASSWORD is not set — the app is UNPROTECTED. ' +
      'Set RECIPE_APP_PASSWORD before exposing this app beyond localhost.'
  );
}

function sign(value) {
  const hmac = crypto.createHmac('sha256', SESSION_SECRET).update(value).digest('hex');
  return `${value}.${hmac}`;
}

function verify(token) {
  if (!token || typeof token !== 'string') return false;
  const idx = token.lastIndexOf('.');
  if (idx === -1) return false;
  const value = token.slice(0, idx);
  const expected = sign(value);
  if (expected.length !== token.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(token))) return false;
  const expiry = Number(value);
  if (!Number.isFinite(expiry) || Date.now() > expiry) return false;
  return true;
}

function issueCookie(req, res) {
  const expiry = String(Date.now() + MAX_AGE_MS);
  const token = sign(expiry);
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    // req.secure respects X-Forwarded-Proto because index.js sets `trust
    // proxy` — true when the request is HTTPS directly, or reached
    // through a reverse proxy (Tailscale Serve, Caddy, nginx, Traefik...)
    // that terminates TLS in front of the app. False on plain LAN HTTP,
    // so login still works there — a Secure cookie would otherwise never
    // be sent back by the browser at all.
    secure: req.secure,
    maxAge: MAX_AGE_MS,
    path: '/',
  });
}

function clearCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

function isAuthed(req) {
  if (!APP_PASSWORD) return true; // no password configured -> open access
  const token = req.cookies ? req.cookies[COOKIE_NAME] : null;
  return verify(token);
}

function checkPassword(candidate) {
  if (!APP_PASSWORD) return true;
  if (typeof candidate !== 'string') return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(APP_PASSWORD);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function requireAuth(req, res, next) {
  if (isAuthed(req)) return next();
  res.status(401).json({ error: 'authentication required' });
}

module.exports = {
  COOKIE_NAME,
  issueCookie,
  clearCookie,
  isAuthed,
  checkPassword,
  requireAuth,
  passwordConfigured: () => Boolean(APP_PASSWORD),
};
