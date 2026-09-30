'use strict';

/**
 * Adds "Party Characters For Kids" (charactersforparty.com) to the directory.
 *
 * The business runs a city landing page for each metro it covers under
 * /birthday-party-character-rental/<city>-<state>/, and this directory stores
 * one city per listing, so it is added as one listing per city — the same shape
 * Characters.io and Fun Factory already use. Brooklyn, NY is covered by the
 * site but has no `cities` row here, so it is skipped.
 *
 * Every row is linked to the six categories the site organizes its own catalog
 * under: holidays, mascots, non-mascots, princesses, star-wars and superheroes.
 *
 *   node scripts/add-characters-for-party.cjs          # dry run
 *   node scripts/add-characters-for-party.cjs apply    # write
 *
 * Safe to re-run: rows are matched by slug, and category links are INSERT OR
 * IGNORE, so a second run only fills in anything missing.
 */

const { init, db, close } = require('../Database/index.js');
const { slugify } = require('../Database/seed-data.js');

const APPLY = process.argv.slice(2).includes('apply');

const BUSINESS = {
  brand: 'Party Characters For Kids',
  phone: '+1 855-705-2799',
  email: 'info@charactersforparty.com',
  origin: 'https://charactersforparty.com',
  // The city pages linked from the site's own footer catalog.
  cities: [
    { page: 'new-york-ny', city: 'New York', state: 'NY' },
    { page: 'los-angeles-ca', city: 'Los Angeles', state: 'CA' },
    { page: 'chicago-il', city: 'Chicago', state: 'IL' },
    { page: 'houston-tx', city: 'Houston', state: 'TX' },
    { page: 'dallas-tx', city: 'Dallas', state: 'TX' },
    { page: 'austin-tx', city: 'Austin', state: 'TX' },
    { page: 'san-antonio-tx', city: 'San Antonio', state: 'TX' },
    { page: 'san-diego-ca', city: 'San Diego', state: 'CA' },
    { page: 'san-francisco-ca', city: 'San Francisco', state: 'CA' },
    { page: 'las-vegas-nv', city: 'Las Vegas', state: 'NV' },
    { page: 'phoenix-az', city: 'Phoenix', state: 'AZ' },
    { page: 'denver-co', city: 'Denver', state: 'CO' },
    { page: 'atlanta-ga', city: 'Atlanta', state: 'GA' },
    { page: 'miami-fl', city: 'Miami', state: 'FL' },
    { page: 'tampa-fl', city: 'Tampa', state: 'FL' },
    { page: 'philadelphia-pa', city: 'Philadelphia', state: 'PA' },
  ],
};

/** The six categories the business files itself under, primary first. */
const CATEGORY_SLUGS = ['superheroes', 'mascots', 'princesses', 'star-wars', 'non-mascots', 'holidays'];

init();

const country = db.prepare("SELECT id FROM countries WHERE code = 'US'").get();
if (!country) throw new Error('US country row missing — run Database/reset.js first');

const categories = new Map(
  db
    .prepare('SELECT id, slug FROM categories')
    .all()
    .map((row) => [row.slug, row.id]),
);
for (const slug of CATEGORY_SLUGS) {
  if (!categories.has(slug)) throw new Error(`category "${slug}" missing from the database`);
}
const primaryCategoryId = categories.get(CATEGORY_SLUGS[0]);

const getState = db.prepare('SELECT id, name FROM states WHERE country_id = ? AND code = ?');
const getCity = db.prepare('SELECT id, name FROM cities WHERE state_id = ? AND slug = ?');
const findListing = db.prepare('SELECT id, name, slug FROM listings WHERE slug = ?');
const insertListing = db.prepare(
  `INSERT INTO listings
     (name, slug, category_id, country_id, state_id, city_id, website, phone, email, is_featured, status)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'active')`
);
const addCategory = db.prepare('INSERT OR IGNORE INTO listing_categories (listing_id, category_id) VALUES (?, ?)');

const plan = [];
const problems = [];

for (const entry of BUSINESS.cities) {
  const state = getState.get(country.id, entry.state);
  if (!state) {
    problems.push(`${entry.city}, ${entry.state} — state ${entry.state} not in the database`);
    continue;
  }
  const city = getCity.get(state.id, slugify(entry.city));
  if (!city) {
    problems.push(`${entry.city}, ${entry.state} — no cities row for that state`);
    continue;
  }
  plan.push({
    name: `${BUSINESS.brand} - ${city.name}`,
    website: `${BUSINESS.origin}/birthday-party-character-rental/${entry.page}/`,
    stateId: state.id,
    cityId: city.id,
    cityName: `${city.name}, ${entry.state}`,
  });
}

console.log(`${BUSINESS.brand} — ${plan.length} city listing(s) planned, ${problems.length} skipped`);
if (problems.length) {
  for (const problem of problems) console.log(`  skipped: ${problem}`);
}

const existing = plan.map((item) => ({ ...item, slug: slugify(item.name) })).map((item) => ({
  ...item,
  found: findListing.get(item.slug) || null,
}));

console.log('');
console.log('city                  | listing                         | state');
for (const item of existing) {
  const status = item.found ? `existing #${item.found.id}` : 'new';
  console.log(`${item.cityName.padEnd(21)} | ${item.name.padEnd(31)} | ${status}`);
}

if (!APPLY) {
  console.log('\nDRY RUN — nothing written. Re-run with "apply".');
  close();
  process.exit(0);
}

let created = 0;
let linked = 0;
db.exec('BEGIN');
try {
  for (const item of existing) {
    let listingId = item.found?.id ?? null;
    if (listingId === null) {
      const result = insertListing.run(
        item.name,
        item.slug,
        primaryCategoryId,
        country.id,
        item.stateId,
        item.cityId,
        item.website,
        BUSINESS.phone,
        BUSINESS.email,
      );
      listingId = Number(result.lastInsertRowid);
      created += 1;
    }
    for (const slug of CATEGORY_SLUGS) {
      linked += addCategory.run(listingId, categories.get(slug)).changes;
    }
  }
  db.exec('COMMIT');
} catch (error) {
  db.exec('ROLLBACK');
  throw error;
}

console.log(`\ncreated ${created} listing(s), added ${linked} category link(s)`);

const ids = existing.map((item) => item.found?.id ?? null).filter(Boolean);
const rows = db
  .prepare(
    `SELECT l.id, l.name, l.slug, c.name AS city, s.code AS state,
            (SELECT COUNT(*) FROM listing_categories lc WHERE lc.listing_id = l.id) AS cats
       FROM listings l
       LEFT JOIN cities c ON c.id = l.city_id
       LEFT JOIN states s ON s.id = l.state_id
      WHERE l.slug LIKE 'party-characters-for-kids-%'
      ORDER BY l.id`
  )
  .all();
console.log(`\nrows now matching this business: ${rows.length}` + (ids.length ? ` (${ids.length} touched just now)` : ''));
for (const row of rows) {
  console.log(`  #${row.id} ${row.name} | ${row.city}, ${row.state} | categories=${row.cats}`);
}

close();
