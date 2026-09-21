# Party Spark

Children's party entertainment directory. Parents search a directory of performers
(superheroes, princesses, magicians, clowns, mascots, pirates, holiday characters),
businesses submit their own listing and wait for review, and an admin approves what
goes live. Quotes, favourites, a shortlist builder and a comparison page are part of
the app; there is no invented data anywhere — every page either shows real rows or
says plainly that the feature does not exist yet.

The same SPA runs on two interchangeable backends: **SQLite + Node** in development
and **MySQL + PHP** on the deployment. Both serve the same 25 API routes with the same
validation messages and response shapes.

**Contents:** [1. What runs where](#1-what-runs-where) ·
[2. Quick start](#2-quick-start-development) · [3. Project layout](#3-project-layout) ·
[4. Features](#4-features) · [5. The data](#5-the-data) ·
[6. API reference](#6-api-reference) · [7. Search and filters](#7-search-filtering-and-sorting) ·
[8. Accounts and security](#8-accounts-sessions-security) ·
[9. Review queue](#9-submissions-and-the-review-queue) ·
[10. Frontend routes](#10-frontend-routes) · [11. Deploying](#11-deploying-to-siteground) ·
[12. Verifying it](#12-verifying-it) · [13. Knowledge graph](#13-knowledge-graph) ·
[14. Not built](#14-deliberately-not-built) · [15. Test accounts](#15-test-accounts-and-data-health)

---

## 1. What runs where

| | Development | Deployment (SiteGround) |
|---|---|---|
| Frontend | `vite dev` on `http://localhost:8080` | static SPA build copied into `public_html` |
| API | `Database/api-handler.cjs` through a Vite plugin at `/api` | `deploy/public/api/index.php` |
| Database | SQLite — `Database/directory.db` | MySQL — `Database/schema.mysql.sql` + generated `mysql-data.sql` |
| Sessions | `sessions` table | `sessions` table (not exported — everyone signs in again) |
| Passwords | PBKDF2-HMAC-SHA256 | the same format, so exported accounts log in unchanged |

Runtime requirements: Node 22+ for development (uses `node:sqlite`), PHP 8 with
`mysqli` for the deployment. No PHP is needed for development.

---

## 2. Quick start (development)

```
npm install
node Database/reset.js          # create the SQLite schema
node Database/import-excel.cjs  # import Database/party_characters_data (1).xlsx
npm run dev                     # http://localhost:8080
```

The database is empty of businesses until the import runs; categories, the country and
the city/state reference data are seeded by `Database/reset.js`. No business listings
are ever seeded — the directory is only what was really imported or submitted.

Other database commands:

```
node Database/create-admin.cjs you@example.com "a-good-password"   # only way to get an admin
node Database/export-mysql.cjs                                     # SQLite -> Database/mysql-data.sql
npm run icons                                                      # refresh listing favicon URLs
node Database/inspect-xlsx.cjs                                     # peek at the source spreadsheet
```

---

## 3. Project layout

```
src/
  routes/                    52 route files (TanStack Start, file based)
  components/marketplace/    real product UI: marketplace, account-pages, admin-page,
                             vendor-pages, quote-form, home-sections, static-pages,
                             footer, pages
  components/ui/             shadcn/Radix primitives
  lib/                       api.ts (typed API client), session.tsx, saved.tsx,
                             marketplace-data.ts, site.ts, error-page.ts
  server.ts, router.tsx, start.ts, styles.css, routeTree.gen.ts (generated)

Database/
  api-handler.cjs            the Node API (reference implementation, 25 routes)
  queries.js                 filters, whitelisted sorts, pagination
  auth.js                    PBKDF2 hashing, sessions, cookie flags, roles
  index.js                   SQLite connection + migration
  schema.sql / schema.mysql.sql
  reset.js, import-excel.cjs, fetch-icons.cjs, create-admin.cjs, export-mysql.cjs
  seed-data.js               categories, subcategory labels, country, states
  directory.db               the development database
  party_characters_data (1).xlsx   the imported source data

deploy/
  public/api/index.php       the PHP API (mirror of the Node one)
  public/.htaccess           /api -> index.php, SPA fallback, security headers
  db-config.example.php      copy to db-config.php OUTSIDE the web root
  tools/set-password.php     create/reset an account password on the server

.ohmyagent/                  verification scripts, local MySQL/PHP harness, graph pipeline
scripts/                     older Playwright UI verifiers
graphify-out/                the knowledge graph (graph.json, graph.html, GRAPH_TREE.html,
                             GRAPH_REPORT.md, manifest.json)
public/                      favicon, robots.txt
VERIFICATION.md              what actually works, how it was checked, what is missing
roadmap.md                   what was built
AGENTS.md                    project note for agents
```

---

## 4. Features

**Visitors (no account)**
- Homepage with real counts, featured carousel, popular categories, city browse.
- Search with free text, category, city/state, price range, minimum rating, featured
  and sort; the whole filter set lives in the URL, so results are shareable and the
  back button works.
- Business profile pages at `/vendors/<slug>` with contact details and a quote form.
- Quote requests can be sent without an account.
- Favourites work without an account (localStorage) and are merged into the account on
  login.
- Party builder: pick city, date, children and a category, see matching businesses and
  hand off to the quote form. It never invents a budget total.
- Compare page: compares the businesses actually selected.
- SEO landing routes per category, per category+city and per intent
  (e.g. `/magicians`, `/magicians/dallas-tx`, `/princesses/dallas-tx/birthday-parties`)
  with their own metadata.

**Parents with an account** (`/login`, `/account`)
- Signup, login, logout, profile edit (name, phone).
- Saved favourites sync across devices via `/api/favorites`; `/favorites` lists them.
- `/quotes` lists the quote requests that account actually sent.

**Vendors** (`/list-your-business`, `/vendor/*`)
- Business submission with name, category, city, website, phone, email, starting price
  and description. It lands as `pending` and is invisible to the public until approved.
- `/vendor/dashboard` shows the listing and its status; `/vendor/profile` edits it;
  edits to a rejected listing put it back in the queue; `/vendor/leads` lists the quote
  requests that came in for that business.

**Admin** (`/admin`, admin accounts only)
- Real counters (listings, pending, rejected, cities, categories, users, vendors,
  quote requests, last 7 days, favourites).
- Review queue of pending submissions: approve or reject with an optional note.
- Table of every quote request received.

---

## 5. The data

`Database/party_characters_data (1).xlsx` is imported by `Database/import-excel.cjs`.
Current state:

| Table | Rows | Notes |
|---|---|---|
| `listings` | 491 | all `active`, no test rows |
| `listing_categories` | 1,317 | a business can belong to several categories |
| `cities` | 351 | with `states` and one `countries` row (US) |
| `categories` | 10 | superheroes, mascots, princesses, star-wars, non-mascots, clowns, pirates, holidays, fairy, magicians |
| `subcategories` | editorial labels per category, shown on the homepage cards |
| `users` | 1 | the admin account (see §15) |
| `quote_requests`, `favorites` | 0 | only created by real use |
| `sessions` | not exported | short-lived login tokens; a dev database keeps whatever test logins created |

**No imported listing has a price.** The spreadsheet has no price column, so
`price_from` is NULL for all 491. Prices are therefore only ever set by a business
itself, cards show "Price on request", and the price filter stays hidden until
`GET /api/directory-summary` reports `pricedListings > 0`. A business with no published
price can never match a price filter — that is deliberate, not a bug.

---

## 6. API reference

Every route exists identically in `Database/api-handler.cjs` (Node) and
`deploy/public/api/index.php` (PHP). "Auth" is the cookie `ps_session`.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/categories` | — | 10 categories with live listing counts and subcategory labels |
| GET | `/api/cities?q=` | — | city suggestions with listing counts |
| GET | `/api/directory-summary` | — | listings, cities, categories, pricedListings, minPrice, maxPrice |
| GET | `/api/listings` | — | search (see §7) |
| GET | `/api/listings/by-ids?ids=` | — | resolve saved/favourite ids |
| GET | `/api/listings/:slug` | — | one business; 404 unless it is `active` |
| GET | `/api/auth/me` | optional | the signed-in user, or `null` |
| POST | `/api/auth/signup` | — | create a `parent` or `vendor` account |
| POST | `/api/auth/login` | — | email is case-insensitive |
| POST | `/api/auth/logout` | session | revokes the session row |
| PATCH | `/api/auth/me` | session | change name and phone |
| GET | `/api/favorites` | session | saved listing ids |
| POST | `/api/favorites` | session | save one (idempotent) |
| POST | `/api/favorites/merge` | session | merge guest ids after login |
| DELETE | `/api/favorites/:id` | session | unsave |
| POST | `/api/quote-requests` | optional | send a quote request; attaches `user_id` when signed in |
| GET | `/api/quote-requests/mine` | session | the requests this account sent |
| POST | `/api/listings` | session | submit a business (lands as `pending`) |
| GET | `/api/vendor/listings` | vendor | the caller's own listings and statuses |
| PATCH | `/api/vendor/listings/:id` | vendor | edit own listing |
| GET | `/api/vendor/leads` | vendor | quote requests for the caller's business |
| GET | `/api/admin/stats` | admin | dashboard counters |
| GET | `/api/admin/submissions` | admin | pending review queue |
| GET | `/api/admin/quotes` | admin | every quote request |
| POST | `/api/admin/listings/:id/status` | admin | approve / reject, optional note |

Anything else under `/api/` returns JSON 404. In production `.htaccess` sends `/api/*`
to `api/index.php`; in development the Vite plugin sends `/api/*` to the Node handler.

---

## 7. Search, filtering and sorting

`GET /api/listings` accepts:

| Parameter | Behaviour |
|---|---|
| `q` | `name LIKE` OR `description LIKE` |
| `category` | category **slug**; matches any category the business belongs to, not just its primary one |
| `location` | city name, free-text city a submission typed, **or** a two-letter state code. Deliberately not the business name — "Dallas Heroes" must not answer a Dallas search by accident |
| `priceMin` / `priceMax` | only businesses with a published price can match |
| `ratingMin` | businesses with no rating cannot match |
| `featured=1` | featured only |
| `sort` | `relevance` (default: featured first, then name), `name`, `price_asc`, `price_desc`, `rating`, `newest` — whitelisted, unknown values fall back to `relevance` |
| `page`, `pageSize` | default page size 9 |

Only `status = 'active'` listings are ever returned by public routes; the clause is
applied inside `buildFilters()`, so no filter combination can bypass it.

---

## 8. Accounts, sessions, security

- **Roles:** `parent`, `vendor`, `admin`. Signup can only ask for the first two; admin
  exists only through `Database/create-admin.cjs` (development) or
  `deploy/tools/set-password.php --create` (server).
- **Passwords:** `pbkdf2$sha256$210000$<salt-b64>$<key-b64>`, 16-byte salt, 32-byte key,
  compared in constant time. Accounts created before the switch used scrypt: Node still
  verifies those once and rewrites them as PBKDF2; PHP cannot verify scrypt, so such a
  row needs one password reset (the exporter lists them when it finds any).
- **Sessions:** an opaque random token in the `ps_session` cookie — `Path=/`, `HttpOnly`,
  `SameSite=Lax`, `Max-Age` 30 days, plus `Secure` whenever the request arrived over
  TLS. Every request re-reads the session row, so logout really revokes it.
- **Server-side validation** runs again on every write: name, email format, password
  length (8–200), price range, field-length cap, and `safeUrl()` rejects anything that is
  not `http(s)` — a `javascript:` website comes back as a field error.
- **Rate limiting:** signup and login allow 10 attempts per 15 minutes per IP, quote
  requests 30 per 15 minutes, in both runtimes, with the same 429 body. Node keeps the
  counters in memory; PHP keeps one small file per bucket under
  `sys_get_temp_dir()/partyspark-throttle`, because it has no memory between requests.
- **Errors:** a missing or broken `db-config.php` answers `500 {"error":"Server error"}`
  — the host never sees a stack trace.

---

## 9. Submissions and the review queue

`listings.status` is one of `pending`, `active`, `rejected`.

1. A signed-in vendor posts a business → `pending`; a duplicate business name is a 409.
2. While `pending`, the business is not at its own URL (404) and not in search results.
3. An admin approves it → `active`, and it appears publicly with its price intact.
4. Rejecting it (with an optional `review_note`) hides it again. The vendor sees the
   status and the note in `/vendor/dashboard`.

---

## 10. Frontend routes

| Group | Routes |
|---|---|
| Marketing | `/`, `/about`, `/contact`, `/how-it-works`, `/privacy`, `/terms` |
| Discovery | `/search`, `/explore`, `/category/:slug`, `/category/:slug/:location`, `/vendors/:slug`, `/request-quote`, `/party-builder`, `/compare`, `/favorites`, `/quotes` |
| SEO category pages | `/superheroes`, `/princesses`, `/magicians`, `/clowns`, `/mascots`, `/pirates`, `/holidays`, `/fairies`, `/star-wars`, `/non-mascot-characters` |
| SEO city and intent pages | `/<category>/dallas-tx` plus intent routes such as `/magicians/dallas-tx/kids-parties`, `/princesses/dallas-tx/birthday-parties`, `/superheroes/dallas-tx/birthday-parties` |
| Account | `/login`, `/account`, `/list-your-business`, `/admin` |
| Vendor | `/vendor/dashboard`, `/vendor/profile`, `/vendor/leads`, `/vendor/quotes` |
| Honest placeholders | `/messages`, `/bookings`, `/vendor/messages`, `/vendor/calendar`, `/vendor/analytics` render "not built yet" instead of fake rows |

---

## 11. Deploying to SiteGround

1. Build the SPA and export the database:
   ```
   npm run build                       # -> .output/public
   node Database/export-mysql.cjs      # -> Database/mysql-data.sql
   ```
2. Create the MySQL database and user in the SiteGround control panel.
3. Load the schema once, then the data:
   ```
   mysql -u USER -p DBNAME < Database/schema.mysql.sql
   mysql -u USER -p DBNAME < Database/mysql-data.sql
   ```
4. Copy `.output/public/*` into `public_html`, and copy `deploy/public/api/` plus
   `deploy/public/.htaccess` next to it (so `public_html/api/index.php` exists).
5. Create the credentials file **outside the web root**: copy
   `deploy/db-config.example.php` to `db-config.php` one level above `public_html` and
   fill in host, user, password and database name.
6. Create the first admin, then log in and change its password:
   ```
   php deploy/tools/set-password.php --create admin@example.com 'a-good-password' admin 'Admin'
   ```
7. Smoke test in this order: the homepage counters, a search, a login, a business
   submission (it must stay invisible), the admin approval (it must become visible), then
   saving a favourite.

`.htaccess` does three things: `/api/*` → `api/index.php`, existing files and folders
pass through, everything else → `index.html` (SPA routing). It also sets
`X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`
and `X-Frame-Options: SAMEORIGIN`.

Sessions are deliberately not exported, so everyone signs in again after a deploy.

---

## 12. Verifying it

Run everything from the project root. The counts are from the last full run
(2026-09-21); `VERIFICATION.md` holds the run log and what each check proves.

```
npm run dev                                  # Node API + SPA on :8080
.ohmyagent\tscheck.cmd                       # tsc --noEmit, empty log = clean

node .ohmyagent\probe_api.mjs                # 30 API + page-route checks
node .ohmyagent\probe_auth.mjs               # 42 account/listing/lead checks
node .ohmyagent\e2e_full.mjs                 # 46 browser checks through four real sessions
node .ohmyagent\check_php_parity.mjs         # 11 PHP covers every Node route (no PHP needed)
node .ohmyagent\php_interop.mjs              # 9 + 29 PHP lint, helper unit tests, password interop
node .ohmyagent\check_password_upgrade.mjs   # PBKDF2 interop + legacy hash upgrade
node .ohmyagent\check_export.cjs             # 25 export columns vs MySQL schema
node .ohmyagent\check_prices.cjs             # how many listings have a price
node .ohmyagent\check_summary.mjs            # directory-summary sanity
node .ohmyagent\cleanup_test_data.cjs --apply  # remove probe/E2E rows
```

### PHP API against real MySQL

A throwaway MariaDB plus portable PHP, both in `%TEMP%`, serving `deploy/public`
exactly the way the host does. Nothing is installed system-wide and nothing is
committed; `deploy/db-config.php` is created automatically from
`.ohmyagent/db-config.local.php` and deleted again, so local credentials never sit in
the folder that gets uploaded.

```
.ohmyagent\mysql_start.cmd                    # MariaDB on 127.0.0.1:3306
.ohmyagent\php_api_start.cmd                  # PHP API on http://127.0.0.1:8099
.ohmyagent\throttle_reset.cmd                 # clear the PHP rate-limit window
node .ohmyagent\check_php_throttle.mjs        # 3  the limiter really refuses the 11th try
node .ohmyagent\php_e2e.mjs                   # 50 the whole flow over HTTP
node .ohmyagent\check_php_vs_node.mjs         # 10 Node and PHP must answer identically
call .ohmyagent\mysql_local.cmd < .ohmyagent\php_e2e_cleanup.sql   # drop probe rows
.ohmyagent\php_api_stop.cmd
```

`check_php_vs_node.mjs` needs both APIs running and both holding the same data; it
compares canonical JSON (key order is irrelevant, values are not).

---

## 13. Knowledge graph

`graphify-out/` holds a code graph built by the scripts in `.ohmyagent/`
(`g_01_detect.py` → `g_05_ast.py` → `g_13_docs_cache.py` → `g_07_merge.py` →
`g_08_build.py` → `g_09_digest.py` → `g_11_label.py` → `g_12_finalize.py`), published
with `graphify cluster-only . --no-label` and `graphify tree --label PartySpark`.

- `GRAPH_TREE.html` — collapsible tree of the whole project.
- `graph.html` — interactive map, coloured by community.
- `GRAPH_REPORT.md` — communities, god nodes and surprising connections.
- 1160 nodes, 1851 edges, 111 labelled communities; the PHP front controller is part of
  the map, not a blind spot.
- Community names survive rebuilds (matched by membership, not by id); one-file clusters
  are named through `NODE_LABELS` in `g_11_label.py`.

---

## 14. Deliberately not built

- No in-app messaging, bookings, availability calendar or vendor analytics. Those pages
  say so instead of showing mock rows; conversations happen by email or phone from a
  quote request.
- No payment flow and no automated email sending.
- No price on imported listings (the source spreadsheet has none).
- No session export between environments.
- No map with markers: the city breakdown counts the real cities in the current results.

---

## 15. Test accounts and data health

```
admin@partysprout.test / adminpass123     # /admin, /vendor/*, /account (development only)
```

After `node .ohmyagent/cleanup_test_data.cjs --apply`: 491 active listings, exactly one
user (that admin, PBKDF2), and zero quote requests or favourites. Probe and E2E runs
create real rows and remove them again; the cleanup script lists them before it deletes.

Development note: restart `npm run dev` after API changes — the Vite plugin loads
`Database/api-handler.cjs` once at startup.
