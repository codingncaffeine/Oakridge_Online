// Brinehaven (PLAN §7.6, the fourth and last site of Wave 1): the port at the south end of the Coast
// Road, on the headland where the Sunder Sound meets the open sea — the world's third bank, a shop of
// creels and pots, the Drowned Bell, the harbourmaster's office, the shipwright's yard with the ferry
// open on the stocks, two warehouses, five cottages, three berths off a paved quay in the lee of a stone
// mole, and the bay crab (Fishing 45, a creel) in the beds off the south shore: the rung past
// Wickstead's grayling (§8.1), and §7.7's fourth rule (Brinehaven sails — or will, when the ferry is
// planked). No dungeon: none of §8.5's ten is here.
//
// Its site is regions 44–46 × 46–49: the Sound's column of water west of the shore, the corridor down
// from Wickstead's south edge with the road in it, the town on the headland, and the sea south of it,
// so the port has water on two sides and not a cliff into nothing on either. Built on the same builder
// as the district and the three sites before it, after all of them, so every id and every roll of
// theirs stands; Wickstead's row of corners at y 3200 is never written, and the ground beside it is
// stitched to those values over eight rows (tests/brinehaven.test.ts builds the world with and without
// this and compares every one of them).
import { heartlandHeight, SEA_CORNER, soundShore } from "./heartland.ts";
import {
  OVERLAY_PATH, OVERLAY_WATER, ROOF_KEEP, ROOF_SLATE, underlayAt, UNDERLAY_DIRT, UNDERLAY_FOREST, UNDERLAY_GRASS, UNDERLAY_SAND,
} from "./map.ts";
import type { Area, MapExit, MapIcon, MapLabel } from "./oakridge.ts";
import { valueNoise2D } from "./rng.ts";
import {
  bank, boxOf, building, corners, fence, inBox, road, scatter, shop, smoothstep, WorldBuilder, type Box, type Point,
} from "./worldgen.ts";

/** The site: regions 44–46 × 46–49, tiles x 2816–3007 and y 2944–3199. */
export const BRINEHAVEN: Box = boxOf(2816, 2944, 3007, 3199);
/** The Sound's column: open water west of the shore, as far as the fog can see from the quay. */
export const SOUND: Box = boxOf(2816, 2944, 2879, 3199);
/** The sea's two regions south of the headland. */
export const SOUTH_SEA: Box = boxOf(2880, 2944, 3007, 3007);
/** The shore: the Sound and the sand along it, where the road's tune gives way to the water's. */
export const SHORE: Box = boxOf(2816, 3072, 2897, 3199);
/** The town: from the quay to the pen, the yard to the north cottages. */
export const TOWN: Box = boxOf(2886, 3012, 2946, 3070);
/** The harbour: the quay, the three berths and the mole, and the water they stand in. */
export const HARBOUR: Box = boxOf(2866, 3010, 2892, 3062);
/** The square, where the Coast Road ends. */
export const SQUARE = { x: 2910, y: 3044 };
export const BANK: Box = boxOf(2914, 3048, 2923, 3055);
export const INN: Box = boxOf(2914, 3032, 2923, 3040);
/** Hale's Creels & Pots, on the quay. */
export const POTS: Box = boxOf(2893, 3032, 2900, 3038);
/** The harbourmaster's office: a room of keep stone by the ferry's berth. */
export const OFFICE: Box = boxOf(2893, 3046, 2897, 3050);
/** The shipwright's workshop, and the fenced yard in front of it where the ferry sits on the stocks. */
export const WORKSHOP: Box = boxOf(2893, 3023, 2900, 3029);
export const YARD: Box = boxOf(2893, 3016, 2903, 3021);
export const STOCKS = { x: 2898, y: 3018 };
const WAREHOUSES: Box[] = [boxOf(2899, 3048, 2907, 3054), boxOf(2902, 3032, 2907, 3039)];
const COTTAGES: ReadonlyArray<readonly [Box, 0 | 1 | 2 | 3]> = [
  [boxOf(2915, 3023, 2920, 3028), 0],
  [boxOf(2924, 3023, 2929, 3028), 0],
  [boxOf(2926, 3047, 2931, 3052), 2],
  [boxOf(2934, 3047, 2939, 3052), 2],
  [boxOf(2934, 3034, 2939, 3039), 0],
];
/** The three berths: planks out over the Sound from the quay. The third is the ferry's, and empty. */
export const BERTHS: Box[] = [boxOf(2877, 3020, 2888, 3021), boxOf(2877, 3034, 2888, 3035), boxOf(2877, 3048, 2888, 3049)];
/** The two boats lying to the berths, each along its own. */
export const MOORINGS: ReadonlyArray<{ x: number; y: number }> = [{ x: 2882, y: 3018 }, { x: 2882, y: 3037 }];
/** Where the ferry would lie: the end of the third berth. */
export const FERRY_BERTH = { x: 2877, y: 3049 };
/** Where the ferry lies now she is planked: along the far berth, in the water off its south side (Wave 2). */
export const FERRY_MOORING = { x: 2882, y: 3051 };
/** The mole: a stone arm out from the quay's south end, so the berths lie in still water. */
export const MOLE: Box = boxOf(2874, 3014, 2889, 3015);
/** The quay: paved from the water to the buildings' fronts. */
export const QUAY: Box = boxOf(2880, 3016, 2892, 3060);
/** The pen east of the town, with the sheep in it. */
const PEN: Box = boxOf(2944, 3038, 2956, 3048);
/** The wood on the corridor's east side, where the wolves are. */
const WOOD: Box = boxOf(2950, 3076, 3005, 3196);
/** How far the shore's land is held flat behind the quay, and how high it stands over the water. */
const QUAY_LIFT = 1.0;
const QUAY_FLAT = 6;

/** The Coast Road, on from where Wickstead's stretch ends at (2892, 3200), down the corridor to the square and on to the beach. */
const COAST_ROAD: Point[] = [
  [2892, 3204], [2893, 3186], [2896, 3160], [2900, 3130], [2905, 3100], [2909, 3076], [2910, 3056], [2910, 3044], [2910, 3018],
];
/** The lanes: the quay lane west out of the square, the east lane to the pen, and the south lane between the yard and the shop. */
const LANES: Point[][] = [
  [[2907, 3044], [2891, 3044]],
  [[2913, 3044], [2943, 3044]],
  [[2891, 3031], [2909, 3031]],
  [[2911, 3031], [2940, 3031]],
];
/** Where the Coast Road comes in over the seam from Wickstead. */
export const ROAD_IN = { x: 2892, y: 3199 };

/**
 * Builds the site. The same order as every site: ground, water, then what stands on the water, the
 * roads, then what stands on the land; last the creatures and what lies about.
 */
export function buildBrinehaven(b: WorldBuilder, seed: number): void {
  b.clip = BRINEHAVEN;
  const sea = terrain(b, seed);
  seas(b, sea);
  mole(b, sea);
  berths(b, sea);
  roads(b, sea);
  town(b);
  pasture(b);
  woods(b, seed);
  wilderness(b, seed);
  waters(b);
  creatures(b);
  lying(b);
}

// --- Ground ------------------------------------------------------------------------------------------

/** Whether a corner is this site's to write: Wickstead's row at y 3200 is not. */
const ours = (_cx: number, cy: number): boolean => cy < 3200;

/**
 * The Sound's shore on one row: the heartland's line, held to the seam row's value over the eight rows
 * before it. A tile at the seam is then water on this side exactly when it is on Wickstead's, so the
 * corners the two rows share stand at one height from either side.
 */
export const shoreAt = (y: number): number => soundShore(y >= 3192 && y < 3200 ? 3200 : y);

const southWobble = valueNoise2D(53);

/** The south shore on one column: the sea lies south of it. */
export const southShore = (x: number): number => 3013 + 5 * (southWobble(x / 26, 0.7) - 0.5);

/** Whether a tile is the Sound's water, or the sea's south of the headland. */
export const isSound = (x: number, y: number): boolean => x + 0.5 < shoreAt(y);
export const isSouthSea = (x: number, y: number): boolean => y + 0.5 < southShore(x);
const isSea = (x: number, y: number): boolean => isSound(x, y) || isSouthSea(x, y);

/**
 * The ground: the heartland's own height coming down onto the coastal plain, with the fall toward the
 * district's sea given back — that fall is the district's marsh, and a port at the same latitude would
 * lie under water for it — a headland the town stands proud on, the shore easing down to the water
 * over fourteen tiles and held flat behind the quay, the south shore the same, and the stitch to
 * Wickstead's row of corners at y 3200, joined over eight rows. Returns the sea's level, read off the
 * district's own sea, so the Sound and the sea stand at the same height as every other water.
 */
function terrain(b: WorldBuilder, seed: number): number {
  const raw = heartlandHeight(seed);
  const sea = b.heightAtCorner(0, SEA_CORNER.x, SEA_CORNER.y);
  const seamFall = smoothstep(90, 24, 3200 - 3136);
  for (let cy = BRINEHAVEN.y0; cy <= BRINEHAVEN.y1 + 1; cy++) {
    for (let cx = BRINEHAVEN.x0; cx <= BRINEHAVEN.x1 + 1; cx++) {
      if (!ours(cx, cy)) continue;
      let h = raw(cx, cy);
      // The coastal plain, as Wickstead has it: two and a half units down from the ridge's foot.
      h -= 2.5 * smoothstep(3000, 2940, cx);
      // The heartland falls three units toward the district's sea; south of the seam that fall is given back.
      h += 3.2 * (smoothstep(90, 24, cy - 3136) - seamFall);
      // The headland the town stands on.
      h += 1.2 * smoothstep(3080, 3040, cy);
      // The Sound's shore, down to the water's edge; behind the quay the land is held flat a way in.
      const town = smoothstep(3010, 3016, cy) * smoothstep(3066, 3060, cy);
      const off = Math.max(0, cx - shoreAt(cy) - 1);
      h += (sea + 0.6 + QUAY_LIFT * town + Math.max(0, off - QUAY_FLAT * town) * 0.3 - h) * smoothstep(14 + QUAY_FLAT * town, 3, off);
      // The south shore.
      const offSouth = Math.max(0, cy - southShore(cx) - 1);
      h += (sea + 0.6 + offSouth * 0.3 - h) * smoothstep(14, 3, offSouth);
      // The stitch: Wickstead's row, joined over eight rows, exactly at the seam.
      if (cy >= 3192) h += (b.heightAtCorner(0, cx, 3200) - h) * smoothstep(3191, 3199, cy);
      b.setHeight(0, cx, cy, h);
    }
  }
  for (let y = BRINEHAVEN.y0; y <= BRINEHAVEN.y1; y++) for (let x = BRINEHAVEN.x0; x <= BRINEHAVEN.x1; x++) b.setUnderlay(0, x, y, UNDERLAY_GRASS);
  return sea;
}

/** A corner set to the sea's level, unless it is Wickstead's. */
function drown(b: WorldBuilder, sea: number, x: number, y: number): void {
  for (const [cx, cy] of corners(x, y)) if (ours(cx, cy)) b.setHeight(0, cx, cy, sea);
}

/** The Sound west of the shore and the sea south of the headland: water at the sea's level, sand along both. */
function seas(b: WorldBuilder, sea: number): void {
  for (let y = BRINEHAVEN.y0; y <= BRINEHAVEN.y1; y++) {
    for (let x = BRINEHAVEN.x0; x <= BRINEHAVEN.x1; x++) {
      if (isSea(x, y)) {
        b.setOverlay(0, x, y, OVERLAY_WATER);
        b.plane(0).collision.block(x, y);
        drown(b, sea, x, y);
      } else if (x + 0.5 < shoreAt(y) + 2.5 || y + 0.5 < southShore(x) + 2.5) {
        b.setUnderlay(0, x, y, UNDERLAY_SAND);
      }
    }
  }
}

/**
 * The mole: a stone arm out from the quay's south end over the water, walkable along its top, with a
 * low wall on its seaward side and its end. The berths lie in its lee.
 */
function mole(b: WorldBuilder, sea: number): void {
  for (let y = MOLE.y0; y <= MOLE.y1; y++) {
    for (let x = MOLE.x0; x <= MOLE.x1; x++) {
      b.setOverlay(0, x, y, OVERLAY_PATH);
      b.setUnderlay(0, x, y, UNDERLAY_DIRT);
      b.plane(0).collision.unblock(x, y);
      for (const [cx, cy] of corners(x, y)) b.setHeight(0, cx, cy, sea + 0.8);
    }
  }
  for (let x = MOLE.x0; x <= MOLE.x1; x++) b.place(0, "stone_wall", x, MOLE.y0, { side: 2, tag: "mole" });
  for (let y = MOLE.y0; y <= MOLE.y1; y++) b.place(0, "stone_wall", MOLE.x0, y, { side: 3, tag: "mole" });
}

/**
 * The three berths: planks out over the water from the quay, a rail wherever they meet open water, and
 * a boat lying to the first two. The third is kept for the ferry, and has nothing at it but the man
 * whose boat it is.
 */
function berths(b: WorldBuilder, sea: number): void {
  for (const berth of BERTHS) {
    const deck: Array<{ x: number; y: number }> = [];
    for (let x = berth.x0; x <= berth.x1; x++) {
      for (let y = berth.y0; y <= berth.y1; y++) {
        if (b.overlayAt(0, x, y) !== OVERLAY_WATER) continue;
        b.setOverlay(0, x, y, OVERLAY_PATH);
        b.setUnderlay(0, x, y, UNDERLAY_DIRT);
        b.plane(0).collision.unblock(x, y);
        deck.push({ x, y });
      }
    }
    for (const { x, y } of deck) for (const [cx, cy] of corners(x, y)) b.setHeight(0, cx, cy, sea + 0.6);
    for (const { x, y } of deck) {
      for (const [dx, dy, side] of [[0, 1, 0], [1, 0, 1], [0, -1, 2], [-1, 0, 3]] as const) {
        if (b.overlayAt(0, x + dx, y + dy) === OVERLAY_WATER) b.place(0, "fence", x, y, { side });
      }
    }
  }
  for (const { x, y } of MOORINGS) b.place(0, "boat", x, y, { side: 0 });
  // The ferry herself, off the stocks and lying to the far berth (Wave 2): the crossing to Tarhollow sails from here.
  b.place(0, "boat", FERRY_MOORING.x, FERRY_MOORING.y, { side: 0 });
  for (const [x, y] of [[BERTHS[0]!.x1 + 1, BERTHS[0]!.y1 + 1], [BERTHS[1]!.x1 + 2, BERTHS[1]!.y0 - 1], [BERTHS[2]!.x1 + 1, BERTHS[2]!.y0 - 1]] as const) {
    if (b.free(0, x, y)) b.place(0, "crate", x, y);
  }
  for (const [x, y] of [[BERTHS[0]!.x1 + 2, BERTHS[0]!.y1 + 1], [BERTHS[1]!.x1 + 1, BERTHS[1]!.y1 + 1]] as const) {
    if (b.free(0, x, y)) b.place(0, "barrel", x, y);
  }
}

/** The Coast Road in, the square, the lanes, the quay paved from the water to the doors, and dirt under all of it. */
function roads(b: WorldBuilder, sea: number): void {
  road(b, 0, COAST_ROAD, 1.3);
  for (const lane of LANES) road(b, 0, lane, 1.1);
  // The stubs from a lane to each door that does not open onto one. Each runs a tile into its
  // building, so the tile at the door is paved too; the building takes its own tiles back.
  for (const stub of [
    [[2910, 3051], [2914, 3051]], [[2910, 3036], [2914, 3036]], [[2907, 3051], [2909, 3051]], [[2907, 3035], [2909, 3035]],
    [[2917, 3028], [2917, 3031]], [[2926, 3028], [2926, 3031]], [[2928, 3047], [2928, 3044]], [[2936, 3047], [2936, 3044]],
    [[2936, 3039], [2936, 3043]],
  ] as Point[][]) road(b, 0, stub, 0.6);
  for (let y = SQUARE.y - 4; y <= SQUARE.y + 4; y++) {
    for (let x = SQUARE.x - 4; x <= SQUARE.x + 4; x++) {
      if (Math.hypot(x - SQUARE.x, y - SQUARE.y) <= 3.6) b.setOverlay(0, x, y, OVERLAY_PATH);
    }
  }
  // The quay: every land tile between the water and the buildings' fronts is paved, and stands level.
  for (let y = QUAY.y0; y <= QUAY.y1; y++) {
    for (let x = QUAY.x0; x <= QUAY.x1; x++) {
      if (b.overlayAt(0, x, y) === OVERLAY_WATER) continue;
      b.setOverlay(0, x, y, OVERLAY_PATH);
      for (const [cx, cy] of corners(x, y)) {
        const wet = [[cx - 1, cy - 1], [cx, cy - 1], [cx - 1, cy], [cx, cy]].some(([tx, ty]) => b.overlayAt(0, tx!, ty!) === OVERLAY_WATER);
        if (!wet) b.setHeight(0, cx, cy, sea + QUAY_LIFT);
      }
    }
  }
  for (let y = BRINEHAVEN.y0; y <= BRINEHAVEN.y1; y++) {
    for (let x = BRINEHAVEN.x0; x <= BRINEHAVEN.x1; x++) {
      if (b.overlayAt(0, x, y) === OVERLAY_PATH) b.setUnderlay(0, x, y, UNDERLAY_DIRT);
    }
  }
}

// --- The town ------------------------------------------------------------------------------------------

/**
 * The town (PLAN §7.6's card and the plan map's): the bank on the square's east side — the third in the
 * world — the Drowned Bell south of it, the shop of creels and pots on the quay with the shipwright's
 * workshop and yard below it and the harbourmaster's office above, two warehouses on the square's
 * west side, five cottages along the lanes, the well and the signpost.
 */
function town(b: WorldBuilder): void {
  bank(b, BANK, { side: 3, along: 3 });
  shop(b, POTS, { side: 3, along: 3 }, "brinehaven_pots", "potmaker", [{ side: 3, along: 1 }, { side: 2, along: 3 }]);

  // The Drowned Bell: two storeys of slate on the square's south-east corner, the range through the door.
  building(b, {
    box: INN,
    doors: [{ side: 3, along: 4 }],
    windows: [{ side: 3, along: 1 }, { side: 0, along: 4 }, { side: 2, along: 2 }, { side: 2, along: 7 }, { side: 1, along: 4 }],
    storeys: 2,
    stair: { x: INN.x1 - 1, y: INN.y1 - 1 },
    floor: UNDERLAY_DIRT,
    roof: ROOF_SLATE,
    sign: "tankard",
  });
  b.place(0, "range", INN.x0 + 1, INN.y1 - 1);
  b.place(0, "table", INN.x0 + 3, INN.y0 + 2);
  b.place(0, "table", INN.x1 - 2, INN.y0 + 3);
  b.place(0, "barrel", INN.x1 - 1, INN.y0 + 1);
  b.spawnMonster({ monster: "innkeeper_brinehaven", x: INN.x0 + 3, y: INN.y1 - 1 });
  b.spawnMonster({ monster: "sailor", x: INN.x0 + 5, y: INN.y0 + 4 });
  b.place(1, "table", INN.x0 + 4, INN.y0 + 4);
  b.place(1, "barrel", INN.x0 + 1, INN.y1 - 1);

  // The harbourmaster's office: one room of arrow-slit stone under a flat roof, and the man himself on the quay outside it.
  building(b, { box: OFFICE, doors: [{ side: 3, along: 2 }], windows: [{ side: 0, along: 2 }, { side: 2, along: 2 }], floor: UNDERLAY_DIRT, roof: ROOF_KEEP, style: "keep" });
  b.place(0, "table", OFFICE.x0 + 2, OFFICE.y0 + 2);
  b.place(0, "crate", OFFICE.x1 - 1, OFFICE.y0 + 1);
  b.spawnMonster({ monster: "harbourmaster", x: 2890, y: 3053 });

  // The shipwright's workshop, and the yard in front of it: the ferry open on the stocks, timber and tar about it.
  building(b, { box: WORKSHOP, doors: [{ side: 3, along: 3 }], windows: [{ side: 0, along: 3 }, { side: 2, along: 3 }], floor: UNDERLAY_DIRT, sign: "anchor" });
  b.place(0, "anvil", WORKSHOP.x1 - 1, WORKSHOP.y0 + 1);
  b.place(0, "table", WORKSHOP.x1 - 2, WORKSHOP.y1 - 1);
  b.place(0, "barrel", WORKSHOP.x0 + 1, WORKSHOP.y1 - 1);
  fence(b, 0, YARD, { x: YARD.x0, y: 3018 }, "fence", false);
  b.place(0, "boat", STOCKS.x, STOCKS.y, { side: 0, tag: "stocks" });
  b.place(0, "barrel", YARD.x1 - 1, YARD.y0 + 1);
  b.place(0, "crate", YARD.x1 - 1, YARD.y1 - 1);
  b.place(0, "crate", YARD.x1 - 2, YARD.y1 - 1);
  b.spawnMonster({ monster: "shipwright", x: YARD.x0 + 2, y: YARD.y1 - 1 });

  // The ferryman at the berth that is his, with nothing in it.
  b.spawnMonster({ monster: "ferryman", x: 2890, y: 3048 });

  // Two warehouses on the square's west side, the goods of the port in them and about their doors.
  for (const [i, box] of WAREHOUSES.entries()) {
    building(b, { box, doors: [{ side: 1, along: 3 }], windows: [{ side: 1, along: 1 }, { side: i === 0 ? 0 : 2, along: 4 }], floor: UNDERLAY_DIRT });
    for (let n = 0; n < 5; n++) {
      const x = box.x0 + 1 + (n % 3) * 2, y = box.y0 + 1 + Math.floor(n / 3) * 3;
      if (inBox(box, x, y) && b.free(0, x, y)) b.place(0, n % 2 === 0 ? "crate" : "barrel", x, y);
    }
  }
  b.place(0, "crate", 2908, 3053);
  b.place(0, "barrel", 2908, 3033);

  // Five cottages, each facing a lane.
  for (const [box, side] of COTTAGES) {
    const lit = ((side + 1) % 4) as 0 | 1 | 2 | 3;
    building(b, { box, doors: [{ side, along: 2 }], windows: [{ side: lit, along: 2 }], floor: UNDERLAY_DIRT });
  }

  // The square: the well, the signpost, and the people about the port.
  b.place(0, "well", SQUARE.x + 2, SQUARE.y + 2);
  b.place(0, "signpost", SQUARE.x - 2, SQUARE.y + 3);
  b.spawnMonster({ monster: "dockhand", x: 2889, y: 3027 });
  b.spawnMonster({ monster: "dockhand", x: 2890, y: 3040 });
  b.spawnMonster({ monster: "dockhand_woman", x: 2921, y: 3045 });
  b.spawnMonster({ monster: "sailor", x: 2888, y: 3043 });
  b.spawnMonster({ monster: "sailor", x: 2909, y: 3046 });
  b.spawnMonster({ monster: "dockhand_woman", x: 2931, y: 3031 });
}

/** The pen east of the town: a fenced pasture with its gate onto the east lane, and the sheep in it. */
function pasture(b: WorldBuilder): void {
  fence(b, 0, PEN, { x: PEN.x0, y: 3044 });
}

// --- The country -----------------------------------------------------------------------------------------

/** The wood on the corridor's east side, thickening away from the road; the wolves and the spiders are in it. */
function woods(b: WorldBuilder, seed: number): void {
  const grain = valueNoise2D(seed + 606);
  for (let y = WOOD.y0; y <= WOOD.y1; y++) {
    for (let x = WOOD.x0; x <= WOOD.x1; x++) {
      if (!b.free(0, x, y) || b.overlayAt(0, x, y) !== 0 || underlayAt(b.plane(0), x, y) !== UNDERLAY_GRASS) continue;
      const deep = smoothstep(WOOD.x0, WOOD.x0 + 30, x);
      if (b.rand() >= 0.2 + 0.8 * deep) continue;
      b.setUnderlay(0, x, y, UNDERLAY_FOREST);
      if (b.rand() >= (0.05 + 0.2 * deep) * (0.5 + 0.5 * grain(x / 7, y / 7))) continue;
      b.place(0, b.rand() < 0.3 * deep ? "oak" : "tree", x, y);
    }
  }
}

/** The ground nobody authored: a scatter of trees, bushes and rocks, so no corner of the site is bare; reeds on the sand. */
function wilderness(b: WorldBuilder, seed: number): void {
  const grain = valueNoise2D(seed + 505);
  for (let y = BRINEHAVEN.y0; y <= BRINEHAVEN.y1; y++) {
    for (let x = BRINEHAVEN.x0; x <= BRINEHAVEN.x1; x++) {
      if (!b.free(0, x, y) || b.overlayAt(0, x, y) !== 0 || underlayAt(b.plane(0), x, y) !== UNDERLAY_GRASS) continue;
      if (inBox(TOWN, x, y) || inBox(PEN, x, y)) continue;
      const trees = 0.05 * grain(x / 11, y / 11);
      const roll = b.rand();
      if (roll < trees) b.place(0, "tree", x, y);
      else if (roll < trees + 0.008) b.place(0, "bush", x, y);
      else if (roll < trees + 0.011) b.place(0, "rock", x, y);
    }
  }
  for (let y = BRINEHAVEN.y0; y <= BRINEHAVEN.y1; y++) {
    for (let x = BRINEHAVEN.x0; x <= BRINEHAVEN.x1; x++) {
      if (!b.free(0, x, y) || b.overlayAt(0, x, y) !== 0 || underlayAt(b.plane(0), x, y) !== UNDERLAY_SAND) continue;
      if (inBox(HARBOUR, x, y) || inBox(YARD, x, y)) continue;
      if (b.rand() < 0.08) b.place(0, "reed", x, y);
    }
  }
}

/** The bay crab beds (PLAN §8.4, Fishing 45, a creel): the shallows off the south shore and round the mole. */
function waters(b: WorldBuilder): void {
  const hasBank = (x: number, y: number): boolean =>
    ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const).some(([dx, dy]) => b.free(0, x + dx, y + dy));
  const beds = (box: Box) => {
    const tiles: Array<{ x: number; y: number }> = [];
    for (let y = box.y0; y <= box.y1; y++) {
      for (let x = box.x0; x <= box.x1; x++) {
        if (b.overlayAt(0, x, y) !== OVERLAY_WATER) continue;
        if ((x * 3 + y * 5) % 7 !== 0) continue;
        if (hasBank(x, y)) tiles.push({ x, y });
      }
    }
    if (tiles.length > 0) b.addWater({ tiles: tiles.slice(0, 8), count: Math.min(3, tiles.length), method: "trap" });
  };
  beds(boxOf(2870, 3004, 2900, 3013));
  beds(boxOf(2902, 3004, 2940, 3013));
}

/**
 * Who lives here. The road stays safe (§7.7's third rule); the town holds people, the pen its sheep,
 * the quay its rats and the shore its ducks; the wood on the corridor's far side has spiders, boars and
 * wolves, all of them a long way from the square.
 */
function creatures(b: WorldBuilder): void {
  const herds: Array<[string, number, number, number, number]> = [
    ["ram", 4, 2950, 3043, 4],
    ["hen", 3, 2932, 3056, 3],
    ["field_rat", 3, 2905, 3057, 4],
    ["mallard", 4, 2890, 3100, 5],
    ["pond_newt", 3, 2892, 3134, 4],
    ["giant_rat", 4, 2968, 3110, 6],
    ["thicket_spider", 4, 2980, 3160, 6],
    ["wild_boar", 3, 2992, 3096, 8],
    ["grey_wolf", 3, 2996, 3184, 6],
  ];
  const taken = new Set<number>();
  for (const [monster, count, cx, cy, r] of herds) {
    for (let placed = 0, tries = 0; placed < count && tries < 200; tries++) {
      const x = Math.round(cx + (b.rand() * 2 - 1) * r), y = Math.round(cy + (b.rand() * 2 - 1) * r);
      const key = y * 4096 + x;
      if (taken.has(key) || !b.free(0, x, y)) continue;
      taken.add(key);
      b.spawnMonster({ monster, x, y, plane: 0 });
      placed++;
    }
  }
}

/** What lies about: a few coins on the quay, timber in the yard, a fish off the last boat in, bread in the Bell. */
function lying(b: WorldBuilder): void {
  const spawns: Array<[string, number, number, number, number]> = [
    ["coins", 12, 2889, 3031, 200],
    ["logs", 2, 2896, 3020, 200],
    ["raw_sardine", 1, 2888, 3038, 150],
    ["bread", 1, INN.x0 + 2, INN.y0 + 2, 100],
  ];
  for (const [item, count, x, y, respawn] of spawns) {
    const at = freeNear(b, 0, x, y);
    if (at) b.spawnItem({ item, count, x: at.x, y: at.y, respawn, plane: 0 });
  }
}

/** The tile asked for, or the nearest free one within five rings. */
function freeNear(b: WorldBuilder, plane: number, x: number, y: number): { x: number; y: number } | null {
  for (let ring = 0; ring <= 5; ring++) {
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        if (b.free(plane, x + dx, y + dy)) return { x: x + dx, y: y + dy };
      }
    }
  }
  return null;
}

// --- What the district's tables gain from the site ----------------------------------------------------

/** The harbour has the water's tune, the town the village's; the Sound and the sea the water's, and the road between the village's. */
export const BRINEHAVEN_AREAS: ReadonlyArray<{ area: Area; box: Box }> = [
  { area: { key: "harbour", name: "Brinehaven harbour", track: 1 }, box: HARBOUR },
  { area: { key: "brinehaven", name: "Brinehaven", track: 0 }, box: TOWN },
  { area: { key: "sound", name: "The Sunder Sound", track: 1 }, box: SHORE },
  { area: { key: "opensea", name: "The open sea", track: 1 }, box: boxOf(2816, 2944, 3007, 3011) },
  { area: { key: "coastroad", name: "The Coast Road", track: 0 }, box: BRINEHAVEN },
];

export const BRINEHAVEN_LABELS: MapLabel[] = [
  { name: "Brinehaven", x: 2918, y: 3062 },
  { name: "The harbour", x: 2880, y: 3040, small: true },
  { name: "The Drowned Bell", x: 2919, y: 3028, small: true },
  { name: "The mole", x: 2880, y: 3011, small: true },
  { name: "The Coast Road", x: 2903, y: 3140, small: true },
  { name: "The Sunder Sound", x: 2848, y: 3090 },
  { name: "The open sea", x: 2944, y: 2976 },
];

export const BRINEHAVEN_MARKS: Array<{ icon: MapIcon; x: number; y: number; name: string }> = [
  { icon: "inn", x: 2918, y: 3036, name: "The Drowned Bell" },
  { icon: "fish", x: 2884, y: 3008, name: "The crab beds" },
  { icon: "fish", x: 2920, y: 3008, name: "The crab beds" },
  { icon: "ferry", x: FERRY_BERTH.x, y: FERRY_BERTH.y, name: "The ferry berth" },
];

/**
 * The sea route out of the port, and where it goes (§7.6): the Sablewood ferry to Tarhollow, when it
 * sails. Written on the map where the route leaves the built water, as a road's is where it leaves the land.
 */
export const BRINEHAVEN_EXITS: MapExit[] = [
  { name: "The Sablewood ferry — Tarhollow", x: BRINEHAVEN.x0, y: FERRY_BERTH.y, side: "w", away: 1120 },
];

/** Named boxes, for the tests and the map. */
export const BRINEHAVEN_SITES: Record<string, Box> = { brinehaven: BRINEHAVEN, brinehaven_town: TOWN, brinehaven_harbour: HARBOUR };
