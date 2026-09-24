// The spells (PLAN Phase 11). A staff's styles are its spells: each is one reagent a cast, spent hit
// or miss, with its own most damage and its own Magic level to learn it. Three to begin with, one for
// each reagent the staff seller keeps; the names, numbers and reagents are this game's own.

export type SpellKey = "ember_bolt" | "frost_spike" | "storm_strike";

/** What the client draws crossing to the target: the bolt's colour and manner. */
export type BoltKind = "ember" | "frost" | "storm";

export interface Spell {
  key: SpellKey;
  name: string;
  /** The Magic level it takes to cast it. */
  level: number;
  /** The item spent on every cast, by its key: one of it a cast. */
  reagent: string;
  /** The most damage one cast can do. A spell carries this outright; the Magic level decides whether it lands. */
  maxHit: number;
  /** Magic XP paid for the cast itself, in tenths, whether or not it lands; damage pays on top. */
  xp: number;
  bolt: BoltKind;
}

export const SPELLS: Record<SpellKey, Spell> = {
  ember_bolt: { key: "ember_bolt", name: "Ember Bolt", level: 1, reagent: "ember_dust", maxHit: 3, xp: 55, bolt: "ember" },
  frost_spike: { key: "frost_spike", name: "Frost Spike", level: 13, reagent: "frost_salt", maxHit: 6, xp: 115, bolt: "frost" },
  storm_strike: { key: "storm_strike", name: "Storm Strike", level: 29, reagent: "storm_glass", maxHit: 9, xp: 185, bolt: "storm" },
};

export const SPELL_KEYS = Object.keys(SPELLS) as SpellKey[];

/** How far a spell reaches, in tiles. */
export const SPELL_RANGE = 8;

/** Magic XP per point of damage a spell does, in tenths, on top of the cast's own. */
export const SPELL_DAMAGE_XP = 20;
