// DEMO payment provider: a simulated hosted checkout with the same shape as the Stripe client, so the whole
// payment flow (seat/stock holds, expiry, recording, refunds) runs through the real code paths with no real money.
// Swapped out automatically when STRIPE_SECRET_KEY is set. There is no card entry: the demo page offers a
// "succeeds" and a "declined" demo card, so nobody can type a real card number into a fake form.
const crypto = require('crypto');
const db = require('../data/adapters');

const rowToSession = (r) => ({
  id: r.id, metadata: { kind: r.kind, ref_id: String(r.ref_id) },
  payment_status: r.status === 'paid' ? 'paid' : 'unpaid', status: r.status, amount_total: r.amount_cents,
  payment_intent: r.payment_intent,
});

const client = {
  checkout: { sessions: {
    async create(p) {
      const id = 'cs_demo_' + crypto.randomBytes(12).toString('hex');
      const amount = p.line_items.reduce((t, l) => t + l.price_data.unit_amount * (l.quantity || 1), 0);
      const lines = p.line_items.map((l) => ({ name: l.price_data.product_data.name, cents: l.price_data.unit_amount * (l.quantity || 1) }));
      db.prepare(`INSERT INTO demo_checkouts (id, kind, ref_id, amount_cents, lines, email, success_url, cancel_url, origin, expires_at) VALUES (?,?,?,?,?,?,?,?,?,?)`)
        .run(id, p.metadata.kind, Number(p.metadata.ref_id), amount, JSON.stringify(lines), p.customer_email || '', p.success_url, p.cancel_url, new URL(p.success_url).origin, p.expires_at);
      return { id, url: `${new URL(p.success_url).origin}/demo-pay/${id}`, ...rowToSession(db.prepare('SELECT * FROM demo_checkouts WHERE id = ?').get(id)) };
    },
    async retrieve(id) { const r = db.prepare('SELECT * FROM demo_checkouts WHERE id = ?').get(id); return r ? rowToSession(r) : null; },
  } },
  refunds: { async create() { return { id: 're_demo_' + crypto.randomBytes(8).toString('hex') }; } },
};

const get = (id) => db.prepare('SELECT * FROM demo_checkouts WHERE id = ?').get(String(id));
const parse = (r) => ({ ...r, lines: JSON.parse(r.lines) });

// Mark a checkout paid and return the session object to record (the demo equivalent of Stripe's webhook).
function markPaid(id) {
  const intent = 'pi_demo_' + crypto.randomBytes(8).toString('hex');
  const r = db.prepare("UPDATE demo_checkouts SET status = 'paid', payment_intent = ? WHERE id = ? AND status = 'open'").run(intent, id);
  return r.changes ? rowToSession(get(id)) : null;
}
const markCancelled = (id) => db.prepare("UPDATE demo_checkouts SET status = 'cancelled' WHERE id = ? AND status = 'open'").run(id).changes > 0;

// Open checkouts past their hold time expire exactly like Stripe's: the caller releases the seat / stock.
function expireDue(release, nowSec = Math.floor(Date.now() / 1000)) {
  const due = db.prepare("SELECT * FROM demo_checkouts WHERE status = 'open' AND expires_at <= ?").all(nowSec);
  for (const r of due) {
    db.prepare("UPDATE demo_checkouts SET status = 'expired' WHERE id = ? AND status = 'open'").run(r.id);
    release(rowToSession({ ...r, status: 'expired' }));
  }
  return due.length;
}

module.exports = { client, get, parse, markPaid, markCancelled, expireDue };
