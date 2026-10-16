/**
 * Exercises "change my own password" for a signed-in account.
 *
 *   node scripts/verify-change-password.cjs
 *
 * Creates a parent, signs in twice (two browsers), changes the password from one
 * of them, and checks the whole picture: the new password works, the old one is
 * dead, the browser that changed it stays signed in and the other one does not.
 * Everything it creates is removed again, whichever way the run ends.
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

let server = null;
const created = { userIds: [] };

function cleanup() {
  // Sessions first: deleting a user row on its own would leave them behind.
  for (const id of created.userIds) {
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
  }
  created.userIds = [];
  if (server) server.close();
}

(async () => {
  server = http.createServer((req, res) => void handleApi(req, res));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  const stamp = crypto.randomUUID().slice(0, 8);
  const password = 'correct-horse-battery-staple';
  const next = 'a-brand-new-secret';

  const user = queries.createUser({
    email: `self-${stamp}@example.test`,
    name: 'Verify Self',
    phone: '',
    passwordHash: auth.hashPassword(password),
    role: 'parent',
  });
  created.userIds.push(user.id);

  const first = await request(port, '/api/auth/login', json({ email: user.email, password }));
  check('the account can sign in', first.status === 200, first.body);
  const firstCookie = first.headers['set-cookie'][0].split(';')[0];
  const second = await request(port, '/api/auth/login', json({ email: user.email, password }));
  check('the same account can sign in twice', second.status === 200, second.body);
  const secondCookie = second.headers['set-cookie'][0].split(';')[0];
  check('the two sign-ins are separate sessions', firstCookie !== secondCookie, [firstCookie, secondCookie]);

  const asFirst = (path, options = {}) =>
    request(port, path, { ...options, headers: { ...(options.headers || {}), cookie: firstCookie } });
  const asSecond = (path, options = {}) =>
    request(port, path, { ...options, headers: { ...(options.headers || {}), cookie: secondCookie } });

  /* --- who may call it -------------------------------------------------- */

  const anon = await request(port, '/api/auth/password', json({ currentPassword: password, password: next }));
  check('a signed-out caller is refused', anon.status === 401, anon.body);

  const empty = await asFirst('/api/auth/password', json({}));
  check('an empty body is refused', empty.status === 422, empty.body);
  check(
    'both missing fields are reported',
    ['currentPassword', 'password'].every((key) => empty.body.fields[key]),
    empty.body.fields,
  );

  /* --- what it refuses -------------------------------------------------- */

  const short = await asFirst('/api/auth/password', json({ currentPassword: password, password: 'short' }));
  check('a short new password is refused', short.status === 422 && short.body.fields.password, short.body);

  const wrong = await asFirst('/api/auth/password', json({ currentPassword: 'not-my-password', password: next }));
  check('a wrong current password is refused', wrong.status === 422 && wrong.body.fields.currentPassword, wrong.body);

  const unchanged = await request(port, '/api/auth/login', json({ email: user.email, password }));
  check('a refused change leaves the password alone', unchanged.status === 200, unchanged.body);

  /* --- what it does ----------------------------------------------------- */

  const changed = await asFirst('/api/auth/password', json({ currentPassword: password, password: next }));
  check('the password changes', changed.status === 200 && changed.body.ok === true, changed.body);

  const stillSignedIn = await asFirst('/api/auth/me');
  check(
    'the browser that changed it stays signed in',
    stillSignedIn.status === 200 && stillSignedIn.body.user?.id === user.id,
    stillSignedIn.body,
  );

  const otherBrowser = await asSecond('/api/auth/me');
  check('the other session ends', otherBrowser.status === 200 && otherBrowser.body.user === null, otherBrowser.body);

  const oldPassword = await request(port, '/api/auth/login', json({ email: user.email, password }));
  check('the old password no longer works', oldPassword.status === 401, oldPassword.body);

  const newPassword = await request(port, '/api/auth/login', json({ email: user.email, password: next }));
  check('the new password works', newPassword.status === 200, newPassword.body);

  const stored = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(user.id);
  check('the stored hash uses the current scheme', String(stored.password_hash).startsWith('pbkdf2$sha256$'), stored.password_hash);
  check('the password itself is never stored', !String(stored.password_hash).includes(next), stored.password_hash);

  /* --- cleanup --------------------------------------------------------- */

  cleanup();
  check(
    'the run cleaned up after itself',
    db.prepare("SELECT COUNT(*) AS total FROM users WHERE email LIKE '%-' || ? || '@example.test'").get(stamp).total === 0,
    'leftovers',
  );

  console.log(JSON.stringify({ ok: true, checks: checks.length, checksRun: checks }, null, 2));
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
}).finally(cleanup);
