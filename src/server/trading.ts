import { BANK_SIZE, ITEM_BY_ID, MAX_STACK, type Stack } from "../shared/items.ts";
import { BANK_FULL, NO_ROOM, NOTHING_THERE, SHOP_NO_BUY, SHOP_OUT_OF, TOO_POOR } from "../shared/messages.ts";
import { buyPrice, sellPrice, SHOPS, type ShopDef } from "../shared/shops.ts";
import { addItem, canHold, countOf, spendItem, takeFrom, type Inventory } from "./inventory.ts";

/** The bank: one slot per kind of item, everything stacked however it behaves in the pack. */
export type Bank = Array<Stack | null>;

export function emptyBank(): Bank {
  return Array.from({ length: BANK_SIZE }, () => null);
}

/** Coins, the only currency: id 1. */
export const COINS = 1;

/** How many of an item the bank holds. */
export function bankCount(bank: Bank, id: number): number {
  return bank.find((s) => s?.id === id)?.count ?? 0;
}

/**
 * Puts `count` of an inventory slot into the bank (-1 for every one of that item in the pack). The
 * bank stacks everything, so a pack of 20 loose logs becomes one slot of 20.
 */
export function deposit(inv: Inventory, bank: Bank, slot: number, count: number): string | null {
  const held = inv[slot];
  if (!held) return NOTHING_THERE;
  const id = held.id;
  const want = count === -1 ? countOf(inv, id) : Math.min(count, countOf(inv, id));
  if (want <= 0) return NOTHING_THERE;
  const at = bank.findIndex((s) => s?.id === id);
  if (at < 0 && !bank.includes(null)) return BANK_FULL;
  const room = at < 0 ? MAX_STACK : MAX_STACK - bank[at]!.count;
  const moved = Math.min(want, room);
  if (moved <= 0) return BANK_FULL;
  if (!spendItem(inv, id, moved)) return NOTHING_THERE;
  if (at < 0) bank[bank.indexOf(null)] = { id, count: moved };
  else bank[at]!.count += moved;
  return null;
}

/** Takes `count` out of a bank slot (-1 for as many as will fit), into the pack. */
export function withdraw(inv: Inventory, bank: Bank, slot: number, count: number): string | null {
  const held = bank[slot];
  if (!held) return NOTHING_THERE;
  const def = ITEM_BY_ID.get(held.id);
  if (!def) return NOTHING_THERE;
  // An unstackable item needs a slot each, so "all" is capped by the free space, not by the stack.
  const free = inv.filter((s) => s === null).length;
  const room = def.stackable ? (inv.some((s) => s?.id === held.id) || free > 0 ? held.count : 0) : free;
  const want = count === -1 ? held.count : Math.min(count, held.count);
  const moved = Math.min(want, room);
  if (moved <= 0) return NO_ROOM;
  takeFrom(bank, slot, moved);
  addItem(inv, held.id, moved);
  return null;
}

/** What a shop is holding right now: its stock, which drifts back toward what it is meant to keep. */
export interface ShopState {
  readonly key: string;
  readonly def: ShopDef;
  /** One entry per line of stock, in the shop's own order; `count` moves as players trade. */
  readonly stock: Stack[];
  /** The tick of the next drift back toward the shop's normal stock. */
  nextDrift: number;
}

export function newShop(key: string, tick: number): ShopState {
  const def = SHOPS[key]!;
  return {
    key,
    def,
    stock: def.stock.map((line) => ({ id: line.id, count: line.count })),
    nextDrift: tick + def.driftTicks,
  };
}

/**
 * A shop's stock creeps back toward what it is meant to keep: one unit at a time, up or down. A line
 * bought out comes back; a line players sold into drains away. Items the shop does not normally keep
 * disappear a unit at a time until they are gone.
 */
export function drift(shop: ShopState, tick: number): boolean {
  if (tick < shop.nextDrift) return false;
  shop.nextDrift = tick + shop.def.driftTicks;
  let changed = false;
  for (let i = shop.stock.length - 1; i >= 0; i--) {
    const line = shop.stock[i]!;
    const want = shop.def.stock.find((l) => l.id === line.id)?.count ?? 0;
    if (line.count < want) {
      line.count++;
      changed = true;
    } else if (line.count > want) {
      line.count--;
      changed = true;
      if (line.count === 0 && want === 0) shop.stock.splice(i, 1);
    }
  }
  return changed;
}

/** Buying `count` of the shop's slot. The price of each is read as the stock falls, so a run costs more. */
export function buy(inv: Inventory, shop: ShopState, slot: number, count: number): string | null {
  const line = shop.stock[slot];
  if (!line || line.count <= 0) return SHOP_OUT_OF;
  const want = count === -1 ? line.count : Math.min(count, line.count);
  const normal = shop.def.stock.find((l) => l.id === line.id)?.count ?? 0;
  let bought = 0, cost = 0;
  const purse = countOf(inv, COINS);
  for (let n = 0; n < want; n++) {
    const each = buyPrice(shop.def, line.id, line.count - n, normal);
    if (cost + each > purse) break;
    if (!canHoldAfter(inv, line.id, bought + 1, cost + each)) break;
    cost += each;
    bought++;
  }
  if (bought === 0) return cost > 0 || purse === 0 ? TOO_POOR : NO_ROOM;
  spendItem(inv, COINS, cost);
  addItem(inv, line.id, bought);
  line.count -= bought;
  return null;
}

/**
 * Whether the pack still holds together after paying `cost` coins for `count` of an item. Coins leaving
 * can free a slot, and the bought item may need one, so both have to be weighed at once.
 */
function canHoldAfter(inv: Inventory, id: number, count: number, cost: number): boolean {
  const after = inv.map((s) => (s ? { ...s } : null));
  if (!spendItem(after, COINS, cost)) return false;
  return canHold(after, id, count);
}

/** Selling `count` from an inventory slot. A shop only takes what it deals in, unless it takes anything. */
export function sell(inv: Inventory, shop: ShopState, slot: number, count: number): string | null {
  const held = inv[slot];
  if (!held) return NOTHING_THERE;
  const def = ITEM_BY_ID.get(held.id);
  if (!def) return NOTHING_THERE;
  const normal = shop.def.stock.find((l) => l.id === held.id)?.count ?? 0;
  if (normal === 0 && !shop.def.buysAnything) return SHOP_NO_BUY;
  if (held.id === COINS) return SHOP_NO_BUY;
  const want = count === -1 ? countOf(inv, held.id) : Math.min(count, countOf(inv, held.id));
  if (want <= 0) return NOTHING_THERE;
  const line = shop.stock.find((l) => l.id === held.id);
  let paid = 0;
  for (let n = 0; n < want; n++) paid += sellPrice(shop.def, held.id, (line?.count ?? 0) + n, normal);
  if (!spendItem(inv, held.id, want)) return NOTHING_THERE;
  if (line) line.count += want;
  else shop.stock.push({ id: held.id, count: want });
  addItem(inv, COINS, paid);
  return null;
}

/**
 * A bank read back from a save, defensively: whole stacks of items that still exist, in the slots they
 * were in. Anything missing or odd is dropped rather than refused, so one bad row cannot lock a
 * character out of their own account. A save made before there was a bank reads as an empty one.
 */
export function readBank(raw: unknown): Bank {
  const bank = emptyBank();
  if (!Array.isArray(raw)) return bank;
  raw.slice(0, BANK_SIZE).forEach((s, i) => {
    if (typeof s !== "object" || s === null) return;
    const { id, count } = s as Stack;
    if (!Number.isInteger(id) || !ITEM_BY_ID.has(id)) return;
    if (!Number.isInteger(count) || count < 1 || count > MAX_STACK) return;
    bank[i] = { id, count };
  });
  return bank;
}
