const dashboardRepo = require('../data/repositories/dashboardRepo');
const calendarRepo = require('../data/repositories/calendarRepo');
const reportsRepo = require('../data/repositories/reportsRepo');
const activity = require('../data/repositories/activityRepo');
const settingsRepo = require('../data/repositories/settingsRepo');
const contentRepo = require('../data/repositories/contentRepo');
const resourceRepo = require('../data/repositories/resourceRepo');
const { resources } = require('../config/resources');
const db = require('../data/adapters');
const v = require('../lib/validate');
const { toDateStr, dayStr } = require('../lib/format');
const { flash } = require('../middleware');
const config = require('../config');

exports.dashboard = (req, res) => {
  res.page('admin/dashboard', { pageTitle: 'Overview', s: dashboardRepo.stats(), alerts: dashboardRepo.alerts(), tasks: dashboardRepo.upcomingTasks(), sessions: dashboardRepo.upcomingSessions(), recent: activity.recent(8) });
};

exports.calendar = (req, res) => {
  const m = /^(\d{4})-(\d{2})$/.exec(String(req.query.m || ''));
  const base = m && Number(m[2]) >= 1 && Number(m[2]) <= 12 ? new Date(Number(m[1]), Number(m[2]) - 1, 1) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const first = new Date(base);
  first.setDate(1 - first.getDay()); // week starts Sunday
  const last = new Date(base.getFullYear(), base.getMonth() + 1, 0);
  last.setDate(last.getDate() + (6 - last.getDay()));
  const events = calendarRepo.events(toDateStr(first), toDateStr(last));
  const byDay = {};
  for (const e of events) (byDay[e.date] = byDay[e.date] || []).push(e);
  const weeks = [];
  for (let d = new Date(first); d <= last; ) {
    const week = [];
    for (let i = 0; i < 7; i += 1, d.setDate(d.getDate() + 1)) {
      const key = toDateStr(d);
      week.push({ key, day: d.getDate(), inMonth: d.getMonth() === base.getMonth(), isToday: key === dayStr(0), events: byDay[key] || [] });
    }
    weeks.push(week);
  }
  const ym = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
  const title = base.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const agenda = weeks.flat().filter((d) => d.inMonth && d.events.length);
  res.page('admin/calendar', { pageTitle: 'Farm Calendar', weeks, title, agenda, prev: ym(new Date(base.getFullYear(), base.getMonth() - 1, 1)), next: ym(new Date(base.getFullYear(), base.getMonth() + 1, 1)), thisMonth: ym(new Date()) });
};

exports.reports = (req, res) => {
  const months = reportsRepo.monthly(6);
  const max = Math.max(1, ...months.map((x) => Math.max(x.produce + x.classes, x.expenses)));
  res.page('admin/reports', { pageTitle: 'Expenses & Finances', months, max, yields: reportsRepo.yieldByBatch(), byCrop: reportsRepo.revenueByCrop(), byCategory: reportsRepo.expensesByCategory(), fill: reportsRepo.classFill() });
};

exports.settings = (req, res) => res.page('admin/settings', { pageTitle: 'Settings', values: res.locals.old || settingsRepo.all() });
exports.settingsSave = (req, res) => {
  const b = req.body;
  const data = {
    farm_name: v.required(b.farm_name, 'Farm name', 80), tagline: v.clean(b.tagline, 160), address: v.clean(b.address, 200), phone: v.clean(b.phone, 40),
    email: v.email(b.email, 'Email'), hours_text: v.clean(b.hours_text, 400), growing_zone: v.clean(b.growing_zone, 20),
    tax_rate: String(v.num(b.tax_rate === '' ? 0 : b.tax_rate, 'Tax rate', { min: 0, max: 100 })),
    brand_color: /^#[0-9a-fA-F]{6}$/.test(b.brand_color || '') ? b.brand_color : (() => { throw new v.ValidationError('Brand color must look like #2f7d32.'); })(),
  };
  settingsRepo.setMany(data);
  flash(req, 'success', 'Settings saved.');
  res.redirect('/admin/settings');
};

exports.content = (req, res) => res.page('admin/content', { pageTitle: 'Website Content', values: res.locals.old || contentRepo.all() });
exports.contentSave = (req, res) => {
  const data = {};
  for (const k of Object.keys(contentRepo.DEFAULTS)) data[k] = v.clean(req.body[k], k === 'faq_text' ? 4000 : 2000);
  contentRepo.setMany(data);
  flash(req, 'success', 'Website content saved.');
  res.redirect('/admin/content');
};

exports.inquiries = (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const status = ['new', 'handled'].includes(req.query.status) ? req.query.status : '';
  const where = status ? 'WHERE status = ?' : '';
  const p = status ? [status] : [];
  const total = db.prepare(`SELECT COUNT(*) c FROM inquiries ${where}`).get(...p).c;
  const rows = db.prepare(`SELECT * FROM inquiries ${where} ORDER BY status = 'handled', id DESC LIMIT ? OFFSET ?`).all(...p, config.perPage, (page - 1) * config.perPage);
  res.page('admin/inquiries', { pageTitle: 'Website Inquiries', rows, total, page, pages: Math.max(1, Math.ceil(total / config.perPage)), status, query: req.query });
};
exports.inquiryStatus = (req, res) => {
  db.prepare('UPDATE inquiries SET status = ? WHERE id = ?').run(req.body.status === 'new' ? 'new' : 'handled', Number(req.params.id));
  res.redirect('/admin/inquiries');
};
exports.inquiryDelete = (req, res) => { db.prepare('DELETE FROM inquiries WHERE id = ?').run(Number(req.params.id)); flash(req, 'success', 'Inquiry deleted.'); res.redirect('/admin/inquiries'); };

// Quick complete / reopen from the task list.
exports.taskToggle = (req, res) => {
  const def = resources.tasks;
  const t = resourceRepo.get(def, Number(req.params.id));
  if (t) resourceRepo.update(def, t.id, { done: t.done ? 0 : 1, completed_at: t.done ? null : require('../lib/format').toDateTimeStr(new Date()) });
  res.redirect(String(req.body.back || '').startsWith('/admin') ? req.body.back : '/admin/tasks');
};
