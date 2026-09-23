import type { FishingMethod } from "../shared/gathering.ts";
import type { ItemDef } from "../shared/items.ts";
import { isTree, type ObjectKind } from "../shared/map.ts";
import { levelOf, MONSTER_BY_KEY } from "../shared/monsters.ts";

export interface ObjectInfo {
  name: string;
  examine: string;
}

/** What each kind of map object is called in menus, and what "Examine" says about it. */
export const OBJECT_INFO: Record<ObjectKind, ObjectInfo> = {
  tree: { name: "Tree", examine: "A common tree. Good firewood, if you had an axe." },
  oak: { name: "Oak", examine: "A broad old oak. It was here long before the village." },
  alder: { name: "Alder", examine: "A waterside tree, pale under its dark bark." },
  rowan: { name: "Rowan", examine: "Slim, red-berried, and fond of high ground." },
  blackthorn: { name: "Blackthorn", examine: "Black wood and long thorns. It does not want cutting." },
  ironbark: { name: "Ironbark", examine: "The bark rings when you knock on it." },
  sablewood: { name: "Sablewood", examine: "Almost black, and taller than anything near it." },
  heartoak: { name: "Heartoak", examine: "Older than the kingdom, by the look of it." },
  rock: { name: "Rocks", examine: "A lump of plain grey rock, with nothing in it worth the digging." },
  copper_rock: { name: "Copper rocks", examine: "Streaks of copper run through this rock." },
  tin_rock: { name: "Tin rocks", examine: "Dull grey tin shows in the stone." },
  iron_rock: { name: "Iron rocks", examine: "Rust-red veins of iron mark this rock." },
  coal_rock: { name: "Coal seam", examine: "A black seam runs through the stone here." },
  silver_rock: { name: "Silver rocks", examine: "Pale metal shows where the rock has split." },
  coldiron_rock: { name: "Coldiron rocks", examine: "Blue-grey veins, cold to the touch." },
  gold_rock: { name: "Gold rocks", examine: "Yellow threads run through the stone." },
  emberite_rock: { name: "Emberite rocks", examine: "The red in this rock looks like it is still burning." },
  starfall_rock: { name: "Starfall rocks", examine: "Something in this rock did not come out of the ground." },
  fence: { name: "Fence", examine: "Rough wooden fencing. It keeps the animals in, mostly." },
  wall: { name: "Wall", examine: "Old stones from a building long gone." },
};

/** A felled tree and a mined-out rock, while they come back. */
const STUMP: ObjectInfo = { name: "Tree stump", examine: "All that's left of a tree. Another will grow." };
const EMPTY_ROCK: ObjectInfo = { name: "Rocks", examine: "Mined out for now. The ore will come back." };

/** What an object is called and says, as it stands or once it has run out. */
export function objectInfo(kind: ObjectKind, depleted: boolean): ObjectInfo {
  if (!depleted) return OBJECT_INFO[kind];
  return isTree(kind) ? STUMP : EMPTY_ROCK;
}

/**
 * A fishing spot, by what the water offers: the menu option that works it, what it is called, and what
 * "Examine" says. The name is the only sight of a tier a player has before they are near enough to fish.
 */
export const SPOT_INFO: Record<FishingMethod, ObjectInfo & { verb: string }> = {
  net: { verb: "Net", name: "Fishing spot", examine: "Small fish dart about under the surface." },
  angle: { verb: "Cast", name: "Fishing spot", examine: "Something is rising to feed out in the current." },
  trap: { verb: "Set trap", name: "Shellfish bed", examine: "Claws move over the stones down there." },
  harpoon: { verb: "Harpoon", name: "Deep water spot", examine: "A long dark shape turns below the surface." },
};

/** What a creature is called in menus, how hard it looks, and what "Examine" says about it. */
export function monsterInfo(key: string): ObjectInfo & { level: number } {
  const def = MONSTER_BY_KEY.get(key);
  if (!def) return { name: "Creature", examine: "You can't make it out.", level: 0 };
  return { name: def.name, examine: def.examine, level: levelOf(def) };
}

/** "Examine" on an item: its description, or for a stack too big to read in its slot, the exact count. */
export function itemExamine(def: ItemDef, count: number): string {
  return count >= 100_000 ? `${count.toLocaleString("en-GB")} x ${def.name}.` : def.examine;
}
