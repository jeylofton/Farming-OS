// Stage 1 database adapter. Stage 2 adds adapters/postgres.js behind the same repositories.
//
// Uses node-sqlite3-wasm (pure JavaScript/WebAssembly) so `npm install` never has to compile anything on the
// host. A native driver (better-sqlite3) can fail to build on shared hosting and the app then never starts (503).
// The small wrapper below keeps a better-sqlite3-style API: prepare().run/get/all(...params), transaction(), pragma().
const fs = require('fs');
const { Database } = require('node-sqlite3-wasm');
const config = require('../../config');

// This driver locks the file with a "<db>.lock" folder. A host that kills the app instead of stopping it cleanly
// leaves that folder behind, and every later start would fail with "database is locked". The app is a single
// process, so a lock found at startup is always stale: clear it. Do not run two copies on the same database file.
fs.rmSync(`${config.dbPath}.lock`, { recursive: true, force: true });
const raw = new Database(config.dbPath);
const release = () => { try { raw.close(); } catch (e) { /* already closed */ } };
process.on('exit', release);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { release(); process.exit(0); });

// The driver reports constraint failures by message only; give them the codes the repositories check.
function withCode(e) {
  const m = String((e && e.message) || '');
  if (/UNIQUE constraint failed/.test(m)) e.code = 'SQLITE_CONSTRAINT_UNIQUE';
  else if (/FOREIGN KEY constraint failed/.test(m)) e.code = 'SQLITE_CONSTRAINT_FOREIGNKEY';
  else if (/constraint failed/.test(m)) e.code = 'SQLITE_CONSTRAINT';
  return e;
}
const guard = (fn) => { try { return fn(); } catch (e) { throw withCode(e); } };

const cache = new Map(); // prepared statements are reused, never leaked
function prepare(sql) {
  let st = cache.get(sql);
  if (!st) { st = raw.prepare(sql); cache.set(sql, st); }
  return {
    run: (...p) => guard(() => st.run(p)),
    get: (...p) => guard(() => st.get(p)) || undefined,
    all: (...p) => guard(() => st.all(p)),
  };
}

let depth = 0; // nested transactions become savepoints, like better-sqlite3
function transaction(fn) {
  return (...args) => {
    const name = `sp${depth}`;
    raw.exec(depth === 0 ? 'BEGIN' : `SAVEPOINT ${name}`);
    depth += 1;
    try {
      const out = fn(...args);
      depth -= 1;
      raw.exec(depth === 0 ? 'COMMIT' : `RELEASE ${name}`);
      return out;
    } catch (e) {
      depth -= 1;
      raw.exec(depth === 0 ? 'ROLLBACK' : `ROLLBACK TO ${name}; RELEASE ${name}`);
      throw e;
    }
  };
}

const db = { prepare, transaction, exec: (sql) => guard(() => raw.exec(sql)), pragma: (p) => raw.exec(`PRAGMA ${p}`) };
db.pragma('foreign_keys = ON');

// CREATE IF NOT EXISTS only: an existing persistent demo database is never overwritten.
db.exec(`
CREATE TABLE IF NOT EXISTS staff (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'Farm hand',
  email TEXT, phone TEXT, active INTEGER NOT NULL DEFAULT 1, notes TEXT
);
CREATE TABLE IF NOT EXISTS crops (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, variety TEXT, category TEXT,
  days_to_maturity INTEGER, default_unit TEXT NOT NULL DEFAULT 'lb', sale_price REAL NOT NULL DEFAULT 0,
  listed INTEGER NOT NULL DEFAULT 1, description TEXT, photo TEXT, notes TEXT,
  archived INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS plots (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, kind TEXT NOT NULL DEFAULT 'bed',
  location TEXT, length_m REAL, width_m REAL, capacity_plants INTEGER, method TEXT,
  active INTEGER NOT NULL DEFAULT 1, notes TEXT, archived INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS planting_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT, batch_code TEXT NOT NULL UNIQUE,
  crop_id INTEGER NOT NULL REFERENCES crops(id), plot_id INTEGER REFERENCES plots(id),
  seed_source TEXT, sow_date TEXT, germination_date TEXT, transplant_date TEXT, harvest_start TEXT, harvest_end TEXT,
  qty_planted REAL, planting_method TEXT, area_sqm REAL, rows_count INTEGER,
  expected_yield REAL, yield_unit TEXT NOT NULL DEFAULT 'lb', stage TEXT NOT NULL DEFAULT 'planned',
  observations TEXT, photo TEXT, notes TEXT, archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_batches_stage ON planting_batches(stage);
CREATE INDEX IF NOT EXISTS idx_batches_harvest ON planting_batches(harvest_start);
CREATE TABLE IF NOT EXISTS farm_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, task_type TEXT NOT NULL DEFAULT 'other',
  batch_id INTEGER REFERENCES planting_batches(id) ON DELETE SET NULL, plot_id INTEGER REFERENCES plots(id) ON DELETE SET NULL,
  due_date TEXT, assigned_to INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  done INTEGER NOT NULL DEFAULT 0, completed_at TEXT, notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON farm_tasks(done, due_date);
CREATE TABLE IF NOT EXISTS harvests (
  id INTEGER PRIMARY KEY AUTOINCREMENT, batch_id INTEGER NOT NULL REFERENCES planting_batches(id),
  harvested_on TEXT NOT NULL, quantity REAL NOT NULL, unit TEXT NOT NULL DEFAULT 'lb',
  grade TEXT NOT NULL DEFAULT 'A', notes TEXT
);
CREATE TABLE IF NOT EXISTS produce_inventory (
  id INTEGER PRIMARY KEY AUTOINCREMENT, crop_id INTEGER NOT NULL REFERENCES crops(id),
  harvest_id INTEGER REFERENCES harvests(id) ON DELETE SET NULL, lot_code TEXT NOT NULL UNIQUE,
  quantity_available REAL NOT NULL DEFAULT 0 CHECK (quantity_available >= 0), unit TEXT NOT NULL DEFAULT 'lb',
  unit_price REAL NOT NULL DEFAULT 0, listed INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS inventory_adjustments (
  id INTEGER PRIMARY KEY AUTOINCREMENT, inventory_id INTEGER NOT NULL REFERENCES produce_inventory(id) ON DELETE CASCADE,
  delta REAL NOT NULL, reason TEXT NOT NULL, note TEXT, ref TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, phone TEXT, email TEXT, address TEXT, notes TEXT,
  archived INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS produce_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT, order_number TEXT NOT NULL UNIQUE,
  customer_id INTEGER NOT NULL REFERENCES customers(id), order_date TEXT NOT NULL,
  fulfillment TEXT NOT NULL DEFAULT 'pickup', requested_date TEXT,
  status TEXT NOT NULL DEFAULT 'pending', payment_status TEXT NOT NULL DEFAULT 'unpaid',
  subtotal REAL NOT NULL DEFAULT 0, tax REAL NOT NULL DEFAULT 0, total REAL NOT NULL DEFAULT 0, amount_paid REAL NOT NULL DEFAULT 0, notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_orders_status ON produce_orders(status);
CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL REFERENCES produce_orders(id) ON DELETE CASCADE,
  inventory_id INTEGER REFERENCES produce_inventory(id) ON DELETE SET NULL,
  description TEXT NOT NULL, unit TEXT NOT NULL DEFAULT 'lb', quantity REAL NOT NULL,
  unit_price REAL NOT NULL DEFAULT 0, line_total REAL NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS courses (
  id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL UNIQUE, title TEXT NOT NULL, overview TEXT,
  difficulty TEXT NOT NULL DEFAULT 'Beginner', instructor TEXT, duration_hours REAL,
  outcomes TEXT, materials TEXT, default_price REAL NOT NULL DEFAULT 0,
  published INTEGER NOT NULL DEFAULT 1, archived INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS class_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, course_id INTEGER NOT NULL REFERENCES courses(id),
  starts_at TEXT NOT NULL, ends_at TEXT, location TEXT, capacity INTEGER NOT NULL DEFAULT 10 CHECK (capacity >= 0),
  deadline TEXT, cancel_policy TEXT, price REAL NOT NULL DEFAULT 0, waitlist INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'scheduled', notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_start ON class_sessions(starts_at);
CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, phone TEXT, email TEXT, notes TEXT,
  archived INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS enrollments (
  id INTEGER PRIMARY KEY AUTOINCREMENT, reg_number TEXT NOT NULL UNIQUE,
  session_id INTEGER NOT NULL REFERENCES class_sessions(id), student_id INTEGER NOT NULL REFERENCES students(id),
  status TEXT NOT NULL DEFAULT 'registered', payment_status TEXT NOT NULL DEFAULT 'unpaid',
  amount REAL NOT NULL DEFAULT 0, amount_paid REAL NOT NULL DEFAULT 0, attendance TEXT,
  notes TEXT, feedback TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_enroll_session ON enrollments(session_id, status);
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, ref_id INTEGER NOT NULL, amount REAL NOT NULL,
  method TEXT NOT NULL DEFAULT 'cash', note TEXT, paid_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_payments_ref ON payments(kind, ref_id);
CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT, category TEXT NOT NULL, description TEXT, vendor TEXT,
  amount REAL NOT NULL CHECK (amount >= 0), expense_date TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS supplies (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'Other',
  quantity REAL NOT NULL DEFAULT 0, unit TEXT, reorder_level REAL NOT NULL DEFAULT 0, unit_cost REAL NOT NULL DEFAULT 0,
  supplier TEXT, notes TEXT, archived INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS equipment (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, kind TEXT, status TEXT NOT NULL DEFAULT 'ready',
  last_maintenance TEXT, next_maintenance TEXT, notes TEXT, archived INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS livestock (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name_tag TEXT NOT NULL, species TEXT NOT NULL, breed TEXT, housing TEXT,
  status TEXT NOT NULL DEFAULT 'healthy', notes TEXT, archived INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS farm_updates (
  id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, body TEXT, photo TEXT,
  published INTEGER NOT NULL DEFAULT 1, posted_on TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS inquiries (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT, phone TEXT, message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new', created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS website_content (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT NOT NULL, detail TEXT, actor TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
`);

module.exports = db;
