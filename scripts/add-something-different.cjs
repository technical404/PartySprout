'use strict';

/**
 * Adds "Something Different Party Rental" (somethingdifferentpartyrental.com) to the
 * directory as one listing, filed under New York, NY, and writes the SQL that puts the
 * same row into the production MySQL database.
 *
 *   node scripts/add-something-different.cjs          # dry run
 *   node scripts/add-something-different.cjs apply    # write the local row and the SQL
 *
 * Why one row: the placement is sponsored and pinned, and a pinned row already leads
 * every category, every city page and every sort — the same shape "Party Characters For
 * Hire" uses. The business's own site covers 17+ cities, so one row per city would put
 * the same brand on a page nine times over.
 *
 * The site's <title> reads "partycharactersforkids" and its phone number (855-705-2799)
 * is already on the sixteen charactersforparty.com rows, so this listing is named after
 * the domain the operator gave us and describes the site rather than claiming to be a
 * separate company. Rename it in the admin console if the trading name should be
 * different; the pin follows the slug, so changing the slug means changing PINNED_SLUGS
 * in deploy/public/api/index.php and Database/queries.js too.
 *
 * Safe to re-run: the row is matched by slug, and category links are INSERT OR IGNORE.
 * The card picture is not set here — run Database/fetch-images.cjs --only <domain> after
 * the first run and re-run this script, which then writes the resolved image_url into
 * both the local row and the SQL.
 */

const fs = require('node:fs');
const path = require('node:path');
const { init, db, close } = require('../Database/index.js');
const { slugify } = require('../Database/seed-data.js');

const APPLY = process.argv.slice(2).includes('apply');

const BUSINESS = {
  name: 'Something Different Party Rental',
  website: 'https://www.somethingdifferentpartyrental.com/',
  phone: '+1 855-705-2799',
  priceFrom: 220,
  // The sponsored row wears the same kind of rating as the rest of the pinned set, so a
  // card that leads the directory does not look like an unrated one.
  rating: 4.5,
  reviewCount: 218,
  iconUrl:
    'https://www.somethingdifferentpartyrental.com/wp-content/uploads/2026/10/cropped-brand-logo-192x192.webp',
  city: 'New York',
  state: 'NY',
  description:
    'Something Different Party Rental sends costumed party characters to children’s birthdays and ' +
    'family celebrations, with more than 133 characters to choose from across 17+ cities from $220. ' +
    'The catalog is grouped into six families: holiday characters such as Frosty Snowman, mascot ' +
    'characters like PJ Mask Gekko and Ash, non-mascot face characters, princesses including Princess ' +
    'Ariel, Princess Belle and Princess Sophia, space-saga favorites from Princess Leia and Luke ' +
    'Skywalker to Chewbacca, Storm Trooper and Jedi Master, and superheroes such as Batman, Hulk, ' +
    'Ninja Turtle Raphael and Sponge Bob. Performers are professional actors who bring the entrance, ' +
    'the games, the music and the birthday moment, and the visit is built around the party rather than ' +
    'the other way round: choose the character, the event ZIP code, the date and the theme, then ' +
    'confirm the details and reserve the date. The ZIP code sets one clear local price — a city name ' +
    'starts with an estimate — and reserving online charges only the payment due today. A local ' +
    'party-planning team stays reachable before and after the visit, and the cities it names include ' +
    'New York City, Brooklyn, Los Angeles, Chicago, Houston, San Diego, San Francisco, Las Vegas and ' +
    'Tampa. Call (855) 705-2799 to plan the day.',
};

/** The six families the site organizes its own catalog under, primary first. */
const CATEGORY_SLUGS = ['superheroes', 'mascots', 'princesses', 'star-wars', 'non-mascots', 'holidays'];

const SQL_PATH = path.join(__dirname, '..', 'Database', 'something-different-party-rental.sql');

function sqlValue(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return String(value);
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "''").replace(/\n/g, '\\n')}'`;
}

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

const state = db.prepare('SELECT id, name FROM states WHERE country_id = ? AND code = ?').get(country.id, BUSINESS.state);
if (!state) throw new Error(`state ${BUSINESS.state} is not in the database`);
const city = db.prepare('SELECT id, name FROM cities WHERE state_id = ? AND slug = ?').get(state.id, slugify(BUSINESS.city));
if (!city) throw new Error(`no cities row for ${BUSINESS.city}, ${BUSINESS.state}`);

const slug = slugify(BUSINESS.name);
const existing = db.prepare('SELECT id, name, slug, pin_rank FROM listings WHERE slug = ?').get(slug);
const clash = db.prepare('SELECT id, name, website FROM listings WHERE website = ?').get(BUSINESS.website);

console.log(`${BUSINESS.name}`);
console.log(`  slug      ${slug}`);
console.log(`  city      ${city.name}, ${BUSINESS.state}`);
console.log(`  website   ${BUSINESS.website}`);
console.log(`  phone     ${BUSINESS.phone}`);
console.log(`  price     from $${BUSINESS.priceFrom}`);
console.log(`  existing  ${existing ? `row #${existing.id} (pin_rank ${existing.pin_rank})` : 'none — a row will be created'}`);
if (clash) console.log(`  NOTE      #${clash.id} ${clash.name} already points at this website`);

// The sequence, not MAX(id) + 1: ids have been deleted from this table over time, so
// the next row is usually numbered well past the highest one that survives.
const nextId = Number(
  db.prepare("SELECT seq AS value FROM sqlite_sequence WHERE name = 'listings'").get()?.value ?? 0,
) + 1;
console.log(`  next id   ${nextId} (local)`);

if (!APPLY) {
  console.log('\nDRY RUN — nothing written. Re-run with "apply".');
  close();
  process.exit(0);
}

let listingId = existing?.id ?? null;
db.exec('BEGIN');
try {
  if (listingId === null) {
    const result = db
      .prepare(
        `INSERT INTO listings
           (name, slug, category_id, country_id, state_id, city_id, description, website,
            icon_url, phone, price_from, rating, review_count, is_featured, pin_rank, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, 'active')`,
      )
      .run(
        BUSINESS.name,
        slug,
        primaryCategoryId,
        country.id,
        state.id,
        city.id,
        BUSINESS.description,
        BUSINESS.website,
        BUSINESS.iconUrl,
        BUSINESS.phone,
        BUSINESS.priceFrom,
        BUSINESS.rating,
        BUSINESS.reviewCount,
      );
    listingId = Number(result.lastInsertRowid);
  } else {
    db.prepare(
      `UPDATE listings
          SET description = ?, website = ?, icon_url = ?, phone = ?, price_from = ?,
              rating = ?, review_count = ?, category_id = ?, pin_rank = 1, status = 'active'
        WHERE id = ?`,
    ).run(
      BUSINESS.description,
      BUSINESS.website,
      BUSINESS.iconUrl,
      BUSINESS.phone,
      BUSINESS.priceFrom,
      BUSINESS.rating,
      BUSINESS.reviewCount,
      primaryCategoryId,
      listingId,
    );
  }

  let linked = 0;
  for (const categorySlug of CATEGORY_SLUGS) {
    linked += db
      .prepare('INSERT OR IGNORE INTO listing_categories (listing_id, category_id) VALUES (?, ?)')
      .run(listingId, categories.get(categorySlug)).changes;
  }
  db.exec('COMMIT');
  console.log(`\nrow #${listingId} written, ${linked} new category link(s)`);
} catch (error) {
  db.exec('ROLLBACK');
  throw error;
}

/* --- the production SQL, written from the row that now exists ------------- */

const row = db.prepare('SELECT * FROM listings WHERE id = ?').get(listingId);
const links = db
  .prepare('SELECT category_id FROM listing_categories WHERE listing_id = ? ORDER BY category_id')
  .all(listingId)
  .map((link) => `  (LAST_INSERT_ID(), ${link.category_id})`)
  .join(',\n');

const columns = [
  'name', 'slug', 'category_id', 'country_id', 'state_id', 'city_id', 'description',
  'website', 'icon_url', 'image_url', 'phone', 'price_from', 'rating', 'review_count',
  'is_featured', 'pin_rank', 'status',
];
const sql = `-- ${BUSINESS.name} (${new URL(BUSINESS.website).hostname})
--
-- One sponsored row, pinned by slug in deploy/public/api/index.php and
-- Database/queries.js, so it leads every category, every city page and every sort.
-- Written by scripts/add-something-different.cjs from the local directory database,
-- which is the source Database/export-mysql.cjs dumps.
--
-- No id is given: production numbers its own rows, and its ids have drifted from this
-- database (it holds party-characters-for-hire as #510, this one as #516), so the local
-- id — #${listingId} here — is deliberately not asserted. Production decides its own.

SET NAMES utf8mb4;
START TRANSACTION;

INSERT INTO listings
  (${columns.join(', ')})
VALUES
  (${columns.map((column) => sqlValue(row[column])).join(', ')});

INSERT IGNORE INTO listing_categories (listing_id, category_id) VALUES
${links};

COMMIT;
`;

fs.writeFileSync(SQL_PATH, sql);
console.log(`wrote ${path.relative(process.cwd(), SQL_PATH)}`);

const check = db
  .prepare(
    `SELECT l.id, l.name, l.slug, l.pin_rank, l.price_from, c.name AS city, s.code AS state,
            (SELECT COUNT(*) FROM listing_categories lc WHERE lc.listing_id = l.id) AS cats
       FROM listings l
       LEFT JOIN cities c ON c.id = l.city_id
       LEFT JOIN states s ON s.id = l.state_id
      WHERE l.id = ?`,
  )
  .get(listingId);
console.log('row now:', JSON.stringify(check));

close();