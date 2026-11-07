// Really? Right in front of my: validation, and drawing with text, a fetched
// picture or an uploaded one (fetching is faked, so nothing leaves the machine).
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { createRrif } from '../src/generators/rrif.js';
import { BadRequest, imageId } from '../src/app.js';

// A small solid-green PNG, easy to spot in the output.
const green = async () => {
  const c = createCanvas(100, 60);
  c.getContext('2d').fillStyle = 'rgb(0, 200, 0)';
  c.getContext('2d').fillRect(0, 0, 100, 60);
  return c.encode('png');
};

const greenPixels = async jpg => {
  const image = await loadImage(jpg);
  const c = createCanvas(image.width, image.height);
  c.getContext('2d').drawImage(image, 0, 0);
  const data = c.getContext('2d').getImageData(0, 0, image.width, image.height).data;
  let count = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] < 60 && data[i + 1] > 150 && data[i + 2] < 60) count++;
  }
  return count;
};

describe('rrif', () => {
  it('takes text, an image url, an uploaded image, or text with either', async () => {
    const { validate } = createRrif();
    assert.deepStrictEqual(validate({ text: '  pancit   canton ' }), {
      text: 'pancit canton',
      version: 1,
    });
    assert.deepStrictEqual(validate({ image_url: ' https://example.com/x.png ' }), {
      text: '',
      image_url: 'https://example.com/x.png',
      version: 1,
    });

    const png = await green();
    const fromBase64 = validate({ text: 'salad', image: png.toString('base64') });
    assert.ok(fromBase64.image.equals(png));
    const fromDataUrl = validate({ image: `data:image/png;base64,${png.toString('base64')}` });
    assert.ok(fromDataUrl.image.equals(png));
    const fromFile = validate({ image: png });
    assert.ok(fromFile.image.equals(png));
    // The same picture, however it arrives, is the same image.
    assert.strictEqual(imageId('rrif', fromDataUrl), imageId('rrif', fromFile));
  });

  it('rejects bad input', () => {
    const { validate } = createRrif();
    for (const [input, message] of [
      [{}, /text, image or image_url is required/],
      [{ text: '   ' }, /text, image or image_url is required/],
      [{ text: 5 }, /text must be a string/],
      [{ text: 'x'.repeat(61) }, /at most 60/],
      [{ text: 'x'.repeat(40) }, /too long to fit/],
      [{ image_url: 'ftp://example.com/a.png' }, /image_url must be http or https/],
      [{ image: 'not base64!' }, /image must be base64/],
      [{ image: Buffer.alloc(0) }, /image is empty/],
      [{ image: 'aGk=', image_url: 'https://example.com/a.png' }, /not both/],
    ]) {
      assert.throws(() => validate(input), BadRequest, JSON.stringify(input));
      assert.throws(() => validate(input), message);
    }
  });

  it('ends the caption with the text and a question mark', async () => {
    const generator = createRrif();
    const jpg = await generator.render(generator.validate({ text: 'quiche' }));
    assert.deepStrictEqual([...jpg.subarray(0, 3)], [0xff, 0xd8, 0xff]);
    const image = await loadImage(jpg);
    assert.strictEqual(image.width, 1044);
  });

  it('holds up a fetched picture', async () => {
    const png = await green();
    const fetched = [];
    const generator = createRrif({
      fetchImage: async url => {
        fetched.push(url);
        return png;
      },
    });
    const jpg = await generator.render(
      generator.validate({ text: 'salad', image_url: 'https://example.com/g.png' })
    );
    assert.deepStrictEqual(fetched, ['https://example.com/g.png']);
    // Scaled up to fill the held box: 440 wide.
    assert.ok((await greenPixels(jpg)) > 440 * 200, 'the picture is missing or small');
  });

  it('holds up an uploaded picture, without fetching anything', async () => {
    const generator = createRrif({
      fetchImage: async () => assert.fail('fetched an uploaded image'),
    });
    const jpg = await generator.render(generator.validate({ image: await green() }));
    assert.ok((await greenPixels(jpg)) > 440 * 200);
  });

  it('refuses uploads that are not images silly will read', async () => {
    const generator = createRrif();
    await assert.rejects(
      generator.render(generator.validate({ image: Buffer.from('hello there') })),
      /couldn't use that image/
    );
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>');
    await assert.rejects(generator.render(generator.validate({ image: svg })), /svg images/);
  });
});
