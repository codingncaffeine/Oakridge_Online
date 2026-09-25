// Magic (local-notes/MAGIC.md): the runes, and the standard spellbook as the reference has it, with its
// levels, rune recipes, XP and most damage, under this game's own names. A spell is cast from the
// spellbook onto a target, or cast again and again by a staff set to it (autocast); either way it spends
// its recipe, and an elemental staff stands in for every rune of its element. Runesmithing (Phase 18)
// will make the runes; until then they are bought and dropped. Stage A1 is the elemental ladder: four
// elements in five tiers.

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

export interface Spell {
  key: string;
  name: string;
  /** The Magic level it takes to cast it. */
  level: number;
  /** What one cast spends: runes and how many of each. */
  runes: ReadonlyArray<readonly [RuneKey, number]>;
  /** Magic XP for the cast itself, in tenths, whether or not it lands; damage pays on top. */
  xp: number;
  /** An elemental spell's element and tier, which also say how it looks crossing to its target. */
  element: Element;
  tier: Tier;
  /** The most damage this spell does on its own. A tier's spells all rise to the best of the tier the caster has reached. */
  maxHit: number;
}

/** One elemental spell: the recipe as the reference writes it (element runes first), the XP in tenths. */
const elemental = (element: Element, tier: Tier, level: number, runes: Partial<Record<RuneKey, number>>, xp: number, maxHit: number): Spell => ({
  key: `${element}_${tier}`,
  name: `${element[0]!.toUpperCase()}${element.slice(1)} ${tier[0]!.toUpperCase()}${tier.slice(1)}`,
  level,
  runes: RUNE_KEYS.filter((r) => runes[r]).map((r) => [r, runes[r]!] as const),
  xp,
  element,
  tier,
  maxHit,
});

/** The spellbook in level order. */
export const SPELLS: readonly Spell[] = [
  elemental("gale", "shot", 1, { gale_rune: 1, thought_rune: 1 }, 55, 2),
  elemental("tide", "shot", 5, { gale_rune: 1, tide_rune: 1, thought_rune: 1 }, 75, 4),
  elemental("stone", "shot", 9, { gale_rune: 1, stone_rune: 2, thought_rune: 1 }, 95, 6),
  elemental("ember", "shot", 13, { gale_rune: 2, ember_rune: 3, thought_rune: 1 }, 115, 8),
  elemental("gale", "lance", 17, { gale_rune: 2, wild_rune: 1 }, 135, 9),
  elemental("tide", "lance", 23, { gale_rune: 2, tide_rune: 2, wild_rune: 1 }, 165, 10),
  elemental("stone", "lance", 29, { gale_rune: 2, stone_rune: 3, wild_rune: 1 }, 195, 11),
  elemental("ember", "lance", 35, { gale_rune: 3, ember_rune: 4, wild_rune: 1 }, 225, 12),
  elemental("gale", "crash", 41, { gale_rune: 3, grave_rune: 1 }, 255, 13),
  elemental("tide", "crash", 47, { gale_rune: 3, tide_rune: 3, grave_rune: 1 }, 285, 14),
  elemental("stone", "crash", 53, { gale_rune: 3, stone_rune: 4, grave_rune: 1 }, 315, 15),
  elemental("ember", "crash", 59, { gale_rune: 4, ember_rune: 5, grave_rune: 1 }, 345, 16),
  elemental("gale", "storm", 62, { gale_rune: 5, heart_rune: 1 }, 360, 17),
  elemental("tide", "storm", 65, { gale_rune: 5, tide_rune: 7, heart_rune: 1 }, 375, 18),
  elemental("stone", "storm", 70, { gale_rune: 5, stone_rune: 7, heart_rune: 1 }, 400, 19),
  elemental("ember", "storm", 75, { gale_rune: 5, ember_rune: 7, heart_rune: 1 }, 425, 20),
  elemental("gale", "fury", 81, { gale_rune: 7, fury_rune: 1 }, 445, 21),
  elemental("tide", "fury", 85, { gale_rune: 7, tide_rune: 10, fury_rune: 1 }, 465, 22),
  elemental("stone", "fury", 90, { gale_rune: 7, stone_rune: 10, fury_rune: 1 }, 485, 23),
  elemental("ember", "fury", 95, { gale_rune: 7, ember_rune: 10, fury_rune: 1 }, 505, 24),
];

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
