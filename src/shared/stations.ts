import type { ObjectKind } from "./map.ts";

/**
 * A place a player does something *at* rather than *to*: the village's counters and Phase 8's
 * workbenches. Gathering objects (trees, rocks) are not stations — those are in `RESOURCES`.
 */
export type Station = "bank" | "shop" | "furnace" | "anvil" | "range" | "fire" | "mill";

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
};

/** What the left-click on each station says, in the classic verb-then-target form. */
export const STATION_VERB: Record<Station, string> = {
  bank: "Use",
  shop: "Trade",
  furnace: "Smelt",
  anvil: "Smith",
  range: "Cook",
  fire: "Cook",
  mill: "Operate",
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
};
