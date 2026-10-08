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

if (require.main === module) {
  app.listen(config.port, () => console.log(`Farm Business OS demo running on port ${config.port}`));
}
module.exports = app;
