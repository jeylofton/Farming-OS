// Recording a harvest creates the produce inventory lot in the same transaction.
const db = require('../data/adapters');
const repo = require('../data/repositories/resourceRepo');
const { ValidationError } = require('../lib/validate');
const { today } = require('../lib/format');

const def = () => require('../config/resources').resources.harvests;

function create(data) {
  const batch = db.prepare('SELECT b.*, c.sale_price, c.name AS crop_name FROM planting_batches b JOIN crops c ON c.id = b.crop_id WHERE b.id = ?').get(data.batch_id);
  if (!batch) throw new ValidationError('Planting batch not found.');
  if (batch.stage === 'failed') throw new ValidationError('A failed batch cannot be harvested.');
  if (data.harvested_on > today()) throw new ValidationError('The harvest date cannot be in the future.');
  const id = repo.insert(def(), data);
  const lot = `${batch.batch_code}-H${id}`;
  const lotId = db.prepare(`INSERT INTO produce_inventory (crop_id, harvest_id, lot_code, quantity_available, unit, unit_price, listed) VALUES (?,?,?,?,?,?,1)`)
    .run(batch.crop_id, id, lot, data.quantity, data.unit, batch.sale_price).lastInsertRowid;
  db.prepare("INSERT INTO inventory_adjustments (inventory_id, delta, reason, note, ref) VALUES (?,?,?,?,?)").run(lotId, data.quantity, 'harvest', `Harvest of ${batch.crop_name}`, lot);
  if (['planned', 'sown', 'germinating', 'growing'].includes(batch.stage)) db.prepare("UPDATE planting_batches SET stage = 'harvesting' WHERE id = ?").run(batch.id);
  return id;
}

function update(id, data) { repo.update(def(), id, data); } // only grade/notes are editable

function remove(id) {
  const h = db.prepare('SELECT * FROM harvests WHERE id = ?').get(id);
  const lot = db.prepare('SELECT * FROM produce_inventory WHERE harvest_id = ?').get(id);
  if (lot) {
    const adj = db.prepare('SELECT COUNT(*) c FROM inventory_adjustments WHERE inventory_id = ?').get(lot.id).c;
    if (adj > 1 || lot.quantity_available !== h.quantity) {
      throw new ValidationError('Part of this harvest has already been sold or adjusted, so it cannot be deleted. Record a spoilage or correction adjustment instead.');
    }
    db.prepare('DELETE FROM produce_inventory WHERE id = ?').run(lot.id);
  }
  repo.remove(def(), id);
}

module.exports = { create, update, remove };
