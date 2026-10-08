// Public payment endpoints: Stripe webhook, return pages after Checkout, and "try payment again".
const db = require('../data/adapters');
const stripeService = require('../services/stripeService');
const { notFound } = require('../middleware');
const { ValidationError } = require('../lib/validate');
const demo = require('../services/demoPayments');

const KINDS = ['order', 'enrollment'];
const site = (res, view, data) => res.page(`website/${view}`, data, 'site');

// Stripe -> us. Body is the RAW buffer so the signature can be checked. Unsigned/forged calls are rejected.
exports.webhook = (req, res) => {
  let event;
  try { event = stripeService.verifyWebhook(req.body, req.get('stripe-signature')); } catch (e) { return res.status(400).send('Invalid signature'); }
  try { stripeService.handleEvent(event); res.json({ received: true }); } catch (e) { console.error('Stripe webhook failed:', e); res.status(500).send('Webhook handling failed'); }
};

const confirmationUrl = (kind, id) => {
  if (kind === 'enrollment') return `/classes/confirmation/${db.prepare('SELECT reg_number r FROM enrollments WHERE id = ?').get(id).r}`;
  return `/order/confirmation/${db.prepare('SELECT order_number n FROM produce_orders WHERE id = ?').get(id).n}/${stripeService.token('order', id)}`;
};

// Where Stripe sends the customer after paying. We ask Stripe whether the session is really paid; the URL alone proves nothing.
exports.success = async (req, res) => {
  const sid = String(req.query.session_id || '');
  if (!stripeService.enabled() || !/^cs_[A-Za-z0-9_]+$/.test(sid)) return notFound(req, res);
  const session = await stripeService.confirmSession(sid);
  const kind = session.metadata && session.metadata.kind;
  const id = Number(session.metadata && session.metadata.ref_id);
  if (!KINDS.includes(kind) || !id) return notFound(req, res);
  if (session.payment_status !== 'paid') return site(res, 'pay-status', { pageTitle: 'Payment not completed', kind, id, token: stripeService.token(kind, id), retry: true });
  res.redirect(confirmationUrl(kind, id));
};

exports.cancelled = (req, res) => {
  const { kind, id, token } = req.params;
  if (!KINDS.includes(kind) || !stripeService.tokenOk(kind, Number(id), token)) return notFound(req, res);
  site(res, 'pay-status', { pageTitle: 'Payment not completed', kind, id: Number(id), token, retry: true });
};

exports.retry = async (req, res) => {
  const { kind, id, token } = req.params;
  if (!KINDS.includes(kind) || !stripeService.tokenOk(kind, Number(id), token)) return notFound(req, res);
  try { res.redirect(await stripeService.createCheckout(kind, Number(id), req)); } catch (e) {
    if (e instanceof ValidationError) return site(res, 'pay-status', { pageTitle: 'Payment not available', kind, id: Number(id), token, retry: false, message: e.message });
    throw e;
  }
};

// ---- DEMO checkout (only when no Stripe key is configured) ----
const demoOnly = (req, res, next) => (stripeService.isDemo() ? next() : notFound(req, res));
const demoRow = (req) => { stripeService.sweepDemo(); const r = demo.get(req.params.id); return r ? demo.parse(r) : null; };
exports.demoOnly = demoOnly;

exports.demoPage = (req, res) => {
  const c = demoRow(req);
  if (!c) return notFound(req, res);
  site(res, 'demo-checkout', { pageTitle: 'Demo checkout', c, error: req.query.declined ? 'Demo card declined (simulated). Choose the other demo card to complete the payment.' : '' });
};

exports.demoPay = (req, res) => {
  const c = demoRow(req);
  if (!c) return notFound(req, res);
  if (c.status !== 'open') return res.redirect(`/demo-pay/${c.id}`);
  if (req.body.card === 'declined') return res.redirect(`/demo-pay/${c.id}?declined=1`);
  const session = demo.markPaid(c.id);
  if (session) stripeService.fulfill(session); // same recording path as a Stripe webhook
  res.redirect(`/pay/success?session_id=${c.id}`);
};

exports.demoCancel = (req, res) => {
  const c = demoRow(req);
  if (!c) return notFound(req, res);
  demo.markCancelled(c.id);
  res.redirect(new URL(c.cancel_url).pathname);
};
