const nodemailer = require('nodemailer');
const { db } = require('./db');
const { getSettings } = require('./settings');

let transport = null;
if (process.env.SMTP_HOST) {
  transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true' || Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function baseUrl() {
  return (process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');
}

function renderEmail({ heading, paragraphs = [], button, footer }) {
  const s = getSettings();
  const body = paragraphs.map((p) => `<p style="margin:0 0 14px;font-size:16px;line-height:1.6;color:#334155">${p}</p>`).join('');
  const btn = button
    ? `<p style="margin:24px 0;text-align:center"><a href="${esc(button.url)}" style="background:#ca0902;color:#ffffff;text-decoration:none;padding:13px 26px;border-radius:3px;font-weight:600;display:inline-block;font-family:Roboto,Arial,sans-serif">${esc(button.label)}</a></p>
       <p style="margin:0 0 14px;font-size:13px;color:#64748b;word-break:break-all">Or copy this link into your browser:<br><a href="${esc(button.url)}" style="color:#1c1cf0">${esc(button.url)}</a></p>`
    : '';
  return `<!doctype html><html><body style="margin:0;background:#F0F5FA;font-family:Roboto,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F0F5FA;padding:24px 12px"><tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:6px;overflow:hidden">
    <tr><td style="background:#ffffff;padding:20px;text-align:center;border-bottom:1px solid #D1D5DB">
      <img src="${baseUrl()}/img/logo-header.jpg" alt="Inspire Ministries Texas" width="110" style="display:inline-block">
    </td></tr>
    <tr><td style="background:#334155;padding:12px;text-align:center;color:#ffffff;font-family:Charm,Georgia,serif;font-size:20px;font-style:italic">Refresh &bull; Inspire &bull; Strengthen &bull; Equip</td></tr>
    <tr><td style="padding:28px 28px 12px">
      <h1 style="margin:0 0 18px;font-size:22px;color:#1e293b">${esc(heading)}</h1>
      ${body}${btn}
    </td></tr>
    <tr><td style="padding:16px 28px 26px;font-size:13px;color:#64748b;border-top:1px solid #e2e8f0">
      ${footer || `Questions? Contact ${esc(s.contact_name)} at <a href="mailto:${esc(s.contact_email)}" style="color:#1c1cf0">${esc(s.contact_email)}</a> or ${esc(s.contact_phone)}.`}
    </td></tr>
  </table></td></tr></table></body></html>`;
}

async function sendMail({ to, subject, applicationId = null, ...content }) {
  const recipients = (Array.isArray(to) ? to : [to]).filter(Boolean);
  if (!recipients.length) return;
  const s = getSettings();
  const html = renderEmail(content);
  const from = process.env.MAIL_FROM || process.env.SMTP_USER || 'no-reply@inspireministries.net';
  for (const addr of recipients) {
    let status = 'logged';
    let error = null;
    if (transport) {
      try {
        await transport.sendMail({ from: `"${s.email_from_name}" <${from}>`, replyTo: s.reply_to || undefined, to: addr, subject, html });
        status = 'sent';
      } catch (e) {
        status = 'failed';
        error = e.message;
        console.error(`[mail] failed to send to ${addr}: ${e.message}`);
      }
    } else {
      console.log(`[mail] SMTP not configured — logged email to ${addr}: ${subject}`);
    }
    db.prepare('INSERT INTO emails (application_id, to_address, subject, html, status, error) VALUES (?, ?, ?, ?, ?, ?)')
      .run(applicationId, addr, subject, html, status, error);
  }
}

module.exports = { sendMail, baseUrl, esc, isConfigured: () => !!transport };
