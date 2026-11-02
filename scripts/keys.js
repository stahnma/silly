// List or revoke signed-in users' API keys. Run where the bucket's
// credentials are set, e.g. on the fly machine:
//   fly ssh console -C "node scripts/keys.js list"
//   fly ssh console -C "node scripts/keys.js revoke <key id>"
//   fly ssh console -C "node scripts/keys.js revoke-user <github login>"
// Keys made with SILLY_API_KEYS aren't listed here; change that secret instead.

import { createS3Store } from '../src/store.js';

const bucket = process.env.BUCKET_NAME;
if (!bucket) {
  console.error('BUCKET_NAME is not set.');
  process.exit(1);
}
const store = createS3Store({ bucket });

const all = async () => {
  const objects = await store.list('keys/');
  return Promise.all(
    objects.map(async o => ({
      object: o.key,
      lastUsed: o.lastModified,
      ...JSON.parse((await store.get(o.key)).body.toString('utf8')),
    }))
  );
};

const [command, arg] = process.argv.slice(2);
if (command === 'list') {
  const keys = await all();
  for (const k of keys.sort((a, b) => a.login.localeCompare(b.login))) {
    console.log(
      `${k.id}  ${k.login.padEnd(20)} created ${k.created.slice(0, 10)}  last used ${k.lastUsed.toISOString().slice(0, 10)}`
    );
  }
  console.log(`${keys.length} keys`);
} else if ((command === 'revoke' || command === 'revoke-user') && arg) {
  const doomed = (await all()).filter(k =>
    command === 'revoke' ? k.id === arg : k.login.toLowerCase() === arg.toLowerCase()
  );
  for (const k of doomed) {
    await store.delete(k.object);
    console.log(`revoked ${k.id} (${k.login})`);
  }
  if (doomed.length === 0) console.log('no matching keys');
  console.log('Other machines may accept a revoked key for up to a minute.');
} else {
  console.error('usage: node scripts/keys.js list | revoke <key id> | revoke-user <github login>');
  process.exit(1);
}
