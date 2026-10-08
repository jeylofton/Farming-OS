const path = require('path');
const fs = require('fs');
require('dotenv').config();

const root = path.join(__dirname, '..');
const config = {
  root,
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 3000,
  dbProvider: process.env.DB_PROVIDER || 'sqlite',
  dbPath: process.env.DEMO_DB_PATH || path.join(root, 'data', 'demo.db'),
  uploadPath: process.env.UPLOAD_PATH || path.join(root, 'public', 'uploads'),
  sessionSecret: process.env.SESSION_SECRET || 'dev-only-secret',
  demoUser: process.env.DEMO_USER || 'admin',
  demoPass: process.env.DEMO_PASS || 'demo1234',
  perPage: 15,
  maxUploadBytes: 3 * 1024 * 1024,
};

for (const dir of [path.dirname(config.dbPath), config.uploadPath]) fs.mkdirSync(dir, { recursive: true });
module.exports = config;
