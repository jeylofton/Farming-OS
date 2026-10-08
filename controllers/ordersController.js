const ordersRepo = require('../data/repositories/ordersRepo');
const inventoryRepo = require('../data/repositories/inventoryRepo');
const repo = require('../data/repositories/resourceRepo');
const orderService = require('../services/orderService');
const payments = require('../services/paymentService');
const config = require('../config');
const { flash, notFound } = require('../middleware');

exports.list = (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const q = String(req.query.q || '').trim().slice(0, 80);
  const status = String(req.query.status || '');
  const r = ordersRepo.list({ q, status, page, perPage: config.perPage });
  res.page('admin/orders/index', { pageTitle: 'Orders & Sales', ...r, page, pages: Math.max(1, Math.ceil(r.total / config.perPage)), q, status, query: req.query,
    actions: [{ href: '/admin/orders/new', label: 'New order', icon: 'plus-lg', cls: 'primary' }] });
};

exports.newForm = (req, res) => {
  res.page('admin/orders/form', {
    pageTitle: 'New Order', customers: repo.refOptions({ table: 'customers', label: "name || COALESCE(' – ' || phone, '')", where: 'archived = 0' }),
    lots: inventoryRepo.orderable(), preCustomer: Number(req.query.customer_id) || '', taxRate: Number(require('../data/repositories/settingsRepo').get('tax_rate')) || 0,
    scripts: ['order-form'],
  });
};

exports.create = (req, res) => {
  const id = orderService.create(req.body);
  flash(req, 'success', 'Order created and stock reserved.');
  res.redirect(`/admin/orders/${id}`);
};

exports.show = (req, res) => {
  const o = ordersRepo.get(Number(req.params.id));
  if (!o) return notFound(req, res);
  res.page('admin/orders/show', { pageTitle: o.order_number, o, nextStatuses: orderService.STATUS_FLOW[o.status], payments: payments.forRecord('order', o.id), methods: payments.METHODS });
};

exports.status = (req, res) => {
  orderService.setStatus(Number(req.params.id), String(req.body.status || ''));
  flash(req, 'success', 'Order status updated.');
  res.redirect(`/admin/orders/${req.params.id}`);
};

exports.update = (req, res) => {
  orderService.updateDetails(Number(req.params.id), req.body);
  flash(req, 'success', 'Order details saved.');
  res.redirect(`/admin/orders/${req.params.id}`);
};
