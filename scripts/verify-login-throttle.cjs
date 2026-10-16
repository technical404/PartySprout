/**
 * Checks how long a locked-out sign-in stays locked.
 *
 *   node scripts/verify-login-throttle.cjs
 *
 * Eleven wrong passwords from one address: the first ten are answered with 401, the
 * eleventh with 429. Then it waits the window out and confirms the door opens again,
 * and that the wait was about half a minute rather than a quarter of an hour. It
 * creates nothing — the attempts use an address that never had an account — and takes
 * roughly thirty-five seconds, almost all of it waiting.
 */
const http = require('node:http');
const { handleApi } = require('../Database/api-handler.cjs');

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

(async () => {
  server = http.createServer((req, res) => void handleApi(req, res));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  const wrong = json({ email: 'throttle-probe@example.test', password: 'not-the-password' });
  const started = Date.now();

  const statuses = [];
  for (let i = 1; i <= 11; i += 1) {
    statuses.push((await request(port, '/api/auth/login', wrong)).status);
  }
  console.log(`  statuses: ${statuses.join(', ')}`);

  check(
    'the first ten wrong passwords are answered as wrong, not blocked',
    statuses.slice(0, 10).every((status) => status === 401),
    statuses,
  );
  check('the eleventh is blocked', statuses[10] === 429, statuses[10]);

  const blocked = await request(port, '/api/auth/login', wrong);
  check('and it is still blocked a moment later', blocked.status === 429, blocked.status);
  check(
    'the message promises the short wait, not minutes',
    /30 seconds/.test(blocked.body.error || '') && !/minutes/.test(blocked.body.error || ''),
    blocked.body.error,
  );

  // The window is fixed from the first attempt, so it expires half a minute after
  // the burst started rather than half a minute after the last try.
  const opensAt = started + 31000;
  while (Date.now() < opensAt) await new Promise((resolve) => setTimeout(resolve, 1000));

  const after = await request(port, '/api/auth/login', wrong);
  const waited = Math.round((Date.now() - started) / 1000);
  check('the door opens again after about half a minute', after.status === 401, `got ${after.status} after ${waited}s`);
  check('that is far short of the old fifteen minutes', waited <= 45, `${waited}s`);

  const again = await request(port, '/api/auth/login', wrong);
  check('the fresh window counts from the start, not from the last attempt', again.status !== 429, again.status);

  console.log(`\n${checks.length} checks passed (waited ${waited}s for the window)`);
  server.close();
  process.exit(0);
})().catch((error) => {
  console.error(`\nFAILED\n${error.message}`);
  if (server) server.close();
  process.exit(1);
});