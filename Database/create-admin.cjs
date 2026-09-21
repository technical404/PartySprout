'use strict';

/**
 * Creates or promotes an admin account.
 *
 *   node Database/create-admin.cjs you@example.com            # generates a password
 *   node Database/create-admin.cjs you@example.com "secret12" # uses the password you pass
 *
 * Admin is never a signup option, so this is the only way one appears.
 */

const crypto = require('node:crypto');
const { init, db } = require('./index.js');
const queries = require('./queries.js');
const auth = require('./auth.js');

init();

const [email, password] = process.argv.slice(2);
if (!email) {
  console.error('Usage: node Database/create-admin.cjs <email> [password]');
  process.exit(1);
}

const normalized = auth.normalizeEmail(email);
const existing = queries.getUserByEmail(normalized);
const chosen = password || crypto.randomBytes(9).toString('base64url');

if (existing) {
  db.prepare("UPDATE users SET role = 'admin', status = 'active', password_hash = ? WHERE id = ?").run(
    auth.hashPassword(chosen),
    existing.id
  );
  console.log(`Promoted ${normalized} to admin.`);
} else {
  const user = queries.createUser({
    email: normalized,
    name: 'Directory admin',
    phone: '',
    passwordHash: auth.hashPassword(chosen),
    role: 'admin',
  });
  console.log(`Created admin ${user.email} (id ${user.id}).`);
}

console.log(`Password: ${chosen}`);
console.log('Change it after logging in at /login.');
