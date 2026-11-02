// Aw yiss: Kate Beaton's duck comic with your phrase, from awyisser.com
// (github.com/quinnkeast/awyisser). The site's API returns the PNG as a
// base64 data URL; this passes it through.
//
// The comic's "motha ___" line is part of awyisser's background image. With
// sfw (the default) it reads "motha freakin"; {"sfw": false} gives the
// original comic's wording.

import { BadRequest, UpstreamError } from '../app.js';

const API_URL = 'https://www.awyisser.com/api/generator';
// The site's input has maxlength 40, and its API rejects anything longer.
const MAX_LENGTH = 40;
const TIMEOUT_MS = 20_000;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export const createAwyiss = ({ fetch = globalThis.fetch } = {}) => ({
  contentType: 'image/png',

  docs: {
    title: 'Aw yiss',
    summary: "Kate Beaton's duck comic with your phrase, made by awyisser.com.",
    fields: [
      {
        name: 'text',
        type: 'string',
        required: true,
        maxLength: MAX_LENGTH,
        description: 'The phrase, up to 40 characters. Lowercased, as the comic letters it.',
      },
      {
        name: 'sfw',
        type: 'boolean',
        default: true,
        description:
          'The "motha ___" line: `true` gives "motha freakin", `false` the original comic\'s "motha fuckin".',
      },
    ],
    example: { text: 'more silly images' },
  },

  // {"text": "More  Burritos"} -> {text: "more burritos"}. awyisser lowercases
  // the text, and whitespace is collapsed, so variants share one image.
  // sfw is only included when false, so safe-for-work images keep the ids
  // they had before the flag existed.
  validate(input) {
    const text =
      typeof input.text === 'string' ? input.text.replace(/\s+/g, ' ').trim().toLowerCase() : '';
    if (!text) throw new BadRequest('text is required');
    if ([...text].length > MAX_LENGTH) {
      throw new BadRequest(`text must be at most ${MAX_LENGTH} characters`);
    }
    if (input.sfw !== undefined && typeof input.sfw !== 'boolean') {
      throw new BadRequest('sfw must be true or false');
    }
    return input.sfw === false ? { text, sfw: false } : { text };
  },

  async render({ text, sfw = true }) {
    let res;
    try {
      res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: text, sfw }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      throw new UpstreamError(`awyisser.com request failed: ${err.message}`);
    }
    if (!res.ok) throw new UpstreamError(`awyisser.com returned HTTP ${res.status}`);

    let image;
    try {
      ({ image } = await res.json());
    } catch {
      throw new UpstreamError('awyisser.com returned something other than JSON');
    }
    const m = /^data:image\/png;base64,(.+)$/s.exec(image || '');
    const png = m && Buffer.from(m[1], 'base64');
    if (!png || !png.subarray(0, 8).equals(PNG_SIGNATURE)) {
      throw new UpstreamError('awyisser.com did not return a PNG');
    }
    return png;
  },
});
