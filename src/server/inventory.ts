import {
  BONUS_NAMES, EQUIP_SLOTS, INVENTORY_SIZE, ITEM_BY_ID, MAX_STACK, type Bonuses, type EquipSlot, type Stack,
} from "../shared/items.ts";
import { CANT_WEAR, NO_ROOM } from "../shared/messages.ts";

export type Inventory = Array<Stack | null>;
export type Equipment = Partial<Record<EquipSlot, Stack>>;

export function emptyInventory(): Inventory {
  return Array.from({ length: INVENTORY_SIZE }, () => null);
}

/** Adds up to `count` of an item: stackables join an existing stack, others take a slot each. Returns what didn't fit. */
export function addItem(inv: Inventory, id: number, count: number): number {
  const def = ITEM_BY_ID.get(id);
  if (!def || count <= 0) return count;
  if (def.stackable) {
    const at = inv.findIndex((s) => s?.id === id);
    if (at >= 0) {
      const room = MAX_STACK - inv[at]!.count;
      const put = Math.min(room, count);
      inv[at]!.count += put;
      return count - put;
    }
    const free = inv.indexOf(null);
    if (free < 0) return count;
    inv[free] = { id, count };
    return 0;
  }
  let left = count;
  for (let i = 0; i < inv.length && left > 0; i++) {
    if (inv[i] === null) {
      inv[i] = { id, count: 1 };
      left--;
    }
  }
  return left;
}

/** Whether `count` of the item would fit without splitting anything. */
export function canHold(inv: Inventory, id: number, count: number): boolean {
  const def = ITEM_BY_ID.get(id);
  if (!def) return false;
  if (def.stackable) {
    const s = inv.find((x) => x?.id === id);
    return s ? s.count + count <= MAX_STACK : inv.includes(null);
  }
  return inv.filter((s) => s === null).length >= count;
}

/** Takes `count` (default: all) out of a slot and returns what was taken. */
export function takeFrom(inv: Inventory, slot: number, count = Infinity): Stack | null {
  const s = inv[slot];
  if (!s) return null;
  const n = Math.min(s.count, count);
  if (n >= s.count) inv[slot] = null;
  else s.count -= n;
  return { id: s.id, count: n };
}

export function swapSlots(inv: Inventory, from: number, to: number): void {
  if (from === to) return;
  [inv[from], inv[to]] = [inv[to] ?? null, inv[from] ?? null];
}

export function countOf(inv: Inventory, id: number): number {
  return inv.reduce((n, s) => n + (s?.id === id ? s.count : 0), 0);
}

/** Kilograms carried and worn. A stackable item's weight counts once per stack. */
export function weightOf(inv: Inventory, equip: Equipment): number {
  let kg = 0;
  for (const s of [...inv, ...Object.values(equip)]) {
    if (!s) continue;
    const def = ITEM_BY_ID.get(s.id);
    if (def) kg += def.stackable ? def.weight : def.weight * s.count;
  }
  return Math.round(kg * 100) / 100;
}

export function bonusesOf(equip: Equipment): Bonuses {
  const total = BONUS_NAMES.map(() => 0);
  for (const s of Object.values(equip)) {
    const bonuses = s ? ITEM_BY_ID.get(s.id)?.equip?.bonuses : undefined;
    if (bonuses) bonuses.forEach((b, i) => { total[i]! += b; });
  }
  return total;
}

/**
 * Puts the item in inventory slot `slot` on, swapping out whatever held that equipment slot into the
 * same inventory slot. Returns an error message, or null when done.
 */
export function equipFrom(inv: Inventory, equip: Equipment, slot: number): string | null {
  const s = inv[slot];
  const where = s ? ITEM_BY_ID.get(s.id)?.equip?.slot : undefined;
  if (!s || !where) return CANT_WEAR;
  const def = ITEM_BY_ID.get(s.id)!;
  const worn = equip[where];
  if (def.stackable && worn?.id === s.id) {
    worn.count = Math.min(MAX_STACK, worn.count + s.count);
    inv[slot] = null;
    return null;
  }
  equip[where] = s;
  inv[slot] = worn ?? null;
  return null;
}

/** Takes off what's in an equipment slot, into the first free inventory space. */
export function unequip(inv: Inventory, equip: Equipment, where: EquipSlot): string | null {
  const worn = equip[where];
  if (!worn) return null;
  if (addItem(inv, worn.id, worn.count) > 0) return NO_ROOM;
  delete equip[where];
  return null;
}

const isStack = (v: unknown): v is Stack => typeof v === "object" && v !== null
  && Number.isInteger((v as Stack).id) && ITEM_BY_ID.has((v as Stack).id)
  && Number.isInteger((v as Stack).count) && (v as Stack).count > 0 && (v as Stack).count <= MAX_STACK;

/** An inventory from a save, or null if the save has none. Unknown items are dropped. */
export function readInventory(raw: unknown): Inventory | null {
  if (!Array.isArray(raw)) return null;
  const inv = emptyInventory();
  raw.slice(0, INVENTORY_SIZE).forEach((s, i) => { inv[i] = isStack(s) ? { id: s.id, count: s.count } : null; });
  return inv;
}

export function readEquipment(raw: unknown): Equipment {
  const equip: Equipment = {};
  if (typeof raw !== "object" || raw === null) return equip;
  for (const where of EQUIP_SLOTS) {
    const s = (raw as Record<string, unknown>)[where];
    if (isStack(s) && ITEM_BY_ID.get(s.id)?.equip?.slot === where) equip[where] = { id: s.id, count: s.count };
  }
  return equip;
}

/** What a new character carries. */
export function starterKit(): Inventory {
  const inv = emptyInventory();
  const kit: Array<[number, number]> = [[8, 1], [9, 1], [10, 1], [11, 1], [12, 1], [13, 1], [20, 1], [1, 25]];
  for (const [id, count] of kit) addItem(inv, id, count);
  return inv;
}
