'use strict';
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const db = new DatabaseSync(path.join(__dirname, '..', 'Database', 'directory.db'));
const rows = db
  .prepare(
    'SELECT id, name, website, description, about_fetched_at FROM listings WHERE about_fetched_at IS NOT NULL ORDER BY id'
  )
  .all();

console.log(`${rows.length} listings with fetched about text\n`);
for (const r of rows) {
  console.log('='.repeat(78));
  console.log(`#${r.id} ${r.name}  [${r.website}]`);
  console.log(`length: ${r.description.length}`);
  console.log('-'.repeat(78));
  console.log(r.description.slice(0, 700));
  if (r.description.length > 700) console.log(`\n... [+${r.description.length - 700} more chars]`);
  console.log();
}
