// Chests: what a dungeon puts at the end of itself. A chest is searched, gives one thing from its
// table, and stands open and empty until it fills again — the same weighted roll a kill makes, out of
// the same 128, so a weight reads straight off as its odds. A table whose weights add to 128 never
// comes up empty.
import type { WeightedDrop } from "./monsters.ts";

export interface ChestDef {
  /** Ticks until it can be searched again. */
  respawn: number;
  loot: WeightedDrop[];
}

export const CHEST_DENOMINATOR = 128;

/** Every chest, by the tag its map object carries. */
export const CHESTS: Record<string, ChestDef> = {
  // Stonecote Hollow (PLAN §8.5): coins most often, bait and coal for the two things the hamlet is for,
  // and now and then something to wear on the walk back.
  hollow: {
    respawn: 500,
    loot: [
      { item: "coins", min: 20, max: 60, weight: 44 },
      { item: "bait", min: 5, max: 15, weight: 28 },
      { item: "coal", min: 1, max: 3, weight: 28 },
      { item: "iron_dagger", weight: 14 },
      { item: "bronze_helm", weight: 14 },
    ],
  },
  // Thornbury's old works (PLAN §8.5): what the city lost down its drains — coins, the silver the seam
  // beside it gives, and now and then something the goldsmith upstairs would pay for.
  sewers: {
    respawn: 800,
    loot: [
      { item: "coins", min: 40, max: 120, weight: 52 },
      { item: "silver_ore", min: 1, max: 3, weight: 30 },
      { item: "steel_dagger", weight: 14 },
      { item: "silver_ring", weight: 20 },
      { item: "gold_ring", weight: 12 },
    ],
  },
};
