# Verification notes

Living record of what actually works in this app, how it was checked, and what is
still fake or missing. Updated after every fix iteration. Companion to `roadmap.md`
(which lists what was *built*, not what is *real*).

- Last run: 2026-10-02, local dev server in a real browser (nav and results bar, see
  iteration 9)
  (previous: 2026-10-01, production host + local SQLite, quote wizard event type —
  iteration 8; full local run: 2026-09-21, dev server on `http://localhost:8080`)
- MySQL half: 2026-09-21, PHP 8.3 + MariaDB 11.4 in `%TEMP%` — 50 PHP checks + 3 throttle
  checks + 10 runtime response diffs against the Node API, all passing
- Data: `Database/directory.db` (SQLite) — 10 categories, 507 listings, 351 cities
- Knowledge graph: `graphify-out/` — 1160 nodes, 1851 edges, 111 labelled communities
  (`GRAPH_TREE.html` collapsible tree, `graph.html` interactive map, `GRAPH_REPORT.md`, `manifest.json`)

## How to run the checks

```
npm run dev                          # starts vite dev on :8080 (restart after API changes)
.ohmyagent\tscheck.cmd               # tsc --noEmit, empty log = clean
node .ohmyagent\probe_api.mjs        # 30 API + page-route checks
node .ohmyagent\probe_auth.mjs       # 42 account/listing/lead checks
node .ohmyagent\e2e_full.mjs         # 46 browser checks through four real sessions
node .ohmyagent\check_php_parity.mjs # PHP API covers every Node route (no PHP needed)
node .ohmyagent\php_interop.mjs      # php -l, helper unit tests, password interop (needs PHP)
node .ohmyagent\check_export.cjs     # export columns vs MySQL schema, no test rows left
node .ohmyagent\check_password_upgrade.mjs  # pbkdf2 interop + legacy hash upgrade
node .ohmyagent\cleanup_test_data.cjs --apply  # remove probe/E2E rows

# PHP API against real MySQL (throwaway MariaDB + portable PHP, see below)
.ohmyagent\mysql_start.cmd           # MariaDB on 127.0.0.1:3306 (data in %TEMP%\psmysql)
.ohmyagent\php_api_start.cmd         # PHP API on http://127.0.0.1:8099
.ohmyagent\throttle_reset.cmd        # clear the PHP rate-limit window between runs
node .ohmyagent\check_php_throttle.mjs     # 3 rate-limiter checks
node .ohmyagent\php_e2e.mjs                # 50 account/listing/admin checks over HTTP
node .ohmyagent\check_php_vs_node.mjs      # 10 Node/PHP responses must be identical
call .ohmyagent\mysql_local.cmd < .ohmyagent\php_e2e_cleanup.sql   # drop probe rows
.ohmyagent\php_api_stop.cmd

# knowledge graph (deterministic, local; ~2 min)
#   python .ohmyagent/g_01_detect.py ... g_12_finalize.py  -- see "Knowledge graph" below
```

`check_php_vs_node.mjs` needs both APIs up (Node on :8080, PHP on :8099) and both
storing the same data, so it compares the engines rather than the databases.

---

## Run log

### 2026-10-02 — iteration 9: the nav calls you, and the results bar sits under the header

The search bar on every listing page stuck at `top: 0` at `z-30` while the header is
`z-40` and 72px tall, so it stuck *behind* the header and came back half-hidden — the
"little sticky" that prompted this. It now sticks at `lg:top-24`, exactly the header's
own height, and its slide-away moves it a full header-plus-itself out of the way. The
desktop height moved onto the header element, whose border sits inside that 96px, so
the bar is flush at rest *and* stuck: measured `bar.top = header.bottom = 96` in both
states, with no jump when it catches.

The nav lost **Saved** (desktop links and the mobile slide-out menu; the bottom bar and
`/favorites` keep it) and **For entertainers**, since "List your business" already
points at that page. **Find businesses** became a **Call us (641) 666-3945** `tel:`
link with 28px / 20px of padding, a handset that rings and a halo that breathes (2.6s;
`prefers-reduced-motion` stops both). That button is 76px tall — taller than the old
72px header — which is why the header now grows to 96px on desktop. Between 640px and
the desktop nav the row cannot also hold the words "Call us", so there the handset and
the number carry it and `aria-label` keeps the full name.

The home page's sticky journey stack pins to fixed offsets that had been measured
against a 72px header, so its three cards moved down by the same 24px (100/215/330 →
124/239/354). Measured back to the original 28px gap under the header, with the 115px
stacking rhythm intact.

```
node scripts/tmp-nav-sticky-check.mjs   ->  23/23   (temporary driver, deleted after the run)
```

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` and `npm run build` | clean / succeeds |
| Bar at rest and stuck both measure `top=96`, header `bottom=96` — no jump, no overlap | PASS |
| Scrolling down slides the bar fully out (`bottom=0`); scrolling up brings it back stuck | PASS |
| Nav offers no Saved and no For entertainers; Explore, Categories, Party builder survive | PASS |
| `tel:+16416663945`, padding exactly 28px / 20px, button 76px in a 96px header | PASS |
| `call-halo` on the button and `call-ring` on the handset, both `running`; halo 0 → 14px, handset ±11° | PASS |
| No page or header overflow at 640 / 768 / 1024 / 1280px | PASS |
| Home page journey cards keep their 28px gap under the taller header and still stack 115px apart | PASS |
| At 640px the number stays, "Call us" hides, `aria-label` unchanged | PASS |
| Mobile: bar not sticky and flush under the header; menu lost "Saved entertainers"; bottom bar keeps Saved | PASS |
| No uncaught page errors | PASS |

### 2026-10-01 — iteration 8: the quote wizard asks what the party *is*

The wizard's first question was "What are you celebrating?" but the options under it
were the *entertainment categories*, so one step was answering two different
questions. The event now has a step of its own — **"What type of event are you
planning?"** — with the grouped **Popular** (15) / **All events** (28) list. The
reference list was cut off just after "Baby Shower", so the remaining entries are the
standard event set rather than a guess at what the screenshot held. The categories
moved to the step behind it, **"What kind of entertainment are you looking for?"**,
where they belong.

Two more things the wizard was missing: **"Where is the party?"** now suggests cities
as you type — the same `/api/cities` lookup the search panel uses, showing each match's
business count — and **"When is the party?"** opens its picker from a click anywhere in
the box, not only on the calendar glyph. The party builder asks the same date question,
so its field got the same treatment.

The answer travels the whole way: `quote_requests.event_type` (TEXT in SQLite,
VARCHAR(120) in MySQL, so it has its own narrower limit in both validators), the POST
body, and the joined summary lines the vendor lead list and "my quotes" print.

```
node scripts/verify-event-type-quote.cjs   ->  14/14   (column, POST, both readers)
node scripts/verify-quote-form-live.mjs    ->  25/25   (browser, wizard, SQLite row)
```

| Check | Result |
| --- | --- |
| `.ohmyagent\tscheck.cmd` equivalent (`npx tsc --noEmit`) and `npm run build` | clean / succeeds |
| Local browser: event question first, 15 popular + 28 all, categories on their own step | PASS |
| Local browser: "dal" suggests `Dallas, TX 20 businesses` and picking it fills the field | PASS |
| Local browser: date box is a pointer with the glyph stretched over it, one `showPicker` call, value unchanged | PASS |
| Local browser: the wizard submits and the stored row keeps event type, city, category and date | PASS |
| API: `eventType` stored verbatim; a request without one stores NULL; 120 chars accepted, 121 and 2500 rejected `422` | PASS |
| Both readers (vendor leads, my quotes) return the event type | PASS |
| Production: `ALTER TABLE quote_requests ADD COLUMN event_type VARCHAR(120) NULL` — 2 existing rows untouched | PASS |
| Live deploy: `api/index.php` diff was only the event-type lines, shell only the asset hash | PASS |
| Live site: the same browser walk against the deployed build | 12/12 |
| Live submit stored `event_type="Birthday (Child)"`, `city="Dallas, TX"`, `category_slug="superheroes"`, `event_date="2026-12-05"` | PASS |

The live probe row (`event-type-live@example.test`) was deleted again; production
`quote_requests` is back to its 2 real rows. Both verify scripts sweep their probes by
the `event-type-*@example.test` pattern, so an interrupted run cannot leave one behind.

### 2026-10-01 — iteration 7: the category on a card now comes from the business's own website

A listing's category was whatever Google search happened to find the business
first: the spreadsheet's `Category` column held the *search terms* used to scrape
the directory, so ids 1-12 were all `superheroes` and a princess-and-clown company
could be filed under `star-wars`. Crawling each business's own site and scoring it
against all ten categories showed **141 of 437 reachable listings had zero support
for the category they were filed under**.

Two new scripts, both re-runnable:

- `scripts/audit-listing-categories.cjs` — reads the homepage plus up to two in-site
  pages that look like they list services, and writes the per-category scores and the
  words behind them to `Database/category-audit.json`. Words match on boundaries, so
  "thor" never fires on *author* and "elf" never on *self*.
- `scripts/apply-category-audit.cjs` — relabels a listing only when its current
  category scores ≤ 2 on its own site *and* another category scores ≥ 5, and adds
  every category scoring ≥ 5. It never removes a category link: "the site never prints
  the word" is weak evidence of absence. Re-running it reports 0 changes.

Applied to `Database/directory.db` and to production MySQL
(`Database/category-updates.sql`, 49 `UPDATE`s + 239 `INSERT IGNORE`s, loaded with
a throwaway paramiko script):

```
474 listings had a website (of 507)   437 crawled   37 unreachable -> left untouched
160 had no clear offer -> left untouched
 49 cards relabelled     239 categories added across 149 listings     0 removed
category links 1419 -> 1658
```

| Check | Result |
| --- | --- |
| Local SQLite vs the pre-change snapshot: links lost / added | 0 / 239 |
| Local: primaries moved, every new primary also a link of that listing | 49, 0 broken |
| Local: 507 listings, no listing without a category, primary always among them | PASS |
| Pinned listings #1, #9, #492 (pin_rank 1) unchanged | PASS |
| The 16 `party-characters-for-kids-*` listings keep their category | PASS |
| Production MySQL diffed against local after the load (updates/adds/removals) | 0 / 0 / 0 |
| Live API: all 507 cards' `category_slug` equal the database | PASS |
| Live API: all 10 `?category=` page totals equal the local link counts | PASS |
| Live API: detail pages return the corrected category list | PASS |

Category page counts moved to clowns 154, fairy 68, holidays 203, magicians 177,
mascots 179, non-mascots 239, pirates 140, princesses 201, star-wars 143,
superheroes 154. Businesses whose site could not be reached (403s, dead hosts,
JS-only shells) were deliberately left alone rather than guessed at.

### 2026-10-01 — iteration 6: a five-star listing keeps its review count

The count was never a column — `marketplace-data.ts` scraped it out of the
description with `/(\d+)\s+Google reviews/`, and `Database/fetch-about.cjs` later
replaced those imported descriptions with each business's own prose, so every count
silently became `0` while `rating` (a real column) stayed at 5. `review_count` is now
a column in both schemas, filled by `scripts/backfill-review-counts.cjs`. **478 of the
480 rated listings recovered** the right count (217 from descriptions, 261 from the
`description-backup-*.json` snapshots, **0 disagreements**); 2 businesses genuinely
have none and stay `NULL`, which the card renders as no `(0)` at all. Production was
altered and loaded with `Database/review-count-updates.sql`; the live API returns
`review_count` for all 507 rows, matching local exactly.

### 2026-09-21 — iteration 5: the PHP API runs against MySQL (gap closed locally)

A portable MariaDB 11.4 (`%TEMP%\psmysql`, not installed system-wide) plus the
portable PHP 8.3 from iteration 4 runs the *deployed* front controller —
`deploy/public/api/index.php` served by `php -S 127.0.0.1:8099 -t deploy/public` —
against 491 listings, 351 cities and the admin account loaded from
`Database/export-mysql.cjs`.

```
node .ohmyagent\php_e2e.mjs          -> 50/50 checks passed
node .ohmyagent\check_php_throttle.mjs -> 3/3 checks passed
node .ohmyagent\check_php_vs_node.mjs  -> 10/10 responses identical
```

What the 50 checks prove, in the order a real visitor hits it: public reads (10
categories, `q=magician` = 82, state-code location, price/rating/featured filters,
unknown slug = 404, `/api/directory-summary`); a guest quote request (201) and a
bad one (422 with per-field messages); signup/login/logout including a case-
insensitive email login, a wrong password (401), a duplicate (422) and a short
password (422); a session cookie that really stops working after logout; favourites
(add, idempotent re-add, merge, `by-ids` resolution, delete); a vendor submission
that is hidden from both its own URL and search while `pending`; a `javascript:`
website (422) and a duplicate business name (409); the vendor's own list, edit and
lead routes; then the admin queue: submissions, stats, quotes, approve -> the listing
becomes public and searchable with its published price (199) intact, and reject ->
hidden again. Admin routes without a session are a 401.

Three things only real MySQL could have shown, and did:

- **The review gate holds all the way through the database.** `pending` rows are
  invisible to `/api/listings/:slug` and to search, and visible again the moment an
  admin approves them — the same SQL predicate in both engines.
- **The rate limiter works in PHP.** 10 signups from one IP are allowed, the 11th is
  `429 {"error":"Too many attempts. Please try again in a few minutes."}` — the same
  status and string as the Node API. Node keeps its buckets in memory; PHP keeps one
  small file per bucket under `sys_get_temp_dir()/partyspark-throttle`, because PHP
  has no memory between requests. That is the one deliberate behavioural difference:
  restarting the Node server forgives its counters, deleting that folder forgives
  PHP's (`.ohmyagent/throttle_reset.cmd`).
- **The two engines agree response-for-response.** `check_php_vs_node.mjs` fetches
  the same ten read-only requests from both APIs and compares canonical JSON: same
  status, same keys, same values. Only `SELECT l.*` column *order* differs, which no
  client can observe, so the comparison sorts keys.

Local plumbing worth knowing: `deploy/db-config.php` is *not* in the repo (it is
host-specific). `.ohmyagent/db-config.local.php` holds the throwaway credentials and
`php_api_start.cmd` copies it into place when it is missing, so local runs are one
command while nothing uploadable ever contains real credentials.

### 2026-09-21 — iteration 4: the PHP API is verified as far as this machine allows

`node .ohmyagent/php_interop.mjs` → **9/9** (plus 29 helper self-checks),
`node .ohmyagent/check_php_parity.mjs` → **11/11**, `node .ohmyagent/check_export.cjs` → **25/25**.

A portable PHP 8.3 (`%TEMP%\psphp`, not installed system-wide) made the PHP half testable:

| Check | Result |
| --- | --- |
| `php -l` on `deploy/public/api/index.php` and `deploy/tools/set-password.php` | clean |
| 29 helper unit checks (`.ohmyagent/php_selftest.php`): hashing, price/URL/email/query helpers, filters, throttle limit | 29/29 |
| A hash written by `Database/auth.js` verifies in PHP | PASS |
| A hash written by PHP verifies in `Database/auth.js` | PASS |
| The front controller boots with no `db-config.php` and answers `{"error":"Server error"}` | PASS |
| It survives an unreachable database the same way (no fatal, no stack trace) | PASS |

`deploy/public/api/index.php` now has an include-only mode (`PARTYSPARK_LIB_ONLY`) so the
helpers can be unit-tested without a database; the served path is unchanged.

### 2026-09-21 — iteration 3: the PHP/MySQL deployment mirrors the Node API

`node .ohmyagent/check_php_parity.mjs` → **11/11**, `node
.ohmyagent/check_export.cjs` → **25/25**,
`node .ohmyagent/check_password_upgrade.mjs` → **10/10**,
`node .ohmyagent/probe_auth.mjs` → **42/42**, `node .ohmyagent/e2e_full.mjs` → **46/46**.

What changed:

| Area | Before | Now |
| --- | --- | --- |
| `deploy/public/api/index.php` | categories, cities, listings, one listing, one anonymous quote POST | every route the SPA calls: accounts, sessions, favourites, business submission, vendor listings + leads, admin stats/queue/review, my-quotes, `directory-summary`, `/api/listings/by-ids`, the same filter/sort/paging options |
| Password storage | scrypt (`Database/auth.js`) — PHP has no scrypt, so exported accounts could not log in | PBKDF2-HMAC-SHA256 in both runtimes (`pbkdf2$sha256$210000$salt$key`); Node still verifies old scrypt rows and rewrites them on the next successful login |
| `Database/schema.mysql.sql` | no `users`, `sessions`, `favorites`; no `listings.city_text`/`submitted_by`/`review_note`; no `quote_requests.user_id` | all of them, with keys and foreign keys |
| `Database/export-mysql.cjs` | did not export accounts or favourites | exports `users` and `favorites`, warns about any hash PHP cannot verify; sessions are deliberately not exported |
| Password help on the host | none | `deploy/tools/set-password.php` (reset or `--create` an account, CLI only, revokes that account's sessions) |

Rate limiting: the Node API throttles signup/login (10 per 15 min per IP) and quote
requests (30 per 15 min) in memory. PHP keeps nothing between requests, so
`index.php` throttles the same routes through a small locked file per IP in the
temporary directory.

**What that proves:** `php -l` is clean on both PHP files, the API helpers pass
29 unit checks (`.ohmyagent/php_selftest.php`, run through `php_interop.mjs`), the
front controller boots as a request and answers `{"error":"Server error"}` with no
config and with an unreachable database (no fatal, no stack trace), and the
password format round-trips: a hash written by `Database/auth.js` verifies in PHP
and a hash written by PHP verifies in Node.

**What it does not prove:** there is no MySQL on this machine, so no PHP route was
ever run against real data — `SELECT`/`INSERT` behaviour, the review queue and the
review gate are still only checked on the Node side. PHP came from the portable
Windows build in `%TEMP%\psphp` (git-ignored scratch space, not installed
system-wide); `php_interop.mjs` finds it automatically or honours `PHP_BIN`.

### 2026-09-21 — iteration 2: quoting, accounts, listings, review queue are real

`node .ohmyagent/e2e_full.mjs` → **46/46 passing** (edge headless browser, four
isolated contexts: guest, vendor, admin, parent). `.ohmyagent/tscheck.cmd` → clean.

What the browser run proves, in order:

| Check | Result |
| --- | --- |
| 24 public/account/admin routes render real content, no error boundary, no 4xx API call | 24/24 |
| `/clowns`, `/superheroes`, `/star-wars`, `/princesses/dallas-tx` show *their own* category (counts 149 / 113 / 120 / 6 match the API) | 4/4 |
| Vendor-page "Request quote" opens one form and the submission is a real row | PASS |
| Guest `/favorites` lists exactly the businesses whose heart was clicked | 2/2 |
| Guest compare bar → `/compare` shows both selected businesses | PASS |
| `/list-your-business` gates on an account, then shows the real submission form | PASS |
| A submitted business lands in the review queue and its dashboard says "In review" | PASS |
| **An unapproved business is invisible in public search** (the review gate is real) | PASS |
| Admin logs in, sees the submission, "Approve and publish" makes it public | PASS |
| The approved business is findable in search **with its published `$300` price** | PASS |
| Signed-in parent's quote request appears again on `/quotes` | PASS |

Test rows created by that run (all real database rows; removed afterwards — see "Test data"):

- vendor `e2e.vendor.<stamp>@example.test` owning `E2E Test Parties <stamp>` (approved, superheroes, Dallas, $300)
- parent `e2e.parent.<stamp>@example.test` with a quote request to AlakaSam
- one guest quote request from the dialog test

### 2026-09-21 — iteration 1: the API layer was never the problem

- `node .ohmyagent/probe_api.mjs` → **30/30** (`GET /api/categories`, `/api/cities`,
  `/api/listings` with q/location/category, `/api/listings/<slug>` + 404, `POST
  /api/quote-requests` 201/422/400, 19 page routes all 200).
- `node .ohmyagent/probe_auth.mjs` → **42/42** (signup, login, session, profile
  update, listing submit/edit, admin review, leads, favourites merge).

So every failure the user saw ("request quote not working", "list your business not
working", "so many things not working") lived in the client components below, not in
the server.

---

## Inventory of fake / broken behaviour — status

Legend: **FAKE** = decorative, no data or no effect. **HALF** = real data but wrong
semantics or missing persistence. **FIXED** = replaced by real behaviour and covered
by a check above.

1. **vendor "Request quote" dialog** → **FIXED.** One real form (`RequestQuoteForm`
   in `quote-form.tsx`) is now the only quote UI: it POSTs `/api/quote-requests`,
   shows "Your request is in." only after a 201, and is embedded both in the vendor
   profile page and in the per-card dialog rendered by `VendorCard`.
2. **"List your business"** → **FIXED.** `/list-your-business` → `ListBusinessPage`
   (`vendor-pages.tsx`): login gate → real `POST /api/listings` → "Your business is in
   the review queue." → editable later from the dashboard, which reads `GET /api/my-listings`.
3. **the three fake workspaces** → **FIXED.** `SimpleWorkspace`/`CollectionPage` are
   deleted. `/account` = `AccountPage`, `/admin` = `AdminPage` (real stats, real review
   queue, real quote table), `/vendor/*` = `VendorDashboardPage` (real listing status +
   real leads). `/vendor/analytics`, `/vendor/calendar`, `/vendor/messages`, `/messages`,
   `/bookings` render `NotBuiltYet`: they state what is missing instead of inventing rows.
4. **favourites** → **FIXED.** `SavedProvider` (`src/lib/saved.tsx`): localStorage for
   guests, server rows for accounts, merged on login via `/api/favorites/merge`,
   optimistic toggle with rollback. `/favorites` lists what was saved.
5. **collection pages** → **FIXED.** `/quotes` lists the requests the signed-in user
   actually sent (`/api/my-quotes`); `/compare` compares the businesses actually
   selected.
6. **party builder** → **FIXED (as a shortlist tool).** `/party-builder` collects city,
   date, children, category, queries the live directory and hands off to the real quote
   form. It never invents a budget total.
7. **hero search extras** → **FIXED.** Date and children now travel in the URL
   (`/search?date=…&kids=…`), the results banner offers a quote request with them
   prefilled, and the "we found" chips are gone.
8. **map view** → **REPLACED.** `CityBreakdown` counts the cities in the current
   results. There is no decorative map and no fake marker geometry.
9. **testimonials** → **DELETED** (`TestimonialsSection` and its invented array removed
   at the user's request).
10. **accounts/login** → **FIXED.** `sessions`/`users` tables, `/api/auth/*`,
    `SessionProvider` (`src/lib/session.tsx`), `/login`, `/account`, session-aware header.
11. **filter panel** → **FIXED.** Category, city, rating and price range all map to
    `buildFilters()` in `Database/queries.js`, and the whole filter set lives in the
    `/search` URL (shareable, back-button friendly).
12. **search semantics** → **FIXED.** `/api/listings` filters on category, city (city
    reference, free-text city or state code), price range, rating and featured, with
    whitelisted sort keys.

---

## Knowledge graph

The graph is rebuilt with the scripts in `.ohmyagent/` (`g_01_detect.py` →
`g_05_ast.py` → `g_13_docs_cache.py` → `g_07_merge.py` → `g_08_build.py` →
`g_09_digest.py` → `g_11_label.py` → `g_12_finalize.py`) and published as
`graphify-out/GRAPH_TREE.html` (collapsible tree, from `graphify tree`) plus
`graph.html` (interactive map, from `graphify cluster-only . --no-label`).

- **1160 nodes, 1851 edges, 111 communities**, 95% of edges directly extracted.
- God nodes: `cn()` (78), `FileRoutesByPath` (53), `compilerOptions` (22),
  `SearchResults()` (21), `handle_vendor()` (19), `fetch()` (19), `Button` (18),
  `handle_auth()` (16), `useSession()` (16), `fetch_one()` (13). The PHP front
  controller is part of the map, not a blind spot.
- **Labels survive rebuilds.** Community ids are assigned by size and move whenever
  the graph changes, so `g_11_label.py` matches communities by membership
  (`graphify-out/.graphify_members.json`) instead of by id. The `LABELS` map is keyed
  by id and can therefore only name a cluster by luck, so one-file clusters are named
  through `NODE_LABELS` (stable node ids, e.g. `ohmyagent_php_router` -> "PHP dev
  server router"); anything still unnamed is printed by the label step. Rename a
  community in the members file.
- **Counts drift by a few percent between runs.** Two rebuilds of the same tree gave
  111 and 122 communities, so treat the numbers above as a snapshot, not a constant.
- **Pitfalls:** `g_12_finalize.py` deletes the build intermediates, so re-labelling
  needs a full rebuild first; do not `grep` `graph.html` (it is a single ~900 KB
  line); `graphify cluster-only . --no-label` rewrites `graph.json`, `graph.html` and
  `GRAPH_REPORT.md`, but it keeps the curated names from the members file, so run it
  after the label step as documented (then `graphify tree --label PartySpark` for
  `GRAPH_TREE.html`).
- The semantic pass still covers docs only, and `cost.json` still shows 0 tokens
  (AST extraction is local).

---

## Known remaining gaps (deliberately not faked)

- **No price on 491 of 491 imported listings.** `Database/party_characters_data (1).xlsx`
  has no price column, so `price_from` is NULL for everything imported
  (`.ohmyagent/check_prices.cjs`: `{ total: 491, with_price: 0 }`). Prices are therefore
  only accepted from a business itself (`/list-your-business`), the card shows
  "Price on request", and the price filter stays hidden until
  `GET /api/directory-summary` reports `pricedListings > 0`.
- **No PHP route has run against MySQL** — closed in iteration 5 *on this machine*.
  `deploy/public/api/index.php` served the full flow against MariaDB 11.4 with the
exported data (`php_e2e.mjs` 50/50) and returned byte-identical JSON to the Node API
for every public read (`check_php_vs_node.mjs` 10/10). What is still unproven is the
*host*: SiteGround runs its own MySQL version, its own PHP build and its own paths.
  The one file that must change per host is `deploy/db-config.php`, created from
  `deploy/db-config.example.php`; if it is wrong or missing the API answers
  `500 {"error":"Server error"}` instead of leaking a stack trace (`.ohmyagent/php_boot_check.php`).
- **Sessions are not exported.** They are short-lived tokens; the MySQL dump omits
  them on purpose, so everyone (including the admin) signs in again after a deploy.
  Credentials in `Database/directory.db` no longer use scrypt, so an exported
  account logs in on the PHP host unchanged.
- **Test data is cleaned, not left behind.** Probe and E2E runs create real rows
  (`probe.*@example.com`, `e2e.*@example.test`, their listings and quote requests).
  `.ohmyagent/cleanup_test_data.cjs` lists what they are (dry run) and deletes them
  with `--apply`, keeping the imported 491 listings and the admin account.
- **No in-app messaging, bookings, availability calendar or analytics.** The pages say
  so explicitly; conversations happen by email/phone from a quote request.
- **Graph fidelity.** `graphify-out/` is a code/AST graph with a docs-only semantic pass:
  50 images and the three uncached documents (README, VERIFICATION, the converted
  spreadsheet) are not in it, and `cost.json` shows 0 tokens because AST extraction is
  local. Treat it as a map of the code, not a proof of runtime behaviour.

## Data health snapshot (2026-09-21)

```
GET /api/directory-summary
  Node (SQLite):     {"listings":491,"cities":491,"categories":10,"pricedListings":0,"minPrice":null,"maxPrice":null}
  PHP  (MariaDB):    identical — see .ohmyagent/check_php_vs_node.mjs (10/10)

Database/directory.db after `node .ohmyagent/cleanup_test_data.cjs --apply`
  active listings 491 (the imported directory, nothing else)
  listings with a published price: none
  users: admin@partysprout.test only (id 1), password_hash scheme pbkdf2$sha256$210000
  quote_requests: 0, favorites: 0 — every probe/E2E row was removed
  accounts: admin@partysprout.test / adminpass123 (test login for /admin, /vendor/*, /account)

partyspark_local (MariaDB copy, after `.ohmyagent/php_e2e_cleanup.sql`)
  listings 491, users 1, quote_requests 0, favorites 0, sessions 0 — same shape as SQLite
```
