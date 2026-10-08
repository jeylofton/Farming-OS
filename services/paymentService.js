// Payments for produce orders and class enrollments. Refunds are negative payments, so the ledger stays auditable.
const db = require('../data/adapters');
const v = require('../lib/validate');
const { round2 } = require('../lib/format');
const activity = require('../data/repositories/activityRepo');

const { ValidationError } = v;
const METHODS = ['cash', 'card (recorded manually)', 'check', 'bank transfer', 'other'];
const KINDS = {
  order: { table: 'produce_orders', total: 'total', paid: 'amount_paid', cancelled: "status = 'cancelled'", label: 'order' },
  enrollment: { table: 'enrollments', total: 'amount', paid: 'amount_paid', cancelled: "status = 'cancelled'", label: 'registration' },
};

function recompute(kind, id) {
  const k = KINDS[kind];
  const paid = round2(db.prepare('SELECT COALESCE(SUM(amount),0) s FROM payments WHERE kind = ? AND ref_id = ?').get(kind, id).s);
  const hadRefund = db.prepare('SELECT 1 FROM payments WHERE kind = ? AND ref_id = ? AND amount < 0').get(kind, id);
  const total = db.prepare(`SELECT ${k.total} t FROM ${k.table} WHERE id = ?`).get(id).t;
  let status;
  if (paid <= 0) status = hadRefund ? 'refunded' : total === 0 && kind === 'enrollment' ? 'free' : 'unpaid';
  else if (paid + 0.005 < total) status = 'partial';
  else status = 'paid';
  db.prepare(`UPDATE ${k.table} SET ${k.paid} = ?, payment_status = ? WHERE id = ?`).run(paid, status, id);
}

// amount > 0 is a payment; amount < 0 is a refund. Nothing is recorded in Stage 1 with a real processor.
function record(kind, id, body) {
  const k = KINDS[kind];
  if (!k) throw new ValidationError('Unknown payment type.');
  const isRefund = body.type === 'refund';
  const amt = v.num(body.amount, 'Amount', { required: true, min: 0.01, max: 1e7 });
  const method = v.oneOf(body.method || 'cash', METHODS, 'Payment method');
  db.transaction(() => {
    const row = db.prepare(`SELECT *, ${k.total} AS due_total FROM ${k.table} WHERE id = ?`).get(id);
    if (!row) throw new ValidationError('Record not found.');
    const paid = round2(row[k.paid]);
    if (isRefund) {
      if (amt > paid + 0.005) throw new ValidationError(`You can refund at most ${paid.toFixed(2)}.`);
    } else {
      if (row.status === 'cancelled') throw new ValidationError(`This ${k.label} is cancelled; no new payments can be recorded.`);
      const balance = round2(row.due_total - paid);
      if (amt > balance + 0.005) throw new ValidationError(`The payment exceeds the balance due (${balance.toFixed(2)}).`);
    }
    db.prepare('INSERT INTO payments (kind, ref_id, amount, method, note) VALUES (?,?,?,?,?)').run(kind, id, isRefund ? -amt : amt, isRefund ? 'refund (' + method + ')' : method, v.clean(body.note, 200));
    recompute(kind, id);
    activity.log(isRefund ? 'Refund recorded' : 'Payment recorded', `${k.label} #${id}: ${amt.toFixed(2)} (${method})`, 'admin');
  })();
}

const forRecord = (kind, id) => db.prepare('SELECT * FROM payments WHERE kind = ? AND ref_id = ? ORDER BY id DESC').all(kind, id);

module.exports = { record, recompute, forRecord, METHODS };
