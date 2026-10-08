const db = require('../adapters');

const yieldByBatch = () => db.prepare(`SELECT b.id, b.batch_code, b.stage, b.expected_yield, b.yield_unit, c.name AS crop_name,
  COALESCE((SELECT SUM(h.quantity) FROM harvests h WHERE h.batch_id = b.id), 0) AS actual
  FROM planting_batches b JOIN crops c ON c.id = b.crop_id WHERE b.archived = 0 AND (b.expected_yield > 0 OR EXISTS (SELECT 1 FROM harvests h WHERE h.batch_id = b.id))
  ORDER BY b.harvest_start DESC, b.id DESC LIMIT 20`).all();

// Last N calendar months (oldest first): cash received (net of refunds) vs expenses.
function monthly(n = 6) {
  const months = [];
  const d = new Date();
  d.setDate(1);
  for (let i = n - 1; i >= 0; i -= 1) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    months.push(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`);
  }
  return months.map((ym) => {
    const sum = (sql, ...p) => db.prepare(sql).get(...p).s;
    const produce = sum("SELECT COALESCE(SUM(amount),0) s FROM payments WHERE kind = 'order' AND strftime('%Y-%m', paid_at) = ?", ym);
    const classes = sum("SELECT COALESCE(SUM(amount),0) s FROM payments WHERE kind = 'enrollment' AND strftime('%Y-%m', paid_at) = ?", ym);
    const expenses = sum("SELECT COALESCE(SUM(amount),0) s FROM expenses WHERE strftime('%Y-%m', expense_date) = ?", ym);
    return { ym, produce, classes, expenses, profit: produce + classes - expenses };
  });
}

const revenueByCrop = () => db.prepare(`SELECT oi.description, SUM(oi.quantity) AS qty, SUM(oi.line_total) AS revenue
  FROM order_items oi JOIN produce_orders o ON o.id = oi.order_id WHERE o.status != 'cancelled' GROUP BY oi.description ORDER BY revenue DESC LIMIT 10`).all();

const expensesByCategory = () => db.prepare('SELECT category, SUM(amount) AS total FROM expenses GROUP BY category ORDER BY total DESC').all();

const classFill = () => db.prepare(`SELECT s.id, s.starts_at, s.capacity, s.status, c.title,
  (SELECT COUNT(*) FROM enrollments e WHERE e.session_id = s.id AND e.status IN ('registered','completed')) AS enrolled,
  (SELECT COUNT(*) FROM enrollments e WHERE e.session_id = s.id AND e.attendance = 'present') AS present
  FROM class_sessions s JOIN courses c ON c.id = s.course_id WHERE s.status != 'cancelled' ORDER BY s.starts_at DESC LIMIT 12`).all();

module.exports = { yieldByBatch, monthly, revenueByCrop, expensesByCategory, classFill };
