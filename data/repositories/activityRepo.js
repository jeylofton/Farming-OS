const db = require('../adapters');

const log = (action, detail = '', actor = 'system') => db.prepare('INSERT INTO activity_log (action, detail, actor) VALUES (?,?,?)').run(action, String(detail).slice(0, 300), actor);
const recent = (limit = 8) => db.prepare('SELECT * FROM activity_log ORDER BY id DESC LIMIT ?').all(limit);

module.exports = { log, recent };
