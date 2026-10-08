const db = require('../data/adapters');
const contentRepo = require('../data/repositories/contentRepo');
const inventoryRepo = require('../data/repositories/inventoryRepo');
const enrollments = require('../data/repositories/enrollmentsRepo');
const enrollmentService = require('../services/enrollmentService');
const v = require('../lib/validate');
const features = require('../config/features');
const { notFound, flash } = require('../middleware');

const site = (res, view, data = {}) => res.page(`website/${view}`, { content: contentRepo.all(), ...data }, 'site');

exports.home = (req, res) => {
  const classes = features.classes ? enrollments.publicCatalog().flatMap((c) => c.sessions.map((s) => ({ ...s, title: c.title, slug: c.slug }))).sort((a, b) => a.starts_at.localeCompare(b.starts_at)).slice(0, 3) : [];
  const produce = inventoryRepo.summaryByCrop().filter((p) => p.available > 0).slice(0, 4);
  const updates = db.prepare('SELECT * FROM farm_updates WHERE published = 1 ORDER BY posted_on DESC, id DESC LIMIT 3').all();
  site(res, 'home', { pageTitle: '', classes, produce, updates });
};
exports.about = (req, res) => site(res, 'about', { pageTitle: 'About the Farm' });
exports.produce = (req, res) => site(res, 'produce', { pageTitle: 'Our Produce', items: inventoryRepo.summaryByCrop() });
exports.classes = (req, res) => site(res, 'classes', { pageTitle: 'Classes & Workshops', courses: enrollments.publicCatalog() });
exports.classDetail = (req, res) => {
  const course = enrollments.courseBySlug(req.params.slug);
  if (!course) return notFound(req, res);
  site(res, 'class-detail', { pageTitle: course.title, course, old: res.locals.old || {} });
};
exports.updates = (req, res) => site(res, 'updates', { pageTitle: 'Farm Updates', updates: db.prepare('SELECT * FROM farm_updates WHERE published = 1 ORDER BY posted_on DESC, id DESC LIMIT 30').all() });
exports.contact = (req, res) => {
  const faqs = String(contentRepo.get('faq_text')).split('\n').map((l) => l.split('|')).filter((p) => p[0] && p[1]);
  site(res, 'contact', { pageTitle: 'Contact & Visit', faqs, old: res.locals.old || {} });
};

exports.register = (req, res) => {
  const course = enrollments.courseBySlug(req.params.slug);
  if (!course) return notFound(req, res);
  const sessionId = Number(req.body.session_id);
  if (!course.sessions.some((s) => s.id === sessionId)) throw new v.ValidationError('Please choose one of the sessions listed for this class.');
  const r = enrollmentService.register({ session_id: sessionId, name: req.body.name, email: req.body.email, phone: req.body.phone, notes: req.body.notes, source: 'public' });
  res.redirect(`/classes/confirmation/${r.reg_number}`);
};

exports.confirmation = (req, res) => {
  const e = enrollments.byReg(String(req.params.reg));
  if (!e) return notFound(req, res);
  site(res, 'confirmation', { pageTitle: 'Registration received', e });
};

exports.inquire = (req, res) => {
  const name = v.required(req.body.name, 'Your name', 100);
  const email = v.email(req.body.email, 'Email');
  const phone = v.clean(req.body.phone, 40);
  if (!email && !phone) throw new v.ValidationError('Please give an email address or phone number so we can reply.');
  if (req.body.website) return res.redirect('/contact'); // honeypot field: bots fill it, people never see it
  db.prepare('INSERT INTO inquiries (name, email, phone, message) VALUES (?,?,?,?)').run(name, email, phone, v.required(req.body.message, 'Message', 2000));
  flash(req, 'success', 'Thanks! Your message was received. (Demo: no email is sent.)');
  res.redirect('/contact');
};
