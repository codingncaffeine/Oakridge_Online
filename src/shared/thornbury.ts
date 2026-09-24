// Thornbury (PLAN §7.6, the second site of Wave 1): the capital, two regions by two of walled city at the
// top of the North Road — the market square with its two banks and the full shop row, the castle at the
// head of it, four gates with a road out of each, and the sewers on two planes under the streets, with
// the silver seam and the way out under the walls (§8.5). Thornbury sells (§7.7's fourth rule): what
// Oakridge cannot, a player walks here for.
//
// Its site is regions 48–49 × 54–55 and, so the Wend has somewhere to go when it leaves Stonecote's west
// edge, the region west of the hamlet (48 × 53) as well: the river's bend, open country. Built on the
// same builder as the district and Stonecote, after them, so every id and every roll of theirs stands;
// the seam corners they own are never written, and the ground beside them is stitched to their values
// (tests/thornbury.test.ts builds the world with and without this and compares every one of them).
import {
  OVERLAY_PATH, OVERLAY_WATER, ROOF_CLAY, ROOF_KEEP, ROOF_SLATE, underlayAt, UNDERLAY_DIRT, UNDERLAY_FOREST, UNDERLAY_GRASS,
  UNDERLAY_ROCK, UNDERLAY_SAND,
} from "./map.ts";
import type { Area, MapExit, MapIcon, MapLabel } from "./oakridge.ts";
import { valueNoise2D } from "./rng.ts";
import { riverLine as stonecoteRiver } from "./stonecote.ts";
import {
  bank, boxOf, building, corners, distanceToPolyline, fence, inBox, road, shop, smoothstep, STOREY, tower, WorldBuilder,
  type Box, type DoorSpec, type Point,
} from "./worldgen.ts";
import { heartlandHeight } from "./heartland.ts";

/** The city's site: regions 48–49 × 54–55, tiles x 3072–3199 and y 3456–3583. */
export const THORNBURY: Box = boxOf(3072, 3456, 3199, 3583);
/** The Wend's bend, region 48 × 53: the ground west of Stonecote the river crosses to get here. */
export const BEND: Box = boxOf(3072, 3392, 3135, 3455);
/** The city wall, on the outer edges of this box's border tiles. */
export const WALLS: Box = boxOf(3112, 3480, 3191, 3567);
/** The market square, paved end to end, with the well at its middle. */
export const SQUARE: Box = boxOf(3141, 3510, 3161, 3530);
export const WELL = { x: 3151, y: 3520 };
/** The castle: its curtain wall on this box, backed onto the city's north wall, and the keep inside it. */
export const CASTLE: Box = boxOf(3131, 3540, 3171, 3567);
export const KEEP: Box = boxOf(3141, 3550, 3161, 3564);
/** Where a road crosses the wall: the gap in it, four tiles wide, with a tower either side. */
const GATES = {
  south: boxOf(3149, 3480, 3152, 3480),
  west: boxOf(3112, 3518, 3112, 3521),
  east: boxOf(3191, 3518, 3191, 3521),
  north: boxOf(3124, 3567, 3127, 3567),
  castle: boxOf(3149, 3540, 3152, 3540),
};

/** The sewers (§8.5): the trapdoor in a railed yard off the South Lane, the outfall on the Wend outside the walls. */
export const SEWER_MOUTH = { x: 3178, y: 3488 };
export const OUTFALL = { x: 3100, y: 3474 };
/** The ladder from the sewers down to the old works under them. */
export const DEEP_STAIR = { x: 3149, y: 3512 };
export const SEWER_PLANE = -1;
export const DEEP_PLANE = -2;
/** The sewers' rooms and passages on plane −1: the yard's shaft, the main drain west to the outfall, the cistern under the square. */
export const SEWER_ROOMS: readonly Box[] = [
  boxOf(3172, 3484, 3184, 3494), // the shaft room under the yard
  boxOf(3111, 3488, 3171, 3490), // the main drain
  boxOf(3140, 3482, 3156, 3496), // the cistern
  boxOf(3108, 3479, 3110, 3490), // the turn down to the outfall
  boxOf(3096, 3466, 3110, 3478), // the outfall chamber
  boxOf(3147, 3497, 3149, 3506), // the passage north from the cistern
  boxOf(3142, 3507, 3156, 3517), // the well room, where the ladder goes down
];
/** The old works on plane −2: the landing, a passage east, and the silver chamber. */
export const DEEP_ROOMS: readonly Box[] = [
  boxOf(3140, 3505, 3160, 3519),
  boxOf(3161, 3510, 3175, 3512),
  boxOf(3176, 3500, 3190, 3518),
];
export const SEWER_CHEST = { x: 3189, y: 3517 };
/** The regions the sewers are cut into: everything else on them, on those planes, is rock. */
export const SEWER_BOX: Box = boxOf(3072, 3456, 3199, 3519);
export const DEEP_BOX: Box = boxOf(3136, 3456, 3199, 3519);

// --- The buildings, as PLAN §7.6's card and the plan map's have them --------------------------------

const WEST_BANK = boxOf(3116, 3523, 3123, 3531);
const EAST_BANK = boxOf(3166, 3523, 3177, 3531);
const WEAPONS = boxOf(3129, 3523, 3139, 3530);
const ARMOUR = boxOf(3116, 3510, 3123, 3517);
const ARCHERY = boxOf(3129, 3510, 3139, 3517);
const GENERAL = boxOf(3182, 3523, 3187, 3530);
const SMITHY = boxOf(3166, 3510, 3177, 3517);
const INN = boxOf(3181, 3507, 3187, 3517);
const APOTHECARY = boxOf(3140, 3499, 3148, 3506);
const STAFFS = boxOf(3140, 3486, 3148, 3493);
const GUARDHOUSE = boxOf(3143, 3531, 3149, 3536);
const GOLDSMITH = boxOf(3153, 3531, 3159, 3536);
const CHURCH = boxOf(3160, 3483, 3170, 3492);
const YARD = boxOf(3176, 3486, 3180, 3490);
const FIELDS = boxOf(3118, 3462, 3146, 3470);
const PASTURE = boxOf(3170, 3460, 3186, 3474);
/** The houses: their footprint and which way the door faces, each onto a lane. */
const HOUSES: ReadonlyArray<readonly [Box, 0 | 1 | 2 | 3]> = [
  // The south-west quarter, either side of the South Lane.
  [boxOf(3116, 3487, 3122, 3493), 0], [boxOf(3125, 3487, 3131, 3493), 0], [boxOf(3134, 3487, 3138, 3493), 0],
  [boxOf(3116, 3499, 3122, 3505), 2], [boxOf(3125, 3499, 3131, 3505), 2], [boxOf(3134, 3499, 3138, 3505), 2],
  // The south-east quarter.
  [boxOf(3154, 3499, 3160, 3504), 2], [boxOf(3163, 3499, 3169, 3504), 2], [boxOf(3172, 3499, 3178, 3504), 2], [boxOf(3181, 3499, 3187, 3504), 2],
  [boxOf(3183, 3486, 3188, 3492), 0],
  // The north-west quarter, along Ditch Lane.
  [boxOf(3116, 3541, 3122, 3547), 1], [boxOf(3116, 3550, 3122, 3556), 1], [boxOf(3116, 3558, 3122, 3563), 1],
  // The north-east quarter, either side of Castle Lane.
  [boxOf(3173, 3541, 3177, 3547), 1], [boxOf(3173, 3550, 3177, 3556), 1], [boxOf(3173, 3559, 3177, 3565), 1],
  [boxOf(3182, 3541, 3188, 3547), 3], [boxOf(3182, 3550, 3188, 3556), 3], [boxOf(3182, 3559, 3188, 3565), 3],
];

/** The streets, each a polyline the road tool lays two tiles wide. */
const MAIN_STREET: Point[] = [[3151, 3479], [3151, 3511]];
const HIGH_STREET: Point[] = [[3113, 3520], [3190, 3520]];
const KINGS_WAY: Point[] = [[3151, 3529], [3151, 3541]];
const SOUTH_LANE: Point[] = [[3113, 3496], [3190, 3496]];
const NORTH_LANE: Point[] = [[3113, 3538], [3190, 3538]];
const DITCH_LANE: Point[] = [[3126, 3521], [3126, 3568]];
const CASTLE_LANE: Point[] = [[3180, 3521], [3180, 3566]];
/** The roads out, from each gate to the edge of the site, and the North Road in from Stonecote's edge. */
const NORTH_ROAD: Point[] = [[3164, 3452], [3162, 3462], [3156, 3472], [3151, 3478], [3151, 3482]];
const KINGSWAY: Point[] = [[3111, 3520], [3096, 3522], [3082, 3524], [3071, 3524]];
const FEN_ROAD: Point[] = [[3192, 3520], [3200, 3521]];
const DITCH_ROAD: Point[] = [[3126, 3566], [3125, 3576], [3122, 3584]];

/** Builds the site. The same order as every site: ground, water, roads, then what stands on them. */
export function buildThornbury(b: WorldBuilder, seed: number): void {
  // The bend first, on its own clip, then the city's two regions on theirs: a builder without a clip spills.
  b.clip = BEND;
  const floor = terrain(b, seed, BEND);
  wend(b, floor, BEND);
  outside(b, seed, BEND);
  b.clip = THORNBURY;
  terrain(b, seed, THORNBURY);
  wend(b, floor, THORNBURY);
  roads(b);
  walls(b);
  castle(b);
  city(b);
  sewers(b);
  outside(b, seed, THORNBURY);
  creatures(b);
  lying(b);
}

// --- Ground ------------------------------------------------------------------------------------------

/** Whether a corner is this site's to write: Stonecote's column 3136 and its row 3456 east of it are not. */
const ours = (cx: number, cy: number): boolean => cx < 3136 || cy > 3456;

/** The Wend's course: Stonecote's own line to its last point, then west across the bend and out under the city's south-west corner. */
function riverLine(): Point[] {
  const theirs = stonecoteRiver();
  return [...theirs.slice(-2), [3117, 3456], [3104, 3463], [3090, 3470], [3078, 3475], [3068, 3479]];
}

/**
 * The ground: the heartland's own height, cut by the river's valley as Stonecote cuts it, levelled under
 * the city and eased out from its walls, and stitched to the corners Stonecote wrote — its column at
 * x 3136 beside the bend, its row at y 3456 under the city — so the seam has no step in it. Returns the
 * water's level, read off Stonecote's river where it leaves the hamlet, so the Wend runs on flat.
 */
function terrain(b: WorldBuilder, seed: number, box: Box): number {
  const raw = heartlandHeight(seed);
  const floor = riverFloor(b);
  const line = riverLine();
  const flat = raw(WELL.x, WELL.y);
  for (let cy = box.y0; cy <= box.y1 + 1; cy++) {
    for (let cx = box.x0; cx <= box.x1 + 1; cx++) {
      if (!ours(cx, cy)) continue;
      let h = raw(cx, cy);
      const off = Math.max(0, distanceToPolyline(cx, cy, line) - 3.5);
      const bank = floor + 0.6 + off * 0.35;
      h += (bank - h) * smoothstep(9, 3, off);
      // The city stands on one level, three tiles past its walls, easing back to the land over twenty more.
      const out = Math.max(WALLS.x0 - 3 - cx, cx - (WALLS.x1 + 4), WALLS.y0 - 3 - cy, cy - (WALLS.y1 + 4), 0);
      h += (flat - h) * smoothstep(22, 0, out);
      // The stitches: Stonecote's column and row, joined over eight tiles, exactly at the seam.
      if (cy <= 3456 && cx >= 3128) h += (b.heightAtCorner(0, 3136, cy) - h) * smoothstep(3127, 3135, cx);
      if (cx >= 3136 && cy <= 3465) h += (b.heightAtCorner(0, cx, 3456) - h) * smoothstep(3465, 3457, cy);
      b.setHeight(0, cx, cy, h);
    }
  }
  for (let y = box.y0; y <= box.y1; y++) for (let x = box.x0; x <= box.x1; x++) b.setUnderlay(0, x, y, UNDERLAY_GRASS);
  return floor;
}

/** The river's level: Stonecote's water corner where the Wend crosses its west edge. */
function riverFloor(b: WorldBuilder): number {
  for (let y = BEND.y1; y >= BEND.y0; y--) {
    if (b.overlayAt(0, 3136, y) === OVERLAY_WATER) return b.heightAtCorner(0, 3136, y);
  }
  throw new Error("Thornbury is built against Stonecote, and the Wend does not reach its west edge");
}

/** The Wend across the bend and past the city, with a sand bank either side and its floor at Stonecote's level. */
function wend(b: WorldBuilder, floor: number, box: Box): void {
  const line = riverLine();
  const wobble = valueNoise2D(43);
  const water: Array<[number, number]> = [];
  for (let y = box.y0; y <= box.y1; y++) {
    for (let x = box.x0; x <= box.x1; x++) {
      const d = distanceToPolyline(x + 0.5, y + 0.5, line);
      const half = 3.5 + 1.2 * (wobble(x / 17, y / 17) - 0.5);
      if (d <= half) {
        b.setOverlay(0, x, y, OVERLAY_WATER);
        b.plane(0).collision.block(x, y);
        water.push([x, y]);
      } else if (d <= half + 2) {
        b.setUnderlay(0, x, y, UNDERLAY_SAND);
      }
    }
  }
  for (const [x, y] of water) for (const [cx, cy] of corners(x, y)) if (ours(cx, cy)) b.setHeight(0, cx, cy, floor);
}

// --- Streets and walls --------------------------------------------------------------------------------

/** Every street and lane, the square, the courtyard's path, and the roads out; dirt under all of it. */
function roads(b: WorldBuilder): void {
  for (const line of [NORTH_ROAD, KINGSWAY, FEN_ROAD, DITCH_ROAD, MAIN_STREET, HIGH_STREET, KINGS_WAY]) road(b, 0, line, 1.3);
  for (const line of [SOUTH_LANE, NORTH_LANE, DITCH_LANE, CASTLE_LANE]) road(b, 0, line, 1.3);
  road(b, 0, [[3151, 3539], [3151, 3551]], 1.3);
  for (let y = SQUARE.y0; y <= SQUARE.y1; y++) for (let x = SQUARE.x0; x <= SQUARE.x1; x++) b.setOverlay(0, x, y, OVERLAY_PATH);
  for (let y = THORNBURY.y0; y <= THORNBURY.y1; y++) {
    for (let x = THORNBURY.x0; x <= THORNBURY.x1; x++) {
      if (b.overlayAt(0, x, y) === OVERLAY_PATH) b.setUnderlay(0, x, y, UNDERLAY_DIRT);
    }
  }
}

/** A run of crenellated wall along a box's outer edges, leaving out the tiles a tower or a gate takes. */
function curtain(b: WorldBuilder, box: Box, skip: readonly Box[]): void {
  const skipped = (x: number, y: number) => skip.some((s) => inBox(s, x, y));
  for (let x = box.x0; x <= box.x1; x++) {
    if (!skipped(x, box.y0)) b.place(0, "stone_wall", x, box.y0, { side: 2 });
    if (!skipped(x, box.y1)) b.place(0, "stone_wall", x, box.y1, { side: 0 });
  }
  for (let y = box.y0; y <= box.y1; y++) {
    if (!skipped(box.x0, y)) b.place(0, "stone_wall", box.x0, y, { side: 3 });
    if (!skipped(box.x1, y)) b.place(0, "stone_wall", box.x1, y, { side: 1 });
  }
}

/** A three-by-three tower with an arrow slit in the middle of each side asked for. */
const slits = (...sides: Array<0 | 1 | 2 | 3>): DoorSpec[] => sides.map((side) => ({ side, along: 1 }));

/**
 * The city wall: a tower on each corner, a gatehouse — a tower either side of a four-tile gap — where
 * each of the four roads comes through, and the crenellated wall between. The gates stand open: a
 * capital's gates are how the roads get in, not a thing to click.
 */
function walls(b: WorldBuilder): void {
  const cornersOf: Array<[Box, DoorSpec[]]> = [
    [boxOf(3112, 3480, 3114, 3482), slits(2, 3)], [boxOf(3189, 3480, 3191, 3482), slits(2, 1)],
    [boxOf(3112, 3565, 3114, 3567), slits(0, 3)], [boxOf(3189, 3565, 3191, 3567), slits(0, 1)],
  ];
  const gatehouses: Array<[Box, DoorSpec[]]> = [
    [boxOf(3146, 3480, 3148, 3482), slits(2, 1)], [boxOf(3153, 3480, 3155, 3482), slits(2, 3)],
    [boxOf(3112, 3515, 3114, 3517), slits(3, 0)], [boxOf(3112, 3522, 3114, 3524), slits(3, 2)],
    [boxOf(3189, 3515, 3191, 3517), slits(1, 0)], [boxOf(3189, 3522, 3191, 3524), slits(1, 2)],
    [boxOf(3121, 3565, 3123, 3567), slits(0, 1)], [boxOf(3128, 3565, 3130, 3567), slits(0, 3)],
  ];
  const castleNorth = [boxOf(3131, 3565, 3133, 3567), boxOf(3169, 3565, 3171, 3567)];
  const towers = [...cornersOf, ...gatehouses];
  curtain(b, WALLS, [...towers.map(([box]) => box), ...castleNorth, GATES.south, GATES.west, GATES.east, GATES.north]);
  for (const [box, windows] of towers) tower(b, box, windows);
}

/**
 * The castle (§7.6): a curtain wall backed onto the city's north wall, towers on its corners and either
 * side of its gate, and inside it the keep — two storeys of arrow-slit stone under a flat roof, a turret
 * standing a storey proud of each corner, the hall on the ground floor and the castellan in it.
 */
function castle(b: WorldBuilder): void {
  const towers: Array<[Box, DoorSpec[]]> = [
    [boxOf(3131, 3540, 3133, 3542), slits(2, 3)], [boxOf(3169, 3540, 3171, 3542), slits(2, 1)],
    [boxOf(3131, 3565, 3133, 3567), slits(0, 3)], [boxOf(3169, 3565, 3171, 3567), slits(0, 1)],
    [boxOf(3146, 3540, 3148, 3542), slits(2, 1)], [boxOf(3153, 3540, 3155, 3542), slits(2, 3)],
  ];
  // The north side is the city wall's, already standing.
  curtain(b, CASTLE, [...towers.map(([box]) => box), GATES.castle, boxOf(CASTLE.x0, CASTLE.y1, CASTLE.x1, CASTLE.y1)]);
  for (const [box, windows] of towers) tower(b, box, windows);
  for (let y = CASTLE.y0 + 1; y < KEEP.y0; y++) for (let x = CASTLE.x0 + 1; x < CASTLE.x1; x++) if (b.overlayAt(0, x, y) !== OVERLAY_PATH) b.setUnderlay(0, x, y, UNDERLAY_DIRT);

  building(b, {
    box: KEEP,
    doors: [{ side: 2, along: 10 }],
    windows: [
      { side: 2, along: 3 }, { side: 2, along: 17 }, { side: 0, along: 5 }, { side: 0, along: 10 }, { side: 0, along: 15 },
      { side: 3, along: 4 }, { side: 3, along: 10 }, { side: 1, along: 4 }, { side: 1, along: 10 },
    ],
    storeys: 2,
    stair: { x: KEEP.x0 + 1, y: KEEP.y1 - 1 },
    floor: UNDERLAY_DIRT,
    roof: ROOF_KEEP,
    style: "keep",
  });
  for (const [x, y] of [[KEEP.x0 - 2, KEEP.y0 - 2], [KEEP.x1, KEEP.y0 - 2], [KEEP.x0 - 2, KEEP.y1], [KEEP.x1, KEEP.y1]] as const) {
    building(b, { box: boxOf(x, y, x + 2, y + 2), doors: [], windows: [], floor: UNDERLAY_DIRT, height: 3, roof: ROOF_KEEP, style: "keep" });
  }
  // The hall: the long table, and the castellan at the head of it with his guard.
  for (let x = KEEP.x0 + 6; x <= KEEP.x1 - 6; x += 2) b.place(0, "table", x, KEEP.y0 + 7);
  for (const [x, y] of [[KEEP.x0 + 3, KEEP.y1 - 1], [KEEP.x1 - 1, KEEP.y1 - 1], [KEEP.x1 - 1, KEEP.y0 + 1]] as const) b.place(0, "barrel", x, y);
  b.spawnMonster({ monster: "castellan", x: KEEP.x0 + 10, y: KEEP.y1 - 2 });
  b.spawnMonster({ monster: "city_guard", x: KEEP.x0 + 3, y: KEEP.y0 + 3 });
  b.spawnMonster({ monster: "city_guard", x: KEEP.x1 - 3, y: KEEP.y0 + 3 });
  // Upstairs: the solar, tables and little else.
  for (const [x, y] of [[KEEP.x0 + 5, KEEP.y0 + 4], [KEEP.x1 - 5, KEEP.y0 + 4], [KEEP.x0 + 10, KEEP.y1 - 3]] as const) b.place(1, "table", x, y);
  b.place(1, "barrel", KEEP.x1 - 2, KEEP.y1 - 1);
  // The courtyard: the castle's well, stores against the wall, and the guard.
  b.place(0, "well", CASTLE.x0 + 6, CASTLE.y0 + 5);
  for (const [x, y] of [[CASTLE.x1 - 2, CASTLE.y0 + 2], [CASTLE.x1 - 3, CASTLE.y0 + 2], [CASTLE.x1 - 2, CASTLE.y0 + 4]] as const) b.place(0, "crate", x, y);
  for (const [x, y] of [[CASTLE.x0 + 2, CASTLE.y0 + 2], [CASTLE.x0 + 2, CASTLE.y0 + 3]] as const) b.place(0, "barrel", x, y);
  b.spawnMonster({ monster: "city_guard", x: 3148, y: 3544 });
  b.spawnMonster({ monster: "city_guard", x: 3155, y: 3544 });
  b.spawnMonster({ monster: "city_guard", x: 3163, y: 3547 });
}

// --- The city ----------------------------------------------------------------------------------------

/**
 * The city inside the walls (PLAN §7.6's card): two banks and the general store on the High Street,
 * the weapon, armour and archery shops, the goldsmith by the castle, the smithy, the Blackthorn with
 * its range, the church, twenty houses along the lanes, the square with its well and market stalls —
 * and the staff shop and the apothecary as buildings with keepers who say what they will sell once
 * there is magic and there are potions (Phase 11 and a later skill), as the miller says of flour.
 */
function city(b: WorldBuilder): void {
  bank(b, WEST_BANK, { side: 2, along: 3 });
  bank(b, EAST_BANK, { side: 2, along: 5 });
  shop(b, GENERAL, { side: 2, along: 2 }, "thornbury_general", "shopkeeper_thornbury", [{ side: 1, along: 3 }]);
  shop(b, WEAPONS, { side: 2, along: 5 }, "thornbury_weapons", "weaponsmith", [{ side: 2, along: 1 }, { side: 2, along: 9 }]);
  shop(b, ARMOUR, { side: 0, along: 3 }, "thornbury_armour", "armourer", [{ side: 0, along: 6 }]);
  shop(b, ARCHERY, { side: 0, along: 5 }, "thornbury_archery", "fletcher", [{ side: 0, along: 1 }, { side: 0, along: 9 }]);
  shop(b, GOLDSMITH, { side: 3, along: 2 }, "thornbury_goldsmith", "goldsmith", [{ side: 3, along: 4 }]);

  // The smithy: two furnaces, two anvils, and the smith between them.
  building(b, { box: SMITHY, doors: [{ side: 0, along: 5 }], windows: [{ side: 0, along: 1 }, { side: 0, along: 9 }, { side: 3, along: 3 }], floor: UNDERLAY_DIRT });
  b.place(0, "furnace", SMITHY.x0 + 2, SMITHY.y0 + 1);
  b.place(0, "furnace", SMITHY.x1 - 2, SMITHY.y0 + 1);
  b.place(0, "anvil", SMITHY.x0 + 3, SMITHY.y0 + 4);
  b.place(0, "anvil", SMITHY.x1 - 3, SMITHY.y0 + 4);
  b.spawnMonster({ monster: "smith_thornbury", x: SMITHY.x0 + 5, y: SMITHY.y0 + 2 });

  // The Blackthorn: two storeys of slate on the High Street's south side, the range through the door.
  building(b, {
    box: INN,
    doors: [{ side: 0, along: 3 }],
    windows: [{ side: 0, along: 1 }, { side: 1, along: 3 }, { side: 1, along: 8 }, { side: 3, along: 5 }],
    storeys: 2,
    stair: { x: INN.x0 + 1, y: INN.y0 + 1 },
    floor: UNDERLAY_DIRT,
    roof: ROOF_SLATE,
  });
  b.place(0, "range", INN.x1 - 1, INN.y0 + 2);
  b.place(0, "table", INN.x0 + 2, INN.y0 + 5);
  b.place(0, "table", INN.x1 - 2, INN.y0 + 7);
  b.place(0, "barrel", INN.x1 - 1, INN.y1 - 1);
  b.spawnMonster({ monster: "innkeeper_thornbury", x: INN.x1 - 2, y: INN.y0 + 4 });
  b.spawnMonster({ monster: "townsman", x: INN.x0 + 4, y: INN.y0 + 6 });
  b.place(1, "table", INN.x0 + 3, INN.y0 + 4);
  b.place(1, "table", INN.x0 + 3, INN.y0 + 8);
  b.place(1, "barrel", INN.x1 - 1, INN.y0 + 1);

  // The staff shop and the apothecary: open, kept, and waiting for their trade.
  building(b, { box: STAFFS, doors: [{ side: 1, along: 3 }], windows: [{ side: 1, along: 6 }], floor: UNDERLAY_DIRT });
  b.place(0, "table", STAFFS.x0 + 2, STAFFS.y0 + 2);
  b.place(0, "crate", STAFFS.x0 + 1, STAFFS.y1 - 1);
  b.spawnMonster({ monster: "staff_seller", x: STAFFS.x0 + 4, y: STAFFS.y0 + 4 });
  building(b, { box: APOTHECARY, doors: [{ side: 1, along: 3 }], windows: [{ side: 1, along: 6 }, { side: 2, along: 4 }], floor: UNDERLAY_DIRT });
  b.place(0, "table", APOTHECARY.x0 + 2, APOTHECARY.y0 + 2);
  b.place(0, "table", APOTHECARY.x0 + 2, APOTHECARY.y1 - 2);
  b.place(0, "barrel", APOTHECARY.x1 - 1, APOTHECARY.y1 - 1);
  b.spawnMonster({ monster: "apothecary", x: APOTHECARY.x0 + 4, y: APOTHECARY.y0 + 4 });

  // The guardhouse on the King's Way, and the guard who is not on the walls.
  building(b, { box: GUARDHOUSE, doors: [{ side: 1, along: 3 }], windows: [{ side: 2, along: 3 }], floor: UNDERLAY_DIRT });
  b.place(0, "table", GUARDHOUSE.x0 + 2, GUARDHOUSE.y0 + 2);
  b.place(0, "crate", GUARDHOUSE.x0 + 1, GUARDHOUSE.y1 - 1);
  b.spawnMonster({ monster: "city_guard", x: GUARDHOUSE.x0 + 4, y: GUARDHOUSE.y0 + 3 });

  // The church and its graves, on the South Lane, with its bell tower on the east end.
  building(b, {
    box: CHURCH,
    doors: [{ side: 0, along: 5 }],
    windows: [{ side: 3, along: 2 }, { side: 3, along: 7 }, { side: 1, along: 2 }, { side: 1, along: 7 }, { side: 2, along: 5 }],
    floor: UNDERLAY_DIRT,
    roof: ROOF_SLATE,
  });
  tower(b, boxOf(CHURCH.x1 + 1, CHURCH.y0 + 6, CHURCH.x1 + 3, CHURCH.y0 + 8), slits(0, 1, 2));
  for (let n = 0; n < 8; n++) b.place(0, "grave", CHURCH.x0 - 5 + (n % 2) * 2, CHURCH.y0 + 1 + Math.floor(n / 2) * 2);

  // Twenty houses along the lanes, each facing its own; every third one slated, so a street is not one run of red.
  HOUSES.forEach(([box, side], i) => {
    const along = side === 0 || side === 2 ? Math.floor((box.x1 - box.x0) / 2) : Math.floor((box.y1 - box.y0) / 2);
    const lit = ((side + 1) % 4) as 0 | 1 | 2 | 3;
    building(b, { box, doors: [{ side, along }], windows: [{ side: lit, along: 2 }], floor: UNDERLAY_DIRT, roof: i % 3 === 2 ? ROOF_SLATE : ROOF_CLAY });
  });

  // The square: the well at its middle, four market stalls, the trader at hers, a signpost where the roads meet.
  b.place(0, "well", WELL.x, WELL.y);
  for (const [x, y] of [[3144, 3513], [3158, 3513], [3144, 3527], [3158, 3527]] as const) b.place(0, "stall", x, y, { tag: "thornbury_market" });
  b.spawnMonster({ monster: "market_trader", x: 3145, y: 3512 });
  b.place(0, "signpost", 3147, 3516);

  // The sewers' mouth: a trapdoor in a railed yard off the South Lane, the gap in its rail toward the lane.
  fence(b, 0, YARD, { x: 3178, y: YARD.y1 }, "fence", false);
  b.place(0, "trapdoor", SEWER_MOUTH.x, SEWER_MOUTH.y, { to: SEWER_PLANE });
  b.place(0, "signpost", YARD.x1 + 1, YARD.y1 + 1);

  // Signposts at the gates, outside them.
  for (const [x, y] of [[3155, 3477], [3109, 3517], [3194, 3523], [3129, 3570]] as const) b.place(0, "signpost", x, y);

  // The guard at each gate, and the people about the streets.
  for (const [x, y] of [[3147, 3484], [3154, 3484], [3116, 3518], [3116, 3522], [3187, 3518], [3187, 3522], [3123, 3562], [3130, 3562]] as const) {
    b.spawnMonster({ monster: "city_guard", x, y });
  }
  b.spawnMonster({ monster: "city_guard", x: 3148, y: 3524 });
  b.spawnMonster({ monster: "city_guard", x: 3156, y: 3516 });
  for (const [x, y] of [[3143, 3522], [3159, 3518], [3128, 3520], [3170, 3520], [3151, 3500], [3126, 3548], [3180, 3552], [3151, 3535]] as const) {
    b.spawnMonster({ monster: (x + y) % 2 === 0 ? "townsman" : "townswoman", x, y });
  }
}

// --- The sewers ---------------------------------------------------------------------------------------

/**
 * Thornbury Sewers (PLAN §8.5): a shaft under the yard, the main drain running west under the High
 * Street with its channel down the middle to the outfall on the Wend outside the walls — the way out
 * under them — and the cistern under the square, from which a ladder goes down to the old works: the
 * silver seam (Mining 33), the dead that were walled in down there, and the chest. Everything else on
 * those regions, on those planes, is rock. Thieves wait for a maker of their own (§5, 2026-09-24).
 */
function sewers(b: WorldBuilder): void {
  const level = b.heightAtCorner(0, WELL.x, WELL.y) - 2 * STOREY;
  // The Hollow shares the upper plane and wrote the corner row at the seam, as it did on the surface.
  cut(b, SEWER_PLANE, SEWER_BOX, SEWER_ROOMS, level, ours);
  cut(b, DEEP_PLANE, DEEP_BOX, DEEP_ROOMS, level - 2 * STOREY, () => true);
  // The channel down the middle of the drain, from the shaft to the cistern and on from it to the turn.
  const drain = SEWER_ROOMS[1]!, cistern = SEWER_ROOMS[2]!;
  const upperMap = b.plane(SEWER_PLANE);
  for (let x = drain.x0; x <= drain.x1; x++) {
    if (x >= cistern.x0 && x <= cistern.x1) continue;
    const y = drain.y0 + 1;
    b.setOverlay(SEWER_PLANE, x, y, OVERLAY_WATER);
    upperMap.collision.block(x, y);
    for (const [cx, cy] of corners(x, y)) b.setHeight(SEWER_PLANE, cx, cy, level - 0.35);
  }
  // The ways in and out: the trapdoor's ladder, the outfall's, and the way down to the old works and back.
  b.place(SEWER_PLANE, "ladder", SEWER_MOUTH.x, SEWER_MOUTH.y, { to: 0 });
  b.place(0, "trapdoor", OUTFALL.x, OUTFALL.y, { to: SEWER_PLANE });
  b.place(SEWER_PLANE, "ladder", OUTFALL.x, OUTFALL.y, { to: 0 });
  b.place(SEWER_PLANE, "ladder", DEEP_STAIR.x, DEEP_STAIR.y, { to: DEEP_PLANE });
  b.place(DEEP_PLANE, "ladder", DEEP_STAIR.x, DEEP_STAIR.y, { to: SEWER_PLANE });
  // The old works: the silver seam along the chamber's walls, the chest in its corner, rock fallen about.
  const chamber = DEEP_ROOMS[2]!;
  for (const x of [3178, 3181, 3184]) b.place(DEEP_PLANE, "silver_rock", x, chamber.y1);
  for (const y of [3503, 3507, 3511]) b.place(DEEP_PLANE, "silver_rock", chamber.x1, y);
  b.place(DEEP_PLANE, "chest", SEWER_CHEST.x, SEWER_CHEST.y, { tag: "sewers" });
  for (const [x, y] of [[3182, 3509], [3145, 3510], [3155, 3516], [3168, 3511]] as const) b.place(DEEP_PLANE, "rock", x, y);
  for (const [x, y] of [[3150, 3486], [3175, 3492], [3100, 3470], [3144, 3515]] as const) b.place(SEWER_PLANE, "rock", x, y);
  for (const [x, y] of [[3143, 3484], [3153, 3494], [3098, 3476]] as const) b.place(SEWER_PLANE, "barrel", x, y);
}

/**
 * Cuts rooms into a plane: the whole box is rock, dark and blocked, but for the rooms' floors, and a
 * cave wall stands on every floor tile's edge that meets rock, so two rooms that touch open into each
 * other. `mine` says which corners this site may write; a neighbour's stay as they are.
 */
function cut(b: WorldBuilder, plane: number, box: Box, rooms: readonly Box[], level: number, mine: (cx: number, cy: number) => boolean): void {
  const map = b.plane(plane);
  const key = (x: number, y: number) => y * 8192 + x;
  const floor = new Set<number>();
  for (const r of rooms) for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) floor.add(key(x, y));
  for (let cy = box.y0; cy <= box.y1 + 1; cy++) for (let cx = box.x0; cx <= box.x1 + 1; cx++) if (mine(cx, cy)) b.setHeight(plane, cx, cy, level);
  for (let y = box.y0; y <= box.y1; y++) {
    for (let x = box.x0; x <= box.x1; x++) {
      if (floor.has(key(x, y))) {
        b.setUnderlay(plane, x, y, UNDERLAY_DIRT);
        continue;
      }
      b.setUnderlay(plane, x, y, UNDERLAY_ROCK);
      map.collision.block(x, y);
    }
  }
  for (const k of floor) {
    const x = k % 8192, y = Math.floor(k / 8192);
    for (const [dx, dy, side] of [[0, 1, 0], [1, 0, 1], [0, -1, 2], [-1, 0, 3]] as const) {
      if (!floor.has(key(x + dx, y + dy))) b.place(plane, "stone_wall", x, y, { side, tag: "cave" });
    }
  }
}

// --- Outside the walls ---------------------------------------------------------------------------------

/**
 * The country round the city: tilled strips and a pasture on the road in from Stonecote, the wood the
 * hamlet's west edge is in carried on over the bend and up to the city's south-west corner (so the
 * seam is not a line where a wood stops), woods on the far bank and north of the wall, and a scatter
 * over everything else so no corner of the site is bare. The woods are written in both passes: the
 * clip keeps each pass to its own box.
 */
const WOODS: ReadonlyArray<readonly [Box, number, number]> = [
  [boxOf(3072, 3392, 3145, 3479), 0.2, 0.25],
  [boxOf(3072, 3480, 3100, 3562), 0.24, 0.25],
  [boxOf(3072, 3569, 3199, 3583), 0.3, 0.3],
];

function outside(b: WorldBuilder, seed: number, box: Box): void {
  const grain = valueNoise2D(seed + 606);
  if (box === THORNBURY) {
    for (let y = FIELDS.y0; y <= FIELDS.y1; y++) {
      for (let x = FIELDS.x0; x <= FIELDS.x1; x++) {
        if (b.overlayAt(0, x, y) !== 0 || !b.free(0, x, y)) continue;
        b.setUnderlay(0, x, y, UNDERLAY_DIRT);
        if ((x + y) % 3 === 0) b.place(0, "crop", x, y);
      }
    }
    fence(b, 0, PASTURE, { x: PASTURE.x0, y: 3467 });
    for (const [x, y] of [[3182, 3462], [3183, 3462]] as const) b.place(0, "crate", x, y);
  }
  for (const [wood, density, oaks] of WOODS) {
    for (let y = wood.y0; y <= wood.y1; y++) {
      for (let x = wood.x0; x <= wood.x1; x++) {
        if (!b.free(0, x, y) || b.overlayAt(0, x, y) !== 0 || underlayAt(b.plane(0), x, y) !== UNDERLAY_GRASS) continue;
        if (inBox(WALLS, x, y) || Math.hypot(x - OUTFALL.x, y - OUTFALL.y) < 4) continue;
        b.setUnderlay(0, x, y, UNDERLAY_FOREST);
        if (b.rand() >= density * (0.5 + 0.5 * grain(x / 7, y / 7))) continue;
        b.place(0, b.rand() < oaks ? "oak" : "tree", x, y);
      }
    }
  }
  for (let y = box.y0; y <= box.y1; y++) {
    for (let x = box.x0; x <= box.x1; x++) {
      if (!b.free(0, x, y) || b.overlayAt(0, x, y) !== 0 || underlayAt(b.plane(0), x, y) !== UNDERLAY_GRASS) continue;
      if (inBox(WALLS, x, y) || inBox(PASTURE, x, y) || Math.hypot(x - OUTFALL.x, y - OUTFALL.y) < 4) continue;
      const trees = 0.04 * grain(x / 11, y / 11);
      const roll = b.rand();
      if (roll < trees) b.place(0, "tree", x, y);
      else if (roll < trees + 0.008) b.place(0, "bush", x, y);
      else if (roll < trees + 0.011) b.place(0, "rock", x, y);
    }
  }
}

/**
 * Who lives here. Inside the walls nothing but people and the guard (§7.7's third rule: the roads and
 * the streets are safe); the farm's animals on the road in; wolves and spiders in the woods off it;
 * rats under the city, bats at the outfall, and in the old works the dead and the brute that keeps them.
 */
function creatures(b: WorldBuilder): void {
  const herds: Array<[string, number, number, number, number, number]> = [
    ["cow", 4, 3178, 3467, 5, 0],
    ["ram", 2, 3174, 3463, 3, 0],
    ["hen", 4, 3140, 3476, 4, 0],
    ["field_rat", 4, 3130, 3466, 6, 0],
    ["mallard", 4, 3096, 3462, 6, 0],
    ["giant_rat", 3, 3102, 3478, 4, 0],
    ["wild_boar", 3, 3100, 3420, 8, 0],
    ["thicket_spider", 4, 3082, 3540, 6, 0],
    ["grey_wolf", 4, 3100, 3577, 6, 0],
    ["grey_wolf", 3, 3180, 3577, 5, 0],
    ["giant_rat", 5, 3178, 3489, 5, SEWER_PLANE],
    ["giant_rat", 4, 3148, 3489, 7, SEWER_PLANE],
    ["cave_bat", 4, 3103, 3472, 6, SEWER_PLANE],
    ["cave_bat", 2, 3149, 3512, 5, SEWER_PLANE],
    ["dust_scorpion", 3, 3150, 3512, 8, DEEP_PLANE],
    ["ruin_skeleton", 3, 3183, 3509, 6, DEEP_PLANE],
    ["grave_shambler", 2, 3186, 3504, 4, DEEP_PLANE],
    ["quarry_brute", 1, 3186, 3514, 2, DEEP_PLANE],
  ];
  const taken = new Set<number>();
  for (const [monster, count, cx, cy, r, plane] of herds) {
    for (let placed = 0, tries = 0; placed < count && tries < 200; tries++) {
      const x = Math.round(cx + (b.rand() * 2 - 1) * r), y = Math.round(cy + (b.rand() * 2 - 1) * r);
      const key = plane * 1e8 + y * 4096 + x;
      if (taken.has(key) || !b.free(plane, x, y) || inBox(WALLS, x, y) && plane === 0) continue;
      taken.add(key);
      b.spawnMonster({ monster, x, y, plane });
      placed++;
    }
  }
}

/** What lies about: little in a city that sells everything, and something in the dark for whoever goes down. */
function lying(b: WorldBuilder): void {
  const spawns: Array<[string, number, number, number, number, number]> = [
    ["bread", 1, 3184, 3505, 100, 0],
    ["coins", 8, 3148, 3518, 200, 0],
    ["logs", 1, 3168, 3508, 100, 0],
    ["bones", 1, 3156, 3486, 200, 0],
    ["coins", 15, 3143, 3494, 300, SEWER_PLANE],
    ["bones", 1, 3098, 3468, 200, SEWER_PLANE],
    ["coins", 25, 3178, 3502, 400, DEEP_PLANE],
    ["silver_ore", 1, 3142, 3517, 600, DEEP_PLANE],
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

// --- What the district's tables gain from the site --------------------------------------------------

/** The city has the village's tune, and so does the road up to it; the sewers have the dark one. */
export const THORNBURY_AREAS: ReadonlyArray<{ area: Area; box: Box }> = [
  { area: { key: "castle", name: "Thornbury Castle", track: 0 }, box: CASTLE },
  { area: { key: "thornbury", name: "Thornbury", track: 0 }, box: WALLS },
  { area: { key: "thornbury_fields", name: "The Thornbury road", track: 0 }, box: THORNBURY },
  { area: { key: "wendbend", name: "The Wend", track: 1 }, box: BEND },
];
export const SEWERS_AREA: Area = { key: "sewers", name: "Thornbury Sewers", track: 2 };

export const THORNBURY_LABELS: MapLabel[] = [
  { name: "Thornbury", x: 3151, y: 3504 },
  { name: "Thornbury Castle", x: 3151, y: 3557, small: true },
  { name: "The Blackthorn", x: 3184, y: 3512, small: true },
  { name: "The Wend", x: 3096, y: 3466, small: true },
  { name: "Thornbury Sewers", x: 3178, y: 3484, small: true },
];

export const THORNBURY_MARKS: Array<{ icon: MapIcon; x: number; y: number; name: string }> = [
  { icon: "inn", x: 3184, y: 3512, name: "The Blackthorn" },
  { icon: "church", x: 3165, y: 3488, name: "Church" },
];

/** The three roads out of the city and where each goes (§7.6): the Harrow is a country, not a distance. */
export const THORNBURY_EXITS: MapExit[] = [
  { name: "The Ditch Road — the Harrow", x: 3122, y: 3583, side: "n", away: 0 },
  { name: "The Kingsway — Hollow Pass", x: 3072, y: 3524, side: "w", away: 429 },
  { name: "The Fen Road — Mourn", x: 3199, y: 3521, side: "e", away: 716 },
];

/** Named boxes, for the tests and the map. */
export const THORNBURY_SITES: Record<string, Box> = { thornbury: THORNBURY, thornbury_walls: WALLS, castle: CASTLE, wend_bend: BEND };
