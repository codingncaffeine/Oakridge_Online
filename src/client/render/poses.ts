// Poses for the character rig: one number per joint channel, keyframed for the looping skill actions.

/** Joint channels of a pose, in radians unless noted. */
export const CH = {
  /** Pelvis height offset, in tiles. */
  lift: 0,
  /** Whole-body pitch forward (the running lean). */
  lean: 1,
  /** Upper-body pitch forward at the waist. */
  bend: 2,
  /** Upper-body turn at the waist, toward the character's left. */
  twist: 3,
  /** Thigh swing at the hip: negative is forward. */
  hipL: 4,
  hipR: 5,
  /** Knee bend: positive folds the shin back. */
  kneeL: 6,
  kneeR: 7,
  /** Shoulders: x negative raises the arm forward; z turns it out to the side (positive left, negative right). */
  shLx: 8,
  shLy: 9,
  shLz: 10,
  shRx: 11,
  shRy: 12,
  shRz: 13,
  /** Elbow bend: negative. */
  elL: 14,
  elR: 15,
  /** Right wrist: the held item's angle to the forearm (π/2 is square to it, π continues its line). */
  wrist: 16,
  /** 0–1: how much the left hand holds the right hand's tool instead of following its own pose. */
  grip: 17,
} as const;
export const CHANNELS = 18;
export type Channel = keyof typeof CH;
export type Pose = Float64Array;
type Key = Partial<Record<Channel, number>>;

interface ActionDef {
  /** Seconds per loop. */
  period: number;
  /** Where in the loop the tool lands, as a fraction of it: when the hit is heard. */
  impact: number;
  /** Where the left hand holds the tool, in the tool's units along its shaft from the right hand. */
  leftHand: number;
  /** Values every key shares unless it sets its own. */
  base: Key;
  /** [time in the loop from 0 to 1, values]; the loop runs from the last key back to the first. */
  keys: Array<[number, Key]>;
}

/** The at-rest values a key starts from: standing straight, arms hanging, tool square in the hand. */
const REST: Key = { shLz: 0.08, shRz: -0.08, elL: -0.1, elR: -0.1, wrist: Math.PI / 2 };

/** The fighting stance both combat actions are built on: bladed, weapon up, the other arm across. */
const GUARD: Key = {
  bend: 0.1, twist: -0.24, hipL: -0.22, hipR: 0.14, kneeL: 0.32, kneeR: 0.2,
  shLx: -0.72, shLz: 0.46, elL: -1.6, shRx: -0.66, shRz: -0.34, elR: -1.48, wrist: 1.55, grip: 0,
};

/**
 * The skill actions. Each swings the tool with the right arm while the left hand holds the shaft:
 * chopping twists the waist and cuts across at chest height, mining raises the pick overhead and
 * bends at the hip to strike low, and net fishing crouches to dip the net and lift it out.
 */
const DEFS = {
  chop: {
    period: 1.8,
    impact: 0.42,
    leftHand: 0.13,
    base: { bend: 0.12, hipL: -0.14, hipR: 0.1, kneeL: 0.2, kneeR: 0.12, shLx: -0.9, elL: -1, grip: 1 },
    keys: [
      [0, { twist: -0.55, shRx: -1.5, shRz: -0.8, elR: -1.5, wrist: 1.3 }],
      [0.2, { twist: -0.62, shRx: -1.55, shRz: -0.9, elR: -1.65, wrist: 1.15 }],
      [0.42, { twist: 0.05, bend: 0.2, shRx: -1.45, shRz: -0.15, elR: -0.25, wrist: 3.1 }],
      [0.52, { twist: 0.08, bend: 0.22, shRx: -1.42, shRz: -0.12, elR: -0.3, wrist: 3.05 }],
      [0.76, { twist: -0.3, bend: 0.15, shRx: -1.5, shRz: -0.5, elR: -1.1, wrist: 2 }],
    ],
  },
  mine: {
    period: 1.8,
    impact: 0.58,
    leftHand: 0.13,
    base: { hipL: -0.18, hipR: 0.12, kneeL: 0.25, kneeR: 0.15, shLx: -1.2, elL: -1, grip: 1 },
    keys: [
      [0, { bend: 0.25, twist: -0.12, shRx: -1.9, shRz: -0.15, elR: -0.6, wrist: 1.8 }],
      [0.35, { bend: -0.08, twist: -0.25, shRx: -2.7, shRz: -0.3, elR: -0.9, wrist: 1.3, kneeL: 0.12, kneeR: 0.08 }],
      [0.58, { bend: 0.62, twist: 0.04, shRx: -0.95, shRz: -0.05, elR: -0.2, wrist: 2.5, hipL: -0.35, hipR: -0.05, kneeL: 0.42, kneeR: 0.3 }],
      [0.68, { bend: 0.6, shRx: -1, shRz: -0.05, elR: -0.28, wrist: 2.45, hipL: -0.33, hipR: -0.04, kneeL: 0.4, kneeR: 0.28 }],
    ],
  },
  net: {
    period: 2.4,
    impact: 0.3,
    leftHand: 0.16,
    base: { hipL: -0.35, hipR: -0.3, kneeL: 0.6, kneeR: 0.55, shLx: -1.2, elL: -0.6, grip: 1 },
    keys: [
      [0, { bend: 0.55, shRx: -1.3, elR: -0.35, wrist: 2.75 }],
      [0.3, { bend: 0.72, shRx: -1.27, elR: -0.15, wrist: 3.1, hipL: -0.45, hipR: -0.42, kneeL: 0.75, kneeR: 0.7 }],
      [0.55, { bend: 0.7, shRx: -1.1, elR: -0.3, wrist: 2.9, hipL: -0.46, hipR: -0.43, kneeL: 0.76, kneeR: 0.72 }],
      [0.8, { bend: 0.45, shRx: -1.35, elR: -0.6, wrist: 2.4 }],
    ],
  },
  /**
   * Squared up to something and waiting for the opening: weight on the back foot, body bladed, weapon
   * hand up and ready, the other arm across. It breathes rather than stands rigid.
   */
  guard: {
    period: 2.6,
    impact: 0.5,
    leftHand: 0,
    base: GUARD,
    keys: [
      [0, {}],
      [0.5, { bend: 0.12, shRx: -0.72, elR: -1.42, shLx: -0.78 }],
    ],
  },
  /**
   * One blow: wound up over the shoulder, brought down and across, then back to the guard. It starts
   * and ends on the guard pose, so it runs once without a jump at either end.
   */
  strike: {
    period: 0.55,
    impact: 0.45,
    leftHand: 0,
    base: GUARD,
    keys: [
      [0, {}],
      [0.18, { twist: -0.5, bend: 0.02, shRx: -2, shRz: -0.6, elR: -1.95, wrist: 1.05 }],
      // The arm never locks straight: an elbow left bent reads as a blow thrown, not a plank held out.
      [0.45, { twist: 0.26, bend: 0.28, shRx: -1.22, shRz: -0.1, elR: -0.52, wrist: 2.7, hipL: -0.3, kneeL: 0.4 }],
      [0.72, { twist: 0.06, bend: 0.2, shRx: -1.2, shRz: -0.24, elR: -0.95, wrist: 2.2 }],
    ],
  },
} satisfies Record<string, ActionDef>;

/** Actions that play once and stop, rather than looping while the character keeps at it. */
export const ONE_SHOT: ReadonlySet<string> = new Set(["strike"]);

export type ActionName = keyof typeof DEFS;
export const ACTION_NAMES = Object.keys(DEFS) as ActionName[];

export interface Action {
  period: number;
  impact: number;
  leftHand: number;
  times: number[];
  poses: Pose[];
}

function toPose(...layers: Key[]): Pose {
  const p = new Float64Array(CHANNELS);
  for (const layer of layers) for (const [k, v] of Object.entries(layer)) p[CH[k as Channel]] = v;
  return p;
}

export const ACTIONS: Record<ActionName, Action> = Object.fromEntries(
  Object.entries(DEFS).map(([name, d]) => [name, {
    period: d.period,
    impact: d.impact,
    leftHand: d.leftHand,
    times: d.keys.map(([t]) => t),
    poses: d.keys.map(([, k]) => toPose(REST, d.base, k)),
  }]),
) as Record<ActionName, Action>;

/**
 * The action's pose at `t` (0–1 through the loop) into `out`: a smooth curve through the keys (cubic
 * Hermite with Catmull-Rom slopes, wrapping round the loop), so swings flow instead of stopping at each key.
 */
export function samplePose(a: Action, t: number, out: Pose): Pose {
  const n = a.times.length;
  const time = (i: number) => a.times[((i % n) + n) % n]! + Math.floor(i / n) * 1;
  const pose = (i: number) => a.poses[((i % n) + n) % n]!;
  const u = ((t % 1) + 1) % 1;
  let k = n - 1;
  for (let i = 0; i < n; i++) if (a.times[i]! <= u) k = i;
  const t0 = time(k), t1 = time(k + 1), tPrev = time(k - 1), tNext = time(k + 2);
  const span = t1 - t0;
  const s = (u < t0 ? u + 1 : u) - t0;
  const x = span > 0 ? s / span : 0;
  const h00 = 2 * x ** 3 - 3 * x ** 2 + 1, h10 = x ** 3 - 2 * x ** 2 + x, h01 = -2 * x ** 3 + 3 * x ** 2, h11 = x ** 3 - x ** 2;
  const p0 = pose(k), p1 = pose(k + 1), pm = pose(k - 1), pn = pose(k + 2);
  for (let c = 0; c < CHANNELS; c++) {
    const m0 = ((p1[c]! - pm[c]!) / (t1 - tPrev)) * span, m1 = ((pn[c]! - p0[c]!) / (tNext - t0)) * span;
    out[c] = h00 * p0[c]! + h10 * m0 + h01 * p1[c]! + h11 * m1;
  }
  return out;
}
