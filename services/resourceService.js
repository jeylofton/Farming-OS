// Validates and saves any registry resource. Module-specific rules live in resourceHooks.js;
// resources with a serviceKey (e.g. harvests) route create/update/delete through their own service.
const fs = require('fs');
const path = require('path');
const config = require('../config');
const repo = require('../data/repositories/resourceRepo');
const activity = require('../data/repositories/activityRepo');
const hooks = require('./resourceHooks');
const v = require('../lib/validate');
const { today } = require('../lib/format');

const { ValidationError } = v;
const custom = (def) => (def.serviceKey ? require(`./${def.serviceKey}Service`) : null);

function parseField(def, f, body, files, existing) {
  const raw = body[f.name];
  const label = f.label;
  switch (f.type) {
    case 'text': case 'tel': {
      const s = v.clean(raw, 200);
      if (f.required && !s) throw new ValidationError(`${label} is required.`);
      return s;
    }
    case 'email': return v.email(raw, label, f.required);
    case 'textarea': return v.clean(raw, 4000);
    case 'number': return v.num(raw, label, { min: f.min ?? 0, max: f.max ?? 1e9, required: f.required });
    case 'integer': return v.num(raw, label, { min: f.min ?? 0, max: f.max ?? 1e9, required: f.required, integer: true });
    case 'money': return v.num(raw, label, { min: 0, max: 1e8, required: f.required });
    case 'date': return v.date(raw, label, { required: f.required });
    case 'datetime': return v.dateTime(raw, label, { required: f.required });
    case 'checkbox': return [].concat(raw || []).some((x) => x === '1' || x === 'on') ? 1 : 0;
    case 'select': {
      const s = v.clean(raw, 60);
      if (!s) { if (f.required) throw new ValidationError(`${label} is required.`); return null; }
      if (!f.options.some((o) => o[0] === s)) throw new ValidationError(`${label} has an invalid value.`);
      return s;
    }
    case 'ref': {
      const id = v.num(raw, label, { min: 1, required: f.required, integer: true });
      if (id != null && !repo.exists(f.ref.table, id)) throw new ValidationError(`${label} does not exist.`);
      return id;
    }
    case 'image': {
      if (files && files[f.name]) return files[f.name];
      if (body['remove_' + f.name]) return null;
      return existing ? existing[f.name] : null;
    }
    default: throw new Error('Unknown field type ' + f.type);
  }
}

function parse(def, body, { files, existing } = {}) {
  const data = {};
  for (const f of def.fields) {
    if (f.hidden || (existing && f.lockOnEdit)) continue;
    data[f.name] = parseField(def, f, body || {}, files, existing);
    if (data[f.name] === '' && ['select', 'date', 'datetime', 'ref', 'number', 'integer'].includes(f.type)) data[f.name] = null;
  }
  return data;
}

function dropOldImages(def, existing, data) {
  for (const f of def.fields.filter((x) => x.type === 'image')) {
    const old = existing && existing[f.name];
    if (old && old !== data[f.name]) fs.unlink(path.join(config.uploadPath, path.basename(old)), () => {});
  }
}

const labelOf = (def, data) => { const f = def.fields.find((x) => x.type === 'text') || def.fields[0]; return data[f.name] || def.singular; };

function create(def, body, files) {
  const data = parse(def, body, { files });
  const h = hooks[def.key] || {};
  const svc = custom(def);
  return repo.transaction(() => {
    if (h.beforeSave) h.beforeSave(data, null);
    const id = svc ? svc.create(data) : repo.insert(def, data);
    if (h.afterSave) h.afterSave(id, data, null);
    activity.log(`${def.singular} added`, labelOf(def, data), 'admin');
    return id;
  })();
}

function update(def, id, body, files) {
  const existing = repo.get(def, id);
  if (!existing) throw new ValidationError(`${def.singular} not found.`);
  const data = parse(def, body, { files, existing });
  const h = hooks[def.key] || {};
  const svc = custom(def);
  repo.transaction(() => {
    if (h.beforeSave) h.beforeSave(data, existing);
    if (svc && svc.update) svc.update(id, data); else repo.update(def, id, data);
    if (h.afterSave) h.afterSave(id, data, existing);
    activity.log(`${def.singular} updated`, labelOf(def, { ...existing, ...data }), 'admin');
  })();
  dropOldImages(def, existing, data);
}

function remove(def, id) {
  const existing = repo.get(def, id);
  if (!existing) return;
  const svc = custom(def);
  repo.transaction(() => {
    if (svc && svc.remove) svc.remove(id); else repo.remove(def, id);
    activity.log(`${def.singular} deleted`, labelOf(def, existing), 'admin');
  })();
  dropOldImages(def, existing, {});
}

function setArchived(def, id, flag) {
  repo.setArchived(def, id, flag);
  const row = repo.get(def, id);
  activity.log(`${def.singular} ${flag ? 'archived' : 'restored'}`, row ? labelOf(def, row) : '', 'admin');
}

// Default values for blank forms ("today" is resolved at render time).
const defaults = (def) => Object.fromEntries(def.fields.filter((f) => f.default !== undefined).map((f) => [f.name, f.default === 'today' ? today() : f.default]));

module.exports = { create, update, remove, setArchived, defaults, parse };
