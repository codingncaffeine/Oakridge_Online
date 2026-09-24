import { ITEM_BY_KEY } from "./items.ts";

/** One line of what a shop keeps on the shelf when nobody has touched it. */
export interface ShopLine {
  id: number;
  count: number;
}

export interface ShopDef {
  /** What the shop window is titled. */
  name: string;
  /** Who stands behind the counter, for the talk that offers the trade. */
  keeper: string;
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
const line = (key: string, count: number): ShopLine => ({ id: item(key), count });

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
  // Thornbury's shops (PLAN §7.6, Wave 1): the capital sells (§7.7's fourth rule). A general store that
  // takes anything, then one shop a trade — weapons, armour, bows and arrows, the goldsmith who buys
  // what the crafting bench makes — and the market on the square for what the country brings in.
  thornbury_general: {
    name: "Ashby's Stores",
    keeper: "Wilf Ashby",
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
  thornbury_archery: {
    name: "Tolliver's Bows",
    keeper: "Fenn Tolliver",
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
};
