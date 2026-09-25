// Stonecote (PLAN §7.6, the first site of Wave 1): the road hamlet on the North Road, two-thirds of the
// way to Thornbury — eight buildings, a well, a bridge over the Wend, and the stair down to Stonecote
// Hollow, the first dungeon a player meets. No bank, on purpose (§5, 2026-09-22): a waypoint that banks
// is a destination; one that does not is a road. Its site is regions 49–51 × 52–53, the ground between
// the district's north edge and Thornbury's south one, so the road between them has one owner, plus the
// column east of the river (51), seeded, so the Wend has a far bank rather than a cliff into nothing.
//
// Built on the same builder as the district, after it: the ground and the river are the heartland's
// functions of world coordinates (heartland.ts), so the seam at y = 3328 is exact, and the district's
// own corners are never written (tests/stonecote.test.ts builds the district with and without this
// and compares every one of them).
import { heartlandHeight, wendRow } from "./heartland.ts";
import {
  OVERLAY_PATH, OVERLAY_WATER, REGION, regionOf, ROOF_SLATE, ROOF_THATCH, underlayAt, UNDERLAY_DIRT, UNDERLAY_FOREST,
  UNDERLAY_GRASS, UNDERLAY_ROCK, UNDERLAY_SAND,
} from "./map.ts";
import type { Area, MapIcon, MapLabel } from "./oakridge.ts";
import { valueNoise2D } from "./rng.ts";
import {
  boxOf, building, corners, distanceToPolyline, fence, inBox, road, scatter, smoothstep, STOREY, WorldBuilder,
  type Box, type Point,
} from "./worldgen.ts";

/** The site: regions 49–51 × 52–53, tiles x 3136–3327 and y 3328–3455. */
export const STONECOTE: Box = boxOf(3136, 3328, 3327, 3455);
/** The hamlet: both banks of the crossing, from the barn to the chapel. */
export const HAMLET: Box = boxOf(3146, 3390, 3192, 3455);
/** The square on the south bank, where the road widens round the well. */
export const SQUARE = { x: 3168, y: 3414 };
/** The stair down to the Hollow, in its ring of old stones past the chapel. */
export const HOLLOW_MOUTH = { x: 3148, y: 3448 };
export const HOLLOW_PLANE = -1;
/** The Hollow's near room, the passage, and the far room, on plane −1 under the hamlet's north bank. */
export const HOLLOW_ROOMS: readonly [Box, Box, Box] = [boxOf(3142, 3442, 3156, 3454), boxOf(3157, 3447, 3163, 3449), boxOf(3164, 3440, 3182, 3454)];
/** Where the chest stands, in the far room's corner. */
export const HOLLOW_CHEST = { x: 3181, y: 3441 };
/** The region the Hollow is cut into: everything else on it, on its plane, is rock. */
export const HOLLOW_REGION: Box = boxOf(regionOf(HOLLOW_MOUTH.x) * REGION, regionOf(HOLLOW_MOUTH.y) * REGION, regionOf(HOLLOW_MOUTH.x) * REGION + REGION - 1, regionOf(HOLLOW_MOUTH.y) * REGION + REGION - 1);

const INN = boxOf(3154, 3404, 3163, 3413);
const BARN = boxOf(3154, 3394, 3163, 3401);
const PEN = boxOf(3184, 3396, 3194, 3406);
const CHAPEL = boxOf(3154, 3444, 3161, 3452);
const TACKLE = boxOf(3173, 3444, 3180, 3450);
const COTTAGES: ReadonlyArray<readonly [Box, 1 | 3]> = [
  [boxOf(3173, 3408, 3179, 3414), 3],
  [boxOf(3173, 3398, 3179, 3404), 3],
  [boxOf(3156, 3436, 3162, 3442), 1],
  [boxOf(3173, 3434, 3179, 3440), 3],
];
/** The mouth's ring: five by five of ruined wall round the stair, open on the east side toward the chapel. */
const RING = boxOf(HOLLOW_MOUTH.x - 2, HOLLOW_MOUTH.y - 2, HOLLOW_MOUTH.x + 2, HOLLOW_MOUTH.y + 2);
/** The bridge deck's columns; its rows are found from where the water is. */
const BRIDGE_X = { x0: 3166, x1: 3170 };
/** The woods: the Oakenshaw's north end along the west edge, and a wood east of the river. */
const WESTWOOD = boxOf(3136, 3328, 3145, 3455);
const EASTWOOD = boxOf(3200, 3400, 3263, 3455);
/** The row the Wend's course is taken from the district's own rows up to; the bend starts above it. */
const HANDOVER = 3345;

/** Builds the site. Same order as the district: ground, water, roads, then what stands on them. */
export function buildStonecote(b: WorldBuilder, seed: number): void {
  b.clip = STONECOTE;
  const floor = terrain(b, seed);
  const line = wend(b, floor);
  const deck = bridge(b);
  roads(b, deck);
  hamlet(b);
  hollow(b, floor);
  woods(b);
  wilderness(b, seed);
  waters(b);
  creatures(b);
  lying(b);
  void line;
}

/**
 * The Wend's course from the handover row: north-west under the hamlet's bridge and out at the west edge.
 * Thornbury carries the river on from this line's last point, so the two stretches meet as one river.
 */
export function riverLine(): Point[] {
  const top = wendRow(HANDOVER).mid;
  return [
    [top, 3300], [top, HANDOVER + 1], [top - 14, 3372], [top - 36, 3396], [top - 58, 3412], [top - 76, 3423],
    [top - 96, 3426], [top - 112, 3434], [top - 128, 3446],
  ];
}

/**
 * The ground: the heartland's own height everywhere, cut by the river's valley — banks that come down
 * to the water from nine tiles out — and levelled on both banks of the crossing for the hamlet to stand
 * on. Row 3328's corners are the district's: they were written when it was built and are left exactly
 * as they are, which is what makes the seam invisible. Returns the water's level, read off the
 * district's own river at the seam, so the Wend runs on at one height.
 */
function terrain(b: WorldBuilder, seed: number): number {
  const raw = heartlandHeight(seed);
  const floor = b.heightAtCorner(0, Math.round(wendRow(3327).mid), STONECOTE.y0);
  const flat = floor + 1.2;
  const line = riverLine();
  for (let cy = STONECOTE.y0 + 1; cy <= STONECOTE.y1 + 1; cy++) {
    for (let cx = STONECOTE.x0; cx <= STONECOTE.x1 + 1; cx++) {
      let h = raw(cx, cy);
      const off = Math.max(0, distanceToPolyline(cx, cy, line) - 3.5);
      const bank = floor + 0.6 + off * 0.35;
      h += (bank - h) * smoothstep(9, 3, off) * smoothstep(STONECOTE.y0, STONECOTE.y0 + 24, cy);
      // The hamlet's two terraces, one each side of the bridge, eased out over fourteen tiles.
      const near = Math.min(Math.hypot(cx - SQUARE.x, cy - SQUARE.y), Math.hypot(cx - SQUARE.x, cy - 3440));
      h += (flat - h) * smoothstep(24, 10, near);
      b.setHeight(0, cx, cy, h);
    }
  }
  for (let y = STONECOTE.y0; y <= STONECOTE.y1; y++) for (let x = STONECOTE.x0; x <= STONECOTE.x1; x++) b.setUnderlay(0, x, y, UNDERLAY_GRASS);
  return floor;
}

/**
 * The Wend, on from the district: the district's own rows for the first stretch, then the bend that
 * carries it under the hamlet's bridge and out at the west edge, with a sand bank either side and its
 * floor at the district's water level, so the river runs on flat.
 */
function wend(b: WorldBuilder, floor: number): Point[] {
  const line = riverLine();
  const wobble = valueNoise2D(43);
  const water: Array<[number, number]> = [];
  for (let y = STONECOTE.y0; y <= STONECOTE.y1; y++) {
    for (let x = STONECOTE.x0; x <= STONECOTE.x1; x++) {
      let d: number, half: number;
      if (y <= HANDOVER) {
        const row = wendRow(y);
        d = Math.abs(x + 0.5 - row.mid);
        half = row.half;
      } else {
        d = distanceToPolyline(x + 0.5, y + 0.5, line);
        half = 3.5 + 1.2 * (wobble(x / 17, y / 17) - 0.5);
      }
      if (d <= half) {
        b.setOverlay(0, x, y, OVERLAY_WATER);
        b.plane(0).collision.block(x, y);
        water.push([x, y]);
      } else if (d <= half + 2) {
        b.setUnderlay(0, x, y, UNDERLAY_SAND);
      }
    }
  }
  // Row 3328's south corners are the district's and stay as they are; every other water corner is at the floor.
  for (const [x, y] of water) for (const [cx, cy] of corners(x, y)) if (cy > STONECOTE.y0) b.setHeight(0, cx, cy, floor);
  return line;
}

/** The bridge: a deck of planks over the water with a rail down each side, level with the higher bank. */
function bridge(b: WorldBuilder): Box {
  let y0 = Infinity, y1 = -Infinity;
  for (let x = BRIDGE_X.x0; x <= BRIDGE_X.x1; x++) {
    for (let y = HAMLET.y0; y <= HAMLET.y1; y++) {
      if (b.overlayAt(0, x, y) !== OVERLAY_WATER) continue;
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
  }
  const deck = boxOf(BRIDGE_X.x0, y0 - 1, BRIDGE_X.x1, y1 + 1);
  let high = -Infinity;
  for (const cy of [deck.y0, deck.y1 + 1]) for (let cx = deck.x0; cx <= deck.x1 + 1; cx++) high = Math.max(high, b.heightAtCorner(0, cx, cy));
  for (let y = deck.y0; y <= deck.y1; y++) {
    for (let x = deck.x0; x <= deck.x1; x++) {
      b.setOverlay(0, x, y, OVERLAY_PATH);
      b.setUnderlay(0, x, y, UNDERLAY_DIRT);
      b.plane(0).collision.unblock(x, y);
      for (const [cx, cy] of corners(x, y)) b.setHeight(0, cx, cy, high);
    }
    b.place(0, "fence", deck.x0, y, { side: 3 });
    b.place(0, "fence", deck.x1, y, { side: 1 });
  }
  return deck;
}

/**
 * The North Road, on from where the district's stretch ends at (3224, 3327): up the south bank to the
 * square, over the bridge, and out at the north edge toward Thornbury. The square is a round of open
 * path, as the green is.
 */
function roads(b: WorldBuilder, deck: Box): void {
  const south: Point[] = [[3224, 3318], [3220, 3350], [3206, 3378], [3186, 3388], [3172, 3392], [SQUARE.x, 3396], [SQUARE.x, deck.y0 - 1]];
  const north: Point[] = [[SQUARE.x, deck.y1 + 1], [3167, 3445], [3164, 3455], [3162, 3464]];
  for (const line of [south, north]) road(b, 0, line, 1.3);
  for (let y = SQUARE.y - 3; y <= SQUARE.y + 3; y++) {
    for (let x = SQUARE.x - 3; x <= SQUARE.x + 3; x++) {
      if (Math.hypot(x - SQUARE.x, y - SQUARE.y) <= 3.4) b.setOverlay(0, x, y, OVERLAY_PATH);
    }
  }
  for (let y = STONECOTE.y0; y <= STONECOTE.y1; y++) {
    for (let x = STONECOTE.x0; x <= STONECOTE.x1; x++) {
      if (b.overlayAt(0, x, y) === OVERLAY_PATH) b.setUnderlay(0, x, y, UNDERLAY_DIRT);
    }
  }
}

/**
 * The hamlet (PLAN §7.6, and the plan map's card for it): the Drover's Rest on the square with the well,
 * a barn and its pen, four cottages, and across the bridge the chapel, the tackle shop and the ring of
 * old stones round the stair down. Eight buildings, as promised, and no bank.
 */
function hamlet(b: WorldBuilder): void {
  // The Drover's Rest: two storeys of slate on the square's west side, the range through the door.
  building(b, {
    box: INN,
    doors: [{ side: 1, along: 4 }],
    windows: [{ side: 2, along: 2 }, { side: 2, along: 7 }, { side: 3, along: 5 }, { side: 0, along: 2 }],
    storeys: 2,
    stair: { x: INN.x0 + 1, y: INN.y0 + 1 },
    floor: UNDERLAY_DIRT,
    roof: ROOF_SLATE,
    sign: "tankard",
  });
  b.place(0, "range", INN.x1 - 2, INN.y1 - 1);
  b.place(0, "table", INN.x0 + 3, INN.y0 + 6);
  b.place(0, "table", INN.x0 + 5, INN.y0 + 2);
  b.place(0, "barrel", INN.x0 + 1, INN.y1 - 1);
  b.spawnMonster({ monster: "innkeeper_stonecote", x: INN.x1 - 3, y: INN.y0 + 4 });
  b.place(1, "table", INN.x0 + 4, INN.y0 + 5);
  b.place(1, "barrel", INN.x1 - 1, INN.y0 + 2);

  // The well on the square, and the signpost where the road comes in.
  b.place(0, "well", SQUARE.x - 3, SQUARE.y);
  b.place(0, "signpost", SQUARE.x + 3, SQUARE.y - 3);

  // The barn and its pen, south of the inn: the one thatched roof here, as at the farm.
  building(b, { box: BARN, doors: [{ side: 1, along: 3 }], windows: [{ side: 2, along: 4 }], floor: UNDERLAY_DIRT, roof: ROOF_THATCH });
  b.place(0, "crate", BARN.x0 + 1, BARN.y0 + 1);
  b.place(0, "crate", BARN.x0 + 2, BARN.y0 + 1);
  b.place(0, "barrel", BARN.x1 - 1, BARN.y1 - 1);
  fence(b, 0, PEN, { x: PEN.x0, y: 3401 });

  // Four cottages, two a bank, each facing the road.
  for (const [box, side] of COTTAGES) {
    building(b, { box, doors: [{ side, along: 3 }], windows: [{ side: side === 3 ? 1 : 3, along: 3 }], floor: UNDERLAY_DIRT });
  }
  b.spawnMonster({ monster: "cotter", x: 3176, y: 3416 });
  b.spawnMonster({ monster: "cotter_woman", x: 3165, y: 3437 });
  b.spawnMonster({ monster: "cotter", x: 3183, y: 3440 });

  // Over the bridge: the chapel and its few graves, and the tackle shop across the road from it.
  building(b, {
    box: CHAPEL,
    doors: [{ side: 2, along: 4 }],
    windows: [{ side: 3, along: 2 }, { side: 3, along: 6 }, { side: 1, along: 2 }, { side: 1, along: 6 }],
    floor: UNDERLAY_DIRT,
    roof: ROOF_SLATE,
  });
  b.place(0, "altar", CHAPEL.x0 + 4, CHAPEL.y1 - 1);
  for (const [x, y] of [[3162, 3446], [3163, 3448], [3162, 3450]] as const) b.place(0, "grave", x, y);
  building(b, { box: TACKLE, doors: [{ side: 3, along: 3 }], windows: [{ side: 2, along: 2 }, { side: 2, along: 5 }], floor: UNDERLAY_DIRT, sign: "fish" });
  for (let x = TACKLE.x0 + 2; x <= TACKLE.x1 - 2; x++) b.place(0, "counter", x, TACKLE.y1 - 1, { tag: "stonecote_tackle" });
  b.spawnMonster({ monster: "tackle_keeper", x: TACKLE.x0 + 4, y: TACKLE.y1 - 2 });

  // The mouth of the Hollow: a stair in the ground, in a ring of old stones open toward the chapel.
  for (let x = RING.x0; x <= RING.x1; x++) {
    b.place(0, "stone_wall", x, RING.y0, { side: 2, tag: "ruin" });
    b.place(0, "stone_wall", x, RING.y1, { side: 0, tag: "ruin" });
  }
  for (let y = RING.y0; y <= RING.y1; y++) {
    b.place(0, "stone_wall", RING.x0, y, { side: 3, tag: "ruin" });
    if (y !== HOLLOW_MOUTH.y) b.place(0, "stone_wall", RING.x1, y, { side: 1, tag: "ruin" });
  }
  b.place(0, "stairs", HOLLOW_MOUTH.x, HOLLOW_MOUTH.y, { to: HOLLOW_PLANE });
  b.place(0, "signpost", RING.x1 + 2, RING.y1 + 1);
}

/**
 * Stonecote Hollow (PLAN §8.5): two rooms and a passage cut into the rock under the hamlet's north bank,
 * on plane −1. Rats and bats by the stair; the far room is a wolves' den, with the coal seam the cotters
 * daren't work and the chest that is the reason to go. Everything else on the region is rock — dark,
 * blocked, and drawn as the black beyond the rooms' walls. The first dungeon, small on purpose.
 */
function hollow(b: WorldBuilder, floor: number): void {
  const plane = HOLLOW_PLANE;
  const map = b.plane(plane);
  const level = floor - 2 * STOREY;
  const inRoom = (x: number, y: number) => HOLLOW_ROOMS.some((r) => inBox(r, x, y));
  for (let cy = HOLLOW_REGION.y0; cy <= HOLLOW_REGION.y1 + 1; cy++) {
    for (let cx = HOLLOW_REGION.x0; cx <= HOLLOW_REGION.x1 + 1; cx++) b.setHeight(plane, cx, cy, level);
  }
  for (let y = HOLLOW_REGION.y0; y <= HOLLOW_REGION.y1; y++) {
    for (let x = HOLLOW_REGION.x0; x <= HOLLOW_REGION.x1; x++) {
      if (inRoom(x, y)) {
        b.setUnderlay(plane, x, y, UNDERLAY_DIRT);
        continue;
      }
      b.setUnderlay(plane, x, y, UNDERLAY_ROCK);
      map.collision.block(x, y);
    }
  }
  // The rock face round each room, open only where the passage joins them.
  const [near, passage, far] = HOLLOW_ROOMS;
  const joins = (y: number) => y >= passage.y0 && y <= passage.y1;
  caveWalls(b, near, (_x, y, side) => side === 1 && joins(y));
  caveWalls(b, far, (_x, y, side) => side === 3 && joins(y));
  for (let x = passage.x0; x <= passage.x1; x++) {
    b.place(plane, "stone_wall", x, passage.y0, { side: 2, tag: "cave" });
    b.place(plane, "stone_wall", x, passage.y1, { side: 0, tag: "cave" });
  }
  // The stair back up, on the tile the one above comes down to.
  b.place(plane, "stairs", HOLLOW_MOUTH.x, HOLLOW_MOUTH.y, { to: 0 });
  // The seam along the far room's north wall, the chest in its corner, and fallen rock about.
  for (const x of [3167, 3171, 3175, 3179]) b.place(plane, "coal_rock", x, far.y1);
  b.place(plane, "chest", HOLLOW_CHEST.x, HOLLOW_CHEST.y, { tag: "hollow" });
  scatter(b, plane, "rock", { x: 3173, y: 3446, r: 6 }, 3);
  scatter(b, plane, "rock", { x: 3150, y: 3446, r: 4 }, 2, (x, y) => Math.hypot(x - HOLLOW_MOUTH.x, y - HOLLOW_MOUTH.y) > 1.5);
}

/** Cave wall round a room: on every edge of its border tiles, except where `open` says the room joins something. */
function caveWalls(b: WorldBuilder, box: Box, open: (x: number, y: number, side: 0 | 1 | 2 | 3) => boolean): void {
  for (let x = box.x0; x <= box.x1; x++) {
    if (!open(x, box.y0, 2)) b.place(HOLLOW_PLANE, "stone_wall", x, box.y0, { side: 2, tag: "cave" });
    if (!open(x, box.y1, 0)) b.place(HOLLOW_PLANE, "stone_wall", x, box.y1, { side: 0, tag: "cave" });
  }
  for (let y = box.y0; y <= box.y1; y++) {
    if (!open(box.x0, y, 3)) b.place(HOLLOW_PLANE, "stone_wall", box.x0, y, { side: 3, tag: "cave" });
    if (!open(box.x1, y, 1)) b.place(HOLLOW_PLANE, "stone_wall", box.x1, y, { side: 1, tag: "cave" });
  }
}

/** The woods: thick along the west edge, where the Oakenshaw runs on north; thinner east of the river. */
function woods(b: WorldBuilder): void {
  const grain = valueNoise2D(212);
  for (const [box, density, oaks] of [[WESTWOOD, 0.34, 0.3], [EASTWOOD, 0.16, 0.2]] as const) {
    for (let y = box.y0; y <= box.y1; y++) {
      for (let x = box.x0; x <= box.x1; x++) {
        if (!b.free(0, x, y) || b.overlayAt(0, x, y) !== 0 || underlayAt(b.plane(0), x, y) !== UNDERLAY_GRASS) continue;
        if (Math.hypot(x - HOLLOW_MOUTH.x, y - HOLLOW_MOUTH.y) < 5) continue;
        b.setUnderlay(0, x, y, UNDERLAY_FOREST);
        if (b.rand() >= density * (0.5 + 0.5 * grain(x / 7, y / 7))) continue;
        b.place(0, b.rand() < oaks ? "oak" : "tree", x, y);
      }
    }
  }
}

/** The ground nobody authored: a scatter of trees, bushes and rocks, so no corner of the site is bare. */
function wilderness(b: WorldBuilder, seed: number): void {
  const grain = valueNoise2D(seed + 505);
  for (let y = STONECOTE.y0; y <= STONECOTE.y1; y++) {
    for (let x = STONECOTE.x0; x <= STONECOTE.x1; x++) {
      if (!b.free(0, x, y) || b.overlayAt(0, x, y) !== 0 || underlayAt(b.plane(0), x, y) !== UNDERLAY_GRASS) continue;
      if (inBox(HAMLET, x, y) || inBox(PEN, x, y)) continue;
      const trees = 0.05 * grain(x / 11, y / 11);
      const roll = b.rand();
      if (roll < trees) b.place(0, "tree", x, y);
      else if (roll < trees + 0.008) b.place(0, "bush", x, y);
      else if (roll < trees + 0.011) b.place(0, "rock", x, y);
    }
  }
}

/** The redfin water (PLAN §8.4, Fishing 22, a rod and bait): the Wend downstream of the bridge. */
function waters(b: WorldBuilder): void {
  const hasBank = (x: number, y: number): boolean =>
    ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const).some(([dx, dy]) => b.free(0, x + dx, y + dy));
  const tiles: Array<{ x: number; y: number }> = [];
  for (let y = 3396; y <= 3430; y++) {
    for (let x = 3172; x <= 3215; x++) {
      if (b.overlayAt(0, x, y) !== OVERLAY_WATER) continue;
      if ((x * 3 + y * 5) % 7 !== 0) continue;
      if (hasBank(x, y)) tiles.push({ x, y });
    }
  }
  if (tiles.length > 0) b.addWater({ tiles: tiles.slice(0, 8), count: Math.min(3, tiles.length), method: "angle" });
}

/**
 * Who lives here. The road stays safe (§7.7's third rule: the one highwayman works the Emberway);
 * off it, the west wood has wolves and spiders and the east wood boars, the pen has cows, and the
 * Hollow has what the innkeeper says it has.
 */
function creatures(b: WorldBuilder): void {
  const herds: Array<[string, number, number, number, number, number]> = [
    ["cow", 4, 3189, 3401, 4, 0],
    ["hen", 3, 3160, 3389, 3, 0],
    ["field_rat", 3, 3190, 3390, 3, 0],
    ["mallard", 3, 3200, 3408, 5, 0],
    ["giant_rat", 3, 3143, 3453, 2, 0],
    ["thicket_spider", 4, 3141, 3340, 5, 0],
    ["grey_wolf", 4, 3141, 3380, 5, 0],
    ["wild_boar", 4, 3226, 3432, 8, 0],
    ["giant_rat", 5, 3149, 3448, 6, HOLLOW_PLANE],
    ["cave_bat", 3, 3152, 3446, 4, HOLLOW_PLANE],
    ["grey_wolf", 4, 3172, 3447, 6, HOLLOW_PLANE],
  ];
  const taken = new Set<number>();
  for (const [monster, count, cx, cy, r, plane] of herds) {
    for (let placed = 0, tries = 0; placed < count && tries < 200; tries++) {
      const x = Math.round(cx + (b.rand() * 2 - 1) * r), y = Math.round(cy + (b.rand() * 2 - 1) * r);
      const key = plane * 1e8 + y * 4096 + x;
      if (taken.has(key) || !b.free(plane, x, y)) continue;
      taken.add(key);
      b.spawnMonster({ monster, x, y, plane });
      placed++;
    }
  }
}

/** What lies about: bait by the water for whoever brought the rod and not the tin, and a little else. */
function lying(b: WorldBuilder): void {
  const spawns: Array<[string, number, number, number, number, number]> = [
    ["bait", 10, 3184, 3418, 200, 0],
    ["logs", 1, 3165, 3392, 100, 0],
    ["bread", 1, 3170, 3438, 100, 0],
    ["coins", 12, 3150, 3451, 300, HOLLOW_PLANE],
    ["bones", 1, 3170, 3452, 200, HOLLOW_PLANE],
  ];
  for (const [item, count, x, y, respawn, plane] of spawns) {
    const at = freeNear(b, plane, x, y);
    if (at) b.spawnItem({ item, count, x: at.x, y: at.y, respawn, plane });
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

// --- What the district's tables gain from the site ----------------------------------------------

/** The hamlet has the village's tune; the road between the settlements has it too. The Hollow's is the third. */
export const STONECOTE_AREAS: ReadonlyArray<{ area: Area; box: Box }> = [
  { area: { key: "stonecote", name: "Stonecote", track: 0 }, box: HAMLET },
  { area: { key: "northroad", name: "The North Road", track: 0 }, box: STONECOTE },
];
export const HOLLOW_AREA: Area = { key: "hollow", name: "Stonecote Hollow", track: 2 };

export const STONECOTE_LABELS: MapLabel[] = [
  { name: "Stonecote", x: 3168, y: 3402 },
  { name: "The Wend", x: 3238, y: 3376, small: true },
  { name: "The Drover's Rest", x: 3158, y: 3409, small: true },
  { name: "Stonecote Hollow", x: 3148, y: 3454, small: true },
];

export const STONECOTE_MARKS: Array<{ icon: MapIcon; x: number; y: number; name: string }> = [
  { icon: "inn", x: 3158, y: 3408, name: "The Drover's Rest" },
  { icon: "church", x: 3157, y: 3448, name: "Chapel" },
  { icon: "fish", x: 3192, y: 3414, name: "The Wend" },
];

/** Named boxes, for the tests and the map. */
export const STONECOTE_SITES: Record<string, Box> = { stonecote: STONECOTE, hamlet: HAMLET, hollow_region: HOLLOW_REGION };
