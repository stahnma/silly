// O RLY: a parody O'Reilly book cover. The layout follows Charles Berlin's
// O-RLY-Book-Generator (github.com/charleshberlin/O-RLY-Book-Generator, MIT),
// which uses the 40 animal pictures in assets/orly/animals. The fonts are free
// stand-ins for the original's commercial ones: EB Garamond for Garamond, and
// Arimo for Helvetica (both OFL, in assets/fonts).
//
// Input: title (required), guide_text, top_text, author, guide_placement,
// animal (1-40) and theme (0-16, a colour). A missing animal or theme is
// picked from the text, so the same text always gives the same cover.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas';
import { BadRequest } from '../app.js';

const ASSETS = new URL('../../assets/', import.meta.url);
GlobalFonts.registerFromPath(new URL('fonts/EBGaramond.ttf', ASSETS).pathname, 'Silly Garamond');
GlobalFonts.registerFromPath(
  new URL('fonts/EBGaramond-Italic.ttf', ASSETS).pathname,
  'Silly Garamond Italic'
);
GlobalFonts.registerFromPath(new URL('fonts/Arimo.ttf', ASSETS).pathname, 'Silly Sans');

const WIDTH = 500;
const HEIGHT = 700;
const MARGIN = 20;
const ANIMALS = 40;
const BOX_TOP = 400;
const TITLE_WIDTH = WIDTH - 80;
const PLACEMENTS = ['bottom_right', 'bottom_left', 'top_right', 'top_left'];
const MAX_LENGTH = { title: 80, guide_text: 60, top_text: 80, author: 60 };

// The original's 17 themes, RGB.
const THEMES = [
  [85, 19, 93],
  [113, 112, 110],
  [128, 27, 42],
  [184, 7, 33],
  [101, 22, 28],
  [80, 61, 189],
  [225, 17, 5],
  [6, 123, 176],
  [247, 181, 0],
  [0, 15, 118],
  [168, 0, 155],
  [0, 132, 69],
  [0, 153, 157],
  [1, 66, 132],
  [177, 0, 52],
  [55, 142, 25],
  [133, 152, 0],
].map(([r, g, b]) => `rgb(${r}, ${g}, ${b})`);

const fonts = {
  top: '20px "Silly Garamond Italic"',
  guide: '34px "Silly Garamond Italic"',
  author: '24px "Silly Garamond Italic"',
  title: size => `${size}px "Silly Garamond"`,
  orly: '500 28px "Silly Sans"',
  question: 'bold 16px "Silly Sans"',
};

// Decoding is asynchronous; render() waits for all of them.
const animals = Promise.all(
  Array.from({ length: ANIMALS }, (_, i) =>
    loadImage(readFileSync(new URL(`orly/animals/${i + 1}.png`, ASSETS)))
  )
);

// For measuring text while validating.
const measure = createCanvas(1, 1).getContext('2d');
const textWidth = (text, font) => {
  measure.font = font;
  return measure.measureText(text).width;
};

// Keep what the fonts can draw (Latin, Greek, Cyrillic and common
// punctuation), like the original, which dropped characters its fonts lacked.
const DRAWABLE = /[ -~ -ɏͰ-ϿЀ-ӿ‐-‧‰-⁞€]/u;
const clean = text =>
  [...text]
    .filter(c => DRAWABLE.test(c))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();

// The biggest title font that fits: one line from 80px down to 62px, else two
// lines (split at a space) from 80px down to 35px. Null if nothing fits.
const fitTitle = title => {
  for (let size = 80; size > 61; size--) {
    if (textWidth(title, fonts.title(size)) < TITLE_WIDTH) return { size, lines: [title] };
  }
  const spaces = [...title.matchAll(/ /g)].map(m => m.index);
  for (let size = 80; size > 34; size--) {
    for (const at of spaces) {
      const lines = [title.slice(0, at), title.slice(at + 1)];
      if (Math.max(...lines.map(l => textWidth(l, fonts.title(size)))) < TITLE_WIDTH) {
        return { size, lines };
      }
    }
  }
  return null;
};

const optionalText = (input, field, fallback) => {
  const value = input[field];
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'string') throw new BadRequest(`${field} must be a string`);
  const text = clean(value);
  if ([...text].length > MAX_LENGTH[field]) {
    throw new BadRequest(`${field} must be at most ${MAX_LENGTH[field]} characters`);
  }
  return text;
};

const optionalInt = (input, field, min, max) => {
  const value = input[field];
  if (value === undefined || value === null) return undefined;
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new BadRequest(`${field} must be a whole number from ${min} to ${max}`);
  }
  return value;
};

export const createOrly = () => ({
  contentType: 'image/png',

  docs: {
    title: 'O RLY',
    summary: "A parody O'Reilly book cover: an animal, a title and an author.",
    fields: [
      {
        name: 'title',
        type: 'string',
        required: true,
        maxLength: MAX_LENGTH.title,
        description: 'The title. It must fit on the cover, on one line or two.',
      },
      {
        name: 'guide_text',
        type: 'string',
        default: 'The Definitive Guide',
        maxLength: MAX_LENGTH.guide_text,
        description: 'The italic line by the title block.',
      },
      {
        name: 'top_text',
        type: 'string',
        default: '',
        maxLength: MAX_LENGTH.top_text,
        description: 'The small line across the top.',
      },
      {
        name: 'author',
        type: 'string',
        default: '',
        maxLength: MAX_LENGTH.author,
        description: 'Bottom right.',
      },
      {
        name: 'guide_placement',
        type: 'string',
        enum: PLACEMENTS,
        default: 'bottom_right',
        description: 'Which corner of the title block the guide text goes in.',
      },
      {
        name: 'animal',
        type: 'integer',
        minimum: 1,
        maximum: ANIMALS,
        description: 'Which of the 40 animals. Picked from the text when left out.',
      },
      {
        name: 'theme',
        type: 'integer',
        minimum: 0,
        maximum: THEMES.length - 1,
        description: 'Which of the 17 colours. Picked from the text when left out.',
      },
    ],
    example: {
      title: 'Yak Shaving',
      top_text: 'Before we can start, we need to',
      author: 'silly',
      animal: 25,
      theme: 13,
    },
  },

  validate(input) {
    const title = optionalText(input, 'title', '');
    if (!title) throw new BadRequest('title is required');
    if (!fitTitle(title)) throw new BadRequest('title is too long to fit on the cover');

    const params = {
      title,
      guide_text: optionalText(input, 'guide_text', 'The Definitive Guide'),
      top_text: optionalText(input, 'top_text', ''),
      author: optionalText(input, 'author', ''),
      guide_placement: input.guide_placement ?? 'bottom_right',
    };
    if (!PLACEMENTS.includes(params.guide_placement)) {
      throw new BadRequest(`guide_placement must be one of ${PLACEMENTS.join(', ')}`);
    }

    // Text that would run off the cover, or into "O RLY?", is an error rather
    // than a surprise.
    const inner = WIDTH - 2 * MARGIN;
    if (textWidth(params.top_text, fonts.top) > inner) {
      throw new BadRequest('top_text is too long to fit on the cover');
    }
    if (textWidth(params.guide_text, fonts.guide) > inner) {
      throw new BadRequest('guide_text is too long to fit on the cover');
    }
    const orly = textWidth('O RLY', fonts.orly) + textWidth('?', fonts.question);
    if (textWidth(params.author, fonts.author) > inner - orly - MARGIN) {
      throw new BadRequest('author is too long to fit on the cover');
    }

    // Unset animal and theme come from the text, so a request is repeatable.
    const seed = createHash('sha256')
      .update(JSON.stringify([params.title, params.guide_text, params.top_text, params.author]))
      .digest()
      .readUInt32BE(0);
    params.animal = optionalInt(input, 'animal', 1, ANIMALS) ?? (seed % ANIMALS) + 1;
    params.theme = optionalInt(input, 'theme', 0, THEMES.length - 1) ?? seed % THEMES.length;
    return params;
  },

  async render({ title, guide_text, top_text, author, guide_placement, animal, theme }) {
    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext('2d');
    const color = THEMES[theme];

    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // The animal goes first, so the title block and text are drawn over the
    // part of it that reaches down past the top of the block. (The original
    // pasted it last, which let it cover a top-placed guide text.)
    ctx.drawImage((await animals)[animal - 1], 80, 40);

    // Thin bar across the top, with the top text centred under it.
    ctx.fillStyle = color;
    ctx.fillRect(MARGIN, 0, WIDTH - 2 * MARGIN, 10);
    ctx.fillStyle = 'black';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'center';
    ctx.font = fonts.top;
    ctx.fillText(top_text, WIDTH / 2, 12);

    // The title block: a band of colour with the title in white.
    const { size, lines } = fitTitle(title);
    const lineHeight = Math.round(size * 1.05);
    const titleHeight = lineHeight * lines.length;
    const boxBottom = BOX_TOP + titleHeight + 40;
    ctx.fillStyle = color;
    ctx.fillRect(MARGIN, BOX_TOP, WIDTH - 2 * MARGIN, boxBottom - BOX_TOP);
    ctx.fillStyle = 'white';
    ctx.textAlign = 'left';
    ctx.font = fonts.title(size);
    lines.forEach((line, i) => ctx.fillText(line, 40, BOX_TOP + 20 + i * lineHeight));

    // The guide text, in a corner of the title block.
    ctx.fillStyle = 'black';
    ctx.font = fonts.guide;
    const right = guide_placement.endsWith('right');
    ctx.textAlign = right ? 'right' : 'left';
    const x = right ? WIDTH - MARGIN : MARGIN;
    if (guide_placement.startsWith('top')) {
      ctx.textBaseline = 'bottom';
      ctx.fillText(guide_text, x, BOX_TOP - 2);
    } else {
      ctx.textBaseline = 'top';
      ctx.fillText(guide_text, x, boxBottom + 2);
    }

    // Bottom row: "O RLY" and a theme-coloured "?" on the left, the author on
    // the right.
    ctx.textBaseline = 'alphabetic';
    const baseline = HEIGHT - MARGIN - 4;
    ctx.textAlign = 'left';
    ctx.font = fonts.orly;
    ctx.fillText('O RLY', MARGIN, baseline);
    const orlyWidth = ctx.measureText('O RLY').width;
    ctx.fillStyle = color;
    ctx.font = fonts.question;
    ctx.fillText('?', MARGIN + orlyWidth + 1, baseline - 11);
    ctx.fillStyle = 'black';
    ctx.textAlign = 'right';
    ctx.font = fonts.author;
    ctx.fillText(author, WIDTH - MARGIN, baseline);

    return canvas.encode('png');
  },
});
