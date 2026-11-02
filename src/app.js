// The HTTP handler. Everything it talks to (storage, generators, keys, the
// clock, the logger) is passed in, so tests can run it without the network.
//
//   POST /v1/<generator>  - make an image (or find the one already made) and
//                           return its URL. Needs an API key.
//   GET  /i/<id>.<ext>    - serve a stored image. Public, read-only.
//   GET  /healthz         - liveness check.
//
// And the website (src/site.js): the home page with the API docs,
// /openapi.json, /examples/<generator> (each generator's example image),
// signing in with GitHub (/login, /auth/github/callback, /logout) and
// /account, where signed-in users make and revoke their API keys.

import { createHash, timingSafeEqual } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { renderHome, renderAccount, renderMessage, openApi } from './site.js';
import { KeyLimitError, MAX_KEYS_PER_USER } from './keys.js';

const MAX_BODY_BYTES = 16 * 1024;
const DAY_MS = 24 * 60 * 60 * 1000;
const EXTENSIONS = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif' };
const IMAGE_PATH = /^\/i\/([0-9a-f]{32})\.(png|jpg|gif)$/;

// A generator rejects bad input by throwing one of these; it becomes a 400.
export class BadRequest extends Error {}

// Raised by a generator when the service it relies on fails; it becomes a 502.
export class UpstreamError extends Error {}

const sha256 = value => createHash('sha256').update(value).digest();

// The image id: the same generator and parameters always give the same id,
// so a repeated request finds the stored image instead of making a new one.
// Parameters are sorted so key order doesn't matter.
export const imageId = (generator, params) => {
  const canonical = JSON.stringify([
    generator,
    Object.fromEntries(Object.entries(params).sort(([a], [b]) => a.localeCompare(b))),
  ]);
  return sha256(canonical).toString('hex').slice(0, 32);
};

const keyChecker = keys => {
  const digests = keys.map(sha256);
  // Compare digests, which have a fixed length, in constant time.
  return candidate => {
    if (!candidate) return null;
    const digest = sha256(candidate);
    const index = digests.findIndex(d => timingSafeEqual(d, digest));
    return index < 0 ? null : index;
  };
};

const readBody = req =>
  new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      if (size > MAX_BODY_BYTES) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        // Stop keeping it, but let the rest arrive so the 413 reaches the
        // client; the response closes the connection.
        reject(Object.assign(new Error('request body too large'), { status: 413 }));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });

// The site's fonts (assets/site/fonts), read once.
const FONT_DIR = new URL('../assets/site/fonts/', import.meta.url);
const FONTS = new Map(
  readdirSync(FONT_DIR)
    .filter(f => f.endsWith('.woff2'))
    .map(f => [f, readFileSync(new URL(f, FONT_DIR))])
);

// The site's icons (assets/site, made by scripts/make-favicon.js), read once.
const ICONS = new Map(
  [
    ['/favicon.svg', 'favicon.svg', 'image/svg+xml'],
    ['/favicon.ico', 'favicon.ico', 'image/x-icon'],
    ['/apple-touch-icon.png', 'apple-touch-icon.png', 'image/png'],
  ].map(([path, file, type]) => [
    path,
    { type, body: readFileSync(new URL(`../assets/site/${file}`, import.meta.url)) },
  ])
);

// Pages are self-contained: no scripts, no outside resources.
const HTML_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Content-Security-Policy':
    "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; font-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'Cache-Control': 'no-store',
};

const sendHtml = (res, status, html, headers = {}) => {
  res.writeHead(status, { ...HTML_HEADERS, 'Content-Length': Buffer.byteLength(html), ...headers });
  res.end(html);
};

const redirect = (res, location, status = 302, headers = {}) => {
  res.writeHead(status, { Location: location, 'Content-Length': 0, ...headers });
  res.end();
};

const sendJson = (res, status, body) => {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
  });
  res.end(text);
};

export const createApp = ({
  store,
  generators,
  apiKeys,
  publicUrl,
  // Signed-in users' keys (src/keys.js) and GitHub sign-in (src/auth.js);
  // without auth, the site says keys are by request.
  keys = null,
  auth = null,
  rateLimit = null,
  // The header a trusted proxy puts the client's address in, e.g.
  // 'fly-client-ip' or 'x-forwarded-for'; without one, the connecting address.
  clientIpHeader = null,
  log = entry => console.log(JSON.stringify(entry)),
  now = () => Date.now(),
  touchAfterMs = DAY_MS,
}) => {
  const checkKey = keyChecker(apiKeys);
  const base = publicUrl.replace(/\/+$/, '');
  const baseOrigin = new URL(base).origin;
  const ipHeader = clientIpHeader?.toLowerCase();

  // The client's address, for the logs. A header is only used when configured,
  // since clients can send any header they like. For X-Forwarded-For, the last
  // entry is the one the proxy in front of silly added; earlier ones could be
  // made up.
  const clientIp = req => {
    const value = ipHeader && req.headers[ipHeader];
    if (value) {
      const parts = String(value)
        .split(',')
        .map(p => p.trim())
        .filter(Boolean);
      if (parts.length) return ipHeader === 'x-forwarded-for' ? parts[parts.length - 1] : parts[0];
    }
    return req.socket?.remoteAddress;
  };
  const limits = { perHour: rateLimit?.limits.perHour ?? 0, maxKeys: MAX_KEYS_PER_USER };

  // Reset an image's last-modified time so the bucket's expiry rule counts
  // from its last use. At most once a day per image; failures only get logged.
  const touch = (key, contentType, lastModified, entry) => {
    if (lastModified && now() - lastModified.getTime() < touchAfterMs) return;
    entry.touched = true;
    store.touch(key, contentType).catch(err => {
      log({ t: new Date(now()).toISOString(), msg: 'touch failed', key, error: err.message });
    });
  };

  const serveImage = async (req, res, entry, match) => {
    const key = `${match[1]}.${match[2]}`;
    entry.id = match[1];
    const object = await store.get(key);
    if (!object) {
      sendJson(res, 404, { error: 'no such image' });
      return;
    }
    touch(key, object.contentType, object.lastModified, entry);
    res.writeHead(200, {
      'Content-Type': object.contentType,
      'Content-Length': object.body.length,
      // An id always names the same image.
      'Cache-Control': 'public, max-age=31536000, immutable',
      ETag: `"${match[1]}"`,
    });
    res.end(req.method === 'HEAD' ? undefined : object.body);
  };

  // Find the stored image for these parameters, or make and store it.
  const makeImage = async (name, generator, params, entry) => {
    const id = imageId(name, params);
    entry.id = id;
    const key = `${id}.${EXTENSIONS[generator.contentType]}`;
    if (await store.exists(key)) {
      entry.cached = true;
    } else {
      const started = now();
      const body = await generator.render(params);
      entry.renderMs = now() - started;
      await store.put(key, body, generator.contentType);
      entry.cached = false;
    }
    return { id, key, url: `${base}/i/${key}` };
  };

  // Each generator's example image, made once (on first view) like any other.
  const examples = new Map();
  const serveExample = async (res, entry, name) => {
    const generator = generators[name];
    if (!generator) {
      sendJson(res, 404, { error: 'no such example' });
      return;
    }
    if (!examples.has(name)) {
      const making = makeImage(name, generator, generator.validate(generator.docs.example), entry);
      examples.set(name, making);
      making.catch(() => examples.delete(name));
    }
    const { key } = await examples.get(name);
    redirect(res, `/i/${key}`, 302, { 'Cache-Control': 'public, max-age=3600' });
  };

  // Form posts must come from silly's own pages (SameSite cookies do most of
  // this; the Origin check covers the rest).
  const fromThisSite = req => {
    const origin =
      req.headers.origin || (req.headers.referer && new URL(req.headers.referer).origin);
    return origin === baseOrigin;
  };

  const pageContext = req => ({ user: auth?.session(req) ?? null, signInEnabled: Boolean(auth) });

  const account = async (req, res, entry, path) => {
    const user = auth?.session(req);
    if (!auth) {
      sendHtml(
        res,
        404,
        renderMessage({
          title: 'No accounts',
          message: 'Sign-in is not set up on this server.',
          ...pageContext(req),
        })
      );
      return;
    }
    if (!user) {
      redirect(res, '/login');
      return;
    }
    entry.user = user.login;
    const show = async (status, extra = {}) =>
      sendHtml(
        res,
        status,
        renderAccount({ user, keys: await keys.list(user.githubId), base, limits, ...extra })
      );

    if (req.method === 'GET' && path === '/account') {
      await show(200);
      return;
    }
    if (req.method !== 'POST') {
      sendJson(res, 404, { error: 'not found' });
      return;
    }
    if (!fromThisSite(req)) {
      sendHtml(
        res,
        403,
        renderMessage({
          title: 'Not allowed',
          message: 'That form came from another site.',
          ...pageContext(req),
        })
      );
      return;
    }
    if (path === '/account/keys') {
      try {
        const { key, record } = await keys.create(user);
        log({
          t: new Date(now()).toISOString(),
          msg: 'key created',
          user: user.login,
          keyId: record.id,
        });
        // Shown in this response only; never in a URL or a log.
        await show(200, { newKey: key });
      } catch (err) {
        if (!(err instanceof KeyLimitError)) throw err;
        await show(400, { notice: `You already have ${limits.maxKeys} keys; revoke one first.` });
      }
      return;
    }
    const revoke = /^\/account\/keys\/([0-9a-f]{12})\/revoke$/.exec(path);
    if (revoke) {
      if (await keys.revoke(user.githubId, revoke[1])) {
        log({
          t: new Date(now()).toISOString(),
          msg: 'key revoked',
          user: user.login,
          keyId: revoke[1],
        });
      }
      redirect(res, '/account', 303);
      return;
    }
    sendJson(res, 404, { error: 'not found' });
  };

  const signIn = async (req, res, entry, path, query) => {
    if (!auth) {
      sendHtml(
        res,
        404,
        renderMessage({
          title: 'No sign-in',
          message: 'Sign-in is not set up on this server.',
          ...pageContext(req),
        })
      );
      return;
    }
    if (path === '/login') {
      const { location, setCookie } = auth.startLogin();
      redirect(res, location, 302, { 'Set-Cookie': setCookie });
    } else if (path === '/logout') {
      if (!fromThisSite(req)) {
        sendJson(res, 403, { error: 'not allowed' });
        return;
      }
      redirect(res, '/', 303, { 'Set-Cookie': auth.logoutCookie() });
    } else {
      try {
        const { user, setCookies } = await auth.finishLogin(req, query);
        entry.user = user.login;
        log({ t: new Date(now()).toISOString(), msg: 'signed in', user: user.login });
        redirect(res, '/account', 302, { 'Set-Cookie': setCookies });
      } catch (err) {
        entry.error = err.message;
        sendHtml(
          res,
          400,
          renderMessage({
            title: "Couldn't sign you in",
            message: err.message,
            user: null,
            signInEnabled: true,
          })
        );
      }
    }
  };

  const generate = async (req, res, entry, name) => {
    const generator = generators[name];
    if (!generator) {
      sendJson(res, 404, { error: `no generator called ${name}` });
      return;
    }
    entry.generator = name;

    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    // Configured keys (by position) are unlimited; signed-in users' keys are
    // rate-limited and logged by GitHub login. Never log the key itself.
    const keyIndex = checkKey(token);
    if (keyIndex !== null) {
      entry.key = keyIndex;
    } else {
      const record = keys && (await keys.verify(token));
      if (!record) {
        sendJson(res, 401, { error: 'missing or unknown API key' });
        return;
      }
      entry.key = `gh:${record.login}`;
      const allowed = rateLimit ? rateLimit.take(record.id) : { ok: true };
      if (!allowed.ok) {
        entry.limited = true;
        res.setHeader('Retry-After', String(allowed.retryAfter));
        sendJson(res, 429, {
          error: `rate limit: ${limits.perHour} images an hour; try again in ${allowed.retryAfter}s`,
        });
        return;
      }
    }

    let input;
    try {
      input = JSON.parse((await readBody(req)) || '{}');
    } catch (err) {
      if (err.status) throw err;
      throw new BadRequest('body must be JSON');
    }
    const { id, url } = await makeImage(name, generator, generator.validate(input), entry);
    sendJson(res, 200, { url, id });
  };

  return async (req, res) => {
    const started = now();
    const path = new URL(req.url, 'http://silly').pathname;
    const entry = {
      t: new Date(started).toISOString(),
      method: req.method,
      path,
      ip: clientIp(req),
      ua: req.headers['user-agent'],
    };
    res.on('finish', () => {
      log({ ...entry, status: res.statusCode, ms: now() - started });
    });

    try {
      const query = new URL(req.url, 'http://silly').searchParams;
      const image = IMAGE_PATH.exec(path);
      const generator = /^\/v1\/([a-z0-9-]+)$/.exec(path);
      const example = /^\/examples\/([a-z0-9-]+)$/.exec(path);
      const isGet = req.method === 'GET' || req.method === 'HEAD';
      if (path === '/healthz' && req.method === 'GET') {
        sendJson(res, 200, { ok: true });
      } else if (path === '/' && isGet) {
        sendHtml(res, 200, renderHome({ base, generators, limits, ...pageContext(req) }));
      } else if (ICONS.has(path) && isGet) {
        const icon = ICONS.get(path);
        res.writeHead(200, {
          'Content-Type': icon.type,
          'Content-Length': icon.body.length,
          'Cache-Control': 'public, max-age=604800',
        });
        res.end(req.method === 'HEAD' ? undefined : icon.body);
      } else if (path.startsWith('/assets/fonts/') && isGet) {
        const font = FONTS.get(path.slice('/assets/fonts/'.length));
        if (!font) {
          sendJson(res, 404, { error: 'not found' });
        } else {
          res.writeHead(200, {
            'Content-Type': 'font/woff2',
            'Content-Length': font.length,
            'Cache-Control': 'public, max-age=604800',
          });
          res.end(req.method === 'HEAD' ? undefined : font);
        }
      } else if (path === '/openapi.json' && isGet) {
        sendJson(res, 200, openApi({ base, generators }));
      } else if (example && isGet) {
        await serveExample(res, entry, example[1]);
      } else if (
        (path === '/login' && isGet) ||
        (path === '/auth/github/callback' && isGet) ||
        (path === '/logout' && req.method === 'POST')
      ) {
        await signIn(req, res, entry, path, query);
      } else if (path === '/account' || path.startsWith('/account/')) {
        await account(req, res, entry, path);
      } else if (image && isGet) {
        await serveImage(req, res, entry, image);
      } else if (generator && req.method === 'POST') {
        await generate(req, res, entry, generator[1]);
      } else {
        sendJson(res, 404, { error: 'not found' });
      }
    } catch (err) {
      if (res.headersSent) {
        res.destroy(err);
        return;
      }
      if (err instanceof BadRequest) {
        sendJson(res, 400, { error: err.message });
      } else if (err instanceof UpstreamError) {
        entry.error = err.message;
        sendJson(res, 502, { error: err.message });
      } else if (err.status === 413) {
        res.setHeader('Connection', 'close');
        sendJson(res, 413, { error: err.message });
      } else {
        entry.error = err.stack || String(err);
        sendJson(res, 500, { error: 'internal error' });
      }
    }
  };
};
