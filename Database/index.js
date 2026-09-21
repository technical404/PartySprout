'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { CATEGORIES, SUBCATEGORIES, COUNTRY, STATES, slugify } = require('./seed-data');

// node:sqlite is stable enough for this app but still prints an experimental notice.
// Drop just that notice so normal startup output stays readable.
const originalEmit = process.emit;
process.emit = function (name, data, ...rest) {
  if (name === 'warning' && data && data.name === 'ExperimentalWarning' && /SQLite/i.test(data.message || '')) {
    return false;
  }
  return originalEmit.call(process, name, data, ...rest);
};

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'directory.db');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA journal_mode = WAL;');

function migrate() {
  db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
  // schema.sql only ever creates *missing* tables, so columns added after a
  // database already exists have to be applied here.
  addColumn('listings', 'icon_url', 'TEXT');
  // Businesses submitted through /list-your-business: who sent it, and the city
  // exactly as typed when it does not match a reference city row.
  addColumn('listings', 'submitted_by', 'INTEGER REFERENCES users(id) ON DELETE SET NULL');
  addColumn('listings', 'city_text', 'TEXT');
  addColumn('listings', 'review_note', 'TEXT');
  // Links a quote request to the account that sent it, when there was one.
  addColumn('quote_requests', 'user_id', 'INTEGER REFERENCES users(id) ON DELETE SET NULL');
}

function addColumn(table, column, type) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (columns.some((c) => c.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
}

/**
 * Seeds only the reference tables (country, states, cities, categories).
 * The listings table is deliberately left empty.
 */
function seed() {
  const { c: categoryCount } = db.prepare('SELECT COUNT(*) AS c FROM categories').get();
  if (categoryCount === 0) {
    const insert = db.prepare(
      'INSERT INTO categories (slug, name, tagline, icon, sort_order) VALUES (?, ?, ?, ?, ?)'
    );
    CATEGORIES.forEach((category, index) => {
      insert.run(category.slug, category.name, category.tagline, category.icon, index + 1);
    });
  }

  seedSubcategories();

  const { c: countryCount } = db.prepare('SELECT COUNT(*) AS c FROM countries').get();
  if (countryCount > 0) return;

  const insertCountry = db.prepare('INSERT INTO countries (code, name, dial_code) VALUES (?, ?, ?)');
  const insertState = db.prepare('INSERT INTO states (country_id, code, name) VALUES (?, ?, ?)');
  const insertCity = db.prepare('INSERT INTO cities (state_id, name, slug) VALUES (?, ?, ?)');

  const { lastInsertRowid: countryId } = insertCountry.run(COUNTRY.code, COUNTRY.name, COUNTRY.dial_code);

  for (const [code, [name, cities]] of Object.entries(STATES)) {
    const { lastInsertRowid: stateId } = insertState.run(Number(countryId), code, name);
    for (const city of cities) {
      insertCity.run(Number(stateId), city, slugify(city));
    }
  }
}

/**
 * Seeds the curated specialty labels per category. Runs independently of the
 * country seeding below so that an already-populated database still picks them
 * up after an upgrade.
 */
function seedSubcategories() {
  const { c: subcategoryCount } = db.prepare('SELECT COUNT(*) AS c FROM subcategories').get();
  if (subcategoryCount > 0) return;

  const categoryIdBySlug = new Map(
    db.prepare('SELECT id, slug FROM categories').all().map((row) => [row.slug, row.id])
  );
  if (categoryIdBySlug.size === 0) return;

  const insert = db.prepare(
    'INSERT OR IGNORE INTO subcategories (category_id, slug, name, sort_order) VALUES (?, ?, ?, ?)'
  );
  for (const [categorySlug, names] of Object.entries(SUBCATEGORIES)) {
    const categoryId = categoryIdBySlug.get(categorySlug);
    if (!categoryId) continue;
    names.forEach((name, index) => insert.run(categoryId, slugify(name), name, index + 1));
  }
}

function init() {
  migrate();
  seed();
  return db;
}

/** Closes the SQLite handle; without this Node can abort on exit on Windows. */
function close() {
  try {
    db.close();
  } catch {
    /* already closed */
  }
}

module.exports = { db, init, close, DB_PATH };
