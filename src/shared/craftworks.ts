// Crafting's workbenches (PLAN Phase 20). C1: a spinning wheel and a loom at the back of Hollowbeck Farm's barn,
// facing its door, beside the pen whose rams give the wool. C3: pottery beside them, as the reference's first
// pottery sits in its starter district: clay rocks at Oakridge's quarry, a trough against the pen's north fence
// to wet the clay at (every well in the world does as well), a potter's wheel inside the barn by its west wall,
// and a kiln outside its east wall. Put in after every roll (placeFixed), so no other object in the world moves,
// and only where the farm stands.
import type { WorldBuilder } from "./worldgen.ts";

export const WHEEL = { x: 3238, y: 3305 };
export const LOOM = { x: 3244, y: 3305 };
export const POTTERS_WHEEL = { x: 3237, y: 3301 };
export const FARM_KILN = { x: 3248, y: 3300 };
export const TROUGH = { x: 3244, y: 3293 };
/**
 * The quarry's clay, at its south end beside the road in from the village: the first rocks a beginner reaches,
 * and out of reach of everything there that starts fights (the bats nest among the west rocks, the scorpions and
 * the brute keep to the north).
 */
export const CLAY_ROCKS: ReadonlyArray<{ x: number; y: number }> = [
  { x: 3285, y: 3267 }, { x: 3288, y: 3269 }, { x: 3291, y: 3267 }, { x: 3288, y: 3265 },
];

export function buildCraftworks(b: WorldBuilder): void {
  b.placeFixed(0, "spinning_wheel", WHEEL.x, WHEEL.y);
  b.placeFixed(0, "loom", LOOM.x, LOOM.y);
  b.placeFixed(0, "potters_wheel", POTTERS_WHEEL.x, POTTERS_WHEEL.y, { side: 1 });
  b.placeFixed(0, "kiln", FARM_KILN.x, FARM_KILN.y);
  b.placeFixed(0, "trough", TROUGH.x, TROUGH.y);
  for (const r of CLAY_ROCKS) b.placeFixed(0, "clay_rock", r.x, r.y);
}
