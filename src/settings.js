const { db } = require('./db');

const DEFAULTS = {
  notification_emails: 'inspireministries24@gmail.com',
  accepting_applications: '1',
  closed_message: 'Applications are currently closed. Please check back for our next Bible School event.',
  auto_send_references: '1',
  email_from_name: 'Inspire Ministries',
  reply_to: 'inspireministries24@gmail.com',
  contact_name: 'Joel Byers',
  contact_email: 'inspireministries24@gmail.com',
  contact_phone: '+1(254) 266-9920',
};

function getSettings() {
  const out = { ...DEFAULTS };
  for (const row of db.prepare('SELECT key, value FROM settings').all()) out[row.key] = row.value;
  return out;
}

function getSetting(key) {
  return getSettings()[key];
}

function saveSettings(values) {
  const upsert = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  db.transaction(() => {
    for (const key of Object.keys(DEFAULTS)) if (values[key] !== undefined) upsert.run(key, String(values[key]));
  })();
}

function notificationRecipients() {
  return (getSetting('notification_emails') || '')
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s));
}

module.exports = { DEFAULTS, getSettings, getSetting, saveSettings, notificationRecipients };
