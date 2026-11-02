// The HTTP handler. Everything it talks to (storage, generators, keys, the
// clock, the logger) is passed in, so tests can run it without the network.
//
//   POST /v1/<generator>  - make an image (or find the one already made) and
//                           return its URL. Needs an API key.
//   GET  /i/<id>.<ext>    - serve a stored image. Public, read-only.
//   GET  /healthz         - liveness check.

import { createHash, timingSafeEqual } from 'node:crypto';

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
  log = entry => console.log(JSON.stringify(entry)),
  now = () => Date.now(),
  touchAfterMs = DAY_MS,
}) => {
  const checkKey = keyChecker(apiKeys);
  const base = publicUrl.replace(/\/+$/, '');

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

  const generate = async (req, res, entry, name) => {
    const generator = generators[name];
    if (!generator) {
      sendJson(res, 404, { error: `no generator called ${name}` });
      return;
    }
    entry.generator = name;

    const auth = req.headers.authorization || '';
    const keyIndex = checkKey(auth.startsWith('Bearer ') ? auth.slice(7) : '');
    if (keyIndex === null) {
      sendJson(res, 401, { error: 'missing or unknown API key' });
      return;
    }
    // Which key was used (by position, never the key itself), for the logs.
    entry.key = keyIndex;

    let input;
    try {
      input = JSON.parse((await readBody(req)) || '{}');
    } catch (err) {
      if (err.status) throw err;
      throw new BadRequest('body must be JSON');
    }
    const params = generator.validate(input);
    const id = imageId(name, params);
    entry.id = id;

    const ext = EXTENSIONS[generator.contentType];
    const key = `${id}.${ext}`;
    const url = `${base}/i/${key}`;
    if (await store.exists(key)) {
      entry.cached = true;
    } else {
      const started = now();
      const body = await generator.render(params);
      entry.renderMs = now() - started;
      await store.put(key, body, generator.contentType);
      entry.cached = false;
    }
    sendJson(res, 200, { url, id });
  };

  return async (req, res) => {
    const started = now();
    const path = new URL(req.url, 'http://silly').pathname;
    const entry = {
      t: new Date(started).toISOString(),
      method: req.method,
      path,
      ip: req.headers['fly-client-ip'] || req.socket?.remoteAddress,
      ua: req.headers['user-agent'],
    };
    res.on('finish', () => {
      log({ ...entry, status: res.statusCode, ms: now() - started });
    });

    try {
      const image = IMAGE_PATH.exec(path);
      const generator = /^\/v1\/([a-z0-9-]+)$/.exec(path);
      if (path === '/healthz' && req.method === 'GET') {
        sendJson(res, 200, { ok: true });
      } else if (image && (req.method === 'GET' || req.method === 'HEAD')) {
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
