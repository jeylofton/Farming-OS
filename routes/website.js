const router = require('express').Router();
const { wrap, requireFeature } = require('../middleware');
const rateLimit = require('../middleware/rateLimit');
const site = require('../controllers/siteController');
const pay = require('../controllers/payController');

router.get('/', wrap(site.home));
router.get('/about', wrap(site.about));
router.get('/produce', wrap(site.produce));
router.get('/updates', wrap(site.updates));
router.get('/contact', wrap(site.contact));
router.post('/contact', requireFeature('publicInquiries'), rateLimit({ max: 8, windowMs: 15 * 60 * 1000 }), wrap(site.inquire));

router.get('/classes', requireFeature('classes'), wrap(site.classes));
router.get('/classes/confirmation/:reg', requireFeature('classes'), wrap(site.confirmation));
router.get('/classes/:slug', requireFeature('classes'), wrap(site.classDetail));
router.post('/classes/:slug/register', requireFeature('publicClassRegistration'), rateLimit({ max: 10, windowMs: 15 * 60 * 1000 }), wrap(site.register));


// Online payment (Stripe). The webhook itself is mounted in server.js because it needs the raw request body.
const payGate = requireFeature('onlinePayments');
router.get('/pay/success', payGate, wrap(pay.success));
router.get('/pay/cancelled/:kind/:id/:token', payGate, wrap(pay.cancelled));
router.post('/pay/retry/:kind/:id/:token', payGate, rateLimit({ max: 10, windowMs: 15 * 60 * 1000 }), wrap(pay.retry));

// Simulated checkout used while Stripe is not configured (404 once a Stripe key is set)
router.get('/demo-pay/:id', payGate, pay.demoOnly, wrap(pay.demoPage));
router.post('/demo-pay/:id/pay', payGate, pay.demoOnly, wrap(pay.demoPay));
router.post('/demo-pay/:id/cancel', payGate, pay.demoOnly, wrap(pay.demoCancel));

// Public produce ordering
const orderGate = [requireFeature('onlineProduceOrdering'), requireFeature('onlinePayments')];
router.get('/order', orderGate, wrap(site.orderForm));
router.post('/order', orderGate, rateLimit({ max: 6, windowMs: 15 * 60 * 1000 }), wrap(site.orderCreate));
router.get('/order/confirmation/:number/:token', orderGate, wrap(site.orderConfirmation));

module.exports = router;
