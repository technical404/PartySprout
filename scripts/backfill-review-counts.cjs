'use strict';

/**
 * Puts the Google review count back on every listing that has a rating.
 *
 * The count was never a column: it survived only inside the imported
 * description ("Children's party service · 1381 Google reviews"), and
 * Database/fetch-about.cjs replaced those descriptions with the business's own
 * about text. This recovers it from, in order:
 *
 *   1. the description, for rows fetch-about.cjs has not reached yet;
 *   2. Database/description-backup-*.json, written by fetch-about.cjs before it
 *      overwrote each description, so it holds the original text per id;
 *   3. the original spreadsheet, matched on name and rating.
 *
 * A normal run only fills rows whose review_count is still NULL, so it is safe to
 * re-run and can never overwrite a stored count. --sql instead rebuilds the full
 * set, because the production database has no counts at all yet.
 *
 *   node scripts/backfill-review-counts.cjs            # local SQLite
 *   node scripts/backfill-review-counts.cjs --sql      # print production SQL
 */

const fs = require('node:fs');
const path = require('node:path');
const XLSX = require('xlsx');

const DATABASE_DIR = path.join(__dirname, '..', 'Database');
// Through Database/index.js rather than node:sqlite directly: init() applies the
// migrations, so the review_count column this script writes to is guaranteed to
// exist on both a fresh database and one that predates the column.
const { init, db } = require(path.join(DATABASE_DIR, 'index.js'));
const wantSql = process.argv.includes('--sql');

init();

const COUNT_IN_TEXT = /(\d+)\s+Google reviews/i;
const readCount = (value) => {
  const match = String(value ?? '').match(COUNT_IN_TEXT);
  return match ? Number(match[1]) : null;
};

function loadBackups() {
  const byId = new Map();
  const files = fs
    .readdirSync(DATABASE_DIR)
    .filter((name) => name.startsWith('description-backup-') && name.endsWith('.json'))
    .sort();
  for (const file of files) {
    const entries = JSON.parse(fs.readFileSync(path.join(DATABASE_DIR, file), 'utf8'));
    for (const entry of Array.isArray(entries) ? entries : []) {
      const id = Number(entry.id);
      const count = readCount(entry.description);
      if (count !== null && !byId.has(id)) byId.set(id, count);
    }
  }
  return { byId, files: files.length };
}

/** name -> {rating, review_count} from the spreadsheet the directory came from. */
function loadSheet() {
  const file = path.join(DATABASE_DIR, 'party_characters_data (1).xlsx');
  const rows = XLSX.utils.sheet_to_json(XLSX.readFile(file).Sheets.Data, { header: 1, defval: null }).slice(3);
  const byName = new Map();
  for (const row of rows) {
    const name = String(row[2] ?? '').trim();
    const rating = row[6] != null && row[6] !== '' ? Number(row[6]) : null;
    const reviews = row[7] != null && row[7] !== '' ? Number(row[7]) : null;
    if (!name || reviews === null) continue;
    // More than one record can share a name; the rating disambiguates them.
    const key = `${name}\u0000${rating}`;
    if (!byName.has(key)) byName.set(key, reviews);
  }
  return byName;
}

const backups = loadBackups();
const sheet = loadSheet();
const rows = db
  .prepare(
    `SELECT id, name, rating, description, review_count FROM listings
      WHERE rating IS NOT NULL AND rating > 0
      ORDER BY id`
  )
  .all();

const update = db.prepare('UPDATE listings SET review_count = ? WHERE id = ?');
const sources = { description: 0, backup: 0, sheet: 0 };
const updates = [];
const unresolved = [];

for (const row of rows) {
  // --sql rebuilds the whole set for a database that has no counts at all, while
  // a normal run only fills the gaps and never rewrites a stored count.
  if (!wantSql && row.review_count !== null) continue;

  let count = readCount(row.description);
  let source = 'description';

  if (count === null) {
    count = backups.byId.get(row.id) ?? null;
    source = 'backup';
  }
  if (count === null) {
    count = sheet.get(`${String(row.name).trim()}\u0000${row.rating}`) ?? null;
    source = 'sheet';
  }
  if (count === null) {
    unresolved.push(row);
    continue;
  }

  sources[source] += 1;
  updates.push({ id: row.id, count });
  if (!wantSql) update.run(count, row.id);
}

if (wantSql) {
  process.stdout.write(
    [
      'SET NAMES utf8mb4;',
      `-- ${updates.length} Google review counts recovered by scripts/backfill-review-counts.cjs`,
      '',
      ...updates.map((row) => `UPDATE listings SET review_count = ${row.count} WHERE id = ${row.id};`),
      '',
    ].join('\n')
  );
}

process.stderr.write(
  `rated listings: ${rows.length}\n` +
    `  recovered from description: ${sources.description}\n` +
    `  recovered from backups:     ${sources.backup} (${backups.files} files)\n` +
    `  recovered from spreadsheet: ${sources.sheet}\n` +
    `  genuinely no count:         ${unresolved.length}\n` +
    (wantSql ? `  SQL statements written:     ${updates.length}\n` : `  rows updated:               ${updates.length}\n`)
);
for (const row of unresolved) {
  process.stderr.write(`    #${row.id} ${row.name} (rating ${row.rating}) - no count in any source\n`);
}
