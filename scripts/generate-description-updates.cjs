'use strict';

/**
 * Turns the descriptions written by Database/fetch-about.cjs into a MySQL
 * script of targeted UPDATEs, for loading into the production database:
 *
 *   node scripts/generate-description-updates.cjs > Database/description-updates.sql
 *
 * Deliberately not Database/export-mysql.cjs: that dumps whole tables with
 * DELETE FROM first, which would throw away pin_rank and any listing_categories
 * rows that exist only in production.
 */

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const db = new DatabaseSync(path.join(__dirname, '..', 'Database', 'directory.db'));
const rows = db
  .prepare(
    `SELECT id, description FROM listings
      WHERE about_fetched_at IS NOT NULL AND description IS NOT NULL AND description <> ''
      ORDER BY id`
  )
  .all();

/** Same escaping as Database/export-mysql.cjs, so both agree on backslashes. */
function esc(value) {
  if (value === null || value === undefined) return 'NULL';
  const s = String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r');
  return `'${s}'`;
}

const out = ['SET NAMES utf8mb4;', `-- ${rows.length} descriptions from Database/fetch-about.cjs`, ''];
for (const row of rows) {
  out.push(
    `UPDATE listings SET description = ${esc(row.description)}, about_fetched_at = NOW() WHERE id = ${row.id};`
  );
}

process.stdout.write(out.join('\n') + '\n');
process.stderr.write(`${rows.length} UPDATE statements\n`);
