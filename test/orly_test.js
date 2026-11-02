// The O RLY generator: validation, defaults, and that it draws a cover.
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createOrly } from '../src/generators/orly.js';
import { BadRequest } from '../src/app.js';
import { imageId } from '../src/app.js';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const { validate, render } = createOrly();

describe('orly', () => {
  it('fills in defaults, and picks the animal and theme from the text', () => {
    const params = validate({ title: '  Exiting   Vim ' });
    assert.strictEqual(params.title, 'Exiting Vim');
    assert.strictEqual(params.guide_text, 'The Definitive Guide');
    assert.strictEqual(params.top_text, '');
    assert.strictEqual(params.author, '');
    assert.strictEqual(params.guide_placement, 'bottom_right');
    assert.ok(params.animal >= 1 && params.animal <= 40);
    assert.ok(params.theme >= 0 && params.theme <= 16);
    // The same text always gives the same cover.
    assert.deepStrictEqual(validate({ title: 'Exiting Vim' }), params);
  });

  it('uses the animal, theme and placement it is given', () => {
    const params = validate({
      title: 'Exiting Vim',
      guide_text: 'Eventually',
      top_text: 'Just memorize these commands',
      author: '@ThePracticalDev',
      animal: 40,
      theme: 0,
      guide_placement: 'top_left',
    });
    assert.deepStrictEqual(params, {
      title: 'Exiting Vim',
      guide_text: 'Eventually',
      top_text: 'Just memorize these commands',
      author: '@ThePracticalDev',
      guide_placement: 'top_left',
      animal: 40,
      theme: 0,
    });
  });

  it('gives a chosen animal or theme its own image id', () => {
    const base = validate({ title: 'Exiting Vim' });
    const other = validate({ title: 'Exiting Vim', animal: (base.animal % 40) + 1 });
    assert.notStrictEqual(imageId('orly', base), imageId('orly', other));
  });

  it('rejects bad input', () => {
    const cases = [
      [{}, /title is required/],
      [{ title: '   ' }, /title is required/],
      [{ title: 42 }, /title must be a string/],
      [{ title: 'x', animal: 0 }, /animal must be a whole number from 1 to 40/],
      [{ title: 'x', animal: 41 }, /animal/],
      [{ title: 'x', animal: 1.5 }, /animal/],
      [{ title: 'x', theme: 17 }, /theme must be a whole number from 0 to 16/],
      [{ title: 'x', theme: '3' }, /theme/],
      [{ title: 'x', guide_placement: 'middle' }, /guide_placement must be one of/],
      [{ title: 'x', author: ['a'] }, /author must be a string/],
    ];
    for (const [input, message] of cases) {
      assert.throws(() => validate(input), BadRequest, JSON.stringify(input));
      assert.throws(() => validate(input), message, JSON.stringify(input));
    }
  });

  it('rejects text that will not fit on the cover', () => {
    assert.throws(
      () => validate({ title: 'Supercalifragilisticexpialidocious Antidisestablishmentarianism' }),
      /title is too long to fit/
    );
    assert.throws(() => validate({ title: 'x'.repeat(81) }), /title must be at most 80/);
    assert.throws(
      () => validate({ title: 'x', top_text: 'W'.repeat(60) }),
      /top_text is too long to fit/
    );
    assert.throws(
      () =>
        validate({ title: 'x', author: 'Hubert Blaine Wolfeschlegelsteinhausenbergerdorff Sr.' }),
      /author is too long to fit/
    );
    // A long title can go onto two lines.
    assert.doesNotThrow(() => validate({ title: 'Deploying Burritos to Production' }));
  });

  it('drops characters the fonts cannot draw', () => {
    assert.strictEqual(validate({ title: 'Ship it 🚀 now' }).title, 'Ship it now');
    assert.strictEqual(validate({ title: 'Café Привет Ωmega' }).title, 'Café Привет Ωmega');
  });

  it('draws a 500x700 PNG', async () => {
    const png = await render(validate({ title: 'Exiting Vim', author: 'someone', animal: 2 }));
    assert.ok(png.subarray(0, 8).equals(PNG_SIGNATURE));
    assert.strictEqual(png.readUInt32BE(16), 500);
    assert.strictEqual(png.readUInt32BE(20), 700);
  });
});
