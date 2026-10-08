// Related data shown beneath a record's detail page (views/admin/extras/<name>.ejs).
const db = require('../data/adapters');
const ordersRepo = require('../data/repositories/ordersRepo');
const enrollments = require('../data/repositories/enrollmentsRepo');
const repo = require('../data/repositories/resourceRepo');
const { resources } = require('../config/resources');
const payments = require('../services/paymentService');

const loaders = {
  crop: (row) => ({
    batches: db.prepare("SELECT b.*, p.name AS plot_name FROM planting_batches b LEFT JOIN plots p ON p.id = b.plot_id WHERE b.crop_id = ? AND b.archived = 0 ORDER BY b.id DESC").all(row.id),
    lots: db.prepare('SELECT * FROM produce_inventory WHERE crop_id = ? AND quantity_available > 0 ORDER BY id DESC').all(row.id),
  }),
  plot: (row) => ({ batches: db.prepare('SELECT b.*, c.name AS crop_name FROM planting_batches b JOIN crops c ON c.id = b.crop_id WHERE b.plot_id = ? ORDER BY b.sow_date DESC, b.id DESC').all(row.id) }),
  planting: (row) => ({
    tasks: db.prepare('SELECT t.*, s.name AS staff_name FROM farm_tasks t LEFT JOIN staff s ON s.id = t.assigned_to WHERE t.batch_id = ? ORDER BY t.done, t.due_date').all(row.id),
    harvests: db.prepare('SELECT * FROM harvests WHERE batch_id = ? ORDER BY harvested_on DESC, id DESC').all(row.id),
  }),
  customer: (row) => ({ orders: ordersRepo.forCustomer(row.id) }),
  course: (row) => ({ sessions: enrollments.sessionsFor(row.id) }),
  student: (row) => ({ history: enrollments.forStudent(row.id) }),
  session: (row) => ({
    roster: enrollments.roster(row.id),
    students: repo.refOptions({ table: 'students', label: "name || COALESCE(' <' || email || '>', '')", where: 'archived = 0' }),
    paymentMethods: payments.METHODS,
  }),
};

const actionMakers = {
  crop: (def, row) => [{ href: `/admin/plantings/new?crop_id=${row.id}`, label: 'New planting', icon: 'plus-lg', cls: 'primary' }],
  plot: (def, row) => [{ href: `/admin/plantings/new?plot_id=${row.id}`, label: 'New planting here', icon: 'plus-lg', cls: 'primary' }],
  planting: (def, row) => [
    { href: `/admin/harvests/new?batch_id=${row.id}`, label: 'Record harvest', icon: 'basket', cls: 'success' },
    { href: `/admin/tasks/new?batch_id=${row.id}`, label: 'Add task', icon: 'check2-square', cls: 'outline-primary' },
  ],
  customer: (def, row) => [{ href: `/admin/orders/new?customer_id=${row.id}`, label: 'New order', icon: 'plus-lg', cls: 'primary' }],
  course: (def, row) => [{ href: `/admin/classes/new?course_id=${row.id}`, label: 'Schedule session', icon: 'calendar-plus', cls: 'primary' }],
};

module.exports = {
  load: (def, row) => ({ extra: loaders[def.extras] ? loaders[def.extras](row) : {}, extrasView: def.extras, resources }),
  actions: (def, row) => (actionMakers[def.extras] ? actionMakers[def.extras](def, row) : []),
};
