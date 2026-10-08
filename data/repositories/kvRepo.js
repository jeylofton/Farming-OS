// Key/value tables (settings, website_content) with defaults, so unset keys always render.
const db = require('../adapters');

module.exports = (table, DEFAULTS) => ({
  DEFAULTS,
  all() {
    const out = { ...DEFAULTS };
    for (const r of db.prepare(`SELECT key, value FROM ${table}`).all()) out[r.key] = r.value;
    return out;
  },
  get(key) { const r = db.prepare(`SELECT value FROM ${table} WHERE key = ?`).get(key); return r ? r.value : DEFAULTS[key]; },
  setMany(obj) {
    const up = db.prepare(`INSERT INTO ${table} (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`);
    db.transaction(() => { for (const [k, val] of Object.entries(obj)) if (k in DEFAULTS) up.run(k, String(val)); })();
  },
});
