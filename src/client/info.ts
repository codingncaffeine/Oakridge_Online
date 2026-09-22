import type { ItemDef } from "../shared/items.ts";
import type { ObjectKind } from "../shared/map.ts";

export interface ObjectInfo {
  name: string;
  examine: string;
}

/** What each kind of map object is called in menus, and what "Examine" says about it. */
export const OBJECT_INFO: Record<ObjectKind, ObjectInfo> = {
  tree: { name: "Tree", examine: "A common tree. Good firewood, if you had an axe." },
  oak: { name: "Oak", examine: "A broad old oak. It was here long before the village." },
  rock: { name: "Rocks", examine: "A lump of plain grey rock, with nothing in it worth the digging." },
  copper_rock: { name: "Copper rocks", examine: "Streaks of copper run through this rock." },
  tin_rock: { name: "Tin rocks", examine: "Dull grey tin shows in the stone." },
  iron_rock: { name: "Iron rocks", examine: "Rust-red veins of iron mark this rock." },
  fence: { name: "Fence", examine: "Rough wooden fencing. It keeps the animals in, mostly." },
  wall: { name: "Wall", examine: "Old stones from a building long gone." },
};

/** A felled tree and a mined-out rock, while they come back. */
const STUMP: ObjectInfo = { name: "Tree stump", examine: "All that's left of a tree. Another will grow." };
const EMPTY_ROCK: ObjectInfo = { name: "Rocks", examine: "Mined out for now. The ore will come back." };

/** What an object is called and says, as it stands or once it has run out. */
export function objectInfo(kind: ObjectKind, depleted: boolean): ObjectInfo {
  if (!depleted) return OBJECT_INFO[kind];
  return kind === "tree" || kind === "oak" ? STUMP : EMPTY_ROCK;
}

export const SPOT_INFO: ObjectInfo = { name: "Fishing spot", examine: "Small fish dart about under the surface." };

/** "Examine" on an item: its description, or for a stack too big to read in its slot, the exact count. */
export function itemExamine(def: ItemDef, count: number): string {
  return count >= 100_000 ? `${count.toLocaleString("en-GB")} x ${def.name}.` : def.examine;
}
