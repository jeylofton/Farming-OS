// Deliberate, manual reset: deletes the demo database so it re-seeds on next start.
const fs = require('fs');
const config = require('../config');
for (const f of [config.dbPath, config.dbPath + '-wal', config.dbPath + '-shm']) if (fs.existsSync(f)) fs.unlinkSync(f);
console.log('Demo database removed:', config.dbPath, '- it will be re-seeded on next start.');
