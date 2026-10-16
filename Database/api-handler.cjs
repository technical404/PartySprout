'use strict';

const { init } = require('./index.js');
const queries = require('./queries.js');
const auth = require('./auth.js');

init();
auth.pruneSessions();

/* ------------------------------------------------------------------------- */
/* Small helpers                                                              */
/* ------------------------------------------------------------------------- */

function send(res, status, body, extraHeaders = {}) {
  const json = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  for (const [name, value] of Object.entries(extraHeaders)) {
    const list = Array.isArray(value) ? value : [value];
    for (const one of list) res.setHeader(name, one);
  }
  res.end(json);
}

function parseUrl(req) {
  const host = req.headers.host || 'localhost';
  return new URL(req.url, `http://${host}`);
}

/** Reads a JSON request body, refusing anything unreasonably large. */
function readJsonBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) return resolve({});
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        resolve(parsed && typeof parsed === 'object' ? parsed : {});
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

const MAX_FIELD = 2000;
/** What quote_requests.event_type can hold: VARCHAR(120) in MySQL. */
const EVENT_TYPE_MAX = 120;
const text = (value) => String(value ?? '').trim();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function currentUser(req) {
  return auth.userForToken(auth.parseCookies(req)[auth.SESSION_COOKIE]);
}

/** Absolute http(s) links only — these end up in href/src attributes. */
function safeUrl(value) {
  const raw = text(value);
  if (!raw) return null;
  try {
    const url = new URL(raw.includes('://') ? raw : `https://${raw}`);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function toPrice(value) {
  if (value === '' || value == null) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 100000) return undefined;
  return Math.round(number);
}

function clientKey(req) {
  const forwarded = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim();
  return forwarded || req.socket?.remoteAddress || 'unknown';
}

/**
 * Coarse in-memory throttle for the endpoints worth guessing at (login) and the
 * ones worth spamming (quote requests). Not a substitute for a real rate limiter
 * in front of the app, but it stops the obvious abuse of a single process.
 */
const buckets = new Map();
function throttle(req, name, max, windowMs) {
  const key = `${name}:${clientKey(req)}`;
  const now = Date.now();
  const entry = buckets.get(key);
  if (!entry || entry.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  entry.count += 1;
  if (entry.count > max) return false;
  // Opportunistic cleanup so the map cannot grow without bound.
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) if (v.resetAt < now) buckets.delete(k);
  }
  return true;
}

/* ------------------------------------------------------------------------- */
/* Validation                                                                 */
/* ------------------------------------------------------------------------- */

/**
 * The same phone rule the client uses (src/lib/validation.ts). It was missing
 * here, so a POST could store "hello" as a phone number whatever the UI did.
 * Empty stays valid: every phone field in this app is optional.
 */
const PHONE_ALLOWED = /^[0-9+()\-.\s]+$/;
const PHONE_MESSAGE = 'Enter a valid phone number — digits, spaces and + - ( ) only.';

function phoneError(value) {
  const trimmed = text(value);
  if (!trimmed) return null;
  if (!PHONE_ALLOWED.test(trimmed)) return PHONE_MESSAGE;
  const plus = (trimmed.match(/\+/g) || []).length;
  if (plus > 1 || (plus === 1 && !trimmed.startsWith('+'))) return PHONE_MESSAGE;
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return 'That does not look like a phone number — check the digits.';
  return null;
}

/** Keeps a leading "+" and the digits, so the same number stores one way. */
function normalisePhone(value) {
  const trimmed = text(value);
  if (!trimmed) return '';
  const digits = trimmed.replace(/\D/g, '');
  return trimmed.startsWith('+') ? '+' + digits : digits;
}

function validateCredentials(body, { requirePassword = true } = {}) {
  const errors = {};
  const email = auth.normalizeEmail(body.email);
  const name = text(body.name);
  const password = String(body.password ?? '');

  if (!email) errors.email = 'Please enter your email.';
  else if (!EMAIL_RE.test(email)) errors.email = 'Enter a valid email address.';
  else if (email.length > MAX_FIELD) errors.email = 'Email is too long.';

  if (requirePassword || password) {
    if (password.length < 8) errors.password = 'Use at least 8 characters.';
    else if (password.length > 200) errors.password = 'Password is too long.';
  }

  const phoneProblem = phoneError(body.phone);
  if (phoneProblem) errors.phone = phoneProblem;

  return { errors, value: { email, name, password, phone: normalisePhone(body.phone) } };
}

/** Never trust the client: the same rules are re-checked here. */
function validateQuoteRequest(body) {
  const errors = {};

  const name = text(body.name);
  const email = text(body.email);

  if (name.length < 2) errors.name = "Please enter your name.";
  if (name.length > MAX_FIELD) errors.name = "Name is too long.";
  if (!email) errors.email = "Please enter your email.";
  else if (!EMAIL_RE.test(email)) errors.email = "Enter a valid email address.";
  else if (email.length > MAX_FIELD) errors.email = "Email is too long.";

  for (const field of [
    "city",
    "eventDate",
    "guestCount",
    "childAge",
    "eventType",
    "categorySlug",
    "budget",
  ]) {
    if (text(body[field]).length > MAX_FIELD) errors[field] = "Value is too long.";
  }
  // Every question in the wizard is answered before a request is accepted. A
  // request an entertainer cannot act on costs everyone a round trip, so the
  // missing answer is caught here as well as in the browser.
  for (const [field, message] of Object.entries({
    city: "Which city is the party in?",
    eventDate: "Please pick the date of the party.",
    guestCount: "How many children are you expecting?",
    childAge: "How old are the children?",
    eventType: "Pick the type of event you are planning.",
    categorySlug: "Pick the entertainment you are after.",
    budget: "Please pick an approximate budget.",
  })) {
    if (!text(body[field])) errors[field] = message;
  }
  const phone = text(body.phone);
  if (!phone) errors.phone = "Please enter your phone number.";
  else {
    const phoneProblem = phoneError(body.phone);
    if (phoneProblem) errors.phone = phoneProblem;
  }
  // A children count is free text, but a number is the only useful answer here.
  const guests = text(body.guestCount);
  if (guests && !/^\d{1,4}$/.test(guests)) errors.guestCount = "Use a whole number of children.";
  // event_type is narrower than the other free-text fields, so it gets its own
  // column's limit: SQLite would happily store what MySQL has to refuse.
  if (text(body.eventType).length > EVENT_TYPE_MAX) errors.eventType = "Value is too long.";
  const details = text(body.details);
  if (details.length < 10) errors.details = "Tell us a bit more — at least 10 characters.";
  else if (details.length > 10000) errors.details = "Message is too long.";

  return { errors, value: { ...body, name, email, phone: normalisePhone(body.phone) } };
}

/** A business submission: every field is required except the starting price. */
function validateSubmission(body) {
  const errors = {};
  const name = text(body.name);
  if (name.length < 2) errors.name = "Please enter the business name.";
  if (name.length > 200) errors.name = "Business name is too long.";

  const category = queries.getCategoryBySlug(text(body.categorySlug));
  if (!category) errors.categorySlug = "Pick the category that fits best.";

  const city = body.cityId ? queries.getCityById(Number(body.cityId)) : null;
  const cityText = text(body.cityText);
  if (body.cityId && !city) errors.city = "Pick a city from the list.";
  else if (!city && cityText.length < 2) errors.city = "Which city do you serve?";

  const website = safeUrl(body.website);
  if (!text(body.website)) errors.website = "Enter your website address.";
  else if (!website) errors.website = "Enter a full web address, like https://example.com.";

  const email = text(body.email);
  if (!email) errors.email = "Please enter a booking email.";
  else if (!EMAIL_RE.test(email)) errors.email = "Enter a valid email address.";

  const priceFrom = toPrice(body.priceFrom);
  if (priceFrom === undefined) errors.priceFrom = "Enter a price in dollars, or leave it blank.";

  const phone = text(body.phone);
  if (!phone) errors.phone = "Please enter a phone number.";
  else {
    const phoneProblem = phoneError(body.phone);
    if (phoneProblem) errors.phone = phoneProblem;
  }

  const description = text(body.description);
  if (!description) errors.description = "Tell us what you offer.";
  else if (description.length > 5000)
    errors.description = "Description is too long. Try a shorter summary.";

  return {
    errors,
    value: {
      name,
      categoryId: category?.id,
      cityId: city?.id ?? null,
      cityText: city ? null : cityText,
      stateId: city?.state_id ?? null,
      countryId: city?.country_id ?? queries.getCountryByCode('US')?.id,
      website,
      email: email || null,
      phone: normalisePhone(body.phone),
      priceFrom: priceFrom ?? null,
      description,
    },
  };
}

/* ------------------------------------------------------------------------- */
/* Route handlers                                                             */
/* ------------------------------------------------------------------------- */

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone ?? null,
    role: user.role,
    listingId: user.listing_id ?? null,
  };
}

async function handleAuth(req, res, pathname, url) {
  if (req.method === 'GET' && pathname === '/api/auth/me') {
    const user = currentUser(req);
    return send(res, 200, { user: user ? publicUser(user) : null });
  }

  if (req.method === 'POST' && pathname === '/api/auth/logout') {
    auth.destroySession(auth.parseCookies(req)[auth.SESSION_COOKIE]);
    return send(res, 200, { ok: true }, { 'Set-Cookie': auth.clearCookie(req) });
  }

  if (req.method === 'POST' && pathname === '/api/auth/signup') {
    if (!throttle(req, 'signup', 10, 15 * 60 * 1000)) {
      return send(res, 429, { error: 'Too many attempts. Please try again in a few minutes.' });
    }
    let body;
    try {
      body = await readJsonBody(req);
    } catch (error) {
      return send(res, 400, { error: error.message });
    }

    const { errors, value } = validateCredentials(body);
    if (value.name.length < 2) errors.name = 'Please enter your name.';
    else if (value.name.length > MAX_FIELD) errors.name = 'Name is too long.';
    // Admins are promoted deliberately (Database/create-admin.cjs), never by signing up.
    const role = text(body.role) === 'vendor' ? 'vendor' : 'parent';

    if (queries.getUserByEmail(value.email)) {
      errors.email = 'An account with this email already exists. Try logging in instead.';
    }
    if (Object.keys(errors).length > 0) return send(res, 422, { error: 'Validation failed', fields: errors });

    const user = queries.createUser({
      email: value.email,
      name: value.name,
      phone: value.phone,
      passwordHash: auth.hashPassword(value.password),
      role,
    });
    const session = auth.createSession(user.id);
    return send(
      res,
      201,
      { user: publicUser(user) },
      { 'Set-Cookie': auth.sessionCookie(session.token, req) }
    );
  }

  if (req.method === 'POST' && pathname === '/api/auth/login') {
    // A mistyped password costs half a minute, not a quarter of an hour. The attempt
    // budget is unchanged; only the window it is counted over is short.
    if (!throttle(req, 'login', 10, 30 * 1000)) {
      return send(res, 429, { error: 'Too many attempts. Please try again in 30 seconds.' });
    }
    let body;
    try {
      body = await readJsonBody(req);
    } catch (error) {
      return send(res, 400, { error: error.message });
    }

    const email = auth.normalizeEmail(body.email);
    const password = String(body.password ?? '');
    const errors = {};
    if (!email) errors.email = 'Please enter your email.';
    if (!password) errors.password = 'Please enter your password.';
    if (Object.keys(errors).length > 0) return send(res, 422, { error: 'Validation failed', fields: errors });

    const user = queries.getUserByEmail(email);
    // One message for both cases: never reveal which emails have accounts.
    const ok = user && user.status === 'active' && auth.verifyPassword(password, user.password_hash);
    if (!ok) {
      return send(res, 401, { error: 'That email and password combination did not work.' });
    }

    // Upgrade a hash written by an older scheme while the password is in hand.
    if (auth.needsRehash(user.password_hash)) {
      queries.setUserPassword(user.id, auth.hashPassword(password));
    }

    const session = auth.createSession(user.id);
    return send(
      res,
      200,
      { user: publicUser(user) },
      { 'Set-Cookie': auth.sessionCookie(session.token, req) }
    );
  }

  if (req.method === 'PATCH' && pathname === '/api/auth/me') {
    const user = currentUser(req);
    if (!user) return send(res, 401, { error: 'Please log in first.' });

    let body;
    try {
      body = await readJsonBody(req);
    } catch (error) {
      return send(res, 400, { error: error.message });
    }

    const errors = {};
    const name = text(body.name);
    if (name.length < 2) errors.name = 'Please enter your name.';
    if (name.length > MAX_FIELD) errors.name = 'Name is too long.';
    const phoneProblem = phoneError(body.phone);
    if (phoneProblem) errors.phone = phoneProblem;
    if (Object.keys(errors).length > 0) return send(res, 422, { error: 'Validation failed', fields: errors });

    const updated = queries.updateUserProfile(user.id, { name, phone: normalisePhone(body.phone) });
    return send(res, 200, { user: publicUser(updated) });
  }

  if (req.method === 'POST' && pathname === '/api/auth/password') {
    if (!throttle(req, 'password', 10, 15 * 60 * 1000)) {
      return send(res, 429, { error: 'Too many attempts. Please try again in a few minutes.' });
    }
    const user = currentUser(req);
    if (!user) return send(res, 401, { error: 'Please log in first.' });

    let body;
    try {
      body = await readJsonBody(req);
    } catch (error) {
      return send(res, 400, { error: error.message });
    }

    const current = String(body.currentPassword ?? '');
    const password = String(body.password ?? '');
    const errors = {};
    if (!current) errors.currentPassword = 'Please enter your current password.';
    if (password.length < 8) errors.password = 'Use at least 8 characters.';
    else if (password.length > 200) errors.password = 'Password is too long.';
    if (Object.keys(errors).length > 0) {
      return send(res, 422, { error: 'Validation failed', fields: errors });
    }

    // The session proves who they are; the current password proves it is still
    // them. A miss is a field error rather than a 401, so the form can point at
    // the input that was wrong instead of throwing them back to a login page.
    const stored = queries.getUserByEmail(user.email);
    if (!stored || !auth.verifyPassword(current, stored.password_hash)) {
      return send(res, 422, {
        error: 'Validation failed',
        fields: { currentPassword: 'That is not your current password.' },
      });
    }

    queries.setUserPassword(user.id, auth.hashPassword(password));
    // This browser stays signed in; every other session ends.
    queries.destroyOtherSessionsForUser(user.id, auth.parseCookies(req)[auth.SESSION_COOKIE]);
    return send(res, 200, { ok: true });
  }

  return false;
}

async function handleFavorites(req, res, pathname) {
  const user = currentUser(req);
  if (!user) return send(res, 401, { error: 'Please log in to save businesses.' });

  if (req.method === 'GET' && pathname === '/api/favorites') {
    return send(res, 200, { ids: queries.favoriteIds(user.id) });
  }

  if (req.method === 'POST' && pathname === '/api/favorites') {
    let body;
    try {
      body = await readJsonBody(req);
    } catch (error) {
      return send(res, 400, { error: error.message });
    }
    const listing = queries.getListingById(Number(body.listingId));
    if (!listing) return send(res, 404, { error: 'That business no longer exists.' });
    return send(res, 200, { ids: queries.addFavorite(user.id, listing.id) });
  }

  const one = pathname.match(/^\/api\/favorites\/(\d+)$/);
  if (req.method === 'DELETE' && one) {
    return send(res, 200, { ids: queries.removeFavorite(user.id, Number(one[1])) });
  }

  // Guest favourites are sent up once, after login, so nothing is lost.
  if (req.method === 'POST' && pathname === '/api/favorites/merge') {
    let body;
    try {
      body = await readJsonBody(req);
    } catch (error) {
      return send(res, 400, { error: error.message });
    }
    const ids = Array.isArray(body.ids) ? body.ids : [];
    for (const id of ids) {
      const listing = queries.getListingById(Number(id));
      if (listing) queries.addFavorite(user.id, listing.id);
    }
    return send(res, 200, { ids: queries.favoriteIds(user.id) });
  }

  return false;
}

async function handleVendor(req, res, pathname) {
  const user = currentUser(req);
  if (!user) return send(res, 401, { error: 'Please log in first.' });

  if (req.method === 'POST' && pathname === '/api/listings') {
    let body;
    try {
      body = await readJsonBody(req);
    } catch (error) {
      return send(res, 400, { error: error.message });
    }

    const { errors, value } = validateSubmission(body);
    if (!value.countryId) errors.country = 'The directory is not accepting submissions right now.';
    if (Object.keys(errors).length > 0) return send(res, 422, { error: 'Validation failed', fields: errors });

    // Do not create a second row for a business that is already in the directory,
    // whatever state that row is in.
    const clash = queries.findListingByName(value.name);
    if (clash) {
      return send(res, 409, {
        error: `${clash.name} is already in the directory. Email us to claim or correct that listing instead.`,
        fields: { name: 'This business is already listed.' },
      });
    }

    const listing = queries.createSubmission({ ...value, submittedBy: user.id });
    queries.setUserListing(user.id, listing.id);
    return send(res, 201, { listing: { id: listing.id, name: listing.name, status: listing.status } });
  }

  if (req.method === 'GET' && pathname === '/api/vendor/listings') {
    return send(res, 200, { items: queries.listListingsByOwner(user.id) });
  }

  if (req.method === 'GET' && pathname === '/api/vendor/leads') {
    if (!user.listing_id) return send(res, 200, { items: [] });
    return send(res, 200, { items: queries.listQuoteRequestsForListing(user.listing_id) });
  }

  const own = pathname.match(/^\/api\/vendor\/listings\/(\d+)$/);
  if (req.method === 'PATCH' && own) {
    const listing = queries.getListingById(Number(own[1]));
    if (!listing || listing.submitted_by !== user.id) {
      return send(res, 404, { error: 'That business is not yours to edit.' });
    }

    let body;
    try {
      body = await readJsonBody(req);
    } catch (error) {
      return send(res, 400, { error: error.message });
    }

    const errors = {};
    const name = text(body.name);
    if (name.length < 2) errors.name = "Please enter the business name.";
    const website = safeUrl(body.website);
    if (!text(body.website)) errors.website = "Enter your website address.";
    else if (!website) errors.website = "Enter a full web address, like https://example.com.";
    const email = text(body.email);
    if (!email) errors.email = "Please enter a booking email.";
    else if (!EMAIL_RE.test(email)) errors.email = "Enter a valid email address.";
    const priceFrom = toPrice(body.priceFrom);
    if (priceFrom === undefined) errors.priceFrom = "Enter a price in dollars, or leave it blank.";
    const phone = text(body.phone);
    if (!phone) errors.phone = "Please enter a phone number.";
    else {
      const phoneProblem = phoneError(body.phone);
      if (phoneProblem) errors.phone = phoneProblem;
    }
    const description = text(body.description);
    if (!description) errors.description = "Tell us what you offer.";
    else if (description.length > 5000)
      errors.description = "Description is too long. Try a shorter summary.";
    if (Object.keys(errors).length > 0)
      return send(res, 422, { error: "Validation failed", fields: errors });

    // A new city is only applied when one was actually sent; otherwise the
    // listing keeps the city it already had (id or free text).
    const city = body.cityId ? queries.getCityById(Number(body.cityId)) : null;
    const cityText = text(body.cityText);

    const updated = queries.updateListing(listing.id, {
      name,
      description,
      website,
      phone: normalisePhone(body.phone),
      email: email || null,
      priceFrom: priceFrom ?? null,
      cityId: city ? city.id : listing.city_id,
      cityText: city ? null : cityText || listing.city_text,
    });
    // Editing a rejected listing puts it back in the queue.
    const status = listing.status === 'rejected' ? queries.setListingStatus(listing.id, 'pending').status : updated.status;
    return send(res, 200, { listing: { id: updated.id, name: updated.name, status } });
  }

  return false;
}

async function handleAdmin(req, res, pathname, url) {
  const user = currentUser(req);
  if (!user) return send(res, 401, { error: "Please log in first." });
  if (user.role !== "admin") return send(res, 403, { error: "Admins only." });

  if (req.method === "GET" && pathname === "/api/admin/stats") {
    return send(res, 200, {
      stats: queries.directoryStats(),
      byStatus: queries.countListingsByStatus(),
    });
  }

  if (req.method === "GET" && pathname === "/api/admin/submissions") {
    const status = text(url.searchParams.get("status")) || "pending";
    return send(res, 200, { items: queries.listSubmissions(status) });
  }

  const page = url.searchParams.get("page");
  const pageSize = url.searchParams.get("pageSize");

  /* --- listings ------------------------------------------------------- */

  if (req.method === "GET" && pathname === "/api/admin/listings") {
    return send(
      res,
      200,
      queries.adminListListings(
        {
          q: text(url.searchParams.get("q")),
          status: text(url.searchParams.get("status")),
          category: text(url.searchParams.get("category")),
          featured: text(url.searchParams.get("featured")),
          sort: text(url.searchParams.get("sort")),
        },
        { page, pageSize },
      ),
    );
  }

  const listingIdMatch = pathname.match(/^\/api\/admin\/listings\/(\d+)$/);
  if (req.method === "GET" && listingIdMatch) {
    const listing = queries.getListingById(Number(listingIdMatch[1]));
    if (!listing) return send(res, 404, { error: "Not found" });
    return send(res, 200, { listing });
  }

  if (req.method === "PATCH" && listingIdMatch) {
    const listing = queries.getListingById(Number(listingIdMatch[1]));
    if (!listing) return send(res, 404, { error: "Not found" });

    let body;
    try {
      body = await readJsonBody(req);
    } catch (error) {
      return send(res, 400, { error: error.message });
    }

    const errors = {};
    const name = text(body.name);
    if (name.length < 2) errors.name = "Please enter the business name.";
    else if (name.length > 200) errors.name = "Business name is too long.";

    const category = queries.getCategoryBySlug(text(body.categorySlug));
    if (!category) errors.categorySlug = "Pick the category that fits best.";

    const status = text(body.status);
    if (!queries.LISTING_STATUSES.includes(status))
      errors.status = "Status must be active, rejected or pending.";

    // Unlike a vendor's own edit, an admin may clear a field: a blank website is
    // stored as no website, but a broken one is still refused.
    const website = text(body.website) ? safeUrl(body.website) : null;
    if (text(body.website) && !website)
      errors.website = "Enter a full web address, like https://example.com.";

    const email = text(body.email);
    if (email && !EMAIL_RE.test(email)) errors.email = "Enter a valid email address.";
    else if (email.length > MAX_FIELD) errors.email = "Email is too long.";

    const phoneProblem = phoneError(body.phone);
    if (phoneProblem) errors.phone = phoneProblem;

    const priceFrom = toPrice(body.priceFrom);
    if (priceFrom === undefined) errors.priceFrom = "Enter a price in dollars, or leave it blank.";

    const description = text(body.description);
    if (description.length > 5000)
      errors.description = "Description is too long. Try a shorter summary.";
    const policies = text(body.policies);
    if (policies.length > 5000) errors.policies = "Policies are too long.";
    if (text(body.reviewNote).length > 1000) errors.reviewNote = "Reviewer note is too long.";

    // Only a JSON number or a run of digits counts: true, 2.5 and "abc" are all
    // refused rather than quietly becoming 1 or 2.
    const rawPinRank = body.pinRank;
    let pinRank = 0;
    if (rawPinRank == null || rawPinRank === "") pinRank = 0;
    else if (typeof rawPinRank === "number" && Number.isInteger(rawPinRank)) pinRank = rawPinRank;
    else if (typeof rawPinRank === "string" && /^\d+$/.test(rawPinRank.trim()))
      pinRank = Number(rawPinRank.trim());
    else pinRank = -1;
    if (pinRank < 0 || pinRank > 1000)
      errors.pinRank = "Pin rank must be a whole number between 0 and 1000.";

    if (Object.keys(errors).length > 0)
      return send(res, 422, { error: "Validation failed", fields: errors });

    // A typed city that matches a reference row is stored as that row, so a state
    // search still finds the business; anything else stays free text.
    const typedCity = text(body.cityText);
    const matchedCity = typedCity ? queries.findCityByName(typedCity) : null;

    const updated = queries.adminUpdateListing(listing.id, {
      name,
      categoryId: category.id,
      cityId: matchedCity ? matchedCity.id : null,
      stateId: matchedCity ? matchedCity.state_id : null,
      cityText: matchedCity ? null : typedCity,
      website,
      phone: normalisePhone(body.phone),
      email: email || null,
      priceFrom: priceFrom ?? null,
      description,
      policies,
      isFeatured: body.isFeatured === true || body.isFeatured === 1 || body.isFeatured === "1",
      pinRank,
      status,
      reviewNote: text(body.reviewNote),
    });
    return send(res, 200, { listing: updated });
  }

  if (req.method === "DELETE" && listingIdMatch) {
    const deleted = queries.adminDeleteListing(Number(listingIdMatch[1]));
    if (!deleted) return send(res, 404, { error: "Not found" });
    return send(res, 200, { deleted: true });
  }

  const review = pathname.match(/^\/api\/admin\/listings\/(\d+)\/status$/);
  if (req.method === "POST" && review) {
    const listing = queries.getListingById(Number(review[1]));
    if (!listing) return send(res, 404, { error: "Not found" });

    let body;
    try {
      body = await readJsonBody(req);
    } catch (error) {
      return send(res, 400, { error: error.message });
    }

    const status = text(body.status);
    if (!queries.LISTING_STATUSES.includes(status)) {
      return send(res, 422, { error: "Status must be active, rejected or pending." });
    }

    const updated = queries.setListingStatus(listing.id, status, text(body.note));
    return send(res, 200, {
      listing: { id: updated.id, name: updated.name, status: updated.status },
    });
  }

  /* --- accounts ------------------------------------------------------- */

  if (req.method === "GET" && pathname === "/api/admin/users") {
    return send(
      res,
      200,
      queries.adminListUsers(
        {
          q: text(url.searchParams.get("q")),
          role: text(url.searchParams.get("role")),
          status: text(url.searchParams.get("status")),
        },
        { page, pageSize },
      ),
    );
  }

  if (req.method === "POST" && pathname === "/api/admin/users") {
    let body;
    try {
      body = await readJsonBody(req);
    } catch (error) {
      return send(res, 400, { error: error.message });
    }

    const email = auth.normalizeEmail(body.email);
    const name = text(body.name);
    const password = String(body.password ?? "");
    // Admins can hand out any role, unlike signup, which only ever creates parents.
    const role = text(body.role) || "parent";

    const errors = {};
    if (!email) errors.email = "Please enter their email.";
    else if (!EMAIL_RE.test(email)) errors.email = "Enter a valid email address.";
    else if (email.length > MAX_FIELD) errors.email = "Email is too long.";
    else if (queries.getUserByEmail(email)) errors.email = "An account with this email already exists.";
    if (name.length < 2) errors.name = "Please enter a name.";
    else if (name.length > 200) errors.name = "Name is too long.";
    if (!queries.USER_ROLES.includes(role)) errors.role = "Role must be parent, vendor or admin.";
    if (password.length < 8) errors.password = "Use at least 8 characters.";
    else if (password.length > 200) errors.password = "Password is too long.";
    const phoneProblem = phoneError(body.phone);
    if (phoneProblem) errors.phone = phoneProblem;
    if (Object.keys(errors).length > 0) {
      return send(res, 422, { error: "Validation failed", fields: errors });
    }

    const created = queries.createUser({
      email,
      name,
      phone: normalisePhone(body.phone),
      passwordHash: auth.hashPassword(password),
      role,
    });
    return send(res, 201, { user: created });
  }

  const userPassword = pathname.match(/^\/api\/admin\/users\/(\d+)\/password$/);
  if (req.method === "POST" && userPassword) {
    const target = queries.getUserById(Number(userPassword[1]));
    if (!target) return send(res, 404, { error: "Not found" });

    let body;
    try {
      body = await readJsonBody(req);
    } catch (error) {
      return send(res, 400, { error: error.message });
    }

    const password = String(body.password ?? "");
    if (password.length < 8)
      return send(res, 422, {
        error: "Validation failed",
        fields: { password: "Use at least 8 characters." },
      });
    if (password.length > 200)
      return send(res, 422, {
        error: "Validation failed",
        fields: { password: "Password is too long." },
      });

    queries.setUserPassword(target.id, auth.hashPassword(password));
    queries.destroySessionsForUser(target.id);
    return send(res, 200, { ok: true });
  }

  const userIdMatch = pathname.match(/^\/api\/admin\/users\/(\d+)$/);
  if (req.method === "PATCH" && userIdMatch) {
    const target = queries.getUserById(Number(userIdMatch[1]));
    if (!target) return send(res, 404, { error: "Not found" });

    let body;
    try {
      body = await readJsonBody(req);
    } catch (error) {
      return send(res, 400, { error: error.message });
    }

    const errors = {};
    const name = text(body.name);
    if (name.length < 2) errors.name = "Please enter a name.";
    else if (name.length > 200) errors.name = "Name is too long.";
    const role = text(body.role);
    if (!queries.USER_ROLES.includes(role)) errors.role = "Role must be parent, vendor or admin.";
    const status = text(body.status);
    if (!queries.USER_STATUSES.includes(status))
      errors.status = "Status must be active or suspended.";
    const phoneProblem = phoneError(body.phone);
    if (phoneProblem) errors.phone = phoneProblem;
    if (Object.keys(errors).length > 0)
      return send(res, 422, { error: "Validation failed", fields: errors });

    // An admin must not be able to lock themselves out of the panel.
    if (target.id === user.id && (role !== "admin" || status !== "active")) {
      return send(res, 422, { error: "You cannot remove your own admin access." });
    }

    const updated = queries.adminUpdateUser(target.id, {
      name,
      phone: normalisePhone(body.phone),
      role,
      status,
    });
    // A suspended account keeps no live session.
    if (status !== "active") queries.destroySessionsForUser(target.id);
    return send(res, 200, { user: updated });
  }

  if (req.method === "DELETE" && userIdMatch) {
    const target = queries.getUserById(Number(userIdMatch[1]));
    if (!target) return send(res, 404, { error: "Not found" });
    if (target.id === user.id)
      return send(res, 422, { error: "You cannot delete your own account." });

    queries.adminDeleteUser(target.id);
    return send(res, 200, { deleted: true });
  }

  /* --- categories ----------------------------------------------------- */

  if (req.method === "GET" && pathname === "/api/admin/categories") {
    return send(res, 200, { items: queries.adminListCategories() });
  }

  const categoryMatch = pathname.match(/^\/api\/admin\/categories\/(\d+)$/);
  if (req.method === "PATCH" && categoryMatch) {
    let body;
    try {
      body = await readJsonBody(req);
    } catch (error) {
      return send(res, 400, { error: error.message });
    }

    const errors = {};
    const name = text(body.name);
    if (name.length < 2) errors.name = "Please enter a category name.";
    else if (name.length > 100) errors.name = "Category name is too long.";
    if (text(body.tagline).length > 300) errors.tagline = "Tagline is too long.";
    if (Object.keys(errors).length > 0)
      return send(res, 422, { error: "Validation failed", fields: errors });

    const updated = queries.adminUpdateCategory(Number(categoryMatch[1]), {
      name,
      tagline: text(body.tagline),
      isActive: body.isActive !== false,
    });
    if (!updated) return send(res, 404, { error: "Not found" });
    return send(res, 200, { category: updated });
  }

  const subcategoryMatch = pathname.match(/^\/api\/admin\/subcategories\/(\d+)$/);
  if (req.method === "PATCH" && subcategoryMatch) {
    let body;
    try {
      body = await readJsonBody(req);
    } catch (error) {
      return send(res, 400, { error: error.message });
    }

    const name = text(body.name);
    if (name.length < 2)
      return send(res, 422, {
        error: "Validation failed",
        fields: { name: "Please enter a label." },
      });
    if (name.length > 100)
      return send(res, 422, { error: "Validation failed", fields: { name: "Label is too long." } });

    const updated = queries.adminUpdateSubcategory(Number(subcategoryMatch[1]), { name });
    if (!updated) return send(res, 404, { error: "Not found" });
    return send(res, 200, { subcategory: updated });
  }

  /* --- quote requests ------------------------------------------------- */

  if (req.method === "GET" && pathname === "/api/admin/quotes") {
    return send(
      res,
      200,
      queries.adminListQuoteRequests({ q: text(url.searchParams.get("q")) }, { page, pageSize }),
    );
  }

  const quoteMatch = pathname.match(/^\/api\/admin\/quotes\/(\d+)$/);
  if (req.method === "DELETE" && quoteMatch) {
    const deleted = queries.adminDeleteQuoteRequest(Number(quoteMatch[1]));
    if (!deleted) return send(res, 404, { error: "Not found" });
    return send(res, 200, { deleted: true });
  }

  return false;
}

/* ------------------------------------------------------------------------- */
/* Entry point                                                                */
/* ------------------------------------------------------------------------- */

async function handleApi(req, res) {
  try {
    const url = parseUrl(req);
    const pathname = url.pathname.replace(/\/$/, '') || '/';

    // --- accounts -------------------------------------------------------
    if (pathname.startsWith('/api/auth/')) {
      const handled = await handleAuth(req, res, pathname, url);
      if (handled !== false) return handled;
    }

    if (pathname.startsWith('/api/favorites')) {
      const handled = await handleFavorites(req, res, pathname);
      if (handled !== false) return handled;
    }

    // Business submission lives on POST /api/listings but shares the vendor rules.
    if (pathname.startsWith('/api/vendor/') || (req.method === 'POST' && pathname === '/api/listings')) {
      const handled = await handleVendor(req, res, pathname);
      if (handled !== false) return handled;
    }

    if (pathname.startsWith('/api/admin/')) {
      const handled = await handleAdmin(req, res, pathname, url);
      if (handled !== false) return handled;
    }

    // --- quote requests -------------------------------------------------
    if (req.method === 'POST' && pathname === '/api/quote-requests') {
      if (!throttle(req, 'quote', 30, 15 * 60 * 1000)) {
        return send(res, 429, { error: 'Too many requests. Please try again later.' });
      }
      let body;
      try {
        body = await readJsonBody(req);
      } catch (error) {
        return send(res, 400, { error: error.message });
      }

      const { errors, value } = validateQuoteRequest(body);
      if (Object.keys(errors).length > 0) return send(res, 422, { error: 'Validation failed', fields: errors });

      let vendorId = null;
      if (body.vendorSlug) {
        const vendor = queries.getListingBySlug(String(body.vendorSlug));
        vendorId = vendor ? vendor.id : null;
      }

      const user = currentUser(req);
      const created = queries.createQuoteRequest({
        ...value,
        vendorId,
        userId: user ? user.id : null,
        source: 'web',
      });
      return send(res, 201, { id: created.id, received: true });
    }

    if (req.method === 'GET' && pathname === '/api/quote-requests/mine') {
      const user = currentUser(req);
      if (!user) return send(res, 401, { error: 'Please log in first.' });
      return send(res, 200, { items: queries.listQuoteRequestsForUser(user) });
    }

    // --- directory ------------------------------------------------------
    if (req.method === 'GET' && pathname === '/api/categories') {
      // The city is normalised exactly as the listing search normalises it, so a
      // "Dallas, TX" filter counts the same businesses it returns.
      const location = text(url.searchParams.get('location')).replace(/,\s*[A-Z]{2}$/i, '').trim();
      return send(res, 200, queries.listCategories({ location }));
    }

    /**
     * What the directory can honestly claim: counts, plus how many businesses
     * publish a price. The UI hides the price controls when that number is 0.
     */
    if (req.method === "GET" && pathname === "/api/directory-summary") {
      return send(res, 200, queries.directorySummary());
    }

    if (req.method === "GET" && pathname === "/api/cities") {
      const term = text(url.searchParams.get("q"));
      if (term) return send(res, 200, queries.searchCities(term, 8));
      const limit = Math.min(50, Number(url.searchParams.get("limit") || 12));
      return send(res, 200, queries.listCitiesWithCounts(limit));
    }

    // The whole list is 50-odd rows, so it is sent in one go and the Where box
    // filters it locally instead of asking again on every keystroke.
    if (req.method === "GET" && pathname === "/api/states") {
      return send(res, 200, queries.listStatesWithCounts());
    }

    if (req.method === "GET" && pathname === "/api/listings") {
      const params = url.searchParams;
      const category = text(params.get("category"));
      const slugMap = { fairies: "fairy", "non-mascot-characters": "non-mascots" };
      let categoryId;
      if (category) {
        const cat = queries.getCategoryBySlug(slugMap[category] || category);
        categoryId = cat?.id;
      }
      const city = text(params.get("city")) || text(params.get("location"));
      const filters = {
        q: text(params.get("q")) || undefined,
        categoryId,
        city: city.replace(/,\s*[A-Z]{2}$/i, "").trim() || undefined,
        priceMin: params.has("priceMin") ? Number(params.get("priceMin")) : undefined,
        priceMax: params.has("priceMax") ? Number(params.get("priceMax")) : undefined,
        ratingMin: params.has("ratingMin") ? Number(params.get("ratingMin")) : undefined,
        featuredOnly: params.get("featured") === "1",
        sort: text(params.get("sort")) || undefined,
      };
      for (const key of ["priceMin", "priceMax", "ratingMin"]) {
        if (Number.isNaN(filters[key])) filters[key] = undefined;
      }

      const page = Math.max(1, Number(params.get("page") || 1));
      const pageSize = Math.min(48, Math.max(1, Number(params.get("pageSize") || 24)));
      return send(res, 200, {
        total: queries.countListings(filters),
        page,
        pageSize,
        items: queries.listListings(filters, { page, pageSize }),
      });
    }

    // Must come before the slug route: "by-ids" would otherwise look like a slug.
    if (req.method === 'GET' && pathname === '/api/listings/by-ids') {
      const ids = text(url.searchParams.get('ids'))
        .split(',')
        .map((value) => Number(value))
        .filter(Boolean);
      return send(res, 200, { items: queries.listListingsByIds(ids) });
    }

    const listingMatch = pathname.match(/^\/api\/listings\/([^/]+)$/);
    if (req.method === 'GET' && listingMatch) {
      const item = queries.getListingBySlug(decodeURIComponent(listingMatch[1]));
      if (!item) return send(res, 404, { error: 'Not found' });
      item.categories = queries.getListingCategories(item.id);
      return send(res, 200, item);
    }

    send(res, 404, { error: 'Not found' });
  } catch (error) {
    console.error(error);
    send(res, 500, { error: 'Server error' });
  }
}

module.exports = { handleApi };
