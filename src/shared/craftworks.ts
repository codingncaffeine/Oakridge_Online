// Crafting's workbenches (PLAN Phase 20, C1): a spinning wheel and a loom at the back of Hollowbeck Farm's barn,
// facing its door, beside the pen whose rams give the wool. Put in after every roll (placeFixed), so no other
// object in the world moves, and only where the farm stands.
import type { WorldBuilder } from "./worldgen.ts";

export const WHEEL = { x: 3238, y: 3305 };
export const LOOM = { x: 3244, y: 3305 };

export function buildCraftworks(b: WorldBuilder): void {
  b.placeFixed(0, "spinning_wheel", WHEEL.x, WHEEL.y);
  b.placeFixed(0, "loom", LOOM.x, LOOM.y);
}
