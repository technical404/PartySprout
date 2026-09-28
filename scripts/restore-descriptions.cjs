'use strict';

/**
 * Puts listings.description back the way it was, from a backup written by
 * Database/fetch-about.cjs, and clears about_fetched_at so the next fetch run
 * picks those listings up again.
 *
 *   node scripts/restore-descriptions.cjs Database/description-backup-<stamp>.json
 *   node scripts/restore-descriptions.cjs <backup.json> --ids 75,81
 *
 * --ids restores only those listing ids, so a single bad row can be rolled back
 * without discarding the rest of a large fetch run.
 */

const fs = require('node:fs');
const { init, db, close } = require('../Database/index.js');

const argv = process.argv.slice(2);
const file = argv.find((a) => !a.startsWith('--'));
const idsArg = argv.indexOf('--ids');
const ONLY =
  idsArg === -1
    ? null
    : new Set(
        String(argv[idsArg + 1] || '')
          .split(',')
          .map((s) => Number(s.trim()))
          .filter(Number.isFinite)
      );

if (!file) {
  console.error('usage: node scripts/restore-descriptions.cjs <backup.json> [--ids 1,2]');
  process.exit(1);
}

const all = JSON.parse(fs.readFileSync(file, 'utf8'));
const rows = ONLY ? all.filter((row) => ONLY.has(row.id)) : all;
if (!Array.isArray(rows) || !rows.length) {
  console.error('nothing to restore');
  process.exit(1);
}
if (ONLY) console.log(`--ids selected ${rows.length} of ${all.length} rows`);

init();
const update = db.prepare('UPDATE listings SET description = ?, about_fetched_at = NULL WHERE id = ?');

db.exec('BEGIN');
try {
  for (const row of rows) update.run(row.description, row.id);
  db.exec('COMMIT');
} catch (error) {
  db.exec('ROLLBACK');
  throw error;
}

console.log(`Restored ${rows.length} descriptions from ${file}`);
close();
