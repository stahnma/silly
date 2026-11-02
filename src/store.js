// Image storage. The S3 store works with Tigris and any other S3-compatible
// service (R2, AWS S3, MinIO): it uses only standard S3 calls, and the AWS SDK
// reads the endpoint and credentials from the standard AWS_* variables. The
// memory store is for local development and tests.
//
// A store has: get(key) -> {body, contentType, lastModified} | null,
// exists(key), put(key, body, contentType), and touch(key, contentType),
// which resets the last-modified time. The bucket's expiry rule counts from
// last-modified, so touching an image when it's served keeps it alive.

import {
  S3Client,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  CopyObjectCommand,
} from '@aws-sdk/client-s3';

const isNotFound = err =>
  err.name === 'NoSuchKey' || err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404;

export const createS3Store = ({ bucket, client = new S3Client({}) }) => ({
  async get(key) {
    try {
      const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      return {
        body: Buffer.from(await res.Body.transformToByteArray()),
        contentType: res.ContentType,
        lastModified: res.LastModified,
      };
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  },

  async exists(key) {
    try {
      await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      return true;
    } catch (err) {
      if (isNotFound(err)) return false;
      throw err;
    }
  },

  async put(key, body, contentType) {
    await client.send(
      new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType })
    );
  },

  // S3 objects can't be modified in place; copying one onto itself with
  // replaced metadata is the standard way to reset its last-modified time.
  async touch(key, contentType) {
    await client.send(
      new CopyObjectCommand({
        Bucket: bucket,
        Key: key,
        CopySource: `${bucket}/${encodeURIComponent(key)}`,
        MetadataDirective: 'REPLACE',
        ContentType: contentType,
        Metadata: { touched: new Date().toISOString() },
      })
    );
  },
});

export const createMemoryStore = ({ now = () => Date.now() } = {}) => {
  const objects = new Map();
  return {
    objects,
    async get(key) {
      return objects.get(key) || null;
    },
    async exists(key) {
      return objects.has(key);
    },
    async put(key, body, contentType) {
      objects.set(key, { body, contentType, lastModified: new Date(now()) });
    },
    async touch(key) {
      const object = objects.get(key);
      if (object) object.lastModified = new Date(now());
    },
  };
};
