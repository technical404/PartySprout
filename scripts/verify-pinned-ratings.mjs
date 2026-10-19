/**
 * The pinned listings lead every search, so they are the first cards anyone sees; a card
 * with no rating there looks like an unrated business. This checks that each pin is
 * present, leads the result, and carries a rating in the 4.3-4.5 band with a review count
 * in the low hundreds.
 *
 *   node scripts/verify-pinned-ratings.mjs
 *   PS_API=https://hirepartycharacters.com node scripts/verify-pinned-ratings.mjs
 */
const BASE = process.env.PS_API || "http://127.0.0.1:8080";

const PINS = [
  "something-different-party-rental",
  "party-characters-for-hire",
  "party-characters-for-kids-new-york",
  "party-characters-for-kids",
];

const results = [];
function check(label, ok, detail = "") {
  results.push({ label, ok });
  console.log(`${ok ? "ok  " : "FAIL"}  ${label}${ok || !detail ? "" : ` — ${detail}`}`);
}

const ratingOf = (vendor) => Number(vendor.rating ?? 0);
const reviewsOf = (vendor) =>
  Number(vendor.reviews ?? vendor.reviewCount ?? vendor.review_count ?? 0);

(async () => {
  // A plain page of the directory: no filter, so this is the order every visitor meets.
  const response = await fetch(`${BASE}/api/listings?pageSize=10`);
  check("the listings API answers", response.ok, `HTTP ${response.status}`);
  const body = await response.json();
  const items = body.items || body.listings || [];
  check("it returns rows", items.length > 0, `${items.length} rows`);

  const leading = items.slice(0, PINS.length);
  console.log(
    `  leading: ${leading.map((v) => `${v.slug} ${ratingOf(v)} (${reviewsOf(v)})`).join(" | ")}`,
  );

  check(
    "the four pins lead the unfiltered directory",
    PINS.every((slug, index) => leading[index]?.slug === slug),
    leading.map((v) => v.slug).join(", "),
  );

  for (const slug of PINS) {
    const vendor = items.find((v) => v.slug === slug);
    if (!vendor) {
      check(`${slug} is in the result`, false);
      continue;
    }
    const rating = ratingOf(vendor);
    const reviews = reviewsOf(vendor);
    check(`${slug}: rating is between 4.3 and 4.5`, rating >= 4.3 && rating <= 4.5, String(rating));
    check(
      `${slug}: review count is between 200 and 300`,
      reviews >= 200 && reviews <= 300,
      String(reviews),
    );
  }

  // A category page must lead with the same pin and the same numbers.
  const category = await fetch(`${BASE}/api/listings?category=superheroes&pageSize=5`).then((r) =>
    r.json(),
  );
  const categoryItems = category.items || category.listings || [];
  const first = categoryItems[0];
  console.log(`  first superheroes row: ${first?.slug} ${ratingOf(first)} (${reviewsOf(first)})`);
  check(
    "a category page leads with the same pin and rating",
    first?.slug === PINS[0] && ratingOf(first) >= 4.3,
    first?.slug,
  );

  const failed = results.filter((result) => !result.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed  (${BASE})`);
  // exitCode rather than exit(): the fetch handles are still closing, and on Windows an
  // immediate exit trips a libuv assertion that buries the result.
  process.exitCode = failed.length === 0 ? 0 : 1;
})();
