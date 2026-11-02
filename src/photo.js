// What the photo generators (mustache, santa) share: the url field, fetching
// the photo safely (src/fetch-image.js), finding faces (src/faces.js), and
// drawing on each face before encoding a JPEG.

import { createCanvas, loadImage } from '@napi-rs/canvas';
import { BadRequest } from './app.js';
import { detectFaces } from './faces.js';
import { fetchImage as defaultFetchImage, FetchError } from './fetch-image.js';

export const MAX_URL_LENGTH = 2048;
// Output is scaled down to this on its longest side.
const MAX_OUTPUT = 1200;
const JPEG_QUALITY = 88;

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

// The normalized URL from a request, or a BadRequest.
export const validateUrl = input => {
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
  return parsed.href;
};

// Fetch the photo at url, call draw(ctx, face) for every face in it (in the
// photo's own coordinates), and return a JPEG. No faces is a BadRequest.
export const decoratePhoto = async (url, draw, { fetchImage = defaultFetchImage } = {}) => {
  let image;
  try {
    image = await loadImage(await fetchImage(url));
  } catch (err) {
    if (err instanceof FetchError) throw new BadRequest(`couldn't use that image: ${err.message}`);
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
  for (const face of faces) draw(ctx, face);
  return canvas.encode('jpeg', JPEG_QUALITY);
};
