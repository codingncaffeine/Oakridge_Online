// The Fen Road, the Black Rill and the Sallowfen, with Mourn (PLAN §7.6, Wave 4): east out of Thornbury's
// gate the Fen Road crosses open heath to the Black Rill, the Sallowfen's border, where one bridge crosses
// it behind a barred gate and a warden who lets nobody over without the castle's leave — the lock of "The
// Silence at Mourn" (quests.ts). The gate never swings: from the quest's fifth stage on, the warden passes
// one player over the bar at a time (world.ts), so nobody slips through behind them. Past it the fen: dark
// water and dead trees, a causeway raised through it, and Mourn on its mound, the only thing standing in
// it — a bank, one store, a chapel whose tower has lost its bell, and the stair down to the Fen Hollows
// sealed (a later wave's). Worse company the further off the causeway.
//
// Two sites on one builder, each on its own clip: the road's, regions 50–55 × 54–55, stitched to
// Thornbury's east column (x 3200), Stonecote's north row (y 3456, x ≤ 3328) and the Harrow's south row
// (y 3584, x ≤ 3456), none of which it writes; and the fen's, regions 56–61 × 52–57, which never writes
// the road's east column (x 3584, y 3456–3584). The heath either side of that column is one lie of the
// land, so it runs on without a step by construction. Built after Sandreach and before the Adit, and only
// where the Harrow stands (its row is a seam), so every id and every roll of the sites before it stands
// (tests/sallowfen.test.ts builds the world with and without it and compares).
import { heartlandHeight } from "./heartland.ts";
import { OVERLAY_PATH, OVERLAY_WATER, ROOF_KEEP, ROOF_SLATE, underlayAt, UNDERLAY_DIRT, UNDERLAY_FEN, UNDERLAY_GRASS } from "./map.ts";
import type { Area, MapIcon, MapLabel } from "./oakridge.ts";
import { valueNoise2D } from "./rng.ts";
import { TUNE } from "./tunes.ts";
import {
  bank, boxOf, building, corners, distanceToPolyline, inBox, road, shop, smoothstep, tower, WorldBuilder, type Box, type DoorSpec, type Point,
  type TownLook,
} from "./worldgen.ts";

/** The road's site: regions 50–55 × 54–55, tiles x 3200–3583 and y 3456–3583. */
export const FEN_ROAD_SITE: Box = boxOf(3200, 3456, 3583, 3583);
/** The fen's: regions 56–61 × 52–57, tiles x 3584–3967 and y 3328–3711. */
export const SALLOWFEN_SITE: Box = boxOf(3584, 3328, 3967, 3711);
/** The fen proper: everything of the fen's site east of the Rill. The strip west of it is the heath's last reach. */
export const FEN: Box = boxOf(3643, 3328, 3967, 3711);

/**
 * The Black Rill, south to north down the fen's west edge (§7.6: along x ≈ 3648), and how far either side
 * of its line is water. It runs dead straight past the crossing, so the bridge spans it square and the
 * gate's towers stand on the bank's edge.
 */
export const RILL: Point[] = [[3638, 3328], [3641, 3380], [3637, 3440], [3639, 3526], [3639, 3570], [3643, 3612], [3640, 3660], [3642, 3712]];
const RILL_HALF = 3.6;
/** The one bridge over it, where the Fen Road crosses: the water's width exactly, three tiles wide. */
export const BRIDGE: Box = boxOf(3635, 3547, 3642, 3549);
/** The gate bars the bridge's west end: it hangs on the west edge of the bridge's first column. */
export const GATE_X = BRIDGE.x0;
/** The gatehouse's two towers, on the west bank either side of the gate. */
export const GATE_TOWERS: readonly Box[] = [boxOf(3632, 3544, 3634, 3546), boxOf(3632, 3550, 3634, 3552)];
/** The warden's guardhouse on the west bank, north of the road, where Pell is kept out of sight. */
export const GUARDHOUSE: Box = boxOf(3619, 3552, 3627, 3558);
const GUARDHOUSE_DOOR: DoorSpec = { side: 2, along: 4 };
/** Where the warden stands: at the gate, on the road's north side. */
export const WARDEN = { x: 3631, y: 3549 };

/** The Fen Road from Thornbury's east gate over the heath to the gate; the causeway on from the bridge's far end through the fen to Mourn's square. */
export const FEN_ROAD: Point[] = [[3200, 3521], [3236, 3510], [3290, 3503], [3360, 3510], [3430, 3521], [3500, 3532], [3560, 3540], [3608, 3547], [3634, 3548.5]];
export const CAUSEWAY: Point[] = [[3643, 3548.5], [3690, 3553], [3740, 3560], [3790, 3558], [3836, 3553], [3868, 3552]];
/** Where the Fen Road comes in over Thornbury's seam. */
export const ROAD_IN = { x: 3200, y: 3521 };

/** The box round a polyline, so a distance to it is measured only where it could be short. */
function boundsOf(line: readonly Point[]): Box {
  const xs = line.map(([x]) => x), ys = line.map(([, y]) => y);
  return boxOf(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys));
}
const CAUSEWAY_BOX = boundsOf(CAUSEWAY), FEN_ROAD_BOX = boundsOf(FEN_ROAD);
/** How far a point is from a polyline, or Infinity when it is further than `reach` from the line's box: most of the fen is. */
function distanceWithin(px: number, py: number, line: readonly Point[], box: Box, reach: number): number {
  if (px < box.x0 - reach || px > box.x1 + reach || py < box.y0 - reach || py > box.y1 + reach) return Infinity;
  return distanceToPolyline(px, py, line);
}

/** Mourn: the mound it stands on out of the water, the village's box, and its square where the causeway ends. */
export const MOUND = { x: 3874, y: 3552, r: 25 };
export const MOURN: Box = boxOf(3850, 3527, 3898, 3577);
export const SQUARE = { x: 3872, y: 3552 };
/** The bank north of the square, the store east of it, the chapel south of it with its graves behind, all facing it. */
export const BANK: Box = boxOf(3866, 3559, 3877, 3566);
export const STORE: Box = boxOf(3880, 3549, 3887, 3555);
export const CHAPEL: Box = boxOf(3867, 3536, 3877, 3545);
const BELL_TOWER: Box = boxOf(3867, 3533, 3869, 3535);
/** The reeve's house, on the causeway's north side as it comes into the village. */
export const REEVE_HOUSE: Box = boxOf(3855, 3557, 3862, 3563);
export const COTTAGES: ReadonlyArray<readonly [Box, DoorSpec]> = [
  [boxOf(3853, 3566, 3858, 3571), { side: 1, along: 2 }],
  [boxOf(3889, 3558, 3894, 3563), { side: 3, along: 2 }],
  [boxOf(3884, 3537, 3889, 3542), { side: 0, along: 2 }],
  [boxOf(3853, 3538, 3858, 3543), { side: 0, along: 3 }],
];
/** The graves of Mourn's dead behind the chapel. */
const GRAVES: ReadonlyArray<readonly [number, number]> = [[3872, 3533], [3874, 3533], [3876, 3533], [3872, 3530], [3874, 3530], [3876, 3530], [3878, 3531]];
/** Where the Fen Hollows go down (PLAN §8.5): at the mound's north edge, sealed until a later wave opens them. */
export const HOLLOWS_STAIR = { x: 3874, y: 3572 };
/** The lanes, each leaving from inside the square's round or off the causeway: round the bank to the north-west cottage and the sealed stair, east to a cottage, south to two more. */
const LANES: Point[][] = [
  [[3864, 3553], [3864, 3572], [3873, 3572]],
  [[3864, 3568], [3859, 3568]],
  [[3873, 3555], [3877, 3556], [3887, 3557], [3887, 3560]],
  [[3869, 3549], [3866, 3548], [3862, 3546], [3856, 3546]],
  [[3874, 3549], [3877, 3548], [3882, 3545], [3886, 3545]],
];
/** From a lane, the square or the road to each door, the guardhouse's too; a stub starts a tile inside the way it leaves and runs a tile into its building. */
const STUBS: Point[][] = [
  [[3872, 3556], [3872, 3560]], [[3875, 3552], [3881, 3552]], [[3872, 3548], [3872, 3544]], [[3859, 3553], [3859, 3558]],
  [[3856, 3546], [3856, 3542]], [[3886, 3545], [3886, 3541]], [[3886, 3560], [3890, 3560]], [[3623, 3548], [3623, 3553]],
];
/** The ragged edge of the mound's dry grass: a circle drawn with a compass would read as nothing that grew. */
const moundEdge = valueNoise2D(1507);
/** Mourn builds as Aldermarch does, slate over grey stone, the one town on the fen. */
const SLATE: TownLook = { roof: ROOF_SLATE };

export function buildSallowfen(b: WorldBuilder, seed: number): void {
  const heath = heathHeight(seed);
  b.clip = FEN_ROAD_SITE;
  roadTerrain(b, heath);
  road(b, 0, FEN_ROAD, 1.3);
  dirtUnderPaths(b, FEN_ROAD_SITE);
  b.place(0, "signpost", 3206, 3524);
  scrub(b, seed);
  creatures(b, ROAD_HERDS, null);

  b.clip = SALLOWFEN_SITE;
  const level = fenTerrain(b, seed, heath);
  rill(b);
  pools(b, seed, level);
  road(b, 0, FEN_ROAD, 1.3);
  road(b, 0, CAUSEWAY, 1.3);
  for (const lane of LANES) road(b, 0, lane, 1.0);
  for (const stub of STUBS) road(b, 0, stub, 0.6);
  square(b);
  dirtUnderPaths(b, SALLOWFEN_SITE);
  bridge(b);
  crossing(b);
  mourn(b);
  fen(b, seed);
  creatures(b, FEN_HERDS, walkable(b));
  b.spawnMonster({ monster: "hen", x: 3856, y: 3573 });
  b.spawnMonster({ monster: "hen", x: 3859, y: 3574 });
  lying(b);
}

// --- Ground ------------------------------------------------------------------------------------------

/**
 * The heath's lie of the land: the heartland's own, with long low swells coming in east of Thornbury.
 * The road's site and the fen's west bank both stand on it, so the column between them meets itself.
 */
function heathHeight(seed: number): (cx: number, cy: number) => number {
  const raw = heartlandHeight(seed), swell = valueNoise2D(seed + 1501);
  return (cx, cy) => raw(cx, cy) + 1.6 * (swell(cx / 31, cy / 31) - 0.5) * smoothstep(3200, 3240, cx);
}

/** The corners the road's neighbours wrote: Thornbury's east column, Stonecote's north row, the Harrow's south row. */
const roadOwns = (cx: number, cy: number): boolean =>
  !(cx === 3200 && cy >= 3456 && cy <= 3584) && !(cy === 3456 && cx <= 3328) && !(cy === 3584 && cx <= 3456);

/**
 * The heath under the road, stitched to each neighbour over eight tiles — Thornbury's column, Stonecote's
 * row and the Harrow's row — the rows carried sixteen tiles on past their owners' ends so they run on
 * without a step.
 */
function roadTerrain(b: WorldBuilder, heath: (cx: number, cy: number) => number): void {
  const s = FEN_ROAD_SITE;
  for (let cy = s.y0; cy <= s.y1 + 1; cy++) {
    for (let cx = s.x0; cx <= s.x1 + 1; cx++) {
      if (!roadOwns(cx, cy)) continue;
      let h = heath(cx, cy);
      if (cx <= 3208) h += (b.heightAtCorner(0, 3200, cy) - h) * smoothstep(3209, 3201, cx);
      if (cy <= 3464) h += (b.heightAtCorner(0, Math.min(cx, 3328), 3456) - h) * smoothstep(3465, 3457, cy) * smoothstep(3344, 3328, cx);
      if (cy >= 3576) h += (b.heightAtCorner(0, Math.min(cx, 3456), 3584) - h) * smoothstep(3575, 3583, cy) * smoothstep(3472, 3456, cx);
      b.setHeight(0, cx, cy, h);
    }
  }
  for (let y = s.y0; y <= s.y1; y++) for (let x = s.x0; x <= s.x1; x++) b.setUnderlay(0, x, y, UNDERLAY_GRASS);
}

/** The Rill's x on a row. */
function rillX(y: number): number {
  for (let i = 1; i < RILL.length; i++) {
    const [ax, ay] = RILL[i - 1]!, [bx, by] = RILL[i]!;
    if (y <= by) return ax + ((bx - ax) * (y - ay)) / (by - ay);
  }
  return RILL.at(-1)![0];
}

/** Whether a tile is the Rill's water (the bridge's tiles are the bridge's). */
export const isRill = (x: number, y: number): boolean => distanceToPolyline(x + 0.5, y + 0.5, RILL) < RILL_HALF && !inBox(BRIDGE, x, y);

/** The fen's corners that are the road's: its east column, which the road wrote. */
const fenOwns = (cx: number, cy: number): boolean => !(cx === 3584 && cy >= 3456 && cy <= 3584);

/**
 * The fen's ground: the heath running on to the Rill's west bank, and east of it the land settling to one
 * low level with a little lift here and there, Mourn's mound standing up out of it and the causeway's bank
 * raised through it. Returns the fen's water level.
 */
function fenTerrain(b: WorldBuilder, seed: number, heath: (cx: number, cy: number) => number): number {
  const lift = valueNoise2D(seed + 1504);
  const level = heath(3660, 3548) - 0.6;
  const s = SALLOWFEN_SITE;
  for (let cy = s.y0; cy <= s.y1 + 1; cy++) {
    const rill = rillX(cy);
    for (let cx = s.x0; cx <= s.x1 + 1; cx++) {
      if (!fenOwns(cx, cy)) continue;
      let h = heath(cx, cy);
      const into = smoothstep(rill + 2, rill + 30, cx);
      if (into > 0) h += (level + 0.25 + 0.5 * (lift(cx / 17, cy / 17) - 0.5) - h) * into;
      h += (level + 1.3 - h) * smoothstep(MOUND.r + 6, MOUND.r - 4, Math.hypot(cx - MOUND.x, cy - MOUND.y));
      h += (Math.max(h, level + 0.55) - h) * smoothstep(3.2, 1.2, distanceWithin(cx, cy, CAUSEWAY, CAUSEWAY_BOX, 3.2));
      b.setHeight(0, cx, cy, h);
    }
  }
  for (let y = s.y0; y <= s.y1; y++) {
    const rill = rillX(y);
    for (let x = s.x0; x <= s.x1; x++) b.setUnderlay(0, x, y, x > rill + 4 + 4 * (lift(x / 5, y / 5) - 0.5) ? UNDERLAY_FEN : UNDERLAY_GRASS);
  }
  return level;
}

/** The Black Rill: water down the whole of the fen's west edge, each row's water a hand under the lower of its banks. */
function rill(b: WorldBuilder): void {
  const s = SALLOWFEN_SITE;
  for (let y = s.y0; y <= s.y1; y++) {
    const mid = rillX(y);
    const west = Math.floor(mid - RILL_HALF - 1), east = Math.ceil(mid + RILL_HALF + 1);
    const bank = Math.min(b.heightAtCorner(0, west, y), b.heightAtCorner(0, east, y));
    for (let x = west; x <= east; x++) {
      if (!isRill(x, y)) continue;
      b.setOverlay(0, x, y, OVERLAY_WATER);
      b.setUnderlay(0, x, y, UNDERLAY_DIRT);
      b.plane(0).collision.block(x, y);
      for (const [cx, cy] of corners(x, y)) if (fenOwns(cx, cy)) b.setHeight(0, cx, cy, bank - 0.8);
    }
  }
}

/** The fen's standing water: pools wherever the ground lies lowest east of the Rill, never on the causeway, the mound or the bank's edge. */
function pools(b: WorldBuilder, seed: number, level: number): void {
  const wet = valueNoise2D(seed + 1505);
  const s = SALLOWFEN_SITE;
  for (let y = s.y0; y <= s.y1; y++) {
    const rill = rillX(y);
    for (let x = s.x0; x <= s.x1; x++) {
      if (x <= rill + 7 || distanceWithin(x + 0.5, y + 0.5, CAUSEWAY, CAUSEWAY_BOX, 3.5) < 3.5 || Math.hypot(x + 0.5 - MOUND.x, y + 0.5 - MOUND.y) < MOUND.r + 2) continue;
      if (wet(x / 11, y / 11) * 0.8 + wet(x / 4 + 50, y / 4) * 0.2 >= 0.42) continue;
      b.setOverlay(0, x, y, OVERLAY_WATER);
      b.plane(0).collision.block(x, y);
      for (const [cx, cy] of corners(x, y)) if (fenOwns(cx, cy)) b.setHeight(0, cx, cy, level - 0.2);
    }
  }
}

function dirtUnderPaths(b: WorldBuilder, box: Box): void {
  for (let y = box.y0; y <= box.y1; y++) for (let x = box.x0; x <= box.x1; x++) if (b.overlayAt(0, x, y) === OVERLAY_PATH) b.setUnderlay(0, x, y, UNDERLAY_DIRT);
}

/** Heath along the road: scattered trees thickening toward the Harrow's side, bushes and rock, and reeds as the Rill comes near. */
function scrub(b: WorldBuilder, seed: number): void {
  const grain = valueNoise2D(seed + 1502);
  const s = FEN_ROAD_SITE;
  for (let y = s.y0; y <= s.y1; y++) {
    for (let x = s.x0; x <= s.x1; x++) {
      if (!b.free(0, x, y) || b.overlayAt(0, x, y) !== 0 || distanceWithin(x + 0.5, y + 0.5, FEN_ROAD, FEN_ROAD_BOX, 3) < 3) continue;
      const roll = b.rand();
      const trees = (0.012 + 0.03 * smoothstep(3500, 3580, y)) * grain(x / 12, y / 12) * 2;
      if (roll < trees) b.place(0, b.rand() < 0.35 ? "oak" : "tree", x, y);
      else if (roll < trees + 0.01) b.place(0, "bush", x, y);
      else if (roll < trees + 0.014) b.place(0, "rock", x, y);
      else if (x > 3540 && roll < trees + 0.034) b.place(0, "reed", x, y);
    }
  }
}

// --- The crossing ------------------------------------------------------------------------------------

/** The bridge: planks over the Rill level with the higher of the road's two ends, railed along both sides. */
function bridge(b: WorldBuilder): void {
  const top = Math.max(b.heightAtCorner(0, BRIDGE.x0, BRIDGE.y0), b.heightAtCorner(0, BRIDGE.x1 + 1, BRIDGE.y0));
  for (let y = BRIDGE.y0; y <= BRIDGE.y1; y++) {
    for (let x = BRIDGE.x0; x <= BRIDGE.x1; x++) {
      b.setOverlay(0, x, y, OVERLAY_PATH);
      b.setUnderlay(0, x, y, UNDERLAY_DIRT);
      b.plane(0).collision.unblock(x, y);
    }
  }
  for (let cy = BRIDGE.y0; cy <= BRIDGE.y1 + 1; cy++) for (let cx = BRIDGE.x0; cx <= BRIDGE.x1 + 1; cx++) b.setHeight(0, cx, cy, Math.max(top, b.heightAtCorner(0, cx, cy)));
  for (let x = BRIDGE.x0; x <= BRIDGE.x1; x++) {
    b.place(0, "fence", x, BRIDGE.y0, { side: 2 });
    b.place(0, "fence", x, BRIDGE.y1, { side: 0 });
  }
}

/**
 * The crossing: the gate barring the bridge's west end between its two towers — barred for good (the
 * warden passes a player over the bar by hand, world.ts) — the guardhouse where Pell is kept, the warden by
 * the gate, and a signpost where the causeway starts.
 */
function crossing(b: WorldBuilder): void {
  for (let y = BRIDGE.y0; y <= BRIDGE.y1; y++) b.place(0, "gate", GATE_X, y, { side: 3, tag: "rillgate" });
  for (const box of GATE_TOWERS) tower(b, box, [{ side: 3, along: 1 }]);
  building(b, {
    box: GUARDHOUSE, doors: [GUARDHOUSE_DOOR], windows: [{ side: 2, along: 1 }, { side: 2, along: 7 }, { side: 1, along: 3 }, { side: 0, along: 4 }],
    floor: UNDERLAY_DIRT, roof: ROOF_KEEP, style: "keep",
  });
  b.place(0, "table", GUARDHOUSE.x0 + 2, GUARDHOUSE.y1 - 2);
  b.place(0, "barrel", GUARDHOUSE.x1 - 1, GUARDHOUSE.y1 - 1);
  b.place(0, "barrel", GUARDHOUSE.x1 - 2, GUARDHOUSE.y1 - 1);
  b.spawnMonster({ monster: "lamp_man", x: GUARDHOUSE.x0 + 5, y: GUARDHOUSE.y1 - 2 });
  b.spawnMonster({ monster: "rill_warden", x: WARDEN.x, y: WARDEN.y });
  b.place(0, "signpost", 3645, 3545);
}

// --- Mourn --------------------------------------------------------------------------------------------

/** The square where the causeway ends: paved in a round, the village's buildings facing it. */
function square(b: WorldBuilder): void {
  for (let y = SQUARE.y - 5; y <= SQUARE.y + 5; y++) {
    for (let x = SQUARE.x - 5; x <= SQUARE.x + 5; x++) {
      if (Math.hypot(x + 0.5 - SQUARE.x, y + 0.5 - SQUARE.y) <= 4.2) b.setOverlay(0, x, y, OVERLAY_PATH);
    }
  }
}

/**
 * Mourn (the plan map's card: a bank, one shop, and the quest lock): grass on its mound out of the fen,
 * the bank north of the square, the store east of it, the chapel south of it with its empty bell tower and
 * the graves behind, the reeve's house by the causeway, four cottages round the edges, and the Fen Hollows'
 * stair sealed at the mound's north edge. Slate roofs, all of them.
 */
function mourn(b: WorldBuilder): void {
  for (let y = MOURN.y0; y <= MOURN.y1; y++) {
    for (let x = MOURN.x0; x <= MOURN.x1; x++) {
      const edge = MOUND.r - 3 + 6 * (moundEdge(x / 7, y / 7) - 0.5);
      if (b.overlayAt(0, x, y) === 0 && Math.hypot(x + 0.5 - MOUND.x, y + 0.5 - MOUND.y) < edge) b.setUnderlay(0, x, y, UNDERLAY_GRASS);
    }
  }
  bank(b, BANK, { side: 2, along: 6 }, SLATE);
  shop(b, STORE, { side: 3, along: 3 }, "mourn_store", "mourn_storekeeper", [{ side: 3, along: 1 }, { side: 3, along: 5 }, { side: 0, along: 4 }], SLATE);
  building(b, {
    box: CHAPEL, doors: [{ side: 0, along: 5 }], windows: [{ side: 3, along: 3 }, { side: 3, along: 6 }, { side: 1, along: 3 }, { side: 1, along: 6 }],
    floor: UNDERLAY_DIRT, roof: ROOF_SLATE,
  });
  tower(b, BELL_TOWER, [{ side: 2, along: 1 }, { side: 3, along: 1 }, { side: 1, along: 1 }]);
  b.place(0, "altar", CHAPEL.x0 + 5, CHAPEL.y0 + 1);
  for (const [x, y] of GRAVES) b.place(0, "grave", x, y);
  building(b, {
    box: REEVE_HOUSE, doors: [{ side: 2, along: 4 }], windows: [{ side: 2, along: 1 }, { side: 3, along: 3 }, { side: 0, along: 4 }], floor: UNDERLAY_DIRT, roof: ROOF_SLATE,
  });
  b.place(0, "table", REEVE_HOUSE.x0 + 2, REEVE_HOUSE.y1 - 2);
  b.spawnMonster({ monster: "mourn_reeve", x: REEVE_HOUSE.x0 + 4, y: REEVE_HOUSE.y0 + 3 });
  for (const [box, door] of COTTAGES) {
    const across = ((door.side + 2) % 4) as 0 | 1 | 2 | 3;
    building(b, { box, doors: [door], windows: [{ side: across, along: 2 }], floor: UNDERLAY_DIRT, roof: ROOF_SLATE });
  }
  b.place(0, "sealed", HOLLOWS_STAIR.x, HOLLOWS_STAIR.y, { side: 2, tag: "fenhollows" });
  b.place(0, "signpost", 3850, 3550);
  for (const [monster, x, y] of [["mournfolk", 3870, 3550], ["mournfolk_woman", 3875, 3554], ["mournfolk", 3884, 3546], ["mournfolk_woman", 3862, 3549]] as const) {
    b.spawnMonster({ monster, x, y });
  }
}

// --- The fen -----------------------------------------------------------------------------------------

/** The fen: dead trees and reeds, the reeds thick at the water's edge, bushes on the drier ground, nothing on the causeway or in Mourn. */
function fen(b: WorldBuilder, seed: number): void {
  const grain = valueNoise2D(seed + 1506);
  const s = SALLOWFEN_SITE;
  const wetBeside = (x: number, y: number) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => b.overlayAt(0, x + dx!, y + dy!) === OVERLAY_WATER);
  const kept = (x: number, y: number) =>
    inBox(MOURN, x, y) || distanceWithin(x + 0.5, y + 0.5, CAUSEWAY, CAUSEWAY_BOX, 2.5) < 2.5 || distanceWithin(x + 0.5, y + 0.5, FEN_ROAD, FEN_ROAD_BOX, 2.5) < 2.5 ||
    (x >= GUARDHOUSE.x0 - 2 && x <= BRIDGE.x0 && y >= 3540 && y <= GUARDHOUSE.y1 + 2);
  for (let y = s.y0; y <= s.y1; y++) {
    for (let x = s.x0; x <= s.x1; x++) {
      if (!b.free(0, x, y) || b.overlayAt(0, x, y) !== 0 || kept(x, y)) continue;
      const roll = b.rand();
      if (wetBeside(x, y)) {
        if (roll < 0.12) b.place(0, "reed", x, y);
      } else if (underlayAt(b.plane(0), x, y) === UNDERLAY_FEN) {
        const dead = 0.024 * grain(x / 9, y / 9);
        if (roll < dead) b.place(0, "dead_tree", x, y);
        else if (roll < dead + 0.004) b.place(0, "bush", x, y);
      } else {
        const trees = 0.03 * grain(x / 12 + 20, y / 12);
        if (roll < trees) b.place(0, b.rand() < 0.3 ? "oak" : "tree", x, y);
        else if (roll < trees + 0.008) b.place(0, "bush", x, y);
      }
    }
  }
}

/**
 * The fen's walkable ground: every tile of its site that can be walked to from the road's end or the
 * bridge's far end. A creature out on an island in the pools could be neither fought nor shot, so only
 * these tiles are given one.
 */
function walkable(b: WorldBuilder): Set<number> {
  const collision = b.plane(0).collision;
  const s = SALLOWFEN_SITE;
  const key = (x: number, y: number) => y * 8192 + x;
  const seen = new Set<number>();
  const queue: Array<[number, number]> = [];
  for (const [x, y] of [[BRIDGE.x0 - 1, BRIDGE.y0 + 1], [BRIDGE.x1 + 1, BRIDGE.y0 + 1]] as const) {
    seen.add(key(x, y));
    queue.push([x, y]);
  }
  for (let head = 0; head < queue.length; head++) {
    const [x, y] = queue[head]!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx, ny = y + dy;
      if (!inBox(s, nx, ny) || seen.has(key(nx, ny)) || !collision.canStep(x, y, dx, dy)) continue;
      seen.add(key(nx, ny));
      queue.push([nx, ny]);
    }
  }
  return seen;
}

/** A herd: what, how many, round which tile, how far out. */
type Herd = readonly [monster: string, count: number, x: number, y: number, r: number];
/** The heath has boars and wolves and a highwayman on the road, and the last stretch before the Rill the lurkers the castellan wants put down. */
const ROAD_HERDS: readonly Herd[] = [
  ["wild_boar", 4, 3290, 3480, 14],
  ["grey_wolf", 4, 3400, 3560, 14],
  ["highwayman", 1, 3430, 3524, 3],
  ["rill_lurker", 4, 3560, 3530, 12],
];
/** The fen has more lurkers along the Rill, the dead off the causeway, and the hags deepest in, away from any road. */
const FEN_HERDS: readonly Herd[] = [
  ["rill_lurker", 4, 3612, 3520, 10],
  ["rill_lurker", 3, 3660, 3600, 8],
  ["fen_wight", 4, 3740, 3590, 14],
  ["fen_wight", 3, 3780, 3510, 14],
  ["bog_hag", 2, 3920, 3640, 12],
  ["bog_hag", 2, 3930, 3430, 12],
];

/** Puts each herd down on free ground round its tile, off the paths and out of Mourn, and on `ground` where that is given. */
function creatures(b: WorldBuilder, herds: readonly Herd[], ground: Set<number> | null): void {
  const taken = new Set<number>();
  for (const [monster, count, cx, cy, r] of herds) {
    for (let placed = 0, tries = 0; placed < count && tries < 300; tries++) {
      const x = Math.round(cx + (b.rand() * 2 - 1) * r), y = Math.round(cy + (b.rand() * 2 - 1) * r);
      const key = y * 8192 + x;
      if (taken.has(key) || !b.free(0, x, y) || b.overlayAt(0, x, y) === OVERLAY_PATH || inBox(MOURN, x, y) || (ground && !ground.has(key))) continue;
      taken.add(key);
      b.spawnMonster({ monster, x, y, plane: 0 });
      placed++;
    }
  }
}

/** What lies about: logs by the guardhouse, bones on the causeway, a purse dropped in the fen by whoever ran. */
function lying(b: WorldBuilder): void {
  const spawns: Array<[string, number, number, number, number]> = [
    ["logs", 2, GUARDHOUSE.x0 - 2, GUARDHOUSE.y0 + 1, 150],
    ["bones", 1, 3742, 3563, 200],
    ["coins", 25, 3700, 3557, 300],
  ];
  for (const [item, count, x, y, respawn] of spawns) {
    const at = freeNear(b, x, y);
    if (at) b.spawnItem({ item, count, x: at.x, y: at.y, respawn, plane: 0 });
  }
}

/** The tile asked for, or the nearest free land tile within five rings. */
function freeNear(b: WorldBuilder, x: number, y: number): { x: number; y: number } | null {
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

// --- What the district's tables gain from the sites ---------------------------------------------------

/** Mourn has a village tune; the crossing the water's; the fen the hard places'; the road the roads'. */
export const SALLOWFEN_AREAS: ReadonlyArray<{ area: Area; box: Box }> = [
  { area: { key: "mourn", name: "Mourn", track: TUNE.village4 }, box: MOURN },
  { area: { key: "rillcrossing", name: "The Rill crossing", track: TUNE.water }, box: boxOf(3612, 3530, 3660, 3566) },
  { area: { key: "sallowfen", name: "The Sallowfen", track: TUNE.danger }, box: SALLOWFEN_SITE },
  { area: { key: "fenroad", name: "The Fen Road", track: TUNE.roads }, box: FEN_ROAD_SITE },
];

export const SALLOWFEN_LABELS: MapLabel[] = [
  { name: "Mourn", x: 3874, y: 3582 },
  { name: "The Sallowfen", x: 3780, y: 3640 },
  { name: "The Black Rill", x: 3628, y: 3640, small: true },
  { name: "The Fen Road", x: 3400, y: 3530, small: true },
  { name: "The Rill crossing", x: 3630, y: 3538, small: true },
  { name: "The causeway", x: 3740, y: 3568, small: true },
];

export const SALLOWFEN_MARKS: Array<{ icon: MapIcon; x: number; y: number; name: string }> = [
  { icon: "gate", x: GATE_X, y: BRIDGE.y0 + 1, name: "The Rill gate (the warden passes you over)" },
  { icon: "quest", x: WARDEN.x, y: WARDEN.y, name: "The Rill warden" },
  { icon: "church", x: CHAPEL.x0 + 5, y: CHAPEL.y0 + 4, name: "Mourn chapel" },
  { icon: "quest", x: HOLLOWS_STAIR.x, y: HOLLOWS_STAIR.y, name: "The Fen Hollows (sealed)" },
];

/** Whether a tile is on either of the two sites: what an earlier site's test leaves out of its control. */
export const inFenSites = (x: number, y: number): boolean => inBox(FEN_ROAD_SITE, x, y) || inBox(SALLOWFEN_SITE, x, y);

/** Named boxes, for the tests and the map. */
export const SALLOWFEN_SITES: Record<string, Box> = { fenroad: FEN_ROAD_SITE, sallowfen: SALLOWFEN_SITE, mourn: MOURN };
