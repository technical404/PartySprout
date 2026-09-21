'use strict';

/**
 * Every read/write the UI performs goes through this module, so the storage
 * engine can be swapped without touching routes or views.
 */

const { db } = require('./index');

const PAGE_SIZE = 9;

/** Empty form fields become NULL so the tables never fill with empty strings. */
function nullableText(value) {
  const text = String(value ?? '').trim();
  return text === '' ? null : text;
}

/**
 * Cities that actually have active listings, most-populated first. Powers the
 * homepage "Browse by city" section, so empty seed cities are left out.
 */
function listCitiesWithCounts(limit = 12) {
  return db
    .prepare(
      `SELECT ci.id, ci.name, s.code AS state_code,
              COUNT(*) AS listing_count
         FROM listings l
         JOIN cities ci ON ci.id = l.city_id
         JOIN states s  ON s.id  = ci.state_id
        WHERE l.status = 'active'
        GROUP BY ci.id
        ORDER BY listing_count DESC, ci.name
        LIMIT ?`
    )
    .all(limit);
}

/** Specialty labels grouped by category slug, e.g. { superheroes: ["…"] }. */
function subcategoriesByCategory() {
  const rows = db
    .prepare(
      `SELECT c.slug AS category_slug, sc.name
         FROM subcategories sc
         JOIN categories c ON c.id = sc.category_id
        WHERE c.is_active = 1
        ORDER BY c.sort_order, sc.sort_order`
    )
    .all();

  const grouped = new Map();
  for (const row of rows) {
    if (!grouped.has(row.category_slug)) grouped.set(row.category_slug, []);
    grouped.get(row.category_slug).push(row.name);
  }
  return grouped;
}

function listCategories() {
  const subcategories = subcategoriesByCategory();
  return db
    .prepare(
      `SELECT c.id, c.slug, c.name, c.tagline, c.icon,
              (SELECT COUNT(DISTINCT lc.listing_id)
                 FROM listing_categories lc
                 JOIN listings l ON l.id = lc.listing_id
                WHERE lc.category_id = c.id AND l.status = 'active') AS listing_count
         FROM categories c
        WHERE c.is_active = 1
        ORDER BY c.sort_order`
    )
    .all()
    .map((row) => ({ ...row, subcategories: subcategories.get(row.slug) ?? [] }));
}

function getCategoryBySlug(slug) {
  return db.prepare('SELECT * FROM categories WHERE slug = ? AND is_active = 1').get(slug);
}

function listCountries() {
  return db
    .prepare('SELECT id, code, name, dial_code FROM countries WHERE is_active = 1 ORDER BY name')
    .all();
}

function getCountryByCode(code) {
  return db
    .prepare('SELECT id, code, name FROM countries WHERE code = ? AND is_active = 1')
    .get(String(code ?? '').toUpperCase()) ?? null;
}

/** Cities arrive as ids from the type-ahead, so every id is re-checked here. */
function getCityById(id) {
  return (
    db
      .prepare(
        `SELECT ci.id, ci.name, ci.slug, ci.state_id, s.code AS state_code, s.country_id
           FROM cities ci JOIN states s ON s.id = ci.state_id
          WHERE ci.id = ?`
      )
      .get(id) ?? null
  );
}

function listStates(countryId) {
  return db
    .prepare(
      `SELECT s.id, s.code, s.name
         FROM states s
        WHERE s.country_id = ?
        ORDER BY s.name`
    )
    .all(countryId);
}

/** Cities are always read from the database, optionally scoped to a state. */
function listCities({ countryId, stateId } = {}) {
  if (stateId) {
    return db
      .prepare(
        `SELECT ci.id, ci.name, ci.slug, s.code AS state_code, s.name AS state_name
           FROM cities ci
           JOIN states s ON s.id = ci.state_id
          WHERE ci.state_id = ?
          ORDER BY ci.name`
      )
      .all(stateId);
  }

  if (countryId) {
    return db
      .prepare(
        `SELECT ci.id, ci.name, ci.slug, s.code AS state_code, s.name AS state_name
           FROM cities ci
           JOIN states s ON s.id = ci.state_id
          WHERE s.country_id = ?
          ORDER BY ci.name`
      )
      .all(countryId);
  }

  return db
    .prepare(
      `SELECT ci.id, ci.name, ci.slug, s.code AS state_code, s.name AS state_name
         FROM cities ci
         JOIN states s ON s.id = ci.state_id
        ORDER BY ci.name`
    )
    .all();
}

function buildFilters(filters) {
  const where = ["l.status = 'active'"];
  const params = [];

  if (filters.q) {
    where.push('(l.name LIKE ? OR l.description LIKE ?)');
    const like = `%${filters.q}%`;
    params.push(like, like);
  }
  if (filters.categoryId) {
    // Match any category the business belongs to, not just its primary one.
    where.push('EXISTS (SELECT 1 FROM listing_categories lc WHERE lc.listing_id = l.id AND lc.category_id = ?)');
    params.push(filters.categoryId);
  }
  if (filters.countryId) {
    where.push('l.country_id = ?');
    params.push(filters.countryId);
  }
  if (filters.cityId) {
    where.push('l.city_id = ?');
    params.push(filters.cityId);
  }
  if (filters.city) {
    // Match the reference city, the free-text city a submission typed, or a
    // state code. Deliberately not l.name: a business called "Dallas Heroes"
    // should not answer a Dallas location search by accident.
    where.push('(ci.name LIKE ? OR l.city_text LIKE ? OR s.code = ?)');
    const like = `%${filters.city}%`;
    params.push(like, like, String(filters.city).toUpperCase());
  }
  if (filters.priceMin != null) {
    // Businesses with no published price cannot claim to be under a budget.
    where.push('l.price_from IS NOT NULL AND l.price_from >= ?');
    params.push(filters.priceMin);
  }
  if (filters.priceMax != null) {
    where.push('l.price_from IS NOT NULL AND l.price_from <= ?');
    params.push(filters.priceMax);
  }
  if (filters.ratingMin != null) {
    where.push('l.rating IS NOT NULL AND l.rating >= ?');
    params.push(filters.ratingMin);
  }
  if (filters.featuredOnly) {
    where.push('l.is_featured = 1');
  }

  return { clause: where.join(' AND '), params };
}

/** Whitelisted sort keys, so a query parameter can never inject SQL. */
const SORTS = {
  relevance: 'l.is_featured DESC, l.name',
  name: 'l.name',
  price_asc: 'l.price_from IS NULL, l.price_from ASC, l.name',
  price_desc: 'l.price_from IS NULL, l.price_from DESC, l.name',
  rating: 'l.rating IS NULL, l.rating DESC, l.name',
  newest: 'l.created_at DESC, l.id DESC',
};

function orderClause(sort) {
  return SORTS[sort] || SORTS.relevance;
}


function countListings(filters = {}) {
  const { clause, params } = buildFilters(filters);
  const row = db
    .prepare(
      `SELECT COUNT(*) AS total
         FROM listings l
         LEFT JOIN cities ci ON ci.id = l.city_id
         LEFT JOIN states s ON s.id = l.state_id
        WHERE ${clause}`
    )
    .get(...params);
  return row.total;
}

/**
 * The one place listing rows are shaped for the UI. Every listing-returning
 * query goes through here so favourites, search results and a vendor's own
 * listings always carry the same columns.
 */
function selectListings(whereSql, params, { order = 'l.name', limit, offset = 0 } = {}) {
  const paged = limit == null ? '' : ' LIMIT ? OFFSET ?';
  const args = limit == null ? params : [...params, limit, offset];
  return db
    .prepare(
      `SELECT l.id, l.name, l.slug, l.description, l.website, l.icon_url, l.phone, l.price_from, l.rating, l.is_featured,
              l.status, l.created_at,
              c.name AS category_name, c.slug AS category_slug, c.icon AS category_icon,
              COALESCE(ci.name, l.city_text) AS city_name,
              CASE WHEN ci.id IS NULL THEN NULL ELSE s.code END AS state_code,
              co.code AS country_code
         FROM listings l
         JOIN categories c ON c.id = l.category_id
         JOIN countries  co ON co.id = l.country_id
         LEFT JOIN cities ci ON ci.id = l.city_id
         LEFT JOIN states s  ON s.id  = l.state_id
        WHERE ${whereSql}
        ORDER BY ${order}${paged}`
    )
    .all(...args);
}

function listListings(filters = {}, { page = 1, pageSize = PAGE_SIZE, sort } = {}) {
  const { clause, params } = buildFilters(filters);
  const offset = (Math.max(1, page) - 1) * pageSize;
  return selectListings(clause, params, {
    order: orderClause(sort || filters.sort),
    limit: pageSize,
    offset,
  });
}

/** Public lookup: only approved businesses are visible at their own URL. */
function getListingBySlug(slug) {
  return db
    .prepare(
      `SELECT l.*, c.name AS category_name, c.slug AS category_slug, c.icon AS category_icon,
              COALESCE(ci.name, l.city_text) AS city_name,
              CASE WHEN ci.id IS NULL THEN NULL ELSE s.code END AS state_code,
              co.name AS country_name
         FROM listings l
         JOIN categories c ON c.id = l.category_id
         JOIN countries  co ON co.id = l.country_id
         LEFT JOIN cities ci ON ci.id = l.city_id
         LEFT JOIN states s  ON s.id  = l.state_id
        WHERE l.slug = ? AND l.status = 'active'`
    )
    .get(slug);
}

/** Owner/admin lookup that also returns pending and rejected rows. */
function getListingById(id) {
  return db
    .prepare(
      `SELECT l.*, c.name AS category_name, c.slug AS category_slug, c.icon AS category_icon,
              COALESCE(ci.name, l.city_text) AS city_name,
              CASE WHEN ci.id IS NULL THEN NULL ELSE s.code END AS state_code
         FROM listings l
         JOIN categories c ON c.id = l.category_id
         LEFT JOIN cities ci ON ci.id = l.city_id
         LEFT JOIN states s  ON s.id  = l.state_id
        WHERE l.id = ?`
    )
    .get(id);
}

function uniqueListingSlug(name) {
  const base = String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'business';

  let slug = base;
  let n = 2;
  const exists = db.prepare('SELECT 1 FROM listings WHERE slug = ?');
  while (exists.get(slug)) {
    slug = `${base}-${n++}`;
  }
  return slug;
}

function addListingCategory(listingId, categoryId) {
  db.prepare('INSERT OR IGNORE INTO listing_categories (listing_id, category_id) VALUES (?, ?)').run(
    listingId,
    categoryId
  );
}

function getListingCategories(listingId) {
  return db
    .prepare(
      `SELECT c.id, c.slug, c.name, c.icon
         FROM listing_categories lc
         JOIN categories c ON c.id = lc.category_id
        WHERE lc.listing_id = ?
        ORDER BY c.sort_order`
    )
    .all(listingId);
}

/**
 * Stores a submitted quote request. `data` is validated by the caller; the
 * optional columns are normalised to NULL so empty form fields do not litter
 * the table with empty strings.
 */
function createQuoteRequest(data) {
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO quote_requests
         (name, email, phone, city, event_date, guest_count, child_age, category_slug, budget, details,
          vendor_id, user_id, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      String(data.name).trim(),
      String(data.email).trim(),
      nullableText(data.phone),
      nullableText(data.city),
      nullableText(data.eventDate),
      nullableText(data.guestCount),
      nullableText(data.childAge),
      nullableText(data.categorySlug),
      nullableText(data.budget),
      nullableText(data.details),
      data.vendorId ?? null,
      data.userId ?? null,
      nullableText(data.source) || 'web'
    );

  return { id: Number(lastInsertRowid) };
}

function countQuoteRequests() {
  return db.prepare('SELECT COUNT(*) AS total FROM quote_requests').get().total;
}

function createListing(data) {
  const slug = uniqueListingSlug(data.name);
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO listings
         (name, slug, category_id, country_id, state_id, city_id, description, website, phone, email, price_from)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      data.name,
      slug,
      data.categoryId,
      data.countryId,
      data.stateId || null,
      data.cityId || null,
      data.description || null,
      data.website || null,
      data.phone || null,
      data.email || null,
      data.priceFrom ?? null
    );

  const listingId = Number(lastInsertRowid);
  addListingCategory(listingId, data.categoryId);

  return getListingBySlug(slug) || { id: listingId, slug };
}

/** Public capability numbers, so the UI never advertises a filter with no data. */
function directorySummary() {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS listings,
              SUM(ci.id IS NOT NULL OR l.city_text IS NOT NULL) AS cities,
              SUM(l.price_from IS NOT NULL) AS priced_listings,
              MIN(l.price_from) AS min_price,
              MAX(l.price_from) AS max_price
         FROM listings l
         LEFT JOIN cities ci ON ci.id = l.city_id
        WHERE l.status = 'active'`
    )
    .get();
  return {
    listings: row.listings ?? 0,
    cities: row.cities ?? 0,
    categories: db.prepare('SELECT COUNT(*) AS c FROM categories WHERE is_active = 1').get().c,
    pricedListings: row.priced_listings ?? 0,
    minPrice: row.min_price ?? null,
    maxPrice: row.max_price ?? null,
  };
}

/** City type-ahead: real cities with their live listing counts. */
function searchCities(term, limit = 8) {
  return db
    .prepare(
      `SELECT ci.id, ci.name, s.code AS state_code,
              COUNT(l.id) AS listing_count
         FROM cities ci
         JOIN states s ON s.id = ci.state_id
         LEFT JOIN listings l ON l.city_id = ci.id AND l.status = 'active'
        WHERE ci.name LIKE ?
        GROUP BY ci.id
        ORDER BY listing_count DESC, ci.name
        LIMIT ?`
    )
    .all(`%${term}%`, limit);
}

/* ------------------------------------------------------------------------- */
/* Accounts                                                                   */
/* ------------------------------------------------------------------------- */

function getUserByEmail(email) {
  return (
    db
      .prepare('SELECT * FROM users WHERE email = ?')
      .get(String(email ?? '').trim().toLowerCase()) ?? null
  );
}

function getUserById(id) {
  return db
    .prepare('SELECT id, email, name, phone, role, listing_id, status, created_at FROM users WHERE id = ?')
    .get(id) ?? null;
}

function createUser({ email, name, phone, passwordHash, role = 'parent' }) {
  const { lastInsertRowid } = db
    .prepare('INSERT INTO users (email, name, phone, password_hash, role) VALUES (?, ?, ?, ?, ?)')
    .run(String(email).trim().toLowerCase(), String(name).trim(), nullableText(phone), passwordHash, role);
  return getUserById(Number(lastInsertRowid));
}

function updateUserProfile(userId, { name, phone }) {
  db.prepare('UPDATE users SET name = ?, phone = ? WHERE id = ?').run(
    String(name).trim(),
    nullableText(phone),
    userId
  );
  return getUserById(userId);
}

/** Used to upgrade a legacy hash to the current scheme after a good login. */
function setUserPassword(userId, passwordHash) {
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, userId);
}

/** Links a vendor account to the business it manages. */
function setUserListing(userId, listingId) {
  db.prepare('UPDATE users SET listing_id = ? WHERE id = ?').run(listingId, userId);
}

/* ------------------------------------------------------------------------- */
/* Saved businesses                                                           */
/* ------------------------------------------------------------------------- */

function favoriteIds(userId) {
  return db
    .prepare('SELECT listing_id FROM favorites WHERE user_id = ? ORDER BY created_at DESC')
    .all(userId)
    .map((row) => row.listing_id);
}

/** Idempotent: saving twice is not an error, it is the same saved state. */
function addFavorite(userId, listingId) {
  db.prepare('INSERT OR IGNORE INTO favorites (user_id, listing_id) VALUES (?, ?)').run(userId, listingId);
  return favoriteIds(userId);
}

function removeFavorite(userId, listingId) {
  db.prepare('DELETE FROM favorites WHERE user_id = ? AND listing_id = ?').run(userId, listingId);
  return favoriteIds(userId);
}

/** Saved businesses that are still live, newest save first. */
function listFavoriteListings(userId) {
  const ids = favoriteIds(userId);
  if (ids.length === 0) return [];
  const byId = new Map(listListingsByIds(ids).map((row) => [row.id, row]));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

/** Listing rows for an explicit id list (favourites, compare, guest merges). */
function listListingsByIds(ids) {
  const clean = [...new Set(ids.map(Number).filter((id) => Number.isInteger(id) && id > 0))].slice(0, 100);
  if (clean.length === 0) return [];
  const placeholders = clean.map(() => '?').join(', ');
  return selectListings(`l.status = 'active' AND l.id IN (${placeholders})`, clean);
}

/* ------------------------------------------------------------------------- */
/* Business submissions and admin review                                      */
/* ------------------------------------------------------------------------- */

function createSubmission(data) {
  const slug = uniqueListingSlug(data.name);
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO listings
         (name, slug, category_id, country_id, state_id, city_id, city_text, description,
          website, phone, email, price_from, status, submitted_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`
    )
    .run(
      String(data.name).trim(),
      slug,
      data.categoryId,
      data.countryId,
      data.stateId ?? null,
      data.cityId ?? null,
      nullableText(data.cityText),
      nullableText(data.description),
      nullableText(data.website),
      nullableText(data.phone),
      nullableText(data.email),
      data.priceFrom ?? null,
      data.submittedBy ?? null
    );

  const listingId = Number(lastInsertRowid);
  addListingCategory(listingId, data.categoryId);
  return getListingById(listingId);
}

/** Pending first, then oldest first, so the review queue is a real queue. */
function listSubmissions(status = 'pending') {
  return selectListings('l.status = ?', [status], { order: 'l.created_at, l.id' });
}

function countListingsByStatus() {
  return db
    .prepare('SELECT status, COUNT(*) AS total FROM listings GROUP BY status ORDER BY status')
    .all();
}

/** Case-insensitive name lookup across every status, for duplicate submissions. */
function findListingByName(name) {
  return (
    db.prepare('SELECT id, name, slug, status FROM listings WHERE lower(name) = lower(?)').get(String(name ?? '').trim()) ??
    null
  );
}

function listListingsByOwner(ownerId) {
  return selectListings('l.submitted_by = ?', [ownerId], { order: 'l.created_at DESC' });
}

/** Approve (status active) or reject, with an optional note for the submitter. */
function setListingStatus(listingId, status, reviewNote = null) {
  db.prepare('UPDATE listings SET status = ?, review_note = ? WHERE id = ?').run(
    status,
    nullableText(reviewNote),
    listingId
  );
  return getListingById(listingId);
}

function updateListing(listingId, data) {
  db.prepare(
    `UPDATE listings
        SET name = ?, description = ?, website = ?, phone = ?, email = ?, price_from = ?,
            city_id = ?, city_text = ?
      WHERE id = ?`
  ).run(
    String(data.name).trim(),
    nullableText(data.description),
    nullableText(data.website),
    nullableText(data.phone),
    nullableText(data.email),
    data.priceFrom ?? null,
    data.cityId ?? null,
    nullableText(data.cityText),
    listingId
  );
  return getListingById(listingId);
}

/* ------------------------------------------------------------------------- */
/* Quote requests                                                             */
/* ------------------------------------------------------------------------- */

/**
 * The quote requests a parent account actually submitted. Matches on user_id
 * and on the account's email, so requests sent before signing up are not lost.
 */
function listQuoteRequestsForUser(user) {
  return db
    .prepare(
      `SELECT q.*, l.name AS vendor_name, l.slug AS vendor_slug
         FROM quote_requests q
         LEFT JOIN listings l ON l.id = q.vendor_id
        WHERE q.user_id = ? OR lower(q.email) = lower(?)
        ORDER BY q.created_at DESC, q.id DESC`
    )
    .all(user.id, user.email);
}

/** Leads for one business: what a vendor sees in their dashboard. */
function listQuoteRequestsForListing(listingId) {
  return db
    .prepare(
      `SELECT * FROM quote_requests
        WHERE vendor_id = ?
        ORDER BY created_at DESC, id DESC`
    )
    .all(listingId);
}

function listRecentQuoteRequests(limit = 20) {
  return db
    .prepare(
      `SELECT q.*, l.name AS vendor_name
         FROM quote_requests q
         LEFT JOIN listings l ON l.id = q.vendor_id
        ORDER BY q.created_at DESC, q.id DESC
        LIMIT ?`
    )
    .all(limit);
}

/* ------------------------------------------------------------------------- */
/* Directory stats (admin dashboard)                                          */
/* ------------------------------------------------------------------------- */

function directoryStats() {
  const one = (sql) => db.prepare(sql).get().total;
  return {
    listings: one("SELECT COUNT(*) AS total FROM listings WHERE status = 'active'"),
    pending: one("SELECT COUNT(*) AS total FROM listings WHERE status = 'pending'"),
    rejected: one("SELECT COUNT(*) AS total FROM listings WHERE status = 'rejected'"),
    cities: one('SELECT COUNT(*) AS total FROM cities'),
    categories: one('SELECT COUNT(*) AS total FROM categories WHERE is_active = 1'),
    users: one("SELECT COUNT(*) AS total FROM users WHERE status = 'active'"),
    vendors: one("SELECT COUNT(*) AS total FROM users WHERE role = 'vendor'"),
    quoteRequests: one('SELECT COUNT(*) AS total FROM quote_requests'),
    quotesLast7Days: one(
      "SELECT COUNT(*) AS total FROM quote_requests WHERE created_at >= datetime('now', '-7 days')"
    ),
    favorites: one('SELECT COUNT(*) AS total FROM favorites'),
  };
}

module.exports = {
  PAGE_SIZE,
  listCategories,
  getCategoryBySlug,
  listCountries,
  getCountryByCode,
  getCityById,
  listStates,
  listCities,
  listCitiesWithCounts,
  searchCities,
  directorySummary,
  subcategoriesByCategory,
  buildFilters,
  countListings,
  listListings,
  listListingsByIds,
  getListingBySlug,
  getListingById,
  getListingCategories,
  addListingCategory,
  createQuoteRequest,
  countQuoteRequests,
  listQuoteRequestsForUser,
  listQuoteRequestsForListing,
  listRecentQuoteRequests,
  createListing,
  createSubmission,
  findListingByName,
  listSubmissions,
  listListingsByOwner,
  setListingStatus,
  updateListing,
  countListingsByStatus,
  getUserByEmail,
  getUserById,
  createUser,
  updateUserProfile,
  setUserPassword,
  setUserListing,
  favoriteIds,
  addFavorite,
  removeFavorite,
  listFavoriteListings,
  directoryStats,
};
