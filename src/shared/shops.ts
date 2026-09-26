import { ITEM_BY_KEY } from "./items.ts";
import type { SignIcon } from "./map.ts";

/** One line of what a shop keeps on the shelf when nobody has touched it. */
export interface ShopLine {
  id: number;
  count: number;
  /** Sold at this many coins each whatever the stock, for a staple whose price is set outright. */
  price?: number;
  /** How many come back a drift beat when the shelf is short (one when unset), for a staple bought by the thousand. */
  restock?: number;
}

export interface ShopDef {
  /** What the shop window is titled. */
  name: string;
  /** Who stands behind the counter, for the talk that offers the trade. */
  keeper: string;
  /** The picture on the sign by its door: the same for every shop of its kind in every town. */
  sign: SignIcon;
  /** What it charges for one at its normal stock, as a multiple of the item's value. */
  sellsAt: number;
  /** What it pays for one at its normal stock, as a multiple of the item's value. */
  buysAt: number;
  /** How much the price moves per unit of stock away from normal (a share of the price). */
  swing: number;
  /** Whether it will take anything at all, or only what it deals in. */
  buysAnything: boolean;
  /** Ticks between one unit of stock drifting back toward normal. */
  driftTicks: number;
  stock: ShopLine[];
}

const item = (key: string) => ITEM_BY_KEY.get(key)!.id;
const line = (key: string, count: number, extra: Pick<ShopLine, "price" | "restock"> = {}): ShopLine => ({ id: item(key), count, ...extra });

/**
 * Glimstone, the plain stone the first six runes carve from, sold at a set 5 coins by the magic shops, one
 * within a walk of every altar that takes it (2026-09-25): a runesmith buys it by the stack, so the shelf
 * comes back fast.
 */
export const GLIMSTONE_PRICE = 5;
const glimstone = (count: number) => line("glimstone", count, { price: GLIMSTONE_PRICE, restock: 20 });

/**
 * Prices move with stock, as every shop in a game of this kind does: buy a shelf out and the last one
 * costs more; sell a pile in and each one fetches less. The ratio is 1 at the shop's normal stock and
 * moves `swing` per unit either side, held between half and a little over half again so neither side
 * runs away. The selling price is always kept under the buying price, so there is no loop that prints
 * coins out of a counter.
 *
 * Every number here is ours (PLAN §5's standing rule); what is copied is the shape of the mechanism.
 */
export const PRICE_FLOOR = 0.5;
export const PRICE_CEILING = 1.6;

function ratio(def: ShopDef, stock: number, normal: number): number {
  const r = 1 + def.swing * (normal - stock);
  return Math.max(PRICE_FLOOR, Math.min(PRICE_CEILING, r));
}

/** What the shop charges for one, with `stock` on the shelf and `normal` its usual amount. */
export function buyPrice(def: ShopDef, id: number, stock: number, normal: number): number {
  const set = def.stock.find((l) => l.id === id)?.price;
  if (set !== undefined) return set;
  const value = valueOf(id);
  return Math.max(1, Math.round(value * def.sellsAt * ratio(def, stock, normal)));
}

/** What the shop pays for one. Always at least a coin under what it would charge for the same one. */
export function sellPrice(def: ShopDef, id: number, stock: number, normal: number): number {
  const value = valueOf(id);
  const paid = Math.round(value * def.buysAt * ratio(def, stock, normal));
  return Math.max(1, Math.min(paid, buyPrice(def, id, stock, normal) - 1));
}

function valueOf(id: number): number {
  for (const def of ITEM_BY_KEY.values()) if (def.id === id) return Math.max(1, def.value);
  return 1;
}

/**
 * Oakridge's two shops (PLAN §7.4). The general store deals in odds and ends and will take anything;
 * the tool shop keeps the gathering tools a player who lost theirs needs, and only those.
 */
export const SHOPS: Record<string, ShopDef> = {
  oakridge_general: {
    name: "Oakridge General Store",
    keeper: "Maud Tarrow",
    sign: "bread",
    sellsAt: 1.3,
    buysAt: 0.45,
    swing: 0.03,
    buysAnything: true,
    driftTicks: 100,
    stock: [
      line("coins", 0),
      line("bread", 30),
      line("tinderbox", 10),
      line("logs", 0),
      line("leather_cap", 5),
      line("leather_boots", 5),
      line("red_cape", 3),
      line("wooden_shield", 5),
      line("bait", 300),
    ],
  },
  oakridge_tools: {
    name: "Brayle's Tools",
    keeper: "Odric Brayle",
    sign: "tools",
    sellsAt: 1.15,
    buysAt: 0.5,
    swing: 0.04,
    buysAnything: false,
    driftTicks: 80,
    stock: [
      line("bronze_axe", 8),
      line("bronze_pickaxe", 8),
      line("iron_axe", 3),
      line("iron_pickaxe", 3),
      line("fishing_net", 8),
      line("chisel", 5),
      line("fishing_rod", 4),
      line("creel", 2),
      line("harpoon", 2),
      line("bronze_dagger", 5),
      line("hammer", 10),
      line("needle", 10),
      line("thread", 100),
    ],
  },
  // Stonecote's tackle shop (PLAN §7.6, Wave 1): the rod and bait the redfin water beside it needs, and
  // it buys the catch. A shop and not a bank, so the hamlet stays a road (§5, 2026-09-22).
  stonecote_tackle: {
    name: "Pike's Tackle",
    keeper: "Corwen Pike",
    sign: "fish",
    sellsAt: 1.2,
    buysAt: 0.5,
    swing: 0.04,
    buysAnything: false,
    driftTicks: 80,
    stock: [
      line("fishing_rod", 6),
      line("bait", 500),
      line("fishing_net", 4),
      line("creel", 1),
      line("raw_redfin", 0),
      line("bread", 10),
    ],
  },
  // Wickstead's net shop (PLAN §7.6, Wave 1): every fishing tool there is, bait, and it buys the catch.
  // The fishing village sells what fishing needs (§7.7's fourth rule), and the creel and the harpoon
  // for the waters further down the coast.
  wickstead_nets: {
    name: "Ferris Nets & Lines",
    keeper: "Nell Ferris",
    sign: "fish",
    sellsAt: 1.2,
    buysAt: 0.5,
    swing: 0.04,
    buysAnything: false,
    driftTicks: 80,
    stock: [
      line("fishing_net", 6),
      line("fishing_rod", 6),
      line("bait", 800),
      line("creel", 3),
      line("harpoon", 1),
      line("raw_grayling", 0),
      line("raw_redfin", 0),
      line("raw_sardine", 0),
      line("raw_smelt", 0),
      line("bread", 10),
    ],
  },
  // Brinehaven's shop (PLAN §7.6, Wave 1): creels and pots for the crab beds off the port, the rest of
  // the fishing tools with them, and it buys every fish that comes over the quay.
  brinehaven_pots: {
    name: "Hale's Creels & Pots",
    keeper: "Morwen Hale",
    sign: "fish",
    sellsAt: 1.2,
    buysAt: 0.5,
    swing: 0.04,
    buysAnything: false,
    driftTicks: 80,
    stock: [
      line("creel", 5),
      line("fishing_net", 4),
      line("fishing_rod", 3),
      line("harpoon", 1),
      line("bait", 500),
      line("raw_bay_crab", 0),
      line("raw_grayling", 0),
      line("raw_redfin", 0),
      line("raw_sardine", 0),
      line("raw_smelt", 0),
      line("bread", 8),
    ],
  },
  // Thornbury's shops (PLAN §7.6, Wave 1): the capital sells (§7.7's fourth rule). A general store that
  // takes anything, then one shop a trade — weapons, armour, bows and arrows, the goldsmith who buys
  // what the crafting bench makes — and the market on the square for what the country brings in.
  thornbury_general: {
    name: "Ashby's Stores",
    keeper: "Wilf Ashby",
    sign: "bread",
    sellsAt: 1.3,
    buysAt: 0.45,
    swing: 0.03,
    buysAnything: true,
    driftTicks: 100,
    stock: [
      line("coins", 0),
      line("bread", 40),
      line("tinderbox", 10),
      line("hammer", 10),
      line("needle", 10),
      line("thread", 200),
      line("bait", 300),
      line("leather_cap", 5),
      line("leather_boots", 5),
      line("leather_gloves", 5),
      line("wooden_shield", 5),
      line("red_cape", 5),
      line("logs", 0),
    ],
  },
  thornbury_weapons: {
    name: "Coyle's Blades",
    keeper: "Bram Coyle",
    sign: "swords",
    sellsAt: 1.2,
    buysAt: 0.5,
    swing: 0.04,
    buysAnything: false,
    driftTicks: 80,
    stock: [
      line("bronze_dagger", 8),
      line("bronze_sword", 6),
      line("bronze_mace", 6),
      line("iron_dagger", 5),
      line("iron_sword", 4),
      line("iron_mace", 4),
      line("steel_dagger", 2),
      line("steel_mace", 2),
    ],
  },
  thornbury_armour: {
    name: "Marrow's Armoury",
    keeper: "Hild Marrow",
    sign: "breastplate",
    sellsAt: 1.2,
    buysAt: 0.5,
    swing: 0.04,
    buysAnything: false,
    driftTicks: 80,
    stock: [
      line("leather_cap", 6),
      line("leather_jerkin", 6),
      line("leather_trousers", 6),
      line("leather_gloves", 6),
      line("leather_boots", 6),
      line("wooden_shield", 6),
      line("bronze_helm", 6),
      line("bronze_shield", 5),
      line("iron_helm", 4),
      line("iron_shield", 3),
      line("steel_helm", 2),
      line("steel_shield", 1),
    ],
  },
  thornbury_staves: {
    name: "Vell's Staves",
    keeper: "Orrin Vell",
    sign: "star",
    sellsAt: 1.2,
    buysAt: 0.5,
    swing: 0.04,
    buysAnything: false,
    driftTicks: 80,
    stock: [
      line("ash_staff", 4),
      line("oak_staff", 2),
      line("gale_staff", 2),
      line("tide_staff", 2),
      line("stone_staff", 2),
      line("ember_staff", 2),
      line("gale_rune", 2000),
      line("tide_rune", 1000),
      line("stone_rune", 1000),
      line("ember_rune", 1000),
      line("thought_rune", 1500),
      line("sinew_rune", 500),
      line("wild_rune", 250),
      line("star_rune", 200),
      line("grave_rune", 100),
      line("wool_robe", 4),
      line("wool_hood", 4),
      // The magic plan, stage A4: glass for the orb spells, the battlestaff an orb is set in, and the staves the special spells are cast through.
      line("glass_orb", 20),
      line("battlestaff", 3),
      line("hunter_staff", 1),
      line("dawn_staff", 1),
      line("pyre_staff", 1),
      line("briar_staff", 1),
      glimstone(1000),
    ],
  },
  // The magic shops (magicshops.ts, 2026-09-25), each in a house its town already had: staves, the runes
  // the altars nearest it make, robes, and glimstone for anyone carving their own.
  oakridge_runes: {
    name: "Rook's Runes",
    keeper: "Hettie Rook",
    sign: "star",
    sellsAt: 1.2,
    buysAt: 0.5,
    swing: 0.04,
    buysAnything: false,
    driftTicks: 80,
    stock: [
      line("ash_staff", 3),
      line("gale_staff", 2),
      line("tide_staff", 1),
      line("stone_staff", 1),
      line("ember_staff", 1),
      line("gale_rune", 1000),
      line("thought_rune", 1000),
      line("tide_rune", 300),
      line("stone_rune", 300),
      line("ember_rune", 300),
      line("wool_robe", 2),
      line("wool_hood", 2),
      glimstone(500),
    ],
  },
  wickstead_staves: {
    name: "Merrow's Staves",
    keeper: "Delphine Merrow",
    sign: "star",
    sellsAt: 1.2,
    buysAt: 0.5,
    swing: 0.04,
    buysAnything: false,
    driftTicks: 80,
    stock: [
      line("ash_staff", 3),
      line("tide_staff", 3),
      line("gale_staff", 1),
      line("tide_rune", 1000),
      line("gale_rune", 500),
      line("thought_rune", 500),
      line("sinew_rune", 100),
      line("wool_robe", 2),
      line("wool_hood", 2),
      glimstone(500),
    ],
  },
  kilnhold_staves: {
    name: "Brenner's Staves",
    keeper: "Garrick Brenner",
    sign: "star",
    sellsAt: 1.2,
    buysAt: 0.5,
    swing: 0.04,
    buysAnything: false,
    driftTicks: 80,
    stock: [
      line("ash_staff", 3),
      line("oak_staff", 1),
      line("ember_staff", 3),
      line("ember_rune", 1000),
      line("gale_rune", 500),
      line("thought_rune", 500),
      line("sinew_rune", 200),
      line("wool_robe", 2),
      line("wool_hood", 2),
      glimstone(500),
    ],
  },
  thornbury_archery: {
    name: "Tolliver's Bows",
    keeper: "Fenn Tolliver",
    sign: "bow",
    sellsAt: 1.2,
    buysAt: 0.5,
    swing: 0.04,
    buysAnything: false,
    driftTicks: 80,
    stock: [
      line("shortbow", 5),
      line("longbow", 4),
      line("oak_shortbow", 2),
      line("oak_longbow", 2),
      line("bronze_arrow", 500),
      line("iron_arrow", 200),
      line("bow_string", 40),
      line("arrow_shafts", 500),
      line("feather", 500),
      line("bronze_arrowheads", 300),
    ],
  },
  thornbury_goldsmith: {
    name: "Garnett & Daughter",
    keeper: "Isolde Garnett",
    sign: "ring",
    sellsAt: 1.35,
    buysAt: 0.6,
    swing: 0.06,
    buysAnything: false,
    driftTicks: 150,
    stock: [
      line("silver_ring", 3),
      line("gold_ring", 1),
      line("gold_amulet", 1),
      line("silver_bar", 0),
      line("gold_bar", 0),
      line("silver_ore", 0),
      line("gold_ore", 0),
    ],
  },
  thornbury_market: {
    name: "Thornbury Market",
    keeper: "Meg Sallow",
    sign: "apples",
    sellsAt: 1.15,
    buysAt: 0.5,
    swing: 0.03,
    buysAnything: false,
    driftTicks: 60,
    stock: [
      line("bread", 30),
      line("sardine", 20),
      line("smelt", 10),
      line("cooked_beef", 10),
      line("cooked_fowl", 10),
      line("raw_beef", 0),
      line("raw_fowl", 0),
      line("cowhide", 0),
      line("wolf_pelt", 0),
      line("feather", 0),
      line("logs", 0),
      line("oak_logs", 0),
    ],
  },
  // Kilnhold (PLAN §7.6, Wave 2): the best early blade in the game, the steel sword, sold nowhere else.
  kilnhold_blades: {
    name: "Hask's Edge",
    keeper: "Sefa Hask",
    sign: "swords",
    sellsAt: 1.25,
    buysAt: 0.55,
    swing: 0.04,
    buysAnything: false,
    driftTicks: 100,
    stock: [
      line("iron_dagger", 4),
      line("iron_sword", 4),
      line("iron_mace", 3),
      line("steel_dagger", 3),
      line("steel_mace", 3),
      line("steel_sword", 2),
      line("steel_axe", 2),
      line("steel_pickaxe", 2),
    ],
  },
  // Tarhollow (PLAN §7.6, Wave 2): what a harpoon and an axe need, and bread off the ferry. It buys the isle's own goods.
  tarhollow_stores: {
    name: "Tarr's Store",
    keeper: "Ewan Tarr",
    sign: "bread",
    sellsAt: 1.3,
    buysAt: 0.5,
    swing: 0.05,
    buysAnything: false,
    driftTicks: 120,
    stock: [
      line("harpoon", 2),
      line("bait", 30),
      line("bronze_axe", 3),
      line("iron_axe", 1),
      line("tinderbox", 2),
      line("bread", 6),
      line("raw_blackfish", 0),
      line("ironbark_logs", 0),
      line("sable_logs", 0),
      line("emberite_ore", 0),
    ],
  },
  // Deepdelve (PLAN §7.6, Wave 3): every pick there is, coal for the furnaces, and it buys the mine's ore and the smithy's bars.
  deepdelve_tools: {
    name: "Delve Tools",
    keeper: "Bryn Tarrant",
    sign: "tools",
    sellsAt: 1.2,
    buysAt: 0.55,
    swing: 0.04,
    buysAnything: false,
    driftTicks: 100,
    stock: [
      line("bronze_pickaxe", 4),
      line("iron_pickaxe", 3),
      line("steel_pickaxe", 2),
      line("coal", 20),
      line("tinderbox", 2),
      line("chisel", 5),
      line("iron_ore", 0),
      line("silver_ore", 0),
      line("coldiron_ore", 0),
      line("gold_ore", 0),
      line("steel_bar", 0),
      line("coldiron_bar", 0),
    ],
  },
  /**
   * Sandreach's Caravan Post (Wave 4): some caravan will carry anything east, so it takes anything, and
   * pays a little over a general store for it; it sells what the road and the Dunes want, the storm glass
   * the sand makes, and the gold that comes out of them worked.
   */
  sandreach_caravan: {
    name: "The Caravan Post",
    keeper: "Idrah Voss",
    sign: "bread",
    sellsAt: 1.3,
    buysAt: 0.5,
    swing: 0.03,
    buysAnything: true,
    driftTicks: 100,
    stock: [
      line("bread", 30),
      line("cooked_beef", 15),
      line("gale_rune", 300),
      line("bloom_rune", 100),
      line("oath_rune", 60),
      line("tinderbox", 5),
      line("gold_ring", 1),
      line("gold_amulet", 1),
      line("gold_ore", 0),
      line("gold_bar", 0),
    ],
  },
  /**
   * Mourn's store (Wave 4): the only shop in the Sallowfen, kept for a village the causeway feeds. Food,
   * fire and bait, a net and a rod for the pools, and it buys back what the fen gives up.
   */
  mourn_store: {
    name: "Carrow's Store",
    keeper: "Ysolde Carrow",
    sign: "bread",
    sellsAt: 1.35,
    buysAt: 0.45,
    swing: 0.05,
    buysAnything: false,
    driftTicks: 120,
    stock: [
      line("bread", 10),
      line("cooked_beef", 4),
      line("tinderbox", 3),
      line("bait", 40),
      line("fishing_net", 2),
      line("fishing_rod", 2),
      line("logs", 10),
      line("raw_grayling", 0),
      line("bones", 0),
    ],
  },
};
