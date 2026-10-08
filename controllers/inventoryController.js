const inventoryRepo = require('../data/repositories/inventoryRepo');
const inventoryService = require('../services/inventoryService');
const config = require('../config');
const { flash, notFound } = require('../middleware');

exports.list = (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const q = String(req.query.q || '').trim().slice(0, 80);
  const show = ['available', 'empty', 'all'].includes(req.query.show) ? req.query.show : 'available';
  const r = inventoryRepo.list({ q, show, page, perPage: config.perPage });
  res.page('admin/inventory/index', { pageTitle: 'Produce Inventory', ...r, page, pages: Math.max(1, Math.ceil(r.total / config.perPage)), q, show, query: req.query,
    actions: [{ href: '/admin/harvests/new', label: 'Record harvest', icon: 'basket', cls: 'primary' }] });
};

exports.show = (req, res) => {
  const lot = inventoryRepo.get(Number(req.params.id));
  if (!lot) return notFound(req, res);
  res.page('admin/inventory/show', { pageTitle: `Lot ${lot.lot_code}`, lot, reasons: inventoryService.REASON_LABELS });
};

exports.adjust = (req, res) => {
  inventoryService.adjust(Number(req.params.id), req.body);
  flash(req, 'success', 'Inventory adjusted.');
  res.redirect(`/admin/inventory/${req.params.id}`);
};

exports.listing = (req, res) => {
  inventoryService.setListing(Number(req.params.id), req.body);
  flash(req, 'success', 'Price and listing saved.');
  res.redirect(`/admin/inventory/${req.params.id}`);
};
