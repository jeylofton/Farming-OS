const db = require('../data/adapters');
const v = require('../lib/validate');

const { ValidationError } = v;
const REASONS = { spoilage: -1, sale: -1, donation: -1, correction: 0 };
const REASON_LABELS = { spoilage: 'Spoilage / waste', sale: 'Sold outside orders (stand / market)', donation: 'Donated / sampled', correction: 'Count correction (+/-)' };

function adjust(lotId, body) {
  const reason = v.oneOf(body.reason, Object.keys(REASONS), 'Reason');
  let q = v.num(body.quantity, 'Quantity', { required: true, min: reason === 'correction' ? -1e7 : 0.01 });
  if (q === 0) throw new ValidationError('Quantity cannot be zero.');
  const delta = REASONS[reason] === 0 ? q : -Math.abs(q);
  db.transaction(() => {
    const lot = db.prepare('SELECT * FROM produce_inventory WHERE id = ?').get(lotId);
    if (!lot) throw new ValidationError('Inventory lot not found.');
    if (lot.quantity_available + delta < 0) throw new ValidationError(`Only ${lot.quantity_available} ${lot.unit} available in this lot.`);
    db.prepare('UPDATE produce_inventory SET quantity_available = quantity_available + ? WHERE id = ?').run(delta, lotId);
    db.prepare('INSERT INTO inventory_adjustments (inventory_id, delta, reason, note, ref) VALUES (?,?,?,?,?)').run(lotId, delta, reason, v.clean(body.note, 300), lot.lot_code);
  })();
}

function setListing(lotId, body) {
  const price = v.num(body.unit_price, 'Price', { required: true, min: 0, max: 1e6 });
  const listed = [].concat(body.listed || []).includes('1') ? 1 : 0;
  const r = db.prepare('UPDATE produce_inventory SET unit_price = ?, listed = ? WHERE id = ?').run(price, listed, lotId);
  if (!r.changes) throw new ValidationError('Inventory lot not found.');
}

module.exports = { adjust, setListing, REASON_LABELS };
