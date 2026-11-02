// Santa me: validation, and a hat drawn on the fixture photo (fetching is
// faked, so nothing leaves the machine).
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { loadImage, createCanvas } from '@napi-rs/canvas';
import { createSanta } from '../src/generators/santa.js';
import { detectFaces } from '../src/faces.js';
import { BadRequest } from '../src/app.js';

const FACE = readFileSync(new URL('fixtures/face.jpg', import.meta.url));

const pixels = image => {
  const c = createCanvas(image.width, image.height);
  c.getContext('2d').drawImage(image, 0, 0);
  return c.getContext('2d').getImageData(0, 0, image.width, image.height).data;
};

describe('santa', () => {
  it('needs an http(s) url', () => {
    const { validate } = createSanta();
    assert.deepStrictEqual(validate({ url: ' https://example.com/me.jpg ' }), {
      url: 'https://example.com/me.jpg',
      version: 1,
    });
    for (const [input, message] of [
      [{}, /url is required/],
      [{ url: 'ftp://example.com/a.jpg' }, /http or https/],
      [{ url: 'nope' }, /not a valid URL/],
    ]) {
      assert.throws(() => validate(input), BadRequest);
      assert.throws(() => validate(input), message);
    }
  });

  it('puts a red hat above the eyes and leaves the lower face alone', async () => {
    const generator = createSanta({ fetchImage: async () => FACE });
    const jpg = await generator.render(generator.validate({ url: 'https://example.com/a.jpg' }));
    assert.deepStrictEqual([...jpg.subarray(0, 3)], [0xff, 0xd8, 0xff]);

    const [before, after] = await Promise.all([loadImage(FACE), loadImage(jpg)]);
    const [face] = await detectFaces(before);
    const eyeY = (face.rightEye.y + face.leftEye.y) / 2;
    const [a, b] = [pixels(before), pixels(after)];
    let changedAbove = 0;
    let red = 0;
    let changedBelow = 0;
    for (let i = 0; i < a.length; i += 4) {
      const diff =
        Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
      if (diff < 120) continue;
      const y = Math.floor(i / 4 / before.width);
      if (y < eyeY) {
        changedAbove++;
        if (b[i] > 150 && b[i + 1] < 80 && b[i + 2] < 80) red++;
      } else if (y > face.nose.y) {
        changedBelow++;
      }
    }
    assert.ok(changedAbove > 1000, `hat pixels: ${changedAbove}`);
    assert.ok(red > 500, `red pixels: ${red}`);
    assert.ok(changedBelow < 50, `changed below the nose: ${changedBelow}`);
  });

  it('says so when there are no faces', async () => {
    const sky = createCanvas(200, 200);
    sky.getContext('2d').fillStyle = 'skyblue';
    sky.getContext('2d').fillRect(0, 0, 200, 200);
    const png = await sky.encode('png');
    const generator = createSanta({ fetchImage: async () => png });
    await assert.rejects(
      generator.render({ url: 'https://example.com/sky.png' }),
      /no faces found/
    );
  });
});
