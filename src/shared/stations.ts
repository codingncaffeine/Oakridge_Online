import type { ObjectKind } from "./map.ts";

/**
 * A place a player does something *at* rather than *to*: the village's counters and Phase 8's
 * workbenches. Gathering objects (trees, rocks) are not stations — those are in `RESOURCES`.
 */
export type Station =
  | "bank" | "shop" | "furnace" | "anvil" | "range" | "fire" | "mill" | "altar" | "wheel" | "loom" | "water" | "potter" | "kiln";

/** Which station each object kind is, for the kinds that are one. */
export const STATION_OF: Partial<Record<ObjectKind, Station>> = {
  bank_booth: "bank",
  counter: "shop",
  stall: "shop",
  furnace: "furnace",
  anvil: "anvil",
  range: "range",
  fire: "fire",
  millstone: "mill",
  altar: "altar",
  spinning_wheel: "wheel",
  loom: "loom",
  // Pottery (Crafting, C3): clay is wetted at any well or trough, shaped at the wheel and fired in a kiln.
  well: "water",
  trough: "water",
  potters_wheel: "potter",
  kiln: "kiln",
};

/**
 * What the left-click on each station says, in the classic verb-then-target form. Water has none of its own:
 * a well or a trough is only ever something clay is used on.
 */
export const STATION_VERB: Record<Station, string | null> = {
  bank: "Use",
  shop: "Trade",
  furnace: "Smelt",
  anvil: "Smith",
  range: "Cook",
  fire: "Cook",
  mill: "Operate",
  altar: "Pray-at",
  wheel: "Spin",
  loom: "Weave",
  water: null,
  potter: "Shape",
  kiln: "Fire",
};

/** The name each station shows under the cursor. */
export const STATION_NAME: Partial<Record<ObjectKind, string>> = {
  bank_booth: "Bank booth",
  counter: "Counter",
  stall: "Market stall",
  furnace: "Furnace",
  anvil: "Anvil",
  range: "Range",
  fire: "Fire",
  millstone: "Millstone",
  altar: "Altar",
  spinning_wheel: "Spinning wheel",
  loom: "Loom",
  well: "Well",
  trough: "Trough",
  potters_wheel: "Potter's wheel",
  kiln: "Kiln",
};
