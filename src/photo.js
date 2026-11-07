// What the photo generators (mustache, santa, rrif) share: the url field,
// fetching the photo safely (src/fetch-image.js) or checking an uploaded one,
// decoding it, and for mustache and santa, finding faces (src/faces.js) and
// drawing on each face before encoding a JPEG.
//
// Decoding a photo takes up to about 64 MB (16 megapixels of RGBA), so only a
// couple are decoded at once, and only a few fetched photos wait for that;
// past that, requests get a Busy error (a 503) instead of running the machine
// out of memory.

import { createCanvas, loadImage } from '@napi-rs/canvas';
import { BadRequest } from './app.js';
import { detectFaces } from './faces.js';
import { fetchImage as defaultFetchImage, checkImage, FetchError } from './fetch-image.js';
import { createLimiter } from './limiter.js';

export const MAX_URL_LENGTH = 2048;
// Output is scaled down to this on its longest side.
const MAX_OUTPUT = 1200;
export const JPEG_QUALITY = 88;
// Fetching holds at most 10 MB per photo; decoding much more.
const fetching = createLimiter({ max: 4, maxWaiting: 32 });
const decoding = createLimiter({ max: 2, maxWaiting: 4 });

export const URL_FIELD = {
  name: 'url',
  type: 'string',
  required: true,
  maxLength: MAX_URL_LENGTH,
  description:
    'An http(s) link to a JPEG, PNG, GIF, WebP or BMP, up to 10 MB. Internal addresses are refused.',
};

export const EXAMPLE_PHOTO =
  'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3d/Apollo_11_Crew.jpg/1280px-Apollo_11_Crew.jpg';

// The normalized URL in input[field], or a BadRequest.
export const validateUrl = (input, field = 'url') => {
  const url = typeof input[field] === 'string' ? input[field].trim() : '';
  if (!url) throw new BadRequest(`${field} is required`);
  if (url.length > MAX_URL_LENGTH) {
    throw new BadRequest(`${field} must be at most ${MAX_URL_LENGTH} characters`);
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new BadRequest(`${field} is not a valid URL`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new BadRequest(`${field} must be http or https`);
  }
  return parsed.href;
};

// A photo's bytes: fetched from `url`, or `bytes` a client uploaded, checked
// the same way. A photo silly can't use is a BadRequest.
export const getPhoto = async ({ url, bytes }, { fetchImage = defaultFetchImage } = {}) => {
  try {
    return bytes ? checkImage(bytes) : await fetching.run(() => fetchImage(url));
  } catch (err) {
    if (err instanceof FetchError) throw new BadRequest(`couldn't use that image: ${err.message}`);
    throw err;
  }
};

// Decode a photo and return use(image), with only a couple decoded at once.
export const withPhoto = (bytes, use) =>
  decoding.run(async () => {
    let image;
    try {
      image = await loadImage(bytes);
    } catch {
      throw new BadRequest("couldn't read that image");
    }
    return use(image);
  });

// Fetch the photo at url, call draw(ctx, face) for every face in it (in the
// photo's own coordinates), and return a JPEG. No faces is a BadRequest.
export const decoratePhoto = async (url, draw, { fetchImage } = {}) => {
  const bytes = await getPhoto({ url }, { fetchImage });
  return withPhoto(bytes, async image => {
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
    for (const face of faces) draw(ctx, face);
    return canvas.encode('jpeg', JPEG_QUALITY);
  });
};
