// Magic (local-notes/MAGIC.md): the runes, and the standard spellbook as the reference has it, with its
// levels, rune recipes, XP and most damage, under this game's own names. A spell is cast from the
// spellbook onto a target, or cast again and again by a staff set to it (autocast); either way it spends
// its recipe, and an elemental staff stands in for every rune of its element. Runesmithing (Phase 18)
// will make the runes; until then they are bought and dropped. Stage A1 is the elemental ladder: four
// elements in five tiers; stage A2 the curses, the binds, Lay to Rest and Take Measure.

/** The runes, in the order the spellbook's hover lists them: the four elements, then the catalysts by rarity. */
export const RUNE_KEYS = [
  "gale_rune", "tide_rune", "stone_rune", "ember_rune", "thought_rune", "sinew_rune", "wild_rune", "bloom_rune", "oath_rune",
  "grave_rune", "heart_rune", "shade_rune", "fury_rune",
] as const;
export type RuneKey = (typeof RUNE_KEYS)[number];

/** The four elements, each with its rune. */
export const ELEMENTS = ["gale", "tide", "stone", "ember"] as const;
export type Element = (typeof ELEMENTS)[number];
export const ELEMENT_RUNE: Record<Element, RuneKey> = { gale: "gale_rune", tide: "tide_rune", stone: "stone_rune", ember: "ember_rune" };

/** A staff that stands in for every rune of one element, by the staff's item key. */
export const STAFF_ELEMENT: Readonly<Record<string, Element>> = { gale_staff: "gale", tide_staff: "tide", stone_staff: "stone", ember_staff: "ember" };

/** The five tiers of the elemental ladder, weakest first: each tier's catalyst and its spells' levels come from the reference. */
export const TIERS = ["shot", "lance", "crash", "storm", "fury"] as const;
export type Tier = (typeof TIERS)[number];

/**
 * What a spell does to what it is cast on: strikes it for damage, curses one of its levels down, binds it
 * where it stands, or only reads what it is (Take Measure).
 */
export type SpellKind = "strike" | "curse" | "bind" | "inspect";
/** The levels a curse can lower. */
export type CursedStat = "attack" | "strength" | "defence";

export interface Spell {
  key: string;
  name: string;
  /** The Magic level it takes to cast it. */
  level: number;
  /** What one cast spends: runes and how many of each. */
  runes: ReadonlyArray<readonly [RuneKey, number]>;
  /** Magic XP for the cast itself, in tenths, whether or not it lands; damage pays on top. */
  xp: number;
  kind: SpellKind;
  /** An elemental spell's element and tier, which also say how it looks crossing to its target; null for the rest. */
  element: Element | null;
  tier: Tier | null;
  /** The most damage this spell does on its own. A tier's spells all rise to the best of the tier the caster has reached. */
  maxHit: number;
  /** A curse: the level it lowers and by what share of it (0.05 or 0.1). */
  curse?: { stat: CursedStat; share: number };
  /** A bind: how many ticks it holds the target where it stands. */
  holds?: number;
  /** Lay to Rest: it works on the dead alone. */
  undeadOnly?: true;
}

/** One elemental spell: the recipe as the reference writes it (element runes first), the XP in tenths. */
const recipe = (runes: Partial<Record<RuneKey, number>>) => RUNE_KEYS.filter((r) => runes[r]).map((r) => [r, runes[r]!] as const);
const elemental = (element: Element, tier: Tier, level: number, runes: Partial<Record<RuneKey, number>>, xp: number, maxHit: number): Spell => ({
  key: `${element}_${tier}`,
  name: `${element[0]!.toUpperCase()}${element.slice(1)} ${tier[0]!.toUpperCase()}${tier.slice(1)}`,
  level,
  runes: recipe(runes),
  xp,
  kind: "strike",
  element,
  tier,
  maxHit,
});
/** A spell off the elemental ladder: a curse, a bind, Lay to Rest or Take Measure. */
const other = (key: string, name: string, level: number, runes: Partial<Record<RuneKey, number>>, xp: number, kind: SpellKind, more: Partial<Spell> = {}): Spell => ({
  key, name, level, runes: recipe(runes), xp, kind, element: null, tier: null, maxHit: 0, ...more,
});

/** The spellbook in level order. */
export const SPELLS: readonly Spell[] = [
  elemental("gale", "shot", 1, { gale_rune: 1, thought_rune: 1 }, 55, 2),
  other("befuddle", "Befuddle", 3, { sinew_rune: 1, stone_rune: 2, tide_rune: 3 }, 130, "curse", { curse: { stat: "attack", share: 0.05 } }),
  elemental("tide", "shot", 5, { gale_rune: 1, tide_rune: 1, thought_rune: 1 }, 75, 4),
  elemental("stone", "shot", 9, { gale_rune: 1, stone_rune: 2, thought_rune: 1 }, 95, 6),
  other("sap", "Sap", 11, { sinew_rune: 1, stone_rune: 2, tide_rune: 3 }, 210, "curse", { curse: { stat: "strength", share: 0.05 } }),
  elemental("ember", "shot", 13, { gale_rune: 2, ember_rune: 3, thought_rune: 1 }, 115, 8),
  elemental("gale", "lance", 17, { gale_rune: 2, wild_rune: 1 }, 135, 9),
  other("hex", "Hex", 19, { sinew_rune: 1, stone_rune: 3, tide_rune: 2 }, 290, "curse", { curse: { stat: "defence", share: 0.05 } }),
  other("root", "Root", 20, { bloom_rune: 2, stone_rune: 3, tide_rune: 3 }, 300, "bind", { holds: 8 }),
  elemental("tide", "lance", 23, { gale_rune: 2, tide_rune: 2, wild_rune: 1 }, 165, 10),
  elemental("stone", "lance", 29, { gale_rune: 2, stone_rune: 3, wild_rune: 1 }, 195, 11),
  elemental("ember", "lance", 35, { gale_rune: 3, ember_rune: 4, wild_rune: 1 }, 225, 12),
  other("lay_to_rest", "Lay to Rest", 39, { gale_rune: 2, stone_rune: 2, wild_rune: 1 }, 245, "strike", { maxHit: 15, undeadOnly: true }),
  elemental("gale", "crash", 41, { gale_rune: 3, grave_rune: 1 }, 255, 13),
  other("take_measure", "Take Measure", 42, { sinew_rune: 2, thought_rune: 2 }, 305, "inspect"),
  elemental("tide", "crash", 47, { gale_rune: 3, tide_rune: 3, grave_rune: 1 }, 285, 14),
  other("bramble", "Bramble", 50, { bloom_rune: 3, stone_rune: 4, tide_rune: 4 }, 600, "bind", { holds: 16, maxHit: 3 }),
  elemental("stone", "crash", 53, { gale_rune: 3, stone_rune: 4, grave_rune: 1 }, 315, 15),
  elemental("ember", "crash", 59, { gale_rune: 4, ember_rune: 5, grave_rune: 1 }, 345, 16),
  elemental("gale", "storm", 62, { gale_rune: 5, heart_rune: 1 }, 360, 17),
  elemental("tide", "storm", 65, { gale_rune: 5, tide_rune: 7, heart_rune: 1 }, 375, 18),
  other("expose", "Expose", 66, { tide_rune: 5, stone_rune: 5, shade_rune: 1 }, 760, "curse", { curse: { stat: "defence", share: 0.1 } }),
  elemental("stone", "storm", 70, { gale_rune: 5, stone_rune: 7, heart_rune: 1 }, 400, 19),
  other("wither", "Wither", 73, { stone_rune: 8, tide_rune: 8, shade_rune: 1 }, 830, "curse", { curse: { stat: "strength", share: 0.1 } }),
  elemental("ember", "storm", 75, { gale_rune: 5, ember_rune: 7, heart_rune: 1 }, 425, 20),
  other("mire", "Mire", 79, { bloom_rune: 4, stone_rune: 5, tide_rune: 5 }, 890, "bind", { holds: 24, maxHit: 5 }),
  other("daze", "Daze", 80, { stone_rune: 12, tide_rune: 12, shade_rune: 1 }, 900, "curse", { curse: { stat: "attack", share: 0.1 } }),
  elemental("gale", "fury", 81, { gale_rune: 7, fury_rune: 1 }, 445, 21),
  elemental("tide", "fury", 85, { gale_rune: 7, tide_rune: 10, fury_rune: 1 }, 465, 22),
  elemental("stone", "fury", 90, { gale_rune: 7, stone_rune: 10, fury_rune: 1 }, 485, 23),
  elemental("ember", "fury", 95, { gale_rune: 7, ember_rune: 10, fury_rune: 1 }, 505, 24),
];

/** Ticks a curse keeps a creature's level down: a minute. */
export const CURSE_TICKS = 100;
/** A curse's drain on a level: its share of the level, at least one. */
export const drainOf = (level: number, share: number): number => Math.max(1, Math.floor(level * share));
/** Whether a staff can be set to cast a spell again and again: the ones that strike. */
export const autocastable = (spell: Spell): boolean => spell.kind === "strike";

export const SPELL_BY_KEY: ReadonlyMap<string, Spell> = new Map(SPELLS.map((s) => [s.key, s]));

/** How far a spell reaches, in tiles: the reference's ten. */
export const SPELL_RANGE = 10;

/** Magic XP per point of damage a spell does, in tenths, on top of the cast's own. */
export const SPELL_DAMAGE_XP = 20;
/** Cast defensively: Magic and Defence XP per point of damage instead, in tenths. */
export const DEFENSIVE_MAGIC_XP = 13;
export const DEFENSIVE_DEFENCE_XP = 10;

/**
 * The most a spell can do for a caster of this Magic level: the reference's rule that a tier's spells
 * all hit as hard as the best spell of that tier the caster has reached (Gale Shot hits up to 2 at level
 * 1, and up to 8 once Ember Shot is reached at 13), never less than the spell's own.
 */
export function spellMaxHit(spell: Spell, magicLevel: number): number {
  let most = spell.maxHit;
  if (spell.tier === null) return most;
  for (const s of SPELLS) if (s.tier === spell.tier && s.level <= magicLevel && s.maxHit > most) most = s.maxHit;
  return most;
}

/**
 * What a cast still lacks: each rune of the recipe the pack cannot cover, with how many are missing. A
 * staff of an element covers every rune of it. Empty when the cast can be paid for.
 */
export function shortOf(spell: Spell, held: (rune: RuneKey) => number, staff: Element | null): Array<{ rune: RuneKey; missing: number }> {
  const short: Array<{ rune: RuneKey; missing: number }> = [];
  for (const [rune, count] of spell.runes) {
    if (staff !== null && ELEMENT_RUNE[staff] === rune) continue;
    const have = held(rune);
    if (have < count) short.push({ rune, missing: count - have });
  }
  return short;
}
