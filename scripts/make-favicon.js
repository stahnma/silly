// Makes the site icons in assets/site from silly's own mustache shape
// (src/mustaches.js), in the Neobrutalism style: a vermilion tile with a dark
// outline and hard shadow, and a cream mustache.
//
//   node scripts/make-favicon.js [style]
//
// Writes favicon.svg (the source), favicon.ico (16, 32 and 48 px PNGs) and
// apple-touch-icon.png (180 px). Run it again after changing the mustaches.

import { writeFileSync } from 'node:fs';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { mustacheOutline } from '../src/mustaches.js';

const STYLE = Number(process.argv[2] || 1);
const OUT = new URL('../assets/site/', import.meta.url);
const FG = '#2a1810';
const ACCENT = '#d24b1f';
const CREAM = '#fffaf0';

// The mustache, centred on the tile and 46 of its 52 units wide. Icons need
// bolder shapes than full-size art, so it's drawn THICKEN times as tall to
// stay readable at 16 px.
const THICKEN = 1.8;
const halves = mustacheOutline(STYLE);
const points = halves.flat();
const [minX, maxX] = [Math.min(...points.map(p => p[0])), Math.max(...points.map(p => p[0]))];
const [minY, maxY] = [Math.min(...points.map(p => p[1])), Math.max(...points.map(p => p[1]))];
const sx = 46 / (maxX - minX);
const sy = sx * THICKEN;
const dx = 30 - ((minX + maxX) / 2) * sx;
const dy = 30 - ((minY + maxY) / 2) * sy;
const round = n => Math.round(n * 100) / 100;
const d = halves
  .map(
    poly =>
      'M' + poly.map(([x, y]) => `${round(x * sx + dx)} ${round(y * sy + dy)}`).join('L') + 'Z'
  )
  .join('');

// The outline is a wide stroke drawn under the fill, so the two mirrored
// halves don't leave a seam where they meet.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<rect x="8" y="8" width="52" height="52" rx="10" fill="${FG}"/>
<rect x="4" y="4" width="52" height="52" rx="10" fill="${ACCENT}" stroke="${FG}" stroke-width="4"/>
<path d="${d}" fill="${FG}" stroke="${FG}" stroke-width="3" stroke-linejoin="round"/>
<path d="${d}" fill="${CREAM}"/>
</svg>
`;

// background: an opaque fill behind the tile. iOS shows transparent corners
// as black and rounds home-screen icons itself, so the Apple icon gets one.
const png = async (size, background) => {
  const image = await loadImage(Buffer.from(svg));
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, size, size);
  }
  ctx.drawImage(image, 0, 0, size, size);
  return canvas.encode('png');
};

// An .ico holding PNG images (supported everywhere since Windows Vista).
const ico = images => {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + 16 * images.length;
  const entries = images.map(({ size, data }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...images.map(i => i.data)]);
};

writeFileSync(new URL('favicon.svg', OUT), svg);
const sizes = [16, 32, 48];
writeFileSync(
  new URL('favicon.ico', OUT),
  ico(await Promise.all(sizes.map(async size => ({ size, data: await png(size) }))))
);
writeFileSync(new URL('apple-touch-icon.png', OUT), await png(180, '#fff4cf'));
console.log(
  `style ${STYLE}: favicon.svg, favicon.ico (${sizes.join(', ')} px), apple-touch-icon.png (180 px)`
);
