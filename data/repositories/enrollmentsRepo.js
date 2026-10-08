const db = require('../adapters');

const roster = (sessionId) => db.prepare(`SELECT e.*, s.name AS student_name, s.email AS student_email, s.phone AS student_phone
  FROM enrollments e JOIN students s ON s.id = e.student_id WHERE e.session_id = ? ORDER BY e.status = 'cancelled', e.status = 'waitlisted', e.id`).all(sessionId);

function list({ q = '', status = '', session = '', page = 1, perPage = 15 } = {}) {
  const where = [];
  const params = [];
  if (q) { where.push('(e.reg_number LIKE ? OR s.name LIKE ? OR s.email LIKE ?)'); params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  if (status) { where.push('e.status = ?'); params.push(status); }
  if (session) { where.push('e.session_id = ?'); params.push(session); }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const from = `FROM enrollments e JOIN students s ON s.id = e.student_id JOIN class_sessions cs ON cs.id = e.session_id JOIN courses c ON c.id = cs.course_id ${w}`;
  const total = db.prepare(`SELECT COUNT(*) c ${from}`).get(...params).c;
  const rows = db.prepare(`SELECT e.*, s.name AS student_name, s.email AS student_email, cs.starts_at, c.title AS course_title ${from} ORDER BY e.id DESC LIMIT ? OFFSET ?`).all(...params, perPage, (page - 1) * perPage);
  return { rows, total };
}

const forStudent = (studentId) => db.prepare(`SELECT e.*, cs.starts_at, c.title AS course_title FROM enrollments e JOIN class_sessions cs ON cs.id = e.session_id JOIN courses c ON c.id = cs.course_id WHERE e.student_id = ? ORDER BY cs.starts_at DESC`).all(studentId);
const byReg = (reg) => db.prepare(`SELECT e.reg_number, e.status, cs.starts_at, cs.location, c.title, c.slug FROM enrollments e JOIN class_sessions cs ON cs.id = e.session_id JOIN courses c ON c.id = cs.course_id WHERE e.reg_number = ?`).get(reg);
const sessionsFor = (courseId) => db.prepare(`SELECT s.*, (SELECT COUNT(*) FROM enrollments e WHERE e.session_id = s.id AND e.status IN ('registered','completed')) AS enrolled
  FROM class_sessions s WHERE s.course_id = ? ORDER BY s.starts_at DESC`).all(courseId);

// Public catalog: published courses with their open upcoming sessions.
function publicCatalog() {
  const courses = db.prepare('SELECT * FROM courses WHERE published = 1 AND archived = 0 ORDER BY title COLLATE NOCASE').all();
  const sess = db.prepare(`SELECT s.*, (SELECT COUNT(*) FROM enrollments e WHERE e.session_id = s.id AND e.status IN ('registered','completed')) AS enrolled
    FROM class_sessions s WHERE s.course_id = ? AND s.status = 'scheduled' AND s.starts_at >= datetime('now','localtime') ORDER BY s.starts_at`);
  return courses.map((c) => ({ ...c, sessions: sess.all(c.id) }));
}
const courseBySlug = (slug) => {
  const c = db.prepare('SELECT * FROM courses WHERE slug = ? AND published = 1 AND archived = 0').get(slug);
  if (!c) return null;
  c.sessions = db.prepare(`SELECT s.*, (SELECT COUNT(*) FROM enrollments e WHERE e.session_id = s.id AND e.status IN ('registered','completed')) AS enrolled
    FROM class_sessions s WHERE s.course_id = ? AND s.status = 'scheduled' AND s.starts_at >= datetime('now','localtime') ORDER BY s.starts_at`).all(c.id);
  return c;
};

module.exports = { roster, list, forStudent, byReg, sessionsFor, publicCatalog, courseBySlug };
