import * as THREE from "three";
import { EYE_DARK } from "../palette.ts";
import { at, hull, loft, taperedBox, web, type MeshBuilder, type Section } from "./meshkit.ts";

/** Where the head sits on the body, in tile units: the middle of the skull. */
export const HEAD_Y = 1.47;

/** Half the skull's width and depth at the temples, where it is widest. */
const HALF_W = 0.118, HALF_D = 0.118;
/** The chin and the top of the skull. A head is a little taller than it is wide. */
const CHIN_Y = HEAD_Y - 0.11, CROWN_Y = HEAD_Y + 0.13;
/** How far back the skull reaches at the temples, for whatever hangs off the back of it. */
const BACK_Z = -0.9 * HALF_D;
/** How much each facet's brightness varies, so the light grades across the head. */
const FACET = 0.04;
/** Pitches for a part that runs along its own +z: UP stands it on end, DOWN hangs it, BACK lays it back. */
const UP = -Math.PI / 2, DOWN = Math.PI / 2, BACK = Math.PI;

const shade = (hex: number, k: number) => new THREE.Color(hex).multiplyScalar(k).getHex();
/** Whichever of two colours is darker in each channel: an eye that stays an eye on dark skin. */
const darker = (a: number, b: number) => {
  const x = new THREE.Color(a), y = new THREE.Color(b);
  return new THREE.Color(Math.min(x.r, y.r), Math.min(x.g, y.g), Math.min(x.b, y.b)).getHex();
};

/**
 * The skull seen from above: an egg, a little fuller behind the temples than in front of them and
 * gently flattened where the face is. Ten points, not four — what makes a face out of this is the light
 * grading from facet to facet across it, and a handful of wide planes cannot grade, they just read as
 * the sides of a box.
 *
 * Points run from the right temple forward round the face to the back, the order `hull` wants. Unit
 * space: ±1 across at the temples, +1 at the face.
 */
const OUTLINE: Array<[x: number, z: number]> = [
  [1.00, -0.05],
  [0.92, 0.42],
  [0.70, 0.76],
  [0.38, 0.96],
  [0.00, 1.00],
  [-0.38, 0.96],
  [-0.70, 0.76],
  [-0.92, 0.42],
  [-1.00, -0.05],
  [-0.86, -0.56],
  [-0.50, -0.92],
  [0.00, -1.00],
  [0.50, -0.92],
  [0.86, -0.56],
];
/** Where the middle of the face is in that run, and where the back of the head is. */
export const FACE = 4;
const NAPE = FACE + OUTLINE.length / 2;

/** How far up the head the eyes sit, and the brow ring standing out over them that shades them. */
export const EYE_T = 0.617, BROW_T = 0.71;

/**
 * The skull's cross-sections from the chin (t = 0) to the crown (t = 1): how wide and deep each is
 * against the temples, how far forward it sits, and how far a ridge down the middle of the face stands
 * proud of it. The chin is nearly a point, carried out in front of the throat; from there the head
 * swells to the temples and rounds over the top. That narrowing to a point at the bottom is what says
 * "head" in the silhouette.
 *
 * The two rings that do the work of a face are the brow, which stands forward, and the eye band just
 * under it, which is set back: the light then falls off across the band and leaves a shadow for the
 * eyes to sit in. The ridge does the same for the nose — it is a couple of centimetres of swelling
 * that shades down one side, not a nose stuck on the front.
 */
const RINGS: Array<[t: number, width: number, depth: number, forward: number, ridge: number]> = [
  [0.00, 0.30, 0.36, 0.30, 0.00],
  [0.12, 0.56, 0.60, 0.22, 0.03],
  [0.28, 0.80, 0.82, 0.10, 0.07],
  [0.42, 0.93, 0.92, 0.04, 0.12],
  [0.52, 0.98, 0.95, 0.02, 0.16],
  [0.62, 1.00, 0.97, 0.00, 0.09],
  [0.71, 1.00, 1.00, 0.01, 0.03],
  [0.82, 0.96, 0.98, -0.01, 0.00],
  [0.92, 0.84, 0.86, -0.06, 0.00],
  [1.00, 0.52, 0.56, -0.10, 0.00],
];

/** The ring at height `t`: how wide and deep it is, how far forward, its ridge, and where it sits. */
function ringAt(t: number): [w: number, d: number, forward: number, ridge: number, y: number] {
  let i = 0;
  while (i < RINGS.length - 2 && t > RINGS[i + 1]![0]) i++;
  const [t0, w0, d0, f0, r0] = RINGS[i]!, [t1, w1, d1, f1, r1] = RINGS[i + 1]!;
  const f = (t - t0) / (t1 - t0);
  const mix = (a: number, b: number) => a + (b - a) * f;
  return [mix(w0, w1), mix(d0, d1), mix(f0, f1), mix(r0, r1), CHIN_Y + (CROWN_Y - CHIN_Y) * t];
}

/** How much of a ring's ridge a point carries: all of it in the middle of the face, none a step away. */
function ridgeAt(k: number): number {
  const n = OUTLINE.length;
  const steps = k - FACE;
  const d = steps - Math.round(steps / n) * n;
  return Math.abs(d) >= 1 ? 0 : (1 + Math.cos(Math.PI * d)) / 2;
}

/**
 * A point on the skull: `t` up from the chin (0) to the crown (1), `k` round the outline (0 the right
 * temple, FACE the middle of the face), `out` clear of the surface and `lift` above it.
 *
 * Everything that goes on the head is placed with this, so a feature sits ON the face however the skull
 * is shaped. Placed behind the surface instead, it vanishes inside the head and the face goes blank.
 */
export function headPoint(t: number, k: number, out = 0, lift = 0): [number, number, number] {
  const [w, d, forward, ridge, y] = ringAt(t);
  const n = OUTLINE.length;
  const i = ((Math.floor(k) % n) + n) % n, f = k - Math.floor(k);
  const a = OUTLINE[i]!, c = OUTLINE[(i + 1) % n]!;
  // The edge this point lies on, at this ring's size. Its outward normal is the way off the face.
  const dx = (c[0] - a[0]) * w * HALF_W, dz = (c[1] - a[1]) * d * HALF_D;
  const len = Math.hypot(dx, dz) || 1;
  return [
    (a[0] + (c[0] - a[0]) * f) * w * HALF_W + (dz / len) * out,
    y + lift,
    ((a[1] + (c[1] - a[1]) * f) * d + forward + ridge * ridgeAt(k)) * HALF_D - (dx / len) * out,
  ];
}

/** The whole outline at height `t`, standing `out` clear of the skull and `lift` above it. */
const section = (t: number, out = 0, lift = 0): Section => OUTLINE.map((_, k) => headPoint(t, k, out, lift));

export interface HeadLook {
  skin: number;
  hair: number;
  /** Index into HAIR_STYLES; 0 is bald. */
  hairStyle: number;
  /** Index into BEARD_STYLES; 0 is none. */
  beard: number;
}

/**
 * The head, the neck, and whatever hair and beard the look asks for, built into `b` in body
 * coordinates. Facing +z.
 *
 * It is one lofted volume — a pointed egg — with two dark shapes on it and nothing else: no nose, no
 * mouth, no eyeballs. At the size a player sees this, the face is made by the light grading down the
 * cheeks, the shadow the brow leaves for the eyes to sit in, the swelling down the middle that shades
 * like a nose, and the chin coming to a point. Anything modelled beyond that turns into a smudge.
 */
export function buildHead(b: MeshBuilder, look: HeadLook): void {
  const { skin, hair } = look;

  // The neck: short and thick, widening into the shoulders, with the chin carried over the front of it.
  b.add(loft([[0.094, 0.078, 0], [0.072, 0.062, 0.16]], 7), {
    color: shade(skin, 0.92), shade: FACET, matrix: at(0, 1.21, -0.008, 1, 0, UP),
  });
  b.add(hull(RINGS.map(([t]) => section(t))), { color: skin, shade: FACET });

  // The eyes: a flat dark shape each, lying on the face, slanting up a little toward the temple. The
  // fan runs from the inner corner round the bottom and back along the top, which faces it outward.
  const eye = darker(EYE_DARK, shade(skin, 0.42));
  const OUT = 0.004;
  for (const s of [1, -1]) {
    // Mirroring flips a face inside out, so the left eye is wound back the other way.
    const k = (i: number) => (s > 0 ? i : 2 * FACE - i);
    const p = (t: number, i: number) => headPoint(t, k(i), OUT);
    const rim = [
      p(EYE_T - 0.027, 3.25), p(EYE_T - 0.029, 2.4), p(EYE_T - 0.004, 1.85),
      p(EYE_T + 0.029, 2.4), p(EYE_T + 0.025, 3.25),
    ];
    b.add(web(p(EYE_T - 0.004, 3.62), s > 0 ? rim : [...rim].reverse()), { color: eye });
  }

  // Ears: a small tab lying against the side of the head, just behind the temple and mostly under the
  // hair. Stood any further off, it reads as a handle.
  for (const s of [1, -1]) {
    const [x, y, z] = headPoint(0.55, s > 0 ? -0.3 : 2 * FACE + 0.3, -0.009);
    b.add(taperedBox(0.032, 0.052, 0.024, 0.042, 0.009), {
      color: shade(skin, 0.94), shade: FACET, matrix: at(x, y, z, 1, s * 1.78),
    });
  }

  buildHair(b, look);
  buildBeard(b, look);
}

/**
 * How far up the head the hair comes down at each outline point — a fringe in front, the nape behind.
 * A style is mostly this line: the hair itself is always the skull's own shape a little proud of it, so
 * it cannot stand off the head as a slab whatever it is asked to do.
 */
const HAIRLINE = [0.58, 0.66, 0.74, 0.79, 0.80, 0.79, 0.74, 0.66, 0.58, 0.46, 0.38, 0.36, 0.38, 0.46];
/** Swept: the same fringe, thrown across so it sits low on one side and high on the other. */
const SWEPT = [0.58, 0.62, 0.66, 0.71, 0.77, 0.84, 0.82, 0.70, 0.58, 0.46, 0.38, 0.36, 0.38, 0.46];
/** Long: down past the ears all round, with the fall hanging below it at the back. */
const LONG = [0.50, 0.58, 0.68, 0.76, 0.80, 0.76, 0.68, 0.58, 0.50, 0.30, 0.20, 0.18, 0.20, 0.30];
/** How much of the fall each point carries: all of it at the nape, none of it on the face. */
const FALL = [0.35, 0.1, 0, 0, 0, 0, 0, 0.1, 0.35, 0.8, 1, 1, 1, 0.8];

function buildHair(b: MeshBuilder, { hair, hairStyle }: HeadLook): void {
  const paint = { color: hair, shade: FACET };
  /** The cap: the skull's own shape a little proud of it, from `line` up over the crown. */
  const cap = (out = 0.009, line: number[] = HAIRLINE) => {
    const layer = (t: number, lift: number) => OUTLINE.map((_, k) => headPoint(Math.max(t, line[k]!), k, out, lift));
    // Each layer follows the skull as it swells and rounds over, so the hair never sinks into it.
    b.add(hull([layer(0, 0), layer(0.68, 0.002), layer(0.84, 0.006), layer(0.94, 0.011), layer(1, 0.016)]), paint);
  };
  switch (hairStyle) {
    case 1: // Short.
      cap();
      break;
    case 2: // Swept: the fringe thrown across the forehead.
      cap(0.011, SWEPT);
      break;
    case 3: { // Long: down past the ears, with the back of it falling to the shoulders.
      cap(0.01, LONG);
      // The fall keeps the back of the skull's shape and hangs below the nape, rather than standing off
      // it as a board: the hem drops by how much of the back each point is on. It has to be tucked
      // INSIDE the head at the face, or its front edge crosses the cheeks as a band.
      const layer = (t: number, hang = 0) =>
        OUTLINE.map((_, k) => headPoint(t, k, FALL[k]! * 0.024 - 0.01, -hang * FALL[k]!));
      b.add(hull([layer(0.18, 0.19), layer(0.18), layer(0.46)]), paint);
      break;
    }
    case 4: // Spiky: the cap, with spikes standing off the crown.
      cap();
      for (let i = 0; i < 7; i++) {
        const k = FACE + (i / 7) * OUTLINE.length;
        const [x, y, z] = headPoint(0.9, k, 0.012, 0.004);
        // The outline turns toward the head's left as its index rises, so the yaw that points a spike
        // out of the head runs the other way.
        b.add(taperedBox(0.05, 0.05, 0.008, 0.008, 0.1), {
          ...paint, matrix: at(x, y, z, 1, -((k - FACE) / OUTLINE.length) * Math.PI * 2, UP + 0.45),
        });
      }
      break;
    case 5: // Ponytail.
      cap();
      b.add(taperedBox(0.075, 0.075, 0.03, 0.03, 0.22), { ...paint, matrix: at(0, HEAD_Y + 0.07, BACK_Z, 1, 0, 2.1) });
      break;
    case 6: // Bun.
      cap();
      b.add(taperedBox(0.1, 0.1, 0.085, 0.085, 0.075), { ...paint, matrix: at(0, HEAD_Y + 0.06, BACK_Z - 0.01, 1, 0, BACK) });
      break;
    case 7: { // Mohawk: a crest over the middle of the crown, the sides bare.
      const front = headPoint(0.93, FACE)[2], back = headPoint(0.93, NAPE)[2];
      for (let i = 0; i < 5; i++) {
        const f = i / 4;
        const h = 0.05 + 0.04 * Math.sin(f * Math.PI);
        // The blocks overlap along the crest: spaced to touch, the taper opens a gap at every joint.
        b.add(taperedBox(0.05, 0.068, 0.034, 0.056, h), {
          ...paint, matrix: at(0, CROWN_Y - 0.025, front + (back - front) * f, 1, 0, UP),
        });
      }
      break;
    }
    default: // Bald.
      break;
  }
}

/**
 * How far each outline point stands off the face under a beard: the jaw and the chin, and tucked inside
 * the head behind them. Laid exactly ON the skin at the back it fights the skin for the same pixels.
 */
const BEARD_OUT = [0.002, 0.008, 0.012, 0.014, 0.014, 0.014, 0.012, 0.008, 0.002, -0.006, -0.006, -0.006, -0.006, -0.006];

function buildBeard(b: MeshBuilder, { hair, beard }: HeadLook): void {
  const paint = { color: hair, shade: FACET };
  /** A shell over the jaw from `bottom` to `top`, hanging `drop` below the chin where it is thickest. */
  const shell = (bottom: number, top: number, drop = 0) => {
    // Each point carries its share of the thickness and of the drop, so the beard is on the jaw and the
    // chin only: dropped all the way round, it hangs off the back of the head as well.
    const layer = (t: number, hang = 0, k = 1) =>
      OUTLINE.map((_, i) => headPoint(t, i, BEARD_OUT[i]! * k, -hang * Math.max(0, BEARD_OUT[i]!) / 0.014));
    const sections: Section[] = drop > 0 ? [layer(0.08, drop, 0.6), layer(0.08)] : [layer(bottom)];
    sections.push(layer((bottom + top) / 2), layer(top, 0, 0.5));
    b.add(hull(sections), paint);
  };
  /**
   * A patch of hair lying on the face, `wide` outline steps either side of the middle and from `bottom`
   * to `top`, as the eyes lie on it. A block laid against a face this shape keeps its corners where the
   * face has curved away, and those corners stick out past the cheek as a bar.
   */
  const patch = (bottom: number, top: number, wide: number, out = 0.006) => {
    const p = (t: number, k: number) => headPoint(t, FACE + k, out);
    const middle = (bottom + top) / 2;
    // Along the top from the right corner to the left, then back along the bottom: that faces it out.
    b.add(web(p(middle, -wide), [
      p(top, -wide * 0.5), p(top, 0), p(top, wide * 0.5), p(middle, wide),
      p(bottom, wide * 0.5), p(bottom, 0), p(bottom, -wide * 0.5),
    ]), paint);
  };
  /** A moustache over the top lip, and a chin patch under the bottom one. */
  const moustache = () => patch(0.40, 0.47, 1.25);
  switch (beard) {
    case 1: // Goatee: a small patch on the point of the chin. Any bigger and it reads as an open mouth.
      patch(0.05, 0.19, 0.55, 0.006);
      break;
    case 2: // Moustache.
      moustache();
      break;
    case 3: // Short beard: the jaw covered to below the ears.
      shell(0.03, 0.38);
      moustache();
      break;
    case 4: // Full beard.
      shell(0.03, 0.40, 0.05);
      moustache();
      break;
    case 5: // Long beard.
      shell(0.03, 0.40, 0.15);
      moustache();
      break;
    default: // None.
      break;
  }
}
