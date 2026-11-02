// Entry point: read configuration from the environment and listen.
//
//   SILLY_API_KEYS   - comma-separated keys allowed to make images (required).
//                      More than one lets a key be rotated without downtime.
//   SILLY_PUBLIC_URL - base URL images are served from, e.g. https://silly.fly.dev
//   PORT             - default 8080
//   SILLY_CLIENT_IP_HEADER - the header a proxy in front of silly puts the
//                      client's address in (e.g. Fly-Client-IP, X-Forwarded-For),
//                      for the logs; without it, the connecting address
//   BUCKET_NAME      - S3 bucket for images. `fly storage create` sets it, along
//                      with AWS_ENDPOINT_URL_S3, AWS_REGION, AWS_ACCESS_KEY_ID and
//                      AWS_SECRET_ACCESS_KEY, which the AWS SDK reads itself.
//                      Without it, images are kept in memory (local development).
//   GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET - a GitHub OAuth app, for signing in
//                      to get an API key (see README)
//   SILLY_SESSION_SECRET - signs session cookies; a long random string
//                      Without all three, sign-in is off and keys are by request.

import { createServer } from 'node:http';
import { createApp } from './app.js';
import { createS3Store, createMemoryStore } from './store.js';
import { createKeys } from './keys.js';
import { createAuth } from './auth.js';
import { createRateLimit } from './ratelimit.js';
import { createAwyiss } from './generators/awyiss.js';
import { createOrly } from './generators/orly.js';
import { createMustache } from './generators/mustache.js';

const apiKeys = (process.env.SILLY_API_KEYS || '')
  .split(',')
  .map(k => k.trim())
  .filter(Boolean);
if (apiKeys.length === 0) {
  console.error('SILLY_API_KEYS is not set; refusing to start.');
  process.exit(1);
}

const port = Number(process.env.PORT || 8080);
const publicUrl = process.env.SILLY_PUBLIC_URL || `http://localhost:${port}`;
const bucket = process.env.BUCKET_NAME;
if (!bucket) console.warn('BUCKET_NAME is not set; storing images in memory.');

const { GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, SILLY_SESSION_SECRET } = process.env;
const signIn = Boolean(GITHUB_CLIENT_ID && GITHUB_CLIENT_SECRET && SILLY_SESSION_SECRET);
if (!signIn) console.warn('GitHub sign-in is not configured; keys are by request only.');

const store = bucket ? createS3Store({ bucket }) : createMemoryStore();
const app = createApp({
  store,
  generators: { awyiss: createAwyiss(), orly: createOrly(), mustache: createMustache() },
  apiKeys,
  publicUrl,
  keys: createKeys({ store }),
  auth: signIn
    ? createAuth({
        clientId: GITHUB_CLIENT_ID,
        clientSecret: GITHUB_CLIENT_SECRET,
        secret: SILLY_SESSION_SECRET,
        publicUrl,
      })
    : null,
  rateLimit: createRateLimit(),
  clientIpHeader: process.env.SILLY_CLIENT_IP_HEADER || null,
});

const server = createServer(app);
server.listen(port, () => {
  console.log(
    JSON.stringify({ msg: 'listening', port, publicUrl, store: bucket ? 's3' : 'memory', signIn })
  );
});

// Fly sends SIGINT on deploys and scale-downs; finish in-flight requests.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
