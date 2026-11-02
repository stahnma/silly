// The aw yiss generator with a fake fetch in place of awyisser.com.
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createAwyiss } from '../src/generators/awyiss.js';
import { BadRequest, UpstreamError } from '../src/app.js';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 9]);
const dataUrl = buf => `data:image/png;base64,${buf.toString('base64')}`;

const fakeFetch = (respond, calls = []) =>
  Object.assign(
    async (url, options) => {
      calls.push({ url, options });
      return respond(url, options);
    },
    { calls }
  );
const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('awyiss', () => {
  it('validates and normalizes the text', () => {
    const { validate } = createAwyiss({ fetch: fakeFetch(() => {}) });
    assert.deepStrictEqual(validate({ text: '  More   Burritos ' }), { text: 'more burritos' });
    assert.throws(() => validate({}), BadRequest);
    assert.throws(() => validate({ text: '   ' }), BadRequest);
    assert.throws(() => validate({ text: 42 }), BadRequest);
    assert.deepStrictEqual(validate({ text: 'x'.repeat(40) }), { text: 'x'.repeat(40) });
    assert.throws(() => validate({ text: 'x'.repeat(41) }), /at most 40/);
  });

  it('asks awyisser.com for a safe-for-work image and returns the PNG', async () => {
    const fetch = fakeFetch(() => jsonResponse({ image: dataUrl(PNG) }));
    const png = await createAwyiss({ fetch }).render({ text: 'more burritos' });
    assert.ok(png.equals(PNG));
    const [{ url, options }] = fetch.calls;
    assert.strictEqual(url, 'https://www.awyisser.com/api/generator');
    assert.strictEqual(options.method, 'POST');
    assert.deepStrictEqual(JSON.parse(options.body), { value: 'more burritos', sfw: true });
  });

  it('takes an optional sfw flag, included in the parameters only when false', () => {
    const { validate } = createAwyiss({ fetch: fakeFetch(() => {}) });
    assert.deepStrictEqual(validate({ text: 'x', sfw: true }), { text: 'x' });
    assert.deepStrictEqual(validate({ text: 'x', sfw: false }), { text: 'x', sfw: false });
    assert.throws(() => validate({ text: 'x', sfw: 'no' }), /sfw must be true or false/);
  });

  it('asks for the original wording when sfw is false', async () => {
    const fetch = fakeFetch(() => jsonResponse({ image: dataUrl(PNG) }));
    await createAwyiss({ fetch }).render({ text: 'tacos', sfw: false });
    assert.deepStrictEqual(JSON.parse(fetch.calls[0].options.body), { value: 'tacos', sfw: false });
  });

  it('turns awyisser.com failures into upstream errors', async () => {
    const cases = [
      () => jsonResponse({ error: 'nope' }, 400),
      () => new Response('<html>oops</html>'),
      () => jsonResponse({ image: 'data:image/jpeg;base64,AAAA' }),
      () => jsonResponse({ image: dataUrl(Buffer.from('not a png')) }),
      () => {
        throw new TypeError('fetch failed');
      },
    ];
    for (const respond of cases) {
      await assert.rejects(
        createAwyiss({ fetch: fakeFetch(respond) }).render({ text: 'x' }),
        UpstreamError
      );
    }
  });
});
