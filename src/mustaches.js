// Mustache shapes, drawn as vector paths so there's no artwork to license.
// Each style is the right half of a mustache, in a box where the mouth is 100
// units wide: x runs from 0 (the middle, under the nose) outwards and y down
// from the bottom of the nose. The left half is the mirror image.

export const STYLES = {
  // 1: handlebar, with tips that curl up.
  1: {
    path:
      'M 0 6 C 8 -2 22 -4 36 2 C 50 8 60 12 70 10 C 82 8 88 0 88 -9 ' +
      'C 88 -18 81 -22 75 -18 C 82 -17 83 -9 80 -3 C 74 9 64 14 52 20 ' +
      'C 40 26 22 26 10 22 C 5 20 2 18 0 18 Z',
    // How far below the nose, as a fraction of the nose-to-mouth distance.
    drop: 0.25,
    // Width relative to the mouth.
    size: 1.35,
  },
  // 2: walrus, thick and drooping over the lip, with a ragged bottom edge.
  2: {
    path:
      'M 0 0 C 14 -6 34 -6 50 0 C 62 4 70 14 72 28 C 73 36 70 44 66 46 ' +
      'L 62 38 L 58 46 L 52 37 L 46 44 L 40 35 L 34 42 L 28 34 L 22 40 ' +
      'L 16 33 L 10 38 L 5 32 L 0 36 Z',
    drop: 0.15,
    size: 1.15,
  },
  // 3: pencil, a thin line just above the lip.
  3: {
    path: 'M 0 8 C 16 3 36 3 52 7 C 60 9 66 12 70 16 C 60 18 42 16 28 18 C 16 19 6 21 0 21 Z',
    drop: 0.4,
    size: 1.2,
  },
};

export const STYLE_COUNT = Object.keys(STYLES).length;

// Draw a mustache on ctx for a face from detectFaces().
export const drawMustache = (ctx, Path2D, face, style) => {
  const { path, drop, size } = STYLES[style];
  const mouth = {
    x: (face.rightMouth.x + face.leftMouth.x) / 2,
    y: (face.rightMouth.y + face.leftMouth.y) / 2,
  };
  const mouthWidth = Math.hypot(
    face.leftMouth.x - face.rightMouth.x,
    face.leftMouth.y - face.rightMouth.y
  );
  // Tilt with the line between the mouth corners, so a tilted head gets a
  // tilted mustache.
  const angle = Math.atan2(
    face.leftMouth.y - face.rightMouth.y,
    face.leftMouth.x - face.rightMouth.x
  );
  const anchor = {
    x: face.nose.x + (mouth.x - face.nose.x) * drop,
    y: face.nose.y + (mouth.y - face.nose.y) * drop,
  };
  const scale = (mouthWidth / 100) * size;
  const half = new Path2D(path);

  ctx.save();
  ctx.translate(anchor.x, anchor.y);
  ctx.rotate(angle);
  ctx.scale(scale, scale);
  ctx.fillStyle = '#1c130e';
  ctx.fill(half);
  ctx.scale(-1, 1);
  ctx.fill(half);
  ctx.restore();
};
