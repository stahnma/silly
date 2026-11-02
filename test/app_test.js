// The handler, run on a real HTTP server with an in-memory store and a fake
// generator, so nothing leaves the machine.
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { createServer } from 'node:http';
import { connect } from 'node:net';
import { createApp, imageId, BadRequest, UpstreamError } from '../src/app.js';
import { createMemoryStore } from '../src/store.js';
import { Busy } from '../src/limiter.js';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const DAY = 24 * 60 * 60 * 1000;

describe('app', () => {
  let server;
  let base;
  let store;
  let clock;
  let logs;
  let renders;

  const fake = {
    contentType: 'image/png',
    docs: {
      title: 'Fake',
      summary: 'A fake generator.',
      fields: [{ name: 'text', type: 'string', required: true, description: 'Some text.' }],
      example: { text: 'example' },
    },
    validate(input) {
      if (!input.text) throw new BadRequest('text is required');
      if (input.text === 'upstream') return { text: 'upstream' };
      return { text: input.text };
    },
    async render({ text }) {
      renders.push(text);
      if (text === 'slow') await new Promise(resolve => setTimeout(resolve, 50));
      if (text === 'busy') throw new Busy('silly is busy; try again shortly');
      if (text === 'upstream') throw new UpstreamError('the other site is down');
      if (text === 'crash') throw new Error('boom');
      return PNG;
    },
  };

  before(async () => {
    clock = { now: Date.parse('2026-11-01T00:00:00Z') };
    store = createMemoryStore({ now: () => clock.now });
    const app = createApp({
      store,
      generators: { fake },
      apiKeys: ['old-key', 'new-key'],
      publicUrl: 'https://silly.example/',
      log: entry => logs.push(entry),
      now: () => clock.now,
    });
    server = createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  after(() => new Promise(resolve => server.close(resolve)));
  beforeEach(() => {
    logs = [];
    renders = [];
  });

  const make = (body, key = 'new-key') =>
    fetch(`${base}/v1/fake`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });

  it('makes an image, stores it and returns its URL', async () => {
    const res = await make({ text: 'hello' });
    assert.strictEqual(res.status, 200);
    const id = imageId('fake', { text: 'hello' });
    assert.deepStrictEqual(await res.json(), { url: `https://silly.example/i/${id}.png`, id });
    assert.deepStrictEqual(renders, ['hello']);
    assert.ok(store.objects.has(`${id}.png`));
    assert.strictEqual(logs.at(-1).cached, false);
    assert.strictEqual(logs.at(-1).key, 1);
  });

  it('returns the stored image for a repeat request without making it again', async () => {
    await make({ text: 'again' });
    renders = [];
    const res = await make({ text: 'again' }, 'old-key');
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(renders, []);
    assert.strictEqual(logs.at(-1).cached, true);
    assert.strictEqual(logs.at(-1).key, 0);
  });

  it('makes an image once when the same request arrives while it is being made', async () => {
    const [a, b] = await Promise.all([make({ text: 'slow' }), make({ text: 'slow' })]);
    assert.strictEqual(a.status, 200);
    assert.strictEqual(b.status, 200);
    assert.deepStrictEqual(renders, ['slow']);
  });

  it('says 503 with Retry-After when too busy to make an image', async () => {
    const res = await make({ text: 'busy' });
    assert.strictEqual(res.status, 503);
    assert.ok(Number(res.headers.get('retry-after')) > 0);
  });

  it('answers a request path that is not a URL with a 400, and keeps running', async () => {
    const status = await new Promise((resolve, reject) => {
      const socket = connect(server.address().port, '127.0.0.1', () =>
        socket.write('GET //[ HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n')
      );
      socket.once('data', d => resolve(d.toString().split(' ')[1]));
      socket.on('error', reject);
    });
    assert.strictEqual(status, '400');
    assert.strictEqual((await fetch(`${base}/healthz`)).status, 200);
  });

  it('gives the same id whatever order the parameters are in', () => {
    assert.strictEqual(imageId('fake', { a: 1, b: 2 }), imageId('fake', { b: 2, a: 1 }));
    assert.notStrictEqual(imageId('fake', { a: 1 }), imageId('other', { a: 1 }));
  });

  it('serves stored images publicly, with long-lived caching', async () => {
    const { url, id } = await (await make({ text: 'serve me' })).json();
    const res = await fetch(url.replace('https://silly.example', base));
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('content-type'), 'image/png');
    assert.match(res.headers.get('cache-control'), /immutable/);
    assert.strictEqual(res.headers.get('etag'), `"${id}"`);
    assert.strictEqual(res.headers.get('x-content-type-options'), 'nosniff');
    assert.ok(Buffer.from(await res.arrayBuffer()).equals(PNG));
  });

  it('resets last-modified when serving an image more than a day old', async () => {
    const { id } = await (await make({ text: 'old' })).json();
    const object = store.objects.get(`${id}.png`);
    const made = object.lastModified.getTime();

    clock.now += DAY / 2;
    await fetch(`${base}/i/${id}.png`);
    assert.strictEqual(object.lastModified.getTime(), made, 'touched too soon');
    assert.strictEqual(logs.at(-1).touched, undefined);

    clock.now += DAY;
    await fetch(`${base}/i/${id}.png`);
    assert.strictEqual(object.lastModified.getTime(), clock.now);
    assert.strictEqual(logs.at(-1).touched, true);
  });

  it('404s for images that do not exist, and never makes them', async () => {
    const res = await fetch(`${base}/i/${'0'.repeat(32)}.png`);
    assert.strictEqual(res.status, 404);
    assert.deepStrictEqual(renders, []);
    assert.strictEqual((await fetch(`${base}/i/not-an-id.png`)).status, 404);
  });

  it('needs a known API key to make images', async () => {
    assert.strictEqual((await make({ text: 'x' }, 'wrong')).status, 401);
    const res = await fetch(`${base}/v1/fake`, { method: 'POST', body: '{"text":"x"}' });
    assert.strictEqual(res.status, 401);
    assert.deepStrictEqual(renders, []);
    assert.ok(!JSON.stringify(logs).includes('wrong'), 'the key was logged');
  });

  it('rejects bad input with a 400', async () => {
    let res = await make({});
    assert.strictEqual(res.status, 400);
    assert.deepStrictEqual(await res.json(), { error: 'text is required' });
    res = await make('{not json');
    assert.strictEqual(res.status, 400);
  });

  it('rejects oversized bodies with a 413', async () => {
    const res = await make({ text: 'x'.repeat(20000) });
    assert.strictEqual(res.status, 413);
  });

  it('reports generator failures as 502, and other errors as 500 without details', async () => {
    let res = await make({ text: 'upstream' });
    assert.strictEqual(res.status, 502);
    assert.deepStrictEqual(await res.json(), { error: 'the other site is down' });

    res = await make({ text: 'crash' });
    assert.strictEqual(res.status, 500);
    assert.deepStrictEqual(await res.json(), { error: 'internal error' });
    assert.match(logs.at(-1).error, /boom/);
  });

  it('404s for unknown generators and paths', async () => {
    const res = await fetch(`${base}/v1/nope`, {
      method: 'POST',
      headers: { Authorization: 'Bearer new-key' },
      body: '{}',
    });
    assert.strictEqual(res.status, 404);
    assert.strictEqual((await fetch(`${base}/nope`)).status, 404);
    assert.strictEqual((await fetch(`${base}/healthz`)).status, 200);
  });

  it('logs each request', async () => {
    await fetch(`${base}/healthz`, {
      headers: { 'User-Agent': 'Slackbot 1.0', 'Fly-Client-IP': '1.2.3.4' },
    });
    const entry = logs.at(-1);
    assert.strictEqual(entry.path, '/healthz');
    assert.strictEqual(entry.status, 200);
    assert.strictEqual(entry.ua, 'Slackbot 1.0');
    // No client IP header is configured, so the header is ignored.
    assert.match(entry.ip, /127\.0\.0\.1$/);
    assert.strictEqual(typeof entry.ms, 'number');
  });
});

describe('client IP in logs', () => {
  // A request to a fresh app with the given header configured; the logged IP.
  const loggedIp = async (clientIpHeader, headers) => {
    const logs = [];
    const app = createApp({
      store: createMemoryStore(),
      generators: {},
      apiKeys: ['k'],
      publicUrl: 'https://silly.example',
      clientIpHeader,
      log: entry => logs.push(entry),
    });
    const server = createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      await fetch(`http://127.0.0.1:${server.address().port}/healthz`, { headers });
      return logs.at(-1).ip;
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  };

  it('uses a configured header, case-insensitively', async () => {
    assert.strictEqual(await loggedIp('Fly-Client-IP', { 'Fly-Client-IP': '1.2.3.4' }), '1.2.3.4');
    assert.strictEqual(
      await loggedIp('cf-connecting-ip', { 'CF-Connecting-IP': '2001:db8::1' }),
      '2001:db8::1'
    );
  });

  it("uses X-Forwarded-For's last entry, the one the proxy added", async () => {
    assert.strictEqual(
      await loggedIp('X-Forwarded-For', { 'X-Forwarded-For': '6.6.6.6, 10.0.0.1, 5.6.7.8' }),
      '5.6.7.8'
    );
  });

  it('falls back to the connecting address when the header is missing', async () => {
    assert.match(await loggedIp('Fly-Client-IP', {}), /127\.0\.0\.1$/);
    assert.match(await loggedIp('X-Forwarded-For', { 'X-Forwarded-For': ' , ' }), /127\.0\.0\.1$/);
  });
});
