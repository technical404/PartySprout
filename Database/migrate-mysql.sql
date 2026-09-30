-- Additive production migrations. CREATE TABLE IF NOT EXISTS does not add
-- columns to tables that already exist from an earlier deploy.

ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS city_text VARCHAR(160) NULL,
  ADD COLUMN IF NOT EXISTS review_note TEXT NULL,
  ADD COLUMN IF NOT EXISTS submitted_by INT NULL;

ALTER TABLE quote_requests
  ADD COLUMN IF NOT EXISTS user_id INT NULL,
  ADD COLUMN IF NOT EXISTS event_type VARCHAR(120) NULL;
