const config = require('../../config');

if (config.dbProvider !== 'sqlite') {
  throw new Error(`DB_PROVIDER "${config.dbProvider}" is not available in Stage 1. Add a Supabase/PostgreSQL adapter in Stage 2.`);
}
module.exports = require('./sqlite');
