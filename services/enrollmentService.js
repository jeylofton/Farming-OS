// Class registration. Capacity is enforced here, inside one transaction, for public and admin entry alike:
// seats can never be oversold. Overflow goes to the waitlist (if the session has one) or is rejected.
const db = require('../data/adapters');
const v = require('../lib/validate');
const { today } = require('../lib/format');
const activity = require('../data/repositories/activityRepo');
const payments = require('./paymentService');

const { ValidationError } = v;
const SEAT_STATUSES = "('registered','completed')";
const seatsTaken = (sessionId) => db.prepare(`SELECT COUNT(*) c FROM enrollments WHERE session_id = ? AND status IN ${SEAT_STATUSES}`).get(sessionId).c;

function resolveStudent(input) {
  if (input.student_id) {
    const s = db.prepare('SELECT * FROM students WHERE id = ? AND archived = 0').get(Number(input.student_id));
    if (!s) throw new ValidationError('Student not found.');
    return s.id;
  }
  const name = v.required(input.name, 'Name');
  const email = v.email(input.email, 'Email', !!input.requireEmail);
  const phone = v.clean(input.phone, 40);
  const existing = email ? db.prepare('SELECT id FROM students WHERE email = ? COLLATE NOCASE AND archived = 0').get(email) : null;
  if (existing) return existing.id;
  return db.prepare('INSERT INTO students (name, email, phone) VALUES (?,?,?)').run(name, email, phone).lastInsertRowid;
}

// input: { session_id, student_id | name/email/phone, notes, source: 'admin'|'public' }
function register(input) {
  const sessionId = Number(input.session_id);
  return db.transaction(() => {
    const s = db.prepare('SELECT s.*, c.title, c.published FROM class_sessions s JOIN courses c ON c.id = s.course_id WHERE s.id = ?').get(sessionId);
    if (!s) throw new ValidationError('That class session does not exist.');
    if (s.status !== 'scheduled') throw new ValidationError('This class is not open for registration.');
    const now = new Date();
    const start = new Date(s.starts_at.replace(' ', 'T'));
    if (start < now) throw new ValidationError('This class has already started.');
    if (input.source === 'public') {
      if (!s.published) throw new ValidationError('This class is not open for online registration.');
      if (s.deadline && today() > s.deadline) throw new ValidationError('The registration deadline for this class has passed.');
    }
    const studentId = resolveStudent({ ...input, requireEmail: input.source === 'public' });
    const dup = db.prepare("SELECT 1 FROM enrollments WHERE session_id = ? AND student_id = ? AND status IN ('registered','waitlisted')").get(sessionId, studentId);
    if (dup) throw new ValidationError('This student is already registered (or waitlisted) for this class.');
    let status = 'registered';
    if (seatsTaken(sessionId) >= s.capacity) {
      if (!s.waitlist) throw new ValidationError('Sorry, this class is full.');
      status = 'waitlisted';
    }
    const seq = db.prepare('SELECT COALESCE(MAX(id),0)+1 n FROM enrollments').get().n;
    const reg = `REG-${String(seq).padStart(4, '0')}`;
    const id = db.prepare(`INSERT INTO enrollments (reg_number, session_id, student_id, status, payment_status, amount, notes) VALUES (?,?,?,?,?,?,?)`)
      .run(reg, sessionId, studentId, status, s.price > 0 ? 'unpaid' : 'free', s.price, v.clean(input.notes, 500)).lastInsertRowid;
    // Stage 1: confirmation emails are simulated, never sent.
    activity.log(status === 'waitlisted' ? 'Waitlist joined' : 'Student registered', `${reg} – ${s.title} (simulated confirmation email, nothing sent)`, input.source === 'public' ? 'website' : 'admin');
    return { id, reg_number: reg, status };
  })();
}

// Move the earliest waitlisted students into freed seats.
function promoteWaitlist(sessionId) {
  const s = db.prepare('SELECT capacity, status FROM class_sessions WHERE id = ?').get(sessionId);
  if (!s || s.status !== 'scheduled') return 0;
  let moved = 0;
  while (seatsTaken(sessionId) < s.capacity) {
    const next = db.prepare("SELECT id, reg_number FROM enrollments WHERE session_id = ? AND status = 'waitlisted' ORDER BY id LIMIT 1").get(sessionId);
    if (!next) break;
    db.prepare("UPDATE enrollments SET status = 'registered' WHERE id = ?").run(next.id);
    activity.log('Waitlist promoted', `${next.reg_number} now registered (simulated notification)`, 'system');
    moved += 1;
  }
  return moved;
}

function cancel(id, { refund } = {}) {
  return db.transaction(() => {
    const e = db.prepare('SELECT * FROM enrollments WHERE id = ?').get(id);
    if (!e) throw new ValidationError('Registration not found.');
    if (e.status === 'cancelled') throw new ValidationError('This registration is already cancelled.');
    if (e.status === 'completed') throw new ValidationError('A completed class registration cannot be cancelled.');
    db.prepare("UPDATE enrollments SET status = 'cancelled', attendance = NULL WHERE id = ?").run(id);
    if (refund && e.amount_paid > 0) payments.record('enrollment', id, { type: 'refund', amount: e.amount_paid, method: 'other', note: 'Cancellation refund' });
    const promoted = promoteWaitlist(e.session_id);
    activity.log('Registration cancelled', e.reg_number + (refund ? ' (refunded)' : ''), 'admin');
    return promoted;
  })();
}

function setAttendance(id, value) {
  const val = value === '' ? null : v.oneOf(value, ['present', 'absent'], 'Attendance');
  const r = db.prepare("UPDATE enrollments SET attendance = ? WHERE id = ? AND status IN ('registered','completed')").run(val, id);
  if (!r.changes) throw new ValidationError('Attendance can only be recorded for registered students.');
}

function setFeedback(id, body) {
  const r = db.prepare('UPDATE enrollments SET feedback = ?, notes = ? WHERE id = ?').run(v.clean(body.feedback, 2000), v.clean(body.notes, 500), id);
  if (!r.changes) throw new ValidationError('Registration not found.');
}

function completeSession(sessionId) {
  db.transaction(() => {
    const s = db.prepare('SELECT * FROM class_sessions WHERE id = ?').get(sessionId);
    if (!s) throw new ValidationError('Session not found.');
    if (s.status !== 'scheduled') throw new ValidationError('Only a scheduled class can be marked complete.');
    db.prepare("UPDATE enrollments SET status = 'completed' WHERE session_id = ? AND status = 'registered'").run(sessionId);
    db.prepare("UPDATE class_sessions SET status = 'completed' WHERE id = ?").run(sessionId);
    activity.log('Class completed', `session #${sessionId}`, 'admin');
  })();
}

function cancelSession(sessionId) {
  db.transaction(() => {
    const s = db.prepare('SELECT * FROM class_sessions WHERE id = ?').get(sessionId);
    if (!s) throw new ValidationError('Session not found.');
    if (s.status !== 'scheduled') throw new ValidationError('Only a scheduled class can be cancelled.');
    db.prepare("UPDATE enrollments SET status = 'cancelled' WHERE session_id = ? AND status IN ('registered','waitlisted')").run(sessionId);
    db.prepare("UPDATE class_sessions SET status = 'cancelled' WHERE id = ?").run(sessionId);
    activity.log('Class cancelled', `session #${sessionId}; paid registrations need refunds`, 'admin');
  })();
}

module.exports = { register, cancel, promoteWaitlist, setAttendance, setFeedback, completeSession, cancelSession, seatsTaken };
