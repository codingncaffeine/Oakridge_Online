// The Oakridge district: regions 49–51 × 49–51, tiles x 3136–3327 and y 3136–3327 (PLAN §7.1, §7.4).
// Every site, box and name below comes straight from §7.4's table. The village, the farm, the quarry
// and the barrow are authored tile by tile; the ground between them is seeded, because a region of
// nowhere-in-particular should cost nothing to make (§7.2).
//
// The server and the client both build this from the same seed, so no map data travels over the wire.
import {
  BRINEHAVEN_AREAS, BRINEHAVEN_EXITS, BRINEHAVEN_LABELS, BRINEHAVEN_MARKS, BRINEHAVEN_SITES, buildBrinehaven,
} from "./brinehaven.ts";
import { BLOCKED } from "./collision.ts";
import { DISTRICT, FRAME, GREEN, heartlandHeight, ORIGIN_X, ORIGIN_Y, SIZE, WEND, wendRow } from "./heartland.ts";
import {
  OVERLAY_PATH, OVERLAY_WATER, ROOF_KEEP, ROOF_SLATE, ROOF_THATCH, UNDERLAY_DIRT, UNDERLAY_FOREST, UNDERLAY_GRASS,
  UNDERLAY_SAND, type ObjectKind, type WorldStack,
} from "./map.ts";
import { valueNoise2D } from "./rng.ts";
import {
  buildStonecote, HAMLET, HOLLOW_AREA, STONECOTE_AREAS, STONECOTE_LABELS, STONECOTE_MARKS, STONECOTE_SITES,
} from "./stonecote.ts";
import {
  buildThornbury, SEWERS_AREA, THORNBURY, THORNBURY_AREAS, THORNBURY_EXITS, THORNBURY_LABELS, THORNBURY_MARKS, THORNBURY_SITES,
} from "./thornbury.ts";
import { buildWickstead, WICKSTEAD_AREAS, WICKSTEAD_EXITS, WICKSTEAD_LABELS, WICKSTEAD_MARKS, WICKSTEAD_SITES } from "./wickstead.ts";
import {
  boxOf, building, centreOf, corners, fence, inBox, road, scatter, smoothstep, tower,
  WorldBuilder, type Box, type Point,
} from "./worldgen.ts";

export const OAKRIDGE_SEED = 7;

/** The frame, the district's box and the green live in heartland.ts now, shared with every site; they are still had from here. */
export { DISTRICT, FRAME, GREEN, ORIGIN_X, ORIGIN_Y, SIZE } from "./heartland.ts";

// --- The sites of PLAN §7.4 --------------------------------------------------------------------

/** The village, on the ridge above the west bank of the Wend. */
const VILLAGE = boxOf(3200, 3200, 3250, 3262);
const BRIDGE = boxOf(3249, 3227, 3262, 3236);
const JETTY = boxOf(3247, 3196, 3258, 3201);
const FARM = boxOf(3198, 3272, 3248, 3318);
/** The wood: everything west of this line between these two rows (§7.4 gives it as an open box). */
const OAKENSHAW = boxOf(3136, 3232, 3206, 3327);
const QUARRY = { x: 3294, y: 3296, r: 27 };
const WENDMOUTH = boxOf(3188, 3136, 3274, 3200);
const ASHBARROW = boxOf(3152, 3150, 3190, 3188);
const STOCKADE = boxOf(3142, 3236, 3168, 3262);
const MEADOW = boxOf(3272, 3198, 3327, 3264);
/** The Emberway Gate: shut, and the reason the east is closed (§7.3). */
const GATE = { x: 3320, y: 3231 };

/** The roads out, and the two local paths. Each is a polyline in world tiles (§7.4). */
const NORTH_ROAD: Point[] = [[3232, 3263], [3230, 3280], [3226, 3300], [3224, 3327]];
const WEST_ROAD: Point[] = [[3199, 3233], [3180, 3236], [3160, 3234], [3136, 3236]];
const EMBERWAY: Point[] = [[3251, 3231], [3266, 3231], [3290, 3230], [3312, 3231], [3327, 3231]];
const QUARRY_TRACK: Point[] = [[3266, 3230], [3276, 3262], [3286, 3280], [3292, 3292]];
const BARROW_PATH: Point[] = [[3204, 3234], [3192, 3218], [3180, 3198], [3172, 3186]];
const JETTY_PATH: Point[] = [[3232, 3213], [3240, 3206], [3250, 3200]];
/** The village's own lanes, which is what makes it read as a village rather than a field of sheds. */
const VILLAGE_LANES: Point[][] = [
  [[3232, 3200], [3232, 3262]],
  [[3202, 3232], [3250, 3232]],
  [[3214, 3214], [3214, 3250]],
  [[3246, 3214], [3246, 3250]],
  [[3204, 3216], [3248, 3216]],
  [[3204, 3248], [3248, 3248]],
];

/**
 * Builds the world: the district, then the sites of Wave 1 beside it (PLAN Phase 12), all on one frame
 * from one seed, so the server and the client hold the same map. `sites` can leave a site out, for a
 * test that wants the world without it to compare against; each site is built against the one before
 * it, so leaving Stonecote out leaves Thornbury out too. Wickstead is built against the district alone,
 * and Brinehaven against Wickstead, last of all, so nothing already standing is rolled again by its arrival.
 */
export function buildOakridge(seed: number, sites: { stonecote?: boolean; thornbury?: boolean; wickstead?: boolean; brinehaven?: boolean } = {}): WorldStack {
  const b = new WorldBuilder(FRAME.width, FRAME.height, FRAME.x0, FRAME.y0, seed);
  buildDistrict(b, seed);
  if (sites.stonecote !== false) {
    buildStonecote(b, seed);
    if (sites.thornbury !== false) buildThornbury(b, seed);
  }
  if (sites.wickstead !== false) {
    buildWickstead(b, seed);
    if (sites.brinehaven !== false) buildBrinehaven(b, seed);
  }
  return b.finish({ ...GREEN, plane: 0 }, "oakridge");
}

/**
 * Builds the district. Order matters: ground, then water, then the roads, then everything that stands
 * on them, because each step reads what the one before it wrote.
 */
export function buildDistrict(b: WorldBuilder, seed: number): void {
  // The district is built on the frame but stays inside its own three-by-three regions: a road that
  // runs off its edge stops there, and the region next door stays unbuilt until its own site writes it.
  b.clip = DISTRICT;
  const ground = b.plane(0);

  terrain(b, seed);
  river(b);
  sea(b);
  roads(b);
  village(b);
  farm(b);
  oakenshaw(b);
  quarry(b);
  wendmouth(b);
  ashbarrow(b);
  stockade(b);
  meadow(b);
  wilderness(b, seed);
  waters(b);
  creatures(b);
  lying(b);

  // Nothing is left blocking the tile a player wakes on.
  if ((ground.collision.get(GREEN.x, GREEN.y) & BLOCKED) !== 0) ground.collision.unblock(GREEN.x, GREEN.y);
}

// --- Ground --------------------------------------------------------------------------------------

/**
 * The lie of the land: a ridge under the village falling east to the river and south to the marsh,
 * rising west into the wood and east again into the quarry's dry ground. The green itself is flat,
 * because a spawn on a slope reads as a mistake.
 */
function terrain(b: WorldBuilder, seed: number): void {
  // The heartland's height is a function of world coordinates (heartland.ts), shared with the sites
  // built against the district, so the seam between them is exact.
  const raw = heartlandHeight(seed);
  const flat = raw(GREEN.x, GREEN.y);
  for (let cy = ORIGIN_Y; cy <= ORIGIN_Y + SIZE; cy++) {
    for (let cx = ORIGIN_X; cx <= ORIGIN_X + SIZE; cx++) {
      // The green and its immediate surroundings are levelled, easing out over eight tiles.
      const keep = smoothstep(5, 13, Math.hypot(cx - GREEN.x, cy - GREEN.y));
      b.setHeight(0, cx, cy, flat + (raw(cx, cy) - flat) * keep);
      b.setUnderlay(0, cx, cy, UNDERLAY_GRASS);
    }
  }
}

/** The Wend, running the whole height of the map, with a sand bank either side and one bridge over it. */
function river(b: WorldBuilder): void {
  for (let y = ORIGIN_Y; y < ORIGIN_Y + SIZE; y++) {
    // The row's centre and width are the heartland's (wendRow), so Stonecote's stretch carries on from them.
    const { mid, half } = wendRow(y);
    for (let x = Math.floor(mid - half - 3); x <= Math.ceil(mid + half + 3); x++) {
      const d = Math.abs(x + 0.5 - mid);
      if (d <= half) {
        b.setOverlay(0, x, y, OVERLAY_WATER);
        b.plane(0).collision.block(x, y);
      } else if (d <= half + 2) {
        b.setUnderlay(0, x, y, UNDERLAY_SAND);
      }
    }
  }
  // The water's floor sits below its lowest bank, so it reads as water rather than a blue field.
  levelWater(b, boxOf(WEND.x - 8, ORIGIN_Y, WEND.x + 8, ORIGIN_Y + SIZE - 1));
  bridge(b);
}

/** The bridge: the only crossing for two regions (§7.4). Its deck is path, and the water under it is walkable. */
function bridge(b: WorldBuilder): void {
  const y0 = 3230, y1 = 3233;
  let high = -Infinity;
  for (const x of [BRIDGE.x0, BRIDGE.x1]) for (let cy = y0; cy <= y1 + 1; cy++) high = Math.max(high, b.heightAtCorner(0, x, cy));
  for (let x = BRIDGE.x0; x <= BRIDGE.x1; x++) {
    for (let y = y0; y <= y1; y++) {
      b.setOverlay(0, x, y, OVERLAY_PATH);
      b.plane(0).collision.unblock(x, y);
      for (const [cx, cy] of corners(x, y)) b.setHeight(0, cx, cy, high);
    }
    // A rail each side, so it reads as a bridge from the bank.
    b.place(0, "fence", x, y0, { side: 2 });
    b.place(0, "fence", x, y1, { side: 0 });
  }
}

/** The sea, south of Wendmouth: everything below this line is water, with reeds and sand above it. */
function sea(b: WorldBuilder): void {
  const wobble = valueNoise2D(77);
  for (let x = ORIGIN_X; x < ORIGIN_X + SIZE; x++) {
    const shore = 3150 + 7 * wobble((x - ORIGIN_X) / 26, 0.5);
    for (let y = ORIGIN_Y; y < shore; y++) {
      b.setOverlay(0, x, y, OVERLAY_WATER);
      b.plane(0).collision.block(x, y);
    }
    for (let y = Math.floor(shore); y < shore + 3; y++) b.setUnderlay(0, x, y, UNDERLAY_SAND);
  }
  levelWater(b, boxOf(ORIGIN_X, ORIGIN_Y, ORIGIN_X + SIZE - 1, 3162));
}

/** Drops every water corner in a box to just below the lowest bank around it, so water lies flat and low. */
function levelWater(b: WorldBuilder, box: Box): void {
  let lowest = Infinity;
  for (let y = box.y0; y <= box.y1; y++) {
    for (let x = box.x0; x <= box.x1; x++) {
      if (b.overlayAt(0, x, y) !== OVERLAY_WATER) continue;
      for (const [cx, cy] of corners(x, y)) lowest = Math.min(lowest, b.heightAtCorner(0, cx, cy));
    }
  }
  if (!Number.isFinite(lowest)) return;
  for (let y = box.y0; y <= box.y1; y++) {
    for (let x = box.x0; x <= box.x1; x++) {
      if (b.overlayAt(0, x, y) !== OVERLAY_WATER) continue;
      for (const [cx, cy] of corners(x, y)) b.setHeight(0, cx, cy, lowest - 0.4);
    }
  }
}

function roads(b: WorldBuilder): void {
  for (const line of [NORTH_ROAD, WEST_ROAD, EMBERWAY, QUARRY_TRACK]) road(b, 0, line, 1.3);
  for (const line of [BARROW_PATH, JETTY_PATH]) road(b, 0, line, 0.8);
  for (const lane of VILLAGE_LANES) road(b, 0, lane, 0.85);
  // The green: a wide round of open path at the centre of it all.
  for (let y = GREEN.y - 5; y <= GREEN.y + 5; y++) {
    for (let x = GREEN.x - 5; x <= GREEN.x + 5; x++) {
      if (Math.hypot(x - GREEN.x, y - GREEN.y) <= 5) b.setOverlay(0, x, y, OVERLAY_PATH);
    }
  }
  // A dirt track under the roads reads as beaten ground rather than grass with a stripe on it.
  for (let y = ORIGIN_Y; y < ORIGIN_Y + SIZE; y++) {
    for (let x = ORIGIN_X; x < ORIGIN_X + SIZE; x++) {
      if (b.overlayAt(0, x, y) === OVERLAY_PATH) b.setUnderlay(0, x, y, UNDERLAY_DIRT);
    }
  }
}

// --- The village ---------------------------------------------------------------------------------

/**
 * Oakridge itself (§7.4): the green with the bank, the two shops, the smithy, the inn, the church and
 * its graveyard, the mill, and three cottages. §7.7's rule 2 puts the bank at the centre with the
 * general store beside it — that triangle is the town, and everything else is decoration round it.
 */
function village(b: WorldBuilder): void {
  // The bank, on the north side of the green: the village's keep. Flat-roofed behind a parapet, with
  // arrow slits for windows and a turret standing proud of each corner (2026-09-24: the reference keeps
  // its bank in the castle, and the castle is what a stone town is built to look like).
  building(b, {
    box: boxOf(3226, 3238, 3234, 3245),
    doors: [{ side: 2, along: 4 }],
    windows: [{ side: 2, along: 1 }, { side: 2, along: 7 }, { side: 0, along: 4 }],
    floor: UNDERLAY_DIRT,
    roof: ROOF_KEEP,
    style: "keep",
  });
  for (const [x, y] of [[3225, 3237], [3234, 3237], [3225, 3245], [3234, 3245]] as const) tower(b, boxOf(x, y, x + 1, y + 1));
  for (let x = 3228; x <= 3232; x++) b.place(0, "bank_booth", x, 3244);
  b.spawnMonster({ monster: "banker", x: 3229, y: 3243 });
  b.spawnMonster({ monster: "banker", x: 3231, y: 3243 });

  // The general store, east of the bank across the lane.
  building(b, {
    box: boxOf(3238, 3238, 3245, 3244),
    doors: [{ side: 2, along: 3 }],
    windows: [{ side: 2, along: 0 }, { side: 1, along: 3 }],
    floor: UNDERLAY_DIRT,
  });
  for (let x = 3239; x <= 3243; x++) b.place(0, "counter", x, 3243, { tag: "oakridge_general" });
  b.spawnMonster({ monster: "shopkeeper_general", x: 3241, y: 3242 });

  // The tool shop, west of the bank.
  building(b, {
    box: boxOf(3214, 3238, 3221, 3244),
    doors: [{ side: 2, along: 4 }],
    windows: [{ side: 2, along: 1 }, { side: 3, along: 3 }],
    floor: UNDERLAY_DIRT,
  });
  for (let x = 3215; x <= 3219; x++) b.place(0, "counter", x, 3243, { tag: "oakridge_tools" });
  b.spawnMonster({ monster: "shopkeeper_tools", x: 3217, y: 3242 });

  // The smithy: a furnace and an anvil, idle until Phase 8 and working from it.
  building(b, {
    box: boxOf(3238, 3220, 3246, 3228),
    doors: [{ side: 3, along: 4 }, { side: 0, along: 4 }],
    windows: [{ side: 1, along: 4 }],
    floor: UNDERLAY_DIRT,
  });
  b.place(0, "furnace", 3244, 3226);
  b.place(0, "furnace", 3244, 3222);
  b.place(0, "anvil", 3240, 3224);
  b.place(0, "anvil", 3242, 3224);
  b.spawnMonster({ monster: "smith", x: 3241, y: 3226 });

  // The Split Oak: two storeys, with the range on the ground floor and rooms above (§7.4).
  building(b, {
    box: boxOf(3214, 3220, 3223, 3229),
    doors: [{ side: 1, along: 5 }],
    windows: [{ side: 2, along: 2 }, { side: 2, along: 7 }, { side: 3, along: 5 }],
    storeys: 2,
    stair: { x: 3215, y: 3221 },
    floor: UNDERLAY_DIRT,
  });
  b.place(0, "range", 3221, 3227);
  b.place(0, "table", 3217, 3225);
  b.place(0, "table", 3220, 3223);
  b.place(0, "barrel", 3216, 3228);
  b.spawnMonster({ monster: "innkeeper", x: 3221, y: 3225 });
  b.spawnMonster({ monster: "villager", x: 3218, y: 3224 });
  // Upstairs: a couple of rooms and nothing else yet, which is what the innkeeper says too.
  b.place(1, "barrel", 3222, 3228);
  b.place(1, "table", 3218, 3225);

  // The church and its graveyard, on the quiet south-west corner of the village: a slate nave, and a
  // square bell tower on its south end, twice the height of the walls and crenellated.
  building(b, {
    box: boxOf(3204, 3204, 3212, 3214),
    doors: [{ side: 0, along: 4 }],
    windows: [{ side: 3, along: 3 }, { side: 3, along: 7 }, { side: 1, along: 3 }, { side: 1, along: 7 }],
    floor: UNDERLAY_DIRT,
    roof: ROOF_SLATE,
  });
  tower(b, boxOf(3204, 3201, 3206, 3203), [{ side: 2, along: 1 }, { side: 3, along: 1 }, { side: 1, along: 1 }]);
  for (let n = 0; n < 8; n++) b.place(0, "grave", 3200 + (n % 4) * 2, 3204 + Math.floor(n / 4) * 3);

  // The mill, north-west, with its millstone. Flour waits for a baker, and the miller says so.
  building(b, {
    box: boxOf(3206, 3252, 3212, 3258),
    doors: [{ side: 2, along: 3 }],
    windows: [{ side: 0, along: 3 }],
    storeys: 2,
    stair: { x: 3207, y: 3253 },
    floor: UNDERLAY_DIRT,
    roof: ROOF_SLATE,
  });
  b.place(1, "millstone", 3209, 3255);
  b.spawnMonster({ monster: "miller", x: 3209, y: 3253 });

  // Three cottages around the green's edges.
  for (const [box, door] of [
    [boxOf(3222, 3206, 3228, 3212), { side: 0 as const, along: 3 }],
    [boxOf(3236, 3206, 3242, 3212), { side: 0 as const, along: 3 }],
    [boxOf(3238, 3252, 3244, 3258), { side: 2 as const, along: 3 }],
  ] as const) {
    building(b, { box, doors: [door], windows: [{ side: 1, along: 3 }], floor: UNDERLAY_DIRT });
  }
  b.spawnMonster({ monster: "villager_woman", x: 3225, y: 3214 });
  b.spawnMonster({ monster: "villager", x: 3240, y: 3214 });
  b.spawnMonster({ monster: "villager_woman", x: 3236, y: 3236 });
  b.spawnMonster({ monster: "guard", x: 3232, y: 3260 });
  b.spawnMonster({ monster: "guard", x: 3204, y: 3234 });

  // A signpost on the green, where the lanes cross.
  b.place(0, "signpost", GREEN.x + 3, GREEN.y + 3);
}

// --- The other sites -----------------------------------------------------------------------------

/** Hollowbeck Farm (§7.4): pens, tilled strips and a barn, north of the village. Nothing here fights back. */
function farm(b: WorldBuilder): void {
  const pen = boxOf(3204, 3280, 3218, 3294);
  fence(b, 0, pen, { x: 3211, y: 3280 });
  // The sheep pen and the barn stand east of the North Road, the cow pen west of it: the road runs
  // between them and on out of the district. (Until 2026-09-24 both stood across the road, so the way
  // north went in at the pen's gate and ended at the barn's south door; found building the road on to Stonecote.)
  const sheep = boxOf(3236, 3282, 3246, 3292);
  fence(b, 0, sheep, { x: 3241, y: 3282 });
  // The barn: the one thatched roof in the district.
  building(b, {
    box: boxOf(3236, 3298, 3246, 3306),
    doors: [{ side: 2, along: 5 }],
    windows: [{ side: 0, along: 5 }],
    floor: UNDERLAY_DIRT,
    roof: ROOF_THATCH,
  });
  building(b, {
    box: boxOf(3206, 3300, 3212, 3306),
    doors: [{ side: 1, along: 3 }],
    floor: UNDERLAY_DIRT,
  });
  b.spawnMonster({ monster: "farmer", x: 3220, y: 3298 });
  // Tilled strips: dirt with crops standing in rows. The North Road crosses them, and stays clear:
  // crops on its tiles left it walkable only by zigzagging, which the pathfinder gave up on, so nobody
  // could click their way north out of the district (found 2026-09-24 building the road on to Stonecote).
  for (let y = 3310; y <= 3316; y++) {
    for (let x = 3200; x <= 3238; x++) {
      if (b.overlayAt(0, x, y) === OVERLAY_PATH) continue;
      b.setUnderlay(0, x, y, UNDERLAY_DIRT);
      if ((x + y) % 3 === 0 && b.free(0, x, y)) b.place(0, "crop", x, y);
    }
  }
}

/**
 * The Oakenshaw (§7.4): plain trees at the edge, oaks deeper in, and the rest of the ladder further
 * west still — §8.1's rule, the better the wood the longer the walk. The village is named for it.
 */
function oakenshaw(b: WorldBuilder): void {
  const woods = valueNoise2D(202);
  const deep = (x: number) => smoothstep(3206, 3150, x);
  for (let y = OAKENSHAW.y0; y <= Math.min(OAKENSHAW.y1, ORIGIN_Y + SIZE - 1); y++) {
    for (let x = OAKENSHAW.x0; x <= OAKENSHAW.x1; x++) {
      if (!b.free(0, x, y) || b.overlayAt(0, x, y) === OVERLAY_PATH) continue;
      if (inBox(STOCKADE, x - 2, y - 2) && inBox(STOCKADE, x + 2, y + 2)) continue;
      const density = 0.1 + 0.35 * deep(x) * (0.5 + 0.5 * woods((x - ORIGIN_X) / 7, (y - ORIGIN_Y) / 7));
      b.setUnderlay(0, x, y, UNDERLAY_FOREST);
      if (b.rand() >= density) continue;
      // §7.4: trees at the edge, oaks deeper in. The edge matters — a beginner walking out of the
      // village meets it first, and an oak needs Woodcutting 12 they have not got yet.
      b.place(0, b.rand() < 0.06 + 0.55 * deep(x) ? "oak" : "tree", x, y);
    }
  }
  // The groves of the better wood, each further out than the last (PLAN §8.1, §8.2).
  const groves: Array<[ObjectKind, number, number, number, number]> = [
    ["alder", 3186, 3268, 4, 6],
    ["rowan", 3168, 3256, 4, 5],
    ["blackthorn", 3156, 3282, 4, 5],
    ["ironbark", 3146, 3252, 3.5, 4],
    ["sablewood", 3142, 3300, 3, 3],
    ["heartoak", 3138, 3320, 2.5, 2],
  ];
  for (const [kind, x, y, r, count] of groves) scatter(b, 0, kind, { x, y, r }, count);
}

/**
 * Copperfoot Quarry (§7.4): copper and tin on the rim at Mining 1, iron in the floor at 12, and — built
 * now because Phase 8 cannot smith steel without it — the coal seam in its deep floor (§8.3). The Adit's
 * barred mouth is in its east wall, for Wave 2 to open.
 */
function quarry(b: WorldBuilder): void {
  const wobble = valueNoise2D(303);
  for (let y = QUARRY.y - QUARRY.r - 2; y <= QUARRY.y + QUARRY.r + 2; y++) {
    for (let x = QUARRY.x - QUARRY.r - 2; x <= QUARRY.x + QUARRY.r + 2; x++) {
      const d = Math.hypot(x + 0.5 - QUARRY.x, y + 0.5 - QUARRY.y) + 2.5 * (wobble((x - ORIGIN_X) / 5, (y - ORIGIN_Y) / 5) - 0.5);
      if (d > QUARRY.r) continue;
      if (b.overlayAt(0, x, y) === OVERLAY_WATER) continue;
      b.setUnderlay(0, x, y, d < QUARRY.r - 8 ? UNDERLAY_DIRT : UNDERLAY_SAND);
    }
  }
  const inFloor = (x: number, y: number) => Math.hypot(x + 0.5 - QUARRY.x, y + 0.5 - QUARRY.y) < QUARRY.r - 9;
  const onRim = (x: number, y: number) => {
    const d = Math.hypot(x + 0.5 - QUARRY.x, y + 0.5 - QUARRY.y);
    return d > QUARRY.r - 8 && d < QUARRY.r;
  };
  const clear = (x: number, y: number) => b.overlayAt(0, x, y) !== OVERLAY_PATH;
  scatter(b, 0, "copper_rock", QUARRY, 8, (x, y) => onRim(x, y) && clear(x, y));
  scatter(b, 0, "tin_rock", QUARRY, 8, (x, y) => onRim(x, y) && clear(x, y));
  scatter(b, 0, "iron_rock", { ...QUARRY, r: QUARRY.r - 6 }, 7, (x, y) => inFloor(x, y) && clear(x, y));
  // The heart of the floor: the seam Phase 8 cannot smith steel without (PLAN §7, §8.3).
  scatter(b, 0, "coal_rock", { x: QUARRY.x, y: QUARRY.y, r: 5 }, 5, clear);
  scatter(b, 0, "rock", QUARRY, 14, clear);
  // The Adit: a barred mouth in the quarry's east wall. Wave 2 opens it (§7.6).
  b.place(0, "barred", QUARRY.x + QUARRY.r - 1, QUARRY.y, { side: 1 });
  b.place(0, "signpost", QUARRY.x + QUARRY.r - 2, QUARRY.y);
}

/** Wendmouth (§7.4): reeds, then the sea. The net spots a beginner is meant to find are here and at the jetty. */
function wendmouth(b: WorldBuilder): void {
  for (let y = WENDMOUTH.y0; y <= WENDMOUTH.y1; y++) {
    for (let x = WENDMOUTH.x0; x <= WENDMOUTH.x1; x++) {
      if (!b.free(0, x, y) || b.overlayAt(0, x, y) === OVERLAY_PATH) continue;
      if (y > 3178) continue;
      if (b.rand() < 0.06) b.place(0, "reed", x, y);
    }
  }
  // The jetty: planks out over the water, with a rail down each side, where the net spots sit (§7.4).
  const deck: Array<{ x: number; y: number }> = [];
  for (let x = JETTY.x0; x <= JETTY.x1; x++) {
    for (let y = JETTY.y0; y <= JETTY.y1; y++) {
      if (b.overlayAt(0, x, y) !== OVERLAY_WATER) continue;
      b.setOverlay(0, x, y, OVERLAY_PATH);
      b.plane(0).collision.unblock(x, y);
      deck.push({ x, y });
    }
  }
  // A rail wherever the deck meets open water, so it reads as a jetty and not a walkable patch of sea.
  for (const { x, y } of deck) {
    for (const [dx, dy, side] of [[0, 1, 0], [1, 0, 1], [0, -1, 2], [-1, 0, 3]] as const) {
      if (b.overlayAt(0, x + dx, y + dy) === OVERLAY_WATER) b.place(0, "fence", x, y, { side });
    }
  }
  for (const [x, y] of [[JETTY.x1, JETTY.y0], [JETTY.x1, JETTY.y1]] as const) {
    if (b.free(0, x, y - 1)) b.place(0, "barrel", x, y - 1);
  }
}

/**
 * Ashbarrow (§7.4): a walled mound south-west, the hardest thing in the district. Its stair is built and
 * sealed; Wave 3 opens it (§7.6). The barrow warden lives at the top.
 */
function ashbarrow(b: WorldBuilder): void {
  const centre = centreOf(ASHBARROW);
  // The mound itself: raised ground inside the wall.
  for (let cy = ASHBARROW.y0; cy <= ASHBARROW.y1 + 1; cy++) {
    for (let cx = ASHBARROW.x0; cx <= ASHBARROW.x1 + 1; cx++) {
      const d = Math.hypot(cx - centre.x, cy - centre.y);
      b.setHeight(0, cx, cy, b.heightAtCorner(0, cx, cy) + 3.2 * smoothstep(20, 4, d));
    }
  }
  for (let y = ASHBARROW.y0; y <= ASHBARROW.y1; y++) {
    for (let x = ASHBARROW.x0; x <= ASHBARROW.x1; x++) {
      if (Math.hypot(x - centre.x, y - centre.y) < 19) b.setUnderlay(0, x, y, UNDERLAY_DIRT);
    }
  }
  // The wall, with one way in on the north side where the Barrow Path arrives. It is a ruin: the
  // renderer draws a `ruin` wall lower and with its battlements broken.
  const wall = boxOf(centre.x - 9, centre.y - 9, centre.x + 9, centre.y + 9);
  for (let x = wall.x0; x <= wall.x1; x++) {
    b.place(0, "stone_wall", x, wall.y0, { side: 2, tag: "ruin" });
    if (x !== centre.x) b.place(0, "stone_wall", x, wall.y1, { side: 0, tag: "ruin" });
  }
  for (let y = wall.y0; y <= wall.y1; y++) {
    b.place(0, "stone_wall", wall.x0, y, { side: 3, tag: "ruin" });
    b.place(0, "stone_wall", wall.x1, y, { side: 1, tag: "ruin" });
  }
  // The sealed stair at the top of the mound, and the sarcophagi round it.
  b.place(0, "sealed", centre.x, centre.y, { side: 2 });
  for (const [dx, dy] of [[-3, -2], [3, -2], [-3, 2], [3, 2]] as const) b.place(0, "sarcophagus", centre.x + dx, centre.y + dy);
  for (let n = 0; n < 10; n++) {
    const x = centre.x - 7 + b.pick(15), y = centre.y - 7 + b.pick(15);
    if (b.free(0, x, y)) b.place(0, "grave", x, y);
  }
}

/** The Mudfoot Stockade (§7.4): a palisade in a clearing of the wood, west of the village. */
function stockade(b: WorldBuilder): void {
  const centre = centreOf(STOCKADE);
  for (let y = STOCKADE.y0; y <= STOCKADE.y1; y++) {
    for (let x = STOCKADE.x0; x <= STOCKADE.x1; x++) b.setUnderlay(0, x, y, UNDERLAY_DIRT);
  }
  const wall = boxOf(centre.x - 7, centre.y - 7, centre.x + 7, centre.y + 7);
  fence(b, 0, wall, { x: centre.x, y: wall.y1 }, "fence");
  for (const [dx, dy] of [[-4, -3], [4, -3], [0, 4]] as const) b.place(0, "crate", centre.x + dx, centre.y + dy);
  b.place(0, "fire", centre.x, centre.y);
}

/** The East Meadow and the Emberway Gate (§7.4): open ground, the road east, and a wall with a door in it. */
function meadow(b: WorldBuilder): void {
  for (let y = MEADOW.y0; y <= MEADOW.y1; y++) {
    for (let x = MEADOW.x0; x <= Math.min(MEADOW.x1, ORIGIN_X + SIZE - 1); x++) {
      if (!b.free(0, x, y) || b.overlayAt(0, x, y) !== 0) continue;
      if (b.rand() < 0.012) b.place(0, "bush", x, y);
    }
  }
  // The gate: a gatehouse across the Emberway — a tower either side of a one-tile passage, a shut gate
  // in the middle of it, and a crenellated wall running out from each tower — and a keeper who explains
  // why it is shut (§7.3).
  tower(b, boxOf(GATE.x - 1, GATE.y + 1, GATE.x + 1, GATE.y + 3), [{ side: 1, along: 1 }, { side: 3, along: 1 }]);
  tower(b, boxOf(GATE.x - 1, GATE.y - 3, GATE.x + 1, GATE.y - 1), [{ side: 1, along: 1 }, { side: 3, along: 1 }]);
  for (let y = GATE.y - 8; y <= GATE.y + 8; y++) {
    if (y === GATE.y) b.place(0, "gate", GATE.x, y, { side: 1, tag: "emberway" });
    else if (Math.abs(y - GATE.y) > 3) b.place(0, "stone_wall", GATE.x, y, { side: 1 });
  }
  b.spawnMonster({ monster: "gatekeeper", x: GATE.x - 3, y: GATE.y });
}

/** The ground nobody authored: a scatter of trees, bushes and rocks so no corner of the map is bare. */
function wilderness(b: WorldBuilder, seed: number): void {
  const woods = valueNoise2D(seed + 404);
  for (let y = ORIGIN_Y + 1; y < ORIGIN_Y + SIZE - 1; y++) {
    for (let x = ORIGIN_X + 1; x < ORIGIN_X + SIZE - 1; x++) {
      if (!b.free(0, x, y) || b.overlayAt(0, x, y) !== 0) continue;
      if (inBox(VILLAGE, x, y) || inBox(FARM, x, y) || inBox(ASHBARROW, x, y)) continue;
      if (Math.hypot(x - GREEN.x, y - GREEN.y) < 14) continue;
      const trees = 0.05 * woods((x - ORIGIN_X) / 11, (y - ORIGIN_Y) / 11);
      const roll = b.rand();
      if (roll < trees) b.place(0, "tree", x, y);
      else if (roll < trees + 0.008) b.place(0, "bush", x, y);
      else if (roll < trees + 0.011) b.place(0, "rock", x, y);
    }
  }
}

/**
 * The fishing waters (§8.4). Only the net's two rungs are here: the rod, the creel and the harpoon are
 * what the settlements of Wave 1 are for, so the district deliberately stops at smelt (Fishing 14).
 */
function waters(b: WorldBuilder): void {
  /**
   * A spot is only any use if somebody can stand beside it. The pathfinder's search window is 128 tiles
   * across, so a walk from the green cannot even reach the coast — which is why this asks the question
   * that actually matters (is there dry land next to it?) rather than the one the test map could afford.
   */
  const hasBank = (x: number, y: number): boolean =>
    ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const).some(([dx, dy]) => b.free(0, x + dx, y + dy));

  // Sardines off the jetty, smelt out in the river mouth: §8.4's first two rungs, and nothing above.
  const around = boxOf(JETTY.x0 - 2, JETTY.y0 - 3, JETTY.x1 + 2, JETTY.y1 + 3);
  for (const box of [around, boxOf(3196, 3152, 3252, 3172)]) {
    const tiles: Array<{ x: number; y: number }> = [];
    for (let y = box.y0; y <= box.y1; y++) {
      for (let x = box.x0; x <= box.x1; x++) {
        if (b.overlayAt(0, x, y) !== OVERLAY_WATER) continue;
        if ((x * 3 + y * 5) % 7 !== 0) continue;
        if (hasBank(x, y)) tiles.push({ x, y });
      }
    }
    if (tiles.length > 0) b.addWater({ tiles: tiles.slice(0, 8), count: Math.min(3, tiles.length), method: "net" });
  }
}

/** Every creature of §7.5, homed where that table puts it. */
function creatures(b: WorldBuilder): void {
  const herds: Array<[string, number, number, number, number]> = [
    // Village edge and farm: nothing over level 3, nothing that starts a fight.
    ["hen", 6, 3242, 3296, 3],
    ["field_rat", 6, 3220, 3250, 10],
    ["cow", 6, 3211, 3287, 6],
    ["ram", 4, 3241, 3287, 4],
    // Wendmouth.
    ["mallard", 4, 3220, 3168, 8],
    ["pond_newt", 4, 3240, 3172, 8],
    ["marsh_frog", 4, 3200, 3164, 8],
    // The Oakenshaw, edge then deep.
    ["thicket_spider", 5, 3194, 3252, 7],
    ["giant_rat", 5, 3190, 3290, 8],
    ["wild_boar", 4, 3166, 3300, 8],
    ["grey_wolf", 4, 3150, 3268, 8],
    // The Mudfoot Stockade.
    ["mudfoot_goblin", 7, 3155, 3249, 5],
    ["mudfoot_raider", 4, 3150, 3245, 4],
    ["mudfoot_warchief", 1, 3155, 3247, 1],
    // Copperfoot Quarry.
    ["cave_bat", 5, 3282, 3288, 7],
    ["dust_scorpion", 4, 3296, 3298, 8],
    ["quarry_brute", 1, 3300, 3304, 2],
    // The Emberway.
    ["highwayman", 2, 3290, 3231, 5],
    // Ashbarrow.
    ["ruin_skeleton", 4, 3171, 3169, 7],
    ["grave_shambler", 3, 3171, 3163, 5],
    ["barrow_warden", 1, 3171, 3169, 2],
  ];
  const livedIn = new Set<number>();
  for (const [monster, count, cx, cy, radius] of herds) {
    for (let placed = 0, tries = 0; placed < count && tries < 300; tries++) {
      const x = Math.round(cx + (b.rand() * 2 - 1) * radius), y = Math.round(cy + (b.rand() * 2 - 1) * radius);
      const key = y * 4096 + x;
      if (livedIn.has(key) || !b.free(0, x, y)) continue;
      // Nothing dangerous within sight of where players arrive (§7.5).
      if (Math.hypot(x - GREEN.x, y - GREEN.y) < 8) continue;
      livedIn.add(key);
      b.spawnMonster({ monster, x, y });
      placed++;
    }
  }
}

/**
 * What lies about. The shops now sell the tools a player who lost theirs needs, so the map no longer
 * has to guarantee a free one of each — but the starting corner still holds a bronze axe, pick and net
 * within sight of the green, because a new character with no coins has to be able to begin.
 */
function lying(b: WorldBuilder): void {
  const spawns: Array<[string, number, number, number, number]> = [
    ["bronze_axe", 1, 3228, 3236, 100],
    ["bronze_pickaxe", 1, 3236, 3228, 100],
    ["fishing_net", 1, 3248, 3199, 100],
    ["tinderbox", 1, 3230, 3228, 100],
    ["hammer", 1, 3241, 3225, 150],
    ["coins", 15, 3234, 3234, 200],
    ["bread", 1, 3218, 3226, 100],
    ["logs", 1, 3205, 3240, 100],
    ["bait", 10, 3249, 3200, 200],
    ["iron_axe", 1, 3172, 3262, 300],
    ["iron_pickaxe", 1, 3288, 3300, 300],
  ];
  for (const [item, count, x, y, respawn] of spawns) {
    const at = nearestFree(b, x, y);
    if (at) b.spawnItem({ item, count, x: at.x, y: at.y, respawn, plane: 0 });
  }
}

/** The tile asked for, or the nearest free one: a tree may have grown where an item was meant to lie. */
function nearestFree(b: WorldBuilder, x: number, y: number): { x: number; y: number } | null {
  for (let ring = 0; ring <= 5; ring++) {
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        if (b.free(0, x + dx, y + dy)) return { x: x + dx, y: y + dy };
      }
    }
  }
  return null;
}

/** Named boxes, for tests and for the area music of Phase 13. */
export const SITES: Record<string, Box> = {
  village: VILLAGE,
  farm: FARM,
  oakenshaw: OAKENSHAW,
  wendmouth: WENDMOUTH,
  ashbarrow: ASHBARROW,
  stockade: STOCKADE,
  meadow: MEADOW,
  bridge: BRIDGE,
  jetty: JETTY,
  quarry: boxOf(QUARRY.x - QUARRY.r, QUARRY.y - QUARRY.r, QUARRY.x + QUARRY.r, QUARRY.y + QUARRY.r),
  ...STONECOTE_SITES,
  ...THORNBURY_SITES,
  ...WICKSTEAD_SITES,
  ...BRINEHAVEN_SITES,
};


// --- Areas, and the music each one carries (PLAN Phase 7 / Phase 13) -----------------------------

/** One named part of the district: what it is called, and which background track belongs to it. */
export interface Area {
  key: string;
  name: string;
  /** An index into the client's music tracks. Areas share tracks; there are more areas than tunes. */
  track: number;
}

/**
 * Where each part of the district is, in the order they are tested — the first box a tile falls in
 * wins, so the small, particular places come before the open country they sit in. The village's own
 * tune plays across the whole of it, the wood and the marsh share a quieter one, and the quarry, the
 * barrow and the stockade get the third. Crossing a border fades one out and the next in.
 */
const AREAS: ReadonlyArray<{ area: Area; box: Box }> = [
  { area: { key: "village", name: "Oakridge", track: 0 }, box: VILLAGE },
  { area: { key: "bridge", name: "The bridge", track: 0 }, box: BRIDGE },
  { area: { key: "farm", name: "Hollowbeck Farm", track: 0 }, box: FARM },
  { area: { key: "stockade", name: "The Mudfoot Stockade", track: 2 }, box: STOCKADE },
  { area: { key: "ashbarrow", name: "Ashbarrow", track: 2 }, box: ASHBARROW },
  {
    area: { key: "quarry", name: "Copperfoot Quarry", track: 2 },
    box: boxOf(QUARRY.x - QUARRY.r, QUARRY.y - QUARRY.r, QUARRY.x + QUARRY.r, QUARRY.y + QUARRY.r),
  },
  { area: { key: "jetty", name: "The jetty", track: 1 }, box: JETTY },
  { area: { key: "wendmouth", name: "Wendmouth", track: 1 }, box: WENDMOUTH },
  { area: { key: "oakenshaw", name: "The Oakenshaw", track: 1 }, box: OAKENSHAW },
  { area: { key: "meadow", name: "The East Meadow", track: 0 }, box: MEADOW },
  ...STONECOTE_AREAS,
  ...THORNBURY_AREAS,
  ...WICKSTEAD_AREAS,
  ...BRINEHAVEN_AREAS,
];

/** The country between the named places: the roads, the ridge, the open ground. */
export const OPEN_COUNTRY: Area = { key: "open", name: "The Oakridge road", track: 0 };

/**
 * Which part of the world a tile belongs to. Indoors counts as whatever the building stands in; below
 * ground under the hamlet it is the Hollow, and under the city its sewers (PLAN §8.5: a dungeon sits
 * under the region it is entered from).
 */
export function areaAt(x: number, y: number, plane = 0): Area {
  if (plane < 0 && inBox(HAMLET, x, y)) return HOLLOW_AREA;
  if (plane < 0 && inBox(THORNBURY, x, y)) return SEWERS_AREA;
  for (const { area, box } of AREAS) if (inBox(box, x, y)) return area;
  return OPEN_COUNTRY;
}

/** Every area the world has, for tests and for the plan. */
export const ALL_AREAS: Area[] = [...AREAS.map((a) => a.area), HOLLOW_AREA, SEWERS_AREA, OPEN_COUNTRY];

// --- What the world map shows (PLAN §7.4's own table, as a map legend) ---------------------------

/** A name written across the map, at the tile it is centred on. `small` is a site inside a bigger one. */
export interface MapLabel {
  name: string;
  x: number;
  y: number;
  small?: boolean;
}

/** Every place the world map names, in the words §7.4 and §7.8 use for them. */
export const MAP_LABELS: MapLabel[] = [
  { name: "Oakridge", x: 3223, y: 3221 },
  { name: "Hollowbeck Farm", x: 3219, y: 3295 },
  { name: "The Oakenshaw", x: 3166, y: 3270 },
  { name: "Copperfoot Quarry", x: 3294, y: 3296 },
  { name: "Wendmouth", x: 3218, y: 3168 },
  { name: "Ashbarrow", x: 3171, y: 3169 },
  { name: "Mudfoot Stockade", x: 3155, y: 3249 },
  { name: "East Meadow", x: 3296, y: 3250 },
  { name: "The Wend", x: 3259, y: 3300, small: true },
  { name: "The bridge", x: 3256, y: 3238, small: true },
  { name: "The jetty", x: 3252, y: 3194, small: true },
  { name: "The Split Oak", x: 3218, y: 3218, small: true },
  { name: "Emberway Gate", x: 3312, y: 3227, small: true },
  { name: "The Adit", x: 3320, y: 3296, small: true },
  ...STONECOTE_LABELS,
  ...THORNBURY_LABELS,
  ...WICKSTEAD_LABELS,
  ...BRINEHAVEN_LABELS,
];

/** Where a road leaves the district, and what lies that way. The map writes these on its edges. */
export interface MapExit {
  name: string;
  /** The tile the road crosses the edge at. */
  x: number;
  y: number;
  /** Which edge: north, east, south or west. */
  side: "n" | "e" | "s" | "w";
  /** How far to whatever is out there, in tiles (PLAN §7.6's table). */
  away: number;
}

/**
 * The roads out of the built world (§7.4, §7.6) and where each goes. Everything they lead to is Phase
 * 12's to build; until then the map says plainly that the road continues and how far, rather than
 * letting the edge of the built world look like the edge of the world. The North Road runs up through
 * Stonecote to Thornbury now, the West Road to Wickstead and the Coast Road on to Brinehaven: the city's
 * three roads out and the ferry berth at the port are the edge.
 */
export const MAP_EXITS: MapExit[] = [
  { name: "The Emberway — Kilnhold", x: 3327, y: 3231, side: "e", away: 384 },
  { name: "The Wend — the open sea", x: 3232, y: 3136, side: "s", away: 0 },
  ...THORNBURY_EXITS,
  ...WICKSTEAD_EXITS,
  ...BRINEHAVEN_EXITS,
];

/** What kind of thing an icon on the map marks. */
export type MapIcon =
  | "bank" | "shop" | "tools" | "furnace" | "anvil" | "range" | "mill" | "inn"
  | "church" | "gate" | "stair" | "fish" | "mine" | "tree" | "quest" | "ferry";

/**
 * The icons the map carries, worked out from the map itself wherever it can be — a bank booth marks a
 * bank, a counter marks whichever shop it sells for — with the few that no object can say for itself
 * written down here.
 */
export const MAP_MARKS: Array<{ icon: MapIcon; x: number; y: number; name: string }> = [
  { icon: "inn", x: 3218, y: 3224, name: "The Split Oak" },
  { icon: "church", x: 3208, y: 3209, name: "Church" },
  { icon: "gate", x: 3320, y: 3231, name: "The Emberway Gate (shut)" },
  { icon: "quest", x: 3171, y: 3169, name: "Ashbarrow" },
  { icon: "tree", x: 3180, y: 3262, name: "The Oakenshaw" },
  { icon: "mine", x: 3294, y: 3296, name: "Copperfoot Quarry" },
  { icon: "fish", x: 3252, y: 3198, name: "The jetty" },
  { icon: "fish", x: 3220, y: 3160, name: "Wendmouth" },
  ...STONECOTE_MARKS,
  ...THORNBURY_MARKS,
  ...WICKSTEAD_MARKS,
  ...BRINEHAVEN_MARKS,
];
