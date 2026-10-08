const db = require('../adapters');

// All dated farm events inside [from, to] (inclusive, YYYY-MM-DD).
function events(from, to) {
  const ev = [];
  const add = (date, type, label, href, extra = {}) => date && ev.push({ date: String(date).slice(0, 10), type, label, href, ...extra });
  for (const t of db.prepare('SELECT id, title, due_date, done, task_type FROM farm_tasks WHERE due_date BETWEEN ? AND ?').all(from, to)) add(t.due_date, 'task', `${t.task_type}: ${t.title}`, `/admin/tasks/${t.id}`, { done: !!t.done });
  for (const b of db.prepare('SELECT b.id, b.batch_code, b.sow_date, b.transplant_date, b.harvest_start, b.harvest_end, c.name FROM planting_batches b JOIN crops c ON c.id = b.crop_id WHERE b.archived = 0').all()) {
    const link = `/admin/plantings/${b.id}`;
    if (b.sow_date >= from && b.sow_date <= to) add(b.sow_date, 'sow', `Sow ${b.name} (${b.batch_code})`, link);
    if (b.transplant_date >= from && b.transplant_date <= to) add(b.transplant_date, 'transplant', `Transplant ${b.name} (${b.batch_code})`, link);
    if (b.harvest_start >= from && b.harvest_start <= to) add(b.harvest_start, 'harvest', `Harvest window opens: ${b.name} (${b.batch_code})`, link);
    if (b.harvest_end >= from && b.harvest_end <= to) add(b.harvest_end, 'harvest', `Harvest window closes: ${b.name} (${b.batch_code})`, link);
  }
  for (const s of db.prepare("SELECT s.id, s.starts_at, c.title FROM class_sessions s JOIN courses c ON c.id = s.course_id WHERE s.status != 'cancelled' AND date(s.starts_at) BETWEEN ? AND ?").all(from, to)) add(s.starts_at, 'class', `Class: ${s.title}`, `/admin/classes/${s.id}`, { time: s.starts_at.slice(11, 16) });
  for (const e of db.prepare('SELECT id, name, next_maintenance FROM equipment WHERE archived = 0 AND next_maintenance BETWEEN ? AND ?').all(from, to)) add(e.next_maintenance, 'maintenance', `Maintenance: ${e.name}`, `/admin/equipment/${e.id}`);
  return ev;
}

module.exports = { events };
