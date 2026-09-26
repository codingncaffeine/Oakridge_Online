// The magic shops (2026-09-25): a dedicated seller of staves, runes and glimstone within a walk of every altar
// that takes plain glimstone, as Vell's Staves is for the Stone and Sinew altars. Each one opens in a house its
// town already had, after every roll: the counters take their ids from where they stand (placeFixed), the sign
// hangs by its edge's id, and the keeper is only a spawn, so no other object in the world moves for them.
import { boxOf, sign, fitShop, type Box, type DoorSpec, type WorldBuilder } from "./worldgen.ts";
import { SHOPS } from "./shops.ts";

export interface MagicShop {
  /** The shop, by its key in SHOPS. */
  tag: string;
  /** Its keeper, by the key in MONSTERS. */
  keeper: string;
  /** The house it opens in, with that house's door and windows as its town built them. */
  box: Box;
  door: DoorSpec;
  windows: DoorSpec[];
}

export const MAGIC_SHOPS: readonly MagicShop[] = [
  // Oakridge's north-east cottage, facing the green: the Gale altar is in the East Meadow, the Thought altar on
  // the west road below the Stockade.
  { tag: "oakridge_runes", keeper: "rune_seller", box: boxOf(3238, 3252, 3244, 3258), door: { side: 2, along: 3 }, windows: [{ side: 1, along: 3 }] },
  // Wickstead's cottage beside the bank on the square: the Tide altar stands among the village's south cottages.
  { tag: "wickstead_staves", keeper: "tide_seller", box: boxOf(2921, 3298, 2927, 3304), door: { side: 2, along: 3 }, windows: [{ side: 3, along: 3 }] },
  // Kilnhold's house inside the west gate, where the Emberway comes in from the Ember altar in the Cinderwaste.
  { tag: "kilnhold_staves", keeper: "ember_seller", box: boxOf(3604, 3239, 3609, 3244), door: { side: 2, along: 2 }, windows: [{ side: 0, along: 4 }] },
];

/** The wall edge a door stands in: the tile inside it and the side it is on, as `building` lays a door. */
export function doorEdge(box: Box, door: DoorSpec): { x: number; y: number; side: DoorSpec["side"] } {
  const across = door.side === 0 || door.side === 2;
  const x = across ? box.x0 + door.along : door.side === 1 ? box.x1 : box.x0;
  const y = across ? (door.side === 0 ? box.y1 : box.y0) : box.y0 + door.along;
  return { x, y, side: door.side };
}

/** Opens each magic shop whose house stands in this build: a build without its town has nothing to open. */
export function buildMagicShops(b: WorldBuilder): void {
  const ground = b.plane(0);
  for (const s of MAGIC_SHOPS) {
    const at = doorEdge(s.box, s.door);
    if (!ground.objects.some((o) => o.kind === "door" && o.x === at.x && o.y === at.y && o.side === at.side)) continue;
    sign(b, s.box, s.door, SHOPS[s.tag]!.sign, [s.door, ...s.windows]);
    fitShop(b, s.box, s.door, s.tag, s.keeper, true);
  }
}
