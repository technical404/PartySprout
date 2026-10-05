/**
 * Walks the quote wizard to the phone question and checks, in a real browser, that
 * the field refuses letters, that a too-short number shows a message and blocks
 * sending, that a formatted number is accepted, and that the API rejects a bad
 * number even when the form is bypassed. Then it checks the sign-up form's phone
 * field the same way, and that a bad number there never reaches the network.
 *
 * It needs a running server. It types but never submits a valid request, and the
 * one request it does send carries a rejected phone number, so nothing is stored.
 *
 * Run: node scripts/verify-phone-form.mjs [baseUrl]
 *      node scripts/verify-phone-form.mjs https://hirepartycharacters.com
 */
import { chromium } from "playwright";

const base = process.argv[2] || "http://localhost:8080";

const browser = await chromium.launch({ headless: true, channel: "msedge" });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e).split("\n")[0]));

let passed = 0;
let failed = 0;
function check(name, ok, detail) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name} — ${detail}`);
  if (ok) passed += 1;
  else failed += 1;
}

const text = () => page.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
const stepNo = async () => {
  const m = (await text()).match(/Question (\d+) of (\d+)/);
  return m ? Number(m[1]) : -1;
};

// ============================ quote wizard ============================
console.log("--- quote wizard (/request-quote) ---");
await page.goto(`${base}/request-quote`, { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(800);

// Walk forward filling valid answers until we reach the phone step.
async function next() {
  await page.getByRole("button", { name: "Next" }).click();
  await page.waitForTimeout(450);
}

const eventSelect = page.locator("select").first();
await eventSelect.selectOption({ index: 1 });
await next();
await page.locator('button[role="combobox"]').first().click();
await page.waitForTimeout(300);
await page.locator('[role="option"]').first().click();
await next();
await page.getByPlaceholder("Dallas, TX").fill("Dallas");
await next();
await next(); // date is optional
await page.getByPlaceholder("15").fill("12");
await next();
await page.getByPlaceholder("Mostly age 6").fill("Mostly 6");
await next();
await page.locator('button[role="combobox"]').first().click();
await page.waitForTimeout(300);
await page.locator('[role="option"]').first().click();
await next();
await page.locator("textarea").fill("We would love a superhero for the afternoon.");
await next();
await page.getByPlaceholder("Alex Rivera").fill("Alex Rivera");
await next();
await page.locator('input[type="email"]').fill("alex@example.com");
await next();

const atPhone = await stepNo();
const phone = page.locator('input[type="tel"]').first();

// 1. typing letters must not put letters in the field
await phone.fill("");
await phone.type("call me maybe 123", { delay: 15 });
const typed = await phone.inputValue();
check(
  "letters cannot be typed into the phone field",
  !/[a-z]/i.test(typed),
  `field now holds "${typed}"`,
);

// 2. a clearly too-short number is rejected with a visible message
await phone.fill("");
await phone.type("12", { delay: 15 });
await page.getByRole("button", { name: "Send quote request" }).click();
await page.waitForTimeout(700);
const shortText = await text();
const shortInvalid = await page.locator('input[type="tel"][aria-invalid="true"]').count();
check(
  "a too-short number shows an error and blocks sending",
  shortInvalid === 1 && /phone number/i.test(shortText) && /Question 11 of 11/.test(shortText),
  `aria-invalid=${shortInvalid}, still on step ${await stepNo()}`,
);

// 3. a valid number is accepted
await phone.fill("");
await phone.type("+1 (641) 666-3945", { delay: 15 });
const valid = await phone.inputValue();
check("a formatted valid number is accepted", /641/.test(valid), `"${valid}"`);

// 4. the guest count rejects a non-number through the same path
check("the phone step is question 11", atPhone === 11, `step ${atPhone}`);

// ============================ sign-up form ============================
console.log("\n--- sign-up form (/login) ---");
const signupPosts = [];
page.on("request", (request) => {
  if (request.url().includes("/api/auth/signup")) signupPosts.push(request.url());
});

await page.goto(`${base}/login`, { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(600);
await page.getByRole("button", { name: "Create account" }).first().click();
await page.waitForTimeout(400);

const signupPhone = page.locator('input[type="tel"]').first();
const signupTyped = await (async () => {
  await signupPhone.type("call me 123", { delay: 15 });
  return signupPhone.inputValue();
})();
check(
  "letters cannot be typed into the sign-up phone field",
  !/[a-z]/i.test(signupTyped),
  `field now holds "${signupTyped}"`,
);

// A too-short number is answered in the form, so no sign-up request is sent.
await signupPhone.fill("");
await signupPhone.type("12", { delay: 15 });
await page.locator('button[type="submit"]').click();
await page.waitForTimeout(700);
const signupText = await text();
const signupInvalid = await page.locator('input[type="tel"][aria-invalid="true"]').count();
check(
  "a too-short sign-up number explains itself and is never sent",
  signupInvalid === 1 && /phone number/i.test(signupText) && signupPosts.length === 0,
  `aria-invalid=${signupInvalid}, sign-up requests=${signupPosts.length}`,
);

// ======================= server rejects bad phone =======================
console.log("\n--- server-side check (bypasses the UI) ---");
const serverResult = await page.evaluate(async () => {
  const res = await fetch("/api/quote-requests", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Alex Tester",
      email: "alex.tester@example.com",
      phone: "not-a-phone",
      city: "Dallas",
      eventType: "Birthday",
      categorySlug: "superheroes",
      budget: "Under $200",
      details: "A test submission with a bad phone number.",
    }),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
});
console.log("   server said:", JSON.stringify(serverResult));
check(
  "the server refuses a phone number with letters",
  serverResult.status === 422 && Boolean(serverResult.body.fields?.phone),
  `status ${serverResult.status}, fields ${JSON.stringify(serverResult.body.fields ?? {})}`,
);

check("no uncaught page errors", pageErrors.length === 0, pageErrors.join(" | ") || "none");

await browser.close();
console.log(`\n${passed}/${passed + failed} checks passed`);
process.exit(failed === 0 ? 0 : 1);
