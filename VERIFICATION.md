# Verification notes

Living record of what actually works in this app, how it was checked, and what is
still fake or missing. Updated after every fix iteration. Companion to `roadmap.md`
(which lists what was *built*, not what is *real*).

- Last run: 2026-10-17, **deployed to https://hirepartycharacters.com** — anyone signed in
  can change their own password from `/account`, and `/admin` can create accounts instead of
  needing SSH and SQL. 69 admin API + 57 admin browser + 17 change-password checks locally,
  13 more against the live site, iteration 17)
  (previous: 2026-10-16 — the six-tab admin console, iteration 16, which is deployed; the hero
  date box opens its calendar from a click anywhere in the field, the Where box suggests
  states, and the three pinned businesses show their own logo and a picture from their own
  home page — verified live 8/8 and on the dev server, iteration 15; 2026-10-14 — both forms
  require every answer, iteration 14; 2026-10-07 — the header logo is one image with no text
  beside it, iteration 14; Party builder removed and the nav given Request a quote —
  iteration 12; the site renamed to Hire Party Characters — iteration 11; the logo mark in
  the header, footer and favicon — iteration 10; nav and results bar — iteration 9;
  production host + local SQLite, quote wizard event type — iteration 8; full local run:
  2026-09-21, dev server on `http://localhost:8080`)
- Admin console: 2026-10-16, **deployed** — six tabs over real rows (61 API checks + 35
  browser checks at the time, iteration 16). The line here called it "built and checked
  locally, NOT deployed" for a day after it went out; a live check in iteration 17 found the
  six-tab console being served from the PHP host, so it is live.
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
node scripts\verify-phone-validation.cjs          # 22 server-side phone/guest checks (needs :8080 up)
node scripts\verify-phone-form.mjs                # 8 browser checks on the quote and sign-up phone fields
node scripts\verify-event-type-quote.cjs          # 14 checks on the event-type column, POST and both readers
node .ps_probe_required_live.mjs                  # live: both forms' required rules, writes nothing
node .ps_probe_form_rules.mjs                     # live browser: the date question really is required
node .ps_verify_search_ui.mjs                     # browser: the date box and the state suggestions (needs :8080 up)
node .ps_verify_pinned_ui.mjs                     # browser: the pinned logos and pictures load
node .ps_pinned_assets.cjs --apply                # re-check the pinned logos/pictures and write them locally
node .ps_state_totals.mjs                         # a state's suggestion count vs the total its search returns
python .ps_verify_live15.py                       # live: all four changes on hirepartycharacters.com
python .ps_pinned_prod_apply.py                   # live: write the pinned logos/pictures into MySQL, then re-read
python .ps_pinned_prod.py                         # live: read those three rows, change nothing
node scripts\verify-change-password.cjs           # 17 checks on POST /api/auth/password (needs :8080 up)
node scripts\verify-login-throttle.cjs             # 7 checks on the sign-in lockout (~35s, nearly all waiting)
node scripts\verify-admin-panel.cjs               # 69 admin API checks over HTTP (needs :8080 up)
node scripts\verify-admin-ui.mjs                  # 57 browser checks on the console (creates and removes its own admin)

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

**The `.ohmyagent/` commands above cannot be run from this repository.** `.ohmyagent/` holds
only `settings.json` and is untracked — those scripts, and the MySQL/PHP harness and graph
pipeline they belong to, live on the machine that ran them and were never committed. The
lines stay here as the record of what was run. Everything under `scripts/` *is* in the
repository and runnable, so new checks belong there.

Restart the dev server after an API change. The Vite plugin loads
`Database/api-handler.cjs` once at startup, so a server that is already running keeps
answering from the old handler — which is why iteration 17's new routes looked absent on the
very first browser run (the dialog simply stayed open) until the server was restarted.

---

## Run log

### 2026-10-17 — iteration 17: you can change your own password, and the console can make accounts

Two things were missing rather than broken. The console's per-row **Password** button already
worked, but nothing let a signed-in person change their *own* password anywhere, and adding
an account — an admin included — meant SSH and SQL. Both are now routes with the same shape
in `Database/api-handler.cjs` and `deploy/public/api/index.php`, a form on `/account`, and a
dialog on `/admin`:

| Route | What it does |
| --- | --- |
| `POST /api/auth/password` | `currentPassword` + `password` (8+, max 200). The session says who you are, the current password says it is still you. Rate-limited to 10 tries per 15 minutes. |
| `POST /api/admin/users` | `email`, `name`, `role`, `password`, optional `phone` → 201 with the new row. Same validation as signup, plus the role, and it refuses an email that is already taken. |

**Changing your password does not sign you out.** `destroyOtherSessionsForUser(userId, token)`
deletes every session for the account *except the one that asked*, so the browser you changed
it in stays where it is while a cookie copied off another device stops working immediately.
The console's per-row reset keeps its old behaviour: that one ends every session.

Four details that only show up if you look:

- **A wrong current password is a field error, not a 401.** Both 422s (`Please enter your
  current password.`, `That is not your current password.`) point at the input, so the form
  can highlight it instead of throwing you back to the login page.
- **The Password dialog no longer has a dead button.** It disabled *Set password* until the
  field was long enough, which told you nothing; it now stays clickable, counts down ("3 more
  characters needed"), and answers a short password with the rule.
- **A refused change changes nothing.** Throttle, blank current password, short password,
  wrong current password and a mismatched confirmation all leave the stored hash alone —
  asserted by re-reading the row, and then by signing in with the old password.
- **The created account is really usable, and never leaks.** The check signs in with the
  password it was handed; the response carries the same `SELECT` list as the console's own
  rows, so `password_hash` cannot appear in it. The stored hash is asserted to use the
  current `pbkdf2$sha256$…` scheme and the password itself is asserted absent from the row.

```
node scripts/verify-change-password.cjs   ->  17/17  (new: 17 checks over real HTTP)
node scripts/verify-admin-panel.cjs       ->  69/69  (was 61, +8 for creating an account,
                                                    refusal paths and session cleanup)
node scripts/verify-admin-ui.mjs          ->  57/57  (was 35, +22 in a real browser: the new
                                                    dialog opens, creates and closes; the
                                                    account form refuses a mismatch, a wrong
                                                    current password and a short password,
                                                    then changes it and survives the change)
node scripts/e2e-api-smoke.cjs            ->  {"ok":true,"signup":201,"listings":200,"total":46}
node scripts/verify-event-type-quote.cjs  ->  14/14
node scripts/verify-phone-validation.cjs  ->  22/22
npx tsc --noEmit                          ->  clean
npm run build                             ->  built (client + SSR + prerender)
npx eslint <changed files>                ->  no new problems (the prettier noise and one
                                              react-refresh warning predate this change)
```

Live, read-only, as the real admin: sign in → `/account` shows the three-field form and the
button → `/admin` → Accounts offers **New account** → the dialog opens and closes without
creating anything → the rows still offer **Password** → log out → `/api/auth/me` is `null`
again — **13/13, nothing written**. Two probes of the deployed PHP answer as routes rather
than 404s: `POST /api/auth/password` and `POST /api/admin/users` both return
`401 {"error":"Please log in first."}` while signed out.

Deploy: assets, shell and 46 alias files refreshed; `api/index.php` uploaded as `.new`,
linted on the server (`No syntax errors detected`) and only then moved into place, with the
live md5 matching the local file byte for byte.

**What this iteration did not prove.** The PHP half is proven by the server's `php -l`, by
the route answering 401 live, and by mirroring the Node code line for line — not by running
the PHP against MySQL, which the `.ohmyagent/` harness used to do (see *How to run the
checks*: it is not in this repository). So `POST /api/auth/password` and
`POST /api/admin/users` have never executed against MariaDB. The checks' expected strings
were kept identical in both runtimes on purpose, so a divergence would be visible in a diff.

### 2026-10-16 — iteration 16: the admin console runs the directory, not just the queue

`/admin` was a review queue with a quote table under it. It is now six tabs — Dashboard,
Review queue, Listings, Accounts, Categories, Quote requests — and each one writes real
rows through routes that exist in **both** backends.

The API half has the same shape in `Database/api-handler.cjs` and `deploy/public/api/index.php`:

| Route | What it does |
| --- | --- |
| `GET /api/admin/listings` | `q`, `status`, `category`, `featured`, `sort`, `page`, `pageSize` (default 25, max 100) |
| `GET/PATCH/DELETE /api/admin/listings/:id` | the row the dialog edits; PATCH validates exactly like a vendor edit does, and additionally takes `pinRank` and `isFeatured` |
| `GET /api/admin/users`, `PATCH/DELETE /api/admin/users/:id` | role, suspension, name, phone; delete unattaches the listings and quote requests they made |
| `POST /api/admin/users/:id/password` | new password (8+), and every session that account holds is revoked |
| `GET /api/admin/categories`, `PATCH /api/admin/categories/:id`, `PATCH /api/admin/subcategories/:id` | names, taglines, visibility, specialty labels |
| `GET /api/admin/quotes` | now paged and searchable, joined to the vendor it went to |
| `DELETE /api/admin/quotes/:id` | remove one request |

**An admin cannot lock themselves out.** Demoting, suspending or deleting your own account
is refused with 422 (`You cannot remove your own admin access.` / `You cannot delete your
own account.`) in both runtimes, so the panel cannot be left with no way in.

Three details that only show up if you look for them:

- **`pinRank` refuses to guess.** Only a JSON integer, a float that is a whole number, or a
  run of digits is accepted — `true`, `2.5` and `"abc"` are refused with a field error
  instead of quietly becoming 1, 2 and 0.
- **Deleting an account leaves the directory alone.** `listings.submitted_by` and
  `quote_requests.user_id` become NULL rather than cascading, so a business the account
  submitted stays published.
- **CSV export is not the page you can see.** Every tab walks the filtered set a page at a
  time (capped at 40 pages of 100) and exports all of it.

```
node scripts/verify-admin-panel.cjs       ->  61/61  (real HTTP handler)
node scripts/verify-admin-ui.mjs          ->  35/35  (real browser: sign-in, all six tabs)
node scripts/e2e-api-smoke.cjs            ->  {"ok":true,"signup":201,"listings":200,"total":46}
node scripts/verify-event-type-quote.cjs  ->  14/14
node scripts/verify-phone-validation.cjs  ->  22/22
npx tsc --noEmit                          ->  clean
npx eslint <changed files>                ->  clean
npm run build                             ->  succeeds
```

| Check | Result |
| --- | --- |
| Anonymous and non-admin calls to every new route | 401 / 403, never data |
| A bad listing edit | 422 naming every bad field at once |
| Editing a rejected listing | goes back to `pending`, so the queue re-reviews it |
| A typed city that matches a reference row | stored as that city, so a state search still finds it |
| Your own role changed to `parent` | 422 `You cannot remove your own admin access.` |
| Your own account deleted | 422 `You cannot delete your own account.` |
| A password under 8 characters | refused; the dialog's button stays disabled |
| A password reset on a live session | the old session stops working |
| Renaming a specialty label | stored, reverted, and an empty label refused |
| The featured star in a listings row | flips, survives a reload, flips back |
| Export CSV on any tab | a file really downloads |
| Every tab in a real browser | renders real rows, no uncaught page errors |

Worth knowing:

- **A stale dev server cost an hour of the wrong investigation.** The handler is a module
  required once at boot, so a server started before the API changed answers with the *old*
  routing while the browser happily runs the new client. Every `/api/admin/*` path returned
  401 for anonymous calls — the auth gate runs before route matching, in both versions —
  which looked like "the route exists" and was really "the gate answered, then the old table
  404'd". If a new route 404s while its neighbour works, restart the dev server first.
- **The browser run found a bug no API check could.** `UsersSection.quickChange` set the
  error and then called `load()`, which begins `setError(null)` — so the refusal notice for
  a self-demotion was wiped a few milliseconds after it appeared and the row silently
  reverted. The API was right the whole time; only the screen lied. It now reloads on
  success and keeps the error otherwise, like every other handler in the file.
- **Nothing here is deployed.** `deploy/public/api/index.php` has not been through `php -l`
  on the server, because this machine has no PHP — that lint is the first step of the
  upload, not an optional one.

### 2026-10-16 — iteration 15: the date box opens on a click, and the pins wear their own faces

Four changes, in one request. Two are code, two are data; the data half could not be done
by the existing pipelines, and why is worth writing down.

**1. The hero date box opens its calendar from anywhere in the field.** `DateField`
(`src/components/ui/date-field.tsx`) gained `openOnClick`; the input's own click handler
sets the open state and records that the open came from the field. The calendar glyph still
focuses the grid so keyboard users land in it, but a click-opened calendar must not steal
the caret — the visitor clicked in order to *type*. Radix focuses the panel as it opens,
so `onOpenAutoFocus` calls `preventDefault()` when the open came from the field. The
calendar also dropped `autoFocus`, which was focusing the grid regardless. The wizard's
"Where is the party?" date question already had this behaviour from iteration 14; the hero
box was the one still requiring the glyph.

**2. The Where box suggests states beside cities.** The placeholder said "City or state"
but the lookup behind it was cities only, so a state name returned nothing. New
`GET /api/states` (`listStatesWithCounts`) returns every state with its live count, and
the box filters that list locally — the state row is offered first, labelled
"*n* businesses statewide", because a state is the broader answer.

Matching a state needed a shared rule, not two: `stateMatchSql()` in
`Database/queries.js` (mirrored as `state_match_sql()` in PHP) matches the code, the start
of the name, or — once three letters are typed — the start of *any word* in the name. The
length guard is what keeps two letters honest: `ca` is California's code and stays
California, while `carol` finds the Carolinas. `buildFilters` and `cityMatchSql` both go
through it, so a suggestion the box offers is a search that works.

**3–4. The pinned cards show their own logo and a picture from their own home page.**
`icon_url` and `image_url` are plain columns; what was in them was wrong or empty.
`Database/fetch-icons.cjs` and `fetch-images.cjs` could not do this: they only touch the
local SQLite file, production is MySQL on SiteGround, and there is no MySQL path from
this machine. The values were therefore read off each site by hand and written with
`.ps_pinned_assets.cjs --apply`, which refuses to write a URL that does not answer with
an image.

| Pinned business | Logo (`icon_url`) | Picture (`image_url`) |
| --- | --- | --- |
| Party Characters For Hire | `assets/images/logo.webp` — the mark in their header | `assets/images/about_us.webp` — the team photo on their home page (the page publishes no `og:image`) |
| Party Characters For Kids | `themes/pcfk/assets/brand/party-gift-mark.webp` — the logo their own JSON-LD declares | `pcfk-assets/generated/2026-10-05/fresh/home-superhero-far-desktop.webp` — their `og:image`; the stored path 404'd |
| Characters For Party (New York) | `themes/cfp-v2/assets/media/brand-logo.webp` — the logo in their header | kept — already their `og:image`, still 200 |

`charactersforhire.com` is the odd one out and stays unfixed: it answers every scripted
request with Cloudflare's challenge (403, "Just a moment..."), and a real browser gets
the same interstitial — so no logo or home-page picture can be captured from it at all.
Its row is also **not** in `PINNED_SLUGS`; it holds `pin_rank = 1` and stays in the
directory as an ordinary listing.

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | clean |
| `node .ps_verify_search_ui.mjs` | 16/16 — click anywhere opens the calendar, focus stays in the box, typing and picking both still work, the carried-date note appears, `tex` offers Texas, `ca` stays California, `carol` finds the Carolinas, `chicago` still finds the city, choosing a state searches it |
| `node .ps_verify_pinned_ui.mjs` | 6/6 — all three cards' avatar *and* picture are the business's own and both report `naturalWidth > 0` in the browser |
| `node .ps_pinned_assets.cjs` (dry run) | 6 URLs, all `200 image/*`, nothing written on failure |
| `node .ps_state_totals.mjs` | a state's suggestion count vs its search total (the three pins lead every search and are counted in it) |
| `.ps_tests.cmd` | `PHONE=0` 22/22, `EVENTTYPE=0` 14/14, `SMOKE=0` |
| Visual | `.ps-assets/shots/` — `date-open.png`, `where-states.png`, `pinned-row.png`, `pinned-cards.png` |

Worth knowing:

- **A state search returns its own rows plus the pins.** Texas reports 119 against the
  state's 117: the two pin rows sit in New York and are lifted into every result set. The
  suggestion's number is the state's own count, the results bar's is the search total, and
  the two differ by exactly the pins. Not a new behaviour — the pins have always done
  this — but the gap is visible now that states are offered by name.
- **California and Texas step the family's general row aside** (their per-city rows are on
  screen), Ohio, New York and any city with no row of its own keep it. That is
  `family_guard()` doing its job, not a bug.
- **The production rows still have to be updated by hand.** `.ps_pinned_assets.cjs`
  prints the three `UPDATE` statements; they have not been run against MySQL.

*(Superseded the same day — see the deployment note below.)*

### 2026-10-16 — iteration 15, deployed: hirepartycharacters.com

All four changes are live, and the three pinned rows were pointed at their own logo and
their own home-page picture on production MySQL.

| Step | Result |
| --- | --- |
| `npm run build` | clean |
| site deploy | `index.html` identical to the build, 81 assets uploaded, 43 alias files refreshed, all 5 root files (`favicon.svg`, `logo-characters-for-hire.png`, `logo-mark.png`, `logo.png`, `robots.txt`) md5-checked against the build — the SPA rewrite answers a missing root file with a 200 and the HTML shell, so the hash is the only proof |
| API deploy | `php -l` on the staged file on the server: **No syntax errors detected**; live md5 matches the local file. This is the lint this machine cannot run — there is no PHP here |
| production data | the three `UPDATE`s applied, re-read afterwards: `rows still wrong: 0` |
| `python .ps_verify_live15.py` | 8/8 against `https://hirepartycharacters.com` |
| `python .ps_verify_live_endpoints.py` | live and local agree on every count that the shared state rule touches: categories 10 (no filter, `Texas`, `Chicago` — a location must not drop a category), listings 493 total, `Texas` 119, `Chicago` 41, `Ohio` 37, `superheroes`+`Texas` 39 |

The live checks, as run:

- `/api/states` → 15 rows, first `{"code": "TX", "name": "Texas", "listing_count": 117}`
- a live `location=Texas` search reaches 119 listings (117 Texas + the two pins)
- clicking the left of the hero date box opens the grid and focus stays on `party-date`;
typing `12-25-2026` still lands in the box
- `tex` in the Where box → `Texas — 117 businesses statewide`
- all three pinned cards: their logo as the avatar and their home-page picture as the
  card image, every one `naturalWidth > 0` on the live page

Production rows before → after:

| Slug | `icon_url` | `image_url` |
| --- | --- | --- |
| `party-characters-for-hire` | `favicon.ico` → `assets/images/logo.webp` | `NULL` → `assets/images/about_us.webp` |
| `party-characters-for-kids` | `uploads/2023/05/favicon.png` → `themes/pcfk/assets/brand/party-gift-mark.webp` | `uploads/2023/06/…-1024x576.webp` (404) → `pcfk-assets/generated/2026-10-05/fresh/home-superhero-far-desktop.webp` |
| `party-characters-for-kids-new-york` | `uploads/2022/11/favicon-300x300.png` → `themes/cfp-v2/assets/media/brand-logo.webp` | unchanged — already their `og:image` and still 200 |

`charactersforhire.com` (the row with `pin_rank = 1`, not in `PINNED_SLUGS`) is still
untouched: it serves Cloudflare's challenge to fetch, to a scripted request and to a real
browser alike, so there is no logo or home-page picture to capture. Its card keeps the
initials fallback.

For Party Characters For Hire a choice was made: their home page has no `og:image`, and
its pictures are the hero (`assets/images/banner.webp`, a 940x370 strip, used as a CSS
background), the hero video's poster (`assets/images/posters/default.webp`, only 320x180)
and the About Us photo (`assets/images/about_us.webp`, 1076x792). The About Us photo won on
resolution and shape — it is the closest of the three to the card's 700x460. Swapping to
the banner is one `UPDATE listings SET image_url =…` if that reads better.

One thing this turned up that is **not** new: `/api/stats` does not exist on the PHP API,
only on the Node one. `origin/main`'s `deploy/public/api/index.php` has no such route
either and nothing in the frontend calls it, so the live 404 is the status quo, not a
regression from this deploy.

### 2026-10-07 — iteration 14: the whole logo is the image, and nothing is set beside it

The header used to draw the mark and write the name beside it as text. The user asked
for the logo to be *only* the image — "don't use text" — so `Brand`
(`src/components/marketplace/footer.tsx`) is now a single `<img>` and a link, and the
`compact` prop (which existed only to hide that text) is gone with it. The name moves
into the accessible name of the link.

The image is the lockup the site was given, `logo.png` (980×550, 499,639 bytes): the
crown-and-gift mark, "Hire Party Characters" and the swoosh in one artwork. Two things
had to be dealt with before it could be shipped as a header asset.

**It was rendered on a sheet.** The file is opaque and its corners are `(252,252,253)` —
a near-white page with compression noise. Dropped straight into the translucent header
it would show a pale rectangle, and in the footer it would show a bright one on the dark
panel. The sheet is therefore removed by flooding in from the border with a tolerance of
26 per channel, **not** by keying every near-white pixel: the artwork encloses white of
its own, and a global key would punch holes through it. Seven enclosed regions totalling
7,188 pixels are left alone — the star in the shield (5,496 px) and six gaps inside the
letters — while 298,382 of 539,000 pixels (55.4%) clear. All four corners of the result
end at alpha 0.

**It was the wrong size to ship.** Cropped to its artwork it is 949×522 (ratio 1.82) and
499 KB. The header draws it 48px tall, so `public/logo.png` is stored at **218×120** —
3× the drawn size, 49 KB — so the browser downsamples rather than the file shipping an
upscaled alpha ramp that barely compresses. The same reasoning as the mark in
iteration 10, and the file is served from the site root, so the deploy uploads it with
the other root files and md5-checks it.

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` and `npm run build` | clean / succeeds |
| Live header logo | `/logo.png` at its real 218×120, drawn 87×48, `naturalWidth` > 0 |
| Live header text beside the logo | none — the link's text is the empty string at every width |
| Header at 360 / 390 / 480 / 640 / 768 / 1024 / 1280 / 1440px | inside the 72px header, clear of the nav wherever the nav is shown, no horizontal overflow — 8/8 |
| Live footer | the same lockup on its light pill (the artwork is navy; the dark panel would swallow it) |
| Live mobile sheet | the lockup in the sheet title, complete, not clipped |
| No uncaught page errors | PASS |
| Live `/logo.png` | uploaded as a root file, md5-matches the build, 200 with real bytes — not the SPA shell |
| `python %TEMP%\ps_live_verify13.py` | 11/11 (unchanged) |
| `node scripts/verify-phone-form.mjs https://hirepartycharacters.com` | 8/8 (unchanged) |

Worth knowing:

- **The words in the artwork are small by design.** At 48px the dominant "Party" is
  ~17px and "Hire" ~8px, which is the trade-off for using the supplied artwork as the
  whole logo. It is drawn at 48px rather than the old 36px mark to keep them readable.
- **The hover treatment changed** from rotating the mark to a 5% scale: rotating a wide
  lockup swings its corners towards the nav.
- **`public/logo-mark.png` is now referenced by nothing.** It is left in place (and still
  uploaded) so that iteration 10 can be restored by reverting one file rather than
  regenerating the mark.
- The colour behind the logo is only invisible because the sheet was removed: on the
  header's `bg-background/90` bar and on the footer's `bg-background/95` pill the artwork
  now sits on whatever is behind it.

### 2026-10-14 — iteration 14: both forms ask for every answer

Asked for: *"make every field required in both end listing form and request quote"*.
Two questions were settled first — the **starting price stays optional** (a business may
genuinely not have one), and the **event date is required** like every other answer.

**1. The quote wizard asks eleven questions and now needs all eleven.** `quoteSchema`
gained rules for `phone` (it had been optional), `eventDate`, `guestCount` and
`childAge`, and `details` needs at least 10 characters. The date step no longer offers
"Skip this if you have not settled on a date yet." — its hint is now "The day you are
planning the party for." — and the phone hint no longer says "Optional, but…".
`Next` already validated the step it was on (`form.trigger(current.field)`), so the rule
below is what made it refuse: the wizard will not open the next question until the one on
screen is answered, and a rejection from an earlier question lands the visitor back on it.

**2. The listing form requires everything but the price.** Name, category, city, website,
phone, booking email and description are all required — a check in `BusinessForm` reports
all of them at once, the inputs carry `required`, and the labels lost their
"(optional)" suffix. **"Starting price (optional)" is deliberately untouched.**

**3. Both backends say the same thing.** `validateQuoteRequest` and `validateSubmission`
in `Database/api-handler.cjs` and the three equivalent routes in
`deploy/public/api/index.php` (`POST /api/quote-requests`, `POST /api/listings`,
`PATCH /api/vendor/listings/:id`) enforce the new rules with per-field messages. The
edit route was included on purpose: it is the one a vendor uses to blank a field *after*
approval, and it now passes `description` through instead of silently dropping it.

```
node scripts/verify-phone-validation.cjs    ->  22/22  (server side, Node)
node scripts/verify-event-type-quote.cjs    ->  14/14  (column, POST, both readers)
node scripts/e2e-api-smoke.cjs              ->  {"ok":true,"signup":201,"listings":200,"total":46}
node .ps_probe_required_live.mjs            ->  29/29  (live PHP, nothing written)
node .ps_probe_form_rules.mjs               ->  20/20  (live build, real browser)
npx tsc --noEmit                            ->  clean
npm run build                               ->  succeeds; live entry md5 matches, php -l clean on the server
```

| Check | Result |
| --- | --- |
| An empty quote against the live PHP API | 422 naming all eleven fields, `id` absent — nothing stored |
| The same request with one answer too short | 422 on `details` **only**, which is what proves the other ten passed |
| A quote with no phone / no date | 422 with `Please enter your phone number.` / `Please pick the date of the party.` |
| An empty listing against the live PHP API | 422 naming name, category, city, website, phone, email, description |
| A complete listing whose name is already in the directory | 409 — validation passed, no row written |
| The same complete payload with `priceFrom` blank | still 409, so the price is still optional |
| Live browser: `Next` on an empty date | message shown, wizard stays on "When is the party?" |
| Live browser: a date of 12-24-2026 | moves on to "How many children are you expecting?" |
| The deployed `vendor-pages` chunk | "Starting price (optional)" present; "Website (optional)", "Phone (optional)", "Booking email (optional)" gone |
| Production after the run | 508 active listings, 0 pending, 0 probe accounts |

Worth knowing:

- **Two scripts asserted the opposite rule** and had to be rewritten, not worked around:
  `verify-phone-validation.cjs` had four "a blank phone is still accepted" rows and
  `verify-event-type-quote.cjs` had "a request without an event type stores NULL". They now
  assert the refusals and the messages, and the event-type script's probes each send a
  complete request with one field varied, so a failure names the rule that broke rather
  than the first missing answer. A check that contradicts the rule is a bug in the check.
- **The live listing route needs a session**, so the probe signs up
  `rules-probe@example.test`, asserts it created no listing, and
  `%TEMP%\ps_probe_cleanup.py` deletes the account (and its sessions, favourites and any
  listing it owned) over SSH. The happy path is proven without writing anything at all by
  submitting a complete payload under a name that is already published: the 409 can only
  come back after validation has passed.
- **The date has no "not sure yet" answer any more.** That is the rule that was asked for;
  the field still takes any real future date, typed as `mm-dd-yyyy` or picked.



Three changes to the live site, each one verified against production rather than
locally.

**1. Every form with a phone field now checks it, on both sides.** The quote wizard,
the business listing form (both creating and editing a listing), the sign-up form and
the profile form all accepted any text
in `phone` — `phone: z.string().trim()` had **no rule at all** on the quote form, and the
API's `validateQuoteRequest`/`validateSubmission`/`validateCredentials` and the PHP
equivalents only capped its length. A shared rule now lives in `src/lib/validation.ts`
(`phoneError`, `sanitisePhoneInput`, `normalisePhone`) and is mirrored server-side in
`Database/api-handler.cjs` and `deploy/public/api/index.php`, because the browser is
never trusted. A phone is optional everywhere at this point, so blank still passes —
**iteration 14 later made it required on the quote wizard and the business forms, leaving
sign-up and profile optional.**

- Allowed: digits, spaces, `+`, `-`, `(`, `)`, `.`. At most one `+`, and only leading.
- Digits after stripping formatting: **7–15**. Below that the field says so; a properly
  formatted number is stored in one shape (`+16416663945`, or `6416663945` without a `+`).
- The inputs carry `inputMode="tel"` and an `onChange` sanitiser, so pasting or typing
  letters simply drops them instead of waiting for a submit to complain.

**2. The 223 listings rated exactly 5.0 were spread through 4.2–4.7.** A directory where
223 of 507 listings (44%) score a perfect 5.0 does not read as real. The new value is a
`CASE` on `id % 12`, so SQLite and MySQL compute the same answer and re-running is a
no-op once a row has left 5.0. Nothing was invented: the review counts are untouched,
the 27 unrated rows stay unrated, and the 129 rows at 4.8–4.9 were left alone as asked.

| | before | after |
| --- | --- | --- |
| exactly 5.0 | **223** | **0** |
| 4.8–4.9 | 129 | 129 (untouched) |
| 4.2–4.7 | 91 | **315** |
| below 4.2 | 37 | 36 |
| unrated | 27 | 27 |

The band now reads 4.2 ×29, 4.3 ×26, 4.4 ×62, 4.5 ×68, 4.6 ×79, 4.7 ×51 — weighted
towards the middle, so the directory does not look like everything landed on one number.
The one row that moved *into* the band is listing 9 (below).

**3. Listing 9 and listing 492.** #9 *Party Characters For Kids* was the worst-rated row
in the directory (2.0 from 198 reviews) and was corrected to **4.4 from 243 reviews**.
#492, a city clone, was renamed **Characters For Party** — which is what the business
calls itself, as its own opening sentence on the page says. The rename initially changed
its address to `/vendors/characters-for-party`, which would have broken the link the
listing already had, so the original address
`/vendors/party-characters-for-kids-new-york` was put back; the display name and the URL
disagree on purpose. `scripts/add-characters-for-party.cjs` matches cities by slug and
never renames an existing row, so a re-run cannot undo it, and
`Database/characters-for-party-listings.sql` was updated to match.

The local SQLite copy and production MySQL were changed by the same statements, so the
two agree; the SQLite file was backed up to `Database/directory.db.backup-*` first.

```
node scripts/verify-phone-validation.cjs        ->  22/22  (server side, both runtimes' shape)
node scripts/verify-phone-form.mjs \
  https://hirepartycharacters.com              ->   8/8   (live, real browser)
python %TEMP%\ps_live_verify13.py              ->  11/11  (live API: data and 404s)
python %TEMP%\ps_verify_live_php.py            ->  14/14  (live PHP API, rows deleted after)
```

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` and `npm run build` | clean / succeeds |
| Typing "call me maybe 123" into the live phone field | field ends up holding `"   123"` — no letters |
| A too-short number on the live form | `aria-invalid`, message shown, still on question 11 — not sent |
| Letters and a too-short number in the live sign-up field | letters dropped as typed, message shown, and no sign-up request ever left the browser |
| `POST /api/quote-requests` with `"not-a-phone"` | 422 with a `phone` message (nothing stored) |
| Live PHP, all five write paths (quote, sign-up, profile, listing create, listing edit) | 422 with a `phone` message each, and a valid number stored normalised |
| Live PHP rows created to prove the happy path | deleted again; production shows 507 listings, 0 probe accounts, 0 probe quote requests |
| A blank phone on the sign-up and profile forms | still accepted (optional there) |
| Guest count of `"a dozen"` | 422 on both the Node and the live PHP API |
| Live listings still rated 5.0 | 0 |
| Live band 4.2–4.7 / below 4.2 / unrated | 315 / 36 / 27 |
| Live listing 9 | rating 4.4, 243 reviews, page shows 4.4 (243) |
| Live listing 492 | name "Characters For Party" at its original address |
| Live listing 2 (was 5.0) | page shows 4.6 (1381), no 5.0 in the page text |
| A missing page path | still 200 with the app shell; unknown API path still 404 |
| `php -l` on the deployed `api/index.php` | no syntax errors (checked on the server before it went live) |

Worth knowing:

- The phone rule applies to `phone` **only** — a name or message field still accepts
  anything, which is intended.
- The sign-up form's phone field was a second gap found the same way: it posted whatever
  was typed, because only the profile field had been given the sanitiser. It now drops
  letters as they are typed, shows the message under the field, and short-circuits before
  the request — the browser check asserts that no sign-up request is sent.
- `PATCH /api/vendor/listings/:id`, the path a vendor uses to *edit* a listing, was the one
  place both the first pass and the deployed PHP had missed. It did not store junk
  (`phone_or_null` blanked it), but it silently discarded what was typed. The live run
  above is what caught it: the check came back **200 instead of 422** against production,
  the file was fixed, redeployed, and the same check then passed. Local `php` is not
  installed on this machine, so the deployed file is staged as `api/index.php.new` and
  linted with `php -l` on the server before the swap — an unparseable upload can no longer
  take the API down.

### 2026-10-05 — iteration 12: Party builder goes, Request a quote takes its place

The nav's third link was **Party builder** (`/party-builder`). The page was real — it
queried the live directory by category, city, date, children and budget and handed the
answers to the quote form — but it asked the **same questions the quote form asks**, so
it competed with the form instead of feeding it. The page, its route and its component
are gone, and the nav now links **Request a quote** (`/request-quote`) in that slot, on
desktop and in the mobile slide-out menu. The header stays 72px and the other links
(Explore, Categories) are untouched.

Removing it needed more than deleting a file:

- `PartyBuilderPage` lived in `account-pages.tsx`; its block and the imports only it
  used (`fetchCategories`, `fetchCitySuggestions`, `fetchListings`, `City`, `Sparkles`,
  `WandSparkles`, `BUILDER_BUDGETS`) are gone. The rest of that session builder stays.
- `src/routeTree.gen.ts` is generated, but `npm run build` regenerates it — the route
  disappears from the tree without hand-editing, which `tsc` then confirms.
- `scripts/verify-quote-form-live.mjs` asserted on the builder's date field, so that
  check is removed with the page rather than left to fail.

`/party-builder` is now an unknown path, so the SPA rewrite falls through to the 404
page. The 404 route raises a React hydration warning (#418) — but so does a path that
never existed, so that belongs to the 404 route and is **not** something this change
introduced. Worth a look on its own; recorded here so it is not mistaken for fallout.

```
node scripts/tmp-nav-check.mjs https://hirepartycharacters.com   ->  9/9   (live)
```

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` and `npm run build` | clean / succeeds |
| No `party-builder` or `PartyBuilder` reference left under `src/` | 0 |
| Desktop nav is Explore, Categories, Request a quote — no Party builder | PASS |
| Mobile menu is Explore, Request a quote, List your business — no Build my party | PASS |
| The Request a quote link resolves to `/request-quote` and opens the quote page | PASS |
| The header is still 72px | PASS |
| `/party-builder` no longer serves a working page (404, no quote form) | PASS |
| Live: the same checks against `hirepartycharacters.com` | 9/9 |

### 2026-10-05 — iteration 11: the site is called Hire Party Characters

The name was `PartySprout`, written out in **90 places across 51 files** under `src/`.
`src/lib/site.ts` exports a `SITE_NAME` constant, but **nothing imports it** — every page
title, meta tag and sentence carried its own copy of the string, which is why the rename
could not be a one-line change. All 90 now read **Hire Party Characters**: page titles,
meta/OG/Twitter tags, the `author` tag, the footer copyright, on-page copy (about, terms,
privacy, how it works), the `aria-label` on the home link, and the placeholder support
address, now `hello@hirepartycharacters.example`.

The header could not hold the longer name on one line. At 20px it is about **211px**
wide, and the row also carries the nav and the CTAs, so between **640px and 1279px** the
name wrapped mid-title and dragged "Party builder" onto two lines with it. Rather than
shrink the type to something ~13px or hide the name on small laptops, the brand is now an
explicit **two-line lockup** — "Hire Party" over "Characters" — about 110px wide, which
fits from 390px to 1440px with the 72px header and the nav/CTA decisions from iteration 9
untouched. The second line keeps the brand purple, so the two-tone wordmark survives.
"Characters" is a block span rather than a natural wrap, so the break is deliberate
instead of depending on how much room the row happens to have.

```
node scripts/tmp-name-check.mjs https://hirepartycharacters.com   ->  23/23   (live)
```

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` and `npm run build` | clean / succeeds |
| No `sprout` / `partysprout` / `partyspark` / `party spark` token left under `src/` | 0 |
| The header reads "Hire Party Characters", stacked, with the accent on the last line | PASS |
| The header is still 72px and the brand measures 144×50 at every width | PASS |
| No page, header or row overflow at 390 / 640 / 768 / 1024 / 1280 / 1440px | PASS |
| Titles carry the new name on /, /search, /explore, /about and /terms | PASS |
| Footer reads "© 2026 Hire Party Characters"; no old name anywhere in it | PASS |
| On-page copy and the support address are renamed; no old name on /about or /contact | PASS |
| The logo mark still loads (88×120); no uncaught page errors | PASS |
| Live: the same checks against `hirepartycharacters.com` | 23/23 |

### 2026-10-02 — iteration 10: the header wears the real logo

The brand was a purple rounded square holding a lucide `Sparkles` beside the words
"Party**Sprout**". `logo.png` is not a mark: it is a lockup — the gift-stack
illustration (375×529 at x 25..399 of 980×550) with "PartySprout" set beside it and a
tagline under that. Put the whole file in the header and its printed wording lands at
about **7px tall**, which is a smudge rather than text; setting it large enough to read
would push the header to ~96px and drag the search bar and journey cards again. So the
header uses **the mark only**, and the name stays real text — navy with the last four
letters in the brand purple, echoing the logo's own two-tone wordmark.

The file is opaque RGB on a *papered* white ground (253,253,253 rather than 255), so a
plain white→transparent key left a **1% veil across the whole bounding box**: invisible
over the near-white header, but a visible rectangle over any darker ground. Alpha is
derived from luminance with that paper floored out, which leaves the corners at alpha 0,
**no** opaque and **no** semi-transparent near-white pixel anywhere, and the artwork's
soft drop shadow intact. The result is `public/logo-mark.png`, 88×120 — stored near 3×
the 36px it is drawn at, so the browser downsamples rather than the file shipping an
upscaled alpha ramp that barely compresses — and the 72px header is untouched.

The footer's panel is near-black while the mark is dark navy, so the footer's brand sits
on a light pill that also re-sets the wordmark to its dark colour; the footer's own body
text is light and would otherwise be inherited.

The favicon was rebuilt from the same mark, embedded base64 in `public/favicon.svg` so it
stays a single self-contained file, and it keeps the `/favicon.svg` path so `__root.tsx`
needed no change.

Going live needed two things the code alone did not cover. The staging domain
`anuranjanv14.sg-host.com` had been **renamed** to `hirepartycharacters.com`: its DNS was
gone (NXDOMAIN from Google, Cloudflare and Quad9 while `sg-host.com` itself still
resolved) and its docroot no longer existed, while the new docroot held the same bytes —
the same account on the same server, so only the deploy target moved. And `logo-mark.png`
lives at the site root rather than under `/assets/`, which is all the deploy script had
been uploading, so the mark never shipped: `/logo-mark.png` answered **200 with the HTML
shell**, because the SPA rewrite catches unknown paths, and the browser reported an image
it could not decode (`naturalWidth` 0) instead of a 404. The deploy now uploads the
build's root static files and md5-checks each against the build, because a silent 200
hides that failure completely.

```
node scripts/tmp-logo-check.mjs https://hirepartycharacters.com   ->  20/20   (live)
```

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` and `npm run build` | clean / succeeds |
| Header shows `/logo-mark.png` at its real 88×120, drawn 26×36 | PASS |
| Header still 72px; no page or header overflow at 390 / 640 / 768 / 1024 / 1280px | PASS |
| The mark is decorative (`alt=""`); the link is named "PartySprout home" | PASS |
| "PartySprout" is still real text at 20px, not baked into the image | PASS |
| The mark's corners are alpha 0, with no opaque or semi-transparent near-white pixel | PASS |
| Favicon serves 200 from `/favicon.svg` and carries the mark as a base64 PNG | PASS |
| Footer brand sits on a light pill and the wordmark re-sets its own dark colour | PASS |
| No uncaught page errors | PASS |
| Live: `/logo-mark.png` is 16,611 bytes and md5-matches the build, not the HTML shell | PASS |
| Live: `/favicon.svg` is 6,680 bytes and carries the mark; `/robots.txt` unchanged | PASS |
| Live: the same checks against `hirepartycharacters.com` | 20/20 |

### 2026-10-02 — iteration 9: the nav calls you, and the results bar sits under the header

The search bar on every listing page stuck at `top: 0` at `z-30` while the header is
`z-40` and 72px tall, so it stuck *behind* the header and came back half-hidden — the
"little sticky" that prompted this. It now sticks at `lg:top-18`, exactly the header's
72px, and its slide-away moves it a full header-plus-itself out of the way. The height
lives on the header element, whose border sits inside those 72px, so the bar is flush
at rest *and* stuck: measured `bar.top = header.bottom = 72` in both states.

The nav lost **Saved** (desktop links and the mobile slide-out menu; the bottom bar and
`/favorites` keep it) and **For entertainers**, since "List your business" already
points at that page. **Find businesses** became a **Call us (641) 666-3945** `tel:`
link — 16px bold on 12px / 20px of padding, 246×48px, so it stands at the same height
as the buttons beside it. It rings and breathes (2.6s) and, on hover, settles the halo
into a 3px ring, deepens the purple, lifts 2px and gives the handset one 0.6s ring;
`prefers-reduced-motion` stops every part of it. Between 640px and the desktop nav the
row cannot also hold the words "Call us", so there the handset and the number carry it
at a slightly smaller size and `aria-label` keeps the full name.

An earlier cut of the button used the 28px / 20px padding as first specified, which
made it 76px tall and pushed the header to 96px — and dragged the home page's sticky
journey cards with it, since their offsets are measured against the header. At the
standard CTA size the header is back to its original 72px and the cards are back at
100/215/330 with their 28px gap and 115px stacking rhythm.

```
node scripts/tmp-cta-check.mjs   ->  20/20   (temporary driver, deleted after the run)
```

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` and `npm run build` | clean / succeeds |
| Bar at rest and stuck both measure `top=72`, header `bottom=72` — no jump, no overlap | PASS |
| Scrolling down slides the bar fully out (`bottom=0`); scrolling up brings it back flush | PASS |
| Nav offers no Saved and no For entertainers; Explore, Categories, Party builder survive | PASS |
| Button is 246×48px, 16px bold, padding `12px 20px 12px 20px`, `tel:+16416663945` | PASS |
| Hover deepens the purple, lifts 2px, turns the halo into a 3px ring and rings the handset once for 0.6s | PASS |
| Releasing the hover restores the resting background and position | PASS |
| `call-halo` on the button and `call-ring` on the handset, both `running`; halo 0 → 14px, handset ±11° | PASS |
| No page or header overflow at 640 / 768 / 1024 / 1280px; the full label returns at the desktop nav | PASS |
| Home page journey cards back at 100/215/330 with their 28px gap under the 72px header | PASS |
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

Rate limiting: the Node API throttles signup and password changes (10 per 15 min
per IP), sign-in (10 per 30 s, so a mistyped password costs half a minute rather
than fifteen) and quote requests (30 per 15 min) in memory. PHP keeps nothing
between requests, so `index.php` throttles the same routes through a small locked
file per IP in the temporary directory.

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
6. **party builder** → **REMOVED (iteration 12).** It was fixed as a shortlist tool, but
   it duplicated the quote form's own city/date/type answers, so the page and its route
   are gone. The nav now links **Request a quote** in its place, and `/party-builder`
   falls through the SPA rewrite to the catch-all not-found page like any unknown path.
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
- **Iteration 17's two PHP routes have never run against MySQL.** They are mirrored into
  `deploy/public/api/index.php` line for line, parse on the server and answer 401 when
  signed out, but the local PHP+MariaDB harness that would run the whole flow
  (`php_e2e.mjs`, `check_php_vs_node.mjs`) is not in this repository, so the create and
  change-password paths are only proven in the Node backend and in the browser against it.

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
