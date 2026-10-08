// Generic admin CRUD for every entry in config/resources.js.
const { resources } = require('../config/resources');
const features = require('../config/features');
const repo = require('../data/repositories/resourceRepo');
const service = require('../services/resourceService');
const extras = require('./extras');
const config = require('../config');
const { flash, notFound } = require('../middleware');
const upload = require('../lib/upload');

const defOf = (req) => {
  const def = Object.values(resources).find((d) => d.path === req.params.resource);
  return def && (!def.feature || features[def.feature]) ? def : null;
};
const uploadMw = (req, res, next) => { const def = defOf(req); return def ? upload.forResource(def)(req, res, next) : next(); };

const refOptionsFor = (def, row) => {
  const out = {};
  for (const f of def.fields) if (f.type === 'ref') out[f.name] = repo.refOptions(f.ref, row && row[f.name]);
  return out;
};
const filterOptions = (def) => (def.filters || []).map((fl) => (fl.ref ? { ...fl, options: repo.refOptions(fl.ref).map((o) => [String(o.id), o.label]) } : fl));
const pickFilters = (def, query) => {
  const out = { ...(def.defaultFilters || {}) };
  for (const fl of def.filters || []) if (fl.name in query) out[fl.name] = String(query[fl.name]);
  return out;
};
const addAction = (def) => [{ href: `/admin/${def.path}/new`, label: `New ${def.singular}`, icon: 'plus-lg', cls: 'primary' }];

exports.list = (req, res, next) => {
  const def = defOf(req);
  if (!def) return next('route');
  const page = Math.max(1, Number(req.query.page) || 1);
  const archived = req.query.archived === '1';
  const filters = pickFilters(def, req.query);
  const q = String(req.query.q || '').trim().slice(0, 80);
  const r = repo.list(def, { q, filters, archived, page, perPage: config.perPage });
  res.page('admin/resource/index', {
    pageTitle: def.plural, def, ...r, page, pages: Math.max(1, Math.ceil(r.total / config.perPage)), q, archived, filters,
    filterDefs: filterOptions(def), query: req.query, actions: addAction(def),
  });
};

exports.newForm = (req, res, next) => {
  const def = defOf(req);
  if (!def) return next('route');
  const record = { ...service.defaults(def), ...Object.fromEntries(Object.entries(req.query).filter(([k]) => def.fieldMap[k])) };
  res.page('admin/resource/form', { pageTitle: `New ${def.singular}`, def, record, isNew: true, refs: refOptionsFor(def), back: `/admin/${def.path}` });
};

exports.create = (req, res, next) => {
  const def = defOf(req);
  if (!def) return next('route');
  const id = service.create(def, req.body, req.uploaded);
  flash(req, 'success', `${def.singular} saved.`);
  res.redirect(def.extras ? `/admin/${def.path}/${id}` : `/admin/${def.path}`);
};

exports.show = (req, res, next) => {
  const def = defOf(req);
  if (!def) return next('route');
  const row = repo.get(def, Number(req.params.id));
  if (!row) return notFound(req, res);
  if (!def.extras) return res.redirect(`/admin/${def.path}/${row.id}/edit`);
  res.page('admin/resource/show', {
    pageTitle: row[def.titleKey || def.fields[0].name] || def.singular, def, row, ...extras.load(def, row),
    actions: [{ href: `/admin/${def.path}/${row.id}/edit`, label: 'Edit', icon: 'pencil', cls: 'outline-secondary' }, ...(extras.actions ? extras.actions(def, row) : [])],
  });
};

exports.editForm = (req, res, next) => {
  const def = defOf(req);
  if (!def) return next('route');
  const row = repo.get(def, Number(req.params.id));
  if (!row) return notFound(req, res);
  res.page('admin/resource/form', { pageTitle: `Edit ${def.singular}`, def, record: row, isNew: false, refs: refOptionsFor(def, row), back: def.extras ? `/admin/${def.path}/${row.id}` : `/admin/${def.path}` });
};

exports.update = (req, res, next) => {
  const def = defOf(req);
  if (!def) return next('route');
  const id = Number(req.params.id);
  service.update(def, id, req.body, req.uploaded);
  flash(req, 'success', `${def.singular} updated.`);
  res.redirect(def.extras ? `/admin/${def.path}/${id}` : `/admin/${def.path}`);
};

exports.archive = (req, res, next) => {
  const def = defOf(req);
  if (!def || !def.archivable) return next('route');
  const restore = req.body.restore === '1';
  service.setArchived(def, Number(req.params.id), !restore);
  flash(req, 'success', `${def.singular} ${restore ? 'restored' : 'archived'}.`);
  res.redirect(`/admin/${def.path}`);
};

exports.remove = (req, res, next) => {
  const def = defOf(req);
  if (!def) return next('route');
  service.remove(def, Number(req.params.id));
  flash(req, 'success', `${def.singular} deleted.`);
  res.redirect(`/admin/${def.path}`);
};

exports.uploadMw = uploadMw;
