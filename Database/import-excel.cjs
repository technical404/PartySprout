'use strict';

const fs = require('node:fs');
const path = require('node:path');
const XLSX = require('xlsx');
const { init, db, close } = require('./index.js');
const { slugify } = require('./seed-data.js');

const CATEGORY_ALIASES = {
  superheroes: 'superheroes',
  mascots: 'mascots',
  princesses: 'princesses',
  'star wars': 'star-wars',
  'non mascots': 'non-mascots',
  clowns: 'clowns',
  pirates: 'pirates',
  holidays: 'holidays',
  fairy: 'fairy',
  fairies: 'fairy',
  magicians: 'magicians',
};

function parseCityState(raw) {
  const value = String(raw || '').trim();
  const match = value.match(/^(.*)\s+([A-Z]{2})$/);
  if (!match) return { city: value, stateCode: null };
  return { city: match[1].trim(), stateCode: match[2] };
}

function main() {
  init();

  const xlsxPath = path.join(__dirname, 'party_characters_data (1).xlsx');
  if (!fs.existsSync(xlsxPath)) {
    throw new Error(`Excel file not found: ${xlsxPath}`);
  }

  const wb = XLSX.readFile(xlsxPath);
  const sheet = wb.Sheets.Data;
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null }).slice(3);

  const categories = db.prepare('SELECT id, slug, name FROM categories').all();
  const categoryBySlug = new Map(categories.map((c) => [c.slug, c]));
  const country = db.prepare('SELECT id FROM countries WHERE code = ?').get('US');
  if (!country) throw new Error('US country missing — run Database/reset.js first');

  const getState = db.prepare('SELECT id, code FROM states WHERE country_id = ? AND code = ?');
  const getCity = db.prepare('SELECT id FROM cities WHERE state_id = ? AND slug = ?');
  const insertCity = db.prepare('INSERT INTO cities (state_id, name, slug) VALUES (?, ?, ?)');
  const findListing = db.prepare('SELECT id, slug FROM listings WHERE slug = ?');
  const findByNameWeb = db.prepare(
    "SELECT id, slug FROM listings WHERE name = ? AND COALESCE(website, '') = COALESCE(?, '')"
  );
  const insertListing = db.prepare(
    `INSERT INTO listings
       (name, slug, category_id, country_id, state_id, city_id, description, website, phone, price_from, rating, is_featured, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`
  );
  const addCat = db.prepare('INSERT OR IGNORE INTO listing_categories (listing_id, category_id) VALUES (?, ?)');

  function uniqueSlug(name) {
    const base = slugify(name) || 'business';
    let slug = base;
    let n = 2;
    while (findListing.get(slug)) slug = `${base}-${n++}`;
    return slug;
  }

  db.exec('BEGIN');
  try {
    let created = 0;
    let linked = 0;
    let skipped = 0;

    for (const row of rows) {
      const categoryName = row?.[0];
      const cityRaw = row?.[1];
      const name = row?.[2];
      if (!name || !categoryName) {
        skipped += 1;
        continue;
      }

      const slugKey = CATEGORY_ALIASES[String(categoryName).trim().toLowerCase()];
      const category = slugKey ? categoryBySlug.get(slugKey) : null;
      if (!category) {
        skipped += 1;
        continue;
      }

      const phone = row[3] ? String(row[3]) : null;
      const address = row[4] ? String(row[4]) : null;
      const website = row[5] ? String(row[5]) : null;
      const rating = row[6] != null && row[6] !== '' ? Number(row[6]) : null;
      const reviews = row[7] != null && row[7] !== '' ? Number(row[7]) : null;
      const businessType = row[8] ? String(row[8]) : null;

      const { city, stateCode } = parseCityState(cityRaw);
      const state = stateCode ? getState.get(country.id, stateCode) : null;
      let cityId = null;
      if (state && city) {
        const citySlug = slugify(city);
        const existing = getCity.get(state.id, citySlug);
        if (existing) cityId = existing.id;
        else {
          const { lastInsertRowid } = insertCity.run(state.id, city, citySlug);
          cityId = Number(lastInsertRowid);
        }
      }

      const descriptionParts = [];
      if (businessType) descriptionParts.push(businessType);
      if (address) descriptionParts.push(address);
      if (reviews) descriptionParts.push(`${reviews} Google reviews`);
      const description = descriptionParts.join(' · ') || null;

      let listing = findByNameWeb.get(String(name), website);
      if (!listing) {
        const slug = uniqueSlug(String(name));
        const featured = rating != null && rating >= 4.8 ? 1 : 0;
        const { lastInsertRowid } = insertListing.run(
          String(name),
          slug,
          category.id,
          country.id,
          state ? state.id : null,
          cityId,
          description,
          website,
          phone,
          null,
          Number.isFinite(rating) ? rating : null,
          featured
        );
        listing = { id: Number(lastInsertRowid), slug };
        created += 1;
      }

      addCat.run(listing.id, category.id);
      linked += 1;
    }

    db.exec('COMMIT');
    var stats = { created, linked, skipped };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  const counts = {
    listings: db.prepare('SELECT COUNT(*) AS c FROM listings').get().c,
    listing_categories: db.prepare('SELECT COUNT(*) AS c FROM listing_categories').get().c,
  };
  console.log('Import complete', stats, counts);
  close();
}

main();
