// Seeds clearly fictional demo data once, into a brand-new database. An existing demo database is never touched:
// the 'seeded' marker lives in the database itself, so restarts and redeploys keep the owner's changes.
const db = require('../data/adapters');
const slugify = require('../lib/slug');
const { dayStr } = require('../lib/format');
const harvestService = require('./harvestService');
const inventoryService = require('./inventoryService');
const orderService = require('./orderService');
const enrollmentService = require('./enrollmentService');
const payments = require('./paymentService');
const resourceRepo = require('../data/repositories/resourceRepo');
const { resources } = require('../config/resources');

const d = dayStr;
const run = (sql, ...p) => db.prepare(sql).run(...p).lastInsertRowid;

function seed() {
  if (db.prepare("SELECT 1 FROM settings WHERE key = 'seeded'").get()) return false;
  db.transaction(build)();
  return true;
}

function build() {
  // Staff
  const staff = {};
  for (const [name, role] of [['Maria Lopez', 'Owner'], ['Sam Carter', 'Farm hand'], ['Dana Whitfield', 'Instructor'], ['Eli Brooks', 'Seasonal']]) {
    staff[name] = run('INSERT INTO staff (name, role, email) VALUES (?,?,?)', name, role, name.split(' ')[0].toLowerCase() + '@willowcreek.example');
  }

  // Crops
  const crop = {};
  const crops = [
    ['Tomato', 'Cherokee Purple', 'Fruiting vegetable', 85, 'lb', 3.5], ['Tomato', 'Roma', 'Fruiting vegetable', 75, 'lb', 2.75],
    ['Sweet Pepper', 'California Wonder', 'Fruiting vegetable', 75, 'lb', 3.0], ['Lettuce', 'Buttercrunch', 'Leafy green', 55, 'each', 2.25],
    ['Cucumber', 'Marketmore', 'Squash & melon', 60, 'lb', 1.9], ['Kale', 'Lacinato', 'Leafy green', 60, 'bunch', 2.5],
    ['Carrot', 'Nantes', 'Root vegetable', 70, 'bunch', 2.5], ['Basil', 'Genovese', 'Herb', 60, 'bunch', 2.0],
  ];
  for (const [name, variety, cat, days, unit, price] of crops) {
    crop[name + variety] = run('INSERT INTO crops (name, variety, category, days_to_maturity, default_unit, sale_price, description) VALUES (?,?,?,?,?,?,?)',
      name, variety, cat, days, unit, price, `${variety} ${name.toLowerCase()}, grown without synthetic pesticides. (Demo description.)`);
  }

  // Growing spaces
  const plot = {};
  for (const [name, kind, loc, l, w, cap, method] of [
    ['Field A', 'field', 'North side', 40, 20, 800, 'In-ground'], ['Bed B1', 'bed', 'South garden', 6, 1.2, 40, 'Raised bed'], ['Bed B2', 'bed', 'South garden', 6, 1.2, 40, 'Raised bed'],
    ['Bed B3', 'bed', 'South garden', 6, 1.2, 40, 'Raised bed'], ['Bed B4', 'bed', 'South garden', 6, 1.2, 40, 'Raised bed'], ['Greenhouse 1', 'greenhouse', 'East yard', 20, 8, 300, 'Greenhouse'],
    ['Patio Containers', 'container', 'By the farm stand', 4, 2, 24, 'Container'],
  ]) plot[name] = run('INSERT INTO plots (name, kind, location, length_m, width_m, capacity_plants, method) VALUES (?,?,?,?,?,?,?)', name, kind, loc, l, w, cap, method);

  // Planting batches
  const batch = {};
  const mk = (code, cropKey, plotName, o) => {
    batch[code] = run(`INSERT INTO planting_batches (batch_code, crop_id, plot_id, seed_source, sow_date, germination_date, transplant_date, harvest_start, harvest_end, qty_planted, planting_method, area_sqm, rows_count, expected_yield, yield_unit, stage, observations)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, code, crop[cropKey], plot[plotName], o.seed || 'Demo Seed Co.', o.sow, o.germ || null, o.transplant || null, o.hs, o.he, o.qty, o.method, o.area || null, o.rows || null, o.exp, o.unit || 'lb', o.stage, o.obs || null);
  };
  mk('TOM-A', 'TomatoCherokee Purple', 'Greenhouse 1', { sow: d(-75), germ: d(-68), transplant: d(-45), hs: d(-10), he: d(50), qty: 120, method: 'Transplant', area: 40, rows: 6, exp: 600, stage: 'harvesting', obs: 'Drip line checked weekly; no blight so far.' });
  mk('TOM-B', 'TomatoRoma', 'Field A', { sow: d(-70), germ: d(-63), transplant: d(-40), hs: d(-3), he: d(45), qty: 200, method: 'Transplant', area: 120, rows: 8, exp: 800, stage: 'harvesting' });
  mk('PEP-A', 'Sweet PepperCalifornia Wonder', 'Bed B1', { sow: d(-60), transplant: d(-35), hs: d(5), he: d(60), qty: 36, method: 'Transplant', area: 7, rows: 3, exp: 150, stage: 'growing', obs: 'Aphids spotted on two plants; sprayed with soap solution.' });
  mk('LET-A', 'LettuceButtercrunch', 'Bed B2', { sow: d(-30), germ: d(-24), hs: d(4), he: d(20), qty: 90, method: 'Direct sow', area: 7, rows: 6, exp: 90, unit: 'each', stage: 'growing' });
  mk('CUC-A', 'CucumberMarketmore', 'Bed B3', { sow: d(-40), germ: d(-34), hs: d(-5), he: d(30), qty: 24, method: 'Direct sow', area: 7, rows: 2, exp: 200, stage: 'harvesting' });
  mk('KAL-A', 'KaleLacinato', 'Bed B4', { sow: d(7), hs: d(65), he: d(120), qty: 60, method: 'Direct sow', area: 7, rows: 4, exp: 40, unit: 'bunch', stage: 'planned' });
  mk('BAS-A', 'BasilGenovese', 'Patio Containers', { sow: d(-70), germ: d(-63), hs: d(-22), he: d(-5), qty: 24, method: 'Seedling start', exp: 55, unit: 'bunch', stage: 'completed' });
  mk('CAR-A', 'CarrotNantes', 'Field A', { sow: d(-90), germ: d(-80), hs: d(-20), he: d(-5), qty: 400, method: 'Direct sow', area: 20, rows: 10, exp: 120, unit: 'bunch', stage: 'failed', obs: 'Washed out by heavy rain; re-sow planned next season.' });

  // Harvests (each creates its inventory lot) and a couple of adjustments
  const hv = (code, date, qty, unit, grade) => harvestService.create({ batch_id: batch[code], harvested_on: date, quantity: qty, unit, grade, notes: null });
  hv('TOM-A', d(-9), 42, 'lb', 'A'); hv('TOM-A', d(-6), 55, 'lb', 'A'); hv('TOM-A', d(-2), 48, 'lb', 'A');
  hv('TOM-B', d(-3), 70, 'lb', 'A'); hv('CUC-A', d(-4), 60, 'lb', 'A'); hv('CUC-A', d(-1), 35, 'lb', 'B');
  hv('BAS-A', d(-18), 30, 'bunch', 'A'); hv('BAS-A', d(-10), 25, 'bunch', 'A');
  const lot = (code) => db.prepare("SELECT id FROM produce_inventory WHERE lot_code LIKE ? ORDER BY id").all(code + '-H%').map((r) => r.id);
  inventoryService.adjust(lot('TOM-A')[0], { reason: 'spoilage', quantity: 3, note: 'Split skins' });
  inventoryService.adjust(lot('BAS-A')[0], { reason: 'sale', quantity: 28, note: 'Saturday farm stand' });
  inventoryService.adjust(lot('BAS-A')[1], { reason: 'sale', quantity: 25, note: 'Saturday farm stand' });

  // Tasks
  const task = (title, type, due, batchCode, plotName, who, done = 0) => run('INSERT INTO farm_tasks (title, task_type, due_date, batch_id, plot_id, assigned_to, done, completed_at) VALUES (?,?,?,?,?,?,?,?)',
    title, type, due, batchCode ? batch[batchCode] : null, plotName ? plot[plotName] : null, who ? staff[who] : null, done, done ? d(-1) + ' 09:00' : null);
  task('Pick ripe Cherokee Purple tomatoes', 'Harvesting', d(0), 'TOM-A', null, 'Sam Carter');
  task('Pick Roma tomatoes', 'Harvesting', d(1), 'TOM-B', null, 'Eli Brooks');
  task('Check pepper plants for aphids', 'Pest control', d(2), 'PEP-A', null, 'Sam Carter');
  task('Fertilize peppers', 'Fertilizing', d(-2), 'PEP-A', null, 'Sam Carter');
  task('Thin lettuce rows', 'Weeding', d(3), 'LET-A', null, 'Eli Brooks');
  task('Prepare Bed B4 for kale', 'Maintenance', d(5), 'KAL-A', 'Bed B4', 'Sam Carter');
  task('Set up classroom tables for seed starting', 'Class prep', d(4), null, null, 'Dana Whitfield');
  task('Service irrigation pump', 'Maintenance', d(8), null, null, 'Maria Lopez');
  task('Water cucumbers deeply', 'Watering', d(-1), 'CUC-A', null, 'Eli Brooks', 1);

  // Customers, orders, payments
  const cust = {};
  for (const [name, phone, email] of [['Harper Greene', '555-0101', 'harper@example.com'], ['Oakridge Bistro (demo)', '555-0102', 'orders@oakridge.example'], ['Priya Nair', '555-0103', 'priya@example.com'], ['Tom Becker', '555-0104', ''], ['Lena Ortiz', '555-0105', 'lena@example.com']]) {
    cust[name] = run('INSERT INTO customers (name, phone, email) VALUES (?,?,?)', name, phone, email);
  }
  const order = (who, items, extra = {}) => orderService.create({ customer_id: cust[who], fulfillment: extra.fulfillment || 'pickup', requested_date: extra.requested || d(1), notes: extra.notes || '', item_lot: items.map((i) => i[0]), item_qty: items.map((i) => i[1]), item_price: items.map(() => '') });
  const o1 = order('Harper Greene', [[lot('TOM-A')[1], 4], [lot('CUC-A')[0], 3]]);
  const o2 = order('Oakridge Bistro (demo)', [[lot('TOM-B')[0], 25], [lot('TOM-A')[2], 15]], { fulfillment: 'delivery', requested: d(2), notes: 'Deliver to the back door before 10am.' });
  const o3 = order('Priya Nair', [[lot('CUC-A')[1], 5]]);
  const o4 = order('Tom Becker', [[lot('TOM-A')[0], 6]], { notes: 'Demo cancelled order' });
  payments.record('order', o1, { amount: 19.7, method: 'cash' });
  payments.record('order', o2, { amount: 100, method: 'check' });
  orderService.setStatus(o1, 'confirmed'); orderService.setStatus(o1, 'ready'); orderService.setStatus(o1, 'fulfilled');
  orderService.setStatus(o2, 'confirmed');
  orderService.setStatus(o4, 'cancelled');
  void o3;

  // Courses & sessions
  const course = {};
  const courses = [
    ['Vegetable Gardening Basics', 'Beginner', 3, 45, 'Everything you need to start a productive vegetable bed: sun, soil, spacing and watering.'],
    ['Seed Starting', 'Beginner', 2.5, 30, 'Start seeds indoors, harden off seedlings and time your transplants.'],
    ['Soil Preparation', 'Beginner', 2, 25, 'Test, amend and build healthy soil for the season ahead.'],
    ['Composting', 'Beginner', 2, 0, 'Build a hot compost pile and use finished compost in your beds.'],
    ['Irrigation Essentials', 'Intermediate', 3, 40, 'Design drip and soaker systems that save water and time.'],
    ['Pest Prevention', 'Intermediate', 2.5, 35, 'Identify common pests and prevent problems without heavy spraying.'],
    ['Container Gardening', 'Beginner', 2, 30, 'Grow vegetables on a patio or balcony.'],
    ['Harvesting & Food Safety', 'Intermediate', 2, 35, 'Harvest at peak quality and handle produce safely from field to table.'],
  ];
  for (const [title, level, hours, price, overview] of courses) {
    course[title] = run(`INSERT INTO courses (slug, title, overview, difficulty, instructor, duration_hours, outcomes, materials, default_price, published) VALUES (?,?,?,?,?,?,?,?,?,1)`,
      slugify(title), title, overview, level, 'Dana Whitfield', hours, 'Understand the core steps\nLeave with a written plan\nKnow where to find help', 'Notebook and pen. Gloves and tools are provided.', price);
  }
  const session = (title, day, time, cap, o = {}) => run(`INSERT INTO class_sessions (course_id, starts_at, ends_at, location, capacity, deadline, cancel_policy, price, waitlist, status) VALUES (?,?,?,?,?,?,?,?,1,?)`,
    course[title], `${d(day)} ${time}`, `${d(day)} ${o.end || '13:00'}`, o.loc || 'Farm classroom barn', cap, o.deadline === null ? null : d(day - 2), 'Full refund up to 3 days before class.', db.prepare('SELECT default_price p FROM courses WHERE id = ?').get(course[title]).p, o.status || 'scheduled');
  const sPast = session('Vegetable Gardening Basics', -14, '10:00', 12, { deadline: null });
  const sBasics = session('Vegetable Gardening Basics', 9, '10:00', 12);
  const sSeed = session('Seed Starting', 5, '09:30', 8, { end: '12:00' });
  const sContainer = session('Container Gardening', 12, '14:00', 10, { end: '16:00' });
  session('Soil Preparation', 16, '10:00', 12); session('Composting', 23, '10:00', 15); session('Irrigation Essentials', 37, '09:00', 10, { end: '12:00' });
  session('Pest Prevention', 44, '10:00', 12); session('Harvesting & Food Safety', 51, '10:00', 12);
  session('Vegetable Gardening Basics', 30, '10:00', 12);

  // Students & registrations
  const stu = {};
  ['Ava Thompson', 'Ben Alvarez', 'Chloe Kim', 'Diego Ramos', 'Emma Fischer', 'Farid Haddad', 'Grace Liu', 'Hector Silva', 'Isla Murphy', 'Jonas Weber', 'Kira Patel', 'Leo Novak'].forEach((n) => {
    stu[n] = run('INSERT INTO students (name, email, phone) VALUES (?,?,?)', n, n.toLowerCase().replace(/ /g, '.') + '@example.com', '555-02' + String(Object.keys(stu).length).padStart(2, '0'));
  });
  const reg = (session_id, name, source = 'admin') => enrollmentService.register({ session_id, student_id: stu[name], source });
  // A completed past class with attendance
  const past = ['Ava Thompson', 'Ben Alvarez', 'Chloe Kim', 'Diego Ramos'].map((n, i) => {
    const seq = db.prepare('SELECT COALESCE(MAX(id),0)+1 n FROM enrollments').get().n;
    const id = run("INSERT INTO enrollments (reg_number, session_id, student_id, status, payment_status, amount, amount_paid, attendance, feedback) VALUES (?,?,?,?,?,?,?,?,?)",
      `REG-${String(seq).padStart(4, '0')}`, sPast, stu[n], 'registered', 'unpaid', 45, 0, i === 3 ? 'absent' : 'present', i === 0 ? 'Loved the soil section.' : null);
    payments.recompute('enrollment', id);
    if (i < 3) payments.record('enrollment', id, { amount: 45, method: 'cash' });
    return id;
  });
  void past;
  enrollmentService.completeSession(sPast);
  // Seed Starting is full with one person waitlisted, to show the waitlist.
  ['Ava Thompson', 'Emma Fischer', 'Farid Haddad', 'Grace Liu', 'Hector Silva', 'Isla Murphy', 'Jonas Weber', 'Kira Patel'].forEach((n) => reg(sSeed, n));
  const w = reg(sSeed, 'Leo Novak');
  void w;
  ['Ben Alvarez', 'Chloe Kim', 'Emma Fischer', 'Leo Novak', 'Grace Liu'].forEach((n) => reg(sBasics, n));
  reg(sContainer, 'Isla Murphy'); reg(sContainer, 'Diego Ramos');
  const paidReg = db.prepare("SELECT id FROM enrollments WHERE session_id = ? AND student_id = ?").get(sSeed, stu['Ava Thompson']).id;
  payments.record('enrollment', paidReg, { amount: 30, method: 'cash' });
  const partReg = db.prepare("SELECT id FROM enrollments WHERE session_id = ? AND student_id = ?").get(sBasics, stu['Ben Alvarez']).id;
  payments.record('enrollment', partReg, { amount: 20, method: 'check' });

  // Spread some payments over prior months so the finance report has history
  db.prepare("UPDATE payments SET paid_at = datetime('now','localtime','-34 day') WHERE id IN (1, 5)").run();
  db.prepare("UPDATE payments SET paid_at = datetime('now','localtime','-65 day') WHERE id IN (6)").run();

  // Expenses
  for (const [day, cat, desc, vendor, amt] of [
    [-3, 'Seeds', 'Fall seed order', 'Demo Seed Co.', 142.5], [-9, 'Labor', 'Seasonal helper wages', '', 480], [-14, 'Utilities', 'Water and electricity', 'County Utilities', 96.4],
    [-21, 'Soil & amendments', 'Compost, 6 cubic yards', 'Greenleaf Supply', 210], [-33, 'Equipment', 'Drip irrigation parts', 'FarmFix', 168.2], [-40, 'Packaging', 'Pint baskets and bags', 'PackRite', 54.75],
    [-48, 'Labor', 'Seasonal helper wages', '', 520], [-62, 'Class materials', 'Handouts and seed packets', 'PrintCo', 38], [-70, 'Marketing', 'Farm stand signage', '', 85],
  ]) run('INSERT INTO expenses (category, description, vendor, amount, expense_date) VALUES (?,?,?,?,?)', cat, desc, vendor, amt, d(day));

  // Supplies & equipment
  for (const [name, cat, qty, unit, reorder, cost, sup] of [
    ['Tomato cages', 'Tools', 40, 'each', 20, 3.5, 'FarmFix'], ['Compost', 'Soil', 2, 'cu yd', 3, 35, 'Greenleaf Supply'], ['Kale seed', 'Seeds', 6, 'packets', 4, 3.25, 'Demo Seed Co.'],
    ['Lettuce seed', 'Seeds', 2, 'packets', 4, 3.25, 'Demo Seed Co.'], ['Drip tape', 'Irrigation', 800, 'ft', 200, 0.18, 'FarmFix'], ['Pint baskets', 'Packaging', 150, 'each', 100, 0.22, 'PackRite'],
    ['Organic fertilizer', 'Fertilizer', 5, 'bags', 2, 24, 'Greenleaf Supply'], ['Insecticidal soap', 'Pest control', 1, 'bottles', 2, 11, 'Greenleaf Supply'],
  ]) run('INSERT INTO supplies (name, category, quantity, unit, reorder_level, unit_cost, supplier) VALUES (?,?,?,?,?,?,?)', name, cat, qty, unit, reorder, cost, sup);
  for (const [name, kind, status, last, next] of [['Walk-behind tiller', 'Tillage', 'ready', d(-60), d(-5)], ['Drip irrigation pump', 'Irrigation', 'ready', d(-30), d(8)], ['Farm truck', 'Vehicle', 'in use', d(-45), d(45)], ['Seedling heat mats', 'Greenhouse', 'ready', null, null], ['Harvest bins', 'Harvest', 'ready', null, null]]) {
    run('INSERT INTO equipment (name, kind, status, last_maintenance, next_maintenance) VALUES (?,?,?,?,?)', name, kind, status, last, next);
  }
  run('INSERT INTO livestock (name_tag, species, breed, housing) VALUES (?,?,?,?)', 'Hen flock A (12)', 'Chicken', 'Rhode Island Red', 'Coop 1'); // dormant until the livestock flag is enabled

  // Public content
  for (const [title, day, body] of [['First tomatoes of the season', -9, 'The greenhouse Cherokee Purples are finally ripe. Find them at the Saturday farm stand.'], ['Seed Starting class is nearly full', -2, 'Only the waitlist remains. Join it and we will let you know if a seat opens.'], ['New beds going in', -20, 'Bed B4 is ready for kale this fall.']]) {
    run('INSERT INTO farm_updates (title, body, posted_on, published) VALUES (?,?,?,1)', title, body, d(day));
  }
  run("INSERT INTO inquiries (name, email, message) VALUES ('Casey Rivers', 'casey@example.com', 'Do you offer school group visits?')");
  run("INSERT INTO inquiries (name, phone, message, status) VALUES ('Morgan Lee', '555-0188', 'What time does the farm stand open on Saturdays?', 'handled')");
  run("INSERT INTO activity_log (action, detail, actor) VALUES ('Demo data loaded', 'Fictional farm, students and orders', 'system')");
  run("INSERT INTO settings (key, value) VALUES ('seeded', '1')");
  void resourceRepo; void resources;
}

module.exports = { seed };
