// Sets the bucket's expiry rule: delete images 180 days after last-modified.
// The service resets last-modified when it serves an image (at most once a
// day), so in practice images expire 180 days after they were last used.
//
// Run where the bucket's credentials are set, e.g. on the fly machine:
//   fly ssh console -C "node scripts/set-lifecycle.js"
// Pass --show to print the current rules without changing them.

import {
  S3Client,
  GetBucketLifecycleConfigurationCommand,
  PutBucketLifecycleConfigurationCommand,
} from '@aws-sdk/client-s3';

const DAYS = 180;
const bucket = process.env.BUCKET_NAME;
if (!bucket) {
  console.error('BUCKET_NAME is not set.');
  process.exit(1);
}
const client = new S3Client({});

if (!process.argv.includes('--show')) {
  await client.send(
    new PutBucketLifecycleConfigurationCommand({
      Bucket: bucket,
      LifecycleConfiguration: {
        Rules: [
          {
            ID: 'expire-unused-images',
            Status: 'Enabled',
            Filter: { Prefix: '' },
            Expiration: { Days: DAYS },
          },
        ],
      },
    })
  );
  console.log(`Set ${bucket} to expire objects ${DAYS} days after last-modified.`);
}
const { Rules } = await client.send(new GetBucketLifecycleConfigurationCommand({ Bucket: bucket }));
console.log(JSON.stringify(Rules, null, 2));
