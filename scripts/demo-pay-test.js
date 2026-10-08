// DEMO payment provider tests (no Stripe key): the full class + produce payment flow with simulated checkout.
const os = require('os');
const fs = require('fs');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'farm-demopay-'));
process.env.DEMO_DB_PATH = path.join(tmp, 'test.db');
process.env.UPLOAD_PATH = path.join(tmp, 'uploads');
process.env.NO_LISTEN = '1';
delete process.env.STRIPE_SECRET_KEY;
delete process.env.DEMO_PAYMENTS;

const app = require('../server');
const db = require('../data/adapters');
const stripeService = require('../services/stripeService');

let failures = 0;
const ok = (cond, msg) => { if (cond) console.log('  ok   ' + msg); else { failures += 1; console.log('  FAIL ' + msg); } };

(async () => {
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = '';
  const req = async (method, url, form) => {
    const res = await fetch(base + url, { method, redirect: 'manual', headers: { cookie, ...(form ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) }, body: form ? new URLSearchParams(form).toString() : undefined });
    const set = res.headers.getSetCookie();
    if (set.length) cookie = set.map((c) => c.split(';')[0]).join('; ');
    return { status: res.status, loc: res.headers.get('location'), text: await res.text() };
  };
  const follow = async (r) => req('GET', r.loc);

  console.log('Demo mode');
  ok(stripeService.mode() === 'demo' && stripeService.isDemo(), 'no Stripe key -> demo mode');
  await req('POST', '/login', { username: 'admin', password: 'demo1234' });
  ok((await req('GET', '/admin/settings')).text.includes('simulated checkout, no real money'), 'admin settings says payments are simulated');
  ok((await req('GET', '/')).text.includes('Payments are simulated'), 'public footer says payments are simulated');
  ok((await req('POST', '/webhooks/stripe', {})).status === 400, 'the Stripe webhook refuses unsigned calls in demo mode too');

  console.log('Class payment');
  let r = await req('POST', '/classes/soil-preparation/register', { session_id: '5', name: 'Dee Demo', email: 'dee@example.com' });
  ok(r.status === 302 && r.loc.startsWith(`${base}/demo-pay/cs_demo_`), 'paid class registration goes to the demo checkout');
  const path1 = new URL(r.loc).pathname;
  const id1 = path1.split('/').pop();
  const enr = db.prepare('SELECT * FROM enrollments ORDER BY id DESC LIMIT 1').get();
  ok(enr.status === 'registered' && enr.payment_status === 'unpaid', 'seat is held, unpaid');
  let page = await req('GET', path1);
  ok(page.status === 200 && page.text.includes('DEMO CHECKOUT') && page.text.includes('$25.00'), 'demo page is labelled DEMO and shows the server-side amount');
  ok(!/<input[^>]+(name="(card|cardnumber|cc-number|number)"[^>]+type="text"|autocomplete="cc-number")/i.test(page.text) && !/type="text"/.test(page.text.split('<form')[1] || ''), 'demo page has no card-number text field');
  r = await req('POST', `/demo-pay/${id1}/pay`, { card: 'declined' });
  ok(r.loc.includes('declined=1'), 'declined demo card is refused');
  ok(db.prepare('SELECT payment_status s FROM enrollments WHERE id = ?').get(enr.id).s === 'unpaid' && db.prepare('SELECT COUNT(*) c FROM payments WHERE provider_ref = ?').get(id1).c === 0, 'declined card records nothing');
  ok((await req('GET', r.loc)).text.includes('declined (simulated)'), 'declined message is shown');
  r = await req('POST', `/demo-pay/${id1}/pay`, { card: 'ok' });
  ok(r.status === 302 && r.loc === `/pay/success?session_id=${id1}`, 'successful demo card returns to the success route');
  const done = await req('GET', r.loc);
  ok(done.status === 302 && done.loc.startsWith('/classes/confirmation/'), 'success route confirms through the provider and redirects to confirmation');
  ok((await follow(done)).text.includes('Payment received'), 'confirmation shows payment received');
  const row = db.prepare('SELECT * FROM payments WHERE provider_ref = ?').get(id1);
  ok(row && row.amount === 25 && row.method === 'card (DEMO, simulated)' && row.payment_intent.startsWith('pi_demo_'), 'ledger row is labelled as a DEMO card payment');
  await req('POST', `/demo-pay/${id1}/pay`, { card: 'ok' });
  await req('GET', `/pay/success?session_id=${id1}`);
  ok(db.prepare('SELECT COUNT(*) c FROM payments WHERE provider_ref = ?').get(id1).c === 1, 'paying/refreshing twice never double-records');
  ok((await req('GET', path1)).text.includes('<strong>paid</strong>'), 'a paid checkout page no longer offers payment');

  console.log('Hold, expiry and cancel');
  r = await req('POST', '/classes/soil-preparation/register', { session_id: '5', name: 'Late Lou', email: 'lou@example.com' });
  const id2 = new URL(r.loc).pathname.split('/').pop();
  const seatsBefore = db.prepare("SELECT COUNT(*) c FROM enrollments WHERE session_id = 5 AND status = 'registered'").get().c;
  db.prepare('UPDATE demo_checkouts SET expires_at = ? WHERE id = ?').run(Math.floor(Date.now() / 1000) - 5, id2);
  const swept = stripeService.sweepDemo();
  ok(swept === 1 && db.prepare("SELECT COUNT(*) c FROM enrollments WHERE session_id = 5 AND status = 'registered'").get().c === seatsBefore - 1, 'an expired demo checkout releases the held seat');
  ok((await req('GET', `/demo-pay/${id2}`)).text.includes('<strong>expired</strong>'), 'expired checkout says so');
  r = await req('POST', '/classes/soil-preparation/register', { session_id: '5', name: 'Cancel Cat', email: 'cat@example.com' });
  const id3 = new URL(r.loc).pathname.split('/').pop();
  r = await req('POST', `/demo-pay/${id3}/cancel`);
  ok(r.status === 302 && r.loc.startsWith('/pay/cancelled/enrollment/'), 'cancel returns to the "payment not completed" page');
  ok((await follow(r)).text.includes('Return to payment'), 'customer can return to payment');
  r = await req('POST', r.loc.replace('/pay/cancelled/', '/pay/retry/'));
  ok(r.status === 302 && r.loc.includes('/demo-pay/cs_demo_'), 'retry opens a fresh demo checkout');
  ok((await req('GET', '/demo-pay/cs_demo_nope')).status === 404, 'unknown demo checkout -> 404');

  console.log('Produce order');
  const lot = db.prepare('SELECT id, quantity_available q, unit_price FROM produce_inventory WHERE listed = 1 AND quantity_available > 10 ORDER BY id LIMIT 1').get();
  r = await req('POST', '/order', { name: 'Ola Order', email: 'ola@example.com', ['qty_' + lot.id]: '3' });
  ok(r.loc.includes('/demo-pay/cs_demo_'), 'public order goes to the demo checkout');
  const id4 = new URL(r.loc).pathname.split('/').pop();
  ok(db.prepare('SELECT quantity_available q FROM produce_inventory WHERE id = ?').get(lot.id).q === lot.q - 3, 'stock reserved during checkout');
  await req('POST', `/demo-pay/${id4}/pay`, { card: 'ok' });
  const oid = Number(db.prepare('SELECT ref_id FROM demo_checkouts WHERE id = ?').get(id4).ref_id);
  const o = db.prepare('SELECT * FROM produce_orders WHERE id = ?').get(oid);
  ok(o.payment_status === 'paid' && o.status === 'confirmed', 'paid demo order is paid and confirmed');
  const conf = await req('GET', `/pay/success?session_id=${id4}`);
  ok((await follow(conf)).text.includes(o.order_number), 'customer confirmation page shows the order number');
  r = await req('POST', '/order', { name: 'Ola Order', email: 'ola@example.com', ['qty_' + lot.id]: '2' });
  const id5 = new URL(r.loc).pathname.split('/').pop();
  db.prepare('UPDATE demo_checkouts SET expires_at = 1 WHERE id = ?').run(id5);
  stripeService.sweepDemo();
  ok(db.prepare('SELECT quantity_available q FROM produce_inventory WHERE id = ?').get(lot.id).q === lot.q - 3, 'an expired demo order is cancelled and its stock returned');

  console.log('Refunds');
  r = await req('POST', `/admin/payments/order/${oid}`, { type: 'refund', amount: String(o.total), method: 'cash', back: `/admin/orders/${oid}` });
  const ref = db.prepare('SELECT * FROM payments WHERE kind = ? AND ref_id = ? AND amount < 0').get('order', oid);
  ok(ref && ref.method === 'refund (card, DEMO)' && ref.provider_ref.startsWith('re_demo_'), 'refund of a demo payment is a simulated DEMO refund');
  ok(db.prepare('SELECT payment_status s FROM produce_orders WHERE id = ?').get(oid).s === 'refunded', 'order shows refunded');

  console.log('Switching to Stripe later');
  ok(stripeService.paidOnline('enrollment', enr.id) === 25, 'demo payments are tracked like card payments');

  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll demo-payment checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
