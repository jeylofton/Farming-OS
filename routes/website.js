const router = require('express').Router();
const { wrap, requireFeature } = require('../middleware');
const rateLimit = require('../middleware/rateLimit');
const site = require('../controllers/siteController');

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

module.exports = router;
