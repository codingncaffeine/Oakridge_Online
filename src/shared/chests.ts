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

/**
 * The Copperfoot Adit (PLAN §8.5, opened in Wave 2): what the quarrymen left below when the bars went
 * up — coins, the coal the seams beside it give, iron ore, and now and then a pick or a helm.
 */
CHESTS["adit"] = {
  respawn: 500,
  loot: [
    { item: "coins", min: 30, max: 80, weight: 44 },
    { item: "coal", min: 2, max: 5, weight: 34 },
    { item: "iron_ore", min: 1, max: 3, weight: 26 },
    { item: "bronze_pickaxe", weight: 12 },
    { item: "iron_helm", weight: 12 },
  ],
};

/**
 * The Searmouth's heart (PLAN §8.5, Wave 2): what the mountain keeps at the bottom of itself — the red
 * ore, coins, and now and then a coldiron blade nobody came back up with.
 */
CHESTS["searmouth"] = {
  respawn: 900,
  loot: [
    { item: "coins", min: 80, max: 260, weight: 46 },
    { item: "emberite_ore", min: 1, max: 3, weight: 34 },
    { item: "coal", min: 3, max: 8, weight: 24 },
    { item: "coldiron_dagger", weight: 16 },
    { item: "coldiron_sword", weight: 8 },
  ],
};

/**
 * Deepdelve Mine's gold vault (PLAN §8.5, Wave 3): what the miners left when the haunt took the vault —
 * coins, the gold and coldiron the seams give, a pick, and now and then a ring the goldsmith would want.
 */
CHESTS["deepdelve"] = {
  respawn: 700,
  loot: [
    { item: "coins", min: 60, max: 200, weight: 44 },
    { item: "gold_ore", min: 1, max: 2, weight: 26 },
    { item: "coldiron_ore", min: 1, max: 2, weight: 26 },
    { item: "steel_pickaxe", weight: 16 },
    { item: "gold_ring", weight: 16 },
  ],
};

/**
 * The tomb at the bottom of Ashbarrow Deep (PLAN §8.5, Wave 3): what was buried with whatever the
 * barrow was raised over — coins, its bones, a ring, and now and then a blade or a helm.
 */
CHESTS["ashbarrow"] = {
  respawn: 600,
  loot: [
    { item: "coins", min: 40, max: 120, weight: 44 },
    { item: "bones", min: 2, max: 4, weight: 28 },
    { item: "silver_ring", weight: 24 },
    { item: "iron_sword", weight: 20 },
    { item: "steel_helm", weight: 12 },
  ],
};

/**
 * The bottom of the Rift under the Broken Tower (PLAN §8.5, Wave 3): the richest chest on the map, at the
 * far end of its worst company — coins, the starfall the seam beside it gives, bars and a blade of the top metals.
 */
CHESTS["rift"] = {
  respawn: 1200,
  loot: [
    { item: "coins", min: 300, max: 900, weight: 44 },
    { item: "starfall_ore", min: 1, max: 2, weight: 30 },
    { item: "emberite_bar", weight: 24 },
    { item: "starfall_dagger", weight: 16 },
    { item: "emberite_helm", weight: 14 },
  ],
};

/**
 * The Fen Hollows (PLAN §8.5, Wave 4): what old Mourn's ringer keeps behind him at the bottom of the
 * chapel — the village's coins, the runes a burial was paid for with, a burial's gold, and now and then
 * a coldiron blade someone came down with.
 */
CHESTS["fenhollows"] = {
  respawn: 1000,
  loot: [
    { item: "coins", min: 200, max: 600, weight: 44 },
    { item: "grave_rune", min: 3, max: 8, weight: 26 },
    { item: "heart_rune", min: 1, max: 3, weight: 22 },
    { item: "gold_amulet", weight: 20 },
    { item: "coldiron_sword", weight: 16 },
  ],
};
