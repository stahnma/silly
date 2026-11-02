// Mustache me: finds the faces in an image and gives each one a mustache.
// Faces come from YuNet (src/faces.js); the mustaches are vector shapes
// (src/mustaches.js), so nothing here is anyone else's artwork.
//
// Input: url (required, http or https) and style (1-3). A missing style is
// picked from the URL, so the same request gives the same image.

import { createHash } from 'node:crypto';
import { BadRequest } from '../app.js';
import { STYLE_COUNT, drawMustache } from '../mustaches.js';
import { URL_FIELD, EXAMPLE_PHOTO, validateUrl, decoratePhoto } from '../photo.js';

// Part of every image's parameters, so changing how mustaches look gives new
// requests new images instead of the stored ones. Old URLs keep working.
// 2: the meme-style mustaches.
const VERSION = 2;

export const createMustache = ({ fetchImage } = {}) => ({
  contentType: 'image/jpeg',

  docs: {
    title: 'Mustache me',
    summary: 'A mustache on every face in a photo.',
    fields: [
      URL_FIELD,
      {
        name: 'style',
        type: 'integer',
        minimum: 1,
        maximum: STYLE_COUNT,
        description: '1 classic curly, 2 bushy, 3 smooth. Picked from the URL when left out.',
      },
    ],
    example: { url: EXAMPLE_PHOTO, style: 1 },
  },

  validate(input) {
    const url = validateUrl(input);

    let style = input.style;
    if (style === undefined || style === null) {
      style = (createHash('sha256').update(url).digest().readUInt32BE(0) % STYLE_COUNT) + 1;
    } else if (!Number.isInteger(style) || style < 1 || style > STYLE_COUNT) {
      throw new BadRequest(`style must be a whole number from 1 to ${STYLE_COUNT}`);
    }
    return { url, style, version: VERSION };
  },

  render({ url, style }) {
    return decoratePhoto(url, (ctx, face) => drawMustache(ctx, face, style), { fetchImage });
  },
});
