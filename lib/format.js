const pad = (n) => String(n).padStart(2, '0');
const toDateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toDateTimeStr = (d) => `${toDateStr(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
const today = () => toDateStr(new Date());
const addDays = (n, from = new Date()) => { const d = new Date(from); d.setDate(d.getDate() + n); return d; };
const dayStr = (n) => toDateStr(addDays(n));

const money = (n) => (Number(n) < 0 ? '-' : '') + '$' + Math.abs(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const qty = (n) => (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function date(s) {
  if (!s) return '-';
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return String(s);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}
function dateTime(s) {
  if (!s) return '-';
  const t = String(s).slice(11, 16);
  if (!t) return date(s);
  let [h, m] = t.split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${date(s)} ${h}:${pad(m)} ${ap}`;
}

// Status chips: one source of truth for labels and Bootstrap colors, used by the chip partial.
const CHIPS = {
  stage: { planned: ['Planned', 'secondary'], sown: ['Sown', 'info'], germinating: ['Germinating', 'info'], growing: ['Growing', 'primary'], harvesting: ['Harvesting', 'warning'], completed: ['Completed', 'success'], failed: ['Failed', 'danger'] },
  order: { pending: ['Pending', 'warning'], confirmed: ['Confirmed', 'primary'], ready: ['Ready', 'info'], fulfilled: ['Fulfilled', 'success'], cancelled: ['Cancelled', 'danger'] },
  payment: { unpaid: ['Unpaid', 'danger'], partial: ['Partial', 'warning'], paid: ['Paid', 'success'], refunded: ['Refunded', 'dark'], free: ['Free', 'secondary'] },
  enrollment: { registered: ['Registered', 'success'], waitlisted: ['Waitlisted', 'warning'], cancelled: ['Cancelled', 'danger'], completed: ['Completed', 'dark'] },
  attendance: { present: ['Present', 'success'], absent: ['Absent', 'danger'] },
  session: { scheduled: ['Scheduled', 'primary'], completed: ['Completed', 'dark'], cancelled: ['Cancelled', 'danger'] },
  task: { 0: ['Open', 'warning'], 1: ['Done', 'success'] },
  inquiry: { new: ['New', 'warning'], handled: ['Handled', 'secondary'] },
  flag: { 1: ['Yes', 'success'], 0: ['No', 'secondary'] },
};
const chip = (kind, value) => {
  const c = (CHIPS[kind] || {})[value];
  return c ? { label: c[0], cls: c[1] } : { label: value == null || value === '' ? '-' : String(value), cls: 'secondary' };
};

const esc = (s) => require('ejs').escapeXML(String(s == null ? '' : s));

module.exports = { esc, money, round2, qty, date, dateTime, today, addDays, dayStr, toDateStr, toDateTimeStr, chip, CHIPS };
