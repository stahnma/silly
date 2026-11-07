// Text for silly's own drawings (orly, rrif), which use free Latin fonts.

// Keep what the fonts can draw (Latin, Greek, Cyrillic and common
// punctuation) and drop the rest, like the original O RLY generator did with
// characters its fonts lacked, rather than drawing boxes. Runs of whitespace
// become one space.
const DRAWABLE = /[ -~ -ɏͰ-ϿЀ-ӿ‐-‧‰-⁞€]/u;

export const clean = text =>
  [...text]
    .filter(c => DRAWABLE.test(c))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
