// A Santa hat, drawn here (no artwork to license): a red cone whose tip flops
// over to one side, a white fur band and a pom-pom.
//
// It's placed from the eyes: the line between them gives the head's tilt and
// size, and the brim sits a little under one eye-distance above them, pulled
// down over the top of the head.
// Coordinates are in units of that eye distance, x along the eye line and
// y up (negative) from the middle of the brim.

// The cone, from the brim's left end up over the top, out to the flopped tip
// and back down the right side.
const CONE = [
  ['M', -1.2, 0.05],
  ['C', -1.15, -1.05, -0.55, -1.9, 0.3, -2.05],
  ['C', 1.05, -2.15, 1.65, -1.6, 1.95, -0.95],
  ['L', 1.58, -0.82],
  ['C', 1.38, -1.25, 1.0, -1.38, 0.86, -1.0],
  ['C', 0.95, -0.62, 1.1, -0.3, 1.2, 0.05],
  ['Z'],
];
const TIP = { x: 1.78, y: -0.86, r: 0.34 };
const BAND = { w: 2.7, h: 0.6 };

// The hat's position, size and tilt on a face from detectFaces().
const placement = face => {
  const { rightEye, leftEye } = face;
  const eyeDistance = Math.hypot(leftEye.x - rightEye.x, leftEye.y - rightEye.y);
  const angle = Math.atan2(leftEye.y - rightEye.y, leftEye.x - rightEye.x);
  const up = { x: Math.sin(angle), y: -Math.cos(angle) };
  const lift = eyeDistance * 0.8;
  return {
    x: (rightEye.x + leftEye.x) / 2 + up.x * lift,
    y: (rightEye.y + leftEye.y) / 2 + up.y * lift,
    angle,
    // The hat's drawing units, a little bigger than the eye distance so it
    // covers the whole head.
    unit: eyeDistance * 1.25,
  };
};

// A small seeded random generator, so a hat always draws the same way.
const seeded = seed => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const tracePath = (ctx, path) => {
  ctx.beginPath();
  for (const [op, ...a] of path) {
    if (op === 'M') ctx.moveTo(...a);
    else if (op === 'L') ctx.lineTo(...a);
    else if (op === 'C') ctx.bezierCurveTo(...a);
    else ctx.closePath();
  }
};

// Fur: a base shape, then many small overlapping puffs, lighter on top and
// greyer underneath, so it reads as fluffy rather than flat.
const fur = (ctx, random, shape, puffs, size) => {
  ctx.fillStyle = '#ece7df';
  shape();
  ctx.fill();
  // Only the base casts a shadow; puffs with shadows would look dirty.
  ctx.shadowColor = 'transparent';
  for (let i = 0; i < puffs; i++) {
    const [x, y, shade] = random.point();
    const r = size * (0.6 + random() * 0.8);
    const g = ctx.createRadialGradient(x - r * 0.25, y - r * 0.3, 0, x, y, r);
    g.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
    g.addColorStop(0.7, shade);
    g.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
};

export const drawSantaHat = (ctx, face) => {
  const { x, y, angle, unit } = placement(face);
  const random = seeded(7);

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(unit, unit);

  // A soft shadow under the whole hat, so it sits on the head.
  ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
  ctx.shadowBlur = 0.25 * unit;
  ctx.shadowOffsetY = 0.08 * unit;

  // Cone: deep red, lighter towards the upper left, darker in the fold.
  const red = ctx.createLinearGradient(-1.2, -2, 1.6, 0);
  red.addColorStop(0, '#e2363a');
  red.addColorStop(0.55, '#c3161f');
  red.addColorStop(1, '#7d0b12');
  tracePath(ctx, CONE);
  ctx.fillStyle = red;
  ctx.fill();
  ctx.shadowColor = 'transparent';

  // A fold where the tip flops over.
  ctx.strokeStyle = 'rgba(70, 0, 6, 0.45)';
  ctx.lineWidth = 0.07;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0.55, -1.75);
  ctx.quadraticCurveTo(0.95, -1.55, 1.0, -1.15);
  ctx.stroke();
  // A highlight down the lit side.
  ctx.strokeStyle = 'rgba(255, 210, 200, 0.12)';
  ctx.lineWidth = 0.3;
  ctx.beginPath();
  ctx.moveTo(-0.85, -0.25);
  ctx.quadraticCurveTo(-0.7, -1.3, 0.15, -1.8);
  ctx.stroke();

  // Fur band along the brim, then the pom-pom on the tip.
  const bandPoint = () => {
    const px = (random() - 0.5) * BAND.w * 0.94;
    const py = (random() - 0.5) * BAND.h * 0.7;
    return [px, py, py > 0.05 ? 'rgba(214, 207, 196, 0.9)' : 'rgba(238, 234, 227, 0.9)'];
  };
  ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
  ctx.shadowBlur = 0.15 * unit;
  ctx.shadowOffsetY = 0.05 * unit;
  fur(
    ctx,
    Object.assign(random, { point: bandPoint }),
    () => {
      ctx.beginPath();
      ctx.roundRect(-BAND.w / 2, -BAND.h / 2, BAND.w, BAND.h, BAND.h / 2);
    },
    320,
    0.07
  );
  ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
  const tipPoint = () => {
    const a = random() * Math.PI * 2;
    const d = Math.sqrt(random()) * TIP.r * 0.75;
    const py = TIP.y + Math.sin(a) * d;
    return [
      TIP.x + Math.cos(a) * d,
      py,
      py > TIP.y + 0.08 ? 'rgba(214, 207, 196, 0.9)' : 'rgba(238, 234, 227, 0.9)',
    ];
  };
  fur(
    ctx,
    Object.assign(random, { point: tipPoint }),
    () => {
      ctx.beginPath();
      ctx.arc(TIP.x, TIP.y, TIP.r, 0, Math.PI * 2);
    },
    90,
    0.07
  );
  ctx.restore();
};
