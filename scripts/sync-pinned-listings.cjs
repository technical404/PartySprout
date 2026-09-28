'use strict';

/**
 * Brings the local SQLite database in line with the sponsored placement that
 * was applied directly to the production database: two listings lead every
 * category and belong to all of them.
 *
 * The local database is the source for Database/export-mysql.cjs, so without
 * this the next export would reset pin_rank to 0 and drop the extra
 * listing_categories rows that only exist in production.
 *
 *   node scripts/sync-pinned-listings.cjs
 */

const { init, db, close } = require('../Database/index.js');

const PINNED = [
  { id: 1, website: 'charactersforhire.com' },
  { id: 9, website: 'partycharactersforkids.com' },
];

init();

const find = db.prepare('SELECT id, name, website, pin_rank FROM listings WHERE id = ?');
const pin = db.prepare('UPDATE listings SET pin_rank = 1 WHERE id = ?');
const joinAll = db.prepare(
  'INSERT OR IGNORE INTO listing_categories (listing_id, category_id) SELECT ?, id FROM categories'
);
const categories = db.prepare('SELECT COUNT(*) AS n FROM categories').get().n;

db.exec('BEGIN');
try {
  for (const expected of PINNED) {
    const row = find.get(expected.id);
    if (!row) {
      console.warn(`  listing ${expected.id} not found — skipped`);
      continue;
    }
    if (!String(row.website || '').includes(expected.website)) {
      console.warn(`  listing ${expected.id} website is "${row.website}", expected ${expected.website} — skipped`);
      continue;
    }
    pin.run(row.id);
    const added = joinAll.run(row.id).changes;
    console.log(`  #${row.id} ${row.name} — pin_rank set, ${added} category link(s) added (+${categories - added} already present)`);
  }
  db.exec('COMMIT');
} catch (error) {
  db.exec('ROLLBACK');
  throw error;
}

const pinned = db.prepare('SELECT id, pin_rank FROM listings WHERE pin_rank > 0 ORDER BY id').all();
const memberships = db
  .prepare('SELECT listing_id, COUNT(*) AS n FROM listing_categories WHERE listing_id IN (1, 9) GROUP BY listing_id')
  .all();
console.log(`\npinned listings: ${JSON.stringify(pinned)}`);
console.log(`category memberships: ${JSON.stringify(memberships)} of ${categories} categories`);
close();
