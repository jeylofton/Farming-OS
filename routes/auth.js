const express = require('express');
const authService = require('../services/authService');
const router = express.Router();

// Only same-site relative redirects, never an absolute host.
const safeNext = (p) => (typeof p === 'string' && p.startsWith('/') && !p.startsWith('//') ? p : '/admin');

router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/admin');
  res.render('auth/login', { pageTitle: 'Sign in', error: null });
});
router.post('/login', (req, res) => {
  const user = authService.authenticate(String(req.body.username || ''), String(req.body.password || ''));
  if (!user) return res.status(401).render('auth/login', { pageTitle: 'Sign in', error: 'Incorrect username or password.' });
  const next = safeNext(req.session.returnTo);
  req.session.regenerate(() => { req.session.user = user; res.redirect(next); });
});
router.post('/logout', (req, res) => req.session.destroy(() => res.redirect('/login')));

module.exports = router;
