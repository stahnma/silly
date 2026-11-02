// Mustaches in the style of the "mustache meme": thick lobes that dip at the
// middle and sweep out into curled tips, shaded charcoal to black, with hair
// strands. All drawn here, so there's no artwork to license.
//
// Each side is a centreline running from the middle (under the nose) out to
// the tip, plus a thickness along it; the outline is the centreline offset by
// that thickness on both sides, and the left side mirrors the right.
// Coordinates are in units where the mouth is 100 wide: x runs outwards from
// the middle, y down from the bottom of the nose. Spines start just past the
// middle so the two halves overlap instead of leaving a seam.

// Half-thickness along the spine, from control points [t, thickness] with t
// running from 0 at the middle to 1 at the tip; smooth between them.
const profile = points => t => {
  const i = Math.max(
    0,
    points.findIndex(([pt]) => pt >= t)
  );
  if (i === 0) return points[0][1];
  const [t0, v0] = points[i - 1];
  const [t1, v1] = points[i];
  const u = (t - t0) / (t1 - t0);
  return v0 + (v1 - v0) * (u * u * (3 - 2 * u));
};

export const STYLES = {
  // 1: classic curly, the meme mustache: big lobes, tips rolled into loops.
  1: {
    spine: [
      [-3, 15],
      [14, 12],
      [32, 14],
      [50, 20],
      [66, 25],
      [80, 24],
      [92, 15],
      [97, 3],
      [93, -8],
      [84, -10],
      [78, -3],
      [81, 4],
      [87, 3],
    ],
    thickness: profile([
      [0, 7],
      [0.18, 15],
      [0.36, 13],
      [0.55, 7.5],
      [0.75, 5],
      [0.92, 3.2],
      [1, 1.8],
    ]),
    drop: 0.1,
    size: 1.5,
    strands: 520,
    fuzz: 0.5,
  },
  // 2: bushy: fuller and shaggier, with smaller curls.
  2: {
    spine: [
      [-3, 17],
      [16, 14],
      [34, 17],
      [52, 23],
      [68, 28],
      [82, 26],
      [92, 17],
      [93, 7],
      [87, 2],
      [82, 7],
    ],
    thickness: profile([
      [0, 10],
      [0.2, 19],
      [0.42, 16],
      [0.65, 9],
      [0.85, 5],
      [1, 2.5],
    ]),
    drop: 0.06,
    size: 1.45,
    strands: 700,
    fuzz: 1.5,
  },
  // 3: smooth, like the mustache emoji: shaded, no hair, tips turned up.
  3: {
    spine: [
      [-3, 14],
      [16, 11],
      [36, 14],
      [56, 20],
      [72, 22],
      [86, 15],
      [94, 4],
      [96, -3],
    ],
    thickness: profile([
      [0, 7],
      [0.25, 16],
      [0.55, 11],
      [0.85, 4.5],
      [1, 0.8],
    ]),
    drop: 0.1,
    size: 1.35,
    strands: 0,
    fuzz: 0,
  },
};

export const STYLE_COUNT = Object.keys(STYLES).length;

const SAMPLES = 160;

// Points along a Catmull-Rom spline through the spine, with unit normals.
const sampleSpine = spine => {
  const at = (i, u) => {
    const p0 = spine[Math.max(i - 1, 0)];
    const p1 = spine[i];
    const p2 = spine[Math.min(i + 1, spine.length - 1)];
    const p3 = spine[Math.min(i + 2, spine.length - 1)];
    const u2 = u * u;
    const u3 = u2 * u;
    return [0, 1].map(
      k =>
        0.5 *
        (2 * p1[k] +
          (-p0[k] + p2[k]) * u +
          (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * u2 +
          (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * u3)
    );
  };
  const points = [];
  for (let s = 0; s <= SAMPLES; s++) {
    const f = (s / SAMPLES) * (spine.length - 1);
    const i = Math.min(Math.floor(f), spine.length - 2);
    points.push(at(i, f - i));
  }
  return points.map((p, s) => {
    const a = points[Math.max(s - 1, 0)];
    const b = points[Math.min(s + 1, points.length - 1)];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    return { x: p[0], y: p[1], nx: -dy / len, ny: dx / len, t: s / SAMPLES };
  });
};

// The outline of one side, as a closed polygon: down one edge and back up the
// other, with a rounded end at the tip.
const outline = ({ spine, thickness }) => {
  const pts = sampleSpine(spine);
  const left = pts.map(p => [p.x + p.nx * thickness(p.t), p.y + p.ny * thickness(p.t)]);
  const right = pts.map(p => [p.x - p.nx * thickness(p.t), p.y - p.ny * thickness(p.t)]);
  return { pts, polygon: [...left, ...right.reverse()] };
};

// A small seeded random generator, so a style always draws the same way.
const seeded = seed => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const SHAPES = Object.fromEntries(
  Object.entries(STYLES).map(([style, spec]) => [style, outline(spec)])
);

// A style's whole outline (both halves) as polygons in mustache units, for
// drawing it elsewhere: scripts/make-favicon.js uses it for the site icon.
export const mustacheOutline = style => {
  const right = SHAPES[style].polygon;
  return [right, right.map(([x, y]) => [-x, y])];
};

const fillPolygon = (ctx, polygon) => {
  ctx.beginPath();
  polygon.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
};

// One side of the mustache, in mustache units, on a context already placed,
// rotated and scaled (and mirrored, for the left side).
const drawSide = (ctx, style, unit) => {
  const spec = STYLES[style];
  const { pts, polygon } = SHAPES[style];
  const random = seeded(Number(style) * 7919);

  // Body: charcoal at the top edge to near-black underneath, with a soft
  // shadow so it sits on the photo instead of floating over it.
  const gradient = ctx.createLinearGradient(0, -10, 0, 34);
  gradient.addColorStop(0, '#4a4442');
  gradient.addColorStop(0.45, '#221d1b');
  gradient.addColorStop(1, '#0b0908');
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
  ctx.shadowBlur = 3 * unit;
  ctx.shadowOffsetY = 1.5 * unit;
  fillPolygon(ctx, polygon);
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.restore();

  if (!spec.strands) {
    // The smooth style gets a highlight along the top of the lobe instead.
    ctx.save();
    fillPolygon(ctx, polygon);
    ctx.clip();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    pts
      .filter(p => p.t > 0.08 && p.t < 0.62)
      .forEach((p, i) => {
        // The normal points down, so -normal is towards the top edge.
        const d = spec.thickness(p.t) * 0.55;
        const x = p.x - p.nx * d;
        const y = p.y - p.ny * d;
        return i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      });
    ctx.stroke();
    ctx.restore();
    return;
  }

  // Hair: strands that follow the spine, at random offsets across its width,
  // light and dark, clipped to the body.
  ctx.save();
  fillPolygon(ctx, polygon);
  ctx.clip();
  ctx.lineCap = 'round';
  for (let n = 0; n < spec.strands; n++) {
    const start = Math.floor(random() * (pts.length - 12));
    const length = 14 + Math.floor(random() * 30);
    const across = random() * 2 - 1;
    const light = random() < 0.4;
    ctx.strokeStyle = light ? 'rgba(140, 130, 126, 0.2)' : 'rgba(0, 0, 0, 0.3)';
    ctx.lineWidth = 0.22 + random() * 0.35;
    ctx.beginPath();
    for (let s = start; s < Math.min(start + length, pts.length); s++) {
      const p = pts[s];
      const d = across * spec.thickness(p.t) * 0.95;
      const x = p.x + p.nx * d;
      const y = p.y + p.ny * d;
      if (s === start) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();

  // Fuzz: short hairs poking out past the bottom edge, along the lobe.
  ctx.strokeStyle = 'rgba(12, 10, 9, 0.8)';
  ctx.lineCap = 'round';
  const hairs = Math.round(spec.strands * 0.25 * spec.fuzz);
  for (let n = 0; n < hairs; n++) {
    const p = pts[Math.floor(random() * pts.length * 0.55)];
    const edge = spec.thickness(p.t);
    const out = (0.6 + random() * 1.6) * spec.fuzz;
    ctx.lineWidth = 0.3 + random() * 0.4;
    ctx.beginPath();
    // The normal points down, so +normal is the bottom edge, where hair hangs.
    ctx.moveTo(p.x + p.nx * (edge - 1.2), p.y + p.ny * (edge - 1.2));
    ctx.lineTo(
      p.x + p.nx * (edge + out) + (random() - 0.5) * 1.2,
      p.y + p.ny * (edge + out) + (random() - 0.5) * 1.2
    );
    ctx.stroke();
  }
};

// Draw a mustache on ctx for a face from detectFaces().
export const drawMustache = (ctx, face, style) => {
  const { drop, size } = STYLES[style];
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

  for (const mirror of [1, -1]) {
    ctx.save();
    ctx.translate(anchor.x, anchor.y);
    ctx.rotate(angle);
    ctx.scale(scale * mirror, scale);
    // unit: one mustache unit in pixels, for blur sizes.
    drawSide(ctx, style, scale);
    ctx.restore();
  }
};
