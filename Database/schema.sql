-- Schema: party character / entertainer business directory (US)
-- Every value shown in the UI (categories, country, city) is read from these tables.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS countries (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  code       TEXT    NOT NULL UNIQUE,
  name       TEXT    NOT NULL,
  dial_code  TEXT,
  is_active  INTEGER NOT NULL DEFAULT 1,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS states (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  country_id INTEGER NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
  code       TEXT    NOT NULL,
  name       TEXT    NOT NULL,
  UNIQUE (country_id, code)
);

CREATE TABLE IF NOT EXISTS cities (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  state_id INTEGER NOT NULL REFERENCES states(id) ON DELETE CASCADE,
  name     TEXT    NOT NULL,
  slug     TEXT    NOT NULL,
  UNIQUE (state_id, slug)
);

CREATE TABLE IF NOT EXISTS categories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  slug       TEXT    NOT NULL UNIQUE,
  name       TEXT    NOT NULL,
  tagline    TEXT,
  icon       TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active  INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS listings (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT    NOT NULL,
  slug         TEXT    NOT NULL UNIQUE,
  category_id  INTEGER NOT NULL REFERENCES categories(id),
  country_id   INTEGER NOT NULL REFERENCES countries(id),
  state_id     INTEGER          REFERENCES states(id),
  city_id      INTEGER          REFERENCES cities(id),
  description  TEXT,
  website      TEXT,
  -- Absolute http(s) URL of the business's own site icon, resolved once by
  -- Database/fetch-icons.cjs. NULL means "not checked yet"; '' means
  -- "checked, the site offers no usable icon".
  icon_url     TEXT,
  phone        TEXT,
  email        TEXT,
  price_from   REAL,
  rating       REAL,
  is_featured  INTEGER NOT NULL DEFAULT 0,
  status       TEXT    NOT NULL DEFAULT 'active',
  -- Set for businesses that arrived through /list-your-business rather than the
  -- importer. `submitted_by` is a users.id (no REFERENCES clause: users refers
  -- back to listings, and SQLite resolves that cycle at write time).
  submitted_by INTEGER,
  -- The city exactly as the business typed it, used only when it does not match
  -- a row in `cities`. Search matches either this or the joined city name.
  city_text    TEXT,
  -- Short reason shown to the submitter when an admin rejects a submission.
  review_note  TEXT,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_listings_category ON listings (category_id, status);
CREATE INDEX IF NOT EXISTS idx_listings_city     ON listings (city_id, status);
CREATE INDEX IF NOT EXISTS idx_listings_state    ON listings (state_id, status);
CREATE INDEX IF NOT EXISTS idx_listings_name     ON listings (name);
CREATE INDEX IF NOT EXISTS idx_cities_state      ON cities (state_id);

-- A business can serve several categories (e.g. one company doing both clowns
-- and pirates). listings.category_id stays as the primary category for display;
-- this table holds every category the business belongs to.
CREATE TABLE IF NOT EXISTS listing_categories (
  listing_id  INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (listing_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_listing_categories_category ON listing_categories (category_id);

-- Descriptive specialties shown on the back of each homepage category card.
-- Curated vocabulary rather than generated from listings: businesses do not
-- declare a specialty, so these are editorial labels for a category.
CREATE TABLE IF NOT EXISTS subcategories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  slug        TEXT    NOT NULL,
  name        TEXT    NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  UNIQUE (category_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_subcategories_category ON subcategories (category_id);

-- Quote requests submitted from /request-quote (general) or the per-vendor
-- wizard (vendor_id set). No accounts exist yet, so this is the only record.
CREATE TABLE IF NOT EXISTS quote_requests (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,
  email         TEXT    NOT NULL,
  phone         TEXT,
  city          TEXT,
  event_date    TEXT,
  guest_count   TEXT,
  child_age     TEXT,
  category_slug TEXT,
  budget        TEXT,
  details       TEXT,
  vendor_id     INTEGER REFERENCES listings(id) ON DELETE SET NULL,
  -- The account that sent it, when the sender was logged in. Guests still work;
  -- "my quotes" also matches on email so a request sent before signing up shows up.
  user_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  source        TEXT    NOT NULL DEFAULT 'web',
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_quote_requests_created ON quote_requests (created_at);
CREATE INDEX IF NOT EXISTS idx_quote_requests_vendor  ON quote_requests (vendor_id);
CREATE INDEX IF NOT EXISTS idx_quote_requests_email   ON quote_requests (email);

-- Accounts. One row per person; `role` decides what they can do:
--   parent  - submits quote requests, saves favourites
--   vendor  - additionally owns/manages the listing in `listing_id`
--   admin   - reviews pending business submissions
-- Passwords are never stored: password_hash is a scrypt hash produced by
-- Database/auth.js, which also verifies them in constant time.
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT    NOT NULL UNIQUE,
  name          TEXT    NOT NULL,
  phone         TEXT,
  password_hash TEXT    NOT NULL,
  role          TEXT    NOT NULL DEFAULT 'parent',
  listing_id    INTEGER REFERENCES listings(id) ON DELETE SET NULL,
  status        TEXT    NOT NULL DEFAULT 'active',
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_users_listing ON users (listing_id);

-- Opaque session tokens. The cookie carries only this random value; the row is
-- the source of truth, so logging out or expiring a session really revokes it.
CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user    ON sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions (expires_at);

-- Saved businesses. Guests keep theirs in localStorage and send them up on
-- login, so this table is the durable copy for logged-in users only.
CREATE TABLE IF NOT EXISTS favorites (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, listing_id)
);

CREATE INDEX IF NOT EXISTS idx_favorites_listing ON favorites (listing_id);
