const path = require('path');
const express = require('express');
const session = require('express-session');
const config = require('./config');
const { seed } = require('./services/seedService');
const mw = require('./middleware');

if (seed()) console.log('Seeded fake demo data into a new database.');

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', 1); // behind Hostinger's proxy: keeps correct protocol/host

app.use('/vendor/bootstrap', express.static(path.join(config.root, 'node_modules/bootstrap/dist')));
app.use('/vendor/icons', express.static(path.join(config.root, 'node_modules/bootstrap-icons/font')));
app.use(express.static(path.join(config.root, 'public')));
if (config.uploadPath !== path.join(config.root, 'public', 'uploads')) app.use('/uploads', express.static(config.uploadPath));

// Stripe webhook: needs the raw body for signature checking, so it is mounted before the body parsers.
app.post('/webhooks/stripe', express.raw({ type: '*/*', limit: '1mb' }), require('./controllers/payController').webhook);

app.use(mw.sameOrigin);
app.use(express.urlencoded({ extended: true, limit: '200kb' }));
app.use(session({
  secret: config.sessionSecret, resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 12, secure: 'auto' },
}));
app.use(mw.pageHelper);
app.use(mw.locals);

app.use(require('./routes/website'));
app.use(require('./routes/auth'));
app.use('/admin', mw.requireAuth, require('./routes/admin'));

app.use(mw.notFound);
app.use(mw.errorHandler);

// Always listen: Hostinger loads this file with require(), so a require.main check would leave the app dead (503).
// Only the smoke test sets NO_LISTEN so it can pick its own port.
const stripeService = require('./services/stripeService');
if (stripeService.enabled() && !stripeService.isDemo()) console.log(`Online payments: Stripe ${stripeService.mode()} mode${config.stripe.webhookSecret ? '' : ' (WARNING: STRIPE_WEBHOOK_SECRET is not set, payments cannot be confirmed)'}`);
if (stripeService.isDemo()) {
  console.log('Online payments: DEMO mode (simulated checkout, no real money). Set STRIPE_SECRET_KEY to use Stripe.');
  if (!process.env.NO_LISTEN) setInterval(() => { try { stripeService.sweepDemo(); } catch (e) { console.error(e); } }, 60 * 1000).unref();
}
if (!process.env.NO_LISTEN) app.listen(config.port, () => console.log(`Farm Business OS demo running on port ${config.port}`));
module.exports = app;
