-- MySQL schema for Party Spark directory (production)

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS countries (
  id         INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  code       VARCHAR(8)  NOT NULL UNIQUE,
  name       VARCHAR(120) NOT NULL,
  dial_code  VARCHAR(16) NULL,
  is_active  TINYINT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS states (
  id         INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  country_id INT NOT NULL,
  code       VARCHAR(8) NOT NULL,
  name       VARCHAR(120) NOT NULL,
  UNIQUE KEY uq_states_country_code (country_id, code),
  CONSTRAINT fk_states_country FOREIGN KEY (country_id) REFERENCES countries(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cities (
  id       INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  state_id INT NOT NULL,
  name     VARCHAR(160) NOT NULL,
  slug     VARCHAR(180) NOT NULL,
  UNIQUE KEY uq_cities_state_slug (state_id, slug),
  KEY idx_cities_state (state_id),
  CONSTRAINT fk_cities_state FOREIGN KEY (state_id) REFERENCES states(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS categories (
  id         INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  slug       VARCHAR(80) NOT NULL UNIQUE,
  name       VARCHAR(160) NOT NULL,
  tagline    VARCHAR(255) NULL,
  icon       VARCHAR(64) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active  TINYINT NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS listings (
  id           INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name         VARCHAR(255) NOT NULL,
  slug         VARCHAR(255) NOT NULL UNIQUE,
  category_id  INT NOT NULL,
  country_id   INT NOT NULL,
  state_id     INT NULL,
  city_id      INT NULL,
  -- Free-text city for a submitted business whose town is not in `cities` yet.
  city_text    VARCHAR(160) NULL,
  description  TEXT NULL,
  website      VARCHAR(500) NULL,
  icon_url     VARCHAR(500) NULL,
  phone        VARCHAR(64) NULL,
  email        VARCHAR(255) NULL,
  price_from   DECIMAL(10,2) NULL,
  rating       DECIMAL(3,2) NULL,
  is_featured  TINYINT NOT NULL DEFAULT 0,
  -- active = live in the directory, pending = waiting for review,
  -- rejected = sent back to the business with review_note.
  status       VARCHAR(32) NOT NULL DEFAULT 'active',
  review_note  TEXT NULL,
  submitted_by INT NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_listings_category (category_id, status),
  KEY idx_listings_city (city_id, status),
  KEY idx_listings_state (state_id, status),
  KEY idx_listings_name (name),
  KEY idx_listings_submitted (submitted_by),
  CONSTRAINT fk_listings_category FOREIGN KEY (category_id) REFERENCES categories(id),
  CONSTRAINT fk_listings_country FOREIGN KEY (country_id) REFERENCES countries(id),
  CONSTRAINT fk_listings_state FOREIGN KEY (state_id) REFERENCES states(id),
  CONSTRAINT fk_listings_city FOREIGN KEY (city_id) REFERENCES cities(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS listing_categories (
  listing_id  INT NOT NULL,
  category_id INT NOT NULL,
  PRIMARY KEY (listing_id, category_id),
  KEY idx_listing_categories_category (category_id),
  CONSTRAINT fk_lc_listing FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE,
  CONSTRAINT fk_lc_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS subcategories (
  id          INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  category_id INT NOT NULL,
  slug        VARCHAR(80) NOT NULL,
  name        VARCHAR(160) NOT NULL,
  sort_order  INT NOT NULL DEFAULT 0,
  UNIQUE KEY uq_subcategories (category_id, slug),
  KEY idx_subcategories_category (category_id),
  CONSTRAINT fk_subcategories_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS quote_requests (
  id            INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(200) NOT NULL,
  email         VARCHAR(255) NOT NULL,
  phone         VARCHAR(64) NULL,
  city          VARCHAR(160) NULL,
  event_date    VARCHAR(64) NULL,
  guest_count   VARCHAR(64) NULL,
  child_age     VARCHAR(64) NULL,
  category_slug VARCHAR(80) NULL,
  budget        VARCHAR(64) NULL,
  details       TEXT NULL,
  vendor_id     INT NULL,
  user_id       INT NULL,
  source        VARCHAR(32) NOT NULL DEFAULT 'web',
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_quote_requests_created (created_at),
  KEY idx_quote_requests_vendor (vendor_id),
  KEY idx_quote_requests_email (email),
  KEY idx_quote_requests_user (user_id),
  CONSTRAINT fk_quotes_vendor FOREIGN KEY (vendor_id) REFERENCES listings(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Accounts. One row per person; `role` decides what they can do:
--   parent  - submits quote requests, saves favourites
--   vendor  - additionally owns/manages the listing in `listing_id`
--   admin   - reviews pending business submissions
-- password_hash is a PBKDF2-HMAC-SHA256 hash in the form
-- pbkdf2$sha256$<iterations>$<salt-b64>$<key-b64>, written by Database/auth.js and
-- verified by deploy/public/api/index.php, so hashes survive a move between the
-- Node development database and the MySQL deployment.
CREATE TABLE IF NOT EXISTS users (
  id            INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  email         VARCHAR(255) NOT NULL UNIQUE,
  name          VARCHAR(200) NOT NULL,
  phone         VARCHAR(64) NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          VARCHAR(32) NOT NULL DEFAULT 'parent',
  listing_id    INT NULL,
  status        VARCHAR(32) NOT NULL DEFAULT 'active',
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_users_listing (listing_id),
  CONSTRAINT fk_users_listing FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Opaque session tokens. The cookie carries only this random value; the row is
-- the source of truth, so logging out or expiring a session really revokes it.
CREATE TABLE IF NOT EXISTS sessions (
  token      VARCHAR(64) NOT NULL PRIMARY KEY,
  user_id    INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  KEY idx_sessions_user (user_id),
  KEY idx_sessions_expires (expires_at),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Saved businesses. Guests keep theirs in localStorage and send them up on
-- login, so this table is the durable copy for logged-in users only.
CREATE TABLE IF NOT EXISTS favorites (
  user_id    INT NOT NULL,
  listing_id INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, listing_id),
  KEY idx_favorites_listing (listing_id),
  CONSTRAINT fk_favorites_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_favorites_listing FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
