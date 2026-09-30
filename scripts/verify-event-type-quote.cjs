/**
 * Round-trips the quote wizard's new "What type of event are you planning?"
 * answer through everything that has to carry it: the SQLite column, the
 * POST /api/quote-requests validation and insert, and the reader the vendor
 * dashboard uses. The probe rows are deleted again, so quote_requests keeps
 * the shape the other verify scripts expect.
 *
 * Run: node scripts/verify-event-type-quote.cjs
 */
const http = require("node:http");
const crypto = require("node:crypto");

const { db, close } = require("../Database/index.js");
// Requiring the handler runs init(), which applies the event_type migration.
const { handleApi } = require("../Database/api-handler.cjs");
const queries = require("../Database/queries.js");

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

function post(port, path, body) {
  const payload = JSON.stringify(body);
  return request(port, path, {
    method: "POST",
    headers: { "content-type": "application/json", "content-length": Buffer.byteLength(payload) },
    body: payload,
  });
}

(async () => {
  const columns = db
    .prepare("PRAGMA table_info(quote_requests)")
    .all()
    .map((row) => row.name);
  check(
    "quote_requests has an event_type column",
    columns.includes("event_type"),
    columns.join(", "),
  );

  const beforeIds = new Set(
    db
      .prepare("SELECT id FROM quote_requests")
      .all()
      .map((row) => row.id),
  );
  const before = beforeIds.size;
  const server = http.createServer((req, res) => void handleApi(req, res));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const email = `event-type-${crypto.randomUUID()}@example.test`;

  try {
    // 1. The answer the new first question sends is stored verbatim.
    const sent = "Birthday (Child)";
    const ok = await post(port, "/api/quote-requests", {
      name: "Event Type Probe",
      email,
      city: "Dallas, TX",
      eventDate: "2026-11-14",
      guestCount: "12",
      childAge: "Mostly age 6",
      eventType: sent,
      categorySlug: "superheroes",
      budget: "$400 – $700",
      details: "Verifying that the event type survives the round trip.",
      vendorSlug: "a-dash-of-magic-events",
    });
    check(
      "POST /api/quote-requests accepts an eventType",
      ok.status === 201,
      `status ${ok.status}`,
    );

    const row = queries.listRecentQuoteRequests(5).find((item) => item.id === ok.body.id);
    check(
      "the stored row keeps the event type",
      row?.event_type === sent,
      `event_type=${JSON.stringify(row?.event_type)}`,
    );
    check(
      "the rest of the request is untouched",
      row?.category_slug === "superheroes" &&
        row?.child_age === "Mostly age 6" &&
        row?.guest_count === "12",
      `category=${row?.category_slug} child_age=${row?.child_age} guests=${row?.guest_count}`,
    );

    // 2. An older client that sends no eventType still works, storing NULL — the
    //    column is additive and the form is the only thing that changed.
    const legacy = await post(port, "/api/quote-requests", {
      name: "No Event Type Probe",
      email,
      city: "Dallas, TX",
      categorySlug: "magicians",
      details: "A request shaped like the ones the previous form sent.",
    });
    check(
      "a request without an eventType still submits",
      legacy.status === 201,
      `status ${legacy.status}`,
    );
    const legacyRow = queries.listRecentQuoteRequests(5).find((item) => item.id === legacy.body.id);
    check(
      "the missing event type is stored as NULL",
      legacyRow?.event_type === null,
      `event_type=${JSON.stringify(legacyRow?.event_type)}`,
    );

    // 3. The server holds event_type to its own column width (VARCHAR(120)) —
    //    narrower than the other free-text fields' limit.
    const atLimit = await post(port, "/api/quote-requests", {
      name: "Column Width Probe",
      email,
      city: "Dallas, TX",
      eventType: "x".repeat(120),
      categorySlug: "clowns",
      details: "A value exactly as long as the event_type column allows.",
    });
    check(
      "an eventType of exactly 120 characters is accepted",
      atLimit.status === 201,
      `status ${atLimit.status}`,
    );

    for (const [label, length] of [
      ["past the column width", 121],
      ["past every field limit", 2500],
    ]) {
      const rejected = await post(port, "/api/quote-requests", {
        name: "Too Long Probe",
        email,
        city: "Dallas, TX",
        eventType: "x".repeat(length),
        categorySlug: "clowns",
        details: "An event type no column should ever hold.",
      });
      check(
        `an eventType ${label} is rejected with a field error`,
        rejected.status === 422 && Boolean(rejected.body.fields?.eventType),
        `status ${rejected.status} fields=${JSON.stringify(rejected.body.fields)}`,
      );
    }

    // 4. Both readers the quote history screens use return the column as well.
    const vendor = queries.getListingBySlug("a-dash-of-magic-events");
    check("the probe reached a real vendor listing", Boolean(vendor), vendor?.slug);
    if (vendor) {
      const lead = queries
        .listQuoteRequestsForListing(vendor.id)
        .find((item) => item.id === ok.body.id);
      check(
        "the vendor lead reader returns the event type",
        lead?.event_type === sent,
        `event_type=${JSON.stringify(lead?.event_type)}`,
      );
    }

    const mine = queries
      .listQuoteRequestsForUser({ id: -1, email })
      .find((item) => item.id === ok.body.id);
    check(
      'the "my quotes" reader returns the event type',
      mine?.event_type === sent,
      `event_type=${JSON.stringify(mine?.event_type)}`,
    );
  } finally {
    // Every probe uses the same email pattern, so the sweep also clears a row an
    // earlier interrupted run left behind, while requests from anyone else stay.
    db.prepare("DELETE FROM quote_requests WHERE email LIKE 'event-type-%@example.test'").run();
    server.close();
  }

  const afterIds = db
    .prepare("SELECT id FROM quote_requests")
    .all()
    .map((row) => row.id);
  const leaked = afterIds.filter((id) => !beforeIds.has(id));
  check(
    "the probe rows were removed again",
    leaked.length === 0,
    `left behind ${JSON.stringify(leaked)}`,
  );

  const probesLeft = db
    .prepare(
      "SELECT COUNT(*) AS total FROM quote_requests WHERE email LIKE 'event-type-%@example.test'",
    )
    .get().total;
  check(
    "no probe row survives the run",
    probesLeft === 0,
    `${probesLeft} left of ${afterIds.length} rows (${before} before)`,
  );

  const failed = checks.filter((item) => !item.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
  close();
  if (failed.length > 0) process.exitCode = 1;
})().catch((error) => {
  console.error(error.stack || error);
  close();
  process.exitCode = 1;
});
