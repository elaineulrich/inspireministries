const path = require('path');
const express = require('express');
const { seedForms } = require('./src/forms');
const { bootstrapAdmin, loadAdmin } = require('./src/auth');
const { getSettings } = require('./src/settings');

// SQLite stores UTC "YYYY-MM-DD HH:MM:SS"; show it in Texas time.
function formatDate(value, withTime) {
  if (!value) return '';
  const d = new Date(/Z|T/.test(value) ? value : `${value.replace(' ', 'T')}Z`);
  if (isNaN(d)) return '';
  const opts = { timeZone: process.env.TIMEZONE || 'America/Chicago', month: 'short', day: 'numeric', year: 'numeric' };
  if (withTime) Object.assign(opts, { hour: 'numeric', minute: '2-digit' });
  return d.toLocaleString('en-US', opts);
}

seedForms();
bootstrapAdmin();

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(express.static(path.join(__dirname, 'public'), { maxAge: '7d' }));
app.use(express.json({ limit: '3mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(loadAdmin);
app.use((req, res, next) => {
  res.locals.settings = getSettings();
  res.locals.path = req.path;
  res.locals.year = new Date().getFullYear();
  res.locals.fmt = formatDate;
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});

app.use(require('./src/routes/public'));
app.use(require('./src/routes/apply'));
app.use('/admin', require('./src/routes/admin'));

app.use((req, res) => res.status(404).render('message', { title: 'Page not found', heading: 'Page not found', body: 'Sorry, we could not find that page.' }));
app.use((err, req, res, next) => {
  console.error(err);
  if (req.path.includes('/api/')) return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  res.status(500).render('message', { title: 'Error', heading: 'Something went wrong', body: 'Please try again in a moment.' });
});

const port = Number(process.env.PORT || 3000);
if (require.main === module) {
  app.listen(port, () => console.log(`Inspire Ministries site running at http://localhost:${port}`));
}

module.exports = app;
