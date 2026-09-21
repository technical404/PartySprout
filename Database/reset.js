'use strict';

/** Drops the local database file and rebuilds it from schema + reference seed data. */

const fs = require('node:fs');
const path = require('node:path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'directory.db');

for (const suffix of ['', '-wal', '-shm']) {
  const file = DB_PATH + suffix;
  if (fs.existsSync(file)) {
    fs.rmSync(file);
    console.log(`Removed ${file}`);
  }
}

const { init } = require('./index');
init();

const { db } = require('./index');
const counts = {
  categories: db.prepare('SELECT COUNT(*) AS c FROM categories').get().c,
  countries: db.prepare('SELECT COUNT(*) AS c FROM countries').get().c,
  states: db.prepare('SELECT COUNT(*) AS c FROM states').get().c,
  cities: db.prepare('SELECT COUNT(*) AS c FROM cities').get().c,
  listings: db.prepare('SELECT COUNT(*) AS c FROM listings').get().c,
  listing_categories: db.prepare('SELECT COUNT(*) AS c FROM listing_categories').get().c
};

console.log('Database rebuilt at', DB_PATH);
console.table(counts);
