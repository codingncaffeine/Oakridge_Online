// The Fen Hollows (PLAN §8.5, Wave 4): old Mourn, the village the fen swallowed, under the mound the new
// one stands on. The reeve tells it in The Silence at Mourn: Mourn stands on an older Mourn, and the bell
// the village sank "rings down there on its own". The slab over the stair at the mound's north edge has
// been shoved aside from below, and the steps go down to two planes of it:
//   −1, the drowned lanes: a landing at the stair's foot, old Mourn's high street with a house either
//      side, its square and well, the stubs of its houses, and the drowned end west of the square where
//      the fen came in first, in black water; the old chapel's porch south of the square goes on down;
//   −2, old Mourn's chapel, under the new one: the nave with its dead in stone, a crypt off the east side,
//      and the west end the fen broke into — and in that pool the bell, come down through the fen's floor
//      to the chapel it was cast for, with old Mourn's ringer over it and the chest behind him.
// Band 50–70 (§8.5): hollow crawlers, drowned mourners and the fen's bog hags above, the mourners and the
// ringer below. No second lock: nobody reaches Mourn before the Rill gate passes them (sallowfen.ts).
//
// Built last of all, on Mourn's region alone, every room, pool, stone and creature at a written tile, so a
// world built without it is the same world everywhere else (tests/fenhollows.test.ts holds that), and the
// stair keeps its id either way: Mourn lays the open stair or the slab in the same breath.
import { OVERLAY_WATER, REGION, regionOf, UNDERLAY_FEN, UNDERLAY_STONE } from "./map.ts";
import type { Area } from "./oakridge.ts";
import { cut } from "./thornbury.ts";
import { TUNE } from "./tunes.ts";
import { boxOf, corners, inBox, STOREY, WorldBuilder, type Box } from "./worldgen.ts";
import type { Side } from "./collision.ts";

/** Old Mourn's lanes are the first plane down; its chapel is the second. */
export const HOLLOWS_PLANE = -1;
export const OLD_CHAPEL_PLANE = -2;
/** Where the Fen Hollows go down: at the north edge of Mourn's mound, where the slab was. */
export const HOLLOWS_STAIR = { x: 3874, y: 3572 };
/** Mourn's region, which the Hollows are cut into on both planes: everything else on it below ground is rock. */
export const HOLLOWS_REGION: Box = boxOf(
  regionOf(HOLLOWS_STAIR.x) * REGION, regionOf(HOLLOWS_STAIR.y) * REGION,
  regionOf(HOLLOWS_STAIR.x) * REGION + REGION - 1, regionOf(HOLLOWS_STAIR.y) * REGION + REGION - 1,
);

/**
 * The drowned lanes. Rooms that touch open into each other; the houses meet the street through their fronts,
 * which stand with a doorway left in each.
 */
export const LANES = {
  landing: boxOf(3870, 3568, 3878, 3577),
  street: boxOf(3872, 3556, 3876, 3567),
  westHouse: boxOf(3863, 3557, 3871, 3565),
  eastHouse: boxOf(3877, 3557, 3885, 3565),
  square: boxOf(3862, 3542, 3884, 3555),
  drowned: boxOf(3842, 3538, 3861, 3556),
  porch: boxOf(3867, 3530, 3877, 3541),
} as const;
export const LANES_ROOMS: readonly Box[] = Object.values(LANES);
/** Old Mourn's chapel: the nave, the crypt off its east side, and the west end the fen broke into. */
export const OLD_CHAPEL = {
  nave: boxOf(3864, 3522, 3880, 3540),
  crypt: boxOf(3881, 3527, 3889, 3535),
  westEnd: boxOf(3843, 3521, 3863, 3540),
} as const;
export const OLD_CHAPEL_ROOMS: readonly Box[] = Object.values(OLD_CHAPEL);
/** The way down from the porch into the nave: the same tile on both planes. */
export const CHAPEL_STAIR = { x: 3872, y: 3531 };

/** Black water, as circles round a tile corner: the drowned end's, and a puddle in the square's low corner. */
export const LANES_POOLS: ReadonlyArray<{ x: number; y: number; r: number }> = [{ x: 3851, y: 3547, r: 6 }, { x: 3881, y: 3545, r: 2.5 }];
/** Where the fen comes through the chapel's west end, and the bell lies at its edge. */
export const BELL_POOL = { x: 3851, y: 3530, r: 6 };
export const BELL = { x: 3857, y: 3530 };
export const HOLLOWS_CHEST = { x: 3845, y: 3539 };
/** The old well in the middle of old Mourn's square. */
export const OLD_WELL = { x: 3873, y: 3549 };
export const inPool = (pools: ReadonlyArray<{ x: number; y: number; r: number }>, x: number, y: number): boolean =>
  pools.some((p) => Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y) < p.r);

/** A straight run of wall stub along one side of a line of tiles, leaving out the gaps. */
function run(from: number, to: number, at: (n: number) => readonly [number, number], side: Side, gaps: readonly number[] = []): Array<readonly [number, number, Side]> {
  const out: Array<readonly [number, number, Side]> = [];
  for (let n = from; n <= to; n++) if (!gaps.includes(n)) out.push([...at(n), side]);
  return out;
}

/**
 * What stands of old Mourn's walls, as edges: the two houses' fronts on the street with their doorways,
 * two houses round the square (a door and a fallen gap each), and stubs in the drowned end's water.
 */
export const LANES_WALLS: ReadonlyArray<readonly [number, number, Side]> = [
  ...run(3557, 3565, (y) => [3871, y], 1, [3561]),
  ...run(3557, 3565, (y) => [3877, y], 3, [3560]),
  // The house in the square's north-west corner: its front, its east side, its back on the drowned end.
  ...run(3862, 3867, (x) => [x, 3551], 2, [3864]),
  ...run(3551, 3555, (y) => [3867, y], 1, [3553]),
  ...run(3551, 3555, (y) => [3862, y], 3),
  // The house in the square's north-east corner: its front and its west side.
  ...run(3879, 3884, (x) => [x, 3551], 2, [3881]),
  ...run(3551, 3555, (y) => [3879, y], 3, [3554]),
  // Stubs of the drowned end's houses, standing in the water.
  ...run(3847, 3850, (x) => [x, 3551], 0),
  ...run(3543, 3546, (y) => [3855, y], 1),
  ...run(3846, 3848, (x) => [x, 3543], 2),
];
/** The nave's old west wall with the breach the fen made in it, and the crypt's arch. */
export const OLD_CHAPEL_WALLS: ReadonlyArray<readonly [number, number, Side]> = [
  ...run(3522, 3540, (y) => [3864, y], 3, [3527, 3528, 3529, 3530, 3531, 3532, 3533, 3534]),
  ...run(3527, 3535, (y) => [3881, y], 3, [3531]),
];

/** Who is down there, each at a written tile: [creature, plane, x, y]. */
export const HOLLOWS_DWELLERS: ReadonlyArray<readonly [string, number, number, number]> = [
  ["drowned_mourner", HOLLOWS_PLANE, 3874, 3561],
  ["hollow_crawler", HOLLOWS_PLANE, 3866, 3561],
  ["hollow_crawler", HOLLOWS_PLANE, 3882, 3561],
  ["drowned_mourner", HOLLOWS_PLANE, 3868, 3546],
  ["drowned_mourner", HOLLOWS_PLANE, 3878, 3549],
  ["bog_hag", HOLLOWS_PLANE, 3874, 3544],
  ["hollow_crawler", HOLLOWS_PLANE, 3845, 3541],
  ["hollow_crawler", HOLLOWS_PLANE, 3858, 3553],
  ["hollow_crawler", HOLLOWS_PLANE, 3858, 3541],
  ["bog_hag", HOLLOWS_PLANE, 3844, 3554],
  ["drowned_mourner", HOLLOWS_PLANE, 3870, 3535],
  ["drowned_mourner", OLD_CHAPEL_PLANE, 3869, 3526],
  ["drowned_mourner", OLD_CHAPEL_PLANE, 3876, 3524],
  ["drowned_mourner", OLD_CHAPEL_PLANE, 3875, 3536],
  ["drowned_mourner", OLD_CHAPEL_PLANE, 3869, 3538],
  ["hollow_crawler", OLD_CHAPEL_PLANE, 3885, 3531],
  ["drowned_mourner", OLD_CHAPEL_PLANE, 3848, 3538],
  ["drowned_ringer", OLD_CHAPEL_PLANE, 3859, 3531],
];

export function buildFenHollows(b: WorldBuilder): void {
  b.clip = HOLLOWS_REGION;
  const surface = b.heightAtCorner(0, HOLLOWS_STAIR.x, HOLLOWS_STAIR.y);
  const lanes = surface - 2 * STOREY, chapel = surface - 4 * STOREY;
  cut(b, HOLLOWS_PLANE, HOLLOWS_REGION, LANES_ROOMS, lanes, () => true);
  cut(b, OLD_CHAPEL_PLANE, HOLLOWS_REGION, OLD_CHAPEL_ROOMS, chapel, () => true);
  // Old Mourn's paving where its street, square and chapel were; the fen's mud where it came in.
  pave(b, HOLLOWS_PLANE, [LANES.street, LANES.square], UNDERLAY_STONE);
  pave(b, HOLLOWS_PLANE, [LANES.drowned], UNDERLAY_FEN);
  pave(b, OLD_CHAPEL_PLANE, [OLD_CHAPEL.nave, OLD_CHAPEL.crypt], UNDERLAY_STONE);
  pave(b, OLD_CHAPEL_PLANE, [OLD_CHAPEL.westEnd], UNDERLAY_FEN);
  flood(b, HOLLOWS_PLANE, LANES_ROOMS, LANES_POOLS, lanes);
  flood(b, OLD_CHAPEL_PLANE, OLD_CHAPEL_ROOMS, [BELL_POOL], chapel);

  // The ways up and down.
  b.place(HOLLOWS_PLANE, "stairs", HOLLOWS_STAIR.x, HOLLOWS_STAIR.y, { to: 0 });
  b.place(HOLLOWS_PLANE, "stairs", CHAPEL_STAIR.x, CHAPEL_STAIR.y, { to: OLD_CHAPEL_PLANE });
  b.place(OLD_CHAPEL_PLANE, "stairs", CHAPEL_STAIR.x, CHAPEL_STAIR.y, { to: HOLLOWS_PLANE });

  // The drowned lanes: the houses' walls, the well, what was in the houses, the churchyard by the porch, fallen stone.
  for (const [x, y, side] of LANES_WALLS) b.place(HOLLOWS_PLANE, "stone_wall", x, y, { side, tag: "ruin" });
  b.place(HOLLOWS_PLANE, "well", OLD_WELL.x, OLD_WELL.y);
  for (const [kind, x, y] of [["barrel", 3864, 3563], ["crate", 3869, 3558], ["barrel", 3884, 3564], ["crate", 3879, 3558]] as const) b.place(HOLLOWS_PLANE, kind, x, y);
  for (const [x, y] of [[3868, 3539], [3876, 3539], [3868, 3533], [3876, 3533]] as const) b.place(HOLLOWS_PLANE, "grave", x, y);
  for (const [x, y] of [[3877, 3576], [3863, 3543], [3843, 3555], [3860, 3539]] as const) b.place(HOLLOWS_PLANE, "rock", x, y);

  // Old Mourn's chapel: its dead in stone down the nave and in the crypt, the old west wall, the fallen roof, the bell and the chest.
  for (const [x, y, side] of OLD_CHAPEL_WALLS) b.place(OLD_CHAPEL_PLANE, "stone_wall", x, y, { side, tag: "ruin" });
  for (const x of [3866, 3878]) for (const y of [3524, 3527, 3534, 3537]) b.place(OLD_CHAPEL_PLANE, "sarcophagus", x, y);
  for (const [x, y] of [[3883, 3534], [3885, 3534], [3887, 3534], [3883, 3528], [3885, 3528], [3887, 3528]] as const) b.place(OLD_CHAPEL_PLANE, "grave", x, y);
  b.place(OLD_CHAPEL_PLANE, "sarcophagus", 3888, 3531);
  for (const [x, y] of [[3846, 3522], [3862, 3523], [3861, 3538], [3855, 3539]] as const) b.place(OLD_CHAPEL_PLANE, "rock", x, y);
  b.place(OLD_CHAPEL_PLANE, "bell", BELL.x, BELL.y);
  b.place(OLD_CHAPEL_PLANE, "chest", HOLLOWS_CHEST.x, HOLLOWS_CHEST.y, { tag: "fenhollows" });

  for (const [monster, plane, x, y] of HOLLOWS_DWELLERS) b.spawnMonster({ monster, x, y, plane });
}

/** Lays an underlay over some rooms' floors. */
function pave(b: WorldBuilder, plane: number, rooms: readonly Box[], underlay: number): void {
  for (const r of rooms) for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) b.setUnderlay(plane, x, y, underlay);
}

/** Black water on the floor inside the pools: a tile of it blocked and its corners let down, as the sewers' channel is. */
function flood(b: WorldBuilder, plane: number, rooms: readonly Box[], pools: ReadonlyArray<{ x: number; y: number; r: number }>, level: number): void {
  const map = b.plane(plane);
  for (const r of rooms) {
    for (let y = r.y0; y <= r.y1; y++) {
      for (let x = r.x0; x <= r.x1; x++) {
        if (!inPool(pools, x, y)) continue;
        b.setOverlay(plane, x, y, OVERLAY_WATER);
        map.collision.block(x, y);
        for (const [cx, cy] of corners(x, y)) b.setHeight(plane, cx, cy, level - 0.35);
      }
    }
  }
}

/** Both planes under Mourn are the Hollows, with the hard places' tune. */
export const HOLLOWS_AREA: Area = { key: "fenhollows", name: "The Fen Hollows", track: TUNE.danger };

/** Whether a tile is in the Hollows' region: what the controls of every site built before it leave out below ground. */
export const inHollows = (x: number, y: number): boolean => inBox(HOLLOWS_REGION, x, y);
