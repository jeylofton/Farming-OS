const db = require('../adapters');
const { dayStr } = require('../../lib/format');

const one = (sql, ...p) => db.prepare(sql).get(...p);
const monthStart = () => dayStr(0).slice(0, 8) + '01';

function stats() {
  const t = dayStr(0);
  const week = dayStr(7);
  const ms = monthStart();
  return {
    activePlantings: one("SELECT COUNT(*) c FROM planting_batches WHERE archived = 0 AND stage IN ('sown','germinating','growing','harvesting')").c,
    harvestsDue: one("SELECT COUNT(*) c FROM planting_batches WHERE archived = 0 AND stage IN ('growing','harvesting') AND harvest_start <= ? AND (harvest_end IS NULL OR harvest_end >= ?)", week, t).c,
    availableLots: one('SELECT COUNT(*) c FROM produce_inventory WHERE quantity_available > 0').c,
    upcomingClasses: one("SELECT COUNT(*) c FROM class_sessions WHERE status = 'scheduled' AND starts_at >= datetime('now','localtime')").c,
    registrationsMonth: one("SELECT COUNT(*) c FROM enrollments WHERE status IN ('registered','completed') AND date(created_at) >= ?", ms).c,
    seatsRemaining: one(`SELECT COALESCE(SUM(MAX(s.capacity - (SELECT COUNT(*) FROM enrollments e WHERE e.session_id = s.id AND e.status IN ('registered','completed')), 0)), 0) c
      FROM class_sessions s WHERE s.status = 'scheduled' AND s.starts_at >= datetime('now','localtime')`).c,
    pendingTasks: one('SELECT COUNT(*) c FROM farm_tasks WHERE done = 0').c,
    overdueTasks: one('SELECT COUNT(*) c FROM farm_tasks WHERE done = 0 AND due_date < ?', t).c,
    lowSupplies: one('SELECT COUNT(*) c FROM supplies WHERE archived = 0 AND quantity <= reorder_level').c,
    produceRevenue: one("SELECT COALESCE(SUM(amount),0) s FROM payments WHERE kind = 'order' AND date(paid_at) >= ?", ms).s,
    classRevenue: one("SELECT COALESCE(SUM(amount),0) s FROM payments WHERE kind = 'enrollment' AND date(paid_at) >= ?", ms).s,
    expenses: one('SELECT COALESCE(SUM(amount),0) s FROM expenses WHERE expense_date >= ?', ms).s,
    unpaid: one("SELECT COALESCE(SUM(total - amount_paid),0) s FROM produce_orders WHERE status != 'cancelled'").s
      + one("SELECT COALESCE(SUM(amount - amount_paid),0) s FROM enrollments WHERE status IN ('registered','completed')").s,
  };
}

function alerts() {
  const t = dayStr(0);
  const out = [];
  const add = (level, icon, text, href) => out.push({ level, icon, text, href });
  const overdue = one('SELECT COUNT(*) c FROM farm_tasks WHERE done = 0 AND due_date < ?', t).c;
  if (overdue) add('danger', 'exclamation-triangle', `${overdue} overdue farm task${overdue === 1 ? '' : 's'}`, '/admin/tasks?state=0');
  for (const s of db.prepare('SELECT name, quantity, unit FROM supplies WHERE archived = 0 AND quantity <= reorder_level ORDER BY name LIMIT 5').all()) add('warning', 'box-seam', `Low supply: ${s.name} (${s.quantity} ${s.unit || ''} left)`, '/admin/supplies?low=1');
  for (const b of db.prepare("SELECT id, batch_code, harvest_start FROM planting_batches WHERE archived = 0 AND stage IN ('growing','harvesting') AND harvest_start <= ? AND (harvest_end IS NULL OR harvest_end >= ?) ORDER BY harvest_start LIMIT 5").all(dayStr(7), t)) add('info', 'basket', `Harvest window open: ${b.batch_code}`, `/admin/plantings/${b.id}`);
  for (const s of db.prepare(`SELECT s.id, s.starts_at, s.capacity, c.title, (SELECT COUNT(*) FROM enrollments e WHERE e.session_id = s.id AND e.status IN ('registered','completed')) AS n
      FROM class_sessions s JOIN courses c ON c.id = s.course_id WHERE s.status = 'scheduled' AND s.starts_at BETWEEN datetime('now','localtime') AND datetime('now','localtime','+7 day') ORDER BY s.starts_at`).all()) {
    add(s.n >= s.capacity ? 'success' : 'info', 'calendar-event', `${s.title}: ${s.n}/${s.capacity} seats filled this week`, `/admin/classes/${s.id}`);
  }
  const eq = one("SELECT COUNT(*) c FROM equipment WHERE archived = 0 AND next_maintenance < ?", t).c;
  if (eq) add('warning', 'tools', `${eq} equipment item${eq === 1 ? '' : 's'} overdue for maintenance`, '/admin/equipment');
  const inq = one("SELECT COUNT(*) c FROM inquiries WHERE status = 'new'").c;
  if (inq) add('info', 'envelope', `${inq} new website inquir${inq === 1 ? 'y' : 'ies'}`, '/admin/inquiries');
  return out;
}

const upcomingTasks = () => db.prepare(`SELECT t.id, t.title, t.due_date, t.task_type, s.name AS staff_name FROM farm_tasks t LEFT JOIN staff s ON s.id = t.assigned_to WHERE t.done = 0 ORDER BY t.due_date IS NULL, t.due_date LIMIT 6`).all();
const upcomingSessions = () => db.prepare(`SELECT s.id, s.starts_at, s.capacity, c.title, (SELECT COUNT(*) FROM enrollments e WHERE e.session_id = s.id AND e.status IN ('registered','completed')) AS enrolled
  FROM class_sessions s JOIN courses c ON c.id = s.course_id WHERE s.status = 'scheduled' AND s.starts_at >= datetime('now','localtime') ORDER BY s.starts_at LIMIT 5`).all();

module.exports = { stats, alerts, upcomingTasks, upcomingSessions };
