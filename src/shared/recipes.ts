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
  /** Smelting only: the least `furnaceHeat` that runs it. 1 when left out. */
  heat?: number;
  /** What comes back with the product: the empty bucket a bucket of sand leaves when it is melted into glass. */
  returns?: Ingredient[];
}

const need = (item: string, count = 1): Ingredient => ({ item, count });

/**
 * Smelting: what one bar of each metal takes, the Smithing level it needs, and how hot a furnace it
 * wants (PLAN §8.3): any furnace runs bronze, iron, silver, steel and gold; coldiron and emberite want
 * Kilnhold's or Deepdelve's; starfall Deepdelve's alone.
 */
const SMELT: ReadonlyArray<{ bar: string; needs: Ingredient[]; level: number; xp: number; heat?: number }> = [
  { bar: "bronze_bar", needs: [need("copper_ore"), need("tin_ore")], level: 1, xp: 65 },
  { bar: "iron_bar", needs: [need("iron_ore")], level: 15, xp: 125 },
  { bar: "silver_bar", needs: [need("silver_ore")], level: 20, xp: 135 },
  { bar: "steel_bar", needs: [need("iron_ore"), need("coal", 2)], level: 30, xp: 175 },
  { bar: "gold_bar", needs: [need("gold_ore")], level: 40, xp: 225 },
  { bar: "coldiron_bar", needs: [need("coldiron_ore"), need("coal", 4)], level: 50, xp: 375, heat: 2 },
  { bar: "emberite_bar", needs: [need("emberite_ore"), need("coal", 6)], level: 70, xp: 500, heat: 2 },
  { bar: "starfall_bar", needs: [need("starfall_ore"), need("coal", 8)], level: 85, xp: 750, heat: 3 },
];

/**
 * How hot a furnace runs, from the tag it was built with: a village furnace is 1, Kilnhold's `hot`
 * furnaces 2, Deepdelve's `white` 3. A bar needing more heat than the furnace has is shown and refused,
 * and the refusal says where to take it.
 */
export function furnaceHeat(tag: string | undefined): number {
  return tag === "white" ? 3 : tag === "hot" ? 2 : 1;
}

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
  { logs: "logs", level: 1, xp: 400, ticks: 300 },
  { logs: "oak_logs", level: 15, xp: 600, ticks: 340 },
  { logs: "alder_logs", level: 27, xp: 850, ticks: 370 },
  { logs: "rowan_logs", level: 38, xp: 1100, ticks: 400 },
  { logs: "blackthorn_logs", level: 49, xp: 1400, ticks: 430 },
  { logs: "ironbark_logs", level: 61, xp: 1750, ticks: 460 },
  { logs: "sable_logs", level: 73, xp: 2150, ticks: 500 },
  { logs: "heartoak_logs", level: 85, xp: 2600, ticks: 550 },
];

function buildRecipes(): Recipe[] {
  const out: Recipe[] = [];
  for (const s of SMELT) {
    out.push({ item: s.bar, each: 1, needs: [...s.needs], skill: "smithing", level: s.level, xp: s.xp, at: ["furnace"], heat: s.heat ?? 1 });
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
  // Crafting, built out (C1): a ram's wool spun into a ball at a wheel, and four balls woven into cloth at a
  // loom, at the reference's levels and XP.
  { item: "ball_of_wool", each: 1, needs: [need("wool")], skill: "crafting", level: 1, xp: 25, at: ["wheel"] },
  { item: "wool_cloth", each: 1, needs: [need("ball_of_wool", 4)], skill: "crafting", level: 10, xp: 120, at: ["loom"] },
  // Crafting, built out (C3): pottery at the reference's levels and XP. Clay is softened at a well or a trough
  // (no XP), shaped at a potter's wheel, and fired in a kiln, each piece at the level it was shaped at.
  { item: "soft_clay", each: 1, needs: [need("clay")], skill: "crafting", level: 1, xp: 0, at: ["water"] },
  { item: "unfired_pot", each: 1, needs: [need("soft_clay")], skill: "crafting", level: 1, xp: 63, at: ["potter"] },
  { item: "unfired_pie_dish", each: 1, needs: [need("soft_clay")], skill: "crafting", level: 7, xp: 150, at: ["potter"] },
  { item: "unfired_bowl", each: 1, needs: [need("soft_clay")], skill: "crafting", level: 8, xp: 180, at: ["potter"] },
  { item: "unfired_plant_pot", each: 1, needs: [need("soft_clay")], skill: "crafting", level: 19, xp: 200, at: ["potter"] },
  { item: "unfired_pot_lid", each: 1, needs: [need("soft_clay")], skill: "crafting", level: 25, xp: 200, at: ["potter"] },
  { item: "pot", each: 1, needs: [need("unfired_pot")], skill: "crafting", level: 1, xp: 63, at: ["kiln"] },
  { item: "pie_dish", each: 1, needs: [need("unfired_pie_dish")], skill: "crafting", level: 7, xp: 100, at: ["kiln"] },
  { item: "bowl", each: 1, needs: [need("unfired_bowl")], skill: "crafting", level: 8, xp: 150, at: ["kiln"] },
  { item: "plant_pot", each: 1, needs: [need("unfired_plant_pot")], skill: "crafting", level: 19, xp: 175, at: ["kiln"] },
  { item: "pot_lid", each: 1, needs: [need("unfired_pot_lid")], skill: "crafting", level: 25, xp: 200, at: ["kiln"] },
  // Bags (C2), sewn at the loom with a needle: every size up takes more of everything, and something harder to
  // come by (a buckle of better metal, wolf pelts, spider silk), up to the large backpack's emberite at 75.
  { item: "small_pouch", each: 1, needs: [need("leather"), need("thread")], skill: "crafting", level: 5, xp: 200, at: ["loom"], tool: "needle" },
  { item: "large_pouch", each: 1, needs: [need("leather", 2), need("wool_cloth"), need("thread", 2)], skill: "crafting", level: 15, xp: 350, at: ["loom"], tool: "needle" },
  {
    item: "small_bag", each: 1, needs: [need("wool_cloth", 3), need("leather", 2), need("iron_bar"), need("thread", 3)],
    skill: "crafting", level: 28, xp: 600, at: ["loom"], tool: "needle",
  },
  {
    item: "large_bag", each: 1, needs: [need("wool_cloth", 5), need("leather", 3), need("wolf_pelt", 2), need("steel_bar"), need("thread", 5)],
    skill: "crafting", level: 42, xp: 950, at: ["loom"], tool: "needle",
  },
  {
    item: "small_backpack", each: 1,
    needs: [need("wool_cloth", 6), need("leather", 5), need("wolf_pelt", 3), need("spider_silk", 3), need("coldiron_bar", 2), need("thread", 8)],
    skill: "crafting", level: 58, xp: 1500, at: ["loom"], tool: "needle",
  },
  {
    item: "large_backpack", each: 1,
    needs: [need("wool_cloth", 8), need("leather", 8), need("wolf_pelt", 4), need("spider_silk", 5), need("emberite_bar", 2), need("thread", 12)],
    skill: "crafting", level: 75, xp: 2400, at: ["loom"], tool: "needle",
  },
  { item: "leather_gloves", each: 1, needs: [need("leather")], skill: "crafting", level: 1, xp: 140, at: ["range"], tool: "needle" },
  { item: "leather_boots", each: 1, needs: [need("leather")], skill: "crafting", level: 7, xp: 165, at: ["range"], tool: "needle" },
  { item: "leather_cap", each: 1, needs: [need("leather")], skill: "crafting", level: 9, xp: 190, at: ["range"], tool: "needle" },
  { item: "leather_trousers", each: 1, needs: [need("leather", 2)], skill: "crafting", level: 14, xp: 280, at: ["range"], tool: "needle" },
  { item: "leather_jerkin", each: 1, needs: [need("leather", 3)], skill: "crafting", level: 18, xp: 400, at: ["range"], tool: "needle" },
  // Crafting, built out (C4): the rest of the leather ladder at the reference's levels and XP. Hard leather is tanned
  // like the soft, for more coins; studs are hammered out of steel and set into a jerkin or a pair of trousers.
  { item: "leather_vambraces", each: 1, needs: [need("leather")], skill: "crafting", level: 11, xp: 220, at: ["range"], tool: "needle" },
  { item: "hard_leather", each: 1, needs: [need("cowhide"), need("coins", 8)], skill: "crafting", level: 28, xp: 100, at: ["range"] },
  { item: "hard_leather_body", each: 1, needs: [need("hard_leather")], skill: "crafting", level: 28, xp: 350, at: ["range"], tool: "needle" },
  { item: "leather_coif", each: 1, needs: [need("leather")], skill: "crafting", level: 38, xp: 370, at: ["range"], tool: "needle" },
  { item: "steel_studs", each: 1, needs: [need("steel_bar")], skill: "smithing", level: 36, xp: 375, at: ["anvil"], tool: "hammer" },
  { item: "studded_jerkin", each: 1, needs: [need("leather_jerkin"), need("steel_studs")], skill: "crafting", level: 41, xp: 400, at: ["range"] },
  { item: "studded_trousers", each: 1, needs: [need("leather_trousers"), need("steel_studs")], skill: "crafting", level: 44, xp: 420, at: ["range"] },
  // Hides (C4): each tier's hide tanned at a range, then sewn, at the reference's levels and XP for its hide armour.
  ...hideRecipes("stalker", [57, 60, 63], [620, 1240, 1860]),
  ...hideRecipes("hound", [66, 68, 71], [700, 1400, 2100]),
  ...hideRecipes("drake", [73, 75, 77], [780, 1560, 2340]),
  // Glass (C5), at the reference's levels and XP: a bucket filled at a sandpit and seaweed burnt to ash (no XP for
  // either), the two melted together at a furnace (the bucket comes back), and the glass blown there with the pipe.
  { item: "bucket_of_sand", each: 1, needs: [need("bucket")], skill: "crafting", level: 1, xp: 0, at: ["sand"] },
  { item: "soda_ash", each: 1, needs: [need("seaweed")], skill: "crafting", level: 1, xp: 0, at: ["fire", "range"] },
  { item: "molten_glass", each: 1, needs: [need("bucket_of_sand"), need("soda_ash")], skill: "crafting", level: 1, xp: 200, at: ["furnace"], returns: [need("bucket")] },
  ...blown([["beer_glass", 1, 175], ["candle_lantern", 4, 190], ["oil_lamp", 12, 250], ["vial", 33, 350], ["fishbowl", 42, 425], ["glass_orb", 46, 525], ["lantern_lens", 49, 550], ["light_orb", 87, 700]]),
  { item: "silver_ring", each: 1, needs: [need("silver_bar")], skill: "crafting", level: 20, xp: 400, at: ["furnace"] },
  { item: "gold_ring", each: 1, needs: [need("gold_bar")], skill: "crafting", level: 5, xp: 150, at: ["furnace"] },
  { item: "gold_amulet", each: 1, needs: [need("gold_bar")], skill: "crafting", level: 8, xp: 300, at: ["furnace"] },
  // Gem jewellery at a furnace (the magic plan, stage A5b): a bar and a cut gem, at the reference's levels and XP.
  { item: "gold_necklace", each: 1, needs: [need("gold_bar")], skill: "crafting", level: 6, xp: 200, at: ["furnace"] },
  { item: "gold_bracelet", each: 1, needs: [need("gold_bar")], skill: "crafting", level: 7, xp: 250, at: ["furnace"] },
  { item: "opal_ring", each: 1, needs: [need("silver_bar"), need("opal")], skill: "crafting", level: 1, xp: 100, at: ["furnace"] },
  { item: "opal_necklace", each: 1, needs: [need("silver_bar"), need("opal")], skill: "crafting", level: 16, xp: 350, at: ["furnace"] },
  { item: "opal_bracelet", each: 1, needs: [need("silver_bar"), need("opal")], skill: "crafting", level: 22, xp: 450, at: ["furnace"] },
  { item: "opal_amulet", each: 1, needs: [need("silver_bar"), need("opal")], skill: "crafting", level: 27, xp: 550, at: ["furnace"] },
  { item: "jade_ring", each: 1, needs: [need("silver_bar"), need("jade")], skill: "crafting", level: 13, xp: 320, at: ["furnace"] },
  { item: "jade_necklace", each: 1, needs: [need("silver_bar"), need("jade")], skill: "crafting", level: 25, xp: 540, at: ["furnace"] },
  { item: "jade_bracelet", each: 1, needs: [need("silver_bar"), need("jade")], skill: "crafting", level: 29, xp: 600, at: ["furnace"] },
  { item: "jade_amulet", each: 1, needs: [need("silver_bar"), need("jade")], skill: "crafting", level: 34, xp: 700, at: ["furnace"] },
  { item: "topaz_ring", each: 1, needs: [need("silver_bar"), need("red_topaz")], skill: "crafting", level: 16, xp: 350, at: ["furnace"] },
  { item: "topaz_necklace", each: 1, needs: [need("silver_bar"), need("red_topaz")], skill: "crafting", level: 32, xp: 700, at: ["furnace"] },
  { item: "topaz_bracelet", each: 1, needs: [need("silver_bar"), need("red_topaz")], skill: "crafting", level: 38, xp: 750, at: ["furnace"] },
  { item: "topaz_amulet", each: 1, needs: [need("silver_bar"), need("red_topaz")], skill: "crafting", level: 45, xp: 800, at: ["furnace"] },
  { item: "sapphire_ring", each: 1, needs: [need("gold_bar"), need("sapphire")], skill: "crafting", level: 20, xp: 400, at: ["furnace"] },
  { item: "sapphire_necklace", each: 1, needs: [need("gold_bar"), need("sapphire")], skill: "crafting", level: 22, xp: 550, at: ["furnace"] },
  { item: "sapphire_bracelet", each: 1, needs: [need("gold_bar"), need("sapphire")], skill: "crafting", level: 23, xp: 600, at: ["furnace"] },
  { item: "sapphire_amulet", each: 1, needs: [need("gold_bar"), need("sapphire")], skill: "crafting", level: 24, xp: 650, at: ["furnace"] },
  { item: "emerald_ring", each: 1, needs: [need("gold_bar"), need("emerald")], skill: "crafting", level: 27, xp: 550, at: ["furnace"] },
  { item: "emerald_necklace", each: 1, needs: [need("gold_bar"), need("emerald")], skill: "crafting", level: 29, xp: 600, at: ["furnace"] },
  { item: "emerald_bracelet", each: 1, needs: [need("gold_bar"), need("emerald")], skill: "crafting", level: 30, xp: 650, at: ["furnace"] },
  { item: "emerald_amulet", each: 1, needs: [need("gold_bar"), need("emerald")], skill: "crafting", level: 31, xp: 700, at: ["furnace"] },
  { item: "ruby_ring", each: 1, needs: [need("gold_bar"), need("ruby")], skill: "crafting", level: 34, xp: 700, at: ["furnace"] },
  { item: "ruby_necklace", each: 1, needs: [need("gold_bar"), need("ruby")], skill: "crafting", level: 40, xp: 750, at: ["furnace"] },
  { item: "ruby_bracelet", each: 1, needs: [need("gold_bar"), need("ruby")], skill: "crafting", level: 42, xp: 800, at: ["furnace"] },
  { item: "ruby_amulet", each: 1, needs: [need("gold_bar"), need("ruby")], skill: "crafting", level: 50, xp: 850, at: ["furnace"] },
  { item: "diamond_ring", each: 1, needs: [need("gold_bar"), need("diamond")], skill: "crafting", level: 43, xp: 850, at: ["furnace"] },
  { item: "diamond_necklace", each: 1, needs: [need("gold_bar"), need("diamond")], skill: "crafting", level: 56, xp: 900, at: ["furnace"] },
  { item: "diamond_bracelet", each: 1, needs: [need("gold_bar"), need("diamond")], skill: "crafting", level: 58, xp: 950, at: ["furnace"] },
  { item: "diamond_amulet", each: 1, needs: [need("gold_bar"), need("diamond")], skill: "crafting", level: 70, xp: 1000, at: ["furnace"] },
  { item: "wyrmstone_ring", each: 1, needs: [need("gold_bar"), need("wyrmstone")], skill: "crafting", level: 55, xp: 1000, at: ["furnace"] },
  { item: "wyrmstone_necklace", each: 1, needs: [need("gold_bar"), need("wyrmstone")], skill: "crafting", level: 72, xp: 1050, at: ["furnace"] },
  { item: "wyrmstone_bracelet", each: 1, needs: [need("gold_bar"), need("wyrmstone")], skill: "crafting", level: 74, xp: 1100, at: ["furnace"] },
  { item: "wyrmstone_amulet", each: 1, needs: [need("gold_bar"), need("wyrmstone")], skill: "crafting", level: 80, xp: 1500, at: ["furnace"] },
  { item: "onyx_ring", each: 1, needs: [need("gold_bar"), need("onyx")], skill: "crafting", level: 67, xp: 1150, at: ["furnace"] },
  { item: "onyx_necklace", each: 1, needs: [need("gold_bar"), need("onyx")], skill: "crafting", level: 82, xp: 1200, at: ["furnace"] },
  { item: "onyx_bracelet", each: 1, needs: [need("gold_bar"), need("onyx")], skill: "crafting", level: 84, xp: 1250, at: ["furnace"] },
  { item: "onyx_amulet", each: 1, needs: [need("gold_bar"), need("onyx")], skill: "crafting", level: 90, xp: 1650, at: ["furnace"] },
  { item: "sunstone_ring", each: 1, needs: [need("gold_bar"), need("sunstone")], skill: "crafting", level: 89, xp: 1500, at: ["furnace"] },
  { item: "sunstone_necklace", each: 1, needs: [need("gold_bar"), need("sunstone")], skill: "crafting", level: 92, xp: 1650, at: ["furnace"] },
  { item: "sunstone_bracelet", each: 1, needs: [need("gold_bar"), need("sunstone")], skill: "crafting", level: 95, xp: 1800, at: ["furnace"] },
  { item: "sunstone_amulet", each: 1, needs: [need("gold_bar"), need("sunstone")], skill: "crafting", level: 98, xp: 2000, at: ["furnace"] },
  // Gem tips and tipped arrows (the magic plan, stage A5d): Fletching at the reference's levels, hand work.
  { item: "opal_tips", each: 12, needs: [need("opal")], skill: "fletching", level: 11, xp: 60, at: ["fire", "range", "anvil"], tool: "chisel" },
  { item: "opal_tipped_arrow", each: 10, needs: [need("iron_arrow", 10), need("opal_tips", 10)], skill: "fletching", level: 11, xp: 160, at: ["fire", "range", "anvil"] },
  { item: "jade_tips", each: 12, needs: [need("jade")], skill: "fletching", level: 26, xp: 80, at: ["fire", "range", "anvil"], tool: "chisel" },
  { item: "jade_tipped_arrow", each: 10, needs: [need("iron_arrow", 10), need("jade_tips", 10)], skill: "fletching", level: 26, xp: 240, at: ["fire", "range", "anvil"] },
  { item: "topaz_tips", each: 12, needs: [need("red_topaz")], skill: "fletching", level: 48, xp: 100, at: ["fire", "range", "anvil"], tool: "chisel" },
  { item: "topaz_tipped_arrow", each: 10, needs: [need("iron_arrow", 10), need("topaz_tips", 10)], skill: "fletching", level: 48, xp: 390, at: ["fire", "range", "anvil"] },
  { item: "sapphire_tips", each: 12, needs: [need("sapphire")], skill: "fletching", level: 56, xp: 200, at: ["fire", "range", "anvil"], tool: "chisel" },
  { item: "sapphire_tipped_arrow", each: 10, needs: [need("steel_arrow", 10), need("sapphire_tips", 10)], skill: "fletching", level: 56, xp: 470, at: ["fire", "range", "anvil"] },
  { item: "emerald_tips", each: 12, needs: [need("emerald")], skill: "fletching", level: 58, xp: 270, at: ["fire", "range", "anvil"], tool: "chisel" },
  { item: "emerald_tipped_arrow", each: 10, needs: [need("steel_arrow", 10), need("emerald_tips", 10)], skill: "fletching", level: 58, xp: 550, at: ["fire", "range", "anvil"] },
  { item: "ruby_tips", each: 12, needs: [need("ruby")], skill: "fletching", level: 63, xp: 340, at: ["fire", "range", "anvil"], tool: "chisel" },
  { item: "ruby_tipped_arrow", each: 10, needs: [need("steel_arrow", 10), need("ruby_tips", 10)], skill: "fletching", level: 63, xp: 630, at: ["fire", "range", "anvil"] },
  { item: "diamond_tips", each: 12, needs: [need("diamond")], skill: "fletching", level: 65, xp: 430, at: ["fire", "range", "anvil"], tool: "chisel" },
  { item: "diamond_tipped_arrow", each: 10, needs: [need("steel_arrow", 10), need("diamond_tips", 10)], skill: "fletching", level: 65, xp: 700, at: ["fire", "range", "anvil"] },
  { item: "wyrmstone_tips", each: 12, needs: [need("wyrmstone")], skill: "fletching", level: 71, xp: 550, at: ["fire", "range", "anvil"], tool: "chisel" },
  { item: "wyrmstone_tipped_arrow", each: 10, needs: [need("steel_arrow", 10), need("wyrmstone_tips", 10)], skill: "fletching", level: 71, xp: 820, at: ["fire", "range", "anvil"] },
  { item: "onyx_tips", each: 12, needs: [need("onyx")], skill: "fletching", level: 73, xp: 670, at: ["fire", "range", "anvil"], tool: "chisel" },
  { item: "onyx_tipped_arrow", each: 10, needs: [need("steel_arrow", 10), need("onyx_tips", 10)], skill: "fletching", level: 73, xp: 940, at: ["fire", "range", "anvil"] },
  // Cutting gems with a chisel (the magic plan, stage A5): the reference's levels and XP, hand work as fletching is.
  { item: "opal", each: 1, needs: [need("uncut_opal")], skill: "crafting", level: 1, xp: 150, at: ["fire", "range", "anvil"], tool: "chisel" },
  { item: "jade", each: 1, needs: [need("uncut_jade")], skill: "crafting", level: 13, xp: 200, at: ["fire", "range", "anvil"], tool: "chisel" },
  { item: "red_topaz", each: 1, needs: [need("uncut_red_topaz")], skill: "crafting", level: 16, xp: 250, at: ["fire", "range", "anvil"], tool: "chisel" },
  { item: "sapphire", each: 1, needs: [need("uncut_sapphire")], skill: "crafting", level: 20, xp: 500, at: ["fire", "range", "anvil"], tool: "chisel" },
  { item: "emerald", each: 1, needs: [need("uncut_emerald")], skill: "crafting", level: 27, xp: 675, at: ["fire", "range", "anvil"], tool: "chisel" },
  { item: "ruby", each: 1, needs: [need("uncut_ruby")], skill: "crafting", level: 34, xp: 850, at: ["fire", "range", "anvil"], tool: "chisel" },
  { item: "diamond", each: 1, needs: [need("uncut_diamond")], skill: "crafting", level: 43, xp: 1075, at: ["fire", "range", "anvil"], tool: "chisel" },
  { item: "wyrmstone", each: 1, needs: [need("uncut_wyrmstone")], skill: "crafting", level: 55, xp: 1375, at: ["fire", "range", "anvil"], tool: "chisel" },
  { item: "onyx", each: 1, needs: [need("uncut_onyx")], skill: "crafting", level: 67, xp: 1675, at: ["fire", "range", "anvil"], tool: "chisel" },
  { item: "sunstone", each: 1, needs: [need("uncut_sunstone")], skill: "crafting", level: 89, xp: 2000, at: ["fire", "range", "anvil"], tool: "chisel" },
  // A silver circlet (Runesmithing): a charm set in one at its altar lets the altar answer without the charm in the pack.
  { item: "silver_circlet", each: 1, needs: [need("silver_bar")], skill: "crafting", level: 23, xp: 525, at: ["furnace"] },
  // A charged orb set in a battlestaff's head (the magic plan, stage A4), at the reference's levels and XP; hand work, as fletching is.
  { item: "tide_battlestaff", each: 1, needs: [need("battlestaff"), need("tide_orb")], skill: "crafting", level: 54, xp: 1000, at: ["fire", "range", "anvil"] },
  { item: "stone_battlestaff", each: 1, needs: [need("battlestaff"), need("stone_orb")], skill: "crafting", level: 58, xp: 1125, at: ["fire", "range", "anvil"] },
  { item: "ember_battlestaff", each: 1, needs: [need("battlestaff"), need("ember_orb")], skill: "crafting", level: 62, xp: 1250, at: ["fire", "range", "anvil"] },
  { item: "gale_battlestaff", each: 1, needs: [need("battlestaff"), need("gale_orb")], skill: "crafting", level: 66, xp: 1375, at: ["fire", "range", "anvil"] },

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

/**
 * One tier of hide armour (Crafting, C4): the hide tanned at a range for 20 coins at the tier's first level, then its
 * vambraces, chaps and body sewn from one, two and three of the leather.
 */
function hideRecipes(key: string, levels: [number, number, number], xp: [number, number, number]): Recipe[] {
  const sew = (piece: string, count: number, i: number): Recipe => ({
    item: `${key}hide_${piece}`, each: 1, needs: [need(`${key}_leather`, count)], skill: "crafting", level: levels[i]!, xp: xp[i]!, at: ["range"], tool: "needle",
  });
  return [
    { item: `${key}_leather`, each: 1, needs: [need(`${key}_hide`), need("coins", 20)], skill: "crafting", level: levels[0], xp: 100, at: ["range"] },
    sew("vambraces", 1, 0), sew("chaps", 2, 1), sew("body", 3, 2),
  ];
}

/** Glassblowing (Crafting, C5): each piece from one molten glass at a furnace, with the pipe in the pack. */
function blown(pieces: Array<[item: string, level: number, xp: number]>): Recipe[] {
  return pieces.map(([item, level, xp]) => ({ item, each: 1, needs: [need("molten_glass")], skill: "crafting", level, xp, at: ["furnace"], tool: "glassblowing_pipe" }));
}

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
