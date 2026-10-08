// Online card payments through Stripe Checkout (hosted page: card details never touch this server).
//
// Safety rules this module enforces:
//  - Amounts always come from our database, never from the browser.
//  - A payment is recorded ONLY from a signed Stripe webhook (or by re-reading the session from Stripe itself),
//    never because a customer landed on a "success" URL.
//  - Recording is idempotent: Stripe retries webhooks, and the same session can never be counted twice.
//  - A seat/stock hold lasts holdMinutes; if the checkout expires unpaid the hold is released.
const crypto = require('crypto');
const Stripe = require('stripe');
const config = require('../config');
const db = require('../data/adapters');
const activity = require('../data/repositories/activityRepo');
const payments = require('./paymentService');
const orderService = require('./orderService');
const enrollmentService = require('./enrollmentService');
const { ValidationError } = require('../lib/validate');
const { round2 } = require('../lib/format');
const features = require('../config/features');
const demo = require('./demoPayments');

let injected = null; // tests inject a stub client
let cached = null;
const setClient = (c) => { injected = c; };
function client() {
  if (injected) return injected;
  if (!config.stripe.secretKey) return features.onlinePayments ? demo.client : null; // no Stripe key: simulated DEMO checkout
  if (!cached) cached = new Stripe(config.stripe.secretKey);
  return cached;
}
const enabled = () => Boolean(client());
const isDemo = () => !injected && !config.stripe.secretKey && features.onlinePayments;
const mode = () => (config.stripe.secretKey ? (config.stripe.secretKey.startsWith('sk_live') ? 'LIVE' : 'test') : isDemo() ? 'demo' : 'not configured');
const cardMethod = () => (isDemo() ? 'card (DEMO, simulated)' : 'card (online)');

const KINDS = { order: 'produce_orders', enrollment: 'enrollments' };
const cents = (n) => Math.round(round2(n) * 100);

// Unguessable per-record token so only the person who started a payment can restart or view it.
const token = (kind, id) => crypto.createHmac('sha256', config.sessionSecret).update(`${kind}:${id}`).digest('hex').slice(0, 32);
const tokenOk = (kind, id, t) => {
  const a = Buffer.from(token(kind, id));
  const b = Buffer.from(String(t || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
const baseUrl = (req) => config.appUrl || `${req.protocol}://${req.get('host')}`;

// What the customer is paying for, built from the database.
function describe(kind, id) {
  if (kind === 'enrollment') {
    const e = db.prepare(`SELECT e.*, s.starts_at, c.title, st.email FROM enrollments e JOIN class_sessions s ON s.id = e.session_id JOIN courses c ON c.id = s.course_id JOIN students st ON st.id = e.student_id WHERE e.id = ?`).get(id);
    if (!e) throw new ValidationError('Registration not found.');
    if (e.status !== 'registered') throw new ValidationError('This registration is not awaiting payment.');
    const due = round2(e.amount - e.amount_paid);
    return { email: e.email, dueCents: cents(due), label: e.reg_number, lines: [{ name: `${e.title} (${e.starts_at.slice(0, 10)}) – ${e.reg_number}`, cents: cents(due) }] };
  }
  const o = db.prepare('SELECT o.*, c.email FROM produce_orders o JOIN customers c ON c.id = o.customer_id WHERE o.id = ?').get(id);
  if (!o) throw new ValidationError('Order not found.');
  if (o.status === 'cancelled' || o.status === 'fulfilled') throw new ValidationError('This order is not awaiting payment.');
  const due = round2(o.total - o.amount_paid);
  let lines;
  if (o.amount_paid > 0) lines = [{ name: `Balance for order ${o.order_number}`, cents: cents(due) }];
  else {
    lines = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(id).map((i) => ({ name: `${i.description} (${i.quantity} ${i.unit})`, cents: cents(i.line_total) }));
    if (o.tax > 0) lines.push({ name: 'Sales tax', cents: cents(o.tax) });
  }
  return { email: o.email, dueCents: cents(due), label: o.order_number, lines };
}

// Returns the Stripe-hosted checkout URL.
async function createCheckout(kind, id, req) {
  const stripe = client();
  if (!stripe) throw new ValidationError('Online payment is not available right now.');
  const d = describe(kind, id);
  if (d.dueCents <= 0) throw new ValidationError('Nothing is due on this record.');
  const base = baseUrl(req);
  const t = token(kind, id);
  const meta = { kind, ref_id: String(id) };
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: d.lines.map((l) => ({ quantity: 1, price_data: { currency: config.stripe.currency, unit_amount: l.cents, product_data: { name: l.name.slice(0, 120) } } })),
    customer_email: d.email || undefined,
    metadata: meta,
    payment_intent_data: { metadata: meta },
    expires_at: Math.floor(Date.now() / 1000) + config.stripe.holdMinutes * 60,
    success_url: `${base}/pay/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/pay/cancelled/${kind}/${id}/${t}`,
  });
  return session.url;
}

const intentOf = (s) => (typeof s.payment_intent === 'string' ? s.payment_intent : s.payment_intent && s.payment_intent.id) || null;

// Record a paid Checkout Session. Safe to call any number of times for the same session.
function fulfill(session) {
  if (!session || session.payment_status !== 'paid') return 'unpaid';
  const kind = session.metadata && session.metadata.kind;
  const id = Number(session.metadata && session.metadata.ref_id);
  if (!KINDS[kind] || !id) return 'ignored';
  return db.transaction(() => {
    if (db.prepare('SELECT 1 FROM payments WHERE provider_ref = ?').get(session.id)) return 'duplicate';
    const row = db.prepare(`SELECT * FROM ${KINDS[kind]} WHERE id = ?`).get(id);
    if (!row) { activity.log('Online payment for a missing record', `${kind} #${id} (${session.id}) needs manual review`, 'stripe'); return 'missing'; }
    const amount = round2((session.amount_total || 0) / 100);
    db.prepare('INSERT INTO payments (kind, ref_id, amount, method, note, provider_ref, payment_intent) VALUES (?,?,?,?,?,?,?)')
      .run(kind, id, amount, cardMethod(), isDemo() ? 'Demo checkout (no real money)' : 'Stripe Checkout', session.id, intentOf(session));
    payments.recompute(kind, id);
    if (kind === 'order' && row.status === 'pending') orderService.setStatus(id, 'confirmed');
    if (row.status === 'cancelled') activity.log('Online payment on a CANCELLED record', `${kind} #${id}: ${amount.toFixed(2)} was collected, refund it`, 'stripe');
    else activity.log(isDemo() ? 'Demo payment received' : 'Online payment received', `${kind} #${id}: ${amount.toFixed(2)}`, isDemo() ? 'demo' : 'stripe');
    return 'recorded';
  })();
}

// The customer never paid: free the seat / return the stock.
function release(session) {
  const kind = session.metadata && session.metadata.kind;
  const id = Number(session.metadata && session.metadata.ref_id);
  if (!KINDS[kind] || !id) return 'ignored';
  try {
    if (kind === 'enrollment') {
      const e = db.prepare('SELECT status, amount_paid FROM enrollments WHERE id = ?').get(id);
      if (e && e.status === 'registered' && e.amount_paid === 0) { enrollmentService.cancel(id); activity.log('Checkout expired', `registration #${id} released`, 'stripe'); return 'released'; }
    } else {
      const o = db.prepare('SELECT status, amount_paid FROM produce_orders WHERE id = ?').get(id);
      if (o && o.status === 'pending' && o.amount_paid === 0) { orderService.setStatus(id, 'cancelled'); activity.log('Checkout expired', `order #${id} cancelled, stock returned`, 'stripe'); return 'released'; }
    }
  } catch (e) { if (!(e instanceof ValidationError)) throw e; }
  return 'kept';
}

function handleEvent(event) {
  const obj = event.data.object;
  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': return fulfill(obj);
    case 'checkout.session.expired':
    case 'checkout.session.async_payment_failed': return release(obj);
    default: return 'ignored';
  }
}

// Verifies the Stripe signature on the RAW request body. Returns the event, or throws.
function verifyWebhook(rawBody, signature) {
  if (!config.stripe.webhookSecret) throw new Error('STRIPE_WEBHOOK_SECRET is not set');
  return Stripe.webhooks.constructEvent(rawBody, signature, config.stripe.webhookSecret);
}

// Called by the success page: ask Stripe directly (not the URL) whether the session was paid.
async function confirmSession(sessionId) {
  const stripe = client();
  if (!stripe) throw new ValidationError('Online payment is not available right now.');
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  fulfill(session);
  return session;
}

const paidOnline = (kind, id) => db.prepare('SELECT COALESCE(SUM(amount),0) s FROM payments WHERE kind = ? AND ref_id = ? AND payment_intent IS NOT NULL').get(kind, id).s;

// Send as much of a refund as possible back to the customer's card. Returns how much went through Stripe;
// the caller records any remainder as a manual (cash/check) refund.
async function refundOnline(kind, id, amount) {
  const stripe = client();
  if (!stripe) return 0;
  const rows = db.prepare('SELECT payment_intent, amount FROM payments WHERE kind = ? AND ref_id = ? AND payment_intent IS NOT NULL ORDER BY id').all(kind, id);
  const net = new Map();
  for (const r of rows.filter((x) => String(x.payment_intent).startsWith('pi_demo_') === isDemo())) net.set(r.payment_intent, round2((net.get(r.payment_intent) || 0) + r.amount));
  let left = round2(amount);
  let done = 0;
  for (const [intent, available] of net) {
    if (left <= 0.004) break;
    if (available <= 0.004) continue;
    const part = round2(Math.min(left, available));
    const refund = await stripe.refunds.create({ payment_intent: intent, amount: cents(part) }, { idempotencyKey: `refund:${kind}:${id}:${intent}:${cents(available)}:${cents(part)}` });
    db.transaction(() => {
      db.prepare('INSERT INTO payments (kind, ref_id, amount, method, note, provider_ref, payment_intent) VALUES (?,?,?,?,?,?,?)')
        .run(kind, id, -part, isDemo() ? 'refund (card, DEMO)' : 'refund (card, online)', isDemo() ? 'Demo refund (no real money)' : 'Stripe refund', refund.id, intent);
      payments.recompute(kind, id);
      activity.log(isDemo() ? 'Demo refund recorded' : 'Refund sent to card', `${kind} #${id}: ${part.toFixed(2)}`, 'admin');
    })();
    left = round2(left - part);
    done = round2(done + part);
  }
  return done;
}

// Demo checkouts that ran out of time release their seat/stock; called on a timer and on every demo page view.
const sweepDemo = () => demo.expireDue(release);

module.exports = { sweepDemo, isDemo, enabled, mode, setClient, token, tokenOk, createCheckout, fulfill, release, handleEvent, verifyWebhook, confirmSession, refundOnline, paidOnline };
