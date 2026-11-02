// Aw yiss: Kate Beaton's duck comic with your phrase, from awyisser.com
// (github.com/quinnkeast/awyisser). The site's API returns the PNG as a
// base64 data URL; this passes it through.

import { BadRequest, UpstreamError } from '../app.js';

const API_URL = 'https://www.awyisser.com/api/generator';
// The site's input has maxlength 40, and its API rejects anything longer.
const MAX_LENGTH = 40;
const TIMEOUT_MS = 20_000;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export const createAwyiss = ({ fetch = globalThis.fetch } = {}) => ({
  contentType: 'image/png',

  // {"text": "more burritos"} -> {text: "more burritos"}. Whitespace is
  // collapsed so "more  burritos" is the same image.
  validate(input) {
    const text = typeof input.text === 'string' ? input.text.replace(/\s+/g, ' ').trim() : '';
    if (!text) throw new BadRequest('text is required');
    if ([...text].length > MAX_LENGTH) {
      throw new BadRequest(`text must be at most ${MAX_LENGTH} characters`);
    }
    return { text };
  },

  async render({ text }) {
    let res;
    try {
      res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: text, sfw: true }),
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
