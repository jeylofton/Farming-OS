// End-to-end smoke test against a throwaway database: every page renders and the key rules hold.
// Run with: npm test
const os = require('os');
const fs = require('fs');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'farm-os-'));
process.env.DEMO_DB_PATH = path.join(tmp, 'test.db');
process.env.UPLOAD_PATH = path.join(tmp, 'uploads');
process.env.NO_LISTEN = '1';
process.env.DEMO_USER = 'admin';
process.env.DEMO_PASS = 'demo1234';

const app = require('../server');
const db = require('../data/adapters');

let failures = 0;
const ok = (cond, msg) => { if (cond) console.log('  ok   ' + msg); else { failures += 1; console.log('  FAIL ' + msg); } };

(async () => {
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = '';
  const req = async (method, url, form) => {
    const res = await fetch(base + url, {
      method, redirect: 'manual',
      headers: { cookie, ...(form ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) },
      body: form ? new URLSearchParams(form).toString() : undefined,
    });
    const set = res.headers.getSetCookie();
    if (set.length) cookie = set.map((c) => c.split(';')[0]).join('; ');
    return { status: res.status, loc: res.headers.get('location'), text: await res.text() };
  };
  const follow = async (r) => { // follow one redirect, keeping the flash message
    return r.loc ? req('GET', r.loc) : r;
  };

  console.log('Public site');
  for (const u of ['/', '/about', '/produce', '/classes', '/classes/seed-starting', '/updates', '/contact']) {
    const r = await req('GET', u);
    ok(r.status === 200 && !r.text.includes('undefined'), `GET ${u} -> ${r.status}`);
  }
  ok((await req('GET', '/classes/nope')).status === 404, 'unknown class slug -> 404');
  ok((await req('GET', '/admin')).status === 302, '/admin redirects when signed out');
  ok((await req('POST', '/login', { username: 'admin', password: 'wrong' })).status === 401, 'wrong password rejected');
  const login = await req('POST', '/login', { username: 'admin', password: 'demo1234' });
  ok(login.status === 302 && login.loc === '/admin', 'demo login works');

  console.log('Admin pages');
  const pages = ['/admin', '/admin/calendar', '/admin/calendar?m=2026-02', '/admin/reports', '/admin/settings', '/admin/content', '/admin/inquiries',
    '/admin/plantings', '/admin/plantings/1', '/admin/plantings/new', '/admin/plantings/1/edit', '/admin/crops', '/admin/crops/1', '/admin/crops/new', '/admin/plots', '/admin/plots/1',
    '/admin/tasks', '/admin/tasks/new', '/admin/harvests', '/admin/harvests/new', '/admin/harvests/1/edit', '/admin/inventory', '/admin/inventory/1',
    '/admin/orders', '/admin/orders/new', '/admin/orders/1', '/admin/customers', '/admin/customers/1', '/admin/courses', '/admin/courses/1', '/admin/classes', '/admin/classes?when=',
    '/admin/classes/new', '/admin/classes/3', '/admin/classes/3/edit', '/admin/enrollments', '/admin/students', '/admin/students/1', '/admin/supplies', '/admin/supplies?low=1',
    '/admin/equipment', '/admin/expenses', '/admin/expenses/new', '/admin/staff', '/admin/updates', '/admin/plantings?archived=1', '/admin/crops?q=tom'];
  for (const u of pages) {
    const r = await req('GET', u);
    ok(r.status === 200 && !r.text.includes('undefined') && !r.text.includes('[object Object]'), `GET ${u} -> ${r.status}`);
  }
  ok((await req('GET', '/admin/livestock')).status === 404, 'livestock module is dormant (404) while its flag is off');
  ok((await req('GET', '/admin/nothing')).status === 404, 'unknown resource -> 404');

  console.log('Rules');
  // XSS: owner-entered text is escaped
  let r = await req('POST', '/admin/crops', { name: '<script>alert(1)</script>', default_unit: 'lb', sale_price: '1', listed: ['0', '1'] });
  ok(r.status === 302, 'crop with script tag saved as plain text');
  r = await req('GET', '/admin/crops?q=script');
  ok(!r.text.includes('<script>alert(1)</script>') && r.text.includes('&lt;script&gt;'), 'script tag is escaped on output');
  // Validation
  r = await follow(await req('POST', '/admin/expenses', { expense_date: '2026-02-30', category: 'Seeds', amount: '5' }));
  ok(r.text.includes('valid date'), 'impossible date rejected');
  r = await follow(await req('POST', '/admin/expenses', { expense_date: '2026-01-05', category: 'Seeds', amount: '-5' }));
  ok(r.text.includes('cannot be less than'), 'negative amount rejected');
  r = await follow(await req('POST', '/admin/plantings', { crop_id: '1', stage: 'planned', sow_date: '2026-05-10', harvest_start: '2026-05-01' }));
  ok(r.text.includes('cannot start before'), 'harvest window before sowing rejected');
  // Cross-site POST blocked
  const cs = await fetch(base + '/admin/expenses', { method: 'POST', headers: { cookie, origin: 'http://evil.example', 'content-type': 'application/x-www-form-urlencoded' }, body: 'amount=1', redirect: 'manual' });
  ok(cs.status === 403, 'cross-origin POST blocked');

  // Class capacity: Seed Starting (id 3) is full with 1 waitlisted
  const taken = () => db.prepare("SELECT COUNT(*) c FROM enrollments WHERE session_id = 3 AND status IN ('registered','completed')").get().c;
  r = await req('POST', '/classes/seed-starting/register', { session_id: '3', name: 'Test Waitlist', email: 'wl@example.com' });
  ok(r.status === 302 && /confirmation/.test(r.loc), 'full class accepts a waitlist registration');
  ok(db.prepare("SELECT status FROM enrollments WHERE student_id = (SELECT id FROM students WHERE email='wl@example.com')").get().status === 'waitlisted' && taken() === 8, 'overflow is waitlisted, seats stay at capacity');
  r = await req('POST', '/classes/seed-starting/register', { session_id: '3', name: 'Test Waitlist', email: 'wl@example.com' });
  r = await follow(r);
  ok(r.text.includes('already registered'), 'duplicate registration rejected');
  db.prepare('UPDATE class_sessions SET waitlist = 0 WHERE id = 3').run();
  r = await follow(await req('POST', '/classes/seed-starting/register', { session_id: '3', name: 'Too Late', email: 'late@example.com' }));
  ok(r.text.includes('class is full'.replace('c', 'C')) || r.text.includes('full'), 'full class without waitlist is refused');
  ok(taken() === 8, 'capacity never exceeded');
  r = await follow(await req('POST', '/classes/seed-starting/register', { session_id: '2', name: 'Wrong', email: 'w@example.com' }));
  ok(r.text.includes('one of the sessions listed'), 'session must belong to the course');
  // Lowering capacity under registrations is blocked
  r = await follow(await req('POST', '/admin/classes/3', { course_id: '2', starts_at: '2099-01-01T10:00', capacity: '3', status: 'scheduled', waitlist: '1' }));
  ok(r.text.includes('Capacity cannot be lower'), 'capacity cannot drop below seats taken');
  // Cancelling a registration promotes the waitlist
  db.prepare('UPDATE class_sessions SET waitlist = 1 WHERE id = 3').run();
  const regId = db.prepare("SELECT id FROM enrollments WHERE session_id = 3 AND status = 'registered' ORDER BY id LIMIT 1").get().id;
  await req('POST', `/admin/enrollments/${regId}/cancel`, { back: '/admin/classes/3', refund: '0' });
  const status = (name) => db.prepare('SELECT e.status FROM enrollments e JOIN students s ON s.id = e.student_id WHERE e.session_id = 3 AND s.name = ?').get(name).status;
  ok(status('Leo Novak') === 'registered' && status('Test Waitlist') === 'waitlisted' && taken() === 8, 'cancellation promotes the earliest waitlisted student, the next stays waitlisted');

  // Orders & inventory
  const lot = db.prepare('SELECT id, quantity_available q, lot_code FROM produce_inventory WHERE quantity_available > 5 ORDER BY id LIMIT 1').get();
  r = await follow(await req('POST', '/admin/orders', { customer_id: '1', item_lot: String(lot.id), item_qty: String(lot.q + 1), item_price: '' }));
  ok(r.text.includes('available'), 'order above available stock rejected');
  r = await req('POST', '/admin/orders', { customer_id: '1', item_lot: String(lot.id), item_qty: '2', item_price: '' });
  ok(r.status === 302, 'order created');
  const after = db.prepare('SELECT quantity_available q FROM produce_inventory WHERE id = ?').get(lot.id).q;
  ok(after === lot.q - 2, 'order reserves stock');
  const oid = Number(r.loc.split('/').pop());
  r = await follow(await req('POST', `/admin/payments/order/${oid}`, { amount: '99999', method: 'cash', type: 'payment', back: `/admin/orders/${oid}` }));
  ok(r.text.includes('exceeds the balance'), 'overpayment rejected');
  await req('POST', `/admin/orders/${oid}/status`, { status: 'cancelled' });
  ok(db.prepare('SELECT quantity_available q FROM produce_inventory WHERE id = ?').get(lot.id).q === lot.q, 'cancelling an order restores stock');
  r = await follow(await req('POST', `/admin/orders/${oid}/status`, { status: 'fulfilled' }));
  ok(r.text.includes('cannot be changed'), 'cancelled order cannot be fulfilled');
  // Harvest -> inventory
  const before = db.prepare('SELECT COUNT(*) c FROM produce_inventory').get().c;
  r = await req('POST', '/admin/harvests', { batch_id: '3', harvested_on: '2026-01-01', quantity: '12', unit: 'lb', grade: 'A' });
  ok(r.status === 302 && db.prepare('SELECT COUNT(*) c FROM produce_inventory').get().c === before + 1, 'recording a harvest creates an inventory lot');
  r = await follow(await req('POST', '/admin/harvests', { batch_id: '3', harvested_on: '2999-01-01', quantity: '12', unit: 'lb', grade: 'A' }));
  ok(r.text.includes('future'), 'future harvest date rejected');
  const soldHarvest = db.prepare("SELECT h.id FROM harvests h JOIN produce_inventory l ON l.harvest_id = h.id WHERE l.quantity_available < h.quantity LIMIT 1").get();
  r = await follow(await req('POST', `/admin/harvests/${soldHarvest.id}/delete`, {}));
  ok(r.text.includes('cannot be deleted'), 'harvest with sales cannot be deleted');
  // Archive + delete guard
  r = await req('POST', '/admin/crops/1/archive', {});
  ok(r.status === 302 && db.prepare('SELECT archived a FROM crops WHERE id = 1').get().a === 1, 'archive works');
  r = await follow(await req('POST', '/admin/crops/1/delete', {}));
  ok(r.text.includes('Archive it instead'), 'delete of an in-use record is refused');
  // Public inquiry
  r = await req('POST', '/contact', { name: 'Tester', email: 'tester@example.com', message: 'Hello' });
  ok(r.status === 302 && db.prepare("SELECT COUNT(*) c FROM inquiries WHERE name = 'Tester'").get().c === 1, 'public inquiry saved');
  // Persistence: reseeding must not touch existing data
  const { seed } = require('../services/seedService');
  ok(seed() === false && db.prepare('SELECT COUNT(*) c FROM crops').get().c >= 9, 'existing database is never re-seeded or overwritten');

  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
