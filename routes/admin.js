const router = require('express').Router();
const { wrap, requireFeature } = require('../middleware');
const admin = require('../controllers/adminController');
const orders = require('../controllers/ordersController');
const inventory = require('../controllers/inventoryController');
const classes = require('../controllers/classesController');
const rc = require('../controllers/resourceController');

router.get('/', wrap(admin.dashboard));
router.get('/calendar', wrap(admin.calendar));
router.get('/reports', wrap(admin.reports));
router.get('/settings', wrap(admin.settings));
router.post('/settings', wrap(admin.settingsSave));
router.get('/content', wrap(admin.content));
router.post('/content', wrap(admin.contentSave));
router.get('/inquiries', wrap(admin.inquiries));
router.post('/inquiries/:id/status', wrap(admin.inquiryStatus));
router.post('/inquiries/:id/delete', wrap(admin.inquiryDelete));
router.post('/tasks/:id/toggle', wrap(admin.taskToggle));

// Inventory lots (created by recording harvests)
router.get('/inventory', wrap(inventory.list));
router.get('/inventory/:id', wrap(inventory.show));
router.post('/inventory/:id/adjust', wrap(inventory.adjust));
router.post('/inventory/:id/listing', wrap(inventory.listing));

// Orders & sales
const orderGate = requireFeature('produceOrders');
router.get('/orders', orderGate, wrap(orders.list));
router.get('/orders/new', orderGate, wrap(orders.newForm));
router.post('/orders', orderGate, wrap(orders.create));
router.get('/orders/:id', orderGate, wrap(orders.show));
router.post('/orders/:id', orderGate, wrap(orders.update));
router.post('/orders/:id/status', orderGate, wrap(orders.status));

// Class sessions, registrations and payments
const classGate = requireFeature('classes');
router.get('/enrollments', classGate, wrap(classes.list));
router.post('/classes/:id/enroll', classGate, wrap(classes.enroll));
router.post('/classes/:id/complete', classGate, wrap(classes.complete));
router.post('/classes/:id/cancel', classGate, wrap(classes.cancelSession));
router.post('/enrollments/:id/cancel', classGate, wrap(classes.cancelEnrollment));
router.post('/enrollments/:id/attendance', classGate, wrap(classes.attendance));
router.post('/enrollments/:id/feedback', classGate, wrap(classes.feedback));
router.post('/payments/:kind/:id', wrap(classes.payment));

// Standard CRUD for every registry resource (crops, plantings, classes, students, supplies, ...).
router.get('/:resource', wrap(rc.list));
router.get('/:resource/new', wrap(rc.newForm));
router.post('/:resource', rc.uploadMw, wrap(rc.create));
router.get('/:resource/:id', wrap(rc.show));
router.get('/:resource/:id/edit', wrap(rc.editForm));
router.post('/:resource/:id', rc.uploadMw, wrap(rc.update));
router.post('/:resource/:id/archive', wrap(rc.archive));
router.post('/:resource/:id/delete', wrap(rc.remove));

module.exports = router;
