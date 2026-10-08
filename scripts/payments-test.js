// Online-payment tests with a stubbed Stripe client and genuinely signed webhooks. Run with: npm test
const os = require('os');
const fs = require('fs');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'farm-pay-'));
process.env.DEMO_DB_PATH = path.join(tmp, 'test.db');
process.env.UPLOAD_PATH = path.join(tmp, 'uploads');
process.env.NO_LISTEN = '1';
process.env.STRIPE_SECRET_KEY = 'sk_test_stub'; // turns the feature flags on; the client itself is stubbed below
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';

const Stripe = require('stripe');
const app = require('../server');
const db = require('../data/adapters');
const stripeService = require('../services/stripeService');

let failures = 0;
const ok = (cond, msg) => { if (cond) console.log('  ok   ' + msg); else { failures += 1; console.log('  FAIL ' + msg); } };

// ---- stub Stripe API ----
const created = [];
const refunds = [];
const sessions = {};
let n = 0;
stripeService.setClient({
  checkout: { sessions: {
    create: async (p) => { n += 1; const s = { id: `cs_test_${n}`, url: `https://checkout.stripe.test/cs_test_${n}`, params: p, metadata: p.metadata, payment_status: 'unpaid', amount_total: p.line_items.reduce((t, l) => t + l.price_data.unit_amount, 0), payment_intent: `pi_${n}` }; sessions[s.id] = s; created.push(s); return s; },
    retrieve: async (id) => sessions[id],
  } },
  refunds: { create: async (p) => { refunds.push(p); return { id: `re_${refunds.length}` }; } },
});

(async () => {
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = '';
  const req = async (method, url, form, headers = {}) => {
    const res = await fetch(base + url, { method, redirect: 'manual', headers: { cookie, ...(form ? { 'content-type': 'application/x-www-form-urlencoded' } : {}), ...headers }, body: form ? new URLSearchParams(form).toString() : undefined });
    const set = res.headers.getSetCookie();
    if (set.length) cookie = set.map((c) => c.split(';')[0]).join('; ');
    return { status: res.status, loc: res.headers.get('location'), text: await res.text() };
  };
  const follow = async (r) => (r.loc ? req('GET', r.loc) : r);
  const webhook = async (type, session, { sign = true } = {}) => {
    const payload = JSON.stringify({ id: 'evt_' + Math.random(), type, data: { object: session } });
    const header = sign ? Stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_test_secret' }) : 'bogus';
    const res = await fetch(base + '/webhooks/stripe', { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': header }, body: payload });
    return res.status;
  };
  const paidSession = (s) => ({ id: s.id, metadata: s.metadata, payment_status: 'paid', amount_total: s.amount_total, payment_intent: s.payment_intent });

  await req('POST', '/login', { username: 'admin', password: 'demo1234' });
  console.log('Setup');
  ok(stripeService.enabled() && stripeService.mode() === 'test', 'Stripe test mode detected from the key');
  ok((await req('GET', '/order')).status === 200, 'public /order page is on when payments are configured');
  ok((await req('GET', '/admin/settings')).text.includes('Online payments (Stripe)'), 'settings page reports Stripe status');

  console.log('Class payment');
  let r = await req('POST', '/classes/soil-preparation/register', { session_id: '5', name: 'Pat Payer', email: 'pat@example.com' });
  ok(r.status === 302 && r.loc.startsWith('https://checkout.stripe.test/'), 'paid class registration redirects to Stripe Checkout');
  const cs1 = created[created.length - 1];
  ok(cs1.params.line_items[0].price_data.unit_amount === 2500 && cs1.params.mode === 'payment', 'amount comes from the database (2500 cents), mode=payment');
  ok(cs1.params.expires_at - Math.floor(Date.now() / 1000) <= 1800 + 5, 'checkout expires in 30 minutes (seat hold)');
  const enr = db.prepare("SELECT * FROM enrollments WHERE reg_number = (SELECT reg_number FROM enrollments ORDER BY id DESC LIMIT 1)").get();
  ok(enr.status === 'registered' && enr.payment_status === 'unpaid', 'seat is held, unpaid, until Stripe confirms');

  ok(await webhook('checkout.session.completed', paidSession(cs1), { sign: false }) === 400, 'webhook with a bad signature is rejected');
  ok(db.prepare('SELECT COUNT(*) c FROM payments WHERE provider_ref = ?').get(cs1.id).c === 0, 'nothing recorded for the forged webhook');
  r = await req('GET', '/pay/success?session_id=' + cs1.id);
  ok(r.status === 200 && r.text.includes('Payment not completed'), 'success page asks Stripe, finds the session unpaid and says so');
  // the stub still says unpaid, so no payment may be recorded just because the customer reached the success URL
  ok(db.prepare('SELECT COUNT(*) c FROM payments WHERE provider_ref = ?').get(cs1.id).c === 0, 'reaching the success URL alone records no payment');
  ok(await webhook('checkout.session.completed', paidSession(cs1)) === 200, 'signed webhook accepted');
  ok(await webhook('checkout.session.completed', paidSession(cs1)) === 200, 'replayed webhook accepted');
  const paidRows = db.prepare('SELECT * FROM payments WHERE provider_ref = ?').all(cs1.id);
  ok(paidRows.length === 1 && paidRows[0].amount === 25 && paidRows[0].payment_intent === cs1.payment_intent, 'payment recorded exactly once with its PaymentIntent');
  ok(db.prepare('SELECT payment_status s FROM enrollments WHERE id = ?').get(enr.id).s === 'paid', 'registration is now paid');
  sessions[cs1.id] = { ...sessions[cs1.id], payment_status: 'paid' }; // Stripe now reports it paid
  r = await req('GET', '/pay/success?session_id=' + cs1.id);
  ok(r.status === 302 && r.loc.startsWith('/classes/confirmation/'), 'success page redirects a paid session to its confirmation');
  ok((await follow(r)).text.includes('Payment received'), 'confirmation shows the payment was received');

  r = await req('POST', '/classes/soil-preparation/register', { session_id: '5', name: 'Quit Early', email: 'quit@example.com' });
  const cs2 = created[created.length - 1];
  const before = db.prepare("SELECT COUNT(*) c FROM enrollments WHERE session_id = 5 AND status = 'registered'").get().c;
  await webhook('checkout.session.expired', { id: cs2.id, metadata: cs2.metadata, payment_status: 'unpaid' });
  ok(db.prepare("SELECT COUNT(*) c FROM enrollments WHERE session_id = 5 AND status = 'registered'").get().c === before - 1, 'expired checkout releases the held seat');
  r = await req('POST', `/pay/retry/enrollment/${cs2.metadata.ref_id}/${stripeService.token('enrollment', cs2.metadata.ref_id)}`);
  ok(r.status === 200 && r.text.includes('not awaiting payment'), 'a released registration cannot be paid again');
  ok((await req('POST', `/pay/retry/enrollment/${enr.id}/deadbeef`)).status === 404, 'retry with a wrong token is refused');

  console.log('Free class stays free');
  const free = db.prepare("SELECT s.id, c.slug FROM class_sessions s JOIN courses c ON c.id = s.course_id WHERE s.price = 0 AND s.status = 'scheduled' LIMIT 1").get();
  const createdBefore = created.length;
  r = await req('POST', `/classes/${free.slug}/register`, { session_id: String(free.id), name: 'Free Fred', email: 'fred@example.com' });
  ok(r.loc.startsWith('/classes/confirmation/') && created.length === createdBefore, 'a free class never opens Stripe');

  console.log('Produce order');
  const lot = db.prepare('SELECT id, quantity_available q, unit_price FROM produce_inventory WHERE listed = 1 AND quantity_available > 10 ORDER BY id LIMIT 1').get();
  r = await follow(await req('POST', '/order', { name: 'Olive Order', email: 'olive@example.com', ['qty_' + lot.id]: String(lot.q + 5) }));
  ok(r.text.includes('available'), 'ordering more than the stock is refused');
  r = await req('POST', '/order', { name: 'Olive Order', email: 'olive@example.com', ['qty_' + lot.id]: '4', item_price: '0.01' });
  ok(r.status === 302 && r.loc.startsWith('https://checkout.stripe.test/'), 'public order redirects to Stripe Checkout');
  const cs3 = created[created.length - 1];
  const orderRow = db.prepare('SELECT * FROM produce_orders WHERE id = ?').get(Number(cs3.metadata.ref_id));
  ok(cs3.amount_total === Math.round(lot.unit_price * 4 * 100) && orderRow.total === lot.unit_price * 4, 'price is server-side: a tampered price field is ignored');
  ok(db.prepare('SELECT quantity_available q FROM produce_inventory WHERE id = ?').get(lot.id).q === lot.q - 4, 'stock is reserved during checkout');
  await webhook('checkout.session.expired', { id: cs3.id, metadata: cs3.metadata, payment_status: 'unpaid' });
  ok(db.prepare('SELECT status FROM produce_orders WHERE id = ?').get(orderRow.id).status === 'cancelled' && db.prepare('SELECT quantity_available q FROM produce_inventory WHERE id = ?').get(lot.id).q === lot.q, 'expired order is cancelled and its stock returned');

  r = await req('POST', '/order', { name: 'Olive Order', email: 'olive@example.com', ['qty_' + lot.id]: '2' });
  const cs4 = created[created.length - 1];
  const oid = Number(cs4.metadata.ref_id);
  await webhook('checkout.session.completed', paidSession(cs4));
  const o4 = db.prepare('SELECT * FROM produce_orders WHERE id = ?').get(oid);
  ok(o4.payment_status === 'paid' && o4.status === 'confirmed', 'paid order is marked paid and confirmed');
  ok(db.prepare("SELECT COUNT(*) c FROM customers WHERE email = 'olive@example.com'").get().c === 1, 'repeat customer is matched by email, not duplicated');
  r = await req('GET', `/order/confirmation/${o4.order_number}/${stripeService.token('order', oid)}`);
  ok(r.status === 200 && r.text.includes(o4.order_number), 'customer confirmation page loads with its token');
  ok((await req('GET', `/order/confirmation/${o4.order_number}/wrongtoken`)).status === 404, 'confirmation page is not viewable without the token');

  console.log('Refunds');
  r = await follow(await req('POST', `/admin/payments/order/${oid}`, { type: 'refund', amount: '9999', method: 'cash', back: `/admin/orders/${oid}` }));
  ok(r.text.includes('at most'), 'refund above what was paid is refused');
  ok(refunds.length === 0, 'no Stripe refund was attempted for the invalid amount');
  r = await follow(await req('POST', `/admin/payments/order/${oid}`, { type: 'refund', amount: String(o4.total), method: 'cash', back: `/admin/orders/${oid}` }));
  ok(refunds.length === 1 && refunds[0].payment_intent === cs4.payment_intent && refunds[0].amount === Math.round(o4.total * 100), 'admin refund of a card payment goes back through Stripe');
  const o4b = db.prepare('SELECT * FROM produce_orders WHERE id = ?').get(oid);
  ok(o4b.amount_paid === 0 && o4b.payment_status === 'refunded', 'ledger shows the refund');
  r = await req('POST', `/admin/enrollments/${enr.id}/cancel`, { back: '/admin/classes/5', refund: '1' });
  ok(refunds.length === 2 && refunds[1].amount === 2500, 'cancelling a paid registration with refund sends the card refund');
  ok(db.prepare('SELECT status, payment_status FROM enrollments WHERE id = ?').get(enr.id).status === 'cancelled', 'registration cancelled');
  // cash payment refunds stay manual
  const cashOrder = db.prepare("SELECT id, amount_paid FROM produce_orders WHERE amount_paid > 0 AND id NOT IN (SELECT ref_id FROM payments WHERE payment_intent IS NOT NULL AND kind = 'order') LIMIT 1").get();
  const refundsBefore = refunds.length;
  await req('POST', `/admin/payments/order/${cashOrder.id}`, { type: 'refund', amount: '1', method: 'cash', back: '/admin/orders' });
  ok(refunds.length === refundsBefore, 'a cash payment is refunded manually, Stripe is not called');

  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll payment checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
