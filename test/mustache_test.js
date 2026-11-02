// Mustache me: validation, the real face detector on a fixture photo, and the
// image fetcher's protections (with a fake fetch, so nothing leaves the machine).
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { loadImage, createCanvas } from '@napi-rs/canvas';
import { createMustache } from '../src/generators/mustache.js';
import { detectFaces } from '../src/faces.js';
import { fetchImage, isBlockedAddress, FetchError } from '../src/fetch-image.js';
import { BadRequest } from '../src/app.js';

const FACE = readFileSync(new URL('fixtures/face.jpg', import.meta.url));
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff]);

describe('mustache', () => {
  const { validate } = createMustache();

  it('needs an http(s) url, and picks a style from it when none is given', () => {
    const params = validate({ url: ' https://example.com/me.jpg ' });
    assert.strictEqual(params.url, 'https://example.com/me.jpg');
    assert.ok([1, 2, 3].includes(params.style));
    assert.strictEqual(params.version, 2);
    assert.deepStrictEqual(validate({ url: 'https://example.com/me.jpg' }), params);
    assert.deepStrictEqual(validate({ url: 'https://example.com/me.jpg', style: 3 }).style, 3);
  });

  it('rejects bad input', () => {
    for (const [input, message] of [
      [{}, /url is required/],
      [{ url: 'not a url' }, /not a valid URL/],
      [{ url: 'file:///etc/passwd' }, /http or https/],
      [{ url: `https://example.com/${'x'.repeat(2048)}` }, /at most 2048/],
      [{ url: 'https://example.com/a.jpg', style: 4 }, /style must be a whole number from 1 to 3/],
      [{ url: 'https://example.com/a.jpg', style: '2' }, /style/],
    ]) {
      assert.throws(() => validate(input), BadRequest, JSON.stringify(input));
      assert.throws(() => validate(input), message, JSON.stringify(input));
    }
  });

  it('finds the face in the fixture photo, with landmarks inside the box', async () => {
    const faces = await detectFaces(await loadImage(FACE));
    assert.strictEqual(faces.length, 1);
    const [{ box, rightEye, leftEye, nose, rightMouth, leftMouth }] = faces;
    for (const p of [rightEye, leftEye, nose, rightMouth, leftMouth]) {
      assert.ok(p.x > box.x && p.x < box.x + box.w && p.y > box.y && p.y < box.y + box.h);
    }
    assert.ok(rightEye.y < nose.y && nose.y < rightMouth.y, 'eyes, nose, mouth from top down');
    assert.ok(rightEye.x < leftEye.x && rightMouth.x < leftMouth.x);
  });

  it('draws a mustache: the JPEG differs from the photo only around the mouth', async () => {
    const generator = createMustache({ fetchImage: async () => FACE });
    const jpg = await generator.render(
      generator.validate({ url: 'https://example.com/a.jpg', style: 2 })
    );
    assert.ok(jpg.subarray(0, 3).equals(JPEG_SIGNATURE));

    const [before, after] = await Promise.all([loadImage(FACE), loadImage(jpg)]);
    assert.strictEqual(after.width, before.width);
    const pixels = image => {
      const c = createCanvas(image.width, image.height);
      c.getContext('2d').drawImage(image, 0, 0);
      return c.getContext('2d').getImageData(0, 0, image.width, image.height).data;
    };
    const [a, b] = [pixels(before), pixels(after)];
    const [face] = await detectFaces(before);
    let changedNearMouth = 0;
    let changedElsewhere = 0;
    for (let i = 0; i < a.length; i += 4) {
      const diff =
        Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
      if (diff < 120) continue;
      const x = (i / 4) % before.width;
      const y = Math.floor(i / 4 / before.width);
      const near =
        Math.abs(x - face.nose.x) < face.box.w * 0.6 &&
        Math.abs(y - face.nose.y) < face.box.h * 0.4;
      if (near) changedNearMouth++;
      else changedElsewhere++;
    }
    assert.ok(changedNearMouth > 200, `mustache pixels: ${changedNearMouth}`);
    assert.ok(changedElsewhere < 50, `changed elsewhere: ${changedElsewhere}`);
  });

  it('says so when there are no faces', async () => {
    const blank = createCanvas(300, 300);
    blank.getContext('2d').fillStyle = 'skyblue';
    blank.getContext('2d').fillRect(0, 0, 300, 300);
    const png = await blank.encode('png');
    const generator = createMustache({ fetchImage: async () => png });
    await assert.rejects(
      generator.render({ url: 'https://example.com/sky.png', style: 1 }),
      /no faces found/
    );
  });

  it('turns fetch problems into 400s', async () => {
    const generator = createMustache({
      fetchImage: async () => {
        throw new FetchError('fetching it returned HTTP 404');
      },
    });
    await assert.rejects(
      generator.render({ url: 'https://example.com/gone.jpg', style: 1 }),
      err => err instanceof BadRequest && /HTTP 404/.test(err.message)
    );
  });
});

describe('fetchImage', () => {
  const image = (body = FACE, headers = { 'content-type': 'image/jpeg' }) =>
    new Response(body, { status: 200, headers });
  const fakeFetch = responses => {
    const calls = [];
    const fetch = async url => {
      calls.push(String(url));
      return responses.shift()();
    };
    return Object.assign(fetch, { calls });
  };

  it('blocks private, loopback, link-local and fly-internal addresses', () => {
    for (const address of [
      '127.0.0.1',
      '10.1.2.3',
      '172.16.0.1',
      '192.168.1.160',
      '169.254.169.254',
      '100.100.100.100',
      '0.0.0.0',
      '::1',
      '::',
      'fdaa:0:1::3',
      'fe80::1',
      '::ffff:10.0.0.1',
    ]) {
      assert.ok(isBlockedAddress(address), address);
    }
    for (const address of ['93.184.215.14', '2606:2800:21f:cb07:6820:80da:af6b:8b2c']) {
      assert.ok(!isBlockedAddress(address), address);
    }
  });

  it('refuses IP-literal URLs for blocked addresses without fetching', async () => {
    const fetch = fakeFetch([]);
    for (const url of [
      'http://127.0.0.1/',
      'http://[::1]/',
      'http://0x7f000001/',
      'http://[fdaa::3]/',
    ]) {
      await assert.rejects(fetchImage(url, { fetch }), FetchError, url);
    }
    assert.deepStrictEqual(fetch.calls, []);
  });

  it('follows redirects, but not to blocked addresses or forever', async () => {
    const redirect = location => () => new Response(null, { status: 302, headers: { location } });
    let fetch = fakeFetch([redirect('/real.jpg'), () => image()]);
    assert.ok((await fetchImage('https://example.com/a.jpg', { fetch })).equals(FACE));
    assert.deepStrictEqual(fetch.calls, [
      'https://example.com/a.jpg',
      'https://example.com/real.jpg',
    ]);

    fetch = fakeFetch([redirect('http://169.254.169.254/latest/meta-data/')]);
    await assert.rejects(
      fetchImage('https://example.com/a.jpg', { fetch }),
      /won't|isn't one silly/
    );
    assert.strictEqual(fetch.calls.length, 1);

    fetch = fakeFetch(Array.from({ length: 5 }, () => redirect('/again')));
    await assert.rejects(fetchImage('https://example.com/a.jpg', { fetch }), /too many redirects/);
  });

  it('rejects things that are not usable images', async () => {
    const cases = [
      [() => new Response('nope', { status: 404 }), /HTTP 404/],
      [
        () => image('<html></html>', { 'content-type': 'text/html' }),
        /not an image \(text\/html\)/,
      ],
      [
        () =>
          image(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'), {
            'content-type': 'image/svg+xml',
          }),
        /svg images aren't supported/,
      ],
      [() => image(Buffer.from('not really a jpeg')), /couldn't read that image/],
      [
        () =>
          image(FACE, { 'content-type': 'image/jpeg', 'content-length': String(20 * 1024 * 1024) }),
        /over 10 MB/,
      ],
    ];
    for (const [respond, message] of cases) {
      await assert.rejects(
        fetchImage('https://example.com/x', { fetch: fakeFetch([respond]) }),
        message
      );
    }
  });
});
