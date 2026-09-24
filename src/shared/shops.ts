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
};
