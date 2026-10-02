const express = require('express');
const { db, logActivity } = require('../db');
const forms = require('../forms');
const apps = require('../applications');
const auth = require('../auth');
const { getSettings, saveSettings, DEFAULTS } = require('../settings');
const mail = require('../mail');

const router = express.Router();
router.use(auth.sameOrigin);
router.use((req, res, next) => {
  res.locals.STATUSES = apps.STATUSES;
  res.locals.REF_STATUSES = apps.REF_STATUSES;
  res.locals.KIND_LABELS = forms.KIND_LABELS;
  res.locals.flash = req.query.flash || null;
  next();
});

// ---- Sign in ----

const loginAttempts = new Map();
router.get('/login', (req, res) => {
  if (req.admin) return res.redirect('/admin');
  res.render('admin/login', { title: 'Admin sign in', error: null, next: req.query.next || '/admin', email: '' });
});

router.post('/login', (req, res) => {
  const email = String(req.body.email || '').trim();
  const next = String(req.body.next || '/admin');
  const safeNext = next.startsWith('/admin') ? next : '/admin';
  const now = Date.now();
  const attempts = (loginAttempts.get(req.ip) || []).filter((t) => now - t < 15 * 60 * 1000);
  if (attempts.length >= 10) {
    return res.status(429).render('admin/login', { title: 'Admin sign in', error: 'Too many attempts. Please wait 15 minutes.', next: safeNext, email });
  }
  const admin = db.prepare('SELECT * FROM admins WHERE email = ?').get(email);
  if (!admin || !auth.verifyPassword(String(req.body.password || ''), admin.password_hash)) {
    attempts.push(now);
    loginAttempts.set(req.ip, attempts);
    return res.status(401).render('admin/login', { title: 'Admin sign in', error: 'Incorrect email or password.', next: safeNext, email });
  }
  auth.login(res, admin.id, req.secure);
  res.redirect(safeNext);
});

router.post('/logout', (req, res) => {
  auth.logout(req, res);
  res.redirect('/admin/login');
});

router.use(auth.requireAdmin);

// ---- Applications ----

const SORTS = {
  newest: 'a.updated_at DESC',
  oldest: 'a.created_at ASC',
  name: 'a.last_name COLLATE NOCASE, a.first_name COLLATE NOCASE',
  submitted: 'a.submitted_at IS NULL, a.submitted_at DESC',
};

router.get('/', (req, res) => {
  const q = String(req.query.q || '').trim();
  const status = apps.STATUSES[req.query.status] ? req.query.status : '';
  const sort = SORTS[req.query.sort] ? req.query.sort : 'newest';
  const where = [];
  const params = {};
  if (status) { where.push('a.status = @status'); params.status = status; }
  if (q) {
    where.push("(a.first_name || ' ' || a.last_name LIKE @q OR a.email LIKE @q OR a.code LIKE @q)");
    params.q = `%${q}%`;
  }
  const rows = db.prepare(`
    SELECT a.id, a.code, a.first_name, a.last_name, a.email, a.status, a.created_at, a.updated_at, a.submitted_at,
      (SELECT status FROM refs WHERE application_id = a.id AND kind = 'parent') AS parent_status,
      (SELECT status FROM refs WHERE application_id = a.id AND kind = 'pastor') AS pastor_status
    FROM applications a ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY ${SORTS[sort]} LIMIT 500`).all(params);
  const counts = Object.fromEntries(db.prepare('SELECT status, COUNT(*) n FROM applications GROUP BY status').all().map((r) => [r.status, r.n]));
  res.render('admin/dashboard', { title: 'Applications', rows, counts, q, status, sort, total: Object.values(counts).reduce((a, b) => a + b, 0) });
});

function loadApp(req, res, next) {
  const app = apps.getApplication(Number(req.params.id));
  if (!app) return res.status(404).render('admin/message', { title: 'Not found', heading: 'Application not found', body: '' });
  req.app_ = app;
  next();
}

function detailModel(app) {
  const refs = apps.getRefs(app.id);
  return {
    app,
    schema: apps.studentSchema(app),
    refs: apps.REF_KINDS.map((kind) => {
      const ref = refs.find((r) => r.kind === kind);
      return { kind, label: forms.KIND_LABELS[kind], ref, schema: ref ? apps.refSchema(ref) : null };
    }),
    notes: db.prepare('SELECT * FROM notes WHERE application_id = ? ORDER BY id DESC').all(app.id),
    activity: db.prepare('SELECT * FROM activity WHERE application_id = ? ORDER BY id DESC').all(app.id),
    emails: db.prepare('SELECT id, to_address, subject, status, created_at FROM emails WHERE application_id = ? ORDER BY id DESC').all(app.id),
    forms,
    baseUrl: mail.baseUrl(),
  };
}

router.get('/applications/:id', loadApp, (req, res) => {
  res.render('admin/application', { title: `${req.app_.first_name} ${req.app_.last_name}`, ...detailModel(req.app_) });
});

router.get('/applications/:id/print', loadApp, (req, res) => {
  res.render('admin/print', { title: `Application ${req.app_.code}`, ...detailModel(req.app_) });
});

router.post('/applications/:id/status', loadApp, (req, res) => {
  const status = req.body.status;
  if (!apps.STATUSES[status] || status === 'draft') return res.redirect(`/admin/applications/${req.app_.id}`);
  db.prepare("UPDATE applications SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, req.app_.id);
  logActivity(req.app_.id, req.admin.name, `Changed status to "${apps.STATUSES[status]}"`);
  res.redirect(`/admin/applications/${req.app_.id}?flash=status`);
});

router.post('/applications/:id/reopen', loadApp, (req, res) => {
  db.prepare("UPDATE applications SET status = 'draft', updated_at = datetime('now') WHERE id = ?").run(req.app_.id);
  logActivity(req.app_.id, req.admin.name, 'Re-opened the application so the student can edit it');
  res.redirect(`/admin/applications/${req.app_.id}?flash=reopened`);
});

router.post('/applications/:id/notes', loadApp, (req, res) => {
  const body = String(req.body.body || '').trim().slice(0, 5000);
  if (body) db.prepare('INSERT INTO notes (application_id, admin_name, body) VALUES (?, ?, ?)').run(req.app_.id, req.admin.name, body);
  res.redirect(`/admin/applications/${req.app_.id}#notes`);
});

router.post('/applications/:id/references/:kind/send', loadApp, async (req, res) => {
  const kind = req.params.kind;
  if (!apps.REF_KINDS.includes(kind)) return res.redirect(`/admin/applications/${req.app_.id}`);
  const email = String(req.body.email || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.redirect(`/admin/applications/${req.app_.id}?flash=bad_email`);
  const ref = apps.ensureRef(req.app_.id, kind, email);
  await apps.sendReferenceRequest(req.app_, ref, req.admin.name, email);
  res.redirect(`/admin/applications/${req.app_.id}?flash=sent`);
});

router.post('/applications/:id/references/:kind/reopen', loadApp, (req, res) => {
  const ref = apps.getRef(req.app_.id, req.params.kind);
  if (ref) {
    db.prepare("UPDATE refs SET status = 'in_progress', completed_at = NULL, updated_at = datetime('now') WHERE id = ?").run(ref.id);
    if (req.app_.status === 'ready_for_review') db.prepare("UPDATE applications SET status = 'awaiting_references' WHERE id = ?").run(req.app_.id);
    logActivity(req.app_.id, req.admin.name, `Re-opened the ${ref.kind} reference for changes`);
  }
  res.redirect(`/admin/applications/${req.app_.id}?flash=ref_reopened`);
});

router.post('/applications/:id/delete', loadApp, (req, res) => {
  db.prepare('DELETE FROM applications WHERE id = ?').run(req.app_.id);
  res.redirect('/admin?flash=deleted');
});

router.get('/export.csv', (req, res) => {
  const status = apps.STATUSES[req.query.status] ? req.query.status : '';
  const rows = db.prepare(`SELECT * FROM applications ${status ? 'WHERE status = ?' : "WHERE status != 'draft'"} ORDER BY id`).all(...(status ? [status] : []));
  const studentForm = forms.getForm('student');
  const fields = forms.allFields(studentForm).filter((fd) => !['content', 'signature'].includes(fd.type));
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const header = ['Student ID', 'Status', 'Submitted', 'Parent reference', 'Pastor reference', ...fields.map((fd) => fd.label)];
  const lines = [header.map(cell).join(',')];
  for (const row of rows) {
    const app = apps.getApplication(row.id);
    const refs = apps.getRefs(app.id);
    const refStatus = (k) => apps.REF_STATUSES[refs.find((r) => r.kind === k)?.status] || '';
    lines.push([app.code, apps.STATUSES[app.status], app.submitted_at, refStatus('parent'), refStatus('pastor'), ...fields.map((fd) => forms.displayValue(fd, app.data))].map(cell).join(','));
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="applications-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(`﻿${lines.join('\r\n')}`);
});

// ---- Form builder ----

router.get('/forms', (req, res) => {
  res.render('admin/forms', { title: 'Forms', list: forms.KINDS.map((k) => forms.getForm(k)) });
});

router.get('/forms/:kind', (req, res) => {
  if (!forms.KINDS.includes(req.params.kind)) return res.redirect('/admin/forms');
  res.render('admin/form-builder', {
    title: `Edit ${forms.KIND_LABELS[req.params.kind]}`,
    kind: req.params.kind,
    boot: { kind: req.params.kind, form: forms.getForm(req.params.kind), types: forms.FIELD_TYPES, roles: forms.ROLES[req.params.kind] },
  });
});

router.put('/api/forms/:kind', (req, res) => {
  if (!forms.KINDS.includes(req.params.kind)) return res.status(404).json({ error: 'Unknown form.' });
  try {
    const form = forms.saveForm(req.params.kind, req.body.form, req.admin.name);
    res.json({ ok: true, form });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/forms/:kind/reset', (req, res) => {
  if (forms.KINDS.includes(req.params.kind)) forms.resetForm(req.params.kind, req.admin.name);
  res.redirect(`/admin/forms/${req.params.kind}?flash=reset`);
});

router.get('/forms/:kind/preview', (req, res) => {
  if (!forms.KINDS.includes(req.params.kind)) return res.redirect('/admin/forms');
  res.render('apply-form', {
    title: 'Form preview',
    boot: { mode: req.params.kind, preview: true, token: 'preview', code: '000', form: forms.getForm(req.params.kind), data: {}, step: 0, studentName: 'Sample Student', applicant: [{ label: 'Name', value: 'Sample Student' }] },
  });
});

// ---- Settings ----

router.get('/settings', (req, res) => {
  res.render('admin/settings', { title: 'Settings', values: getSettings(), smtp: mail.isConfigured(), baseUrl: mail.baseUrl() });
});

router.post('/settings', (req, res) => {
  const values = {};
  for (const key of Object.keys(DEFAULTS)) if (req.body[key] !== undefined) values[key] = String(req.body[key]).trim();
  values.accepting_applications = req.body.accepting_applications ? '1' : '0';
  values.auto_send_references = req.body.auto_send_references ? '1' : '0';
  saveSettings(values);
  res.redirect('/admin/settings?flash=saved');
});

router.post('/settings/test-email', async (req, res) => {
  await mail.sendMail({
    to: req.admin.email,
    subject: 'Test email from Inspire Ministries',
    heading: 'Email is working',
    paragraphs: ['This is a test email from the Inspire Ministries admin portal.'],
  });
  res.redirect('/admin/emails?flash=test');
});

// ---- Admin users ----

router.get('/users', (req, res) => {
  res.render('admin/users', { title: 'Admin users', users: db.prepare('SELECT id, email, name, created_at, last_login_at FROM admins ORDER BY name').all(), error: null });
});

router.post('/users', (req, res) => {
  const { email = '', name = '', password = '' } = req.body;
  const users = db.prepare('SELECT id, email, name, created_at, last_login_at FROM admins ORDER BY name').all();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || !name.trim() || password.length < 8) {
    return res.status(400).render('admin/users', { title: 'Admin users', users, error: 'Enter a name, a valid email and a password of at least 8 characters.' });
  }
  try {
    auth.createAdmin({ email, name, password });
  } catch {
    return res.status(400).render('admin/users', { title: 'Admin users', users, error: 'An admin with that email already exists.' });
  }
  res.redirect('/admin/users?flash=added');
});

router.post('/users/:id/delete', (req, res) => {
  if (Number(req.params.id) !== req.admin.id) db.prepare('DELETE FROM admins WHERE id = ?').run(Number(req.params.id));
  res.redirect('/admin/users?flash=removed');
});

router.post('/account/password', (req, res) => {
  const { current = '', password = '' } = req.body;
  const me = db.prepare('SELECT * FROM admins WHERE id = ?').get(req.admin.id);
  if (!auth.verifyPassword(current, me.password_hash) || password.length < 8) return res.redirect('/admin/users?flash=pw_error');
  db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(auth.hashPassword(password), me.id);
  res.redirect('/admin/users?flash=pw_changed');
});

// ---- Email log ----

router.get('/emails', (req, res) => {
  res.render('admin/emails', { title: 'Email log', emails: db.prepare('SELECT id, application_id, to_address, subject, status, error, created_at FROM emails ORDER BY id DESC LIMIT 300').all(), smtp: mail.isConfigured() });
});

router.get('/emails/:id', (req, res) => {
  const row = db.prepare('SELECT html FROM emails WHERE id = ?').get(Number(req.params.id));
  if (!row) return res.status(404).send('Not found');
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src * data:; style-src 'unsafe-inline'");
  res.send(row.html);
});

module.exports = router;
