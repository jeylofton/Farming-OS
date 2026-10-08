const db = require('../adapters');

function list({ q = '', status = '', page = 1, perPage = 15 } = {}) {
  const where = [];
  const params = [];
  if (q) { where.push('(o.order_number LIKE ? OR c.name LIKE ? OR c.phone LIKE ?)'); params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  if (status === 'open') where.push("o.status IN ('pending','confirmed','ready')");
  else if (status === 'unpaid') where.push("o.status != 'cancelled' AND o.payment_status IN ('unpaid','partial')");
  else if (status) { where.push('o.status = ?'); params.push(status); }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const from = `FROM produce_orders o JOIN customers c ON c.id = o.customer_id ${w}`;
  const total = db.prepare(`SELECT COUNT(*) c ${from}`).get(...params).c;
  const rows = db.prepare(`SELECT o.*, c.name AS customer_name, c.phone AS customer_phone ${from} ORDER BY o.id DESC LIMIT ? OFFSET ?`).all(...params, perPage, (page - 1) * perPage);
  return { rows, total };
}

function get(id) {
  const o = db.prepare('SELECT o.*, c.name AS customer_name, c.phone AS customer_phone, c.email AS customer_email, c.address AS customer_address FROM produce_orders o JOIN customers c ON c.id = o.customer_id WHERE o.id = ?').get(id);
  if (!o) return null;
  o.items = db.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id').all(id);
  return o;
}

const forCustomer = (customerId) => db.prepare('SELECT * FROM produce_orders WHERE customer_id = ? ORDER BY id DESC LIMIT 50').all(customerId);

module.exports = { list, get, forCustomer };
