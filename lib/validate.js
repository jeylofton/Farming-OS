// Server-side validation shared by every service. Owner-entered text is stored as plain text and
// always escaped on output (EJS <%= %>), so no field is ever treated as executable HTML.
class ValidationError extends Error {}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}$/;

function isRealDate(s) {
  if (!DATE_RE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

const clean = (v, max = 200) => String(v == null ? '' : v).replace(/\r\n/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);

function num(v, label, { min = 0, max = 1e9, required = false, integer = false } = {}) {
  if (v === '' || v == null) { if (required) throw new ValidationError(`${label} is required.`); return null; }
  const n = Number(v);
  if (!Number.isFinite(n)) throw new ValidationError(`${label} must be a number.`);
  if (integer && !Number.isInteger(n)) throw new ValidationError(`${label} must be a whole number.`);
  if (n < min) throw new ValidationError(`${label} cannot be less than ${min}.`);
  if (n > max) throw new ValidationError(`${label} is too large.`);
  return n;
}

function date(v, label, { required = false } = {}) {
  const s = clean(v, 10);
  if (!s) { if (required) throw new ValidationError(`${label} is required.`); return null; }
  if (!isRealDate(s)) throw new ValidationError(`${label} must be a valid date.`);
  return s;
}

function dateTime(v, label, { required = false } = {}) {
  const s = clean(v, 16);
  if (!s) { if (required) throw new ValidationError(`${label} is required.`); return null; }
  if (!DATETIME_RE.test(s) || !isRealDate(s.slice(0, 10))) throw new ValidationError(`${label} must be a valid date and time.`);
  return s.replace('T', ' ');
}

const email = (v, label = 'Email', required = false) => {
  const s = clean(v, 120);
  if (!s) { if (required) throw new ValidationError(`${label} is required.`); return ''; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw new ValidationError(`${label} is not a valid email address.`);
  return s;
};

const oneOf = (v, list, label) => {
  const s = clean(v, 60);
  if (!list.includes(s)) throw new ValidationError(`${label} has an invalid value.`);
  return s;
};

const required = (v, label, max = 200) => {
  const s = clean(v, max);
  if (!s) throw new ValidationError(`${label} is required.`);
  return s;
};

module.exports = { ValidationError, clean, num, date, dateTime, email, oneOf, required, isRealDate };
