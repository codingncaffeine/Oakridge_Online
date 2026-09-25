// Deepdelve and Hollow Pass (PLAN §7.6, the first site of Wave 3): the Greycaps — the western range,
// impassable but for the pass — the Kingsway west out of Thornbury's gate to the pass, its toll house and
// the barred gate onto the Caldmoor Road (Wave 4's), the Delve Road north from the pass to Deepdelve,
// the town at the range's east foot: the fifth bank, a smithy whose two white furnaces run hot enough for
// everything (§8.3: starfall smelts here and nowhere else), Delve Tools, the Pick and Lantern, five
// houses, the well, and in the cliff the mouth of Deepdelve Mine (§8.5): three levels under the mountain
// — coal and silver, coldiron, and the gold vault with its haunt and its chest (Mining 22, 33, 41 and 44:
// four rungs of §8.3's ladder in one hill), each level worse company than the one above.
//
// Its site is regions 44–47 × 53–55, west of Thornbury and north of the Greycaps' foot Wickstead built.
// Built on the same builder after the isle and before the Adit, so every id and roll of the sites before
// it stands; Thornbury's column of corners at x 3072 and the foothills' row at y 3392 are never written,
// and the ground beside each is stitched to those values over eight tiles (tests/deepdelve.test.ts
// builds the world with and without this and compares every one of them).
import { heartlandHeight } from "./heartland.ts";
import {
  OVERLAY_PATH, OVERLAY_WATER, ROOF_KEEP, ROOF_SLATE, underlayAt, UNDERLAY_DIRT, UNDERLAY_GRASS, UNDERLAY_STONE,
} from "./map.ts";
import type { Area, MapExit, MapIcon, MapLabel } from "./oakridge.ts";
import { valueNoise2D } from "./rng.ts";
import { cut } from "./thornbury.ts";
import {
  bank, boxOf, building, inBox, road, scatter, shop, smoothstep, STOREY, tower, WorldBuilder, type Box, type DoorSpec, type Point,
} from "./worldgen.ts";
import { TUNE } from "./tunes.ts";

/** The site: regions 44–47 × 53–55, tiles x 2816–3071 and y 3392–3583. */
export const DEEPDELVE_SITE: Box = boxOf(2816, 3392, 3071, 3583);
/** The range rises west of its foot to its full height at the wall. */
const RANGE_FOOT = 2896;
const RANGE_WALL = 2848;
/** The foothills' corners on the seam row, which Wickstead wrote: x 2880 to 3008 at y 3392. */
const FOOT_X0 = 2880;
const FOOT_X1 = 3008;
const SEAM_Y = 3392;
/** Hollow Pass: the gap through the range on this row. */
export const PASS = { y: 3424, half: 6 };
export const PASS_BOX: Box = boxOf(2816, 3408, 2895, 3440);
/** The gate across the pass, on the west edge of this column, with a tower either side of the road. */
export const PASS_GATE = { x: 2838, y: 3424 };
const GATE_TOWERS: readonly Box[] = [boxOf(2838, 3420, 2840, 3422), boxOf(2838, 3425, 2840, 3427)];
/** The toll house north of the road, where the pass keeper counts who goes by. */
export const TOLL_HOUSE: Box = boxOf(2852, 3426, 2859, 3432);
/** The town at the range's foot, and its square. */
export const TOWN: Box = boxOf(2884, 3524, 2943, 3579);
export const SQUARE = { x: 2912, y: 3548 };
export const WELL = { x: 2908, y: 3551 };
export const BANK: Box = boxOf(2916, 3552, 2927, 3560);
export const SMITHY: Box = boxOf(2896, 3552, 2907, 3560);
/** The two white furnaces, hot enough for everything, and the anvils before them. */
export const FURNACES: ReadonlyArray<{ x: number; y: number }> = [{ x: 2898, y: 3559 }, { x: 2905, y: 3559 }];
const ANVILS: ReadonlyArray<{ x: number; y: number }> = [{ x: 2899, y: 3555 }, { x: 2904, y: 3555 }];
/** Delve Tools, on the square's south-east, and the Pick and Lantern on its south-west. */
export const TOOLS: Box = boxOf(2916, 3534, 2925, 3542);
export const INN: Box = boxOf(2896, 3533, 2908, 3543);
export const HOUSES: ReadonlyArray<readonly [Box, DoorSpec]> = [
  [boxOf(2933, 3534, 2938, 3539), { side: 3, along: 2 }],
  [boxOf(2933, 3543, 2938, 3548), { side: 3, along: 2 }],
  [boxOf(2933, 3552, 2938, 3557), { side: 3, along: 2 }],
  [boxOf(2933, 3561, 2938, 3566), { side: 3, along: 2 }],
  [boxOf(2933, 3570, 2938, 3575), { side: 3, along: 2 }],
];
/** The mine's mouth in the cliff at the town's west side, on the west edge of this tile; the box under the mountain the workings are cut into. */
export const MINE_MOUTH = { x: 2877, y: 3548 };
export const MINE_BOX: Box = boxOf(2816, 3520, 2943, 3583);
export const COAL_PLANE = -1;
export const COLDIRON_PLANE = -2;
export const GOLD_PLANE = -3;
/** The first level: the drift in from the mouth, the coal gallery, a passage, the silver chamber and the stair down in its corner. */
export const COAL_ROOMS: readonly Box[] = [boxOf(2862, 3547, 2877, 3549), boxOf(2846, 3538, 2861, 3556), boxOf(2838, 3546, 2845, 3548), boxOf(2822, 3540, 2837, 3556)];
export const COAL_STAIR = { x: 2825, y: 3543 };
/** The second: the landing, a long gallery east, and the two coldiron chambers off it, the stair down at the gallery's end. */
export const COLDIRON_ROOMS: readonly Box[] = [boxOf(2822, 3540, 2837, 3556), boxOf(2838, 3547, 2900, 3549), boxOf(2860, 3550, 2874, 3564), boxOf(2880, 3530, 2896, 3546)];
export const COLDIRON_STAIR = { x: 2898, y: 3548 };
/** The third: the landing and the gold vault, its haunt, and the chest. */
export const GOLD_ROOMS: readonly Box[] = [boxOf(2892, 3540, 2903, 3556), boxOf(2904, 3530, 2936, 3566)];
export const GOLD_CHEST = { x: 2935, y: 3565 };
/** The ore (§8.3): coal and silver on the first level, coldiron on the second, gold on the third. */
export const ORE: ReadonlyArray<{ plane: number; kind: "coal_rock" | "silver_rock" | "coldiron_rock" | "gold_rock"; x: number; y: number }> = [
  { plane: COAL_PLANE, kind: "coal_rock", x: 2848, y: 3556 }, { plane: COAL_PLANE, kind: "coal_rock", x: 2853, y: 3556 }, { plane: COAL_PLANE, kind: "coal_rock", x: 2858, y: 3556 },
  { plane: COAL_PLANE, kind: "coal_rock", x: 2846, y: 3542 }, { plane: COAL_PLANE, kind: "coal_rock", x: 2846, y: 3552 },
  { plane: COAL_PLANE, kind: "silver_rock", x: 2822, y: 3546 }, { plane: COAL_PLANE, kind: "silver_rock", x: 2822, y: 3552 }, { plane: COAL_PLANE, kind: "silver_rock", x: 2830, y: 3556 }, { plane: COAL_PLANE, kind: "silver_rock", x: 2836, y: 3540 },
  { plane: COLDIRON_PLANE, kind: "coldiron_rock", x: 2860, y: 3556 }, { plane: COLDIRON_PLANE, kind: "coldiron_rock", x: 2867, y: 3564 }, { plane: COLDIRON_PLANE, kind: "coldiron_rock", x: 2874, y: 3558 },
  { plane: COLDIRON_PLANE, kind: "coldiron_rock", x: 2884, y: 3530 }, { plane: COLDIRON_PLANE, kind: "coldiron_rock", x: 2893, y: 3530 },
  { plane: GOLD_PLANE, kind: "gold_rock", x: 2936, y: 3536 }, { plane: GOLD_PLANE, kind: "gold_rock", x: 2936, y: 3546 }, { plane: GOLD_PLANE, kind: "gold_rock", x: 2936, y: 3556 }, { plane: GOLD_PLANE, kind: "gold_rock", x: 2920, y: 3530 },
];
/** Who works the dark, each at a written tile: bats, rats and the brute on the first level; skeletons, shamblers and delve rats on the second; shamblers, rats and the haunt in the vault. */
export const BELOW: ReadonlyArray<readonly [string, number, number, number]> = [
  ["giant_rat", COAL_PLANE, 2873, 3548], ["giant_rat", COAL_PLANE, 2866, 3549], ["cave_bat", COAL_PLANE, 2870, 3547], ["cave_bat", COAL_PLANE, 2856, 3540],
  ["cave_bat", COAL_PLANE, 2850, 3552], ["cave_bat", COAL_PLANE, 2830, 3544], ["quarry_brute", COAL_PLANE, 2854, 3548], ["giant_rat", COAL_PLANE, 2832, 3552],
  ["ruin_skeleton", COLDIRON_PLANE, 2846, 3548], ["ruin_skeleton", COLDIRON_PLANE, 2868, 3558], ["ruin_skeleton", COLDIRON_PLANE, 2886, 3542],
  ["grave_shambler", COLDIRON_PLANE, 2864, 3562], ["grave_shambler", COLDIRON_PLANE, 2892, 3534], ["delve_rat", COLDIRON_PLANE, 2876, 3548], ["delve_rat", COLDIRON_PLANE, 2830, 3550],
  ["grave_shambler", GOLD_PLANE, 2910, 3538], ["grave_shambler", GOLD_PLANE, 2928, 3550], ["delve_rat", GOLD_PLANE, 2916, 3560], ["delve_haunt", GOLD_PLANE, 2930, 3562],
];

/** The Kingsway from Thornbury's west gate to the pass and through it to the site's edge; the Delve Road from the pass up to the square and the mouth. */
export const KINGSWAY: Point[] = [[3072, 3524], [3040, 3512], [2996, 3478], [2944, 3446], [2896, 3428], [2880, 3424], [2816, 3424]];
export const DELVE_ROAD: Point[] = [[2880, 3424], [2890, 3460], [2900, 3500], [2912, 3522], [2912, 3548], [2878, 3548]];
/** Where the Kingsway comes in over Thornbury's seam, and where the Caldmoor Road leaves the built world. */
export const ROAD_IN = { x: 3071, y: 3524 };
export const CALDMOOR_EXIT = { x: 2816, y: 3424 };
const LANES: Point[][] = [[[2915, 3548], [2930, 3548]], [[2930, 3532], [2930, 3576]]];
/**
 * The stubs from a street or lane to each door. ⛔ A stub's end tile is not paved at width 0.6, so each
 * starts a tile inside the way it leaves and runs a tile into its building; the building takes its own back.
 */
const STUBS: Point[][] = [
  [[2915, 3549], [2921, 3549], [2921, 3553]], [[2909, 3549], [2901, 3549], [2901, 3553]],
  [[2915, 3547], [2920, 3547], [2920, 3541]], [[2909, 3547], [2902, 3547], [2902, 3542]],
  [[2929, 3536], [2934, 3536]], [[2929, 3545], [2934, 3545]], [[2929, 3554], [2934, 3554]], [[2929, 3563], [2934, 3563]], [[2929, 3572], [2934, 3572]],
  [[2855, 3423], [2855, 3427]],
];

/** Rowan on the Greycaps' foot (§8.2, WC 37): "fond of high ground", on the slope below the stone west of the Delve Road. */
export const ROWANS = { x: 2886, y: 3488, r: 8 };

export function buildDeepdelve(b: WorldBuilder, seed: number): void {
  b.clip = DEEPDELVE_SITE;
  terrain(b, seed);
  range(b);
  roads(b);
  pass(b);
  town(b);
  mine(b);
  scatter(b, 0, "rowan", ROWANS, 7, (x, y) => b.overlayAt(0, x, y) === 0 && !isRock(x, y) && !inBox(TOWN, x, y));
  wilderness(b, seed);
  creatures(b);
  lying(b);
}

// --- Ground ------------------------------------------------------------------------------------------

/** Whether a corner is this site's to write: Thornbury's column at x 3072 is not, nor the foothills' corners on the seam row. */
const ours = (cx: number, cy: number): boolean => cx < 3072 && !(cy === SEAM_Y && cx >= FOOT_X0 && cx <= FOOT_X1);

/** How high the range stands over a point: rising west of its foot to the wall, with the pass cut low through it. */
function rangeHeight(x: number, y: number): number {
  const wall = 14 * smoothstep(RANGE_FOOT, RANGE_WALL, x);
  const gap = smoothstep(PASS.half + 8, PASS.half, Math.abs(y - PASS.y));
  return wall * (1 - 0.92 * gap);
}

/**
 * Whether a tile is the range's stone: too high to walk, and blocked. The corner where the range meets
 * the Sound's end by the seam is stone too, so the ground that falls to the water there is a rock face
 * nobody stands on.
 */
export const isRock = (x: number, y: number): boolean => rangeHeight(x + 0.5, y + 0.5) > 5 || (x < 2887 && y < 3404);

/**
 * The ground: the heartland's own height, the Greycaps' foot carried on from the foothills' seven-unit
 * rise and let down over forty-eight rows (and faded east toward the Kingsway's plain), the range rising
 * in broken stone along the west with the pass cut low through it, the town's shelf held level at the
 * cliff's foot, and the stitches to Thornbury's column and to the foothills' row, each joined over eight tiles.
 */
function terrain(b: WorldBuilder, seed: number): void {
  const raw = heartlandHeight(seed), broken = valueNoise2D(seed + 1101), ridges = valueNoise2D(seed + 1103);
  const shelf = raw(SQUARE.x, SQUARE.y) + 3;
  for (let cy = DEEPDELVE_SITE.y0; cy <= DEEPDELVE_SITE.y1 + 1; cy++) {
    for (let cx = DEEPDELVE_SITE.x0; cx <= DEEPDELVE_SITE.x1 + 1; cx++) {
      if (!ours(cx, cy)) continue;
      let h = raw(cx, cy);
      h += 7 * smoothstep(3440, SEAM_Y, cy) * smoothstep(3060, FOOT_X1, cx);
      const range = rangeHeight(cx, cy);
      h += range * (0.8 + 0.4 * broken(cx / 9, cy / 9));
      // Peaks: sharp ridges where the range already stands high, so its inside is mountains and not one
      // slope; its edge, where anyone could see it from the ground, stays the smooth rise.
      const ridge = 1 - Math.abs(2 * ridges(cx / 13, cy / 13) - 1);
      h += 9 * ridge * ridge * smoothstep(5, 10, range);
      const out = Math.max(TOWN.x0 - cx, cx - (TOWN.x1 + 1), TOWN.y0 - cy, cy - (TOWN.y1 + 1), 0);
      h += (shelf - h) * smoothstep(10, 0, out);
      if (cx >= 3064) h += (b.heightAtCorner(0, 3072, cy) - h) * smoothstep(3063, 3071, cx);
      if (cy <= SEAM_Y + 8 && cx >= FOOT_X0 && cx <= FOOT_X1) h += (b.heightAtCorner(0, cx, SEAM_Y) - h) * smoothstep(SEAM_Y + 9, SEAM_Y + 1, cy);
      b.setHeight(0, cx, cy, h);
    }
  }
  for (let y = DEEPDELVE_SITE.y0; y <= DEEPDELVE_SITE.y1; y++) for (let x = DEEPDELVE_SITE.x0; x <= DEEPDELVE_SITE.x1; x++) b.setUnderlay(0, x, y, UNDERLAY_GRASS);
}

/** The range: grey stone where it stands high, blocked; bare dirt on the steep ground below it. */
function range(b: WorldBuilder): void {
  for (let y = DEEPDELVE_SITE.y0; y <= DEEPDELVE_SITE.y1; y++) {
    for (let x = DEEPDELVE_SITE.x0; x <= RANGE_FOOT + 8; x++) {
      if (isRock(x, y)) {
        b.setUnderlay(0, x, y, UNDERLAY_STONE);
        b.plane(0).collision.block(x, y);
      } else if (rangeHeight(x + 0.5, y + 0.5) > 1.5) b.setUnderlay(0, x, y, UNDERLAY_DIRT);
    }
  }
}

// --- Roads, the pass, the town ---------------------------------------------------------------------------

function roads(b: WorldBuilder): void {
  road(b, 0, KINGSWAY, 1.3);
  road(b, 0, DELVE_ROAD, 1.2);
  for (const lane of LANES) road(b, 0, lane, 1.1);
  for (const stub of STUBS) road(b, 0, stub, 0.6);
  for (let y = SQUARE.y - 5; y <= SQUARE.y + 5; y++) {
    for (let x = SQUARE.x - 5; x <= SQUARE.x + 5; x++) {
      if (Math.hypot(x + 0.5 - SQUARE.x, y + 0.5 - SQUARE.y) <= 4.5) b.setOverlay(0, x, y, OVERLAY_PATH);
    }
  }
  for (let y = DEEPDELVE_SITE.y0; y <= DEEPDELVE_SITE.y1; y++) {
    for (let x = DEEPDELVE_SITE.x0; x <= DEEPDELVE_SITE.x1; x++) {
      if (b.overlayAt(0, x, y) === OVERLAY_PATH) b.setUnderlay(0, x, y, UNDERLAY_DIRT);
    }
  }
}

/**
 * Hollow Pass: the toll house north of the road with its keeper, and across the pass the gate onto the
 * Caldmoor side — a tower either side of the road, the gate's leaves on the road, and wall on every other
 * tile of the pass's floor from stone to stone, so the one way west is through the gate, and it is barred.
 */
function pass(b: WorldBuilder): void {
  building(b, { box: TOLL_HOUSE, doors: [{ side: 2, along: 3 }], windows: [{ side: 2, along: 6 }, { side: 1, along: 3 }], floor: UNDERLAY_DIRT, roof: ROOF_KEEP, style: "keep" });
  b.spawnMonster({ monster: "pass_keeper", x: 2857, y: 3425 });
  for (const box of GATE_TOWERS) tower(b, box, [{ side: 3, along: 1 }]);
  const towerRow = (y: number) => GATE_TOWERS.some((t) => y >= t.y0 && y <= t.y1);
  for (let y = PASS.y - 16; y <= PASS.y + 16; y++) {
    if (isRock(PASS_GATE.x, y) || towerRow(y)) continue;
    if (b.overlayAt(0, PASS_GATE.x, y) === OVERLAY_PATH) b.place(0, "gate", PASS_GATE.x, y, { side: 3, tag: "hollowpass" });
    else b.place(0, "stone_wall", PASS_GATE.x, y, { side: 3 });
  }
  b.place(0, "signpost", 2884, 3427);
}

/**
 * Deepdelve (PLAN §7.6's card and the plan map's): the bank on the square's north-east — the fifth in the
 * world — the smithy on its north-west with the white furnaces, Delve Tools and the Pick and Lantern on its
 * south side, five houses along the east lane, the well, the foreman by the mine road, and the people.
 */
function town(b: WorldBuilder): void {
  bank(b, BANK, { side: 2, along: 5 });
  building(b, {
    box: SMITHY,
    doors: [{ side: 2, along: 5 }],
    windows: [{ side: 2, along: 1 }, { side: 2, along: 9 }, { side: 3, along: 4 }, { side: 1, along: 4 }],
    floor: UNDERLAY_DIRT,
    roof: ROOF_SLATE,
    sign: "anvil",
  });
  for (const f of FURNACES) b.place(0, "furnace", f.x, f.y, { tag: "white" });
  for (const a of ANVILS) b.place(0, "anvil", a.x, a.y);
  b.spawnMonster({ monster: "smith_deepdelve", x: 2901, y: 3557 });

  shop(b, TOOLS, { side: 0, along: 4 }, "deepdelve_tools", "toolseller", [{ side: 0, along: 1 }, { side: 0, along: 7 }, { side: 1, along: 4 }]);

  building(b, {
    box: INN,
    doors: [{ side: 0, along: 6 }],
    windows: [{ side: 0, along: 2 }, { side: 0, along: 10 }, { side: 3, along: 3 }, { side: 3, along: 8 }, { side: 2, along: 3 }, { side: 2, along: 9 }],
    storeys: 2,
    stair: { x: INN.x1 - 1, y: INN.y0 + 1 },
    floor: UNDERLAY_DIRT,
    roof: ROOF_SLATE,
    sign: "tankard",
  });
  b.place(0, "range", INN.x0 + 1, INN.y0 + 1);
  b.place(0, "table", INN.x0 + 4, INN.y0 + 4);
  b.place(0, "table", INN.x1 - 3, INN.y0 + 3);
  b.place(0, "barrel", INN.x0 + 1, INN.y0 + 4);
  b.spawnMonster({ monster: "innkeeper_deepdelve", x: INN.x0 + 6, y: INN.y0 + 3 });

  for (const [box, door] of HOUSES) building(b, { box, doors: [door], windows: [{ side: 1, along: 2 }], floor: UNDERLAY_DIRT, roof: ROOF_SLATE });
  b.place(0, "well", WELL.x, WELL.y);
  b.spawnMonster({ monster: "foreman", x: 2882, y: 3550 });
  for (const [monster, x, y] of [["miner", 2906, 3546], ["miner", 2918, 3549], ["miner", 2929, 3560], ["delver", 2912, 3540], ["delver_woman", 2924, 3566]] as const) {
    b.spawnMonster({ monster, x, y });
  }
}

/** Deepdelve Mine (§8.5): the mouth in the cliff, and three levels cut into the rock under the mountain. */
function mine(b: WorldBuilder): void {
  b.place(0, "adit", MINE_MOUTH.x, MINE_MOUTH.y, { side: 3, to: COAL_PLANE });
  b.place(0, "signpost", MINE_MOUTH.x + 1, MINE_MOUTH.y - 2);
  const surface = b.heightAtCorner(0, MINE_MOUTH.x, MINE_MOUTH.y);
  cut(b, COAL_PLANE, MINE_BOX, COAL_ROOMS, surface - 2 * STOREY, () => true);
  cut(b, COLDIRON_PLANE, MINE_BOX, COLDIRON_ROOMS, surface - 4 * STOREY, () => true);
  cut(b, GOLD_PLANE, MINE_BOX, GOLD_ROOMS, surface - 6 * STOREY, () => true);
  // The way back up, on the mouth's own tile as the Adit's is; the stairs between the levels, each on the tile the one above comes down to.
  b.place(COAL_PLANE, "stairs", MINE_MOUTH.x, MINE_MOUTH.y, { to: 0 });
  b.place(COAL_PLANE, "stairs", COAL_STAIR.x, COAL_STAIR.y, { to: COLDIRON_PLANE });
  b.place(COLDIRON_PLANE, "stairs", COAL_STAIR.x, COAL_STAIR.y, { to: COAL_PLANE });
  b.place(COLDIRON_PLANE, "stairs", COLDIRON_STAIR.x, COLDIRON_STAIR.y, { to: GOLD_PLANE });
  b.place(GOLD_PLANE, "stairs", COLDIRON_STAIR.x, COLDIRON_STAIR.y, { to: COLDIRON_PLANE });
  for (const o of ORE) b.place(o.plane, o.kind, o.x, o.y);
  b.place(GOLD_PLANE, "chest", GOLD_CHEST.x, GOLD_CHEST.y, { tag: "deepdelve" });
  for (const [plane, x, y] of [[COAL_PLANE, 2852, 3546], [COAL_PLANE, 2828, 3548], [COLDIRON_PLANE, 2866, 3556], [COLDIRON_PLANE, 2888, 3538], [GOLD_PLANE, 2912, 3548], [GOLD_PLANE, 2926, 3560]] as const) b.place(plane, "rock", x, y);
  for (const [plane, x, y] of [[COAL_PLANE, 2868, 3549], [COLDIRON_PLANE, 2850, 3549], [GOLD_PLANE, 2897, 3550]] as const) b.place(plane, "crate", x, y);
  for (const [monster, plane, x, y] of BELOW) b.spawnMonster({ monster, x, y, plane });
}

// --- The country -----------------------------------------------------------------------------------------

/** The country between: trees and rock on the plain, loose rock on the steep dirt below the range, nothing on the roads, the town or the pass's floor. */
function wilderness(b: WorldBuilder, seed: number): void {
  const grain = valueNoise2D(seed + 1102);
  for (let y = DEEPDELVE_SITE.y0; y <= DEEPDELVE_SITE.y1; y++) {
    for (let x = DEEPDELVE_SITE.x0; x <= DEEPDELVE_SITE.x1; x++) {
      if (!b.free(0, x, y) || b.overlayAt(0, x, y) !== 0 || inBox(TOWN, x, y) || inBox(PASS_BOX, x, y)) continue;
      if (Math.abs(x - MINE_MOUTH.x) <= 3 && Math.abs(y - MINE_MOUTH.y) <= 3) continue;
      const under = underlayAt(b.plane(0), x, y);
      const roll = b.rand();
      if (under === UNDERLAY_GRASS) {
        const trees = 0.05 * grain(x / 11, y / 11);
        if (roll < trees) b.place(0, "tree", x, y);
        else if (roll < trees + 0.008) b.place(0, "bush", x, y);
        else if (roll < trees + 0.012) b.place(0, "rock", x, y);
      } else if (under === UNDERLAY_DIRT && roll < 0.06) b.place(0, "rock", x, y);
    }
  }
  scatter(b, 0, "rock", { x: 2960, y: 3410, r: 14 }, 8, (x, y) => b.overlayAt(0, x, y) === 0);
}

/** Who lives here: wolves and boars on the plain off the Kingsway, spiders on the Delve Road's slopes, and the town's hens and rats. */
function creatures(b: WorldBuilder): void {
  const herds: Array<[string, number, number, number, number]> = [
    ["hen", 3, 2926, 3530, 3],
    ["field_rat", 3, 2938, 3578, 2],
    ["grey_wolf", 4, 3010, 3440, 10],
    ["wild_boar", 4, 2960, 3500, 10],
    ["thicket_spider", 4, 2905, 3470, 8],
    ["grey_wolf", 3, 2930, 3405, 8],
  ];
  const taken = new Set<number>();
  for (const [monster, count, cx, cy, r] of herds) {
    for (let placed = 0, tries = 0; placed < count && tries < 200; tries++) {
      const x = Math.round(cx + (b.rand() * 2 - 1) * r), y = Math.round(cy + (b.rand() * 2 - 1) * r);
      const key = y * 4096 + x;
      if (taken.has(key) || !b.free(0, x, y) || b.overlayAt(0, x, y) === OVERLAY_PATH) continue;
      taken.add(key);
      b.spawnMonster({ monster, x, y, plane: 0 });
      placed++;
    }
  }
}

/** What lies about: coal by the mouth, a pick in the square, bread in the Pick and Lantern, coins at the toll house. */
function lying(b: WorldBuilder): void {
  const spawns: Array<[string, number, number, number, number]> = [
    ["coal", 3, MINE_MOUTH.x + 3, MINE_MOUTH.y + 2, 150],
    ["bronze_pickaxe", 1, 2914, 3545, 300],
    ["bread", 1, INN.x0 + 3, INN.y0 + 2, 100],
    ["coins", 8, 2860, 3425, 200],
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

/** The town has the village's tune; the pass and the mine the harder one; the range and the plain, the wood and water's. */
export const MINE_AREA: Area = { key: "deepdelvemine", name: "Deepdelve Mine", track: TUNE.danger };
export const DEEPDELVE_AREAS: ReadonlyArray<{ area: Area; box: Box }> = [
  { area: { key: "deepdelve", name: "Deepdelve", track: TUNE.village4 }, box: TOWN },
  { area: { key: "hollowpass", name: "Hollow Pass", track: TUNE.danger }, box: PASS_BOX },
  { area: { key: "greycaps", name: "The Greycaps", track: TUNE.woods }, box: DEEPDELVE_SITE },
];

export const DEEPDELVE_LABELS: MapLabel[] = [
  { name: "Deepdelve", x: 2912, y: 3570 },
  { name: "Hollow Pass", x: 2850, y: 3440 },
  { name: "The Greycaps", x: 2840, y: 3500 },
  { name: "The Kingsway", x: 2980, y: 3462, small: true },
  { name: "The Delve Road", x: 2904, y: 3486, small: true },
  { name: "Deepdelve Mine", x: 2877, y: 3556, small: true },
  { name: "The Pick and Lantern", x: 2902, y: 3530, small: true },
];

export const DEEPDELVE_MARKS: Array<{ icon: MapIcon; x: number; y: number; name: string }> = [
  { icon: "inn", x: INN.x0 + 6, y: INN.y0 + 5, name: "The Pick and Lantern" },
  { icon: "mine", x: MINE_MOUTH.x, y: MINE_MOUTH.y, name: "Deepdelve Mine" },
  { icon: "gate", x: PASS_GATE.x, y: PASS_GATE.y, name: "Hollow Pass (the Caldmoor gate, barred)" },
  { icon: "tree", x: ROWANS.x, y: ROWANS.y, name: "Rowan" },
];

/** The road out through the pass, and where it goes (§7.6): the Caldmoor Road to Fallowmede, Wave 4's. */
export const DEEPDELVE_EXITS: MapExit[] = [
  { name: "The Caldmoor Road — Fallowmede", x: CALDMOOR_EXIT.x, y: CALDMOOR_EXIT.y, side: "w", away: 643 },
];

/** Named boxes, for the tests and the map. */
export const DEEPDELVE_SITES: Record<string, Box> = { greycaps: DEEPDELVE_SITE, deepdelve: TOWN, hollowpass: PASS_BOX };
