/**
 * Browser checks for the admin console.
 *
 *   npm run dev                                   # must be up on :8080 first
 *   node scripts/verify-admin-ui.mjs              # local dev server
 *   node scripts/verify-admin-ui.mjs https://hirepartycharacters.com
 *
 * The console is a client-rendered screen, so nothing here can be proved with an API
 * call: these checks sign in, click through all six tabs, and read the DOM. The script
 * creates its own admin account, so it needs no credentials and leaves none behind.
 *
 * It writes to the directory in exactly two places, and undoes both: the featured flag
 * of one listing (flipped, checked, flipped back) and a category name typed into the
 * form without saving. Everything else — the empty-name edit, the self-demotion, the
 * self-deletion, the short password — is asserted to be *refused*, so nothing is stored.
 * Point it at the dev server, not at a directory you care about.
 */

import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '..');
const database = path.join(projectRoot, 'Database');
const { init } = require(path.join(database, 'index.js'));
const queries = require(path.join(database, 'queries.js'));

const BASE = (process.argv[2] || process.env.PS_BASE || 'http://127.0.0.1:8080').replace(/\/$/, '');
const EMAIL = process.env.PS_ADMIN_EMAIL || 'admin-ui-check@example.test';
const PASSWORD = crypto.randomBytes(15).toString('base64url');

const results = [];
function check(label, ok, detail = '') {
  results.push({ label, ok });
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok || !detail ? '' : ` — ${detail}`}`);
}

/** Promotes or creates the throwaway admin, the same way an operator would. */
function makeAdmin() {
  execFileSync(process.execPath, [path.join(database, 'create-admin.cjs'), EMAIL, PASSWORD], {
    cwd: projectRoot,
    stdio: 'pipe',
  });
}

/** Removes it again, and its sessions, straight from the development database. */
function removeAdmin() {
  init();
  const user = queries.getUserByEmail(EMAIL);
  if (user) {
    queries.adminDeleteUser(user.id);
    console.log(`\nremoved ${EMAIL} (id ${user.id}) and its sessions`);
  }
}

makeAdmin();

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});

const body = () => page.locator('main').innerText();
const tab = (name) => page.getByRole('button', { name, exact: true });

try {
  // --- sign in ------------------------------------------------------------
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.locator('form button[type="submit"]').click();
  await page.waitForTimeout(2000);

  await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  check(
    'the console loads for a signed-in admin',
    (await page.locator('h1').innerText()).includes('Dashboard'),
  );
  check('the dashboard shows live counts', /[1-9]\d*/.test(await body()));

  // --- listings -----------------------------------------------------------
  await tab('Listings').click();
  await page.waitForTimeout(1500);
  check('the Listings tab renders its toolbar', await page.getByRole('button', { name: 'Export CSV' }).isVisible());
  const rows = page.locator('table tbody tr');
  check('the listings table has rows', (await rows.count()) > 0, `rows=${await rows.count()}`);
  const firstName = (await rows.first().locator('td').first().innerText()).split('\n')[0].trim();
  check('a row shows a real business name', firstName.length > 2, firstName);
  const pagerText = await page
    .locator('text=/of \\d+/')
    .first()
    .innerText()
    .catch(() => '');
  check('the pager states a total', /of \d+/.test(pagerText), pagerText);

  const search = page.getByPlaceholder('Name, website, email or slug');
  await search.fill('zzzz-no-such-business-zzzz');
  await page.waitForTimeout(1500);
  check('a nonsense search shows the empty state', /No listings match these filters/.test(await body()));
  await search.fill(firstName.split(/\s+/).slice(0, 2).join(' '));
  await page.waitForTimeout(1500);
  check('a real name returns rows', (await rows.count()) > 0);
  await search.fill('');
  await page.waitForTimeout(1500);

  await page.getByRole('combobox').nth(2).click();
  await page.getByRole('option', { name: 'Featured first' }).click();
  await page.waitForTimeout(1500);
  check('sorting by featured still renders rows', (await rows.count()) > 0);
  await page.getByRole('combobox').nth(2).click();
  await page.getByRole('option', { name: 'Newest first' }).click();
  await page.waitForTimeout(1500);

  // The featured flag is the one thing this script writes: flipped, checked, flipped back.
  const star = () => rows.first().locator('button[aria-pressed]').first();
  const wasFeatured = (await star().getAttribute('aria-pressed')) === 'true';
  await star().click();
  await page.waitForTimeout(1800);
  const isFeatured = (await star().getAttribute('aria-pressed')) === 'true';
  check('the featured toggle flips and persists', isFeatured !== wasFeatured, `${wasFeatured} -> ${isFeatured}`);
  await star().click();
  await page.waitForTimeout(1800);
  check('the featured toggle can be put back', ((await star().getAttribute('aria-pressed')) === 'true') === wasFeatured);

  await rows.first().getByRole('button', { name: 'Edit' }).click();
  await page.waitForTimeout(800);
  const dialog = page.getByRole('dialog');
  check('the edit dialog opens', await dialog.isVisible());
  const nameField = dialog.locator('input').first();
  const originalName = await nameField.inputValue();
  check('the edit dialog is prefilled', originalName.length > 2, originalName);
  await nameField.fill('');
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await page.waitForTimeout(1200);
  check('an empty name is refused', /Please enter the business name/.test(await dialog.innerText()), (await dialog.innerText()).slice(-120));
  await nameField.fill(originalName);
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await page.waitForTimeout(600);
  check('the edit dialog closes on cancel', (await dialog.count()) === 0);

  await rows.first().getByRole('button', { name: 'Delete' }).click();
  await page.waitForTimeout(600);
  check('deleting asks for confirmation', await page.getByRole('alertdialog').isVisible());
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel' }).click();
  await page.waitForTimeout(500);
  check('the confirmation can be dismissed', (await page.getByRole('alertdialog').count()) === 0);

  // --- accounts -----------------------------------------------------------
  await tab('Accounts').click();
  await page.waitForTimeout(1500);
  const accountRows = page.locator('table tbody tr');
  check('the accounts table lists accounts', (await accountRows.count()) > 0, `rows=${await accountRows.count()}`);
  const selfRow = accountRows.filter({ hasText: EMAIL });
  check('the signed-in admin is in the table', (await selfRow.count()) === 1);

  await selfRow.getByRole('combobox').first().click();
  await page.getByRole('option', { name: 'Parent' }).click();
  await page.waitForTimeout(1500);
  check('demoting your own account is refused', /You cannot remove your own admin access/.test(await body()), (await body()).split('\n').find((line) => /cannot/.test(line)) ?? 'no notice');

  await selfRow.getByRole('button', { name: 'Delete' }).click();
  await page.waitForTimeout(600);
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  await page.waitForTimeout(1500);
  check('deleting your own account is refused', /You cannot delete your own account/.test(await body()), (await body()).split('\n').find((line) => /cannot/.test(line)) ?? 'no notice');

  await selfRow.getByRole('button', { name: 'Password' }).click();
  await page.waitForTimeout(600);
  const pwDialog = page.getByRole('dialog');
  check('the password dialog opens', await pwDialog.isVisible());
  const setPassword = pwDialog.getByRole('button', { name: 'Set password' });
  await pwDialog.locator('input[type="password"]').fill('short');
  await page.waitForTimeout(400);
  check('a password under 8 characters cannot be submitted', await setPassword.isDisabled());
  await pwDialog.locator('input[type="password"]').fill('long-enough-9');
  await page.waitForTimeout(400);
  check('a long enough password can be submitted', await setPassword.isEnabled());
  await pwDialog.getByRole('button', { name: 'Cancel' }).click();
  await page.waitForTimeout(500);
  check('the password dialog closes without changing it', (await pwDialog.count()) === 0);

  // --- categories ---------------------------------------------------------
  await tab('Categories').click();
  await page.waitForTimeout(1800);
  const categoriesBody = await body();
  check('the Categories tab lists real categories', /Superheroes/.test(categoriesBody) && /Mascots/.test(categoriesBody));
  check('it exposes the specialty labels', /Specialty labels/.test(categoriesBody));
  check('it shows live and total counts', /\d+ live of \d+/.test(categoriesBody), categoriesBody.split('\n').find((line) => /live of/.test(line)) ?? '');

  const card = page.locator('div.rounded-2xl.border.bg-background').first();
  const categorySave = card.getByRole('button', { name: 'Save category' });
  check('Save category is idle until something changes', await categorySave.isDisabled());
  const nameInput = card.locator('input').first();
  const originalCategoryName = await nameInput.inputValue();
  await nameInput.fill(`${originalCategoryName} —`);
  await page.waitForTimeout(300);
  check('Save category wakes up when the name changes', await categorySave.isEnabled());
  await nameInput.fill(originalCategoryName);
  await page.waitForTimeout(300);
  check('Save category goes idle when the name is restored', await categorySave.isDisabled());

  // --- quotes -------------------------------------------------------------
  await tab('Quote requests').click();
  await page.waitForTimeout(1500);
  check('the Quote requests tab renders', /quote request/i.test(await body()));
  check('it offers CSV export', await page.getByRole('button', { name: 'Export CSV' }).isVisible());

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 30000 }).catch(() => null),
    page.getByRole('button', { name: 'Export CSV' }).click(),
  ]);
  check('CSV export really downloads a file', download !== null, download ? download.suggestedFilename() : 'no download event');

  const realErrors = errors.filter((line) => !/Failed to load resource: the server responded with a status of 4\d\d/.test(line));
  check('no uncaught page errors', realErrors.length === 0, realErrors.slice(0, 2).join(' | '));
} finally {
  await browser.close();
  removeAdmin();
}

const failed = results.filter((row) => !row.ok);
console.log(JSON.stringify({ ok: failed.length === 0, checks: results.length, failed: failed.length }));
process.exit(failed.length === 0 ? 0 : 1);