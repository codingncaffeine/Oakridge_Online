// Phase 8: everything the three gathering ladders turn into. What a recipe consumes is §8's ladders;
// the metal tiers are §8.3. Every level, XP and burn number here is this game's own (PLAN §5).
import { ITEM_BY_KEY } from "./items.ts";
import type { SkillKey } from "./skills.ts";
import type { Station } from "./stations.ts";

/** One material a recipe consumes. */
export interface Ingredient {
  item: string;
  count: number;
}

export interface Recipe {
  /** What it makes, and how many of it one action makes. */
  item: string;
  each: number;
  /** What one action consumes. */
  needs: Ingredient[];
  skill: SkillKey;
  level: number;
  /** XP in tenths, as every skill here keeps it. */
  xp: number;
  /** Where it is made. A fire and a range both cook; only a furnace smelts. */
  at: Station[];
  /**
   * Cooking only: the level at which food stops burning outright, and the chance it burns at level 1.
   * Between the two the chance falls in a straight line, as the classic's does.
   */
  burn?: { stops: number; at1: number };
  /** What a burnt attempt leaves behind. */
  burnt?: string;
  /** A tool that must be in the pack but is not consumed. */
  tool?: string;
}

const need = (item: string, count = 1): Ingredient => ({ item, count });

/** Smelting: what one bar of each metal takes, and the Smithing level it needs (PLAN §8.3). */
const SMELT: ReadonlyArray<{ bar: string; needs: Ingredient[]; level: number; xp: number }> = [
  { bar: "bronze_bar", needs: [need("copper_ore"), need("tin_ore")], level: 1, xp: 65 },
  { bar: "iron_bar", needs: [need("iron_ore")], level: 15, xp: 125 },
  { bar: "silver_bar", needs: [need("silver_ore")], level: 20, xp: 135 },
  { bar: "steel_bar", needs: [need("iron_ore"), need("coal", 2)], level: 30, xp: 175 },
  { bar: "gold_bar", needs: [need("gold_ore")], level: 40, xp: 225 },
  { bar: "coldiron_bar", needs: [need("coldiron_ore"), need("coal", 4)], level: 50, xp: 375 },
  { bar: "emberite_bar", needs: [need("emberite_ore"), need("coal", 6)], level: 70, xp: 500 },
  { bar: "starfall_bar", needs: [need("starfall_ore"), need("coal", 8)], level: 85, xp: 750 },
];

/**
 * What every metal can be hammered into, and what each costs in bars. The pattern is the same for all
 * six metals, so the ladder reads the same whichever one a player is on: the level each takes is the
 * metal's own base level plus the offset here, and the XP is per bar spent.
 */
const FORGE: ReadonlyArray<{ suffix: string; bars: number; offset: number; each?: number }> = [
  { suffix: "dagger", bars: 1, offset: 0 },
  { suffix: "axe", bars: 1, offset: 1 },
  { suffix: "pickaxe", bars: 1, offset: 2 },
  { suffix: "mace", bars: 1, offset: 3 },
  { suffix: "helm", bars: 1, offset: 4 },
  { suffix: "sword", bars: 1, offset: 5 },
  { suffix: "shield", bars: 2, offset: 7 },
];

/** The six metals a blade can be made of, their base Smithing level, and the XP a bar of each is worth. */
const METALS: ReadonlyArray<{ key: string; bar: string; level: number; xpPerBar: number }> = [
  { key: "bronze", bar: "bronze_bar", level: 1, xpPerBar: 125 },
  { key: "iron", bar: "iron_bar", level: 15, xpPerBar: 250 },
  { key: "steel", bar: "steel_bar", level: 30, xpPerBar: 375 },
  { key: "coldiron", bar: "coldiron_bar", level: 50, xpPerBar: 500 },
  { key: "emberite", bar: "emberite_bar", level: 70, xpPerBar: 625 },
  { key: "starfall", bar: "starfall_bar", level: 85, xpPerBar: 750 },
];

/** Cooking: one line per rung of §8.4, plus the two farm meats. */
const COOK: ReadonlyArray<{ raw: string; done: string; level: number; xp: number; stops: number; at1: number; burnt: string }> = [
  { raw: "raw_sardine", done: "sardine", level: 1, xp: 300, stops: 34, at1: 0.4, burnt: "burnt_fish" },
  { raw: "raw_beef", done: "cooked_beef", level: 1, xp: 300, stops: 34, at1: 0.4, burnt: "burnt_meat" },
  { raw: "raw_fowl", done: "cooked_fowl", level: 1, xp: 300, stops: 34, at1: 0.4, burnt: "burnt_meat" },
  { raw: "raw_smelt", done: "smelt", level: 8, xp: 400, stops: 42, at1: 0.45, burnt: "burnt_fish" },
  { raw: "raw_redfin", done: "redfin", level: 20, xp: 600, stops: 54, at1: 0.5, burnt: "burnt_fish" },
  { raw: "raw_grayling", done: "grayling", level: 32, xp: 800, stops: 65, at1: 0.55, burnt: "burnt_fish" },
  { raw: "raw_bay_crab", done: "bay_crab", level: 44, xp: 1000, stops: 76, at1: 0.6, burnt: "burnt_fish" },
  { raw: "raw_blackfish", done: "blackfish", level: 56, xp: 1200, stops: 86, at1: 0.65, burnt: "burnt_fish" },
  { raw: "raw_deepclaw", done: "deepclaw", level: 68, xp: 1400, stops: 94, at1: 0.7, burnt: "burnt_fish" },
  { raw: "raw_hoarfish", done: "hoarfish", level: 80, xp: 1700, stops: 99, at1: 0.75, burnt: "burnt_fish" },
];

/**
 * Firemaking: one tier per woodcutting tier (PLAN §8.2). A fire is not an item — lighting one puts a
 * `fire` object on the ground that burns out — so these are the only recipes with no `item` to add.
 */
export const FIRES: ReadonlyArray<{ logs: string; level: number; xp: number; ticks: number }> = [
  { logs: "logs", level: 1, xp: 400, ticks: 100 },
  { logs: "oak_logs", level: 15, xp: 600, ticks: 140 },
  { logs: "alder_logs", level: 27, xp: 850, ticks: 170 },
  { logs: "rowan_logs", level: 38, xp: 1100, ticks: 200 },
  { logs: "blackthorn_logs", level: 49, xp: 1400, ticks: 230 },
  { logs: "ironbark_logs", level: 61, xp: 1750, ticks: 260 },
  { logs: "sable_logs", level: 73, xp: 2150, ticks: 300 },
  { logs: "heartoak_logs", level: 85, xp: 2600, ticks: 350 },
];

function buildRecipes(): Recipe[] {
  const out: Recipe[] = [];
  for (const s of SMELT) {
    out.push({ item: s.bar, each: 1, needs: [...s.needs], skill: "smithing", level: s.level, xp: s.xp, at: ["furnace"] });
  }
  for (const metal of METALS) {
    for (const shape of FORGE) {
      const key = `${metal.key}_${shape.suffix}`;
      if (!ITEM_BY_KEY.has(key)) continue;
      out.push({
        item: key,
        each: 1,
        needs: [need(metal.bar, shape.bars)],
        skill: "smithing",
        level: metal.level + shape.offset,
        xp: metal.xpPerBar * shape.bars,
        at: ["anvil"],
        tool: "hammer",
      });
    }
  }
  // Arrowheads come fifteen to a bar, which is what makes a bar of bronze worth hammering at level 5.
  for (const metal of METALS.slice(0, 3)) {
    out.push({
      item: `${metal.key}_arrowheads`,
      each: 15,
      needs: [need(metal.bar)],
      skill: "smithing",
      level: metal.level + 4,
      xp: metal.xpPerBar,
      at: ["anvil"],
      tool: "hammer",
    });
  }
  for (const c of COOK) {
    out.push({
      item: c.done,
      each: 1,
      needs: [need(c.raw)],
      skill: "cooking",
      level: c.level,
      xp: c.xp,
      at: ["fire", "range"],
      burn: { stops: c.stops, at1: c.at1 },
      burnt: c.burnt,
    });
  }
  return out;
}

/**
 * Recipes made at a station's "make X" list. Order is permanent once shipped, because a player's
 * repeat-making job names one by index — append, never renumber.
 */
export const RECIPES: Recipe[] = [
  ...buildRecipes(),

  // Crafting: hide to leather at a range's tanning trough, leather to the five pieces, and the two
  // soft metals into jewellery. The leather pieces themselves have existed since Phase 4.
  { item: "leather", each: 1, needs: [need("cowhide"), need("coins", 3)], skill: "crafting", level: 1, xp: 100, at: ["range"] },
  { item: "leather_gloves", each: 1, needs: [need("leather")], skill: "crafting", level: 1, xp: 140, at: ["range"], tool: "needle" },
  { item: "leather_boots", each: 1, needs: [need("leather")], skill: "crafting", level: 7, xp: 165, at: ["range"], tool: "needle" },
  { item: "leather_cap", each: 1, needs: [need("leather")], skill: "crafting", level: 9, xp: 190, at: ["range"], tool: "needle" },
  { item: "leather_trousers", each: 1, needs: [need("leather", 2)], skill: "crafting", level: 14, xp: 280, at: ["range"], tool: "needle" },
  { item: "leather_jerkin", each: 1, needs: [need("leather", 3)], skill: "crafting", level: 18, xp: 400, at: ["range"], tool: "needle" },
  { item: "silver_ring", each: 1, needs: [need("silver_bar")], skill: "crafting", level: 20, xp: 400, at: ["furnace"] },
  { item: "gold_ring", each: 1, needs: [need("gold_bar")], skill: "crafting", level: 40, xp: 600, at: ["furnace"] },
  { item: "gold_amulet", each: 1, needs: [need("gold_bar")], skill: "crafting", level: 48, xp: 700, at: ["furnace"] },

  // Fletching. Ranged itself is Phase 11; what it will shoot is made here.
  { item: "arrow_shafts", each: 15, needs: [need("logs")], skill: "fletching", level: 1, xp: 50, at: ["fire", "range", "anvil"] },
  { item: "bow_string", each: 1, needs: [need("spider_silk")], skill: "fletching", level: 10, xp: 150, at: ["fire", "range", "anvil"] },
  { item: "unstrung_shortbow", each: 1, needs: [need("logs")], skill: "fletching", level: 5, xp: 170, at: ["fire", "range", "anvil"] },
  { item: "unstrung_longbow", each: 1, needs: [need("logs")], skill: "fletching", level: 10, xp: 200, at: ["fire", "range", "anvil"] },
  { item: "unstrung_oak_shortbow", each: 1, needs: [need("oak_logs")], skill: "fletching", level: 20, xp: 330, at: ["fire", "range", "anvil"] },
  { item: "unstrung_oak_longbow", each: 1, needs: [need("oak_logs")], skill: "fletching", level: 25, xp: 400, at: ["fire", "range", "anvil"] },
  {
    item: "shortbow", each: 1, needs: [need("unstrung_shortbow"), need("bow_string")],
    skill: "fletching", level: 5, xp: 170, at: ["fire", "range", "anvil"],
  },
  {
    item: "longbow", each: 1, needs: [need("unstrung_longbow"), need("bow_string")],
    skill: "fletching", level: 10, xp: 200, at: ["fire", "range", "anvil"],
  },
  {
    item: "oak_shortbow", each: 1, needs: [need("unstrung_oak_shortbow"), need("bow_string")],
    skill: "fletching", level: 20, xp: 330, at: ["fire", "range", "anvil"],
  },
  {
    item: "oak_longbow", each: 1, needs: [need("unstrung_oak_longbow"), need("bow_string")],
    skill: "fletching", level: 25, xp: 400, at: ["fire", "range", "anvil"],
  },
  {
    item: "bronze_arrow", each: 15, needs: [need("arrow_shafts", 15), need("feather", 15), need("bronze_arrowheads", 15)],
    skill: "fletching", level: 1, xp: 130, at: ["fire", "range", "anvil"],
  },
  {
    item: "iron_arrow", each: 15, needs: [need("arrow_shafts", 15), need("feather", 15), need("iron_arrowheads", 15)],
    skill: "fletching", level: 15, xp: 250, at: ["fire", "range", "anvil"],
  },
  {
    item: "steel_arrow", each: 15, needs: [need("arrow_shafts", 15), need("feather", 15), need("steel_arrowheads", 15)],
    skill: "fletching", level: 30, xp: 375, at: ["fire", "range", "anvil"],
  },
];

/** Which recipes a station offers, by index into `RECIPES`. */
export function recipesAt(station: Station): number[] {
  return RECIPES.map((r, i) => (r.at.includes(station) ? i : -1)).filter((i) => i >= 0);
}

/**
 * The chance a cook ruins something at `level`. It falls in a straight line from the recipe's
 * level-1 chance to nothing at the level it stops burning, as the classic's does.
 */
export function burnChance(recipe: Recipe, level: number): number {
  if (!recipe.burn) return 0;
  const { stops, at1 } = recipe.burn;
  if (level >= stops) return 0;
  return Math.max(0, at1 * ((stops - level) / Math.max(1, stops - 1)));
}

/** The fire tier a kind of logs lights, or undefined if they aren't logs. */
export const FIRE_BY_LOGS = new Map(FIRES.map((f) => [f.logs, f]));
