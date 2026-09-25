// Sandreach and the Dunes (PLAN §7.6, the first site of Wave 4): where the Sand Road runs out. The road
// runs on from Kilnhold's east gate down the coast, the Cinderwaste's red earth giving way to sand as it
// goes south, to Sandreach, the oasis town: the sixth bank, the Caravan Post (a trader that takes anything,
// because some caravan will carry it east), the Last Well, six flat-roofed houses round the square and the
// pool the town is built on, and the caravan yard. South of it the Dunes: gold (§8.3, Mining 44, the second
// place it is found), the old tombs sealed in the sand, and the scorpions and raiders who think the gold is
// theirs. No smithy and no anvil: Kilnhold is the next town up the road.
//
// Its site is regions 58–62 × 45–50. It shares Kilnhold's east column of corners (x 3712, y 3136–3264),
// which Kilnhold wrote and this never does; the ground beside it is stitched to those values over eight
// tiles, and Kilnhold's bay runs on over the seam to close against the coast here (tests/sandreach.test.ts
// builds the world with and without it and compares every one of them). Built after the Harrow and before
// the Adit, so every id and every roll of the sites before it stands.
import { bayShore, SEA_CORNER } from "./heartland.ts";
import { CINDERWASTE_AREA, SAND_EXIT, wasteHeight } from "./kilnhold.ts";
import {
  OVERLAY_PATH, OVERLAY_WATER, ROOF_KEEP, underlayAt, UNDERLAY_CINDER, UNDERLAY_DIRT, UNDERLAY_GRASS, UNDERLAY_SAND,
} from "./map.ts";
import type { Area, MapIcon, MapLabel } from "./oakridge.ts";
import { valueNoise2D } from "./rng.ts";
import {
  bank, boxOf, building, corners, distanceToPolyline, fence, inBox, road, scatter, shop, smoothstep, WorldBuilder, type Box, type DoorSpec,
  type Point, type TownLook,
} from "./worldgen.ts";
import { TUNE } from "./tunes.ts";

/** The site: regions 58–62 × 45–50, tiles x 3712–4031 and y 2880–3263. */
export const SANDREACH_SITE: Box = boxOf(3712, 2880, 4031, 3263);
/** Kilnhold's east column of corners, which it wrote: x 3712 from y 3136 to 3264. */
const SEAM_X = 3712;
const SEAM_Y0 = 3136;
const SEAM_Y1 = 3264;

/**
 * The coast, north to south, with the sea west of it. It leaves the seam on the bay's own shore line, so
 * Kilnhold's water runs on over the seam, closes the bay's east end, and turns south down the site.
 */
export const COAST: Point[] = [
  [SEAM_X, bayShore(SEAM_X)], [3728, 3146], [3742, 3126], [3750, 3094], [3746, 3040], [3754, 2990], [3768, 2934], [3782, 2880],
];
/** The town, on its shelf: region (60, 47), the pool at its heart and the square north of it. */
export const TOWN: Box = boxOf(3840, 3008, 3903, 3071);
export const SQUARE = { x: 3872, y: 3043 };
export const WELL = { x: 3872, y: 3040 };
/** The oasis: the pool the town is built on, with reeds round its edge and grass and trees round that. */
export const POOL = { x: 3872, y: 3026, r: 6.5 };
const MEADOW_R = 11.5;
export const BANK: Box = boxOf(3877, 3048, 3888, 3056);
/** The Caravan Post, west of the square, its door facing it. */
export const POST: Box = boxOf(3847, 3035, 3856, 3043);
/** The Last Well, the inn, on the square's north-west. */
export const INN: Box = boxOf(3856, 3048, 3868, 3058);
export const HOUSES: ReadonlyArray<readonly [Box, DoorSpec]> = [
  [boxOf(3862, 3061, 3867, 3066), { side: 1, along: 2 }],
  [boxOf(3877, 3060, 3882, 3065), { side: 3, along: 2 }],
  [boxOf(3894, 3049, 3899, 3054), { side: 3, along: 2 }],
  [boxOf(3894, 3057, 3899, 3062), { side: 3, along: 2 }],
  [boxOf(3843, 3049, 3848, 3054), { side: 1, along: 2 }],
  [boxOf(3843, 3057, 3848, 3062), { side: 1, along: 2 }],
];
/** The caravan yard east of the pool, fenced, its gate on the west side. */
export const YARD: Box = boxOf(3887, 3023, 3899, 3036);
const YARD_GATE = { x: 3887, y: 3030 };
/** The Dunes: everything of the site south of the town. */
export const DUNES: Box = boxOf(3776, 2880, 4031, 3003);
/** The gold in the Dunes (§8.3, Mining 44): an outcrop of it out in the sand, with the worst company on the site round it. */
export const GOLD = { x: 3966, y: 2950, r: 7 };
/** The old tombs, sealed in the sand: a low block of stone each, and before its south face the slab over the stair down. */
export const TOMBS: ReadonlyArray<{ x: number; y: number }> = [{ x: 3896, y: 2944 }, { x: 3932, y: 2906 }, { x: 3996, y: 2990 }];

/** The Sand Road on from Kilnhold's east gate, down the coast to the town's north edge and its high street to the square. */
export const SAND_ROAD: Point[] = [
  [SEAM_X, SAND_EXIT.y], [3742, 3210], [3772, 3176], [3798, 3140], [3822, 3106], [3846, 3080], [3862, 3070], [3872, 3066], [3872, 3046],
];
/** Where the Sand Road comes in over Kilnhold's seam. */
export const ROAD_IN = { x: SEAM_X, y: SAND_EXIT.y };
/** The lanes: west along the inn's front and north past two houses, east along the bank's and north past two more, and the path to the yard's gate. */
const LANES: Point[][] = [
  [[3869, 3046], [3851, 3046], [3851, 3064]],
  [[3875, 3046], [3891, 3046], [3891, 3064]],
  [[3876, 3041], [3884, 3032], [3888, 3030]],
];
/**
 * The stubs from a street or lane to each door. ⛔ A stub's end tile is not paved at width 0.6, so each
 * starts a tile inside the way it leaves and runs a tile into its building; the building takes its own back.
 */
const STUBS: Point[][] = [
  [[3882, 3046], [3882, 3049]], [[3862, 3046], [3862, 3049]], [[3869, 3041], [3855, 3039]],
  [[3871, 3063], [3866, 3063]], [[3873, 3062], [3878, 3062]],
  [[3891, 3051], [3895, 3051]], [[3891, 3059], [3895, 3059]],
  [[3851, 3051], [3847, 3051]], [[3851, 3059], [3847, 3059]],
];
/** Every building in the town is flat-roofed behind a parapet, with small windows against the sun. */
const FLAT: TownLook = { roof: ROOF_KEEP, style: "keep" };

export function buildSandreach(b: WorldBuilder, seed: number): void {
  b.clip = SANDREACH_SITE;
  const level = terrain(b, seed);
  sea(b, level);
  roads(b);
  oasis(b);
  town(b);
  tombs(b);
  gold(b);
  wilderness(b, seed);
  creatures(b);
  lying(b);
}

// --- Ground ------------------------------------------------------------------------------------------

/** Whether a corner is this site's to write: Kilnhold's column on the seam is not. */
const ours = (cx: number, cy: number): boolean => !(cx === SEAM_X && cy >= SEAM_Y0 && cy <= SEAM_Y1);

const coastWobble = valueNoise2D(1411);

/** Where the coast is on one row: the sea lies west of it. North of the bay's shore there is none on this site. */
export function coastX(y: number): number {
  const [, top] = COAST[0]!;
  if (y >= top) return -Infinity;
  for (let i = 1; i < COAST.length; i++) {
    const [ax, ay] = COAST[i - 1]!, [bx, by] = COAST[i]!;
    if (y >= by) return ax + ((bx - ax) * (ay - y)) / (ay - by) + 5 * (coastWobble(y / 17, 0.5) - 0.5) * smoothstep(3132, 3100, y);
  }
  return COAST.at(-1)![0];
}

/** Whether a tile is the sea's: west of the coast on its row, as the bay's water is south of its shore. */
export const isSea = (x: number, y: number): boolean => x < coastX(y);

/** How far into the Dunes a point is: nothing north of the town's south edge, all of it a little way south, on a ragged line. */
function duneShare(x: number, y: number, grain: (x: number, y: number) => number): number {
  return smoothstep(3006, 2972, y + 16 * (grain(x / 21, y / 21) - 0.5));
}

/** A noise value folded into a ridge: sharp crests and long soft troughs, the way wind lays sand. */
const ridge = (v: number): number => 1 - Math.abs(2 * v - 1);

/**
 * The ground: the waste's own lie of the land running on over the seam, long ridges of sand rising south
 * of the town, the shelf the town stands level on, the coast easing down to the water as the bay's shore
 * does, and the stitch to Kilnhold's column, joined over eight tiles. Then the red earth giving way to sand
 * going south on a ragged line. Returns the sea's level, read off the district's own sea.
 */
function terrain(b: WorldBuilder, seed: number): number {
  const waste = wasteHeight(seed), dunes = valueNoise2D(seed + 1402), grain = valueNoise2D(seed + 1403);
  const sea = b.heightAtCorner(0, SEA_CORNER.x, SEA_CORNER.y);
  const shelf = waste(SQUARE.x, SQUARE.y) + 0.4;
  for (let cy = SANDREACH_SITE.y0; cy <= SANDREACH_SITE.y1 + 1; cy++) {
    for (let cx = SANDREACH_SITE.x0; cx <= SANDREACH_SITE.x1 + 1; cx++) {
      if (!ours(cx, cy)) continue;
      let h = waste(cx, cy);
      const deep = duneShare(cx, cy, grain);
      if (deep > 0) h += deep * (2.6 * ridge(dunes(cx / 27, cy / 10)) + 0.8 * dunes(cx / 8 + 40, cy / 6));
      const out = Math.max(TOWN.x0 - cx, cx - (TOWN.x1 + 1), TOWN.y0 - cy, cy - (TOWN.y1 + 1), 0);
      h += (shelf - h) * smoothstep(12, 0, out);
      const off = Math.max(0, distanceToPolyline(cx, cy, COAST) - 1);
      h += (sea + 0.6 + off * 0.3 - h) * smoothstep(14, 3, off);
      if (cy >= SEAM_Y0 && cy <= SEAM_Y1 && cx <= SEAM_X + 8) h += (b.heightAtCorner(0, SEAM_X, cy) - h) * smoothstep(SEAM_X + 9, SEAM_X + 1, cx);
      b.setHeight(0, cx, cy, h);
    }
  }
  const sandLine = valueNoise2D(seed + 1404);
  for (let y = SANDREACH_SITE.y0; y <= SANDREACH_SITE.y1; y++) {
    for (let x = SANDREACH_SITE.x0; x <= SANDREACH_SITE.x1; x++) {
      const sandy = smoothstep(3170, 3080, y + 36 * (sandLine(x / 9, y / 9) - 0.5));
      b.setUnderlay(0, x, y, b.rand() < sandy ? UNDERLAY_SAND : UNDERLAY_CINDER);
    }
  }
  return sea;
}

/** The sea west of the coast, at the sea's level, and sand along the shore. */
function sea(b: WorldBuilder, level: number): void {
  for (let y = SANDREACH_SITE.y0; y <= SANDREACH_SITE.y1; y++) {
    for (let x = SANDREACH_SITE.x0; x <= SANDREACH_SITE.x1; x++) {
      if (isSea(x, y)) {
        b.setOverlay(0, x, y, OVERLAY_WATER);
        b.plane(0).collision.block(x, y);
        for (const [cx, cy] of corners(x, y)) if (ours(cx, cy)) b.setHeight(0, cx, cy, level);
      } else if (distanceToPolyline(x + 0.5, y + 0.5, COAST) < 3.5) b.setUnderlay(0, x, y, UNDERLAY_SAND);
    }
  }
}

// --- Roads -------------------------------------------------------------------------------------------

function roads(b: WorldBuilder): void {
  road(b, 0, SAND_ROAD, 1.3);
  for (const lane of LANES) road(b, 0, lane, 1.0);
  for (const stub of STUBS) road(b, 0, stub, 0.6);
  for (let y = SQUARE.y - 5; y <= SQUARE.y + 5; y++) {
    for (let x = SQUARE.x - 5; x <= SQUARE.x + 5; x++) {
      if (Math.hypot(x + 0.5 - SQUARE.x, y + 0.5 - SQUARE.y) <= 4.6) b.setOverlay(0, x, y, OVERLAY_PATH);
    }
  }
  for (let y = SANDREACH_SITE.y0; y <= SANDREACH_SITE.y1; y++) {
    for (let x = SANDREACH_SITE.x0; x <= SANDREACH_SITE.x1; x++) {
      if (b.overlayAt(0, x, y) === OVERLAY_PATH) b.setUnderlay(0, x, y, UNDERLAY_DIRT);
    }
  }
}

// --- The town ------------------------------------------------------------------------------------------

/** The oasis: the pool a hand under the shelf, reeds round its edge, grass round that with trees and bushes on it. */
function oasis(b: WorldBuilder): void {
  const surface = b.heightAtCorner(0, SQUARE.x, SQUARE.y) - 0.7;
  const reach = Math.ceil(MEADOW_R) + 1;
  for (let y = POOL.y - reach; y <= POOL.y + reach; y++) {
    for (let x = POOL.x - reach; x <= POOL.x + reach; x++) {
      const d = Math.hypot(x + 0.5 - POOL.x, y + 0.5 - POOL.y);
      if (d <= POOL.r) {
        b.setOverlay(0, x, y, OVERLAY_WATER);
        b.plane(0).collision.block(x, y);
      } else if (d <= MEADOW_R && b.overlayAt(0, x, y) !== OVERLAY_PATH) b.setUnderlay(0, x, y, UNDERLAY_GRASS);
    }
  }
  for (let cy = POOL.y - reach; cy <= POOL.y + reach + 1; cy++) {
    for (let cx = POOL.x - reach; cx <= POOL.x + reach + 1; cx++) {
      if (Math.hypot(cx - POOL.x, cy - POOL.y) <= POOL.r + 0.2) b.setHeight(0, cx, cy, surface);
    }
  }
  const edge = (x: number, y: number) => Math.hypot(x + 0.5 - POOL.x, y + 0.5 - POOL.y) <= POOL.r + 1.3;
  for (let y = POOL.y - reach; y <= POOL.y + reach; y++) {
    for (let x = POOL.x - reach; x <= POOL.x + reach; x++) {
      if (edge(x, y) && b.free(0, x, y) && b.overlayAt(0, x, y) === 0 && b.rand() < 0.45) b.place(0, "reed", x, y);
    }
  }
  const meadow = (x: number, y: number) => underlayAt(b.plane(0), x, y) === UNDERLAY_GRASS && b.overlayAt(0, x, y) === 0 && !edge(x, y);
  scatter(b, 0, "tree", { x: POOL.x, y: POOL.y, r: MEADOW_R }, 9, meadow);
  scatter(b, 0, "bush", { x: POOL.x, y: POOL.y, r: MEADOW_R }, 6, meadow);
}

/**
 * Sandreach (PLAN §7.6's card and the plan map's): the bank on the square's north-east — the sixth in the
 * world — the Last Well on its north-west, the Caravan Post west of it, six houses on the lanes, the well,
 * the caravan yard by the pool, and the people. Every roof is flat behind a parapet.
 */
function town(b: WorldBuilder): void {
  b.place(0, "well", WELL.x, WELL.y);
  bank(b, BANK, { side: 2, along: 5 }, FLAT);
  shop(b, POST, { side: 1, along: 4 }, "sandreach_caravan", "caravan_master", [{ side: 1, along: 1 }, { side: 1, along: 7 }, { side: 0, along: 4 }], FLAT);

  // The Last Well: two storeys, the range at the back, the stair in the far corner.
  building(b, {
    box: INN,
    doors: [{ side: 2, along: 6 }],
    windows: [{ side: 2, along: 2 }, { side: 2, along: 10 }, { side: 3, along: 5 }, { side: 1, along: 5 }, { side: 0, along: 3 }, { side: 0, along: 9 }],
    storeys: 2,
    stair: { x: INN.x1 - 1, y: INN.y1 - 1 },
    floor: UNDERLAY_DIRT,
    ...FLAT,
    sign: "tankard",
  });
  b.place(0, "range", INN.x0 + 1, INN.y1 - 1);
  b.place(0, "table", INN.x0 + 4, INN.y0 + 3);
  b.place(0, "table", INN.x1 - 3, INN.y0 + 4);
  b.place(0, "barrel", INN.x0 + 1, INN.y0 + 2);
  b.spawnMonster({ monster: "innkeeper_sandreach", x: INN.x0 + 6, y: INN.y0 + 6 });

  for (const [box, door] of HOUSES) {
    const across = door.side === 1 ? 3 : 1;
    building(b, { box, doors: [door], windows: [{ side: across, along: 2 }], floor: UNDERLAY_DIRT, ...FLAT });
  }

  // The caravan yard: a fence round trodden ground, the loads stacked along its east side, two stalls.
  for (let y = YARD.y0; y <= YARD.y1; y++) {
    for (let x = YARD.x0; x <= YARD.x1; x++) if (b.overlayAt(0, x, y) !== OVERLAY_PATH) b.setUnderlay(0, x, y, UNDERLAY_DIRT);
  }
  fence(b, 0, YARD, YARD_GATE);
  for (const [kind, x, y] of [["crate", 3898, 3034], ["crate", 3898, 3033], ["crate", 3897, 3034], ["barrel", 3898, 3025], ["barrel", 3897, 3024], ["stall", 3891, 3034], ["stall", 3894, 3034]] as const) {
    b.place(0, kind, x, y, kind === "stall" ? { tag: "sandreach_caravan" } : {});
  }
  b.place(0, "signpost", 3875, 3068);

  for (const [monster, x, y] of [
    ["sandreacher", 3872, 3052], ["sandreacher_woman", 3866, 3037], ["sandreacher", 3880, 3044], ["sandreacher_woman", 3858, 3046],
    ["caravaneer", 3892, 3028], ["caravaneer", 3895, 3031],
  ] as const) {
    b.spawnMonster({ monster, x, y });
  }
}

// --- The Dunes -----------------------------------------------------------------------------------------

/** The old tombs: a low block of cut stone each, flat-topped, and the slab over its stair down in front of its south face. */
function tombs(b: WorldBuilder): void {
  for (const t of TOMBS) {
    const box = boxOf(t.x - 3, t.y - 2, t.x + 3, t.y + 2);
    building(b, { box, doors: [], windows: [], floor: UNDERLAY_SAND, height: 1, ...FLAT });
    b.place(0, "sealed", t.x, box.y0 - 1, { side: 0, tag: "tomb" });
  }
  b.spawnMonster({ monster: "tomb_warden", x: 3872, y: 3004 });
}

/** The gold (§8.3, Mining 44): five rocks of it among plain rock, out in the sand. */
function gold(b: WorldBuilder): void {
  const clear = (x: number, y: number) => b.overlayAt(0, x, y) === 0;
  scatter(b, 0, "gold_rock", GOLD, 5, clear);
  scatter(b, 0, "rock", GOLD, 6, clear);
}

// --- The country -----------------------------------------------------------------------------------------

/** The waste and the sand: dead trees and rock on the red earth, thinner on the sand, nothing on the town, the tombs or the gold. */
function wilderness(b: WorldBuilder, seed: number): void {
  const grain = valueNoise2D(seed + 1405);
  const kept = (x: number, y: number) =>
    inBox(TOWN, x, y) || TOMBS.some((t) => Math.abs(x - t.x) <= 5 && Math.abs(y - t.y) <= 4) || Math.hypot(x - GOLD.x, y - GOLD.y) < GOLD.r + 2;
  for (let y = SANDREACH_SITE.y0; y <= SANDREACH_SITE.y1; y++) {
    for (let x = SANDREACH_SITE.x0; x <= SANDREACH_SITE.x1; x++) {
      if (!b.free(0, x, y) || b.overlayAt(0, x, y) !== 0 || kept(x, y)) continue;
      const under = underlayAt(b.plane(0), x, y);
      const roll = b.rand();
      if (under === UNDERLAY_CINDER) {
        const dead = 0.016 * grain(x / 9 + 30, y / 9);
        if (roll < dead) b.place(0, "dead_tree", x, y);
        else if (roll < dead + 0.011) b.place(0, "rock", x, y);
      } else if (under === UNDERLAY_SAND) {
        if (roll < 0.004) b.place(0, "dead_tree", x, y);
        else if (roll < 0.009) b.place(0, "rock", x, y);
        else if (roll < 0.011) b.place(0, "bush", x, y);
      }
    }
  }
}

/**
 * Who lives here. The town holds people and the yard's hens; the road north has scorpions and stalkers
 * off it, not on it; the Dunes have the new scorpions, thick round the tombs, and the raiders on the gold.
 */
function creatures(b: WorldBuilder): void {
  const herds: Array<[string, number, number, number, number]> = [
    ["hen", 3, 3893, 3029, 3],
    ["dust_scorpion", 4, 3756, 3204, 10],
    ["sand_stalker", 4, 3822, 3150, 12],
    ["sand_stalker", 3, 3940, 3100, 12],
    ["dune_scorpion", 4, 3900, 2966, 12],
    ["dune_scorpion", 4, 3990, 2984, 12],
    ["dune_scorpion", 3, 3930, 2918, 10],
    ["dune_raider", 3, GOLD.x, GOLD.y, 7],
    ["dune_raider", 2, 3932, 2914, 5],
  ];
  const taken = new Set<number>();
  for (const [monster, count, cx, cy, r] of herds) {
    for (let placed = 0, tries = 0; placed < count && tries < 200; tries++) {
      const x = Math.round(cx + (b.rand() * 2 - 1) * r), y = Math.round(cy + (b.rand() * 2 - 1) * r);
      const key = y * 8192 + x;
      if (taken.has(key) || !b.free(0, x, y) || b.overlayAt(0, x, y) === OVERLAY_PATH) continue;
      taken.add(key);
      b.spawnMonster({ monster, x, y, plane: 0 });
      placed++;
    }
  }
}

/** What lies about: bones by the tombs, a raider's dropped purse by the gold, bread in the Last Well. */
function lying(b: WorldBuilder): void {
  const spawns: Array<[string, number, number, number, number]> = [
    ["bones", 2, TOMBS[1]!.x + 5, TOMBS[1]!.y - 3, 200],
    ["coins", 30, GOLD.x - 9, GOLD.y + 4, 300],
    ["bread", 1, INN.x0 + 3, INN.y0 + 5, 100],
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

/** The town has the village's tune; the Dunes the harder one; the road down the coast is the same waste Kilnhold's is. */
export const SANDREACH_AREAS: ReadonlyArray<{ area: Area; box: Box }> = [
  { area: { key: "sandreach", name: "Sandreach", track: TUNE.village3 }, box: TOWN },
  { area: { key: "dunes", name: "The Dunes", track: TUNE.danger }, box: DUNES },
  { area: CINDERWASTE_AREA, box: SANDREACH_SITE },
];

export const SANDREACH_LABELS: MapLabel[] = [
  { name: "Sandreach", x: 3872, y: 3076 },
  { name: "The Dunes", x: 3940, y: 2962 },
  { name: "The Sand Road", x: 3806, y: 3150, small: true },
  { name: "The Last Well", x: INN.x0 + 6, y: INN.y1 + 2, small: true },
  { name: "The caravan yard", x: 3893, y: 3020, small: true },
  { name: "The old tombs", x: TOMBS[1]!.x, y: TOMBS[1]!.y - 8, small: true },
];

export const SANDREACH_MARKS: Array<{ icon: MapIcon; x: number; y: number; name: string }> = [
  { icon: "inn", x: INN.x0 + 6, y: INN.y0 + 5, name: "The Last Well" },
  { icon: "mine", x: GOLD.x, y: GOLD.y, name: "Gold" },
  { icon: "quest", x: TOMBS[1]!.x, y: TOMBS[1]!.y, name: "The old tombs (sealed)" },
];

/** Named boxes, for the tests and the map. */
export const SANDREACH_SITES: Record<string, Box> = { sandreach_site: SANDREACH_SITE, sandreach: TOWN, dunes: DUNES };
