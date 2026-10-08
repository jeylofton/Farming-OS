// Per-resource business rules applied inside the save transaction (beforeSave / afterSave).
const db = require('../data/adapters');
const slugify = require('../lib/slug');
const { ValidationError } = require('../lib/validate');
const { dayStr, toDateTimeStr } = require('../lib/format');

const hooks = {};

hooks.plantings = {
  beforeSave(data, existing) {
    if (data.sow_date && data.harvest_start && data.harvest_start < data.sow_date) throw new ValidationError('The harvest window cannot start before the sowing date.');
    if (data.harvest_start && data.harvest_end && data.harvest_end < data.harvest_start) throw new ValidationError('The harvest window cannot end before it starts.');
    if (data.sow_date && data.transplant_date && data.transplant_date < data.sow_date) throw new ValidationError('The transplant date cannot be before the sowing date.');
    if (!data.batch_code) {
      const crop = db.prepare('SELECT name FROM crops WHERE id = ?').get(data.crop_id);
      const prefix = (crop ? crop.name : 'BATCH').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'BAT';
      const ym = (data.sow_date || dayStr(0)).slice(2, 4) + (data.sow_date || dayStr(0)).slice(5, 7);
      let n = 1;
      const taken = (c) => db.prepare('SELECT 1 FROM planting_batches WHERE batch_code = ?').get(c);
      while (taken(`${prefix}-${ym}-${String(n).padStart(2, '0')}`)) n += 1;
      data.batch_code = `${prefix}-${ym}-${String(n).padStart(2, '0')}`;
    } else data.batch_code = data.batch_code.toUpperCase().replace(/[^A-Z0-9-]/g, '-');
    if (existing && existing.batch_code !== data.batch_code && db.prepare('SELECT 1 FROM planting_batches WHERE batch_code = ? AND id != ?').get(data.batch_code, existing.id)) {
      throw new ValidationError('That batch ID is already in use.');
    }
  },
};

hooks.courses = {
  beforeSave(data, existing) {
    if (existing) { data.slug = existing.slug; return; }
    const base = slugify(data.title);
    let slug = base;
    let n = 2;
    while (db.prepare('SELECT 1 FROM courses WHERE slug = ?').get(slug)) slug = `${base}-${n++}`;
    data.slug = slug;
  },
};

hooks.classes = {
  beforeSave(data, existing) {
    if (data.ends_at && data.ends_at <= data.starts_at) throw new ValidationError('The class must end after it starts.');
    if (data.deadline && data.deadline > data.starts_at.slice(0, 10)) throw new ValidationError('The registration deadline must be on or before the class date.');
    if (data.price == null) data.price = db.prepare('SELECT default_price p FROM courses WHERE id = ?').get(data.course_id).p;
    if (existing) {
      const taken = db.prepare("SELECT COUNT(*) c FROM enrollments WHERE session_id = ? AND status IN ('registered','completed')").get(existing.id).c;
      if (data.capacity < taken) throw new ValidationError(`Capacity cannot be lower than the ${taken} seats already taken. Cancel a registration first.`);
    }
  },
  afterSave(id) { require('./enrollmentService').promoteWaitlist(id); },
};

hooks.tasks = {
  beforeSave(data, existing) {
    if (!data.done) data.completed_at = null;
    else data.completed_at = existing && existing.done ? existing.completed_at : toDateTimeStr(new Date());
  },
};

hooks.plots = {
  beforeSave(data, existing) {
    const clash = db.prepare('SELECT id FROM plots WHERE name = ? COLLATE NOCASE').get(data.name);
    if (clash && (!existing || clash.id !== existing.id)) throw new ValidationError('A growing space with that name already exists.');
  },
};

module.exports = hooks;
