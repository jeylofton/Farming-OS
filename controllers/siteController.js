const db = require('../data/adapters');
const contentRepo = require('../data/repositories/contentRepo');
const inventoryRepo = require('../data/repositories/inventoryRepo');
const enrollments = require('../data/repositories/enrollmentsRepo');
const enrollmentService = require('../services/enrollmentService');
const v = require('../lib/validate');
const features = require('../config/features');
const { notFound, flash } = require('../middleware');
const stripeService = require('../services/stripeService');
const orderService = require('../services/orderService');
const ordersRepo = require('../data/repositories/ordersRepo');
const paymentService = require('../services/paymentService');

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

exports.register = async (req, res) => {
  const course = enrollments.courseBySlug(req.params.slug);
  if (!course) return notFound(req, res);
  const sessionId = Number(req.body.session_id);
  if (!course.sessions.some((s) => s.id === sessionId)) throw new v.ValidationError('Please choose one of the sessions listed for this class.');
  const r = enrollmentService.register({ session_id: sessionId, name: req.body.name, email: req.body.email, phone: req.body.phone, notes: req.body.notes, source: 'public' });
  const owes = db.prepare('SELECT amount FROM enrollments WHERE id = ?').get(r.id).amount > 0;
  // A paid seat is held for a short time while the student pays at Stripe. If Stripe cannot be reached, release the seat.
  if (r.status === 'registered' && owes && features.onlinePayments && stripeService.enabled()) {
    try { return res.redirect(await stripeService.createCheckout('enrollment', r.id, req)); } catch (e) {
      console.error('Could not start checkout:', e.message);
      enrollmentService.cancel(r.id);
      throw new v.ValidationError('Online payment is unavailable right now, so your seat was not reserved. Please try again shortly or contact the farm.');
    }
  }
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

// ---- Public produce ordering (requires online payment) ----
const lotsForSale = () => inventoryRepo.orderable().filter((l) => l.listed);

exports.orderForm = (req, res) => site(res, 'order', { pageTitle: 'Order Produce', lots: lotsForSale(), old: res.locals.old || {}, taxRate: Number(require('../data/repositories/settingsRepo').get('tax_rate')) || 0 });

exports.orderCreate = async (req, res) => {
  const lots = lotsForSale();
  const item_lot = [];
  const item_qty = [];
  for (const l of lots) {
    const q = req.body['qty_' + l.id];
    if (q === undefined || q === '' || Number(q) === 0) continue;
    item_lot.push(String(l.id));
    item_qty.push(String(q));
  }
  const name = v.required(req.body.name, 'Your name', 100);
  const email = v.email(req.body.email, 'Email', true);
  const existing = db.prepare('SELECT id FROM customers WHERE email = ? COLLATE NOCASE AND archived = 0').get(email);
  const orderId = orderService.create({
    customer_id: existing ? existing.id : '', new_name: name, new_email: email, new_phone: req.body.phone,
    fulfillment: 'pickup', requested_date: req.body.requested_date, notes: req.body.notes, item_lot, item_qty, item_price: [],
  });
  try { return res.redirect(await stripeService.createCheckout('order', orderId, req)); } catch (e) {
    console.error('Could not start checkout:', e.message);
    orderService.setStatus(orderId, 'cancelled'); // stock goes straight back
    throw new v.ValidationError('Online payment is unavailable right now, so nothing was reserved. Please try again shortly or contact the farm.');
  }
};

exports.orderConfirmation = (req, res) => {
  const o = db.prepare('SELECT id FROM produce_orders WHERE order_number = ?').get(String(req.params.number));
  if (!o || !stripeService.tokenOk('order', o.id, req.params.token)) return notFound(req, res);
  site(res, 'order-confirmation', { pageTitle: 'Order received', o: ordersRepo.get(o.id) });
};
void paymentService;
