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

// A configured path that cannot be created (e.g. the placeholder /home/user/persistent from .env.example) must not
// stop the app from starting: warn and fall back to the built-in folder instead.
const ensureDir = (dir, fallback, label) => {
  try { fs.mkdirSync(dir, { recursive: true }); fs.accessSync(dir, fs.constants.W_OK); return dir; } catch (e) {
    console.warn(`WARNING: ${label} folder "${dir}" is not usable (${e.code}). Using ${fallback} instead.`);
    fs.mkdirSync(fallback, { recursive: true });
    return fallback;
  }
};
const defaultDb = path.join(root, 'data', 'demo.db');
const defaultUploads = path.join(root, 'public', 'uploads');
const dbDir = ensureDir(path.dirname(config.dbPath), path.dirname(defaultDb), 'DEMO_DB_PATH');
if (dbDir !== path.dirname(config.dbPath)) config.dbPath = defaultDb;
config.uploadPath = ensureDir(config.uploadPath, defaultUploads, 'UPLOAD_PATH');
module.exports = config;
