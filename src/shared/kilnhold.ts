// Kilnhold (PLAN §7.6, the first site of Wave 2): the red-earth town out in the Cinderwaste, past the
// Emberway Gate — the world's fourth bank, Hask's Edge (the best early blade in the game, the steel
// sword, sold nowhere else), a smithy whose two furnaces run hot enough for coldiron and emberite
// (§8.3), the Kiln Door, seven houses, a well and the square, all inside a curtain wall with a
// gatehouse on the road in and another on the road out, and outside the west gate the kilns the town
// is named for; the Emberway itself, four regions of it over the waste from the toll gate to the hold,
// with the old waystation the highwaymen work from halfway along; and the emberite outcrop (Mining 58,
// §8.3's seventh rung) in the far south-east corner, with the worst company on the site round it.
//
// Its site is regions 52–57 × 49–50: the corridor east from the district's edge, the bay's shore along
// its south side, the hold's region and the one past it, where the Sand Road runs on toward Sandreach.
// Built on the same builder as the district and the four sites of Wave 1, after all of them, so every
// id and every roll of theirs stands; the district's column of corners at x 3328 is never written, and
// the ground beside it is stitched to those values over eight tiles (tests/kilnhold.test.ts builds the
// world with and without this and compares every one of them).
import { bayShore, heartlandHeight, SEA_CORNER } from "./heartland.ts";
import {
  OVERLAY_PATH, OVERLAY_WATER, ROOF_SLATE, underlayAt, UNDERLAY_CINDER, UNDERLAY_DIRT, UNDERLAY_GRASS, UNDERLAY_SAND,
} from "./map.ts";
import type { Area, MapIcon, MapLabel } from "./oakridge.ts";
import { valueNoise2D } from "./rng.ts";
import {
  bank, boxOf, building, corners, curtain, inBox, road, scatter, shop, smoothstep, tower, WorldBuilder, type Box, type DoorSpec, type Point,
} from "./worldgen.ts";
import { TUNE } from "./tunes.ts";

/** The site: regions 52–57 × 49–50, tiles x 3328–3711 and y 3136–3263. */
export const KILNHOLD_SITE: Box = boxOf(3328, 3136, 3711, 3263);
/** The waste: everything of the site west of the hold's region. */
export const WASTE: Box = boxOf(3328, 3136, 3583, 3263);
/** The hold: the curtain wall's box, walls included. */
export const HOLD: Box = boxOf(3600, 3210, 3643, 3253);
/** The square at the hold's middle, where the street widens, and the well on its north side. */
export const SQUARE = { x: 3621, y: 3232 };
export const WELL = { x: 3621, y: 3236 };
export const BANK: Box = boxOf(3612, 3238, 3623, 3246);
export const SMITHY: Box = boxOf(3627, 3238, 3638, 3246);
/** Hask's Edge, on the square's south side. */
export const BLADES: Box = boxOf(3604, 3216, 3613, 3225);
/** The Kiln Door, beside it. */
export const INN: Box = boxOf(3616, 3215, 3626, 3225);
/** The two hot furnaces, and the anvils in front of them. */
export const FURNACES: ReadonlyArray<{ x: number; y: number }> = [{ x: 3629, y: 3245 }, { x: 3636, y: 3245 }];
const ANVILS: ReadonlyArray<{ x: number; y: number }> = [{ x: 3630, y: 3241 }, { x: 3635, y: 3241 }];
const HOUSES: ReadonlyArray<readonly [Box, DoorSpec]> = [
  [boxOf(3604, 3239, 3609, 3244), { side: 2, along: 2 }],
  [boxOf(3605, 3248, 3610, 3252), { side: 2, along: 2 }],
  [boxOf(3614, 3248, 3619, 3252), { side: 2, along: 2 }],
  [boxOf(3623, 3248, 3628, 3252), { side: 2, along: 2 }],
  [boxOf(3632, 3248, 3637, 3252), { side: 2, along: 2 }],
  [boxOf(3630, 3218, 3635, 3223), { side: 0, along: 2 }],
  [boxOf(3636, 3218, 3641, 3223), { side: 0, along: 3 }],
];
/** The gatehouses' gaps in the wall, four tiles each with the road through them: the west, on the Emberway, and the east, on the Sand Road. */
export const GATE_W: Box = boxOf(3600, 3230, 3600, 3233);
export const GATE_E: Box = boxOf(3643, 3230, 3643, 3233);
/** A three-by-three tower with an arrow slit in the middle of each side asked for. */
const slits = (...sides: Array<0 | 1 | 2 | 3>): DoorSpec[] => sides.map((side) => ({ side, along: 1 }));
const TOWERS: ReadonlyArray<[Box, DoorSpec[]]> = [
  [boxOf(3600, 3210, 3602, 3212), slits(2, 3)], [boxOf(3641, 3210, 3643, 3212), slits(2, 1)],
  [boxOf(3600, 3251, 3602, 3253), slits(0, 3)], [boxOf(3641, 3251, 3643, 3253), slits(0, 1)],
  [boxOf(3600, 3226, 3602, 3228), slits(3, 2)], [boxOf(3600, 3235, 3602, 3237), slits(3, 0)],
  [boxOf(3641, 3226, 3643, 3228), slits(1, 2)], [boxOf(3641, 3235, 3643, 3237), slits(1, 0)],
];
/** The kilns outside the west gate, north of the road, and the trodden ground round them. */
export const KILNS: ReadonlyArray<{ x: number; y: number }> = [{ x: 3587, y: 3238 }, { x: 3590, y: 3238 }, { x: 3593, y: 3238 }, { x: 3590, y: 3242 }];
const KILN_YARD: Box = boxOf(3585, 3236, 3595, 3244);
/** The old waystation halfway along the Emberway: four ruined walls north of the road, and the highwaymen's fire in them. */
export const WAYSTATION: Box = boxOf(3466, 3238, 3473, 3243);
/** The emberite outcrop in the far south-east, above the shore. */
export const OUTCROP = { x: 3690, y: 3168, r: 7 };

/** The Emberway from the district's edge to the west gate, the street through the hold, and the Sand Road out east. */
export const EMBERWAY: Point[] = [[3328, 3231], [3362, 3232], [3420, 3228], [3468, 3236], [3520, 3236], [3562, 3233], [3600, 3232]];
export const STREET: Point[] = [[3600, 3232], [3643, 3232]];
export const SAND_ROAD: Point[] = [[3643, 3232], [3680, 3230], [3711, 3232]];
/** Where the Emberway comes in over the seam, and where the Sand Road leaves the site, running on to Sandreach (Wave 4). */
export const ROAD_IN = { x: 3328, y: 3231 };
export const SAND_EXIT = { x: 3711, y: 3232 };
const LANES: Point[][] = [[[3625, 3232], [3625, 3247]], [[3604, 3247], [3639, 3247]]];
/**
 * The stubs from the street or a lane to each door. ⛔ A stub's end tile is not paved at width 0.6 (the
 * tile's centre is 0.707 from the line's end), so each starts a tile INSIDE the street it leaves and
 * runs a tile into its building: the tile outside the door is paved, and the building takes its own back.
 */
const STUBS: Point[][] = [
  [[3617, 3232], [3617, 3238]], [[3632, 3232], [3632, 3238]], [[3608, 3231], [3608, 3225]], [[3621, 3231], [3621, 3225]],
  [[3606, 3232], [3606, 3239]],
  [[3607, 3247], [3607, 3248]], [[3616, 3247], [3616, 3248]], [[3625, 3247], [3625, 3248]], [[3634, 3247], [3634, 3248]],
  [[3632, 3231], [3632, 3223]], [[3639, 3231], [3639, 3223]],
];

export function buildKilnhold(b: WorldBuilder, seed: number): void {
  b.clip = KILNHOLD_SITE;
  const sea = terrain(b, seed);
  bay(b, sea);
  roads(b);
  hold(b);
  kilns(b);
  waystation(b);
  outcrop(b);
  wilderness(b, seed);
  creatures(b);
  lying(b);
}

// --- Ground ------------------------------------------------------------------------------------------

/** Whether a corner is this site's to write: the district's column at x 3328 is not. */
const ours = (cx: number, _cy: number): boolean => cx > 3328;

/** Whether a tile is the bay's water: south of the shore the district's own sea is cut with. */
export const isBay = (x: number, y: number): boolean => y < bayShore(x);

/**
 * The waste's lie of the land: the heartland's own height climbing out of the low ground east of the
 * river, broken all over once it is clear of the seam. Sandreach's ground runs on from it over its seam.
 */
export function wasteHeight(seed: number): (cx: number, cy: number) => number {
  const raw = heartlandHeight(seed), broken = valueNoise2D(seed + 707);
  return (cx, cy) => {
    let h = raw(cx, cy);
    h += 1.8 * smoothstep(3340, 3440, cx);
    h += 1.6 * (broken(cx / 13, cy / 13) - 0.5) * smoothstep(3336, 3380, cx);
    return h;
  };
}

/**
 * The ground: the heartland's own height climbing out of the low ground east of the river into the
 * waste, broken all over once it is clear of the seam, the shelf the hold stands level on, the bay's
 * shore easing down to the water as the district's does, and the stitch to the district's column of
 * corners at x 3328, joined over eight tiles. Returns the sea's level, read off the district's own sea.
 */
function terrain(b: WorldBuilder, seed: number): number {
  const sea = b.heightAtCorner(0, SEA_CORNER.x, SEA_CORNER.y);
  const base = wasteHeight(seed);
  const shelf = base(SQUARE.x, SQUARE.y) + 0.5;
  for (let cy = KILNHOLD_SITE.y0; cy <= KILNHOLD_SITE.y1 + 1; cy++) {
    for (let cx = KILNHOLD_SITE.x0; cx <= KILNHOLD_SITE.x1 + 1; cx++) {
      if (!ours(cx, cy)) continue;
      let h = base(cx, cy);
      // The hold's shelf, the ground easing up to it over ten tiles.
      const out = Math.max(HOLD.x0 - cx, cx - (HOLD.x1 + 1), HOLD.y0 - cy, cy - (HOLD.y1 + 1), 0);
      h += (shelf - h) * smoothstep(10, 0, out);
      // The bay's shore, down to the water's edge.
      const off = Math.max(0, cy - bayShore(cx) - 1);
      h += (sea + 0.6 + off * 0.3 - h) * smoothstep(14, 3, off);
      // The stitch: the district's column, joined over eight tiles, exactly at the seam.
      if (cx <= 3336) h += (b.heightAtCorner(0, 3328, cy) - h) * smoothstep(3337, 3329, cx);
      b.setHeight(0, cx, cy, h);
    }
  }
  // The red earth, coming in over the heartland's grass in a ragged line a few tiles past the seam.
  const grain = valueNoise2D(seed + 808);
  for (let y = KILNHOLD_SITE.y0; y <= KILNHOLD_SITE.y1; y++) {
    for (let x = KILNHOLD_SITE.x0; x <= KILNHOLD_SITE.x1; x++) {
      const into = smoothstep(3330, 3358, x + 8 * (grain(x / 9, y / 9) - 0.5));
      b.setUnderlay(0, x, y, b.rand() < into ? UNDERLAY_CINDER : UNDERLAY_GRASS);
    }
  }
  return sea;
}

/** The bay along the south: water where the district's shore line puts it, at the sea's level, sand along it. */
function bay(b: WorldBuilder, sea: number): void {
  for (let x = KILNHOLD_SITE.x0; x <= KILNHOLD_SITE.x1; x++) {
    const shore = bayShore(x);
    for (let y = KILNHOLD_SITE.y0; y <= KILNHOLD_SITE.y1; y++) {
      if (y < shore) {
        b.setOverlay(0, x, y, OVERLAY_WATER);
        b.plane(0).collision.block(x, y);
        for (const [cx, cy] of corners(x, y)) if (ours(cx, cy)) b.setHeight(0, cx, cy, sea);
      }
      if (y >= Math.floor(shore) && y < shore + 3) b.setUnderlay(0, x, y, UNDERLAY_SAND);
    }
  }
}

// --- Roads ---------------------------------------------------------------------------------------------

function roads(b: WorldBuilder): void {
  road(b, 0, EMBERWAY, 1.3);
  road(b, 0, STREET, 1.3);
  road(b, 0, SAND_ROAD, 1.3);
  for (const lane of LANES) road(b, 0, lane, 1.1);
  for (const stub of STUBS) road(b, 0, stub, 0.6);
  for (let y = SQUARE.y - 5; y <= SQUARE.y + 5; y++) {
    for (let x = SQUARE.x - 5; x <= SQUARE.x + 5; x++) {
      if (Math.hypot(x + 0.5 - SQUARE.x, y + 0.5 - SQUARE.y) <= 4.6) b.setOverlay(0, x, y, OVERLAY_PATH);
    }
  }
  for (let y = KILNHOLD_SITE.y0; y <= KILNHOLD_SITE.y1; y++) {
    for (let x = KILNHOLD_SITE.x0; x <= KILNHOLD_SITE.x1; x++) {
      if (b.overlayAt(0, x, y) === OVERLAY_PATH) b.setUnderlay(0, x, y, UNDERLAY_DIRT);
    }
  }
}

// --- The hold ----------------------------------------------------------------------------------------

/**
 * The hold (PLAN §7.6's card and the plan map's): a curtain wall with a tower on each corner and a
 * gatehouse — a tower either side of a four-tile gap, open — where the Emberway comes in and the Sand
 * Road goes out; inside it the street, the square and the well, the bank on the square's north side —
 * the fourth in the world — the smithy beside it with its two hot furnaces, Hask's Edge and the Kiln
 * Door on the south side, seven houses, and the wardens at the gates.
 */
function hold(b: WorldBuilder): void {
  for (let y = HOLD.y0; y <= HOLD.y1; y++) {
    for (let x = HOLD.x0; x <= HOLD.x1; x++) {
      if (b.overlayAt(0, x, y) !== OVERLAY_PATH) b.setUnderlay(0, x, y, UNDERLAY_DIRT);
    }
  }
  curtain(b, HOLD, [...TOWERS.map(([box]) => box), GATE_W, GATE_E]);
  for (const [box, windows] of TOWERS) tower(b, box, windows);
  b.place(0, "well", WELL.x, WELL.y);

  bank(b, BANK, { side: 2, along: 5 });
  shop(b, BLADES, { side: 0, along: 4 }, "kilnhold_blades", "bladesmith", [{ side: 0, along: 1 }, { side: 0, along: 7 }, { side: 3, along: 4 }]);

  // The smithy: slate over stone, the furnaces against the back wall and the anvils before them.
  building(b, {
    box: SMITHY,
    doors: [{ side: 2, along: 5 }],
    windows: [{ side: 2, along: 1 }, { side: 2, along: 9 }, { side: 3, along: 4 }, { side: 1, along: 4 }],
    floor: UNDERLAY_DIRT,
    roof: ROOF_SLATE,
    sign: "anvil",
  });
  for (const f of FURNACES) b.place(0, "furnace", f.x, f.y, { tag: "hot" });
  for (const a of ANVILS) b.place(0, "anvil", a.x, a.y);
  b.spawnMonster({ monster: "smith_kilnhold", x: 3632, y: 3243 });

  // The Kiln Door: two storeys of slate, the range through the door and the stair at the back.
  building(b, {
    box: INN,
    doors: [{ side: 0, along: 5 }],
    windows: [{ side: 0, along: 1 }, { side: 0, along: 9 }, { side: 3, along: 3 }, { side: 3, along: 8 }, { side: 1, along: 3 }, { side: 1, along: 8 }],
    storeys: 2,
    stair: { x: INN.x1 - 1, y: INN.y0 + 1 },
    floor: UNDERLAY_DIRT,
    roof: ROOF_SLATE,
    sign: "tankard",
  });
  b.place(0, "range", INN.x0 + 1, INN.y0 + 1);
  b.place(0, "table", INN.x0 + 3, INN.y0 + 5);
  b.place(0, "table", INN.x1 - 2, INN.y0 + 3);
  b.place(0, "barrel", INN.x0 + 1, INN.y0 + 3);
  b.spawnMonster({ monster: "innkeeper_kilnhold", x: INN.x0 + 5, y: INN.y0 + 3 });

  for (const [box, door] of HOUSES) {
    const along = door.side === 0 || door.side === 2 ? { side: door.side === 0 ? 2 : 0, along: box.x1 - box.x0 - 1 } : { side: 1, along: 2 };
    building(b, { box, doors: [door], windows: [along as DoorSpec], floor: UNDERLAY_DIRT, roof: ROOF_SLATE });
  }

  b.spawnMonster({ monster: "hold_warden", x: 3603, y: 3230 });
  b.spawnMonster({ monster: "hold_warden", x: 3640, y: 3233 });
  for (const [monster, x, y] of [["holdsman", 3616, 3235], ["holdswoman", 3626, 3229], ["holdsman", 3610, 3247], ["holdswoman", 3634, 3226]] as const) {
    b.spawnMonster({ monster, x, y });
  }
}

/** The kilns the town is named for, outside the west gate on trodden ground, and the man who tends them. */
function kilns(b: WorldBuilder): void {
  for (let y = KILN_YARD.y0; y <= KILN_YARD.y1; y++) {
    for (let x = KILN_YARD.x0; x <= KILN_YARD.x1; x++) if (b.overlayAt(0, x, y) !== OVERLAY_PATH) b.setUnderlay(0, x, y, UNDERLAY_DIRT);
  }
  for (const k of KILNS) b.place(0, "kiln", k.x, k.y);
  b.spawnMonster({ monster: "kilnman", x: 3590, y: 3240 });
}

/** The old waystation: four walls of ruin with a gap toward the road, a fire and a crate inside, and the highwaymen's home. */
function waystation(b: WorldBuilder): void {
  const gap = (x: number, y: number) => y === WAYSTATION.y0 && (x === 3469 || x === 3470);
  for (let x = WAYSTATION.x0; x <= WAYSTATION.x1; x++) {
    if (!gap(x, WAYSTATION.y0)) b.place(0, "stone_wall", x, WAYSTATION.y0, { side: 2, tag: "ruin" });
    b.place(0, "stone_wall", x, WAYSTATION.y1, { side: 0, tag: "ruin" });
  }
  for (let y = WAYSTATION.y0; y <= WAYSTATION.y1; y++) {
    b.place(0, "stone_wall", WAYSTATION.x0, y, { side: 3, tag: "ruin" });
    b.place(0, "stone_wall", WAYSTATION.x1, y, { side: 1, tag: "ruin" });
  }
  for (let y = WAYSTATION.y0; y <= WAYSTATION.y1; y++) {
    for (let x = WAYSTATION.x0; x <= WAYSTATION.x1; x++) b.setUnderlay(0, x, y, UNDERLAY_DIRT);
  }
  b.place(0, "fire", 3469, 3241);
  b.place(0, "crate", 3472, 3242);
  b.place(0, "barrel", 3467, 3242);
}

/** The emberite outcrop (PLAN §8.3, Mining 58): the red rocks above the shore in the far corner, plain rock round them. */
function outcrop(b: WorldBuilder): void {
  const clear = (x: number, y: number) => b.overlayAt(0, x, y) === 0;
  scatter(b, 0, "emberite_rock", OUTCROP, 5, clear);
  scatter(b, 0, "rock", OUTCROP, 6, clear);
}

// --- The country -----------------------------------------------------------------------------------------

/** The waste: dead trees, blackthorn and rock on the red earth; the heartland's trees on the grass by the seam; nothing on the hold or the yards. */
function wilderness(b: WorldBuilder, seed: number): void {
  const grain = valueNoise2D(seed + 909);
  const kept = (x: number, y: number) =>
    inBox(HOLD, x, y) || inBox(KILN_YARD, x, y) || inBox(WAYSTATION, x, y) || Math.hypot(x - OUTCROP.x, y - OUTCROP.y) < OUTCROP.r + 2;
  for (let y = KILNHOLD_SITE.y0; y <= KILNHOLD_SITE.y1; y++) {
    for (let x = KILNHOLD_SITE.x0; x <= KILNHOLD_SITE.x1; x++) {
      if (!b.free(0, x, y) || b.overlayAt(0, x, y) !== 0 || kept(x, y)) continue;
      const under = underlayAt(b.plane(0), x, y);
      const roll = b.rand();
      if (under === UNDERLAY_GRASS) {
        const trees = 0.05 * grain(x / 11, y / 11);
        if (roll < trees) b.place(0, "tree", x, y);
        else if (roll < trees + 0.008) b.place(0, "bush", x, y);
        else if (roll < trees + 0.011) b.place(0, "rock", x, y);
      } else if (under === UNDERLAY_CINDER) {
        // Nothing green: dead trees and rock, thicker where the noise says, and that is the whole of it.
        const dead = 0.018 * grain(x / 9 + 30, y / 9);
        if (roll < dead) b.place(0, "dead_tree", x, y);
        else if (roll < dead + 0.012) b.place(0, "rock", x, y);
      }
    }
  }
}

/**
 * Who lives here. The hold holds people and its hens; the waste has scorpions and rats off the road
 * and the highwaymen on it at the waystation (§7.7's third rule, and the one exception it names); the
 * outcrop has the worst of them, scorpions thick round it and the brutes on it.
 */
function creatures(b: WorldBuilder): void {
  const herds: Array<[string, number, number, number, number]> = [
    // On the open strip inside the south wall: a herd is placed on any free tile, and a house floor is free.
    ["hen", 3, 3620, 3213, 3],
    ["field_rat", 3, 3636, 3214, 2],
    ["giant_rat", 4, 3450, 3182, 8],
    ["dust_scorpion", 4, 3395, 3212, 10],
    ["dust_scorpion", 4, 3540, 3250, 10],
    ["highwayman", 2, 3470, 3234, 3],
    ["dust_scorpion", 5, 3684, 3176, 8],
    ["quarry_brute", 2, 3692, 3166, 3],
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

/** What lies about: the highwaymen's takings in the waystation, logs by the kilns, coal by a furnace, bread in the Kiln Door. */
function lying(b: WorldBuilder): void {
  const spawns: Array<[string, number, number, number, number]> = [
    ["coins", 14, 3468, 3241, 200],
    ["logs", 2, 3588, 3241, 200],
    ["coal", 2, 3629, 3244, 150],
    ["bread", 1, INN.x0 + 2, INN.y0 + 4, 100],
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

/** The waste, and the road across it: the harder tune the quarry and the barrow share. Sandreach's road runs on through the same waste. */
export const CINDERWASTE_AREA: Area = { key: "cinderwaste", name: "The Cinderwaste", track: TUNE.danger };
/** The hold has the village's tune. */
export const KILNHOLD_AREAS: ReadonlyArray<{ area: Area; box: Box }> = [
  { area: { key: "kilnhold", name: "Kilnhold", track: TUNE.village2 }, box: HOLD },
  { area: CINDERWASTE_AREA, box: KILNHOLD_SITE },
];

export const KILNHOLD_LABELS: MapLabel[] = [
  { name: "Kilnhold", x: 3621, y: 3258 },
  { name: "The Cinderwaste", x: 3450, y: 3190 },
  { name: "The Emberway", x: 3420, y: 3224, small: true },
  { name: "The kilns", x: 3590, y: 3247, small: true },
  { name: "The old waystation", x: 3470, y: 3248, small: true },
  { name: "The Kiln Door", x: 3621, y: 3212, small: true },
  { name: "The Sand Road", x: 3688, y: 3236, small: true },
];

export const KILNHOLD_MARKS: Array<{ icon: MapIcon; x: number; y: number; name: string }> = [
  { icon: "inn", x: INN.x0 + 5, y: INN.y0 + 5, name: "The Kiln Door" },
  { icon: "mine", x: OUTCROP.x, y: OUTCROP.y, name: "The emberite outcrop" },
  { icon: "quest", x: 3470, y: 3240, name: "The old waystation" },
];


/** Named boxes, for the tests and the map. */
export const KILNHOLD_SITES: Record<string, Box> = { kilnhold: KILNHOLD_SITE, kilnhold_hold: HOLD, cinderwaste: WASTE };
