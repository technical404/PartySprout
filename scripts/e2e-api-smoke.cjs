const http = require('node:http');
const crypto = require('node:crypto');
const { handleApi } = require('../Database/api-handler.cjs');

function request(port, path, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path, method: options.method || 'GET', headers: options.headers || {} }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') }));
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

(async () => {
  const server = http.createServer((req, res) => void handleApi(req, res));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const email = `smoke-${crypto.randomUUID()}@example.test`;
  const payload = JSON.stringify({ email, name: 'Playwright Smoke', password: 'correct-horse-battery-staple', role: 'parent' });
  const signup = await request(port, '/api/auth/signup', { method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) }, body: payload });
  if (signup.status !== 201 || !signup.body.user || !signup.headers['set-cookie']) throw new Error(`signup failed: ${JSON.stringify(signup)}`);
  const cookie = signup.headers['set-cookie'][0].split(';')[0];
  const me = await request(port, '/api/auth/me', { headers: { cookie } });
  if (me.status !== 200 || me.body.user?.email !== email) throw new Error(`session failed: ${JSON.stringify(me)}`);
  const login = await request(port, '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(JSON.stringify({ email, password: 'correct-horse-battery-staple' })) }, body: JSON.stringify({ email, password: 'correct-horse-battery-staple' }) });
  if (login.status !== 200 || login.body.user?.email !== email) throw new Error(`login failed: ${JSON.stringify(login)}`);
  const listings = await request(port, '/api/listings?q=hero&page=1&pageSize=2');
  if (listings.status !== 200 || !Array.isArray(listings.body.items)) throw new Error(`listings failed: ${JSON.stringify(listings)}`);
  console.log(JSON.stringify({ ok: true, signup: signup.status, session: me.status, login: login.status, listings: listings.status, total: listings.body.total }));
  server.close();
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
