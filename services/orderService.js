// Produce orders: stock is reserved (decremented) when an order is created and restored on cancellation,
// so inventory can never go negative and every change is in inventory_adjustments.
const db = require('../data/adapters');
const v = require('../lib/validate');
const { round2, today } = require('../lib/format');
const settings = require('../data/repositories/settingsRepo');
const activity = require('../data/repositories/activityRepo');
const payments = require('./paymentService');

const { ValidationError } = v;
const STATUS_FLOW = { pending: ['confirmed', 'cancelled'], confirmed: ['ready', 'cancelled'], ready: ['fulfilled', 'cancelled'], fulfilled: [], cancelled: [] };

function resolveCustomer(body) {
  const id = Number(body.customer_id);
  if (id) {
    if (!db.prepare('SELECT 1 FROM customers WHERE id = ? AND archived = 0').get(id)) throw new ValidationError('Customer not found.');
    return id;
  }
  const name = v.required(body.new_name, 'Customer name');
  return db.prepare('INSERT INTO customers (name, phone, email) VALUES (?,?,?)').run(name, v.clean(body.new_phone, 40), v.email(body.new_email, 'Customer email')).lastInsertRowid;
}

function parseItems(body) {
  const ids = [].concat(body.item_lot || []);
  const qtys = [].concat(body.item_qty || []);
  const prices = [].concat(body.item_price || []);
  const items = [];
  ids.forEach((lot, i) => {
    if (!lot && !qtys[i]) return;
    const lotId = v.num(lot, 'Produce item', { required: true, min: 1, integer: true });
    const q = v.num(qtys[i], 'Quantity', { required: true, min: 0.01, max: 1e6 });
    const price = prices[i] === '' || prices[i] == null ? null : v.num(prices[i], 'Price', { min: 0, max: 1e6 });
    items.push({ lotId, q, price });
  });
  if (!items.length) throw new ValidationError('Add at least one produce item to the order.');
  return items;
}

function create(body) {
  const fulfillment = v.oneOf(body.fulfillment || 'pickup', ['pickup', 'delivery'], 'Fulfillment');
  const requested = v.date(body.requested_date, 'Requested date');
  if (requested && requested < today()) throw new ValidationError('The requested date cannot be in the past.');
  const items = parseItems(body);
  const notes = v.clean(body.notes, 1000);
  return db.transaction(() => {
    const customerId = resolveCustomer(body);
    const need = new Map();
    for (const it of items) need.set(it.lotId, (need.get(it.lotId) || 0) + it.q);
    const lots = new Map();
    for (const [lotId, q] of need) {
      const lot = db.prepare('SELECT l.*, c.name AS crop_name, c.variety FROM produce_inventory l JOIN crops c ON c.id = l.crop_id WHERE l.id = ?').get(lotId);
      if (!lot) throw new ValidationError('A selected produce lot no longer exists.');
      if (lot.quantity_available < q) throw new ValidationError(`Only ${lot.quantity_available} ${lot.unit} of ${lot.crop_name} is available (${q} requested).`);
      lots.set(lotId, lot);
    }
    const seq = db.prepare('SELECT COALESCE(MAX(id),0)+1 n FROM produce_orders').get().n;
    const orderNumber = `PO-${String(seq).padStart(4, '0')}`;
    const lines = items.map((it) => {
      const lot = lots.get(it.lotId);
      const unitPrice = it.price == null ? lot.unit_price : it.price;
      return { lot, q: it.q, unitPrice, total: round2(it.q * unitPrice) };
    });
    const subtotal = round2(lines.reduce((s, l) => s + l.total, 0));
    const tax = round2(subtotal * (Number(settings.get('tax_rate')) || 0) / 100);
    const orderId = db.prepare(`INSERT INTO produce_orders (order_number, customer_id, order_date, fulfillment, requested_date, subtotal, tax, total, notes) VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(orderNumber, customerId, today(), fulfillment, requested, subtotal, tax, round2(subtotal + tax), notes).lastInsertRowid;
    for (const l of lines) {
      const desc = l.lot.crop_name + (l.lot.variety ? ` – ${l.lot.variety}` : '');
      db.prepare('INSERT INTO order_items (order_id, inventory_id, description, unit, quantity, unit_price, line_total) VALUES (?,?,?,?,?,?,?)').run(orderId, l.lot.id, desc, l.lot.unit, l.q, l.unitPrice, l.total);
      db.prepare('UPDATE produce_inventory SET quantity_available = quantity_available - ? WHERE id = ?').run(l.q, l.lot.id);
      db.prepare('INSERT INTO inventory_adjustments (inventory_id, delta, reason, note, ref) VALUES (?,?,?,?,?)').run(l.lot.id, -l.q, 'sale', `Order ${orderNumber}`, orderNumber);
    }
    payments.recompute('order', orderId);
    activity.log('Order created', `${orderNumber} (${lines.length} item${lines.length === 1 ? '' : 's'})`, 'admin');
    return orderId;
  })();
}

function setStatus(id, next) {
  db.transaction(() => {
    const o = db.prepare('SELECT * FROM produce_orders WHERE id = ?').get(id);
    if (!o) throw new ValidationError('Order not found.');
    if (!(STATUS_FLOW[o.status] || []).includes(next)) throw new ValidationError(`An order that is ${o.status} cannot be changed to ${next}.`);
    if (next === 'cancelled') {
      for (const it of db.prepare('SELECT * FROM order_items WHERE order_id = ? AND inventory_id IS NOT NULL').all(id)) {
        db.prepare('UPDATE produce_inventory SET quantity_available = quantity_available + ? WHERE id = ?').run(it.quantity, it.inventory_id);
        db.prepare('INSERT INTO inventory_adjustments (inventory_id, delta, reason, note, ref) VALUES (?,?,?,?,?)').run(it.inventory_id, it.quantity, 'correction', `Order ${o.order_number} cancelled`, o.order_number);
      }
    }
    db.prepare('UPDATE produce_orders SET status = ? WHERE id = ?').run(next, id);
    activity.log('Order ' + next, o.order_number, 'admin');
  })();
}

function updateDetails(id, body) {
  const fulfillment = v.oneOf(body.fulfillment || 'pickup', ['pickup', 'delivery'], 'Fulfillment');
  const requested = v.date(body.requested_date, 'Requested date');
  const r = db.prepare('UPDATE produce_orders SET fulfillment = ?, requested_date = ?, notes = ? WHERE id = ?').run(fulfillment, requested, v.clean(body.notes, 1000), id);
  if (!r.changes) throw new ValidationError('Order not found.');
}

module.exports = { create, setStatus, updateDetails, STATUS_FLOW };
