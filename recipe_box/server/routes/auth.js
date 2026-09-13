'use strict';
const express = require('express');
const auth = require('../auth');

const router = express.Router();

router.get('/session', (req, res) => {
  res.json({
    authenticated: auth.isAuthed(req),
    passwordRequired: auth.passwordConfigured(),
  });
});

router.post('/login', express.json(), (req, res) => {
  const { password } = req.body || {};
  if (!auth.checkPassword(password || '')) {
    return res.status(401).json({ error: 'incorrect password' });
  }
  auth.issueCookie(req, res);
  res.json({ authenticated: true });
});

router.post('/logout', (req, res) => {
  auth.clearCookie(res);
  res.json({ authenticated: false });
});

module.exports = router;
