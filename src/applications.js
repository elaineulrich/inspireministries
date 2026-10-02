const crypto = require('crypto');
const { db, logActivity } = require('./db');
const forms = require('./forms');
const { sendMail, baseUrl, esc } = require('./mail');
const { getSettings, notificationRecipients } = require('./settings');

const STATUSES = {
  draft: 'In progress (student)',
  awaiting_references: 'Awaiting references',
  ready_for_review: 'Ready for review',
  under_review: 'Under review',
  accepted: 'Accepted',
  waitlisted: 'Waitlisted',
  declined: 'Declined',
  withdrawn: 'Withdrawn',
};
const REF_STATUSES = { pending: 'Not sent yet', sent: 'Sent — waiting', in_progress: 'In progress', completed: 'Completed' };
const REF_KINDS = ['parent', 'pastor'];
const REF_LABELS = { parent: 'Parent', pastor: 'Pastor' };

const newToken = () => crypto.randomBytes(24).toString('base64url');

function newCode() {
  // Short, unique "Student ID" like the original JotForm (3+ digits).
  for (let digits = 3; ; digits++) {
    for (let i = 0; i < 20; i++) {
      const code = String(crypto.randomInt(10 ** (digits - 1), 10 ** digits));
      if (!db.prepare('SELECT 1 FROM applications WHERE code = ?').get(code)) return code;
    }
  }
}

const parse = (row) => row && { ...row, data: JSON.parse(row.data || '{}'), schema: row.schema ? JSON.parse(row.schema) : null };

function createApplication({ firstName, lastName, email }) {
  const form = forms.getForm('student');
  const data = {};
  const set = (role, v) => { const fd = forms.fieldByRole(form, role); if (fd) data[fd.id] = v; };
  set('student_first_name', firstName);
  set('student_last_name', lastName);
  set('student_email', email);
  const info = db.prepare('INSERT INTO applications (code, token, email, first_name, last_name, data) VALUES (?, ?, ?, ?, ?, ?)')
    .run(newCode(), newToken(), email, firstName, lastName, JSON.stringify(data));
  logActivity(info.lastInsertRowid, `${firstName} ${lastName}`, 'Started application');
  return getApplication(info.lastInsertRowid);
}

const getApplication = (id) => parse(db.prepare('SELECT * FROM applications WHERE id = ?').get(id));
const getApplicationByToken = (token) => parse(db.prepare('SELECT * FROM applications WHERE token = ?').get(String(token)));
const getRefByToken = (token) => parse(db.prepare('SELECT * FROM refs WHERE token = ?').get(String(token)));
const getRefs = (applicationId) => db.prepare("SELECT * FROM refs WHERE application_id = ? ORDER BY CASE kind WHEN 'parent' THEN 0 ELSE 1 END").all(applicationId).map(parse);
const getRef = (applicationId, kind) => parse(db.prepare('SELECT * FROM refs WHERE application_id = ? AND kind = ?').get(applicationId, kind));

// The form an application is answered against: its frozen copy once submitted, otherwise the live form.
const studentSchema = (app) => app.schema || forms.getForm('student');
const refSchema = (ref) => ref.schema || forms.getForm(ref.kind);

function saveDraft(app, input, step) {
  const schema = studentSchema(app);
  const data = forms.sanitizeData(schema, input);
  const first = forms.valueByRole(schema, data, 'student_first_name') || app.first_name;
  const last = forms.valueByRole(schema, data, 'student_last_name') || app.last_name;
  const email = forms.valueByRole(schema, data, 'student_email') || app.email;
  db.prepare("UPDATE applications SET data = ?, first_name = ?, last_name = ?, email = ?, current_step = ?, updated_at = datetime('now') WHERE id = ?")
    .run(JSON.stringify(data), first, last, email, Number(step) || 0, app.id);
  return data;
}

function emailResumeLink(app) {
  const url = `${baseUrl()}/apply/${app.token}`;
  return sendMail({
    to: app.email,
    applicationId: app.id,
    subject: 'Your Inspire Ministries student application',
    heading: `Hi ${app.first_name || 'there'},`,
    paragraphs: [
      'Your student application has been saved. You can come back to it at any time using the button below — your answers are saved as you go.',
      `Your Student ID is <strong>${esc(app.code)}</strong>.`,
    ],
    button: { label: 'Continue my application', url },
  });
}

async function submitApplication(app, input, meta) {
  const schema = forms.getForm('student');
  const data = forms.sanitizeData(schema, input);
  const errors = forms.validateData(schema, data);
  if (Object.keys(errors).length) return { errors };
  for (const fd of forms.allFields(schema)) {
    if (fd.type === 'signature' && data[fd.id]) Object.assign(data[fd.id], { signedAt: new Date().toISOString(), ip: meta.ip, userAgent: meta.userAgent });
  }
  const first = forms.valueByRole(schema, data, 'student_first_name') || app.first_name;
  const last = forms.valueByRole(schema, data, 'student_last_name') || app.last_name;
  const email = forms.valueByRole(schema, data, 'student_email') || app.email;
  db.prepare(`UPDATE applications SET data = ?, schema = ?, first_name = ?, last_name = ?, email = ?, status = 'awaiting_references',
    submitted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`)
    .run(JSON.stringify(data), JSON.stringify(schema), first, last, email, app.id);
  logActivity(app.id, `${first} ${last}`, 'Signed and submitted the student application');

  const parentEmail = forms.valueByRole(schema, data, 'parent_email');
  const pastorEmail = forms.valueByRole(schema, data, 'pastor_email');
  const pastorName = forms.valueByRole(schema, data, 'pastor_name');
  ensureRef(app.id, 'parent', parentEmail, '');
  ensureRef(app.id, 'pastor', pastorEmail, pastorName);

  const fresh = getApplication(app.id);
  const settings = getSettings();
  if (settings.auto_send_references === '1') {
    for (const ref of getRefs(app.id)) if (ref.email) await sendReferenceRequest(fresh, ref, 'system');
  }

  await sendMail({
    to: fresh.email,
    applicationId: app.id,
    subject: 'We received your Inspire Ministries application',
    heading: `Thank you, ${first}!`,
    paragraphs: [
      `Your student application has been signed and submitted. Your Student ID is <strong>${esc(fresh.code)}</strong>.`,
      'Your application is complete once your parent and pastor references are submitted. You can check on them, re-send them, or have your parent or pastor fill out their part on your phone from your application page.',
      'Once all required references have been submitted, a member of the Inspire Ministries board will follow up with you regarding the status of your application.',
    ],
    button: { label: 'View my application status', url: `${baseUrl()}/apply/${fresh.token}` },
  });
  await sendMail({
    to: notificationRecipients(),
    applicationId: app.id,
    subject: `New student application: ${first} ${last} (#${fresh.code})`,
    heading: 'New student application submitted',
    paragraphs: [
      `<strong>${esc(first)} ${esc(last)}</strong> (Student ID ${esc(fresh.code)}, ${esc(fresh.email)}) has signed and submitted a student application.`,
      'The parent and pastor references are now pending. You will get another email when all references are complete.',
    ],
    button: { label: 'Open in admin portal', url: `${baseUrl()}/admin/applications/${app.id}` },
  });
  return { app: fresh };
}

function ensureRef(applicationId, kind, email, name) {
  const existing = getRef(applicationId, kind);
  if (existing) return existing;
  db.prepare('INSERT INTO refs (application_id, kind, token, email, name) VALUES (?, ?, ?, ?, ?)').run(applicationId, kind, newToken(), email || null, name || null);
  return getRef(applicationId, kind);
}

async function sendReferenceRequest(app, ref, actor, email) {
  if (ref.status === 'completed') return;
  const to = email || ref.email;
  if (!to) return;
  db.prepare(`UPDATE refs SET email = ?, status = CASE WHEN status = 'pending' THEN 'sent' ELSE status END, sent_at = datetime('now'),
    send_count = send_count + 1, updated_at = datetime('now') WHERE id = ?`).run(to, ref.id);
  const studentName = `${app.first_name} ${app.last_name}`.trim();
  const who = ref.kind === 'parent' ? 'Parental' : 'Pastoral';
  await sendMail({
    to,
    applicationId: app.id,
    subject: `${who} reference requested for ${studentName} — Inspire Ministries`,
    heading: `${who} Reference for ${studentName}`,
    paragraphs: [
      `${esc(studentName)} has applied to attend the Inspire Ministries Bible School and listed you as their ${ref.kind === 'parent' ? 'parent' : 'pastor'}.`,
      'Please complete the short reference questionnaire and sign at the end. It takes about 10 minutes, and your progress is saved automatically if you need to come back to it.',
      'Your answers are confidential and are only seen by the Inspire Ministries board.',
    ],
    button: { label: `Complete the ${who.toLowerCase()} reference`, url: `${baseUrl()}/reference/${ref.token}` },
  });
  logActivity(app.id, actor, `Sent ${ref.kind} reference request to ${to}`);
}

function saveRefDraft(ref, input, step) {
  const data = forms.sanitizeData(refSchema(ref), input);
  db.prepare(`UPDATE refs SET data = ?, current_step = ?, status = CASE WHEN status IN ('pending','sent') THEN 'in_progress' ELSE status END,
    updated_at = datetime('now') WHERE id = ?`).run(JSON.stringify(data), Number(step) || 0, ref.id);
  return data;
}

async function submitReference(ref, input, meta) {
  const schema = forms.getForm(ref.kind);
  const data = forms.sanitizeData(schema, input);
  const errors = forms.validateData(schema, data);
  if (Object.keys(errors).length) return { errors };
  for (const fd of forms.allFields(schema)) {
    if (fd.type === 'signature' && data[fd.id]) Object.assign(data[fd.id], { signedAt: new Date().toISOString(), ip: meta.ip, userAgent: meta.userAgent });
  }
  const name = forms.valueByRole(schema, data, 'reference_name') || ref.name;
  db.prepare(`UPDATE refs SET data = ?, schema = ?, name = ?, status = 'completed', completed_at = datetime('now'), completed_method = ?,
    updated_at = datetime('now') WHERE id = ?`).run(JSON.stringify(data), JSON.stringify(schema), name, meta.inPerson ? 'in_person' : 'online', ref.id);

  const app = getApplication(ref.application_id);
  logActivity(app.id, name || REF_LABELS[ref.kind], `Signed and submitted the ${ref.kind} reference${meta.inPerson ? ' (in person)' : ''}`);
  const studentName = `${app.first_name} ${app.last_name}`.trim();

  await sendMail({
    to: app.email,
    applicationId: app.id,
    subject: `Your ${ref.kind} reference was received`,
    heading: `Good news, ${app.first_name}!`,
    paragraphs: [`Your ${ref.kind === 'parent' ? 'parental' : 'pastoral'} reference has been completed and signed.`],
    button: { label: 'View my application status', url: `${baseUrl()}/apply/${app.token}` },
  });

  const refs = getRefs(app.id);
  const allDone = REF_KINDS.every((k) => refs.find((r) => r.kind === k && r.status === 'completed'));
  if (allDone && app.status === 'awaiting_references') {
    db.prepare("UPDATE applications SET status = 'ready_for_review', updated_at = datetime('now') WHERE id = ?").run(app.id);
    logActivity(app.id, 'System', 'All references complete — ready for review');
    await sendMail({
      to: notificationRecipients(),
      applicationId: app.id,
      subject: `Application ready for review: ${studentName} (#${app.code})`,
      heading: 'Application ready for review',
      paragraphs: [`All references for <strong>${esc(studentName)}</strong> (Student ID ${esc(app.code)}) have been completed and signed. The full application is ready for the board to review.`],
      button: { label: 'Review application', url: `${baseUrl()}/admin/applications/${app.id}` },
    });
  }
  return { ref: getRefByToken(ref.token) };
}

module.exports = {
  STATUSES,
  REF_STATUSES,
  REF_KINDS,
  REF_LABELS,
  createApplication,
  getApplication,
  getApplicationByToken,
  getRefByToken,
  getRefs,
  getRef,
  studentSchema,
  refSchema,
  saveDraft,
  emailResumeLink,
  submitApplication,
  ensureRef,
  sendReferenceRequest,
  saveRefDraft,
  submitReference,
};
