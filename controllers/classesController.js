// Actions on class sessions and registrations (the roster lives on the session detail page).
const enrollments = require('../data/repositories/enrollmentsRepo');
const repo = require('../data/repositories/resourceRepo');
const svc = require('../services/enrollmentService');
const payments = require('../services/paymentService');
const config = require('../config');
const { flash } = require('../middleware');

const back = (req, fallback) => {
  const b = String(req.body.back || '');
  return b.startsWith('/admin/') && !b.startsWith('//') ? b : fallback;
};

exports.enroll = (req, res) => {
  const r = svc.register({ ...req.body, session_id: Number(req.params.id), source: 'admin' });
  flash(req, r.status === 'waitlisted' ? 'warning' : 'success', r.status === 'waitlisted' ? `Class is full: added to the waitlist as ${r.reg_number}.` : `Registered as ${r.reg_number}. (Confirmation email is simulated in Stage 1.)`);
  res.redirect(`/admin/classes/${req.params.id}`);
};
exports.complete = (req, res) => { svc.completeSession(Number(req.params.id)); flash(req, 'success', 'Class marked complete.'); res.redirect(`/admin/classes/${req.params.id}`); };
exports.cancelSession = (req, res) => { svc.cancelSession(Number(req.params.id)); flash(req, 'warning', 'Class cancelled. Registrations were cancelled; refund any paid registrations from the roster.'); res.redirect(`/admin/classes/${req.params.id}`); };

exports.cancelEnrollment = (req, res) => {
  const promoted = svc.cancel(Number(req.params.id), { refund: req.body.refund === '1' });
  flash(req, 'success', 'Registration cancelled.' + (promoted ? ` ${promoted} waitlisted student(s) moved into the class.` : ''));
  res.redirect(back(req, '/admin/enrollments'));
};
exports.attendance = (req, res) => { svc.setAttendance(Number(req.params.id), String(req.body.attendance || '')); res.redirect(back(req, '/admin/enrollments')); };
exports.feedback = (req, res) => { svc.setFeedback(Number(req.params.id), req.body); flash(req, 'success', 'Notes saved.'); res.redirect(back(req, '/admin/enrollments')); };

exports.list = (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const q = String(req.query.q || '').trim().slice(0, 80);
  const status = String(req.query.status || '');
  const session = Number(req.query.session) || '';
  const r = enrollments.list({ q, status, session, page, perPage: config.perPage });
  res.page('admin/enrollments/index', { pageTitle: 'Registrations', ...r, page, pages: Math.max(1, Math.ceil(r.total / config.perPage)), q, status, session, query: req.query,
    sessions: repo.refOptions({ table: 'class_sessions', label: "(SELECT title FROM courses WHERE courses.id = course_id) || ' – ' || substr(starts_at, 1, 16)" }).reverse() });
};

// Payments for both orders and registrations.
exports.payment = (req, res) => {
  const kind = req.params.kind;
  payments.record(kind, Number(req.params.id), req.body);
  flash(req, 'success', req.body.type === 'refund' ? 'Refund recorded.' : 'Payment recorded.');
  res.redirect(back(req, '/admin'));
};
