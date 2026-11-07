// Really? Right in front of my X? The meme's own picture (Flork of Cows'
// character, blank template from imgflip; see assets/README.md) with the
// caption redrawn so the X can go on the end, and a picture of the X in the
// character's hand.
//
// Input: text (the X, in the caption), and a picture of the X: image (bytes,
// uploaded as base64 in JSON or a file in multipart/form-data) or image_url.
// At least one of text, image and image_url.

import { readFileSync } from 'node:fs';
import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas';
import { BadRequest } from '../app.js';
import { clean } from '../text.js';
import { MAX_BYTES } from '../fetch-image.js';
import { JPEG_QUALITY, MAX_URL_LENGTH, getPhoto, validateUrl, withPhoto } from '../photo.js';

GlobalFonts.registerFromPath(
  new URL('../../assets/fonts/Arimo.ttf', import.meta.url).pathname,
  'Silly Sans'
);

// Part of every image's parameters, so changing the drawing gives new
// requests new images instead of the stored ones. Old URLs keep working.
const VERSION = 1;

const ASSETS = new URL('../../assets/', import.meta.url);
// 1074x1057, a screenshot with grey edges, which are cropped off (CROP, from
// the left and right). The caption is in its top CAPTION_AREA pixels; it's
// painted over and drawn again with the X.
const template = loadImage(readFileSync(new URL('rrif/template.jpg', ASSETS)));
const CROP = { left: 18, right: 12 };
const CAPTION_AREA = 225;
const WIDTH = 1074 - CROP.left - CROP.right;
const MARGIN = 82;
const FONT = '72px "Silly Sans"';
const LINE_HEIGHT = 84;
const CAPTION_TOP = 22;
const MAX_LINES = 4;
const MAX_TEXT = 60;
const LEAD = 'Really? Right in front of my';
// Where the picture goes: the blank space at the end of the character's arm,
// where the original's object was erased.
const HELD = { x: 712 - CROP.left, y: 845, width: 440, height: 400 };
// Base64 of a 10 MB image, plus room for the rest of the body.
const MAX_BODY_BYTES = Math.ceil((MAX_BYTES * 4) / 3) + 64 * 1024;

const measure = createCanvas(1, 1).getContext('2d');
measure.font = FONT;

// The caption split into lines that fit across the image, or null if a word
// is too wide or it takes more than MAX_LINES.
const wrap = caption => {
  const lines = [];
  for (const word of caption.split(' ')) {
    const line = lines.length ? `${lines.at(-1)} ${word}` : word;
    if (lines.length && measure.measureText(line).width <= WIDTH - 2 * MARGIN) {
      lines[lines.length - 1] = line;
    } else {
      if (measure.measureText(word).width > WIDTH - 2 * MARGIN) return null;
      lines.push(word);
    }
  }
  return lines.length > MAX_LINES ? null : lines;
};

const captionFor = text => {
  if (!text) return LEAD;
  return `${LEAD} ${text}${/[?!]$/.test(text) ? '' : '?'}`;
};

// An uploaded image: bytes from a multipart file, or base64 (optionally a
// data: URL) from JSON.
const uploadedImage = value => {
  if (Buffer.isBuffer(value)) {
    if (value.length === 0) throw new BadRequest('image is empty');
    return value;
  }
  if (typeof value !== 'string') throw new BadRequest('image must be base64 or a file');
  const base64 = value.replace(/^data:[^,]*;base64,/, '').replace(/\s+/g, '');
  if (!base64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    throw new BadRequest('image must be base64');
  }
  return Buffer.from(base64, 'base64');
};

// The picture, scaled to fit the held box and centred in it.
const drawPicture = (ctx, image) => {
  const scale = Math.min(HELD.width / image.width, HELD.height / image.height);
  const w = image.width * scale;
  const h = image.height * scale;
  ctx.drawImage(image, HELD.x - w / 2, HELD.y - h / 2, w, h);
};

const render = async (lines, image) => {
  const base = await template;
  // Longer captions make the image taller rather than the text smaller.
  const captionHeight = Math.max(CAPTION_AREA, CAPTION_TOP + lines.length * LINE_HEIGHT + 20);
  const offset = captionHeight - CAPTION_AREA;
  const canvas = createCanvas(WIDTH, base.height + offset);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(base, CROP.left, 0, WIDTH, base.height, 0, offset, WIDTH, base.height);
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, WIDTH, captionHeight);

  ctx.fillStyle = '#1a1a1a';
  ctx.font = FONT;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  lines.forEach((line, i) => ctx.fillText(line, MARGIN, CAPTION_TOP + i * LINE_HEIGHT));

  if (image) {
    ctx.translate(0, offset);
    drawPicture(ctx, image);
  }
  return canvas.encode('jpeg', JPEG_QUALITY);
};

export const createRrif = ({ fetchImage } = {}) => ({
  contentType: 'image/jpeg',
  maxBodyBytes: MAX_BODY_BYTES,

  docs: {
    title: 'Really? Right in front of my',
    summary:
      "Really? Right in front of my X? The meme's character, outraged: your X at the end of the caption, a picture of it in its hand, or both. Send JSON, or `multipart/form-data` to upload a file (`curl -F text=pizza -F image=@pizza.jpg`).",
    fields: [
      {
        name: 'text',
        type: 'string',
        maxLength: MAX_TEXT,
        description:
          'The X, ending the caption. Needed unless there is an image; must fit in four lines.',
      },
      {
        name: 'image_url',
        type: 'string',
        maxLength: MAX_URL_LENGTH,
        description:
          'An http(s) link to a picture of the X: a JPEG, PNG, GIF, WebP or BMP, up to 10 MB. Internal addresses are refused.',
      },
      {
        name: 'image',
        type: 'string',
        description:
          'A picture of the X uploaded with the request instead of `image_url`: base64 (or a `data:` URL) in JSON, or a file part in `multipart/form-data`. Same formats and limits.',
      },
    ],
    example: {
      text: 'pizza',
      image_url:
        'https://upload.wikimedia.org/wikipedia/commons/a/a3/Eq_it-na_pizza-margherita_sep2005_sml.jpg',
    },
  },

  validate(input) {
    let text = '';
    if (input.text !== undefined && input.text !== null) {
      if (typeof input.text !== 'string') throw new BadRequest('text must be a string');
      text = clean(input.text);
      if ([...text].length > MAX_TEXT) {
        throw new BadRequest(`text must be at most ${MAX_TEXT} characters`);
      }
    }
    const hasImage = input.image !== undefined && input.image !== null && input.image !== '';
    const hasUrl = input.image_url !== undefined && input.image_url !== null;
    if (hasImage && hasUrl) throw new BadRequest('send image or image_url, not both');
    if (!text && !hasImage && !hasUrl) {
      throw new BadRequest('text, image or image_url is required');
    }
    if (!wrap(captionFor(text))) throw new BadRequest('text is too long to fit');

    const params = { text, version: VERSION };
    if (hasUrl) params.image_url = validateUrl(input, 'image_url');
    if (hasImage) params.image = uploadedImage(input.image);
    return params;
  },

  async render({ text, image_url, image }) {
    const lines = wrap(captionFor(text));
    if (!image_url && !image) return render(lines, null);
    const bytes = await getPhoto({ url: image_url, bytes: image }, { fetchImage });
    return withPhoto(bytes, picture => render(lines, picture));
  },
});
