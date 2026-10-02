const crypto = require('crypto');
const { db } = require('./db');
const defaults = require('./forms-default');

const KINDS = ['student', 'parent', 'pastor'];
const KIND_LABELS = { student: 'Student Application', parent: 'Parental Reference', pastor: 'Pastoral Reference' };

const FIELD_TYPES = {
  text: 'Short text',
  textarea: 'Paragraph',
  email: 'Email',
  phone: 'Phone',
  number: 'Number',
  date: 'Date',
  radio: 'Multiple choice (one answer)',
  checkbox: 'Checkboxes (many answers)',
  select: 'Dropdown',
  name: 'Full name (first + last)',
  address: 'Address',
  agreement: 'Agreement checkbox',
  signature: 'Signature',
  content: 'Text / instructions (no answer)',
};
const CHOICE_TYPES = ['radio', 'checkbox', 'select'];
const ROLES = {
  student: {
    student_first_name: 'Student first name',
    student_last_name: 'Student last name',
    student_email: 'Student email',
    parent_email: 'Parent email (parental reference is sent here)',
    pastor_email: 'Pastor email (pastoral reference is sent here)',
    pastor_name: 'Pastor name',
  },
  parent: { reference_name: 'Name of person giving the reference' },
  pastor: { reference_name: 'Name of person giving the reference' },
};

const SIGNATURE_MAX = 400 * 1024;
const TEXT_MAX = 5000;

function seedForms() {
  const insert = db.prepare('INSERT OR IGNORE INTO forms (kind, title, schema, updated_by) VALUES (?, ?, ?, ?)');
  for (const kind of KINDS) insert.run(kind, defaults[kind].title, JSON.stringify(defaults[kind]), 'system');
}

function getForm(kind) {
  const row = db.prepare('SELECT * FROM forms WHERE kind = ?').get(kind);
  if (!row) return null;
  return { ...JSON.parse(row.schema), kind, updated_at: row.updated_at, updated_by: row.updated_by };
}

function saveForm(kind, schema, adminName) {
  const clean = cleanSchema(schema);
  db.prepare("UPDATE forms SET title = ?, schema = ?, updated_at = datetime('now'), updated_by = ? WHERE kind = ?")
    .run(clean.title, JSON.stringify(clean), adminName, kind);
  return getForm(kind);
}

function resetForm(kind, adminName) {
  return saveForm(kind, defaults[kind], adminName);
}

const str = (v, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const slug = (s) => str(s, 60).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

// Sanitizes a schema coming from the form builder.
function cleanSchema(input) {
  if (!input || !Array.isArray(input.sections)) throw new Error('Form must have sections.');
  const ids = new Set();
  const uniqueId = (wanted, label) => {
    let base = slug(wanted) || slug(label) || 'field';
    let id = base;
    while (ids.has(id)) id = `${base}_${crypto.randomBytes(2).toString('hex')}`;
    ids.add(id);
    return id;
  };
  const sections = input.sections.map((s, si) => ({
    id: slug(s.id) || `section_${si + 1}`,
    title: str(s.title, 200) || `Section ${si + 1}`,
    description: str(s.description, 3000),
    fields: (Array.isArray(s.fields) ? s.fields : []).map((fd) => {
      const type = FIELD_TYPES[fd.type] ? fd.type : 'text';
      const field = { id: uniqueId(fd.id, fd.label), type, label: str(fd.label, 500) || 'Untitled question', required: !!fd.required };
      if (type === 'content') field.required = false;
      if (str(fd.help)) field.help = str(fd.help, 1000);
      if (fd.width === 'half') field.width = 'half';
      if (str(fd.role)) field.role = str(fd.role, 60);
      if (fd.showOnReferences) field.showOnReferences = true;
      if (CHOICE_TYPES.includes(type)) {
        field.options = (Array.isArray(fd.options) ? fd.options : []).map((o) => str(o, 300)).filter(Boolean);
        if (!field.options.length) field.options = ['Option 1'];
        if (fd.allowOther && type !== 'select') field.allowOther = true;
      }
      if (type === 'number') {
        if (fd.min !== undefined && fd.min !== '' && !isNaN(+fd.min)) field.min = +fd.min;
        if (fd.max !== undefined && fd.max !== '' && !isNaN(+fd.max)) field.max = +fd.max;
      }
      if (type === 'agreement' || type === 'content') field.text = str(fd.text, 5000);
      return field;
    }),
  }));
  return { title: str(input.title, 200) || 'Form', intro: str(input.intro, 5000), sections };
}

function allFields(schema) {
  return schema.sections.flatMap((s) => s.fields);
}

function fieldByRole(schema, role) {
  return allFields(schema).find((fd) => fd.role === role);
}

function valueByRole(schema, data, role) {
  const fd = fieldByRole(schema, role);
  if (!fd) return '';
  const v = data[fd.id];
  if (fd.type === 'name' && v) return [v.first, v.last].filter(Boolean).join(' ');
  return typeof v === 'string' ? v : '';
}

// Coerces incoming answers to the shape each field type expects. Unknown keys are dropped.
function sanitizeData(schema, input) {
  const out = {};
  if (!input || typeof input !== 'object') return out;
  for (const fd of allFields(schema)) {
    const v = input[fd.id];
    if (v === undefined || v === null) continue;
    switch (fd.type) {
      case 'content':
        break;
      case 'checkbox':
        if (Array.isArray(v)) out[fd.id] = v.map((x) => str(x, 300)).filter(Boolean).slice(0, 50);
        break;
      case 'agreement':
        out[fd.id] = v === true || v === 'true' || v === 'on';
        break;
      case 'name':
        if (typeof v === 'object') out[fd.id] = { first: str(v.first, 100), last: str(v.last, 100) };
        break;
      case 'address':
        if (typeof v === 'object') {
          out[fd.id] = {};
          for (const k of ['street', 'street2', 'city', 'state', 'zip', 'country']) out[fd.id][k] = str(v[k], 200);
        }
        break;
      case 'signature':
        if (typeof v === 'object' && typeof v.image === 'string' && v.image.startsWith('data:image/png;base64,') && v.image.length <= SIGNATURE_MAX) {
          out[fd.id] = { image: v.image, name: str(v.name, 200), signedAt: str(v.signedAt, 40) || new Date().toISOString() };
        }
        break;
      case 'textarea':
        out[fd.id] = str(v, TEXT_MAX);
        break;
      default:
        out[fd.id] = str(String(v), 1000);
    }
    if (fd.allowOther && input[`${fd.id}__other`] !== undefined) out[`${fd.id}__other`] = str(input[`${fd.id}__other`], 300);
  }
  return out;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isEmpty(fd, v) {
  if (v === undefined || v === null || v === '') return true;
  if (fd.type === 'checkbox') return !Array.isArray(v) || v.length === 0;
  if (fd.type === 'agreement') return v !== true;
  if (fd.type === 'name') return !v.first || !v.last;
  if (fd.type === 'address') return !v.street || !v.city || !v.state || !v.zip;
  if (fd.type === 'signature') return !v.image || !v.name;
  return false;
}

// Returns { fieldId: message } for every problem. Empty object means valid.
function validateData(schema, data, sectionIndex) {
  const errors = {};
  const sections = sectionIndex === undefined ? schema.sections : [schema.sections[sectionIndex]].filter(Boolean);
  for (const section of sections) {
    for (const fd of section.fields) {
      if (fd.type === 'content') continue;
      const v = data[fd.id];
      if (isEmpty(fd, v)) {
        if (fd.required) {
          errors[fd.id] =
            fd.type === 'signature' ? 'Please sign and type your full name.'
              : fd.type === 'agreement' ? 'Please check the box to agree.'
                : fd.type === 'address' ? 'Please complete street, city, state and ZIP.'
                  : fd.type === 'name' ? 'Please enter first and last name.'
                    : 'This field is required.';
        }
        continue;
      }
      if (fd.type === 'email' && !EMAIL_RE.test(v)) errors[fd.id] = 'Please enter a valid email address.';
      if (fd.type === 'phone' && String(v).replace(/\D/g, '').length < 7) errors[fd.id] = 'Please enter a valid phone number.';
      if (fd.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(v)) errors[fd.id] = 'Please enter a valid date.';
      if (fd.type === 'number') {
        const n = Number(v);
        if (isNaN(n)) errors[fd.id] = 'Please enter a number.';
        else if (fd.min !== undefined && n < fd.min) errors[fd.id] = `Must be at least ${fd.min}.`;
        else if (fd.max !== undefined && n > fd.max) errors[fd.id] = `Must be at most ${fd.max}.`;
      }
      if (fd.type === 'radio' || fd.type === 'select') {
        const ok = fd.options.includes(v) || (fd.allowOther && v === 'Other');
        if (!ok) errors[fd.id] = 'Please choose one of the options.';
        else if (v === 'Other' && fd.required && !data[`${fd.id}__other`]) errors[fd.id] = 'Please describe "Other".';
      }
      if (fd.type === 'checkbox') {
        const bad = v.find((x) => !fd.options.includes(x) && !(fd.allowOther && x === 'Other'));
        if (bad) errors[fd.id] = 'Please choose from the options.';
        else if (v.includes('Other') && fd.required && !data[`${fd.id}__other`]) errors[fd.id] = 'Please describe "Other".';
      }
    }
    // When a section has signature fields but none of them is required (e.g. Father's / Mother's
    // signature), at least one of them must be signed.
    const sigs = section.fields.filter((fd) => fd.type === 'signature');
    if (sigs.length && !sigs.some((fd) => fd.required) && !sigs.some((fd) => !isEmpty(fd, data[fd.id]))) {
      errors[sigs[0].id] = 'At least one signature is required.';
    }
  }
  return errors;
}

// Human-readable value for admin screens, emails and CSV.
function displayValue(fd, data) {
  const v = data[fd.id];
  const other = data[`${fd.id}__other`];
  if (v === undefined || v === null || v === '') return '';
  switch (fd.type) {
    case 'checkbox':
      return (Array.isArray(v) ? v : []).map((x) => (x === 'Other' && other ? `Other: ${other}` : x)).join(', ');
    case 'radio':
    case 'select':
      return v === 'Other' && other ? `Other: ${other}` : v;
    case 'name':
      return [v.first, v.last].filter(Boolean).join(' ');
    case 'address':
      return [v.street, v.street2, [v.city, v.state].filter(Boolean).join(', '), v.zip, v.country].filter(Boolean).join(', ');
    case 'agreement':
      return v ? 'Agreed' : '';
    case 'signature':
      return v.name ? `Signed by ${v.name}${v.signedAt ? ` on ${new Date(v.signedAt).toLocaleString('en-US')}` : ''}` : 'Signed';
    case 'date': {
      const [y, m, d] = String(v).split('-');
      return y && m && d ? `${m}/${d}/${y}` : v;
    }
    default:
      return String(v);
  }
}

module.exports = {
  KINDS,
  KIND_LABELS,
  FIELD_TYPES,
  ROLES,
  seedForms,
  getForm,
  saveForm,
  resetForm,
  cleanSchema,
  allFields,
  fieldByRole,
  valueByRole,
  sanitizeData,
  validateData,
  displayValue,
  isEmpty,
};
