// Generic repository driven by config/resources.js. All SQL fragments come from that trusted config;
// every user-supplied value is bound as a parameter. Stage 2 swaps the adapter, not this contract.
const db = require('../adapters');
const { ValidationError } = require('../../lib/validate');

function buildWhere(def, { q = '', filters = {}, archived = false } = {}) {
  const where = [];
  const params = [];
  if (def.archivable) where.push(`r.archived = ${archived ? 1 : 0}`);
  if (q && def.searchCols) {
    where.push('(' + def.searchCols.map((c) => `${c} LIKE ?`).join(' OR ') + ')');
    def.searchCols.forEach(() => params.push(`%${q}%`));
  }
  for (const flt of def.filters || []) {
    const v = filters[flt.name];
    if (v === undefined || v === '') continue;
    if (flt.special === 'when') {
      if (v === 'upcoming') where.push("r.starts_at >= date('now','localtime')");
      else if (v === 'past') where.push("r.starts_at < date('now','localtime')");
    } else { where.push(flt.where); params.push(v); }
  }
  return { sql: where.length ? 'WHERE ' + where.join(' AND ') : '', params };
}

function list(def, { q = '', filters = {}, archived = false, page = 1, perPage = 15 } = {}) {
  const w = buildWhere(def, { q, filters, archived });
  const inner = `SELECT ${def.select} FROM ${def.from} ${w.sql}`;
  const total = db.prepare(`SELECT COUNT(*) c FROM (${inner})`).get(...w.params).c;
  const sum = def.totalColumn ? db.prepare(`SELECT COALESCE(SUM(${def.totalColumn}),0) s FROM (${inner})`).get(...w.params).s : null;
  const rows = db.prepare(`${inner} ORDER BY ${def.order} LIMIT ? OFFSET ?`).all(...w.params, perPage, (page - 1) * perPage);
  return { rows, total, sum };
}

const get = (def, id) => db.prepare(`SELECT ${def.select} FROM ${def.from} WHERE r.id = ?`).get(id);

const colsOf = (def, data) => def.fields.filter((f) => f.name in data).map((f) => f.name);

function guard(fn) {
  try { return fn(); } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') throw new ValidationError('That value is already used by another record and must be unique.');
    if (e.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') throw new ValidationError('This record is used elsewhere. Archive it instead of deleting it.');
    if (e.code && e.code.startsWith('SQLITE_CONSTRAINT')) throw new ValidationError('That change is not allowed (a value is out of range or missing).');
    throw e;
  }
}

function insert(def, data) {
  const cols = colsOf(def, data);
  return guard(() => db.prepare(`INSERT INTO ${def.table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...cols.map((c) => data[c])).lastInsertRowid);
}
function update(def, id, data) {
  const cols = colsOf(def, data);
  if (!cols.length) return;
  guard(() => db.prepare(`UPDATE ${def.table} SET ${cols.map((c) => c + ' = ?').join(', ')} WHERE id = ?`).run(...cols.map((c) => data[c]), id));
}
const remove = (def, id) => guard(() => db.prepare(`DELETE FROM ${def.table} WHERE id = ?`).run(id));
const setArchived = (def, id, v) => db.prepare(`UPDATE ${def.table} SET archived = ? WHERE id = ?`).run(v ? 1 : 0, id);

// Options for ref selects. The current value is always included so editing an archived record still works.
function refOptions(ref, current) {
  const where = ref.where ? `(${ref.where})` : '1=1';
  const extra = current ? ' OR id = ?' : '';
  return db.prepare(`SELECT id, ${ref.label} AS label FROM ${ref.table} WHERE ${where}${extra} ORDER BY label COLLATE NOCASE`).all(...(current ? [current] : []));
}
const exists = (table, id) => !!db.prepare(`SELECT 1 FROM ${table} WHERE id = ?`).get(id);

module.exports = { list, get, insert, update, remove, setArchived, refOptions, exists, transaction: (fn) => db.transaction(fn) };
