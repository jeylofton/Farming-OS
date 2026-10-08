const settings = require('../data/repositories/settingsRepo');
const features = require('../config/features');
const format = require('../lib/format');
const { ValidationError } = require('../lib/validate');
const { escapeXML } = require('ejs');
const fs = require('fs');
const path = require('path');
const config = require('../config');

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const flash = (req, type, text) => { req.session.flash = { type, text }; };

function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  req.session.returnTo = req.originalUrl;
  res.redirect('/login');
}

// Cheap CSRF defense for Stage 1: browsers send Origin on cross-site POSTs; reject any that is not this host.
function sameOrigin(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD') return next();
  const origin = req.get('origin');
  if (origin) {
    let host = '';
    try { host = new URL(origin).host; } catch (e) { /* invalid origin */ }
    if (host !== req.get('host')) return res.status(403).send('Cross-site request blocked.');
  }
  next();
}

const requireFeature = (name) => (req, res, next) => (features[name] ? next() : notFound(req, res));

function notFound(req, res) {
  res.status(404).page('error', { pageTitle: 'Not found', message: 'That page does not exist.' }, 'site');
}

// One admin layout and one public layout: pages render to a string, then are wrapped (views/layouts/*).
function pageHelper(req, res, next) {
  res.page = (view, data = {}, layout = 'admin') => {
    req.app.render(view, { ...res.locals, ...data }, (err, body) => {
      if (err) return next(err);
      res.render(`layouts/${layout}`, { ...data, body });
    });
  };
  next();
}

function locals(req, res, next) {
  const sess = req.session || {};
  res.locals.business = settings.all();
  res.locals.features = features;
  res.locals.f = format;
  res.locals.chip = format.chip;
  // Status chip HTML: label comes from a fixed map or is escaped; the color class is never user input.
  res.locals.badge = (kind, value) => { const c = format.chip(kind, value); return `<span class="badge text-bg-${c.cls} status-badge">${escapeXML(c.label)}</span>`; };
  res.locals.upload = (name) => (name ? '/uploads/' + encodeURIComponent(path.basename(name)) : '');
  res.locals.user = sess.user;
  res.locals.currentUrl = req.originalUrl;
  res.locals.path = req.path.replace(/^\/admin/, '') || '/';
  res.locals.flash = sess.flash;
  res.locals.pageTitle = '';
  res.locals.actions = [];
  res.locals.scripts = [];
  // Re-show what the user typed after a validation error on the page they were redirected back to.
  res.locals.old = sess.old && sess.old.path === req.path ? sess.old.body : null;
  if (sess.flash) delete sess.flash;
  if (sess.old && req.method === 'GET') delete sess.old;
  next();
}

function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  for (const name of Object.values(req.uploaded || {})) fs.unlink(path.join(config.uploadPath, path.basename(name)), () => {});
  if (err instanceof ValidationError || err.code === 'LIMIT_FILE_SIZE') {
    const msg = err.code === 'LIMIT_FILE_SIZE' ? 'That photo is too large (3 MB maximum).' : err.message;
    if (req.xhr || (req.get('accept') || '').includes('json')) return res.status(400).json({ error: msg });
    flash(req, 'danger', msg);
    let back = '/admin';
    try { back = new URL(req.get('referer') || '', 'http://x').pathname || '/admin'; } catch (e) { /* keep default */ }
    req.session.old = { path: back, body: req.body };
    return res.redirect(back);
  }
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(500).page('error', { pageTitle: 'Something went wrong', message: 'Please try again. If it keeps happening, contact the farm.' }, 'site');
}

module.exports = { sameOrigin, wrap, flash, requireAuth, requireFeature, pageHelper, locals, notFound, errorHandler };
