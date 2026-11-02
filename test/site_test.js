// The website and accounts, on a real HTTP server with an in-memory store and
// a fake GitHub: home page and docs, OpenAPI, examples, signing in, making,
// using and revoking keys, and the rate limit.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { createServer } from 'node:http';
import { createApp } from '../src/app.js';
import { createMemoryStore } from '../src/store.js';
import { createKeys } from '../src/keys.js';
import { createAuth } from '../src/auth.js';
import { createRateLimit } from '../src/ratelimit.js';

const PUBLIC = 'https://silly.example';
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);

const fakeGenerator = {
  contentType: 'image/png',
  docs: {
    title: 'Fake <b>bold</b>',
    summary: 'Makes `fake` images.',
    fields: [
      { name: 'text', type: 'string', required: true, description: 'The `text`.' },
      { name: 'size', type: 'integer', minimum: 1, maximum: 3, description: 'How big.' },
      { name: 'mode', type: 'string', enum: ['a', 'b'], default: 'a', description: 'Mode.' },
    ],
    example: { text: 'example' },
  },
  validate: input => ({ text: String(input.text || 'x') }),
  render: async () => PNG,
};

// A GitHub that signs in "octo<cat>" (a login with HTML in it, to check escaping).
const fakeGitHub = async (url, options) => {
  if (url === 'https://github.com/login/oauth/access_token') {
    const body = JSON.parse(options.body);
    return Response.json(
      body.code === 'good-code' ? { access_token: 'gh-token' } : { error: 'bad' }
    );
  }
  if (url === 'https://api.github.com/user') {
    return Response.json({ id: 4242, login: 'octo<cat>' });
  }
  throw new Error(`unexpected fetch ${url}`);
};

describe('site', () => {
  let server;
  let base;
  let logs;
  before(async () => {
    logs = [];
    const store = createMemoryStore();
    const app = createApp({
      store,
      generators: { fake: fakeGenerator },
      apiKeys: ['admin-key'],
      publicUrl: PUBLIC,
      keys: createKeys({ store }),
      auth: createAuth({
        clientId: 'client-id',
        clientSecret: 'client-secret',
        secret: 'session-secret',
        publicUrl: PUBLIC,
        fetch: fakeGitHub,
      }),
      rateLimit: createRateLimit({ capacity: 3, perHour: 60 }),
      log: entry => logs.push(entry),
    });
    server = createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  after(() => new Promise(resolve => server.close(resolve)));

  const get = (path, headers = {}) => fetch(`${base}${path}`, { headers, redirect: 'manual' });
  const post = (path, headers = {}) =>
    fetch(`${base}${path}`, {
      method: 'POST',
      headers: { Origin: PUBLIC, ...headers },
      redirect: 'manual',
    });
  const cookieHeader = res =>
    res.headers
      .getSetCookie()
      .map(c => c.split(';')[0])
      .filter(c => !c.endsWith('='))
      .join('; ');

  const signIn = async () => {
    const login = await get('/login');
    const state = new URL(login.headers.get('location')).searchParams.get('state');
    const callback = await get(`/auth/github/callback?code=good-code&state=${state}`, {
      Cookie: cookieHeader(login),
    });
    assert.strictEqual(callback.status, 302);
    return cookieHeader(callback);
  };

  it('serves a home page with the API docs built from the generators', async () => {
    const res = await get('/');
    assert.strictEqual(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/html/);
    assert.match(res.headers.get('content-security-policy'), /default-src 'none'/);
    const html = await res.text();
    assert.match(html, /Fake &lt;b&gt;bold&lt;\/b&gt;/, 'titles are escaped');
    assert.match(html, /POST \/v1\/fake/);
    assert.match(html, /<code>size<\/code><\/td><td>integer 1–3/);
    assert.match(html, /<code>a<\/code> · <code>b<\/code>/);
    assert.match(html, /Makes <code>fake<\/code> images/);
    assert.match(html, /Sign in with GitHub/);
    assert.match(html, /src="\/examples\/fake"/);
  });

  it('serves an OpenAPI spec', async () => {
    const spec = await (await get('/openapi.json')).json();
    assert.strictEqual(spec.openapi, '3.1.0');
    assert.deepStrictEqual(spec.servers, [{ url: PUBLIC }]);
    const op = spec.paths['/v1/fake'].post;
    const schema = op.requestBody.content['application/json'].schema;
    assert.deepStrictEqual(schema.required, ['text']);
    assert.deepStrictEqual(schema.properties.size, {
      type: 'integer',
      description: 'How big.',
      minimum: 1,
      maximum: 3,
    });
    assert.ok(op.responses[429]);
    assert.ok(spec.paths['/i/{file}']);
  });

  it('serves example images by redirecting to the stored image', async () => {
    const res = await get('/examples/fake');
    assert.strictEqual(res.status, 302);
    const image = await get(res.headers.get('location'));
    assert.strictEqual(image.status, 200);
    assert.ok(Buffer.from(await image.arrayBuffer()).equals(PNG));
    assert.strictEqual((await get('/examples/nope')).status, 404);
  });

  it('sends people to GitHub to sign in, with a state cookie', async () => {
    const res = await get('/login');
    assert.strictEqual(res.status, 302);
    const location = new URL(res.headers.get('location'));
    assert.strictEqual(
      location.origin + location.pathname,
      'https://github.com/login/oauth/authorize'
    );
    assert.strictEqual(location.searchParams.get('client_id'), 'client-id');
    assert.strictEqual(location.searchParams.get('redirect_uri'), `${PUBLIC}/auth/github/callback`);
    assert.ok(location.searchParams.get('state'));
    const [cookie] = res.headers.getSetCookie();
    assert.match(cookie, /^silly_oauth_state=.+HttpOnly; SameSite=Lax; Max-Age=600; Secure$/);
  });

  it('refuses a callback whose state does not match', async () => {
    const login = await get('/login');
    const res = await get('/auth/github/callback?code=good-code&state=forged', {
      Cookie: cookieHeader(login),
    });
    assert.strictEqual(res.status, 400);
    assert.match(await res.text(), /expired or was not started here/);
    assert.strictEqual((await get('/auth/github/callback?code=good-code&state=x')).status, 400);
  });

  it('refuses a callback GitHub did not accept', async () => {
    const login = await get('/login');
    const state = new URL(login.headers.get('location')).searchParams.get('state');
    const res = await get(`/auth/github/callback?code=bad-code&state=${state}`, {
      Cookie: cookieHeader(login),
    });
    assert.strictEqual(res.status, 400);
  });

  it('sends signed-out visitors from /account to sign in', async () => {
    const res = await get('/account');
    assert.strictEqual(res.status, 302);
    assert.strictEqual(res.headers.get('location'), '/login');
  });

  it('ignores a tampered session cookie', async () => {
    const cookie = await signIn();
    const tampered = cookie.replace(/silly_session=([^.]+)/, (m, body) => `silly_session=${body}x`);
    assert.strictEqual((await get('/account', { Cookie: tampered })).status, 302);
  });

  it('lets a signed-in user make a key once, use it, hit the limit and revoke it', async () => {
    const cookie = await signIn();
    const account = await get('/account', { Cookie: cookie });
    assert.strictEqual(account.status, 200);
    const page = await account.text();
    assert.match(page, /@octo&lt;cat&gt;/, 'login is escaped');
    assert.doesNotMatch(page, /octo<cat>/);

    // Making a key shows it once, in the response.
    const made = await post('/account/keys', { Cookie: cookie });
    assert.strictEqual(made.status, 200);
    const key = /silly_4242_[A-Za-z0-9_-]{32}/.exec(await made.text())[0];
    assert.ok(!(await (await get('/account', { Cookie: cookie })).text()).includes(key));
    assert.ok(!JSON.stringify(logs).includes(key), 'the key is never logged');

    // The key makes images, and requests are logged by GitHub login.
    const make = () =>
      fetch(`${base}/v1/fake`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: '{"text":"hi"}',
      });
    assert.strictEqual((await make()).status, 200);
    assert.strictEqual(logs.find(e => e.path === '/v1/fake').key, 'gh:octo<cat>');

    // Capacity is 3 in this test.
    assert.strictEqual((await make()).status, 200);
    assert.strictEqual((await make()).status, 200);
    const limited = await make();
    assert.strictEqual(limited.status, 429);
    assert.ok(Number(limited.headers.get('retry-after')) > 0);

    // Configured keys aren't rate-limited.
    for (let i = 0; i < 5; i++) {
      const res = await fetch(`${base}/v1/fake`, {
        method: 'POST',
        headers: { Authorization: 'Bearer admin-key' },
        body: '{"text":"hi"}',
      });
      assert.strictEqual(res.status, 200);
    }

    // Revoking it stops it working.
    const id = /\/account\/keys\/([0-9a-f]{12})\/revoke/.exec(
      await (await get('/account', { Cookie: cookie })).text()
    )[1];
    const revoked = await post(`/account/keys/${id}/revoke`, { Cookie: cookie });
    assert.strictEqual(revoked.status, 303);
    assert.strictEqual((await make()).status, 401);
  });

  it('refuses account form posts from other sites', async () => {
    const cookie = await signIn();
    const res = await post('/account/keys', { Cookie: cookie, Origin: 'https://evil.example' });
    assert.strictEqual(res.status, 403);
    const noOrigin = await fetch(`${base}/account/keys`, {
      method: 'POST',
      headers: { Cookie: cookie },
      redirect: 'manual',
    });
    assert.strictEqual(noOrigin.status, 403);
  });

  it('signs out', async () => {
    const cookie = await signIn();
    const res = await post('/logout', { Cookie: cookie });
    assert.strictEqual(res.status, 303);
    assert.match(res.headers.getSetCookie()[0], /^silly_session=; .*Max-Age=0/);
  });
});

describe('site without sign-in configured', () => {
  it('says keys are by request, and has no sign-in', async () => {
    const app = createApp({
      store: createMemoryStore(),
      generators: { fake: fakeGenerator },
      apiKeys: ['k'],
      publicUrl: PUBLIC,
      log: () => {},
    });
    const server = createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
      const html = await (await fetch(`${base}/`)).text();
      assert.match(html, /given out by request/);
      assert.doesNotMatch(html, /href="\/login"/);
      assert.strictEqual((await fetch(`${base}/login`, { redirect: 'manual' })).status, 404);
      assert.strictEqual((await fetch(`${base}/account`, { redirect: 'manual' })).status, 404);
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });
});
