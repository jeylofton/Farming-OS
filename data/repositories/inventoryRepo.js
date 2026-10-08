const db = require('../adapters');

function list({ q = '', show = 'available', page = 1, perPage = 15 } = {}) {
  const where = [];
  const params = [];
  if (q) { where.push('(c.name LIKE ? OR c.variety LIKE ? OR l.lot_code LIKE ?)'); params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  if (show === 'available') where.push('l.quantity_available > 0');
  else if (show === 'empty') where.push('l.quantity_available = 0');
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const from = `FROM produce_inventory l JOIN crops c ON c.id = l.crop_id LEFT JOIN harvests h ON h.id = l.harvest_id ${w}`;
  const total = db.prepare(`SELECT COUNT(*) c ${from}`).get(...params).c;
  const rows = db.prepare(`SELECT l.*, c.name AS crop_name, c.variety, h.harvested_on, h.grade, h.quantity AS harvested_qty ${from} ORDER BY l.quantity_available = 0, h.harvested_on DESC, l.id DESC LIMIT ? OFFSET ?`).all(...params, perPage, (page - 1) * perPage);
  return { rows, total };
}

function get(id) {
  const l = db.prepare('SELECT l.*, c.name AS crop_name, c.variety, h.harvested_on, h.grade, h.quantity AS harvested_qty FROM produce_inventory l JOIN crops c ON c.id = l.crop_id LEFT JOIN harvests h ON h.id = l.harvest_id WHERE l.id = ?').get(id);
  if (!l) return null;
  l.history = db.prepare('SELECT * FROM inventory_adjustments WHERE inventory_id = ? ORDER BY id DESC').all(id);
  return l;
}

// Lots that can go on an order form.
const orderable = () => db.prepare(`SELECT l.id, l.lot_code, l.quantity_available, l.unit, l.unit_price, c.name AS crop_name, c.variety
  FROM produce_inventory l JOIN crops c ON c.id = l.crop_id WHERE l.quantity_available > 0 ORDER BY c.name COLLATE NOCASE, l.id`).all();

const summaryByCrop = () => db.prepare(`SELECT c.id, c.name, c.variety, c.photo, c.description, c.sale_price, c.default_unit,
  COALESCE(SUM(CASE WHEN l.listed = 1 THEN l.quantity_available END), 0) AS available, MIN(l.unit) AS unit, MIN(CASE WHEN l.quantity_available > 0 AND l.listed = 1 THEN l.unit_price END) AS price,
  (SELECT MIN(b.harvest_start) FROM planting_batches b WHERE b.crop_id = c.id AND b.archived = 0 AND b.stage IN ('sown','germinating','growing','harvesting') AND b.harvest_start >= date('now','localtime')) AS next_harvest
  FROM crops c LEFT JOIN produce_inventory l ON l.crop_id = c.id WHERE c.archived = 0 AND c.listed = 1 GROUP BY c.id ORDER BY available DESC, c.name COLLATE NOCASE`).all();

module.exports = { list, get, orderable, summaryByCrop };
