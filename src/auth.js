const crypto = require('crypto');
const { db } = require('./db');

const COOKIE = 'im_admin';
const SESSION_DAYS = 14;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [, salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(String(password), salt, 64);
  return crypto.timingSafeEqual(test, Buffer.from(hash, 'hex'));
}

function createAdmin({ email, name, password }) {
  return db.prepare('INSERT INTO admins (email, name, password_hash) VALUES (?, ?, ?)').run(email.trim(), name.trim(), hashPassword(password));
}

// Creates the first admin from ADMIN_EMAIL / ADMIN_PASSWORD, or prints a generated password.
function bootstrapAdmin() {
  if (db.prepare('SELECT COUNT(*) n FROM admins').get().n > 0) return;
  const email = process.env.ADMIN_EMAIL || 'inspireministries24@gmail.com';
  let password = process.env.ADMIN_PASSWORD;
  if (!password) {
    password = crypto.randomBytes(9).toString('base64url');
    console.log('\n==============================================================');
    console.log(' First admin account created');
    console.log(`   Email:    ${email}`);
    console.log(`   Password: ${password}`);
    console.log(' Sign in at /admin and change this password under Admin Users.');
    console.log('==============================================================\n');
  }
  createAdmin({ email, name: process.env.ADMIN_NAME || 'Administrator', password });
}

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function login(res, adminId, secure) {
  const token = crypto.randomBytes(32).toString('base64url');
  db.prepare(`INSERT INTO sessions (token, admin_id, expires_at) VALUES (?, ?, datetime('now', '+${SESSION_DAYS} days'))`).run(token, adminId);
  db.prepare("UPDATE admins SET last_login_at = datetime('now') WHERE id = ?").run(adminId);
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure ? '; Secure' : ''}`);
}

function logout(req, res) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

function loadAdmin(req, res, next) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (token) {
    const admin = db.prepare(`SELECT a.id, a.email, a.name FROM sessions s JOIN admins a ON a.id = s.admin_id
      WHERE s.token = ? AND s.expires_at > datetime('now')`).get(token);
    if (admin) req.admin = admin;
  }
  res.locals.admin = req.admin || null;
  next();
}

function requireAdmin(req, res, next) {
  if (req.admin) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Please sign in again.' });
  res.redirect(`/admin/login?next=${encodeURIComponent(req.originalUrl)}`);
}

// Blocks cross-site form posts to the admin area.
function sameOrigin(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.headers.origin || req.headers.referer;
  if (origin) {
    try {
      if (new URL(origin).host !== req.headers.host) return res.status(403).send('Cross-site request blocked.');
    } catch {
      return res.status(403).send('Cross-site request blocked.');
    }
  }
  next();
}

module.exports = { hashPassword, verifyPassword, createAdmin, bootstrapAdmin, login, logout, loadAdmin, requireAdmin, sameOrigin };
