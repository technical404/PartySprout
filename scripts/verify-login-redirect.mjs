/**
 * Browser check: submitting the login form on /login opens the account it belongs to.
 *
 *   npm run dev                                # must be up on :8080 first
 *   node scripts/verify-login-redirect.mjs
 *   node scripts/verify-login-redirect.mjs https://hirepartycharacters.com
 *
 * The redirect is client-side, so no API call can prove it. Each role gets its own
 * throwaway account in the development database, signs in through the real form, and
 * the landing URL is read back from the browser. Everything it creates is removed
 * again, whichever way the run ends.
 *
 * The destination for each role is the same one the header's name links to, so a
 * signed-in visitor lands where clicking their own name would take them.
 */

import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '..');
const database = path.join(projectRoot, 'Database');
const { init } = require(path.join(database, 'index.js'));
const queries = require(path.join(database, 'queries.js'));
const auth = require(path.join(database, 'auth.js'));

const BASE = (process.argv[2] || process.env.PS_BASE || 'http://127.0.0.1:8080').replace(/\/$/, '');
const PASSWORD = 'redirect-check-1';

const results = [];
function check(label, ok, detail = '') {
  results.push({ label, ok });
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok || !detail ? '' : ` — ${detail}`}`);
}

const stamp = Date.now();
const accounts = [
  { role: 'parent', email: `redirect-parent-${stamp}@example.test`, landsOn: '/account', shows: 'Parent account' },
  { role: 'vendor', email: `redirect-vendor-${stamp}@example.test`, landsOn: '/vendor/dashboard', shows: 'here is your business' },
  { role: 'admin', email: `redirect-admin-${stamp}@example.test`, landsOn: '/admin', shows: null },
];
const signupEmail = `redirect-signup-${stamp}@example.test`;

init();
for (const account of accounts) {
  queries.createUser({
    email: account.email,
    name: `${account.role} redirect check`,
    phone: '',
    passwordHash: auth.hashPassword(PASSWORD),
    role: account.role,
  });
}

function cleanup() {
  for (const email of [...accounts.map((account) => account.email), signupEmail]) {
    const user = queries.getUserByEmail(email);
    if (user) queries.adminDeleteUser(user.id);
  }
  console.log('\nremoved the throwaway accounts');
}

const browser = await chromium.launch();
const problems = [];

async function signIn(page, email, password = PASSWORD) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.locator('form button[type="submit"]').click();
}

async function landed(page, expected) {
  try {
    await page.waitForURL((url) => new URL(url).pathname === expected, { timeout: 15000 });
    return true;
  } catch {
    return false;
  }
}

try {
  for (const account of accounts) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    page.on('pageerror', (error) => problems.push(`${account.role}: ${error}`));

    await signIn(page, account.email);
    const arrived = await landed(page, account.landsOn);
    check(
      `a ${account.role} signing in on /login lands on ${account.landsOn}`,
      arrived,
      `stayed on ${new URL(page.url()).pathname}`,
    );

    if (arrived && account.shows) {
      await page.waitForTimeout(1200);
      const text = await page.locator('main').innerText();
      check(`the ${account.role} page is the one that rendered`, text.includes(account.shows), account.shows);
    }

    if (arrived && account.role === 'admin') {
      await page.waitForTimeout(1500);
      check('the console itself rendered, not just the URL', /Dashboard/.test(await page.locator('main').innerText()));
    }

    await context.close();
  }

  // The same panel is used inline; there, signing in must stay put and fill the page in.
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.on('pageerror', (error) => problems.push(`inline: ${error}`));
  await page.goto(`${BASE}/account`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);
  await page.fill('input[type="email"]', accounts[0].email);
  await page.fill('input[type="password"]', PASSWORD);
  await page.locator('form button[type="submit"]').click();
  await page.waitForTimeout(2500);
  check('signing in from the /account panel stays on /account', new URL(page.url()).pathname === '/account');
  check(
    'and the account is filled in',
    (await page.locator('main').innerText()).includes('Parent account'),
  );
  await context.close();

  // Signing up carries the same destination, so a new parent should also arrive.
  const signupContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const signupPage = await signupContext.newPage();
  signupPage.on('pageerror', (error) => problems.push(`signup: ${error}`));
  await signupPage.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await signupPage.getByRole('button', { name: 'Create account', exact: true }).click();
  await signupPage.fill('input[autocomplete="name"]', 'Signup Redirect');
  await signupPage.fill('input[type="email"]', signupEmail);
  await signupPage.fill('input[type="password"]', PASSWORD);
  await signupPage.locator('form button[type="submit"]').click();
  const signupArrived = await landed(signupPage, '/account');
  check('a new parent signing up on /login lands on /account', signupArrived, `stayed on ${new URL(signupPage.url()).pathname}`);
  await signupContext.close();

  check('no page errors anywhere', problems.length === 0, problems.slice(0, 3).join(' | '));
} finally {
  await browser.close();
  cleanup();
}

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);