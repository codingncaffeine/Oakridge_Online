// The heartland the settlements of Aldermarch stand on: the world's frame, where the district and the
// green are, and the two things every site built against the district has to agree with it on — the lie
// of the land and the river. Both are functions of world coordinates, so a site built beside another
// meets it at the seam with no step: the same corner gets the same number from either side.
import { boxOf, type Box } from "./map.ts";
import { valueNoise2D } from "./rng.ts";
import { smoothstep } from "./worldgen.ts";

/**
 * The world's frame (PLAN §7.1): regions 27–72 east and 34–65 north, 46 × 32 of them, with Oakridge dead
 * centre. It is what may be built; the sites are what is. Nothing outside a built region exists: it is
 * not drawn, and nobody can walk on it.
 */
export const FRAME = { x0: 27 * 64, y0: 34 * 64, width: 46 * 64, height: 32 * 64 };

/** The district: 192 × 192 tiles with its south-west corner at (3136, 3136). */
export const ORIGIN_X = 3136;
export const ORIGIN_Y = 3136;
export const SIZE = 192;
export const DISTRICT: Box = boxOf(ORIGIN_X, ORIGIN_Y, ORIGIN_X + SIZE - 1, ORIGIN_Y + SIZE - 1);

/** The green, and the spawn: the exact centre of region (50, 50). */
export const GREEN = { x: 3232, y: 3232 };

/** The Wend through the district: it runs the map's whole height at this x, give or take its drift. */
export const WEND = { x: 3258, width: 7 };

/**
 * The lie of the heartland: a ridge under the village falling east to the river and south to the sea,
 * rising west into the wood and east again into the quarry's dry ground, with the same lumps
 * everywhere. It is defined over the whole frame, and the ridge dies away north of the district, so
 * the ground a site north of it stands on is what the district's own ground was heading for.
 */
export function heartlandHeight(seed: number): (cx: number, cy: number) => number {
  const hills = valueNoise2D(seed), rough = valueNoise2D(seed + 101);
  return (cx, cy) => {
    const x = cx - ORIGIN_X, y = cy - ORIGIN_Y;
    const ridge = 3.4 * smoothstep(150, 96, Math.abs(y - 100)) * smoothstep(140, 92, Math.abs(x - 84));
    const toRiver = -2.6 * smoothstep(80, 128, x);
    const toSea = -3.2 * smoothstep(90, 24, y);
    const west = 2.2 * smoothstep(80, 8, x);
    const lumps = 2.4 * (0.6 * hills(x / 21, y / 21) + 0.3 * hills(x / 9 + 40, y / 9) + 0.1 * rough(x / 4, y / 4 + 40));
    return ridge + toRiver + toSea + west + lumps;
  };
}

const wobble = valueNoise2D(41);

/**
 * Where the Wend's centre and half-width are on one row: the numbers the district's river is cut with,
 * so a site continuing the river north of it starts exactly where the district's rows leave off.
 */
export function wendRow(y: number): { mid: number; half: number } {
  const drift = 4 * (wobble((y - ORIGIN_Y) / 28, 0.5) - 0.5);
  const half = WEND.width / 2 + 1.2 * (wobble(0.5, (y - ORIGIN_Y) / 17) - 0.5);
  return { mid: WEND.x + drift, half };
}

/**
 * A corner of the district's sea. Every water corner there stands at one level, so this one is the
 * sea's height for any site with a coast: the Sunder Sound is set to it, and a coast built later
 * against Wickstead reads the same number.
 */
export const SEA_CORNER = { x: 3232, y: 3138 };

const shoreWobble = valueNoise2D(47);

/**
 * Where the Sunder Sound's east shore is on one row: water lies west of it. A function of the world's
 * y, as the Wend's course is, so the sites along the coast — Wickstead now, Brinehaven south of it —
 * meet at their seam with one shore.
 */
export function soundShore(y: number): number {
  return 2886 + 5 * (shoreWobble(y / 23, 0.5) - 0.5);
}
