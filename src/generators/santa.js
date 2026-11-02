// Santa me: a Santa hat on every face in a photo. Faces come from YuNet
// (src/faces.js); the hat is drawn by silly (src/hats.js).
//
// Input: url (required, http or https).

import { drawSantaHat } from '../hats.js';
import { URL_FIELD, EXAMPLE_PHOTO, validateUrl, decoratePhoto } from '../photo.js';

// Part of every image's parameters, so changing how the hat looks gives new
// requests new images instead of the stored ones. Old URLs keep working.
const VERSION = 1;

export const createSanta = ({ fetchImage } = {}) => ({
  contentType: 'image/jpeg',

  docs: {
    title: 'Santa me',
    summary: 'A Santa hat on every face in a photo.',
    fields: [URL_FIELD],
    example: { url: EXAMPLE_PHOTO },
  },

  validate(input) {
    return { url: validateUrl(input), version: VERSION };
  },

  render({ url }) {
    return decoratePhoto(url, drawSantaHat, { fetchImage });
  },
});
