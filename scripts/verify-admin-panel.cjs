/**
 * Exercises every admin route against a real (development) database.
 *
 *   node scripts/verify-admin-panel.cjs
 *
 * It creates its own admin, listing, parent account and quote request, drives the
 * routes through the real HTTP handler, then removes everything it made. Any
 * mismatch throws with the offending response, so a green run means the console
 * can actually do what its screens offer.
 */
const http = require('node:http');
const crypto = require('node:crypto');
const { handleApi } = require('../Database/api-handler.cjs');
const { db } = require('../Database/index.js');
const queries = require('../Database/queries.js');
const auth = require('../Database/auth.js');

const checks = [];
function check(name, condition, detail) {
  if (!condition) throw new Error(`${name}\n  ${JSON.stringify(detail)}`);
  checks.push(name);
}

function request(port, path, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method: options.method || 'GET',
        headers: options.headers || {},
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'),
          }),
        );
      },
    );
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

function json(payload) {
  const body = JSON.stringify(payload);
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) },
    body,
  };
}

function patch(payload) {
  return { ...json(payload), method: 'PATCH' };
}

/** Everything this run created, removed again whichever way it ends. */
let server = null;
const created = { userIds: [], listingIds: [], quoteIds: [] };

function cleanup() {
  for (const id of created.quoteIds) db.prepare('DELETE FROM quote_requests WHERE id = ?').run(id);
  for (const id of created.listingIds) db.prepare('DELETE FROM listings WHERE id = ?').run(id);
  // Sessions first: deleting a user row on its own would leave them behind.
  for (const id of created.userIds) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
  for (const id of created.userIds) db.prepare('DELETE FROM users WHERE id = ?').run(id);
  created.quoteIds = [];
  created.listingIds = [];
  created.userIds = [];
  if (server) server.close();
}

(async () => {
  server = http.createServer((req, res) => void handleApi(req, res));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  const stamp = crypto.randomUUID().slice(0, 8);
  const password = 'correct-horse-battery-staple';

  const category = db.prepare('SELECT id, name FROM categories ORDER BY id LIMIT 1').get();
  const country = db.prepare('SELECT id FROM countries ORDER BY id LIMIT 1').get();
  const city = db.prepare('SELECT ci.id, ci.name, ci.state_id FROM cities ci ORDER BY ci.id LIMIT 1').get();

  const admin = queries.createUser({
    email: `admin-${stamp}@example.test`,
    name: 'Verify Admin',
    phone: '',
    passwordHash: auth.hashPassword(password),
    role: 'admin',
  });
  created.userIds.push(admin.id);
  const parent = queries.createUser({
    email: `parent-${stamp}@example.test`,
    name: 'Verify Parent',
    phone: '',
    passwordHash: auth.hashPassword(password),
    role: 'parent',
  });
  created.userIds.push(parent.id);

  const parentLogin = await request(port, '/api/auth/login', json({ email: parent.email, password }));
  check('parent can sign in', parentLogin.status === 200, parentLogin.body);
  const parentCookie = parentLogin.headers['set-cookie'][0].split(';')[0];

  const adminLogin = await request(port, '/api/auth/login', json({ email: admin.email, password }));
  check('admin can sign in', adminLogin.status === 200, adminLogin.body);
  const adminCookie = adminLogin.headers['set-cookie'][0].split(';')[0];
  const asAdmin = (path, options = {}) => request(port, path, { ...options, headers: { ...(options.headers || {}), cookie: adminCookie } });

  /* --- access control -------------------------------------------------- */

  const anonymous = await request(port, '/api/admin/listings');
  check('anonymous admin access is refused', anonymous.status === 401, anonymous.body);
  const asParent = await request(port, '/api/admin/listings', { headers: { cookie: parentCookie } });
  check('non-admin admin access is refused', asParent.status === 403, asParent.body);
  const badPath = await asAdmin('/api/admin/nonsense');
  check('unknown admin path falls through', badPath.status === 404, badPath.body);

  /* --- stats ----------------------------------------------------------- */

  const stats = await asAdmin('/api/admin/stats');
  check('stats responds', stats.status === 200 && typeof stats.body.stats.listings === 'number', stats.body);
  check('stats includes byStatus', Array.isArray(stats.body.byStatus), stats.body.byStatus);

  /* --- listings -------------------------------------------------------- */

  const listing = queries.createSubmission({
    name: `Verify Listing ${stamp}`,
    categoryId: category.id,
    countryId: country.id,
    stateId: city.state_id,
    cityId: city.id,
    cityText: null,
    description: 'Created by scripts/verify-admin-panel.cjs',
    website: 'https://example.com/verify',
    phone: '5551234567',
    email: `vendor-${stamp}@example.test`,
    priceFrom: 250,
    submittedBy: parent.id,
  });
  created.listingIds.push(listing.id);
  check('admin sees a pending submission', listing.status === 'pending', listing.status);

  const filtered = await asAdmin(`/api/admin/listings?q=Verify%20Listing%20${stamp}&page=1&pageSize=25`);
  check('listing search finds it', filtered.status === 200 && filtered.body.total === 1, filtered.body);
  check(
    'listing rows carry the edit-form columns',
    filtered.body.items[0].category_id === category.id &&
      filtered.body.items[0].submitted_by === parent.id &&
      filtered.body.items[0].pin_rank === 0,
    filtered.body.items[0],
  );
  check(
    'paging metadata is returned',
    filtered.body.page === 1 && filtered.body.pageSize === 25,
    filtered.body,
  );

  const byStatus = await asAdmin('/api/admin/listings?status=pending&pageSize=1');
  check('status filter is applied', byStatus.status === 200 && byStatus.body.pageSize === 1, byStatus.body);

  const one = await asAdmin(`/api/admin/listings/${listing.id}`);
  check('single listing lookup works', one.status === 200 && one.body.listing.id === listing.id, one.body);

  const missing = await asAdmin('/api/admin/listings/99999999');
  check('missing listing is a 404', missing.status === 404, missing.body);

  /* --- listing validation ---------------------------------------------- */

  const badEdit = await asAdmin(`/api/admin/listings/${listing.id}`, patch({ name: 'x', categorySlug: 'no-such-category', status: 'nope', website: 'javascript:alert(1)', email: 'not-an-email', phone: 'hello', priceFrom: 'lots', pinRank: 'abc' }));
  check('a bad edit is refused with per-field errors', badEdit.status === 422, badEdit.body);
  check(
    'every bad field is reported',
    ['name', 'categorySlug', 'status', 'website', 'email', 'phone', 'priceFrom', 'pinRank'].every((key) => badEdit.body.fields[key]),
    badEdit.body.fields,
  );

  /* --- listing edit ---------------------------------------------------- */

  const edited = await asAdmin(
    `/api/admin/listings/${listing.id}`,
    patch({
      name: `Verify Listing ${stamp} (edited)`,
      categorySlug: filtered.body.items[0].category_slug,
      cityText: city.name,
      website: 'https://example.com/edited',
      phone: '555 987 6543',
      email: `edited-${stamp}@example.test`,
      priceFrom: '495',
      description: 'Edited by the verification script.',
      policies: 'Deposit required.',
      status: 'active',
      isFeatured: true,
      pinRank: 7,
      reviewNote: 'Looks good.',
    }),
  );
  check('listing edit succeeds', edited.status === 200, edited.body);
  const after = edited.body.listing;
  check(
    'edited fields are stored',
    after.name.endsWith('(edited)') &&
      after.status === 'active' &&
      after.is_featured === 1 &&
      after.pin_rank === 7 &&
      after.price_from === 495 &&
      after.policies === 'Deposit required.' &&
      after.website === 'https://example.com/edited',
    after,
  );
  check(
    'a typed city that matches a reference row links to it',
    after.city_id === city.id && after.state_id === city.state_id && after.city_text === null,
    { city_id: after.city_id, state_id: after.state_id, city_text: after.city_text },
  );

  const freeText = await asAdmin(
    `/api/admin/listings/${listing.id}`,
    patch({ ...listingInput(edited.body.listing), cityText: 'Nowhereville' }),
  );
  check(
    'an unknown city stays free text',
    freeText.status === 200 && freeText.body.listing.city_id === null && freeText.body.listing.city_text === 'Nowhereville',
    freeText.body.listing,
  );
  check(
    'the free-text city survives in the row the UI shows',
    freeText.body.listing.city_name === 'Nowhereville',
    freeText.body.listing.city_name,
  );

  const approved = await asAdmin(`/api/admin/listings/${listing.id}/status`, json({ status: 'rejected', note: 'Not a fit.' }));
  check('status endpoint works', approved.status === 200 && approved.body.listing.status === 'rejected', approved.body);
  const publicLookup = queries.getListingBySlug(listing.slug);
  check('a rejected listing is not public', !publicLookup, publicLookup);

  const pinned = await asAdmin(`/api/admin/listings?featured=1&pageSize=100`);
  check(
    'the featured filter finds the featured row',
    pinned.status === 200 && pinned.body.items.some((row) => row.id === listing.id),
    pinned.body.total,
  );

  /* --- accounts -------------------------------------------------------- */

  const users = await asAdmin(`/api/admin/users?q=parent-${stamp}&page=1`);
  check('user search finds the parent', users.status === 200 && users.body.total === 1, users.body);
  check('user rows never leak a password hash', users.body.items[0].password_hash === undefined, Object.keys(users.body.items[0]));
  check('user rows carry the linked business', 'listing_name' in users.body.items[0], users.body.items[0]);

  const selfDemote = await asAdmin(`/api/admin/users/${admin.id}`, patch({ name: admin.name, phone: '', role: 'parent', status: 'active' }));
  check('an admin cannot demote themselves', selfDemote.status === 422, selfDemote.body);
  const selfSuspend = await asAdmin(`/api/admin/users/${admin.id}`, patch({ name: admin.name, phone: '', role: 'admin', status: 'suspended' }));
  check('an admin cannot suspend themselves', selfSuspend.status === 422, selfSuspend.body);
  const selfDelete = await asAdmin(`/api/admin/users/${admin.id}`, { method: 'DELETE' });
  check('an admin cannot delete themselves', selfDelete.status === 422, selfDelete.body);

  const badUser = await asAdmin(`/api/admin/users/${parent.id}`, patch({ name: 'x', phone: 'hello', role: 'wizard', status: 'gone' }));
  check('a bad account edit is refused', badUser.status === 422, badUser.body);
  check(
    'account problems are reported per field',
    ['name', 'phone', 'role', 'status'].every((key) => badUser.body.fields[key]),
    badUser.body.fields,
  );

  const renamed = await asAdmin(`/api/admin/users/${parent.id}`, patch({ name: 'Renamed Parent', phone: '5551112222', role: 'vendor', status: 'active' }));
  check(
    'account edits are stored',
    renamed.status === 200 && renamed.body.user.name === 'Renamed Parent' && renamed.body.user.role === 'vendor' && renamed.body.user.phone === '5551112222',
    renamed.body,
  );

  /* --- creating an account --------------------------------------------- */

  const madeEmail = `made-${stamp}@example.test`;
  const made = await asAdmin('/api/admin/users', json({ email: madeEmail, name: 'Made By Admin', phone: '', role: 'admin', password: 'a-made-up-secret' }));
  check(
    'an admin can create an account',
    made.status === 201 && made.body.user.email === madeEmail && made.body.user.role === 'admin',
    made.body,
  );
  created.userIds.push(made.body.user.id);
  check('a created account never leaks a password hash', made.body.user.password_hash === undefined, Object.keys(made.body.user));
  check('a created account comes back active', made.body.user.status === 'active', made.body.user);

  const madeLogin = await request(port, '/api/auth/login', json({ email: madeEmail, password: 'a-made-up-secret' }));
  check('the created account signs in with the password it was given', madeLogin.status === 200 && madeLogin.body.user.role === 'admin', madeLogin.body);

  const duplicateEmail = await asAdmin('/api/admin/users', json({ email: madeEmail, name: 'Copy Cat', phone: '', role: 'parent', password: 'another-secret-1' }));
  check('a duplicate email is refused', duplicateEmail.status === 422 && duplicateEmail.body.fields.email, duplicateEmail.body);

  const badCreate = await asAdmin('/api/admin/users', json({ email: 'not-an-email', name: 'x', phone: 'hello', role: 'wizard', password: 'short' }));
  check('a bad new account is refused', badCreate.status === 422, badCreate.body);
  check(
    'every bad new-account field is reported',
    ['email', 'name', 'phone', 'role', 'password'].every((key) => badCreate.body.fields[key]),
    badCreate.body.fields,
  );

  const parentAttempt = json({ email: `nope-${stamp}@example.test`, name: 'Not Allowed', phone: '', role: 'parent', password: 'a-made-up-secret' });
  parentAttempt.headers = { ...parentAttempt.headers, cookie: parentCookie };
  const parentCreate = await request(port, '/api/admin/users', parentAttempt);
  check('a non-admin cannot create an account', parentCreate.status === 403, parentCreate.body);

  const shortPassword = await asAdmin(`/api/admin/users/${parent.id}/password`, json({ password: 'short' }));
  check('a short password is refused', shortPassword.status === 422 && shortPassword.body.fields.password, shortPassword.body);
  const newPassword = await asAdmin(`/api/admin/users/${parent.id}/password`, json({ password: 'a-much-longer-secret' }));
  check('password reset succeeds', newPassword.status === 200 && newPassword.body.ok === true, newPassword.body);
  const staleSession = await request(port, '/api/auth/me', { headers: { cookie: parentCookie } });
  check('a password reset ends the old session', staleSession.status === 200 && staleSession.body.user === null, staleSession.body);
  const relogin = await request(port, '/api/auth/login', json({ email: parent.email, password: 'a-much-longer-secret' }));
  check('the new password works', relogin.status === 200, relogin.body);
  const parentCookie2 = relogin.headers['set-cookie'][0].split(';')[0];

  const suspended = await asAdmin(`/api/admin/users/${parent.id}`, patch({ name: 'Renamed Parent', phone: '5551112222', role: 'vendor', status: 'suspended' }));
  check('an account can be suspended', suspended.status === 200 && suspended.body.user.status === 'suspended', suspended.body);
  const blocked = await request(port, '/api/auth/me', { headers: { cookie: parentCookie2 } });
  check('a suspended account cannot use its session', blocked.status === 200 && blocked.body.user === null, blocked.body);
  const blockedLogin = await request(port, '/api/auth/login', json({ email: parent.email, password: 'a-much-longer-secret' }));
  check('a suspended account cannot sign in', blockedLogin.status === 401, blockedLogin.body);

  /* --- categories ------------------------------------------------------ */

  const categories = await asAdmin('/api/admin/categories');
  const firstCategory = categories.body.items[0];
  check('categories respond with counts', categories.status === 200 && typeof firstCategory.listing_count === 'number', firstCategory);
  check('categories carry their labels', Array.isArray(firstCategory.subcategories), firstCategory.subcategories);

  const badCategory = await asAdmin(`/api/admin/categories/${firstCategory.id}`, patch({ name: 'x', tagline: 'y'.repeat(400) }));
  check('a bad category edit is refused', badCategory.status === 422, badCategory.body);

  const categoryEdit = await asAdmin(`/api/admin/categories/${firstCategory.id}`, patch({ name: `${firstCategory.name} `, tagline: 'Verified tagline', isActive: true }));
  check('category edit succeeds', categoryEdit.status === 200 && categoryEdit.body.category.tagline === 'Verified tagline', categoryEdit.body);
  const revertCategory = await asAdmin(`/api/admin/categories/${firstCategory.id}`, patch({ name: firstCategory.name, tagline: firstCategory.tagline ?? '', isActive: firstCategory.is_active === 1 }));
  check('category edit reverts', revertCategory.status === 200, revertCategory.body);

  if (firstCategory.subcategories.length > 0) {
    const label = firstCategory.subcategories[0];
    const labelEdit = await asAdmin(`/api/admin/subcategories/${label.id}`, patch({ name: `${label.name}!` }));
    check('label rename succeeds', labelEdit.status === 200 && labelEdit.body.subcategory.name === `${label.name}!`, labelEdit.body);
    const labelRevert = await asAdmin(`/api/admin/subcategories/${label.id}`, patch({ name: label.name }));
    check('label rename reverts', labelRevert.status === 200, labelRevert.body);
    const badLabel = await asAdmin(`/api/admin/subcategories/${label.id}`, patch({ name: '' }));
    check('an empty label is refused', badLabel.status === 422, badLabel.body);
  }

  const missingCategory = await asAdmin('/api/admin/categories/99999999', patch({ name: 'Ghost', tagline: '', isActive: true }));
  check('a missing category is a 404', missingCategory.status === 404, missingCategory.body);

  /* --- quote requests -------------------------------------------------- */

  const quote = queries.createQuoteRequest({
    name: 'Verify Parent',
    email: parent.email,
    phone: '5551112222',
    city: 'Dallas',
    eventDate: '2026-12-24',
    guestCount: '12',
    childAge: '5',
    eventType: 'Birthday (Child)',
    categorySlug: null,
    budget: '500-1000',
    details: 'Created by scripts/verify-admin-panel.cjs',
    vendorId: listing.id,
    userId: parent.id,
    source: 'verify',
  });
  created.quoteIds.push(quote.id);

  const quotes = await asAdmin(`/api/admin/quotes?q=${encodeURIComponent(parent.email)}`);
  check('quote search responds with paging', quotes.status === 200 && typeof quotes.body.total === 'number', quotes.body);
  check('quote rows carry the vendor name', quotes.body.items.some((row) => row.id === quote.id && row.vendor_name), quotes.body.items);
  check(
    'quote totals do not double count a search miss',
    (await asAdmin('/api/admin/quotes?q=zzz-no-such-quote')).body.total === 0,
    quotes.body.total,
  );

  const deletedQuote = await asAdmin(`/api/admin/quotes/${quote.id}`, { method: 'DELETE' });
  check('quote delete succeeds', deletedQuote.status === 200 && deletedQuote.body.deleted === true, deletedQuote.body);
  created.quoteIds = [];
  check('deleted quote is gone', queries.listRecentQuoteRequests(200).every((row) => row.id !== quote.id), 'still listed');

  /* --- delete ---------------------------------------------------------- */

  const deletedListing = await asAdmin(`/api/admin/listings/${listing.id}`, { method: 'DELETE' });
  check('listing delete succeeds', deletedListing.status === 200 && deletedListing.body.deleted === true, deletedListing.body);
  created.listingIds = [];
  check('deleted listing is not found', (await asAdmin(`/api/admin/listings/${listing.id}`)).status === 404, 'still present');
  check('deleted listing is not public', !queries.getListingBySlug(listing.slug), listing.slug);

  const deletedUser = await asAdmin(`/api/admin/users/${parent.id}`, { method: 'DELETE' });
  check('account delete succeeds', deletedUser.status === 200 && deletedUser.body.deleted === true, deletedUser.body);
  created.userIds = created.userIds.filter((id) => id !== parent.id);
  check('deleted account cannot sign in', (await request(port, '/api/auth/login', json({ email: parent.email, password: 'a-much-longer-secret' }))).status === 401, 'still signs in');
  check('deleting an account leaves no listing attributed to it', db.prepare('SELECT COUNT(*) AS total FROM listings WHERE submitted_by = ?').get(parent.id).total === 0, 'leftover attribution');

  /* --- cleanup --------------------------------------------------------- */

  cleanup();
  const leftovers =
    db.prepare("SELECT COUNT(*) AS total FROM users WHERE email LIKE '%-' || ? || '@example.test'").get(stamp).total +
    db.prepare('SELECT COUNT(*) AS total FROM listings WHERE name LIKE ?').get(`%${stamp}%`).total;
  check('the run cleaned up after itself', leftovers === 0, leftovers);

  console.log(JSON.stringify({ ok: true, checks: checks.length, checksRun: checks }, null, 2));
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
}).finally(cleanup);

/**
 * The payload that changes nothing but the fields a test overrides: it reads the
 * current row back, so a one-field test cannot silently reset the others.
 */
function listingInput(row, cityText = row.city_name ?? '') {
  return {
    name: row.name,
    categorySlug: row.category_slug,
    cityText,
    website: row.website ?? '',
    phone: row.phone ?? '',
    email: row.email ?? '',
    priceFrom: row.price_from === null ? '' : String(row.price_from),
    description: row.description ?? '',
    policies: row.policies ?? '',
    status: row.status,
    isFeatured: row.is_featured === 1,
    pinRank: row.pin_rank,
    reviewNote: row.review_note ?? '',
  };
}