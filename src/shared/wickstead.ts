// Wickstead (PLAN §7.6, the third site of Wave 1): the fishing village at the end of the West Road, on
// the east shore of the Sunder Sound — the world's second bank, a net shop, an inn, the manor on the
// rise above it, the lock-up, a jetty, the alders along the shore (Woodcutting 25) and the grayling in
// Wick Beck (Fishing 33): the first rung past each of the district's, which is what makes the walk
// worth it (§8.1), and §7.7's fourth rule (Wickstead fishes). No dungeon: none of §8.5's ten is here.
//
// Its site is the corridor from the district's west edge to the coast — regions 45–48 × 50–51 — the
// two regions of sea beyond the shore (44 × 50–51), so the Sound is water as far as the fog and not a
// cliff into nothing, and the foot of the Greycaps north of the village (45–46 × 52), rising ground
// the beck comes down from, so the world does not end a few tiles past the fishing spots. Built on the
// same builder as the district, Stonecote and Thornbury, after all
// three, so every id and every roll of theirs stands; the district's column of corners at x 3136 is
// never written, and the ground beside it is stitched to those values over eight tiles
// (tests/wickstead.test.ts builds the world with and without this and compares every one of them).
import { heartlandHeight, SEA_CORNER, soundShore } from "./heartland.ts";
import {
  OVERLAY_PATH, OVERLAY_WATER, ROOF_KEEP, ROOF_SLATE, ROOF_THATCH, underlayAt, UNDERLAY_DIRT, UNDERLAY_FOREST, UNDERLAY_GRASS,
  UNDERLAY_SAND,
} from "./map.ts";
import type { Area, MapExit, MapIcon, MapLabel } from "./oakridge.ts";
import { valueNoise2D } from "./rng.ts";
import {
  alongPolyline, bank, boxOf, building, corners, fence, inBox, road, scatter, shop, smoothstep, WorldBuilder,
  type Box, type Point,
} from "./worldgen.ts";

/** The site: regions 44–48 × 50–51, tiles x 2816–3135 and y 3200–3327. */
export const WICKSTEAD: Box = boxOf(2816, 3200, 3135, 3327);
/** The foot of the Greycaps, regions 45–46 × 52: the rising ground north of the village, built on its own clip. */
export const FOOTHILLS: Box = boxOf(2880, 3328, 3007, 3391);
/** The Sound's two regions: open water, as far as the fog can see from the shore. */
export const SOUND: Box = boxOf(2816, 3200, 2879, 3327);
/** The shore: the Sound's east bank and the sand along it, where the village's tune gives way to the water's. */
export const SHORE: Box = boxOf(2816, 3200, 2897, 3327);
/** The village: from the jetty to the manor's garden, the beck to the cottages south of the road. */
export const VILLAGE: Box = boxOf(2876, 3264, 2946, 3322);
/** The square, where the West Road ends and the Coast Road begins. */
export const SQUARE = { x: 2914, y: 3290 };
/** The manor on the rise east of the square, inside its garden wall. */
export const MANOR: Box = boxOf(2932, 3297, 2941, 3305);
export const GARDEN: Box = boxOf(2929, 3293, 2943, 3308);
/** The rise the manor stands on. */
const RISE = { x: 2938, y: 3302, r: 16 };
/** The lock-up: a stone box with a barred window, south of the road. */
export const LOCKUP: Box = boxOf(2922, 3279, 2926, 3283);
export const BANK: Box = boxOf(2910, 3297, 2919, 3304);
export const NETS: Box = boxOf(2899, 3293, 2906, 3300);
export const INN: Box = boxOf(2908, 3276, 2917, 3284);
const COTTAGES: ReadonlyArray<readonly [Box, 0 | 1 | 2 | 3]> = [
  [boxOf(2897, 3268, 2903, 3274), 3],
  [boxOf(2899, 3278, 2905, 3284), 0],
  [boxOf(2930, 3278, 2936, 3284), 0],
  [boxOf(2922, 3268, 2928, 3274), 0],
  [boxOf(2921, 3298, 2927, 3304), 2],
];
/** The jetty: planks out over the Sound at the end of the Coast Road's first stretch. */
export const JETTY: Box = boxOf(2876, 3289, 2887, 3290);
/** The pasture east of the village, the wick the place is named for: a pen and a barn. */
const PEN: Box = boxOf(2950, 3296, 2962, 3306);
const BARN: Box = boxOf(2950, 3309, 2960, 3316);
/** The alder shore (PLAN §8.2, Woodcutting 25): the strip between the Coast Road and the sand, south of the jetty. */
export const ALDER_SHORE: Box = boxOf(2884, 3254, 2895, 3284);
/**
 * Wick Beck: down from its spring in the foothills along the village's north side into the Sound. Its
 * first point is the mouth and its last the source, so a point's `t` along it is how far up the stream it is.
 */
export const BECK: Point[] = [[2881, 3303], [2890, 3306], [2900, 3309], [2912, 3312], [2924, 3315], [2932, 3320], [2936, 3328], [2940, 3340], [2946, 3352]];
export const SPRING = { x: 2946, y: 3352 };
const BECK_HALF = 1.6;
/** The woods: the Oakenshaw's west end, thinning from the district's edge, and the foothill wood north of the road. */
const OAKENSHAW_END: Box = boxOf(3072, 3232, 3135, 3327);
const FOOTHILL_WOOD: Box = boxOf(2966, 3298, 3070, 3327);

/** The West Road, on from where the district's stretch ends at (3136, 3236), to the square. */
const WEST_ROAD: Point[] = [
  [3140, 3236], [3126, 3237], [3104, 3243], [3080, 3252], [3050, 3262], [3016, 3272], [2984, 3282], [2956, 3289], [2938, 3290], [2918, 3290],
];
/** The Coast Road: west out of the square to the jetty, then south along the shore and out toward Brinehaven. */
const JETTY_ROAD: Point[] = [[2914, 3290], [2896, 3290], [2882, 3290]];
const COAST_ROAD: Point[] = [[2894, 3289], [2892, 3280], [2891, 3266], [2893, 3250], [2894, 3236], [2893, 3220], [2892, 3200], [2892, 3196]];
/** Where the Coast Road leaves the site. */
export const COAST_EXIT = { x: 2892, y: 3200 };

/**
 * Builds the site. The same order as every site: ground, water, roads, then what stands on them; then
 * the foothills on their own clip (a builder without a clip spills), the same ground and water carried
 * on up, with the spring the beck rises from.
 */
export function buildWickstead(b: WorldBuilder, seed: number): void {
  b.clip = WICKSTEAD;
  const sea = terrain(b, seed, WICKSTEAD);
  sound(b, sea, WICKSTEAD);
  beck(b, sea, WICKSTEAD);
  jetty(b, sea);
  roads(b);
  village(b);
  pasture(b);
  woods(b, seed);
  wilderness(b, seed, WICKSTEAD);
  waters(b);
  creatures(b);
  lying(b);
  b.clip = FOOTHILLS;
  terrain(b, seed, FOOTHILLS);
  sound(b, sea, FOOTHILLS);
  beck(b, sea, FOOTHILLS);
  foothills(b, seed);
}

// --- Ground ------------------------------------------------------------------------------------------

/** Whether a corner is this site's to write: the district's column at x 3136 is not. */
const ours = (cx: number, _cy: number): boolean => cx < 3136;

/** The beck's water level at `t` of its length: a hand above the sea at the mouth, rising to its spring. */
const beckLevel = (sea: number, t: number): number => sea + 0.25 + 4.5 * t;

/**
 * The ground: the heartland's own height, coming down off the ridge's west foot onto a coastal plain,
 * the rise the manor stands on, the mountains' foot climbing away north of the village, the shore
 * easing down to the water over fourteen tiles, the beck's valley, and the stitch to the district's
 * column of corners at x 3136, joined over eight tiles. One function of world coordinates for both
 * boxes, so the row of corners they share gets the same numbers from either pass. Returns the sea's
 * level, read off the district's own sea, so the Sound stands at the same height.
 */
function terrain(b: WorldBuilder, seed: number, box: Box): number {
  const raw = heartlandHeight(seed);
  const sea = b.heightAtCorner(0, SEA_CORNER.x, SEA_CORNER.y);
  for (let cy = box.y0; cy <= box.y1 + 1; cy++) {
    for (let cx = box.x0; cx <= box.x1 + 1; cx++) {
      if (!ours(cx, cy)) continue;
      let h = raw(cx, cy);
      // The coastal plain: two and a half units down from the ridge's foot, over sixty tiles.
      h -= 2.5 * smoothstep(3000, 2940, cx);
      // The rise.
      h += 2.2 * smoothstep(RISE.r, 5, Math.hypot(cx - RISE.x, cy - RISE.y));
      // The Greycaps' foot: seven units up over the foothills' sixty rows.
      h += 7 * smoothstep(3322, FOOTHILLS.y1, cy);
      // The shore, down to the water's edge.
      const off = Math.max(0, cx - soundShore(cy) - 1);
      h += (sea + 0.6 + off * 0.3 - h) * smoothstep(14, 3, off);
      // The beck's valley: banks that come down to the water from seven tiles out, at the water's own level there.
      const { d, t } = alongPolyline(cx, cy, BECK);
      const beside = Math.max(0, d - BECK_HALF);
      h += (beckLevel(sea, t) + 0.6 + beside * 0.4 - h) * smoothstep(7, 1.5, beside);
      // The stitch: the district's column, joined over eight tiles, exactly at the seam.
      if (cx >= 3128) h += (b.heightAtCorner(0, 3136, cy) - h) * smoothstep(3127, 3135, cx);
      b.setHeight(0, cx, cy, h);
    }
  }
  for (let y = box.y0; y <= box.y1; y++) for (let x = box.x0; x <= box.x1; x++) b.setUnderlay(0, x, y, UNDERLAY_GRASS);
  return sea;
}

/** The Sunder Sound: water west of the shore line, sand along it, every water corner at the sea's level. */
function sound(b: WorldBuilder, sea: number, box: Box): void {
  for (let y = box.y0; y <= box.y1; y++) {
    const shore = soundShore(y);
    for (let x = box.x0; x <= Math.min(box.x1, SHORE.x1); x++) {
      if (x + 0.5 < shore) {
        b.setOverlay(0, x, y, OVERLAY_WATER);
        b.plane(0).collision.block(x, y);
        for (const [cx, cy] of corners(x, y)) b.setHeight(0, cx, cy, sea);
      } else if (x + 0.5 < shore + 2.5) {
        b.setUnderlay(0, x, y, UNDERLAY_SAND);
      }
    }
  }
}

/** Whether a tile is the Sound's water rather than the beck's. */
const isSound = (x: number, y: number): boolean => x + 0.5 < soundShore(y);

/**
 * Wick Beck: a stream three tiles wide coming down from its spring in the foothills into the Sound, its
 * water sloping gently from source to mouth, with a sand bank either side. Where it meets the Sound the
 * sea's corners stand, so the two waters join without a lip.
 */
function beck(b: WorldBuilder, sea: number, box: Box): void {
  for (let y = Math.max(3296, box.y0); y <= box.y1; y++) {
    for (let x = Math.max(2876, box.x0); x <= Math.min(2960, box.x1); x++) {
      if (isSound(x, y)) continue;
      const { d } = alongPolyline(x + 0.5, y + 0.5, BECK);
      if (d <= BECK_HALF) {
        b.setOverlay(0, x, y, OVERLAY_WATER);
        b.plane(0).collision.block(x, y);
        for (const [cx, cy] of corners(x, y)) {
          const touchesSea = [[cx - 1, cy - 1], [cx, cy - 1], [cx - 1, cy], [cx, cy]].some(([tx, ty]) => isSound(tx!, ty!) && b.overlayAt(0, tx!, ty!) === OVERLAY_WATER);
          if (!touchesSea) b.setHeight(0, cx, cy, beckLevel(sea, alongPolyline(cx, cy, BECK).t));
        }
      } else if (d <= BECK_HALF + 1.5 && underlayAt(b.plane(0), x, y) === UNDERLAY_GRASS) {
        b.setUnderlay(0, x, y, UNDERLAY_SAND);
      }
    }
  }
}

/** The jetty: planks out over the water where the Coast Road meets the shore, a rail wherever they meet open water, and its corners a hand above the sea. */
function jetty(b: WorldBuilder, sea: number): void {
  const deck: Array<{ x: number; y: number }> = [];
  for (let x = JETTY.x0; x <= JETTY.x1; x++) {
    for (let y = JETTY.y0; y <= JETTY.y1; y++) {
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
  for (const [x, y] of [[JETTY.x1 + 1, JETTY.y1 + 1], [JETTY.x1 + 2, JETTY.y1 + 1]] as const) if (b.free(0, x, y)) b.place(0, "barrel", x, y);
  for (const [x, y] of [[JETTY.x1 + 1, JETTY.y0 - 1]] as const) if (b.free(0, x, y)) b.place(0, "crate", x, y);
}

/** The West Road in, the square, the Coast Road out to the jetty and south along the shore, and the lanes; dirt under all of it. */
function roads(b: WorldBuilder): void {
  for (const line of [WEST_ROAD, JETTY_ROAD, COAST_ROAD]) road(b, 0, line, 1.3);
  road(b, 0, [[2936, 3291], [2936, 3296]], 0.85);
  road(b, 0, [[2914, 3292], [2914, 3296]], 0.85);
  road(b, 0, [[2955, 3290], [2956, 3295]], 0.85);
  for (let y = SQUARE.y - 4; y <= SQUARE.y + 4; y++) {
    for (let x = SQUARE.x - 4; x <= SQUARE.x + 4; x++) {
      if (Math.hypot(x - SQUARE.x, y - SQUARE.y) <= 3.4) b.setOverlay(0, x, y, OVERLAY_PATH);
    }
  }
  for (let y = WICKSTEAD.y0; y <= WICKSTEAD.y1; y++) {
    for (let x = WICKSTEAD.x0; x <= WICKSTEAD.x1; x++) {
      if (b.overlayAt(0, x, y) === OVERLAY_PATH) b.setUnderlay(0, x, y, UNDERLAY_DIRT);
    }
  }
}

// --- The village ---------------------------------------------------------------------------------------

/**
 * The village (PLAN §7.6's card and the plan map's): the bank on the square's north side — the second
 * in the world — the net shop across the road from it, the Grayling on the south side with its range,
 * the lock-up by the road in, five cottages, the well and the signpost, and the manor on the rise east
 * of it all inside its garden wall.
 */
function village(b: WorldBuilder): void {
  bank(b, BANK, { side: 2, along: 4 });
  shop(b, NETS, { side: 2, along: 4 }, "wickstead_nets", "netmaker", [{ side: 2, along: 1 }, { side: 3, along: 3 }]);

  // The Grayling: two storeys of slate on the square's south side, the range through the door.
  building(b, {
    box: INN,
    doors: [{ side: 0, along: 5 }],
    windows: [{ side: 0, along: 1 }, { side: 3, along: 4 }, { side: 1, along: 2 }, { side: 1, along: 6 }],
    storeys: 2,
    stair: { x: INN.x0 + 1, y: INN.y0 + 1 },
    floor: UNDERLAY_DIRT,
    roof: ROOF_SLATE,
  });
  b.place(0, "range", INN.x0 + 1, INN.y1 - 1);
  b.place(0, "table", INN.x0 + 3, INN.y0 + 3);
  b.place(0, "table", INN.x1 - 2, INN.y0 + 5);
  b.place(0, "barrel", INN.x1 - 1, INN.y0 + 1);
  b.spawnMonster({ monster: "innkeeper_wickstead", x: INN.x0 + 3, y: INN.y1 - 1 });
  b.spawnMonster({ monster: "fisher", x: INN.x0 + 4, y: INN.y0 + 3 });
  b.place(1, "table", INN.x0 + 4, INN.y0 + 4);
  b.place(1, "barrel", INN.x1 - 1, INN.y1 - 1);

  // The lock-up: one room of arrow-slit stone under a flat roof, and the constable outside it.
  building(b, { box: LOCKUP, doors: [{ side: 0, along: 2 }], windows: [{ side: 1, along: 2 }, { side: 3, along: 2 }], floor: UNDERLAY_DIRT, roof: ROOF_KEEP, style: "keep" });
  b.place(0, "barrel", LOCKUP.x0 + 1, LOCKUP.y0 + 1);
  b.spawnMonster({ monster: "constable", x: LOCKUP.x0 + 2, y: LOCKUP.y1 + 3 });

  // Five cottages, each facing a road.
  for (const [box, side] of COTTAGES) {
    const lit = ((side + 1) % 4) as 0 | 1 | 2 | 3;
    building(b, { box, doors: [{ side, along: 3 }], windows: [{ side: lit, along: 3 }], floor: UNDERLAY_DIRT });
  }

  // The square: the well, the signpost, and the people about it.
  b.place(0, "well", SQUARE.x - 3, SQUARE.y);
  b.place(0, "signpost", SQUARE.x + 3, SQUARE.y - 3);
  b.spawnMonster({ monster: "fisher", x: 2905, y: 3288 });
  b.spawnMonster({ monster: "fisher_woman", x: 2920, y: 3294 });
  b.spawnMonster({ monster: "fisher", x: 2890, y: 3292 });
  b.spawnMonster({ monster: "fisher_woman", x: 2926, y: 3276 });

  // The manor on the rise: two storeys of slate inside a garden wall with a gate onto the road, the
  // hall with its long table and the squire at the head of it.
  fence(b, 0, GARDEN, { x: 2936, y: GARDEN.y0 });
  building(b, {
    box: MANOR,
    doors: [{ side: 2, along: 4 }],
    windows: [{ side: 2, along: 1 }, { side: 2, along: 7 }, { side: 0, along: 2 }, { side: 0, along: 6 }, { side: 3, along: 4 }, { side: 1, along: 4 }],
    storeys: 2,
    stair: { x: MANOR.x1 - 1, y: MANOR.y1 - 1 },
    floor: UNDERLAY_DIRT,
    roof: ROOF_SLATE,
  });
  for (let x = MANOR.x0 + 2; x <= MANOR.x1 - 3; x += 2) b.place(0, "table", x, MANOR.y0 + 4);
  b.place(0, "barrel", MANOR.x0 + 1, MANOR.y1 - 1);
  b.place(0, "crate", MANOR.x0 + 1, MANOR.y0 + 1);
  b.spawnMonster({ monster: "squire", x: MANOR.x1 - 2, y: MANOR.y0 + 4 });
  b.place(1, "table", MANOR.x0 + 3, MANOR.y0 + 3);
  b.place(1, "table", MANOR.x1 - 3, MANOR.y0 + 5);
  for (const [x, y] of [[GARDEN.x0 + 1, GARDEN.y1 - 1], [GARDEN.x1 - 1, GARDEN.y1 - 1], [GARDEN.x1 - 1, GARDEN.y0 + 1]] as const) b.place(0, "tree", x, y);
  for (const [x, y] of [[GARDEN.x0 + 1, GARDEN.y0 + 2], [GARDEN.x0 + 1, GARDEN.y0 + 5], [GARDEN.x1 - 1, GARDEN.y0 + 4], [GARDEN.x1 - 1, GARDEN.y0 + 7]] as const) b.place(0, "bush", x, y);
  b.place(0, "signpost", GARDEN.x1 + 1, GARDEN.y0 - 1);
}

/** The wick: a fenced pasture with its gate onto the road, and a thatched barn behind it. */
function pasture(b: WorldBuilder): void {
  fence(b, 0, PEN, { x: 2956, y: PEN.y0 });
  building(b, { box: BARN, doors: [{ side: 2, along: 5 }], windows: [{ side: 0, along: 5 }], floor: UNDERLAY_DIRT, roof: ROOF_THATCH });
  b.place(0, "crate", BARN.x0 + 1, BARN.y0 + 1);
  b.place(0, "crate", BARN.x0 + 2, BARN.y0 + 1);
  b.place(0, "barrel", BARN.x1 - 1, BARN.y1 - 1);
}

// --- The country -----------------------------------------------------------------------------------------

/**
 * The woods: the Oakenshaw's west end, oaks thick at the district's edge thinning to the odd tree
 * thirty tiles on, its floor going ragged rather than stopping at a line; the foothill wood north of
 * the road, where the wolves are; and the alders along the shore, the first tree past oak (§8.2).
 */
function woods(b: WorldBuilder, seed: number): void {
  const grain = valueNoise2D(seed + 707);
  for (let y = OAKENSHAW_END.y0; y <= OAKENSHAW_END.y1; y++) {
    for (let x = OAKENSHAW_END.x0; x <= OAKENSHAW_END.x1; x++) {
      if (!b.free(0, x, y) || b.overlayAt(0, x, y) !== 0 || underlayAt(b.plane(0), x, y) !== UNDERLAY_GRASS) continue;
      const deep = smoothstep(3076, 3130, x);
      if (b.rand() >= 0.15 + 0.85 * deep) continue;
      b.setUnderlay(0, x, y, UNDERLAY_FOREST);
      if (b.rand() >= (0.06 + 0.28 * deep) * (0.5 + 0.5 * grain(x / 7, y / 7))) continue;
      b.place(0, b.rand() < 0.1 + 0.5 * deep ? "oak" : "tree", x, y);
    }
  }
  for (let y = FOOTHILL_WOOD.y0; y <= FOOTHILL_WOOD.y1; y++) {
    for (let x = FOOTHILL_WOOD.x0; x <= FOOTHILL_WOOD.x1; x++) {
      if (!b.free(0, x, y) || b.overlayAt(0, x, y) !== 0 || underlayAt(b.plane(0), x, y) !== UNDERLAY_GRASS) continue;
      b.setUnderlay(0, x, y, UNDERLAY_FOREST);
      if (b.rand() >= 0.2 * (0.5 + 0.5 * grain(x / 7, y / 7))) continue;
      b.place(0, b.rand() < 0.25 ? "oak" : "tree", x, y);
    }
  }
  const onShore = (x: number, y: number) => inBox(ALDER_SHORE, x, y) && b.overlayAt(0, x, y) === 0;
  scatter(b, 0, "alder", { x: 2889, y: 3269, r: 17 }, 14, onShore);
  scatter(b, 0, "tree", { x: 2889, y: 3269, r: 17 }, 4, onShore);
}

/** The ground nobody authored: a scatter of trees, bushes and rocks, so no corner of the site is bare. */
function wilderness(b: WorldBuilder, seed: number, box: Box): void {
  const grain = valueNoise2D(seed + 808);
  for (let y = box.y0; y <= box.y1; y++) {
    for (let x = box.x0; x <= box.x1; x++) {
      if (!b.free(0, x, y) || b.overlayAt(0, x, y) !== 0 || underlayAt(b.plane(0), x, y) !== UNDERLAY_GRASS) continue;
      if (inBox(VILLAGE, x, y) || inBox(PEN, x, y) || inBox(BARN, x, y)) continue;
      const trees = 0.05 * grain(x / 11, y / 11);
      const roll = b.rand();
      if (roll < trees) b.place(0, "tree", x, y);
      else if (roll < trees + 0.008) b.place(0, "bush", x, y);
      else if (roll < trees + 0.011) b.place(0, "rock", x, y);
    }
  }
  // Reeds along the beck's mouth and the shore south of the village.
  for (let y = 3210; y <= 3312; y++) {
    for (let x = 2880; x <= 2900; x++) {
      if (!b.free(0, x, y) || b.overlayAt(0, x, y) !== 0 || underlayAt(b.plane(0), x, y) !== UNDERLAY_SAND) continue;
      if (inBox(JETTY, x, y - 1) || inBox(JETTY, x, y + 1) || inBox(JETTY, x - 1, y)) continue;
      if (b.rand() < 0.08) b.place(0, "reed", x, y);
    }
  }
}

/**
 * The foot of the Greycaps: bare ground going to rock as it climbs, a few trees on the lower slopes, the
 * spring the beck rises from in a ring of stones, and wolves. Nothing to do here but the walk; the range
 * itself, the pass and Deepdelve are Wave 3's (§7.6).
 */
function foothills(b: WorldBuilder, seed: number): void {
  const grain = valueNoise2D(seed + 909);
  for (let y = FOOTHILLS.y0; y <= FOOTHILLS.y1; y++) {
    for (let x = FOOTHILLS.x0; x <= FOOTHILLS.x1; x++) {
      if (!b.free(0, x, y) || b.overlayAt(0, x, y) !== 0 || underlayAt(b.plane(0), x, y) !== UNDERLAY_GRASS) continue;
      if (Math.hypot(x - SPRING.x, y - SPRING.y) < 3) continue;
      const up = smoothstep(FOOTHILLS.y0, FOOTHILLS.y1, y);
      const rocks = 0.01 + 0.09 * up * (0.5 + 0.5 * grain(x / 9, y / 9));
      const trees = 0.05 * (1 - up) * grain(x / 11, y / 11);
      const roll = b.rand();
      if (roll < rocks) b.place(0, "rock", x, y);
      else if (roll < rocks + trees) b.place(0, "tree", x, y);
      else if (roll < rocks + trees + 0.006) b.place(0, "bush", x, y);
    }
  }
  scatter(b, 0, "rock", { x: SPRING.x, y: SPRING.y, r: 4 }, 6, (x, y) => Math.hypot(x - SPRING.x, y - SPRING.y) >= 2);
  const herds: Array<[string, number, number, number, number]> = [
    ["grey_wolf", 3, 2905, 3362, 8],
    ["giant_rat", 3, 2962, 3344, 6],
    ["thicket_spider", 3, 2990, 3336, 6],
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

/** The grayling water (PLAN §8.4, Fishing 33, a rod and bait): the beck's lower reach; and net spots off the jetty. */
function waters(b: WorldBuilder): void {
  const hasBank = (x: number, y: number): boolean =>
    ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const).some(([dx, dy]) => b.free(0, x + dx, y + dy));
  const spots = (box: Box, method: "angle" | "net", sound: boolean) => {
    const tiles: Array<{ x: number; y: number }> = [];
    for (let y = box.y0; y <= box.y1; y++) {
      for (let x = box.x0; x <= box.x1; x++) {
        if (b.overlayAt(0, x, y) !== OVERLAY_WATER || isSound(x, y) !== sound) continue;
        if ((x * 3 + y * 5) % 7 !== 0) continue;
        if (hasBank(x, y)) tiles.push({ x, y });
      }
    }
    if (tiles.length > 0) b.addWater({ tiles: tiles.slice(0, 8), count: Math.min(3, tiles.length), method });
  };
  spots(boxOf(2882, 3300, 2912, 3316), "angle", false);
  spots(boxOf(JETTY.x0 - 2, JETTY.y0 - 3, JETTY.x1 + 2, JETTY.y1 + 3), "net", true);
}

/**
 * Who lives here. The road stays safe (§7.7's third rule); the village holds people, the pen its
 * cows, the shore its ducks and rats; the Oakenshaw's end has spiders and wolves, the foothill wood
 * boars and wolves, all of them a long way from the square.
 */
function creatures(b: WorldBuilder): void {
  const herds: Array<[string, number, number, number, number]> = [
    ["cow", 4, 2956, 3301, 4],
    ["hen", 3, 2940, 3270, 3],
    ["field_rat", 3, 2946, 3284, 4],
    ["mallard", 4, 2888, 3304, 4],
    ["giant_rat", 3, 2890, 3240, 5],
    ["pond_newt", 3, 2894, 3216, 4],
    ["thicket_spider", 4, 3110, 3254, 6],
    ["grey_wolf", 4, 3100, 3300, 6],
    ["wild_boar", 3, 3010, 3312, 8],
    ["grey_wolf", 3, 2980, 3318, 6],
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

/** What lies about: bait by the beck for whoever brought the rod, a log of the shore's own wood, and a little else. */
function lying(b: WorldBuilder): void {
  const spawns: Array<[string, number, number, number, number]> = [
    ["bait", 10, 2896, 3303, 200],
    ["alder_logs", 1, 2888, 3262, 300],
    ["logs", 1, 2920, 3287, 100],
    ["bread", 1, 2912, 3281, 100],
    ["coins", 10, 2884, 3291, 200],
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

/** The village has the village's tune; the shore and the Sound have the water's; the road between has the village's. */
export const WICKSTEAD_AREAS: ReadonlyArray<{ area: Area; box: Box }> = [
  { area: { key: "wickstead", name: "Wickstead", track: 0 }, box: VILLAGE },
  { area: { key: "sound", name: "The Sunder Sound", track: 1 }, box: SHORE },
  { area: { key: "westroad", name: "The West Road", track: 0 }, box: WICKSTEAD },
  { area: { key: "foothills", name: "The Greycaps", track: 1 }, box: FOOTHILLS },
];

export const WICKSTEAD_LABELS: MapLabel[] = [
  { name: "Wickstead", x: 2914, y: 3262 },
  { name: "The Sunder Sound", x: 2848, y: 3262 },
  { name: "Wick Beck", x: 2924, y: 3320, small: true },
  { name: "Wickstead Manor", x: 2936, y: 3311, small: true },
  { name: "The Grayling", x: 2912, y: 3273, small: true },
  { name: "The West Road", x: 3010, y: 3266, small: true },
  { name: "The Greycaps", x: 2944, y: 3378 },
];

export const WICKSTEAD_MARKS: Array<{ icon: MapIcon; x: number; y: number; name: string }> = [
  { icon: "inn", x: 2912, y: 3280, name: "The Grayling" },
  { icon: "fish", x: 2896, y: 3309, name: "Wick Beck" },
  { icon: "fish", x: 2881, y: 3290, name: "The jetty" },
  { icon: "tree", x: 2889, y: 3268, name: "The alder shore" },
];

/** The Coast Road south out of the village, and where it goes (§7.6): Brinehaven, the port. */
export const WICKSTEAD_EXITS: MapExit[] = [
  { name: "The Coast Road — Brinehaven", x: COAST_EXIT.x, y: COAST_EXIT.y, side: "s", away: 161 },
];

/** Named boxes, for the tests and the map. */
export const WICKSTEAD_SITES: Record<string, Box> = { wickstead: WICKSTEAD, wickstead_village: VILLAGE, sunder_sound: SOUND, foothills: FOOTHILLS };
