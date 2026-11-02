// API keys for people who sign in with GitHub, kept in the image bucket.
//
// A key looks like silly_<github id>_<random>. Only its SHA-256 is stored, at
// keys/<github id>/<sha256>.json, so the bucket never holds a usable key; the
// GitHub id in the key says where to look, and listing keys/<github id>/ gives
// someone's keys. Using a key resets its object's last-modified time (at most
// once a day), so the bucket's 180-day expiry rule removes keys nobody uses.

import { createHash, randomBytes } from 'node:crypto';

export const MAX_KEYS_PER_USER = 5;
const DAY_MS = 24 * 60 * 60 * 1000;
// How long a looked-up key is trusted before reading it again; a revoked key
// stops working within this long on other machines.
const CACHE_MS = 60 * 1000;
const KEY_PATTERN = /^silly_(\d+)_([A-Za-z0-9_-]{32})$/;

const sha256 = value => createHash('sha256').update(value).digest('hex');
const objectKey = (githubId, hash) => `keys/${githubId}/${hash}.json`;

export class KeyLimitError extends Error {}

export const createKeys = ({ store, now = () => Date.now() }) => {
  const cache = new Map();

  const read = async key => {
    const object = await store.get(key);
    if (!object) return null;
    return { ...JSON.parse(object.body.toString('utf8')), lastUsed: object.lastModified };
  };

  return {
    // The signed-in user's keys, newest first. Never includes the key itself.
    async list(githubId) {
      const objects = await store.list(`keys/${githubId}/`);
      const records = await Promise.all(objects.map(o => read(o.key)));
      return records.filter(Boolean).sort((a, b) => b.created.localeCompare(a.created));
    },

    // A new key for a user. Returns the key, which is shown once and not kept.
    async create({ githubId, login }) {
      if ((await this.list(githubId)).length >= MAX_KEYS_PER_USER) {
        throw new KeyLimitError(`you can have at most ${MAX_KEYS_PER_USER} keys`);
      }
      const key = `silly_${githubId}_${randomBytes(24).toString('base64url')}`;
      const hash = sha256(key);
      const record = {
        id: hash.slice(0, 12),
        githubId: String(githubId),
        login,
        hint: key.slice(-4),
        created: new Date(now()).toISOString(),
      };
      await store.put(
        objectKey(githubId, hash),
        Buffer.from(JSON.stringify(record)),
        'application/json'
      );
      return { key, record };
    },

    // Revoke one of a user's keys by its id. False if they have no such key.
    async revoke(githubId, id) {
      if (!/^[0-9a-f]{12}$/.test(id)) return false;
      const objects = await store.list(`keys/${githubId}/`);
      const match = objects.find(o => o.key.split('/')[2].startsWith(id));
      if (!match) return false;
      await store.delete(match.key);
      cache.clear();
      return true;
    },

    // The record for a key presented to the API, or null if it isn't one.
    async verify(token) {
      const m = KEY_PATTERN.exec(token || '');
      if (!m) return null;
      const hash = sha256(token);
      const cached = cache.get(hash);
      if (cached && now() - cached.at < CACHE_MS) return cached.record;

      const key = objectKey(m[1], hash);
      const record = await read(key);
      cache.set(hash, { at: now(), record });
      if (record && now() - record.lastUsed.getTime() >= DAY_MS) {
        store.touch(key, 'application/json').catch(() => {});
      }
      return record;
    },
  };
};
