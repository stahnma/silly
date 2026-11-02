// The S3 store against a mocked AWS SDK client: checks the S3 calls it makes.
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { mockClient } from 'aws-sdk-client-mock';
import {
  S3Client,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  CopyObjectCommand,
} from '@aws-sdk/client-s3';
import { createS3Store } from '../src/store.js';

const notFound = name =>
  Object.assign(new Error(name), { name, $metadata: { httpStatusCode: 404 } });

describe('S3 store', () => {
  const client = new S3Client({ region: 'auto' });
  const s3 = mockClient(client);
  const store = createS3Store({ bucket: 'silly-images', client });
  beforeEach(() => s3.reset());

  it('gets an object with its type and last-modified time', async () => {
    const lastModified = new Date('2026-10-01T00:00:00Z');
    s3.on(GetObjectCommand, { Bucket: 'silly-images', Key: 'abc.png' }).resolves({
      Body: { transformToByteArray: async () => new Uint8Array([1, 2, 3]) },
      ContentType: 'image/png',
      LastModified: lastModified,
    });
    assert.deepStrictEqual(await store.get('abc.png'), {
      body: Buffer.from([1, 2, 3]),
      contentType: 'image/png',
      lastModified,
    });
  });

  it('returns null or false for missing objects, and rethrows other errors', async () => {
    s3.on(GetObjectCommand).rejects(notFound('NoSuchKey'));
    s3.on(HeadObjectCommand).rejects(notFound('NotFound'));
    assert.strictEqual(await store.get('missing.png'), null);
    assert.strictEqual(await store.exists('missing.png'), false);

    s3.on(HeadObjectCommand).rejects(Object.assign(new Error('denied'), { name: 'AccessDenied' }));
    await assert.rejects(store.exists('x.png'), /denied/);
  });

  it('checks existence with HEAD', async () => {
    s3.on(HeadObjectCommand, { Bucket: 'silly-images', Key: 'abc.png' }).resolves({});
    assert.strictEqual(await store.exists('abc.png'), true);
  });

  it('puts objects with their content type', async () => {
    s3.on(PutObjectCommand).resolves({});
    await store.put('abc.png', Buffer.from([1]), 'image/png');
    const [call] = s3.commandCalls(PutObjectCommand);
    assert.deepStrictEqual(call.args[0].input, {
      Bucket: 'silly-images',
      Key: 'abc.png',
      Body: Buffer.from([1]),
      ContentType: 'image/png',
    });
  });

  it('touches an object by copying it onto itself with replaced metadata', async () => {
    s3.on(CopyObjectCommand).resolves({});
    await store.touch('abc.png', 'image/png');
    const { input } = s3.commandCalls(CopyObjectCommand)[0].args[0];
    assert.strictEqual(input.Bucket, 'silly-images');
    assert.strictEqual(input.Key, 'abc.png');
    assert.strictEqual(input.CopySource, 'silly-images/abc.png');
    assert.strictEqual(input.MetadataDirective, 'REPLACE');
    assert.strictEqual(input.ContentType, 'image/png');
    assert.ok(input.Metadata.touched);
  });
});
