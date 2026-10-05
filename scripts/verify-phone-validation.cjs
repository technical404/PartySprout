/**
 * Proves the server re-checks the phone rule on every endpoint that accepts one,
 * rather than trusting the browser. Covers:
 *
 *   POST  /api/quote-requests   (the quote wizard)
 *   POST  /api/auth/signup      (the account form)
 *   PATCH /api/auth/me          (the profile form)
 *   POST  /api/listings         (the business listing form)
 *
 * Every row it creates is deleted again, so the database keeps its shape.
 *
 * Run: node scripts/verify-phone-validation.cjs
 */
const http = require("node:http");
const crypto = require("node:crypto");

const { db, close } = require("../Database/index.js");
const { handleApi } = require("../Database/api-handler.cjs");

const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function request(port, path, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path,
        method: options.method || "GET",
        headers: options.headers || {},
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"),
          }),
        );
      },
    );
    req.on("error", reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

function send(port, path, method, body, cookie) {
  const payload = body === undefined ? undefined : JSON.stringify(body);
  const headers = { "content-type": "application/json" };
  if (payload) headers["content-length"] = Buffer.byteLength(payload);
  if (cookie) headers.cookie = cookie;
  return request(port, path, { method, headers, body: payload });
}

const quote = (extra) => ({
  name: "Alex Tester",
  email: "alex.tester@example.test",
  city: "Dallas",
  eventType: "Birthday",
  categorySlug: "superheroes",
  budget: "Under $200",
  details: "A phone-validation probe.",
  ...extra,
});

(async () => {
  const categorySlug = db.prepare("SELECT slug FROM categories ORDER BY id LIMIT 1").get().slug;
  const cityId = db.prepare("SELECT id FROM cities ORDER BY id LIMIT 1").get().id;

  const beforeQuotes = new Set(
    db
      .prepare("SELECT id FROM quote_requests")
      .all()
      .map((r) => r.id),
  );
  const beforeUsers = new Set(
    db
      .prepare("SELECT id FROM users")
      .all()
      .map((r) => r.id),
  );
  const beforeListings = new Set(
    db
      .prepare("SELECT id FROM listings")
      .all()
      .map((r) => r.id),
  );

  const server = http.createServer((req, res) => void handleApi(req, res));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const suffix = crypto.randomUUID().slice(0, 8);

  try {
    /* ------------------------- quote requests ------------------------- */
    console.log("\n--- POST /api/quote-requests ---");

    const letters = await send(
      port,
      "/api/quote-requests",
      "POST",
      quote({ phone: "not-a-phone" }),
    );
    check(
      "refuses a phone number written in letters",
      letters.status === 422 && Boolean(letters.body.fields?.phone),
      `status ${letters.status}, ${JSON.stringify(letters.body.fields ?? {})}`,
    );

    const mixed = await send(port, "/api/quote-requests", "POST", quote({ phone: "call 5551234" }));
    check(
      "refuses a phone number with stray words",
      mixed.status === 422 && Boolean(mixed.body.fields?.phone),
      `status ${mixed.status}`,
    );

    const short = await send(port, "/api/quote-requests", "POST", quote({ phone: "12345" }));
    check(
      "refuses a too-short phone number",
      short.status === 422 && Boolean(short.body.fields?.phone),
      `status ${short.status}`,
    );

    const badGuests = await send(
      port,
      "/api/quote-requests",
      "POST",
      quote({ guestCount: "a dozen" }),
    );
    check(
      "refuses a guest count that is not a number",
      badGuests.status === 422 && Boolean(badGuests.body.fields?.guestCount),
      `status ${badGuests.status}, ${JSON.stringify(badGuests.body.fields ?? {})}`,
    );

    const good = await send(
      port,
      "/api/quote-requests",
      "POST",
      quote({ phone: "+1 (641) 666-3945" }),
    );
    check("accepts a properly formatted number", good.status === 201, `status ${good.status}`);
    if (good.body.id) {
      const row = db.prepare("SELECT phone FROM quote_requests WHERE id = ?").get(good.body.id);
      check(
        "stores the number in one consistent shape",
        row.phone === "+16416663945",
        `stored "${row.phone}"`,
      );
    }

    const blank = await send(port, "/api/quote-requests", "POST", quote({ phone: "" }));
    check(
      "still accepts a blank phone (it is optional)",
      blank.status === 201,
      `status ${blank.status}`,
    );

    /* --------------------------- account form -------------------------- */
    console.log("\n--- POST /api/auth/signup ---");

    const signupBad = await send(port, "/api/auth/signup", "POST", {
      email: `probe-bad-${suffix}@example.test`,
      name: "Probe User",
      password: "correct horse battery",
      phone: "nope-not-this",
    });
    check(
      "signup refuses letters in the phone number",
      signupBad.status === 422 && Boolean(signupBad.body.fields?.phone),
      `status ${signupBad.status}, ${JSON.stringify(signupBad.body.fields ?? {})}`,
    );

    const signup = await send(port, "/api/auth/signup", "POST", {
      email: `probe-${suffix}@example.test`,
      name: "Probe User",
      password: "correct horse battery",
      phone: "+1 641-666-3945",
    });
    check("signup accepts a valid number", signup.status === 201, `status ${signup.status}`);
    const cookie = (signup.headers["set-cookie"] || []).map((c) => c.split(";")[0]).join("; ");
    const userId = signup.body.user?.id;
    if (userId) {
      const row = db.prepare("SELECT phone FROM users WHERE id = ?").get(userId);
      check(
        "signup stores the normalised number",
        row.phone === "+16416663945",
        `stored "${row.phone}"`,
      );
    }

    /* --------------------------- profile form -------------------------- */
    console.log("\n--- PATCH /api/auth/me ---");

    const patchBad = await send(
      port,
      "/api/auth/me",
      "PATCH",
      { name: "Probe User", phone: "call me" },
      cookie,
    );
    check(
      "profile update refuses letters in the phone number",
      patchBad.status === 422 && Boolean(patchBad.body.fields?.phone),
      `status ${patchBad.status}, ${JSON.stringify(patchBad.body.fields ?? {})}`,
    );

    const patchGood = await send(
      port,
      "/api/auth/me",
      "PATCH",
      { name: "Probe User", phone: "641 666 3945" },
      cookie,
    );
    check(
      "profile update accepts a valid number",
      patchGood.status === 200,
      `status ${patchGood.status}`,
    );
    if (patchGood.body.user) {
      check(
        "profile update normalises what it stores",
        patchGood.body.user.phone === "6416663945",
        `stored "${patchGood.body.user.phone}"`,
      );
    }

    const patchBlank = await send(
      port,
      "/api/auth/me",
      "PATCH",
      { name: "Probe User", phone: "" },
      cookie,
    );
    check(
      "profile update still accepts a blank phone",
      patchBlank.status === 200,
      `status ${patchBlank.status}`,
    );

    /* -------------------------- business form -------------------------- */
    console.log("\n--- POST /api/listings ---");

    const listingBody = {
      name: `Phone Probe ${suffix}`,
      categorySlug,
      cityId,
      website: "https://example.test",
      email: "probe@example.test",
      priceFrom: "200",
      description: "A phone-validation probe listing.",
    };

    const listingBad = await send(
      port,
      "/api/listings",
      "POST",
      { ...listingBody, phone: "not-a-phone" },
      cookie,
    );
    check(
      "the business form refuses letters in the phone number",
      listingBad.status === 422 && Boolean(listingBad.body.fields?.phone),
      `status ${listingBad.status}, ${JSON.stringify(listingBad.body.fields ?? {})}`,
    );

    const listingGood = await send(
      port,
      "/api/listings",
      "POST",
      { ...listingBody, phone: "(641) 666-3945" },
      cookie,
    );
    check(
      "the business form accepts a valid number",
      listingGood.status === 201,
      `status ${listingGood.status}`,
    );
    const createdId = listingGood.body.listing?.id;
    if (createdId) {
      const row = db.prepare("SELECT phone FROM listings WHERE id = ?").get(createdId);
      check(
        "the business form stores it normalised",
        row.phone === "6416663945",
        `stored "${row.phone}"`,
      );
    } else {
      check(
        "the business form returns the new listing",
        false,
        JSON.stringify(listingGood.body).slice(0, 120),
      );
    }

    const listingBlank = await send(
      port,
      "/api/listings",
      "POST",
      { ...listingBody, name: `Phone Probe 2 ${suffix}`, phone: "" },
      cookie,
    );
    check(
      "the business form still accepts a blank phone",
      listingBlank.status === 201,
      `status ${listingBlank.status}`,
    );

    /* ----------------------- editing that listing ---------------------- */
    console.log("\n--- PATCH /api/vendor/listings/:id ---");

    const editId = createdId;
    if (!editId) {
      check("a listing to edit exists", false, "the create above did not return an id");
    } else {
      const editBody = { ...listingBody, name: `Phone Probe ${suffix}` };

      const editBad = await send(
        port,
        `/api/vendor/listings/${editId}`,
        "PATCH",
        { ...editBody, phone: "nope" },
        cookie,
      );
      check(
        "editing a listing refuses letters in the phone number",
        editBad.status === 422 && Boolean(editBad.body.fields?.phone),
        `status ${editBad.status}, ${JSON.stringify(editBad.body.fields ?? {})}`,
      );

      const editGood = await send(
        port,
        `/api/vendor/listings/${editId}`,
        "PATCH",
        { ...editBody, phone: "641 666 3945" },
        cookie,
      );
      check(
        "editing a listing accepts a valid number",
        editGood.status === 200,
        `status ${editGood.status}`,
      );
      const edited = db.prepare("SELECT phone FROM listings WHERE id = ?").get(editId);
      check(
        "editing a listing stores it normalised",
        edited.phone === "6416663945",
        `stored "${edited.phone}"`,
      );

      const editBlank = await send(
        port,
        `/api/vendor/listings/${editId}`,
        "PATCH",
        { ...editBody, phone: "" },
        cookie,
      );
      check(
        "editing a listing still accepts a blank phone",
        editBlank.status === 200,
        `status ${editBlank.status}`,
      );
    }
  } finally {
    // Put the database back the way it was.
    const newQuotes = db
      .prepare("SELECT id FROM quote_requests")
      .all()
      .map((r) => r.id)
      .filter((id) => !beforeQuotes.has(id));
    const newUsers = db
      .prepare("SELECT id FROM users")
      .all()
      .map((r) => r.id)
      .filter((id) => !beforeUsers.has(id));
    const newListings = db
      .prepare("SELECT id FROM listings")
      .all()
      .map((r) => r.id)
      .filter((id) => !beforeListings.has(id));
    for (const id of newQuotes) db.prepare("DELETE FROM quote_requests WHERE id = ?").run(id);
    for (const id of newListings) {
      db.prepare("DELETE FROM listing_categories WHERE listing_id = ?").run(id);
      db.prepare("DELETE FROM listings WHERE id = ?").run(id);
    }
    for (const id of newUsers) {
      db.prepare("DELETE FROM sessions WHERE user_id = ?").run(id);
      db.prepare("DELETE FROM users WHERE id = ?").run(id);
    }
    console.log(
      `\ncleaned up: ${newQuotes.length} quote request(s), ${newListings.length} listing(s), ${newUsers.length} account(s)`,
    );
    server.close();
    close();
  }

  const failed = checks.filter((c) => !c.ok).length;
  console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
  process.exit(failed === 0 ? 0 : 1);
})();
