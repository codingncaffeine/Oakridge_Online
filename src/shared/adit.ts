// The Copperfoot Adit (PLAN §8.5, the district's first dungeon, opened in Wave 2): the barred mouth in
// the quarry's east wall that Phase 7 built shut is a stair now, down to one plane of old workings under
// the quarry — the entry drift from the mouth, the first chamber with three coal seams along its north
// face, a crooked passage on, and the deep chamber with four more down its west face, fallen rock about,
// bats by the mouth and in the deep, rats in between, the brute that kept the quarrymen out, and the
// chest they left behind. Coal at Mining 22, as §8.3's ladder has it: the quarry's deep floor, then this.
//
// Built LAST, after every site, on the quarry's own region alone and on plane −1, and with nothing here
// rolled — every seam, rock and creature stands at a written tile — so a world built without it is the
// same world everywhere else (tests/adit.test.ts holds that), and the mouth's object keeps its id either
// way: the quarry places the stair or the bars in the same breath.
import { REGION, regionOf } from "./map.ts";
import type { Area } from "./oakridge.ts";
import { cut } from "./thornbury.ts";
import { boxOf, STOREY, WorldBuilder, type Box } from "./worldgen.ts";
import { TUNE } from "./tunes.ts";

export const ADIT_PLANE = -1;
/** The mouth: the tile in the quarry's east wall where the bars stood, and the stair down now. */
export const ADIT_MOUTH = { x: 3320, y: 3296 };
/** The region under the quarry the workings are cut into: everything else on it is rock. */
export const ADIT_REGION: Box = boxOf(
  regionOf(ADIT_MOUTH.x) * REGION, regionOf(ADIT_MOUTH.y) * REGION,
  regionOf(ADIT_MOUTH.x) * REGION + REGION - 1, regionOf(ADIT_MOUTH.y) * REGION + REGION - 1,
);
/** The rooms: the entry drift from the mouth, the first chamber, the crooked passage on, and the deep chamber. */
export const ADIT_ROOMS: readonly [Box, Box, Box, Box] = [
  boxOf(3308, 3295, 3320, 3297),
  boxOf(3294, 3290, 3307, 3302),
  boxOf(3284, 3291, 3293, 3293),
  boxOf(3268, 3280, 3283, 3298),
];
export const ADIT_CHEST = { x: 3269, y: 3297 };
/** The seams: three along the first chamber's north face, four down the deep chamber's west face. */
export const ADIT_SEAMS: ReadonlyArray<{ x: number; y: number }> = [
  { x: 3296, y: 3302 }, { x: 3300, y: 3302 }, { x: 3304, y: 3302 },
  { x: 3268, y: 3283 }, { x: 3268, y: 3287 }, { x: 3268, y: 3291 }, { x: 3268, y: 3295 },
];
/** Fallen rock, at written tiles. */
const FALLEN: ReadonlyArray<readonly [number, number]> = [[3300, 3293], [3306, 3300], [3275, 3282], [3281, 3294], [3272, 3290]];
/** Who is down here, each at a written tile: bats by the mouth and in the deep, rats between, the brute at the chest. */
const BELOW: ReadonlyArray<readonly [string, number, number]> = [
  ["cave_bat", 3312, 3296], ["cave_bat", 3316, 3297], ["cave_bat", 3298, 3292], ["cave_bat", 3303, 3299],
  ["cave_bat", 3277, 3285], ["cave_bat", 3280, 3290], ["cave_bat", 3273, 3296],
  ["giant_rat", 3297, 3297], ["giant_rat", 3302, 3294], ["giant_rat", 3305, 3301], ["giant_rat", 3288, 3292],
  ["quarry_brute", 3272, 3294],
];

export function buildAdit(b: WorldBuilder): void {
  b.clip = ADIT_REGION;
  const level = b.heightAtCorner(0, ADIT_MOUTH.x, ADIT_MOUTH.y) - 2 * STOREY;
  cut(b, ADIT_PLANE, ADIT_REGION, ADIT_ROOMS, level, () => true);
  // The stair back up, on the tile the one above comes down to.
  b.place(ADIT_PLANE, "stairs", ADIT_MOUTH.x, ADIT_MOUTH.y, { to: 0 });
  for (const s of ADIT_SEAMS) b.place(ADIT_PLANE, "coal_rock", s.x, s.y);
  b.place(ADIT_PLANE, "chest", ADIT_CHEST.x, ADIT_CHEST.y, { tag: "adit" });
  for (const [x, y] of FALLEN) b.place(ADIT_PLANE, "rock", x, y);
  for (const [monster, x, y] of BELOW) b.spawnMonster({ monster, x, y, plane: ADIT_PLANE });
}

/** Below the quarry it is the Adit, with the harder tune the quarry itself has. */
export const ADIT_AREA: Area = { key: "adit", name: "The Copperfoot Adit", track: TUNE.danger };

/** Named boxes, for the tests and the map. */
export const ADIT_SITES: Record<string, Box> = { adit: ADIT_REGION };
