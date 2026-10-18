-- Something Different Party Rental (www.somethingdifferentpartyrental.com)
--
-- One sponsored row, pinned by slug in deploy/public/api/index.php and
-- Database/queries.js, so it leads every category, every city page and every sort.
-- Written by scripts/add-something-different.cjs from the local directory database,
-- which is the source Database/export-mysql.cjs dumps.
--
-- No id is given: production numbers its own rows, and its ids have drifted from this
-- database (it holds party-characters-for-hire as #510, this one as #516), so the local
-- id — #533 here — is deliberately not asserted. Production decides its own.

SET NAMES utf8mb4;
START TRANSACTION;

INSERT INTO listings
  (name, slug, category_id, country_id, state_id, city_id, description, website, icon_url, image_url, phone, price_from, is_featured, pin_rank, status)
VALUES
  ('Something Different Party Rental', 'something-different-party-rental', 1, 1, 33, 219, 'Something Different Party Rental sends costumed party characters to children’s birthdays and family celebrations, with more than 133 characters to choose from across 17+ cities from $220. The catalog is grouped into six families: holiday characters such as Frosty Snowman, mascot characters like PJ Mask Gekko and Ash, non-mascot face characters, princesses including Princess Ariel, Princess Belle and Princess Sophia, space-saga favorites from Princess Leia and Luke Skywalker to Chewbacca, Storm Trooper and Jedi Master, and superheroes such as Batman, Hulk, Ninja Turtle Raphael and Sponge Bob. Performers are professional actors who bring the entrance, the games, the music and the birthday moment, and the visit is built around the party rather than the other way round: choose the character, the event ZIP code, the date and the theme, then confirm the details and reserve the date. The ZIP code sets one clear local price — a city name starts with an estimate — and reserving online charges only the payment due today. A local party-planning team stays reachable before and after the visit, and the cities it names include New York City, Brooklyn, Los Angeles, Chicago, Houston, San Diego, San Francisco, Las Vegas and Tampa. Call (855) 705-2799 to plan the day.', 'https://www.somethingdifferentpartyrental.com/', 'https://www.somethingdifferentpartyrental.com/wp-content/uploads/2026/10/cropped-brand-logo-192x192.webp', 'https://www.somethingdifferentpartyrental.com/wp-content/uploads/2026/10/home-hero-poster-1024x576.webp', '+1 855-705-2799', 220, 0, 1, 'active');

INSERT IGNORE INTO listing_categories (listing_id, category_id) VALUES
  (LAST_INSERT_ID(), 1),
  (LAST_INSERT_ID(), 2),
  (LAST_INSERT_ID(), 3),
  (LAST_INSERT_ID(), 4),
  (LAST_INSERT_ID(), 5),
  (LAST_INSERT_ID(), 8);

COMMIT;
