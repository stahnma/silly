// Mustache me: finds the faces in an image and gives each one a mustache.
// Faces come from YuNet (src/faces.js); the mustaches are vector shapes
// (src/mustaches.js), so nothing here is anyone else's artwork.
//
// Input: url (required, http or https) and style (1-3). A missing style is
// picked from the URL, so the same request gives the same image.

import { createHash } from 'node:crypto';
import { createCanvas, loadImage, Path2D } from '@napi-rs/canvas';
import { BadRequest } from '../app.js';
import { detectFaces } from '../faces.js';
import { STYLE_COUNT, drawMustache } from '../mustaches.js';
import { fetchImage as defaultFetchImage, FetchError } from '../fetch-image.js';

const MAX_URL_LENGTH = 2048;
// Output is scaled down to this on its longest side.
const MAX_OUTPUT = 1200;
const JPEG_QUALITY = 88;

export const createMustache = ({ fetchImage = defaultFetchImage } = {}) => ({
  contentType: 'image/jpeg',

  validate(input) {
    const url = typeof input.url === 'string' ? input.url.trim() : '';
    if (!url) throw new BadRequest('url is required');
    if (url.length > MAX_URL_LENGTH) {
      throw new BadRequest(`url must be at most ${MAX_URL_LENGTH} characters`);
    }
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      throw new BadRequest('url is not a valid URL');
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new BadRequest('url must be http or https');
    }

    let style = input.style;
    if (style === undefined || style === null) {
      style = (createHash('sha256').update(parsed.href).digest().readUInt32BE(0) % STYLE_COUNT) + 1;
    } else if (!Number.isInteger(style) || style < 1 || style > STYLE_COUNT) {
      throw new BadRequest(`style must be a whole number from 1 to ${STYLE_COUNT}`);
    }
    return { url: parsed.href, style };
  },

  async render({ url, style }) {
    let image;
    try {
      image = await loadImage(await fetchImage(url));
    } catch (err) {
      if (err instanceof FetchError)
        throw new BadRequest(`couldn't use that image: ${err.message}`);
      throw new BadRequest("couldn't read that image");
    }

    const faces = await detectFaces(image);
    if (faces.length === 0) throw new BadRequest('no faces found in that image');

    const scale = Math.min(1, MAX_OUTPUT / Math.max(image.width, image.height));
    const canvas = createCanvas(Math.round(image.width * scale), Math.round(image.height * scale));
    const ctx = canvas.getContext('2d');
    // JPEG has no transparency; put transparent images on white.
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(scale, scale);
    ctx.drawImage(image, 0, 0);
    for (const face of faces) drawMustache(ctx, Path2D, face, style);
    return canvas.encode('jpeg', JPEG_QUALITY);
  },
});
