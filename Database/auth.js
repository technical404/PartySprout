'use strict';

/**
 * Email/password authentication: PBKDF2 hashing for passwords, opaque random
 * tokens for sessions. Nothing here trusts the client — the cookie only carries
 * a token, and every read re-checks the session row in the database.
 */

const crypto = require('node:crypto');
const { db } = require('./index.js');

const SESSION_COOKIE = 'ps_session';
const SESSION_DAYS = 30;
// PBKDF2-HMAC-SHA256. Node and PHP both implement it, so the same stored hash
// verifies on either backend and the deployment can be migrated password for
// password. (PHP has no scrypt, which is why 210k-iteration PBKDF2 replaced it.)
const PBKDF2 = { digest: 'sha256', iterations: 210000, keyLength: 32, saltBytes: 16 };
// Legacy scheme, kept so accounts created before the switch still log in. The
// login route rehashes them to PBKDF2 on the next successful sign-in.
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

const ROLES = ['parent', 'vendor', 'admin'];

function hashPassword(password) {
  const salt = crypto.randomBytes(PBKDF2.saltBytes);
  const key = crypto.pbkdf2Sync(String(password), salt, PBKDF2.iterations, PBKDF2.keyLength, PBKDF2.digest);
  return ['pbkdf2', PBKDF2.digest, PBKDF2.iterations, salt.toString('base64'), key.toString('base64')].join('$');
}

/** Constant-time comparison; a malformed or legacy hash simply fails. */
function verifyPassword(password, stored) {
  const parts = String(stored ?? '').split('$');

  if (parts[0] === 'pbkdf2' && parts.length === 5) {
    const iterations = Number(parts[2]);
    const salt = Buffer.from(parts[3], 'base64');
    const expected = Buffer.from(parts[4], 'base64');
    if (!Number.isFinite(iterations) || iterations < 1000 || expected.length === 0) return false;

    let key;
    try {
      key = crypto.pbkdf2Sync(String(password), salt, iterations, expected.length, parts[1]);
    } catch {
      return false;
    }
    return key.length === expected.length && crypto.timingSafeEqual(key, expected);
  }

  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const [, n, r, p, salt, hash] = parts;
  const expected = Buffer.from(hash, 'base64');
  if (expected.length === 0) return false;

  let key;
  try {
    key = crypto.scryptSync(String(password), Buffer.from(salt, 'base64'), expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: SCRYPT.maxmem,
    });
  } catch {
    return false;
  }
  return key.length === expected.length && crypto.timingSafeEqual(key, expected);
}

/** True when a stored hash predates the current scheme and should be upgraded. */
function needsRehash(stored) {
  return !String(stored ?? '').startsWith(`pbkdf2$${PBKDF2.digest}$`);
}

/** Emails are stored and compared lowercased so "A@b.com" and "a@b.com" are one account. */
function normalizeEmail(email) {
  return String(email ?? '').trim().toLowerCase();
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(
    token,
    userId,
    expires.toISOString()
  );
  return { token, expires };
}

/** Returns the user row for a live session, or null. Expired rows are deleted on sight. */
function userForToken(token) {
  if (!token) return null;
  const session = db.prepare('SELECT token, user_id, expires_at FROM sessions WHERE token = ?').get(token);
  if (!session) return null;

  if (new Date(session.expires_at).getTime() <= Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return null;
  }
  return db
    .prepare(
      `SELECT u.id, u.email, u.name, u.phone, u.role, u.listing_id, u.status
         FROM users u WHERE u.id = ? AND u.status = 'active'`
    )
    .get(session.user_id) ?? null;
}

function destroySession(token) {
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

/** Housekeeping: drop sessions that expired more than a day ago. */
function pruneSessions() {
  db.prepare("DELETE FROM sessions WHERE expires_at < datetime('now', '-1 day')").run();
}

function parseCookies(req) {
  const header = req.headers?.cookie;
  if (!header) return {};
  const out = {};
  for (const part of String(header).split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const name = part.slice(0, index).trim();
    if (name) out[name] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return out;
}

/** `Secure` is added whenever the request arrived over TLS (or behind a TLS proxy). */
function sessionCookie(token, req, maxAgeSeconds = SESSION_DAYS * 24 * 60 * 60) {
  const secure = String(req?.headers?.['x-forwarded-proto'] ?? '').split(',')[0].trim() === 'https';
  return [
    `${SESSION_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
    secure ? 'Secure' : null,
  ]
    .filter(Boolean)
    .join('; ');
}

function clearCookie(req) {
  return sessionCookie('', req, 0);
}

module.exports = {
  SESSION_COOKIE,
  ROLES,
  hashPassword,
  verifyPassword,
  needsRehash,
  normalizeEmail,
  createSession,
  userForToken,
  destroySession,
  pruneSessions,
  parseCookies,
  sessionCookie,
  clearCookie,
};
