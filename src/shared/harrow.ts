// The Harrow (PLAN §7.6, Wave 3): the frontier north of Thornbury. A ditch and a wall straight across
// the built world at the Harrow's edge, crossed by the Ditch Road at the Harrow Gate — a gatehouse that
// stands open, a bridge over the ditch, and a warden who says what is past it — and beyond it seeded
// ground with its sites dropped in: heath and scrub, ruined towers, blackthorn just past the ditch (§8.2,
// WC 50), the heartoak grove deep in (WC 90, the ladder's top), drowned Gallowmere in the north-west, and
// the Broken Tower with the Rift under it (§8.5: two levels, band 60–90, starfall at Mining 78, the
// worst company on the map). No bank anywhere, on purpose; better ground and worse company the further
// north. It is not a player-versus-player area.
//
// Its site is regions 45–53 × 56–60. It shares its south row of corners with Deepdelve (x 2880–3071) and
// Thornbury (x 3072–3200), both built before it, and writes neither; the ground beside each is stitched to
// those values over eight rows (tests/harrow.test.ts builds the world with and without it and compares).
import { heartlandHeight } from "./heartland.ts";
import {
  OVERLAY_PATH, OVERLAY_WATER, REGION, regionOf, ROOF_NONE, underlayAt, UNDERLAY_DIRT, UNDERLAY_FOREST, UNDERLAY_GRASS, UNDERLAY_STONE,
} from "./map.ts";
import type { Area, MapIcon, MapLabel } from "./oakridge.ts";
import { valueNoise2D } from "./rng.ts";
import { cut } from "./thornbury.ts";
import {
  boxOf, building, corners, distanceToPolyline, easeAlong, inBox, road, scatter, smoothstep, STOREY, tower, WorldBuilder, type Box, type Point,
} from "./worldgen.ts";
import { TUNE } from "./tunes.ts";

/** The site: regions 45–53 × 56–60, tiles x 2880–3455 and y 3584–3903. */
export const HARROW: Box = boxOf(2880, 3584, 3455, 3903);
/** The south row of corners the neighbours wrote: Deepdelve's and Thornbury's, x 2880 to 3200. */
const SEAM_Y = 3584;
const SEAM_X1 = 3200;
/** The ditch: three rows of water across the whole site, and the wall on its north bank. */
export const DITCH = { y0: 3589, y1: 3591 };
export const WALL_Y = 3592;
/** The Harrow Gate, where the Ditch Road crosses: the bridge, the gap between the gatehouse's towers, and the towers. */
export const BRIDGE: Box = boxOf(3120, DITCH.y0, 3123, DITCH.y1);
export const GATE_GAP: Box = boxOf(3120, WALL_Y, 3123, WALL_Y);
const GATE_TOWERS: readonly Box[] = [boxOf(3117, WALL_Y, 3119, WALL_Y + 2), boxOf(3124, WALL_Y, 3126, WALL_Y + 2)];
/** The wall's towers along the north bank, every sixty tiles or so. */
const WALL_TOWERS: readonly Box[] = [2940, 3004, 3060, 3180, 3244, 3308, 3372, 3436].map((x) => boxOf(x, WALL_Y, x + 2, WALL_Y + 2));
/** The Ditch Road on from Thornbury's north edge, over the bridge and north to the crossroads; the tracks east to the Broken Tower and west to Gallowmere. */
export const DITCH_ROAD: Point[] = [[3122, 3584], [3122, 3612], [3148, 3660], [3190, 3708]];
export const EAST_TRACK: Point[] = [[3190, 3708], [3258, 3748], [3322, 3784], [3360, 3792], [3360, 3804]];
export const WEST_TRACK: Point[] = [[3190, 3708], [3100, 3758], [3002, 3818], [2932, 3858]];
/** Where the Ditch Road comes in over Thornbury's seam. */
export const ROAD_IN = { x: 3122, y: 3584 };
/** The blackthorn just past the ditch (§8.2, WC 50). */
export const BLACKTHORN = { x: 3006, y: 3622, r: 9 };
/** The heartoak grove deep in (§8.2, WC 90), in its clearing. */
export const GROVE = { x: 3424, y: 3852, r: 7 };
/** Gallowmere: the mere, and the drowned village round it. */
export const MERE = { x: 2912, y: 3872, r: 10 };
const GALLOWMERE: Box = boxOf(2892, 3852, 2934, 3894);
const DROWNED: readonly Box[] = [boxOf(2896, 3884, 2901, 3889), boxOf(2922, 3884, 2927, 3888), boxOf(2926, 3858, 2931, 3863), boxOf(2894, 3856, 2899, 3861)];
/** The ruined towers of the frontier: rings of broken wall with a gap and rubble in them. */
const RUINS: ReadonlyArray<{ x: number; y: number }> = [{ x: 3240, y: 3662 }, { x: 2982, y: 3742 }, { x: 3204, y: 3842 }];
/** The Broken Tower: three storeys of roofless keep with the Rift's stair inside, and the ring of its fallen outworks round it. */
export const BROKEN_TOWER: Box = boxOf(3357, 3805, 3363, 3811);
export const RIFT_STAIR = { x: 3360, y: 3808 };
const OUTWORKS: Box = boxOf(3351, 3799, 3369, 3817);
/** The Rift (§8.5): the region under the Broken Tower, its two levels, and what is in them. */
export const RIFT_REGION: Box = boxOf(regionOf(RIFT_STAIR.x) * REGION, regionOf(RIFT_STAIR.y) * REGION, regionOf(RIFT_STAIR.x) * REGION + REGION - 1, regionOf(RIFT_STAIR.y) * REGION + REGION - 1);
export const RIFT_PLANE = -1;
export const DEEP_RIFT_PLANE = -2;
export const RIFT_ROOMS: readonly Box[] = [boxOf(3356, 3804, 3364, 3812), boxOf(3365, 3798, 3372, 3806), boxOf(3373, 3790, 3380, 3800), boxOf(3381, 3784, 3388, 3794)];
export const RIFT_DOWN = { x: 3385, y: 3788 };
export const DEEP_RIFT_ROOMS: readonly Box[] = [boxOf(3380, 3784, 3389, 3793), boxOf(3340, 3778, 3379, 3800)];
export const RIFT_CHEST = { x: 3341, y: 3799 };
export const STARFALL: ReadonlyArray<{ x: number; y: number }> = [{ x: 3340, y: 3782 }, { x: 3340, y: 3788 }, { x: 3340, y: 3794 }, { x: 3350, y: 3778 }];
/** Who is in the Rift, each at a written tile: hounds and the sworn above, the wraiths below with them. */
export const RIFT_DWELLERS: ReadonlyArray<readonly [string, number, number, number]> = [
  ["rift_hound", RIFT_PLANE, 3362, 3806], ["rift_hound", RIFT_PLANE, 3368, 3802], ["rift_hound", RIFT_PLANE, 3376, 3796], ["rift_hound", RIFT_PLANE, 3384, 3790],
  ["rift_sworn", RIFT_PLANE, 3370, 3800], ["rift_sworn", RIFT_PLANE, 3378, 3794],
  ["rift_hound", DEEP_RIFT_PLANE, 3370, 3790], ["rift_hound", DEEP_RIFT_PLANE, 3352, 3796], ["rift_sworn", DEEP_RIFT_PLANE, 3360, 3784], ["rift_sworn", DEEP_RIFT_PLANE, 3346, 3790],
  ["rift_wraith", DEEP_RIFT_PLANE, 3344, 3782], ["rift_wraith", DEEP_RIFT_PLANE, 3348, 3796],
];

export function buildHarrow(b: WorldBuilder, seed: number): void {
  b.clip = HARROW;
  terrain(b, seed);
  ditch(b);
  roads(b);
  gate(b);
  gallowmere(b);
  ruins(b);
  brokenTower(b);
  rift(b);
  groves(b);
  wilderness(b, seed);
  creatures(b);
  lying(b);
}

// --- Ground ------------------------------------------------------------------------------------------

/** Whether a corner is this site's to write: the neighbours' south row is not. */
const ours = (cx: number, cy: number): boolean => !(cy === SEAM_Y && cx <= SEAM_X1);

/**
 * The ground: the heartland's own height with the Harrow's long rolling hills on it, rising as it goes
 * north, a few tors of bare stone, and the stitch to the neighbours' row — over eight rows, and carried
 * sixteen tiles on past Thornbury's east end so the row runs on where nobody's row meets it.
 */
function terrain(b: WorldBuilder, seed: number): void {
  const raw = heartlandHeight(seed), hills = valueNoise2D(seed + 1201), tors = valueNoise2D(seed + 1202);
  for (let cy = HARROW.y0; cy <= HARROW.y1 + 1; cy++) {
    for (let cx = HARROW.x0; cx <= HARROW.x1 + 1; cx++) {
      if (!ours(cx, cy)) continue;
      let h = raw(cx, cy);
      const into = smoothstep(SEAM_Y, SEAM_Y + 40, cy);
      h += (3.5 * hills(cx / 37, cy / 37) + 1.2 * hills(cx / 11 + 50, cy / 11)) * into + 2 * smoothstep(3600, 3900, cy);
      // A tor gives way to the tracks: level where one runs and full height a few tiles off it, so a track
      // goes through the rock instead of over it (the user's report, 2026-09-25: a way that climbs like a
      // cliff reads as somewhere nobody can go).
      const tor = smoothstep(0.78, 0.9, tors(cx / 23, cy / 23));
      if (tor > 0) h += 4 * tor * into * smoothstep(2, 7, trackDistance(cx, cy));
      const seam = Math.min(cx, SEAM_X1);
      const weight = smoothstep(SEAM_Y + 9, SEAM_Y + 1, cy) * smoothstep(SEAM_X1 + 16, SEAM_X1, cx);
      if (weight > 0) h += (b.heightAtCorner(0, seam, SEAM_Y) - h) * weight;
      b.setHeight(0, cx, cy, h);
    }
  }
  for (let y = HARROW.y0; y <= HARROW.y1; y++) {
    for (let x = HARROW.x0; x <= HARROW.x1; x++) {
      const tor = smoothstep(0.78, 0.9, tors(x / 23, y / 23)) * smoothstep(SEAM_Y, SEAM_Y + 40, y);
      const stone = tor > 0.6 && !nearSite(x, y);
      b.setUnderlay(0, x, y, stone ? UNDERLAY_STONE : UNDERLAY_GRASS);
      if (stone) b.plane(0).collision.block(x, y);
    }
  }
}

/** How far a corner is from the nearest of the Harrow's ways: the Ditch Road and the two tracks off it. */
function trackDistance(cx: number, cy: number): number {
  return Math.min(distanceToPolyline(cx, cy, DITCH_ROAD), distanceToPolyline(cx, cy, EAST_TRACK), distanceToPolyline(cx, cy, WEST_TRACK));
}

/** Whether a tile is on or near one of the sites dropped into the heath: no tor stands there, whatever the seed says. */
function nearSite(x: number, y: number): boolean {
  const near = (box: Box, pad: number) => x >= box.x0 - pad && x <= box.x1 + pad && y >= box.y0 - pad && y <= box.y1 + pad;
  return y <= WALL_Y + 8 || near(GALLOWMERE, 4) || near(OUTWORKS, 4) || Math.hypot(x - GROVE.x, y - GROVE.y) <= GROVE.r + 4 ||
    Math.hypot(x - BLACKTHORN.x, y - BLACKTHORN.y) <= BLACKTHORN.r + 4 || RUINS.some((r) => Math.abs(x - r.x) <= 7 && Math.abs(y - r.y) <= 7);
}

/** Whether a tile is a tor's bare stone: blocked, and nothing stands on it. */
const isTor = (b: WorldBuilder, x: number, y: number): boolean => underlayAt(b.plane(0), x, y) === UNDERLAY_STONE;

/**
 * The Harrow Ditch: three rows of water straight across the site, each column's water a hand under its
 * lower bank so it lies in the ground as the ground lies, and the wall along the north bank with a tower
 * every sixty tiles — the one gap in it the Harrow Gate's.
 */
function ditch(b: WorldBuilder): void {
  for (let x = HARROW.x0; x <= HARROW.x1; x++) {
    const bank = Math.min(b.heightAtCorner(0, x, DITCH.y0 - 1), b.heightAtCorner(0, x + 1, DITCH.y0 - 1), b.heightAtCorner(0, x, WALL_Y + 1), b.heightAtCorner(0, x + 1, WALL_Y + 1));
    for (let y = DITCH.y0; y <= DITCH.y1; y++) {
      b.setOverlay(0, x, y, OVERLAY_WATER);
      b.setUnderlay(0, x, y, UNDERLAY_DIRT);
      b.plane(0).collision.block(x, y);
    }
    for (let cy = DITCH.y0; cy <= DITCH.y1 + 1; cy++) for (const cx of [x, x + 1]) if (cx <= HARROW.x1 + 1) b.setHeight(0, cx, cy, bank - 0.9);
  }
  const skip = (x: number) => inBox(GATE_GAP, x, WALL_Y) || [...GATE_TOWERS, ...WALL_TOWERS].some((t) => x >= t.x0 && x <= t.x1);
  for (let x = HARROW.x0; x <= HARROW.x1; x++) if (!skip(x)) b.place(0, "stone_wall", x, WALL_Y, { side: 2 });
  for (const box of WALL_TOWERS) tower(b, box, [{ side: 2, along: 1 }, { side: 0, along: 1 }]);
}

function roads(b: WorldBuilder): void {
  road(b, 0, DITCH_ROAD, 1.3);
  road(b, 0, EAST_TRACK, 1.0);
  road(b, 0, WEST_TRACK, 1.0);
  for (let y = HARROW.y0; y <= HARROW.y1; y++) {
    for (let x = HARROW.x0; x <= HARROW.x1; x++) {
      if (b.overlayAt(0, x, y) !== OVERLAY_PATH) continue;
      b.setUnderlay(0, x, y, UNDERLAY_DIRT);
      // A track runs round a tor, not through it: the stone gives way where the road goes.
      b.plane(0).collision.unblock(x, y);
    }
  }
}

/**
 * The Harrow Gate: the bridge over the ditch, railed on its open sides and level with the road's ends,
 * the gatehouse's two towers either side of the gap in the wall — the gap stands open: the frontier is
 * crossed, not unlocked — and the ditch warden on the near bank.
 */
function gate(b: WorldBuilder): void {
  const level = Math.max(b.heightAtCorner(0, BRIDGE.x0, BRIDGE.y0), b.heightAtCorner(0, BRIDGE.x0, BRIDGE.y1 + 1));
  for (let y = BRIDGE.y0; y <= BRIDGE.y1; y++) {
    for (let x = BRIDGE.x0; x <= BRIDGE.x1; x++) {
      b.setOverlay(0, x, y, OVERLAY_PATH);
      b.plane(0).collision.unblock(x, y);
    }
  }
  for (let cy = BRIDGE.y0; cy <= BRIDGE.y1 + 1; cy++) for (let cx = BRIDGE.x0; cx <= BRIDGE.x1 + 1; cx++) b.setHeight(0, cx, cy, Math.max(level, b.heightAtCorner(0, cx, cy)));
  for (let y = BRIDGE.y0; y <= BRIDGE.y1; y++) {
    b.place(0, "fence", BRIDGE.x0, y, { side: 3 });
    b.place(0, "fence", BRIDGE.x1, y, { side: 1 });
  }
  // The road comes up off the bridge through the gate at a walkable grade, not over a hump in the gap; eased
  // before the towers stand, so they are levelled to the ground the road now runs on.
  easeAlong(b, [[ROAD_IN.x, WALL_Y], [ROAD_IN.x, WALL_Y + 12]], 2.5, 3, undefined, level);
  for (const box of GATE_TOWERS) tower(b, box, [{ side: 2, along: 1 }, { side: 0, along: 1 }]);
  b.spawnMonster({ monster: "ditch_warden", x: 3119, y: 3587 });
  b.place(0, "signpost", 3125, 3587);
}

// --- The sites dropped in ------------------------------------------------------------------------------

/** Gallowmere: a mere where a village was, its cottages' walls standing roofless round the water, and graves. */
function gallowmere(b: WorldBuilder): void {
  for (let y = MERE.y - MERE.r - 1; y <= MERE.y + MERE.r + 1; y++) {
    for (let x = MERE.x - MERE.r - 1; x <= MERE.x + MERE.r + 1; x++) {
      const d = Math.hypot(x + 0.5 - MERE.x, y + 0.5 - MERE.y);
      if (d > MERE.r) continue;
      b.setOverlay(0, x, y, OVERLAY_WATER);
      b.plane(0).collision.block(x, y);
    }
  }
  let low = Infinity;
  for (let cy = MERE.y - MERE.r - 2; cy <= MERE.y + MERE.r + 2; cy++) {
    for (let cx = MERE.x - MERE.r - 2; cx <= MERE.x + MERE.r + 2; cx++) {
      if (Math.hypot(cx - MERE.x, cy - MERE.y) > MERE.r + 1.5) continue;
      low = Math.min(low, b.heightAtCorner(0, cx, cy));
    }
  }
  for (let cy = MERE.y - MERE.r; cy <= MERE.y + MERE.r + 1; cy++) {
    for (let cx = MERE.x - MERE.r; cx <= MERE.x + MERE.r + 1; cx++) {
      if (Math.hypot(cx - MERE.x, cy - MERE.y) <= MERE.r + 0.2) b.setHeight(0, cx, cy, low - 0.4);
    }
  }
  for (const box of DROWNED) {
    for (let x = box.x0; x <= box.x1; x++) {
      if (x !== box.x0 + 2) b.place(0, "stone_wall", x, box.y0, { side: 2, tag: "ruin" });
      b.place(0, "stone_wall", x, box.y1, { side: 0, tag: "ruin" });
    }
    for (let y = box.y0; y <= box.y1; y++) {
      b.place(0, "stone_wall", box.x0, y, { side: 3, tag: "ruin" });
      b.place(0, "stone_wall", box.x1, y, { side: 1, tag: "ruin" });
    }
    for (let y = box.y0; y <= box.y1; y++) for (let x = box.x0; x <= box.x1; x++) b.setUnderlay(0, x, y, UNDERLAY_DIRT);
  }
  for (const [x, y] of [[2906, 3890], [2910, 3891], [2914, 3890], [2918, 3891], [2935, 3872], [2936, 3876]] as const) b.place(0, "grave", x, y);
  b.place(0, "well", 2891, 3872);
}

/** The ruined towers of the frontier: a ring of broken wall with a gap, and rubble inside. */
function ruins(b: WorldBuilder): void {
  for (const at of RUINS) {
    const box = boxOf(at.x - 3, at.y - 3, at.x + 3, at.y + 3);
    for (let x = box.x0; x <= box.x1; x++) {
      if (x !== at.x) b.place(0, "stone_wall", x, box.y0, { side: 2, tag: "ruin" });
      b.place(0, "stone_wall", x, box.y1, { side: 0, tag: "ruin" });
    }
    for (let y = box.y0; y <= box.y1; y++) {
      b.place(0, "stone_wall", box.x0, y, { side: 3, tag: "ruin" });
      b.place(0, "stone_wall", box.x1, y, { side: 1, tag: "ruin" });
    }
    for (let y = box.y0; y <= box.y1; y++) for (let x = box.x0; x <= box.x1; x++) b.setUnderlay(0, x, y, UNDERLAY_DIRT);
    b.place(0, "rock", at.x - 1, at.y + 1);
    b.place(0, "rock", at.x + 2, at.y - 1);
  }
}

/** The Broken Tower: three storeys of keep with its roof gone, the Rift's stair inside it, and its fallen outworks in a ring round it. */
function brokenTower(b: WorldBuilder): void {
  for (let y = OUTWORKS.y0; y <= OUTWORKS.y1; y++) for (let x = OUTWORKS.x0; x <= OUTWORKS.x1; x++) b.setUnderlay(0, x, y, UNDERLAY_DIRT);
  building(b, { box: BROKEN_TOWER, doors: [{ side: 2, along: 3 }], windows: [{ side: 3, along: 3 }, { side: 1, along: 3 }, { side: 0, along: 3 }], floor: UNDERLAY_DIRT, height: 3, style: "keep" });
  // Its roof is long gone: the builder always gives a building one, so this one's is taken back off, and
  // inside is open to the sky, as a gatehouse's passage is — nothing to lift when someone steps in.
  for (let y = BROKEN_TOWER.y0; y <= BROKEN_TOWER.y1; y++) {
    for (let x = BROKEN_TOWER.x0; x <= BROKEN_TOWER.x1; x++) {
      b.setRoof(0, x, y, ROOF_NONE);
      b.setIndoors(0, x, y, 0);
    }
  }
  b.place(0, "stairs", RIFT_STAIR.x, RIFT_STAIR.y, { to: RIFT_PLANE });
  // Fallen stretches along each side, counted along that side only; the track comes in through the gap on the tower's own line.
  const gapAlong = (x: number) => (x - OUTWORKS.x0) % 5 === 3 || x === RIFT_STAIR.x;
  const gapDown = (y: number) => (y - OUTWORKS.y0) % 7 === 4;
  for (let x = OUTWORKS.x0; x <= OUTWORKS.x1; x++) {
    if (!gapAlong(x)) b.place(0, "stone_wall", x, OUTWORKS.y0, { side: 2, tag: "ruin" });
    if (!gapAlong(x)) b.place(0, "stone_wall", x, OUTWORKS.y1, { side: 0, tag: "ruin" });
  }
  for (let y = OUTWORKS.y0; y <= OUTWORKS.y1; y++) {
    if (!gapDown(y)) b.place(0, "stone_wall", OUTWORKS.x0, y, { side: 3, tag: "ruin" });
    if (!gapDown(y)) b.place(0, "stone_wall", OUTWORKS.x1, y, { side: 1, tag: "ruin" });
  }
  for (const [x, y] of [[3353, 3802], [3366, 3814], [3355, 3814], [3367, 3801], [3352, 3810]] as const) b.place(0, "rock", x, y);
}

/** The Rift (§8.5): two levels cut under the Broken Tower, the starfall at the bottom (Mining 78) and the chest by it. */
function rift(b: WorldBuilder): void {
  const surface = b.heightAtCorner(0, RIFT_STAIR.x, RIFT_STAIR.y);
  cut(b, RIFT_PLANE, RIFT_REGION, RIFT_ROOMS, surface - 2 * STOREY, () => true);
  cut(b, DEEP_RIFT_PLANE, RIFT_REGION, DEEP_RIFT_ROOMS, surface - 4 * STOREY, () => true);
  b.place(RIFT_PLANE, "stairs", RIFT_STAIR.x, RIFT_STAIR.y, { to: 0 });
  b.place(RIFT_PLANE, "stairs", RIFT_DOWN.x, RIFT_DOWN.y, { to: DEEP_RIFT_PLANE });
  b.place(DEEP_RIFT_PLANE, "stairs", RIFT_DOWN.x, RIFT_DOWN.y, { to: RIFT_PLANE });
  for (const s of STARFALL) b.place(DEEP_RIFT_PLANE, "starfall_rock", s.x, s.y);
  b.place(DEEP_RIFT_PLANE, "chest", RIFT_CHEST.x, RIFT_CHEST.y, { tag: "rift" });
  for (const [plane, x, y] of [[RIFT_PLANE, 3376, 3799], [DEEP_RIFT_PLANE, 3362, 3792], [DEEP_RIFT_PLANE, 3372, 3782]] as const) b.place(plane, "rock", x, y);
  for (const [monster, plane, x, y] of RIFT_DWELLERS) b.spawnMonster({ monster, x, y, plane });
}

/** The ladders' rungs out here: the blackthorn just past the ditch (WC 50), and the heartoak grove in its clearing deep in (WC 90). */
function groves(b: WorldBuilder): void {
  const clear = (x: number, y: number) => b.overlayAt(0, x, y) === 0 && !isTor(b, x, y);
  scatter(b, 0, "blackthorn", BLACKTHORN, 8, clear);
  for (let y = GROVE.y - GROVE.r; y <= GROVE.y + GROVE.r; y++) {
    for (let x = GROVE.x - GROVE.r; x <= GROVE.x + GROVE.r; x++) {
      if (Math.hypot(x + 0.5 - GROVE.x, y + 0.5 - GROVE.y) <= GROVE.r && b.overlayAt(0, x, y) === 0 && !isTor(b, x, y)) b.setUnderlay(0, x, y, UNDERLAY_FOREST);
    }
  }
  scatter(b, 0, "heartoak", { ...GROVE, r: GROVE.r - 2 }, 4, clear);
}

/** The heath: scrub, dead trees and rock, trees thickening north, nothing on the roads, the ruins, the ditch's banks or the sites. */
function wilderness(b: WorldBuilder, seed: number): void {
  const grain = valueNoise2D(seed + 1203);
  const kept = (x: number, y: number) =>
    y <= WALL_Y + 3 || inBox(GALLOWMERE, x, y) || inBox(OUTWORKS, x, y) || Math.hypot(x - GROVE.x, y - GROVE.y) <= GROVE.r ||
    Math.hypot(x - BLACKTHORN.x, y - BLACKTHORN.y) <= BLACKTHORN.r || RUINS.some((r) => Math.abs(x - r.x) <= 4 && Math.abs(y - r.y) <= 4);
  for (let y = HARROW.y0; y <= HARROW.y1; y++) {
    for (let x = HARROW.x0; x <= HARROW.x1; x++) {
      if (!b.free(0, x, y) || b.overlayAt(0, x, y) !== 0 || kept(x, y)) continue;
      if (underlayAt(b.plane(0), x, y) !== UNDERLAY_GRASS) continue;
      const north = smoothstep(3600, 3880, y);
      const trees = (0.015 + 0.05 * north) * grain(x / 13, y / 13);
      const roll = b.rand();
      if (roll < trees) b.place(0, b.rand() < 0.3 ? "oak" : "tree", x, y);
      else if (roll < trees + 0.012) b.place(0, "bush", x, y);
      else if (roll < trees + 0.018) b.place(0, "dead_tree", x, y);
      else if (roll < trees + 0.024) b.place(0, "rock", x, y);
    }
  }
}

/** Who lives out here, worse the further north: wolves, boars and raiders by the ditch, the one highwayman on the road, the dead in the middle, and the barrow's kind and worse deep in. */
function creatures(b: WorldBuilder): void {
  const herds: Array<[string, number, number, number, number]> = [
    ["grey_wolf", 5, 3060, 3640, 12],
    ["wild_boar", 4, 3250, 3630, 12],
    ["mudfoot_raider", 4, 2960, 3660, 10],
    ["highwayman", 1, 3140, 3650, 3],
    ["ruin_skeleton", 5, 3240, 3662, 6],
    ["ruin_skeleton", 4, 2982, 3742, 6],
    ["grave_shambler", 4, 3100, 3740, 10],
    ["quarry_brute", 2, 3300, 3720, 8],
    ["grave_shambler", 3, 2912, 3850, 8],
    ["barrow_warden", 3, 3204, 3842, 8],
    ["ash_wight", 2, 3330, 3830, 8],
    ["delve_haunt", 2, 3420, 3866, 6],
  ];
  const taken = new Set<number>();
  for (const [monster, count, cx, cy, r] of herds) {
    for (let placed = 0, tries = 0; placed < count && tries < 200; tries++) {
      const x = Math.round(cx + (b.rand() * 2 - 1) * r), y = Math.round(cy + (b.rand() * 2 - 1) * r);
      const key = y * 4096 + x;
      if (taken.has(key) || !b.free(0, x, y) || y <= WALL_Y) continue;
      taken.add(key);
      b.spawnMonster({ monster, x, y, plane: 0 });
      placed++;
    }
  }
}

/** What lies about: bones by the ruins, a coin purse at the Broken Tower's door, logs at the blackthorn. */
function lying(b: WorldBuilder): void {
  const spawns: Array<[string, number, number, number, number]> = [
    ["bones", 2, 3240, 3662, 200],
    ["coins", 25, 3360, 3802, 300],
    ["blackthorn_logs", 1, BLACKTHORN.x, BLACKTHORN.y - BLACKTHORN.r - 2, 300],
  ];
  for (const [item, count, x, y, respawn] of spawns) {
    const at = freeNear(b, 0, x, y);
    if (at) b.spawnItem({ item, count, x: at.x, y: at.y, respawn, plane: 0 });
  }
}

/** The tile asked for, or the nearest free land tile within five rings. */
function freeNear(b: WorldBuilder, plane: number, x: number, y: number): { x: number; y: number } | null {
  for (let ring = 0; ring <= 5; ring++) {
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        if (b.free(plane, x + dx, y + dy) && b.overlayAt(plane, x + dx, y + dy) !== OVERLAY_WATER) return { x: x + dx, y: y + dy };
      }
    }
  }
  return null;
}

// --- What the district's tables gain from the site ----------------------------------------------------

export const RIFT_AREA: Area = { key: "rift", name: "The Rift", track: TUNE.danger };
export const HARROW_AREAS: ReadonlyArray<{ area: Area; box: Box }> = [
  { area: { key: "harrowgate", name: "The Harrow Gate", track: TUNE.danger }, box: boxOf(3108, 3584, 3136, 3600) },
  { area: { key: "gallowmere", name: "Gallowmere", track: TUNE.water }, box: GALLOWMERE },
  { area: { key: "brokentower", name: "The Broken Tower", track: TUNE.danger }, box: OUTWORKS },
  { area: { key: "harrow", name: "The Harrow", track: TUNE.danger }, box: HARROW },
];

export const HARROW_LABELS: MapLabel[] = [
  { name: "The Harrow", x: 3180, y: 3764 },
  { name: "The Harrow Ditch", x: 3006, y: 3598, small: true },
  { name: "The Harrow Gate", x: 3122, y: 3602, small: true },
  { name: "The Broken Tower", x: 3360, y: 3822 },
  { name: "Gallowmere", x: 2912, y: 3898 },
  { name: "The heartoak grove", x: 3424, y: 3866, small: true },
  { name: "Blackthorn", x: BLACKTHORN.x, y: BLACKTHORN.y + 12, small: true },
];

export const HARROW_MARKS: Array<{ icon: MapIcon; x: number; y: number; name: string }> = [
  { icon: "gate", x: 3122, y: WALL_Y, name: "The Harrow Gate" },
  { icon: "mine", x: RIFT_STAIR.x, y: RIFT_STAIR.y, name: "The Rift" },
  { icon: "tree", x: GROVE.x, y: GROVE.y, name: "Heartoak" },
  { icon: "tree", x: BLACKTHORN.x, y: BLACKTHORN.y, name: "Blackthorn" },
  { icon: "quest", x: MERE.x, y: MERE.y, name: "Gallowmere" },
];

/** Named boxes, for the tests and the map. */
export const HARROW_SITES: Record<string, Box> = { harrow: HARROW, gallowmere: GALLOWMERE, brokentower: OUTWORKS };
