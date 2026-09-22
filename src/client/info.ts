import type { ObjectKind } from "../shared/map.ts";

/** What each kind of map object is called in menus, and what "Examine" says about it. */
export const OBJECT_INFO: Record<ObjectKind, { name: string; examine: string }> = {
  tree: { name: "Tree", examine: "A common tree. Good firewood, if you had an axe." },
  oak: { name: "Oak", examine: "A broad old oak. It was here long before the village." },
  rock: { name: "Rocks", examine: "A lump of rock. Something might glint inside." },
  fence: { name: "Fence", examine: "Rough wooden fencing. It keeps the animals in, mostly." },
  wall: { name: "Wall", examine: "Old stones from a building long gone." },
};
