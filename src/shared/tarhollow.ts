// Sablewood Isle (PLAN §7.6, the second half of Wave 2): Tarhollow, the only settlement on the isle,
// reached by the Brinehaven ferry — no bank on purpose, so what you carry is what you have; the Black
// Pine, Tarr's Store, the chapel, cottages, the well, and the jetty on the north shore with the
// blackfish (Fishing 58, a harpoon) off it; the ironbark wood east of the village (§8.2, WC 63);
// Mount Sear, the volcano at the isle's east end, with sablewood on its slopes (WC 76) and the
// Searmouth in its south flank: three planes of the mountain's throat, galleries and heart, the red ore
// (Mining 58) down there and the things that live on the heat (band 45–75, §8.5), and the chest at the
// bottom — the reason to make the voyage.
//
// Its site is regions 34–38 × 39–42, sea to every edge: the isle is a noise-warped blob in the middle
// of it, so nothing here shares a corner with any other site and there is no seam. Built on the same
// builder after Kilnhold and before the Adit, so every id and roll of the sites before it stands
// (tests/tarhollow.test.ts builds the world with and without it and compares them).
import { SEA_CORNER } from "./heartland.ts";
import {
  OVERLAY_PATH, OVERLAY_WATER, REGION, regionOf, ROOF_SLATE, ROOF_THATCH, underlayAt, UNDERLAY_CINDER, UNDERLAY_DIRT, UNDERLAY_FOREST,
  UNDERLAY_GRASS, UNDERLAY_ROCK, UNDERLAY_SAND,
} from "./map.ts";
import type { Area, MapExit, MapIcon, MapLabel } from "./oakridge.ts";
import { valueNoise2D } from "./rng.ts";
import { cut } from "./thornbury.ts";
import { TRAVEL } from "./travel.ts";
import {
  boxOf, building, corners, inBox, road, scatter, shop, smoothstep, STOREY, WorldBuilder, type Box, type DoorSpec, type Point,
} from "./worldgen.ts";

/** The site: regions 34–38 × 39–42, tiles x 2176–2495 and y 2496–2751, sea to every edge. */
export const SABLEWOOD: Box = boxOf(2176, 2496, 2495, 2751);
/** The isle's middle and half-widths: the shore is this ellipse, warped by noise. */
const ISLE = { x: 2336, y: 2624, rx: 128, ry: 92 };
/** The village on the isle's west side, and its square. */
export const VILLAGE: Box = boxOf(2250, 2634, 2298, 2678);
export const SQUARE = { x: 2272, y: 2656 };
export const WELL = { x: 2272, y: 2660 };
/** The Black Pine, on the square's south side. */
export const INN: Box = boxOf(2262, 2638, 2274, 2648);
/** Tarr's Store, on its north side. */
export const STORE: Box = boxOf(2262, 2664, 2271, 2672);
/** The chapel east of the square, with its altar: the one thing to fall back on. */
export const CHAPEL: Box = boxOf(2282, 2650, 2290, 2660);
const COTTAGES: ReadonlyArray<readonly [Box, DoorSpec]> = [
  [boxOf(2252, 2650, 2257, 2655), { side: 1, along: 2 }],
  [boxOf(2252, 2659, 2257, 2664), { side: 1, along: 2 }],
  [boxOf(2278, 2664, 2283, 2669), { side: 3, along: 2 }],
  [boxOf(2286, 2664, 2291, 2669), { side: 2, along: 2 }],
  [boxOf(2280, 2638, 2285, 2643), { side: 0, along: 2 }],
];
/** The woodcutter's hut at the ironbark wood's edge. */
export const HUT: Box = boxOf(2310, 2688, 2315, 2693);
/** The landing: the root of the jetty on the north shore, held as land; the jetty's planks out over the water; the harbour cut kept as sea. */
export const LANDING_ROOT: Box = boxOf(2286, 2700, 2294, 2711);
export const JETTY: Box = boxOf(2289, 2712, 2290, 2725);
const HARBOUR_CUT: Box = boxOf(2282, 2712, 2298, 2740);
/** The ironbark wood (§8.2, WC 63), east of the village. */
export const IRONBARK_WOOD = { x: 2332, y: 2694, r: 16 };
/** Mount Sear: the cone's middle and radius, its crater, and the ring of sablewood on its lower slopes (§8.2, WC 76). */
export const SEAR = { x: 2400, y: 2592, r: 40 };
const CRATER_R = 7;
/** The Searmouth: the mouth in the mountain's south flank, and the region under it the workings are cut into. */
export const SEARMOUTH = { x: 2404, y: 2570 };
export const SEAR_REGION: Box = boxOf(regionOf(SEAR.x) * REGION, regionOf(SEAR.y) * REGION, regionOf(SEAR.x) * REGION + REGION - 1, regionOf(SEAR.y) * REGION + REGION - 1);
export const THROAT_PLANE = -1;
export const GALLERIES_PLANE = -2;
export const HEART_PLANE = -3;
/** The throat: the drift up from the mouth, the first hall, a passage west, and the stair room. */
export const THROAT_ROOMS: readonly Box[] = [boxOf(2402, 2571, 2406, 2585), boxOf(2384, 2586, 2420, 2604), boxOf(2376, 2592, 2383, 2594), boxOf(2370, 2588, 2375, 2598)];
export const THROAT_STAIR = { x: 2372, y: 2593 };
/** The galleries: the landing, the long gallery east, two side chambers with the ore, and the stair down at the far end. */
export const GALLERY_ROOMS: readonly Box[] = [boxOf(2370, 2588, 2375, 2598), boxOf(2376, 2592, 2418, 2596), boxOf(2400, 2597, 2412, 2608), boxOf(2386, 2578, 2398, 2591)];
export const GALLERY_STAIR = { x: 2416, y: 2594 };
/** The heart: one chamber, the vents in its floor, the ore on its north face, the drake, and the chest. */
export const HEART_ROOMS: readonly Box[] = [boxOf(2392, 2578, 2426, 2612)];
export const HEART_CHEST = { x: 2424, y: 2610 };
/** The emberite (§8.3, Mining 58): three in the galleries' side chambers, four along the heart's north face. */
export const EMBERITE: ReadonlyArray<{ plane: number; x: number; y: number }> = [
  { plane: GALLERIES_PLANE, x: 2402, y: 2608 }, { plane: GALLERIES_PLANE, x: 2408, y: 2608 }, { plane: GALLERIES_PLANE, x: 2388, y: 2578 },
  { plane: HEART_PLANE, x: 2396, y: 2612 }, { plane: HEART_PLANE, x: 2404, y: 2612 }, { plane: HEART_PLANE, x: 2412, y: 2612 }, { plane: HEART_PLANE, x: 2420, y: 2612 },
];
const VENTS: ReadonlyArray<readonly [number, number]> = [[2398, 2584], [2410, 2590], [2418, 2582], [2400, 2602], [2416, 2604]];

/** The path from the landing up to the square, the square's lanes, and the path on east to the wood and the mountain's foot. */
export const LANDING_PATH: Point[] = [[2290, 2711], [2290, 2690], [2284, 2680], [2272, 2678], [2272, 2656]];
export const EAST_PATH: Point[] = [[2272, 2656], [2280, 2648], [2294, 2646], [2300, 2660], [2306, 2676], [2309, 2691]];
export const MOUNTAIN_PATH: Point[] = [[2300, 2660], [2330, 2640], [2364, 2600], [2380, 2570], [2404, 2569]];
const STUBS: Point[][] = [
  [[2268, 2655], [2268, 2648]], [[2270, 2657], [2266, 2657], [2266, 2664]], [[2275, 2655], [2282, 2655]],
  [[2258, 2653], [2257, 2653]], [[2258, 2662], [2257, 2662]], [[2277, 2667], [2278, 2667]], [[2288, 2662], [2288, 2664]], [[2282, 2647], [2282, 2643]],
];

export function buildTarhollow(b: WorldBuilder, seed: number): void {
  b.clip = SABLEWOOD;
  const sea = terrain(b, seed);
  waters(b, sea);
  jetty(b, sea);
  paths(b);
  village(b);
  woods(b, seed);
  mountain(b);
  searmouth(b);
  wilderness(b, seed);
  fishing(b);
  creatures(b);
  lying(b);
}

// --- Ground ------------------------------------------------------------------------------------------

const shoreWobble = valueNoise2D(59);

/** How far inside the isle's shore a tile is, in the ellipse's own units: under 1 is land, with the noise's warp. */
function inside(x: number, y: number): number {
  const dx = (x + 0.5 - ISLE.x) / ISLE.rx, dy = (y + 0.5 - ISLE.y) / ISLE.ry;
  return Math.sqrt(dx * dx + dy * dy) + 0.16 * (shoreWobble(x / 23, y / 23) - 0.5);
}

/** Whether a tile is the isle's land: inside the shore, or the landing's root; never the harbour cut. */
export const isLand = (x: number, y: number): boolean => !inBox(HARBOUR_CUT, x, y) && (inside(x, y) < 1 || inBox(LANDING_ROOT, x, y));

/** How high the mountain stands over a tile, from its cone: nothing outside its radius, the crater sunk in its top. */
function cone(cx: number, cy: number): number {
  const d = Math.hypot(cx - SEAR.x, cy - SEAR.y);
  const rise = 9 * smoothstep(SEAR.r, 6, d);
  const crater = 3.5 * smoothstep(CRATER_R + 2, 2, d);
  return rise - crater;
}

/**
 * The ground: the sea's level everywhere, the isle standing a little proud of it with a low rise under
 * the village, lumps of its own, the shore easing down to the water over ten tiles, and the mountain.
 * Returns the sea's level, read off the district's sea, so the isle's water is every other water's.
 */
function terrain(b: WorldBuilder, seed: number): number {
  const sea = b.heightAtCorner(0, SEA_CORNER.x, SEA_CORNER.y);
  const lumps = valueNoise2D(seed + 1001), rough = valueNoise2D(seed + 1002);
  for (let cy = SABLEWOOD.y0; cy <= SABLEWOOD.y1 + 1; cy++) {
    for (let cx = SABLEWOOD.x0; cx <= SABLEWOOD.x1 + 1; cx++) {
      const in1 = Math.min(inside(cx, cy), inside(cx - 1, cy - 1), inside(cx, cy - 1), inside(cx - 1, cy));
      // How far in from the shore a corner is, in tiles, roughly: the ellipse's unit is its half-width.
      const depth = (1 - in1) * 100;
      let h = sea + 0.6 + 2.2 * smoothstep(0, 24, depth);
      h += 1.6 * (0.6 * lumps(cx / 19, cy / 19) + 0.4 * rough(cx / 7, cy / 7)) * smoothstep(0, 12, depth);
      h += 1.4 * smoothstep(30, 6, Math.hypot(cx - SQUARE.x, cy - SQUARE.y));
      h += cone(cx, cy);
      if (depth < 0) h = sea;
      b.setHeight(0, cx, cy, h);
    }
  }
  for (let y = SABLEWOOD.y0; y <= SABLEWOOD.y1; y++) for (let x = SABLEWOOD.x0; x <= SABLEWOOD.x1; x++) b.setUnderlay(0, x, y, UNDERLAY_GRASS);
  return sea;
}

/** The sea: water everywhere that is not the isle's land, at the sea's level, with sand along the shore. */
function waters(b: WorldBuilder, sea: number): void {
  for (let y = SABLEWOOD.y0; y <= SABLEWOOD.y1; y++) {
    for (let x = SABLEWOOD.x0; x <= SABLEWOOD.x1; x++) {
      if (isLand(x, y)) {
        if (inside(x, y) > 0.93 && !inBox(LANDING_ROOT, x, y)) b.setUnderlay(0, x, y, UNDERLAY_SAND);
        continue;
      }
      b.setOverlay(0, x, y, OVERLAY_WATER);
      b.plane(0).collision.block(x, y);
      for (const [cx, cy] of corners(x, y)) b.setHeight(0, cx, cy, sea);
    }
  }
  // The landing's root and the shore beside the jetty are sand, held a step above the water.
  for (let y = LANDING_ROOT.y0; y <= LANDING_ROOT.y1; y++) {
    for (let x = LANDING_ROOT.x0; x <= LANDING_ROOT.x1; x++) {
      b.setUnderlay(0, x, y, UNDERLAY_SAND);
      for (const [cx, cy] of corners(x, y)) if (cy >= LANDING_ROOT.y0 + 4) b.setHeight(0, cx, cy, sea + 0.8);
    }
  }
}

/** The jetty: planks out over the water from the landing, railed where they meet open water, the ferryman at its root. */
function jetty(b: WorldBuilder, sea: number): void {
  const deck: Array<{ x: number; y: number }> = [];
  for (let y = JETTY.y0; y <= JETTY.y1; y++) {
    for (let x = JETTY.x0; x <= JETTY.x1; x++) {
      if (b.overlayAt(0, x, y) !== OVERLAY_WATER) continue;
      b.setOverlay(0, x, y, OVERLAY_PATH);
      b.setUnderlay(0, x, y, UNDERLAY_DIRT);
      b.plane(0).collision.unblock(x, y);
      deck.push({ x, y });
    }
  }
  for (const { x, y } of deck) for (const [cx, cy] of corners(x, y)) b.setHeight(0, cx, cy, sea + 0.8);
  for (const { x, y } of deck) {
    for (const [dx, dy, side] of [[0, 1, 0], [1, 0, 1], [0, -1, 2], [-1, 0, 3]] as const) {
      if (b.overlayAt(0, x + dx, y + dy) === OVERLAY_WATER) b.place(0, "fence", x, y, { side });
    }
  }
  b.place(0, "boat", 2293, 2716, { side: 1 });
  b.spawnMonster({ monster: "ferryman_isle", x: 2292, y: 2709 });
  b.place(0, "signpost", 2287, 2708);
}

/** The paths: from the landing up to the square, the lanes to the doors, east to the wood, and up to the mountain's foot. */
function paths(b: WorldBuilder): void {
  road(b, 0, LANDING_PATH, 1.2);
  road(b, 0, EAST_PATH, 1.1);
  road(b, 0, MOUNTAIN_PATH, 1.0);
  for (const stub of STUBS) road(b, 0, stub, 0.6);
  for (let y = SQUARE.y - 4; y <= SQUARE.y + 4; y++) {
    for (let x = SQUARE.x - 4; x <= SQUARE.x + 4; x++) {
      if (Math.hypot(x + 0.5 - SQUARE.x, y + 0.5 - SQUARE.y) <= 3.8) b.setOverlay(0, x, y, OVERLAY_PATH);
    }
  }
  for (let y = SABLEWOOD.y0; y <= SABLEWOOD.y1; y++) {
    for (let x = SABLEWOOD.x0; x <= SABLEWOOD.x1; x++) {
      if (b.overlayAt(0, x, y) === OVERLAY_PATH && underlayAt(b.plane(0), x, y) !== UNDERLAY_SAND) b.setUnderlay(0, x, y, UNDERLAY_DIRT);
    }
  }
}

// --- The village -------------------------------------------------------------------------------------

/**
 * Tarhollow (PLAN §7.6's card and the plan map's): the Black Pine on the square's south side, Tarr's
 * Store on its north, the chapel with its altar east of it, five cottages, the well, and the people —
 * and no bank, on purpose: what you carry is what you have.
 */
function village(b: WorldBuilder): void {
  building(b, {
    box: INN,
    doors: [{ side: 0, along: 6 }],
    windows: [{ side: 0, along: 2 }, { side: 0, along: 10 }, { side: 3, along: 4 }, { side: 1, along: 4 }, { side: 2, along: 3 }, { side: 2, along: 9 }],
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
  b.spawnMonster({ monster: "innkeeper_tarhollow", x: INN.x0 + 6, y: INN.y0 + 3 });

  shop(b, STORE, { side: 2, along: 4 }, "tarhollow_stores", "storekeeper_tarhollow", [{ side: 2, along: 1 }, { side: 2, along: 7 }, { side: 3, along: 4 }]);

  building(b, { box: CHAPEL, doors: [{ side: 3, along: 5 }], windows: [{ side: 0, along: 4 }, { side: 2, along: 4 }, { side: 1, along: 5 }], floor: UNDERLAY_DIRT, roof: ROOF_SLATE });
  b.place(0, "altar", CHAPEL.x1 - 1, CHAPEL.y0 + 5);

  for (const [box, door] of COTTAGES) building(b, { box, doors: [door], floor: UNDERLAY_DIRT, roof: ROOF_THATCH });
  b.place(0, "well", WELL.x, WELL.y);

  building(b, { box: HUT, doors: [{ side: 3, along: 2 }], floor: UNDERLAY_DIRT, roof: ROOF_THATCH });
  b.spawnMonster({ monster: "woodcutter_isle", x: HUT.x0 - 2, y: HUT.y0 + 2 });
  for (const [monster, x, y] of [["islander", 2276, 2662], ["islander_woman", 2268, 2652], ["islander", 2290, 2672]] as const) b.spawnMonster({ monster, x, y });
}

// --- The woods, the mountain, and the throat ----------------------------------------------------------

/** The ironbark wood east of the village (§8.2, WC 63), on forest floor among plain trees. */
function woods(b: WorldBuilder, seed: number): void {
  const grain = valueNoise2D(seed + 1003);
  const w = IRONBARK_WOOD;
  for (let y = w.y - w.r; y <= w.y + w.r; y++) {
    for (let x = w.x - w.r; x <= w.x + w.r; x++) {
      const d = Math.hypot(x + 0.5 - w.x, y + 0.5 - w.y);
      if (d > w.r || !isLand(x, y) || b.overlayAt(0, x, y) !== 0 || !b.free(0, x, y) || inBox(HUT, x, y)) continue;
      b.setUnderlay(0, x, y, UNDERLAY_FOREST);
      if (b.rand() < 0.16 * (0.5 + 0.5 * grain(x / 7, y / 7))) b.place(0, "tree", x, y);
    }
  }
  const clear = (x: number, y: number) => b.overlayAt(0, x, y) === 0 && !inBox(HUT, x, y) && isLand(x, y);
  scatter(b, 0, "ironbark", w, 9, clear);
}

/** Mount Sear: red earth on its flanks, black rock above, the crater's floor, and the sablewood (§8.2, WC 76) round its lower slopes. */
function mountain(b: WorldBuilder): void {
  for (let y = SEAR.y - SEAR.r - 2; y <= SEAR.y + SEAR.r + 2; y++) {
    for (let x = SEAR.x - SEAR.r - 2; x <= SEAR.x + SEAR.r + 2; x++) {
      const d = Math.hypot(x + 0.5 - SEAR.x, y + 0.5 - SEAR.y);
      if (d > SEAR.r || !isLand(x, y) || b.overlayAt(0, x, y) === OVERLAY_WATER) continue;
      if (b.overlayAt(0, x, y) === OVERLAY_PATH) continue;
      b.setUnderlay(0, x, y, d < 22 ? UNDERLAY_ROCK : UNDERLAY_CINDER);
    }
  }
  const onRing = (x: number, y: number) => {
    const d = Math.hypot(x + 0.5 - SEAR.x, y + 0.5 - SEAR.y);
    return d >= 24 && d <= 38 && b.overlayAt(0, x, y) === 0 && Math.hypot(x - SEARMOUTH.x, y - SEARMOUTH.y) > 4;
  };
  scatter(b, 0, "sablewood", SEAR, 8, onRing);
  scatter(b, 0, "rock", { x: SEAR.x, y: SEAR.y, r: 30 }, 12, (x, y) => b.overlayAt(0, x, y) === 0 && Math.hypot(x - SEARMOUTH.x, y - SEARMOUTH.y) > 3);
  // The mouth in the south flank: an open adit, the way down.
  b.place(0, "adit", SEARMOUTH.x, SEARMOUTH.y, { side: 2, to: THROAT_PLANE });
  b.place(0, "signpost", SEARMOUTH.x - 2, SEARMOUTH.y - 1);
}

/**
 * The Searmouth (§8.5): three planes cut into the rock under the mountain — the throat from the mouth
 * to the first stair, the galleries with the ore, and the heart with the vents, the drake and the chest.
 */
function searmouth(b: WorldBuilder): void {
  const surface = b.heightAtCorner(0, SEARMOUTH.x, SEARMOUTH.y);
  cut(b, THROAT_PLANE, SEAR_REGION, THROAT_ROOMS, surface - 2 * STOREY, () => true);
  cut(b, GALLERIES_PLANE, SEAR_REGION, GALLERY_ROOMS, surface - 4 * STOREY, () => true);
  cut(b, HEART_PLANE, SEAR_REGION, HEART_ROOMS, surface - 6 * STOREY, () => true);
  // The way back up to the mouth, and the stairs between the planes, each on the tile the one above comes down to.
  b.place(THROAT_PLANE, "stairs", SEARMOUTH.x, SEARMOUTH.y + 1, { to: 0 });
  b.place(THROAT_PLANE, "stairs", THROAT_STAIR.x, THROAT_STAIR.y, { to: GALLERIES_PLANE });
  b.place(GALLERIES_PLANE, "stairs", THROAT_STAIR.x, THROAT_STAIR.y, { to: THROAT_PLANE });
  b.place(GALLERIES_PLANE, "stairs", GALLERY_STAIR.x, GALLERY_STAIR.y, { to: HEART_PLANE });
  b.place(HEART_PLANE, "stairs", GALLERY_STAIR.x, GALLERY_STAIR.y, { to: GALLERIES_PLANE });
  for (const e of EMBERITE) b.place(e.plane, "emberite_rock", e.x, e.y);
  for (const [x, y] of VENTS) b.place(HEART_PLANE, "vent", x, y);
  for (const [x, y] of [[2396, 2582], [2422, 2598]] as const) b.setUnderlay(HEART_PLANE, x, y, UNDERLAY_CINDER);
  b.place(HEART_PLANE, "chest", HEART_CHEST.x, HEART_CHEST.y, { tag: "searmouth" });
  for (const [plane, x, y] of [[THROAT_PLANE, 2390, 2590], [THROAT_PLANE, 2414, 2600], [GALLERIES_PLANE, 2392, 2584], [HEART_PLANE, 2404, 2594]] as const) b.place(plane, "rock", x, y);
  // Who lives on the heat: bats and crawlers in the throat, crawlers and wights in the galleries, wights, bats and the drake in the heart.
  const below: ReadonlyArray<readonly [string, number, number, number]> = [
    ["sear_bat", THROAT_PLANE, 2404, 2578], ["sear_bat", THROAT_PLANE, 2404, 2582], ["sear_bat", THROAT_PLANE, 2394, 2596], ["sear_bat", THROAT_PLANE, 2410, 2592],
    ["sear_bat", THROAT_PLANE, 2416, 2588], ["sear_bat", THROAT_PLANE, 2380, 2593],
    ["basalt_crawler", THROAT_PLANE, 2400, 2600], ["basalt_crawler", THROAT_PLANE, 2388, 2588], ["basalt_crawler", THROAT_PLANE, 2372, 2596],
    ["basalt_crawler", GALLERIES_PLANE, 2382, 2594], ["basalt_crawler", GALLERIES_PLANE, 2396, 2593], ["basalt_crawler", GALLERIES_PLANE, 2404, 2602], ["basalt_crawler", GALLERIES_PLANE, 2390, 2582],
    ["ash_wight", GALLERIES_PLANE, 2408, 2600], ["ash_wight", GALLERIES_PLANE, 2392, 2586], ["ash_wight", GALLERIES_PLANE, 2412, 2594],
    ["ash_wight", HEART_PLANE, 2400, 2588], ["ash_wight", HEART_PLANE, 2414, 2596], ["ash_wight", HEART_PLANE, 2406, 2608],
    ["sear_bat", HEART_PLANE, 2396, 2600], ["sear_bat", HEART_PLANE, 2420, 2586], ["sear_bat", HEART_PLANE, 2410, 2582],
    ["sear_drake", HEART_PLANE, 2418, 2606],
  ];
  for (const [monster, plane, x, y] of below) b.spawnMonster({ monster, x, y, plane });
}

// --- The country -----------------------------------------------------------------------------------------

/** The isle's own scatter: plain trees thick on the lowland, bushes and rock, nothing on the mountain's rock or the village. */
function wilderness(b: WorldBuilder, seed: number): void {
  const grain = valueNoise2D(seed + 1004);
  for (let y = SABLEWOOD.y0; y <= SABLEWOOD.y1; y++) {
    for (let x = SABLEWOOD.x0; x <= SABLEWOOD.x1; x++) {
      if (!isLand(x, y) || !b.free(0, x, y) || b.overlayAt(0, x, y) !== 0) continue;
      if (inBox(VILLAGE, x, y) || inBox(LANDING_ROOT, x, y) || Math.hypot(x - SEARMOUTH.x, y - SEARMOUTH.y) < 5) continue;
      const under = underlayAt(b.plane(0), x, y);
      const roll = b.rand();
      if (under === UNDERLAY_GRASS || under === UNDERLAY_FOREST) {
        const trees = 0.07 * grain(x / 11, y / 11);
        if (roll < trees) {
          b.setUnderlay(0, x, y, UNDERLAY_FOREST);
          b.place(0, b.rand() < 0.25 ? "oak" : "tree", x, y);
        } else if (roll < trees + 0.008) b.place(0, "bush", x, y);
        else if (roll < trees + 0.012) b.place(0, "rock", x, y);
      } else if (under === UNDERLAY_CINDER) {
        if (roll < 0.012) b.place(0, "dead_tree", x, y);
        else if (roll < 0.022) b.place(0, "rock", x, y);
      } else if (under === UNDERLAY_SAND && roll < 0.05) b.place(0, "reed", x, y);
    }
  }
}

/** The blackfish (§8.4, Fishing 58, a harpoon): the deep water off the jetty's end and its west side. */
function fishing(b: WorldBuilder): void {
  const tiles: Array<{ x: number; y: number }> = [];
  for (let y = JETTY.y0 + 4; y <= JETTY.y1; y++) {
    for (const x of [JETTY.x0 - 1, JETTY.x1 + 1]) {
      if (b.overlayAt(0, x, y) !== OVERLAY_WATER) continue;
      if ((x * 3 + y * 5) % 4 !== 0) continue;
      tiles.push({ x, y });
    }
  }
  if (tiles.length > 0) b.addWater({ tiles: tiles.slice(0, 8), count: Math.min(3, tiles.length), method: "harpoon" });
}

/** Who lives on the isle: wolves and boars in the woods, spiders at the wood's edge, scorpions on the cinder, the village's hens and rats. */
function creatures(b: WorldBuilder): void {
  const herds: Array<[string, number, number, number, number]> = [
    ["hen", 3, 2288, 2676, 3],
    ["field_rat", 3, 2256, 2668, 3],
    ["thicket_spider", 5, 2340, 2700, 8],
    ["wild_boar", 4, 2300, 2610, 10],
    ["grey_wolf", 5, 2352, 2660, 10],
    ["grey_wolf", 3, 2250, 2600, 8],
    ["dust_scorpion", 4, 2380, 2560, 8],
    ["dust_scorpion", 3, 2430, 2620, 6],
  ];
  const taken = new Set<number>();
  for (const [monster, count, cx, cy, r] of herds) {
    for (let placed = 0, tries = 0; placed < count && tries < 200; tries++) {
      const x = Math.round(cx + (b.rand() * 2 - 1) * r), y = Math.round(cy + (b.rand() * 2 - 1) * r);
      const key = y * 4096 + x;
      if (taken.has(key) || !isLand(x, y) || !b.free(0, x, y) || inBox(VILLAGE, x, y) && !["hen", "field_rat"].includes(monster)) continue;
      taken.add(key);
      b.spawnMonster({ monster, x, y, plane: 0 });
      placed++;
    }
  }
}

/** What lies about: a harpoon and coins at the landing, logs by the hut, bread in the Black Pine. */
function lying(b: WorldBuilder): void {
  const spawns: Array<[string, number, number, number, number]> = [
    ["harpoon", 1, 2288, 2704, 300],
    ["coins", 10, 2291, 2703, 200],
    ["logs", 3, HUT.x0 - 1, HUT.y1 + 1, 200],
    ["bread", 1, INN.x0 + 3, INN.y0 + 2, 100],
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

/** The village has the village's tune; the mountain and its throat the harder one; the rest of the isle the wood and water's. */
export const SEARMOUTH_AREA: Area = { key: "searmouth", name: "The Searmouth", track: 2 };
export const TARHOLLOW_AREAS: ReadonlyArray<{ area: Area; box: Box }> = [
  { area: { key: "tarhollow", name: "Tarhollow", track: 0 }, box: VILLAGE },
  { area: { key: "mountsear", name: "Mount Sear", track: 2 }, box: boxOf(SEAR.x - SEAR.r, SEAR.y - SEAR.r, SEAR.x + SEAR.r, SEAR.y + SEAR.r) },
  { area: { key: "sablewood", name: "Sablewood Isle", track: 1 }, box: SABLEWOOD },
];

export const TARHOLLOW_LABELS: MapLabel[] = [
  { name: "Tarhollow", x: 2272, y: 2674 },
  { name: "Sablewood Isle", x: 2330, y: 2552 },
  { name: "Mount Sear", x: 2400, y: 2638 },
  { name: "The Searmouth", x: 2404, y: 2562, small: true },
  { name: "The Black Pine", x: 2268, y: 2636, small: true },
  { name: "The ferry landing", x: 2290, y: 2730, small: true },
  { name: "The ironbark wood", x: 2332, y: 2714, small: true },
];

export const TARHOLLOW_MARKS: Array<{ icon: MapIcon; x: number; y: number; name: string }> = [
  { icon: "inn", x: INN.x0 + 6, y: INN.y0 + 5, name: "The Black Pine" },
  { icon: "church", x: CHAPEL.x0 + 4, y: CHAPEL.y0 + 5, name: "Chapel" },
  { icon: "fish", x: JETTY.x0, y: JETTY.y1, name: "The blackfish" },
  { icon: "tree", x: IRONBARK_WOOD.x, y: IRONBARK_WOOD.y, name: "The ironbark wood" },
  { icon: "tree", x: SEAR.x - 30, y: SEAR.y + 12, name: "Sablewood" },
  { icon: "mine", x: SEARMOUTH.x, y: SEARMOUTH.y, name: "The Searmouth" },
  { icon: "ferry", x: TRAVEL["tarhollow"]!.x, y: TRAVEL["tarhollow"]!.y, name: "The ferry landing" },
];

/** The sea route off the isle, and where it goes (§7.6): the ferry back to Brinehaven, written where the route leaves the built water. */
export const TARHOLLOW_EXITS: MapExit[] = [
  { name: "The Sablewood ferry — Brinehaven", x: SABLEWOOD.x1, y: JETTY.y1, side: "e", away: 1120 },
];

/** Named boxes, for the tests and the map. */
export const TARHOLLOW_SITES: Record<string, Box> = {
  sablewood: SABLEWOOD, tarhollow: VILLAGE, mountsear: boxOf(SEAR.x - SEAR.r, SEAR.y - SEAR.r, SEAR.x + SEAR.r, SEAR.y + SEAR.r),
};
