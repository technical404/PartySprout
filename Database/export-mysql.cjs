'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'directory.db');
const OUT = process.argv[2] || path.join(__dirname, 'mysql-data.sql');

const db = new DatabaseSync(DB_PATH);

function esc(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  const s = String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r');
  return `'${s}'`;
}

function dump(table, columns) {
  const rows = db.prepare(`SELECT ${columns.join(', ')} FROM ${table}`).all();
  if (rows.length === 0) return `-- ${table}: empty\n`;
  const lines = [`-- ${table} (${rows.length})`, `DELETE FROM ${table};`];
  const chunk = 200;
  for (let i = 0; i < rows.length; i += chunk) {
    const slice = rows.slice(i, i + chunk);
    const values = slice
      .map((row) => `(${columns.map((c) => esc(row[c])).join(', ')})`)
      .join(',\n  ');
    lines.push(`INSERT INTO ${table} (${columns.join(', ')}) VALUES\n  ${values};`);
  }
  return lines.join('\n') + '\n\n';
}

const parts = [
  'SET NAMES utf8mb4;',
  'SET FOREIGN_KEY_CHECKS = 0;',
  'SET UNIQUE_CHECKS = 0;',
  '',
  dump('countries', ['id', 'code', 'name', 'dial_code', 'is_active', 'created_at']),
  dump('states', ['id', 'country_id', 'code', 'name']),
  dump('cities', ['id', 'state_id', 'name', 'slug']),
  dump('categories', ['id', 'slug', 'name', 'tagline', 'icon', 'sort_order', 'is_active']),
  dump('listings', [
    'id',
    'name',
    'slug',
    'category_id',
    'country_id',
    'state_id',
    'city_id',
    'city_text',
    'description',
    'website',
    'icon_url',
    'phone',
    'email',
    'price_from',
    'rating',
    'is_featured',
    'status',
    'review_note',
    'submitted_by',
    'created_at',
  ]),
  dump('listing_categories', ['listing_id', 'category_id']),
  dump('subcategories', ['id', 'category_id', 'slug', 'name', 'sort_order']),
  dump('quote_requests', [
    'id',
    'name',
    'email',
    'phone',
    'city',
    'event_date',
    'guest_count',
    'child_age',
    'category_slug',
    'budget',
    'details',
    'vendor_id',
    'user_id',
    'source',
    'created_at',
  ]),
  dump('users', [
    'id',
    'email',
    'name',
    'phone',
    'password_hash',
    'role',
    'listing_id',
    'status',
    'created_at',
  ]),
  dump('favorites', ['user_id', 'listing_id', 'created_at']),
  // Sessions are deliberately not exported: they are short-lived, and the token
  // column is the only thing standing between a leaked file and other people's
  // accounts. Everyone signs in again on the new host.
  '-- sessions: not exported (everyone signs in again)',
  'SET UNIQUE_CHECKS = 1;',
  'SET FOREIGN_KEY_CHECKS = 1;',
];

fs.writeFileSync(OUT, parts.join('\n'));
console.log('Wrote', OUT, fs.statSync(OUT).size, 'bytes');

const legacy = db
  .prepare("SELECT email FROM users WHERE password_hash NOT LIKE 'pbkdf2$%'")
  .all()
  .map((row) => row.email);
if (legacy.length > 0) {
  console.log(`\nWARNING: ${legacy.length} account(s) still use an older password hash that PHP cannot verify:`);
  for (const email of legacy) console.log(`  ${email}`);
  console.log('Log in once through the Node app to upgrade the hash, or run');
  console.log("  php deploy/tools/set-password.php <email> '<new password>'");
  console.log('on the server after importing.');
}
