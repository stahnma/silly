// Signed-in users' API keys, on the in-memory store.
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createKeys, KeyLimitError, MAX_KEYS_PER_USER } from '../src/keys.js';
import { createMemoryStore } from '../src/store.js';

const DAY = 24 * 60 * 60 * 1000;
const setup = () => {
  const clock = { now: Date.parse('2026-11-01T00:00:00Z') };
  const store = createMemoryStore({ now: () => clock.now });
  return { clock, store, keys: createKeys({ store, now: () => clock.now }) };
};

describe('keys', () => {
  it('makes a key that verifies, and stores only its hash', async () => {
    const { store, keys } = setup();
    const { key, record } = await keys.create({ githubId: '42', login: 'octocat' });
    assert.match(key, /^silly_42_[A-Za-z0-9_-]{32}$/);
    assert.deepStrictEqual(
      { ...record, id: undefined, created: undefined },
      { id: undefined, githubId: '42', login: 'octocat', hint: key.slice(-4), created: undefined }
    );
    const [stored] = [...store.objects.keys()];
    assert.match(stored, /^keys\/42\/[0-9a-f]{64}\.json$/);
    assert.ok(
      !JSON.stringify([...store.objects.values()].map(o => o.body.toString())).includes(key)
    );

    const verified = await keys.verify(key);
    assert.strictEqual(verified.login, 'octocat');
    assert.strictEqual(verified.id, record.id);
  });

  it('rejects keys that are malformed, unknown or for someone else', async () => {
    const { keys } = setup();
    const { key } = await keys.create({ githubId: '42', login: 'octocat' });
    for (const token of [
      '',
      'nope',
      key.slice(0, -1) + (key.endsWith('A') ? 'B' : 'A'),
      key.replace('silly_42_', 'silly_43_'),
    ]) {
      assert.strictEqual(await keys.verify(token), null, token);
    }
  });

  it('lists a user’s keys newest first, and only theirs', async () => {
    const { clock, keys } = setup();
    await keys.create({ githubId: '42', login: 'octocat' });
    clock.now += 1000;
    const { record: second } = await keys.create({ githubId: '42', login: 'octocat' });
    await keys.create({ githubId: '7', login: 'someone' });
    const list = await keys.list('42');
    assert.strictEqual(list.length, 2);
    assert.strictEqual(list[0].id, second.id);
    assert.ok(list.every(k => k.login === 'octocat'));
  });

  it('allows a limited number of keys per user', async () => {
    const { keys } = setup();
    for (let i = 0; i < MAX_KEYS_PER_USER; i++) await keys.create({ githubId: '42', login: 'a' });
    await assert.rejects(keys.create({ githubId: '42', login: 'a' }), KeyLimitError);
  });

  it('revokes a key right away, and only the owner can', async () => {
    const { keys } = setup();
    const { key, record } = await keys.create({ githubId: '42', login: 'octocat' });
    assert.ok(await keys.verify(key));
    assert.strictEqual(await keys.revoke('7', record.id), false, "someone else's key");
    assert.strictEqual(await keys.revoke('42', 'not-an-id'), false);
    assert.strictEqual(await keys.revoke('42', record.id), true);
    assert.strictEqual(await keys.verify(key), null);
    assert.deepStrictEqual(await keys.list('42'), []);
  });

  it('marks a key used at most once a day', async () => {
    const { clock, store, keys } = setup();
    const { key } = await keys.create({ githubId: '42', login: 'octocat' });
    const object = [...store.objects.values()][0];
    const made = object.lastModified.getTime();

    clock.now += DAY / 2;
    await keys.verify(key);
    assert.strictEqual(object.lastModified.getTime(), made);

    clock.now += DAY;
    await keys.verify(key);
    // The touch is fire-and-forget.
    await new Promise(resolve => setImmediate(resolve));
    assert.strictEqual(object.lastModified.getTime(), clock.now);
  });
});
