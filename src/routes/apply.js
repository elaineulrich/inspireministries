const express = require('express');
const { db } = require('../db');
const forms = require('../forms');
const apps = require('../applications');
const { getSettings } = require('../settings');

const router = express.Router();

// Small in-memory limiter for endpoints that send email.
const hits = new Map();
function limit(max, windowMs) {
  return (req, res, next) => {
    const key = `${req.ip}:${req.route.path}`;
    const now = Date.now();
    const list = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (list.length >= max) {
      return req.path.includes('/api/')
        ? res.status(429).json({ error: 'Too many requests. Please wait a few minutes and try again.' })
        : res.status(429).render('message', { title: 'Please wait', heading: 'Please wait a few minutes', body: 'Too many requests from your device. Please try again shortly.' });
    }
    list.push(now);
    hits.set(key, list);
    next();
  };
}

const meta = (req) => ({ ip: req.ip, userAgent: String(req.headers['user-agent'] || '').slice(0, 300) });
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Applicant details that the parent / pastor see at the top of their form.
function applicantSummary(app) {
  const schema = apps.studentSchema(app);
  return forms.allFields(schema)
    .filter((fd) => fd.showOnReferences)
    .map((fd) => ({ label: fd.label.replace(/^Student('s)?\s+/i, ''), value: forms.displayValue(fd, app.data) }))
    .filter((r) => r.value);
}

router.get('/student-application-online', (req, res) => {
  res.render('apply-start', { title: 'Student Application Online - Inspire Ministries', error: null, sent: req.query.sent === '1', values: {} });
});

router.post('/apply/start', limit(10, 10 * 60 * 1000), async (req, res) => {
  const settings = getSettings();
  const values = { first_name: String(req.body.first_name || '').trim(), last_name: String(req.body.last_name || '').trim(), email: String(req.body.email || '').trim() };
  if (settings.accepting_applications !== '1') return res.redirect('/student-application-online');
  if (!values.first_name || !values.last_name || !EMAIL_RE.test(values.email)) {
    return res.status(400).render('apply-start', { title: 'Student Application Online - Inspire Ministries', error: 'Please enter your first name, last name and a valid email address.', sent: false, values });
  }
  const app = apps.createApplication({ firstName: values.first_name, lastName: values.last_name, email: values.email });
  await apps.emailResumeLink(app);
  res.redirect(`/apply/${app.token}?new=1`);
});

router.post('/apply/resume', limit(5, 10 * 60 * 1000), async (req, res) => {
  const email = String(req.body.email || '').trim();
  if (EMAIL_RE.test(email)) {
    const rows = db.prepare('SELECT id FROM applications WHERE email = ? ORDER BY id DESC LIMIT 5').all(email);
    for (const row of rows) await apps.emailResumeLink(apps.getApplication(row.id));
  }
  res.redirect('/student-application-online?sent=1#resume');
});

router.get('/apply/:token', (req, res) => {
  const app = apps.getApplicationByToken(req.params.token);
  if (!app) return res.status(404).render('message', { title: 'Application not found', heading: 'Application not found', body: 'This link is not valid. Please check the link in your email, or start a new application.' });
  if (app.status === 'draft') {
    const settings = getSettings();
    if (settings.accepting_applications !== '1') {
      return res.render('message', { title: 'Applications closed', heading: 'Applications are closed', body: settings.closed_message });
    }
    const form = forms.getForm('student');
    return res.render('apply-form', {
      title: 'Student Application Form - Inspire Ministries',
      boot: { mode: 'student', token: app.token, code: app.code, form, data: app.data, step: app.current_step, isNew: req.query.new === '1', email: app.email },
    });
  }
  const refs = apps.getRefs(app.id);
  const schema = apps.studentSchema(app);
  res.render('apply-status', {
    title: 'My Application - Inspire Ministries',
    app,
    refs,
    schema,
    forms,
    STATUSES: apps.STATUSES,
    REF_STATUSES: apps.REF_STATUSES,
    flash: req.query.flash || null,
  });
});

router.put('/api/apply/:token', (req, res) => {
  const app = apps.getApplicationByToken(req.params.token);
  if (!app) return res.status(404).json({ error: 'Application not found.' });
  if (app.status !== 'draft') return res.status(409).json({ error: 'This application has already been submitted.', redirect: `/apply/${app.token}` });
  apps.saveDraft(app, req.body.data, req.body.step);
  res.json({ ok: true, savedAt: new Date().toISOString() });
});

router.post('/api/apply/:token/submit', async (req, res) => {
  const app = apps.getApplicationByToken(req.params.token);
  if (!app) return res.status(404).json({ error: 'Application not found.' });
  if (app.status !== 'draft') return res.json({ redirect: `/apply/${app.token}` });
  if (getSettings().accepting_applications !== '1') return res.status(403).json({ error: 'Applications are currently closed.' });
  const result = await apps.submitApplication(app, req.body.data, meta(req));
  if (result.errors) return res.status(422).json({ errors: result.errors });
  res.json({ redirect: `/apply/${app.token}?flash=submitted` });
});

router.post('/api/apply/:token/email-link', limit(5, 10 * 60 * 1000), async (req, res) => {
  const app = apps.getApplicationByToken(req.params.token);
  if (!app) return res.status(404).json({ error: 'Application not found.' });
  await apps.emailResumeLink(app);
  res.json({ ok: true, email: app.email });
});

router.post('/apply/:token/references/:kind/send', limit(10, 10 * 60 * 1000), async (req, res) => {
  const app = apps.getApplicationByToken(req.params.token);
  if (!app || app.status === 'draft' || !apps.REF_KINDS.includes(req.params.kind)) return res.redirect('/student-application-online');
  const email = String(req.body.email || '').trim();
  if (!EMAIL_RE.test(email)) return res.redirect(`/apply/${app.token}?flash=bad_email`);
  const ref = apps.ensureRef(app.id, req.params.kind, email);
  if (ref.status === 'completed') return res.redirect(`/apply/${app.token}`);
  await apps.sendReferenceRequest(app, ref, `${app.first_name} ${app.last_name}`, email);
  res.redirect(`/apply/${app.token}?flash=sent_${req.params.kind}`);
});

router.get('/apply/:token/references/:kind/in-person', (req, res) => {
  const app = apps.getApplicationByToken(req.params.token);
  if (!app || app.status === 'draft' || !apps.REF_KINDS.includes(req.params.kind)) return res.redirect('/student-application-online');
  const ref = apps.ensureRef(app.id, req.params.kind);
  res.redirect(`/reference/${ref.token}?in_person=1`);
});

// ---- Parent / pastor reference forms ----

router.get('/reference/:token', (req, res) => {
  const ref = apps.getRefByToken(req.params.token);
  if (!ref) return res.status(404).render('message', { title: 'Link not valid', heading: 'This link is not valid', body: 'Please check the link in your email, or contact Inspire Ministries.' });
  const app = apps.getApplication(ref.application_id);
  const studentName = `${app.first_name} ${app.last_name}`.trim();
  if (ref.status === 'completed') {
    return res.render('reference-done', { title: 'Thank you - Inspire Ministries', ref, studentName, inPerson: req.query.in_person === '1' });
  }
  const form = forms.getForm(ref.kind);
  res.render('apply-form', {
    title: `${form.title} - Inspire Ministries`,
    boot: {
      mode: ref.kind,
      token: ref.token,
      form,
      data: ref.data,
      step: ref.current_step,
      studentName,
      applicant: applicantSummary(app),
      inPerson: req.query.in_person === '1',
    },
  });
});

router.put('/api/reference/:token', (req, res) => {
  const ref = apps.getRefByToken(req.params.token);
  if (!ref) return res.status(404).json({ error: 'Reference not found.' });
  if (ref.status === 'completed') return res.status(409).json({ error: 'This reference has already been submitted.', redirect: `/reference/${ref.token}` });
  apps.saveRefDraft(ref, req.body.data, req.body.step);
  res.json({ ok: true, savedAt: new Date().toISOString() });
});

router.post('/api/reference/:token/submit', async (req, res) => {
  const ref = apps.getRefByToken(req.params.token);
  if (!ref) return res.status(404).json({ error: 'Reference not found.' });
  const inPerson = req.body.inPerson === true;
  if (ref.status === 'completed') return res.json({ redirect: `/reference/${ref.token}${inPerson ? '?in_person=1' : ''}` });
  const result = await apps.submitReference(ref, req.body.data, { ...meta(req), inPerson });
  if (result.errors) return res.status(422).json({ errors: result.errors });
  res.json({ redirect: `/reference/${ref.token}${inPerson ? '?in_person=1' : ''}` });
});

module.exports = router;
