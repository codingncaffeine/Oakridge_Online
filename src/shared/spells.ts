// Magic (local-notes/MAGIC.md): the runes, and the standard spellbook as the reference has it, with its
// levels, rune recipes, XP and most damage, under this game's own names. A spell is cast from the
// spellbook onto a target, or cast again and again by a staff set to it (autocast); either way it spends
// its recipe, and an elemental staff stands in for every rune of its element. Runesmithing (Phase 18)
// will make the runes; until then they are bought and dropped. Stage A1 is the elemental ladder: four
// elements in five tiers; stage A2 the curses, the binds, Lay to Rest and Take Measure; stage A3 the
// utility spells (the bones spells, the gildings, Beckon, Hand Forge) and the teleports to the towns;
// stage A4 the spells the reference locks behind its gods, quests and obelisks, each cast through a staff
// of this world's instead (Thought Dart, Scorch, Sunfall, Pyre, Wildclaw), Charge, the four orb spells, and
// Send-to, cast on another player who is asked first.

/** The runes, in the order the spellbook's hover lists them: the four elements, then the catalysts by rarity. */
export const RUNE_KEYS = [
  "gale_rune", "tide_rune", "stone_rune", "ember_rune", "thought_rune", "sinew_rune", "wild_rune", "star_rune", "bloom_rune", "oath_rune",
  "grave_rune", "heart_rune", "shade_rune", "fury_rune",
] as const;
export type RuneKey = (typeof RUNE_KEYS)[number];

/** The four elements, each with its rune. */
export const ELEMENTS = ["gale", "tide", "stone", "ember"] as const;
export type Element = (typeof ELEMENTS)[number];
export const ELEMENT_RUNE: Record<Element, RuneKey> = { gale: "gale_rune", tide: "tide_rune", stone: "stone_rune", ember: "ember_rune" };

/** A staff that stands in for every rune of one element, by the staff's item key: the elemental staves, and the battlestaves an orb is set in. */
export const STAFF_ELEMENT: Readonly<Record<string, Element>> = {
  gale_staff: "gale", tide_staff: "tide", stone_staff: "stone", ember_staff: "ember",
  gale_battlestaff: "gale", tide_battlestaff: "tide", stone_battlestaff: "stone", ember_battlestaff: "ember",
};

/** The five tiers of the elemental ladder, weakest first: each tier's catalyst and its spells' levels come from the reference. */
export const TIERS = ["shot", "lance", "crash", "storm", "fury"] as const;
export type Tier = (typeof TIERS)[number];

/**
 * What a spell does to what it is cast on: strikes it for damage, curses one of its levels down, binds it
 * where it stands, or only reads what it is (Take Measure); or, off a creature, works on an item or the
 * caster, takes the caster to a town, or asks another player whether they will be sent to one.
 */
export type SpellKind = "strike" | "curse" | "bind" | "inspect" | "utility" | "teleport" | "send";
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
  /** What it is cast on: a creature (the default), an item in the pack, an item on the ground, the caster, or another player. */
  on?: "item" | "ground" | "self" | "player";
  /** The gildings: the share of an item's value it turns into coins. */
  gild?: number;
  /** The bones spells: what every bone in the pack becomes. */
  bonesTo?: string;
  /** Hand Forge: an ore into its bar, as a furnace of any heat would. */
  forge?: true;
  /** Beckon: an item on the ground into the pack. */
  beckon?: true;
  /** A teleport's landing tile. */
  lands?: { x: number; y: number; plane: number };
  /** Hearthward: the long cast home, broken by a step or a blow, then a long wait before the next. */
  hearth?: true;
  /** A quest stage the spell waits on: Mourn's teleport waits on the Rill warden's leave, as the gate does. */
  needs?: { quest: string; stage: number };
  /**
   * A spell on the pack, the ground or oneself: the ticks before the caster can cast another such, the
   * reference's (Lesser Gilding, Hand Forge and Beckon 3, Greater Gilding 5, the bones spells 1).
   */
  speed?: number;
  /** Cast only through this staff in hand, by its item key: the lock this world puts where the reference has a god or a quest. */
  staff?: string;
  /** Thought Dart: hits up to a tenth of the Magic level and ten more (`maxHit` is that at its own level, 15). */
  dart?: true;
  /** A high spell's rider: a cast that lands lowers this level by this share, as a curse does, never twice. */
  drains?: { stat: CursedStat; share: number };
  /** One of the three high spells, which hit up to `CHARGED_MAX_HIT` while Charge holds. */
  chargeable?: true;
  /** Charge itself. */
  charge?: true;
  /** An orb spell: the item it is cast on, and what that becomes. */
  orb?: { from: string; to: string };
  /** Send-to: the town teleport whose landing the other player is sent to, by its key. */
  sends?: string;
  /** A strike off the ladder drawn crossing as one of it: Scorch as an Ember Storm. */
  drawnAs?: { element: Element; tier: Tier };
  /** An enchanting spell (stage A5c): the gems whose jewellery it enchants, by the stem of the pieces' keys. */
  enchants?: readonly string[];
  /** Enchant Arrows (stage A5d): its level, recipe and XP are each tipped arrow's own (enchant.ts); these are the first's. */
  arrows?: true;
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
/** A teleport to a town, landing on a written tile at its heart. */
const teleport = (key: string, name: string, level: number, runes: Partial<Record<RuneKey, number>>, xp: number, x: number, y: number, more: Partial<Spell> = {}): Spell => ({
  key, name, level, runes: recipe(runes), xp, kind: "teleport", element: null, tier: null, maxHit: 0, on: "self", lands: { x, y, plane: 0 }, ...more,
});
/** A spell off the elemental ladder: a curse, a bind, Lay to Rest, Take Measure, or a utility spell. */
const other = (key: string, name: string, level: number, runes: Partial<Record<RuneKey, number>>, xp: number, kind: SpellKind, more: Partial<Spell> = {}): Spell => ({
  key, name, level, runes: recipe(runes), xp, kind, element: null, tier: null, maxHit: 0, ...more,
});
/** An orb spell: thirty runes of its element and three Star runes fill a glass orb with the element. */
const orbSpell = (element: Element, level: number, xp: number): Spell =>
  other(`charge_${element}_orb`, `Charge ${element[0]!.toUpperCase()}${element.slice(1)} Orb`, level, { [ELEMENT_RUNE[element]]: 30, star_rune: 3 }, xp, "utility", {
    on: "item", orb: { from: "glass_orb", to: `${element}_orb` }, speed: 3,
  });
/** A high spell: level 60, up to 20 (30 while Charge holds), cast through its own staff, lowering a level 5% when it lands. */
const high = (key: string, name: string, runes: Partial<Record<RuneKey, number>>, staff: string, stat: CursedStat): Spell =>
  other(key, name, 60, runes, 350, "strike", { maxHit: 20, staff, chargeable: true, drains: { stat, share: 0.05 } });
/** An enchanting spell: its gems' pieces in the pack become their enchanted selves; three ticks a cast, the reference's. */
const enchant = (gem: string, level: number, runes: Partial<Record<RuneKey, number>>, xp: number, also: string[] = []): Spell =>
  other(`enchant_${gem}`, `Enchant ${gem[0]!.toUpperCase()}${gem.slice(1)}`, level, runes, xp, "utility", { on: "item", enchants: [gem, ...also], speed: 3 });
/** Send-to: cast on another player, who is asked, and on a yes goes where the town's teleport lands; ten ticks a cast, the reference's. */
const send = (key: string, name: string, level: number, runes: Partial<Record<RuneKey, number>>, xp: number, sends: string): Spell =>
  other(key, name, level, runes, xp, "send", { on: "player", sends, speed: 10 });

/** The spellbook in level order. */
export const SPELLS: readonly Spell[] = [
  teleport("hearthward", "Hearthward", 0, {}, 0, 3232, 3232, { hearth: true }),
  elemental("gale", "shot", 1, { gale_rune: 1, thought_rune: 1 }, 55, 2),
  other("befuddle", "Befuddle", 3, { sinew_rune: 1, stone_rune: 2, tide_rune: 3 }, 130, "curse", { curse: { stat: "attack", share: 0.05 } }),
  other("enchant_arrows", "Enchant Arrows", 4, { star_rune: 1, gale_rune: 2 }, 90, "utility", { on: "item", arrows: true, speed: 3 }),
  elemental("tide", "shot", 5, { gale_rune: 1, tide_rune: 1, thought_rune: 1 }, 75, 4),
  enchant("sapphire", 7, { star_rune: 1, tide_rune: 1 }, 175, ["opal"]),
  elemental("stone", "shot", 9, { gale_rune: 1, stone_rune: 2, thought_rune: 1 }, 95, 6),
  other("sap", "Sap", 11, { sinew_rune: 1, stone_rune: 2, tide_rune: 3 }, 210, "curse", { curse: { stat: "strength", share: 0.05 } }),
  elemental("ember", "shot", 13, { gale_rune: 2, ember_rune: 3, thought_rune: 1 }, 115, 8),
  other("bones_to_bread", "Bones to Bread", 15, { tide_rune: 2, stone_rune: 2, bloom_rune: 1 }, 250, "utility", { on: "self", bonesTo: "bread", speed: 1 }),
  elemental("gale", "lance", 17, { gale_rune: 2, wild_rune: 1 }, 135, 9),
  other("hex", "Hex", 19, { sinew_rune: 1, stone_rune: 3, tide_rune: 2 }, 290, "curse", { curse: { stat: "defence", share: 0.05 } }),
  other("root", "Root", 20, { bloom_rune: 2, stone_rune: 3, tide_rune: 3 }, 300, "bind", { holds: 8 }),
  other("lesser_gilding", "Lesser Gilding", 21, { bloom_rune: 1, ember_rune: 3 }, 310, "utility", { on: "item", gild: 0.4, speed: 3 }),
  elemental("tide", "lance", 23, { gale_rune: 2, tide_rune: 2, wild_rune: 1 }, 165, 10),
  teleport("thornbury_teleport", "Thornbury Teleport", 25, { oath_rune: 1, gale_rune: 3, ember_rune: 1 }, 350, 3151, 3516),
  enchant("emerald", 27, { star_rune: 1, gale_rune: 3 }, 370, ["jade"]),
  elemental("stone", "lance", 29, { gale_rune: 2, stone_rune: 3, wild_rune: 1 }, 195, 11),
  teleport("oakridge_teleport", "Oakridge Teleport", 31, { oath_rune: 1, gale_rune: 3, stone_rune: 1 }, 410, 3232, 3232),
  other("beckon", "Beckon", 33, { oath_rune: 1, gale_rune: 1 }, 430, "utility", { on: "ground", beckon: true, speed: 3 }),
  elemental("ember", "lance", 35, { gale_rune: 3, ember_rune: 4, wild_rune: 1 }, 225, 12),
  teleport("wickstead_teleport", "Wickstead Teleport", 37, { oath_rune: 1, gale_rune: 3, tide_rune: 1 }, 470, 2914, 3290),
  other("lay_to_rest", "Lay to Rest", 39, { gale_rune: 2, stone_rune: 2, wild_rune: 1 }, 245, "strike", { maxHit: 15, undeadOnly: true }),
  elemental("gale", "crash", 41, { gale_rune: 3, grave_rune: 1 }, 255, 13),
  other("take_measure", "Take Measure", 42, { sinew_rune: 2, thought_rune: 2 }, 305, "inspect"),
  other("hand_forge", "Hand Forge", 43, { ember_rune: 4, bloom_rune: 1 }, 530, "utility", { on: "item", forge: true, speed: 3 }),
  teleport("brinehaven_teleport", "Brinehaven Teleport", 45, { oath_rune: 1, gale_rune: 5 }, 555, 2910, 3044),
  elemental("tide", "crash", 47, { gale_rune: 3, tide_rune: 3, grave_rune: 1 }, 285, 14),
  teleport("kilnhold_teleport", "Kilnhold Teleport", 48, { oath_rune: 2, ember_rune: 1, tide_rune: 1 }, 580, 3621, 3232),
  enchant("ruby", 49, { star_rune: 1, ember_rune: 5 }, 590, ["topaz"]),
  other("bramble", "Bramble", 50, { bloom_rune: 3, stone_rune: 4, tide_rune: 4 }, 600, "bind", { holds: 16, maxHit: 3 }),
  other("thought_dart", "Thought Dart", 50, { grave_rune: 1, thought_rune: 4 }, 300, "strike", { maxHit: 15, dart: true, staff: "hunter_staff" }),
  other("scorch", "Scorch", 50, { ember_rune: 5, grave_rune: 1 }, 300, "strike", { maxHit: 25, staff: "sear_staff", drawnAs: { element: "ember", tier: "storm" } }),
  teleport("deepdelve_teleport", "Deepdelve Teleport", 51, { oath_rune: 2, tide_rune: 2 }, 610, 2912, 3548),
  elemental("stone", "crash", 53, { gale_rune: 3, stone_rune: 4, grave_rune: 1 }, 315, 15),
  teleport("sandreach_teleport", "Sandreach Teleport", 54, { oath_rune: 2, stone_rune: 1, ember_rune: 1 }, 640, 3872, 3043),
  other("greater_gilding", "Greater Gilding", 55, { ember_rune: 5, bloom_rune: 1 }, 650, "utility", { on: "item", gild: 0.6, speed: 5 }),
  orbSpell("tide", 56, 660),
  enchant("diamond", 57, { star_rune: 1, stone_rune: 10 }, 670),
  teleport("harrow_gate_teleport", "Harrow Gate Teleport", 58, { oath_rune: 2, stone_rune: 2 }, 680, 3122, 3597),
  elemental("ember", "crash", 59, { gale_rune: 4, ember_rune: 5, grave_rune: 1 }, 345, 16),
  other("bones_to_plums", "Bones to Plums", 60, { tide_rune: 4, stone_rune: 2, bloom_rune: 2 }, 355, "utility", { on: "self", bonesTo: "plum", speed: 1 }),
  orbSpell("stone", 60, 700),
  high("sunfall", "Sunfall", { gale_rune: 4, ember_rune: 2, heart_rune: 2 }, "dawn_staff", "attack"),
  high("pyre", "Pyre", { gale_rune: 1, ember_rune: 4, heart_rune: 2 }, "pyre_staff", "strength"),
  high("wildclaw", "Wildclaw", { gale_rune: 4, ember_rune: 1, heart_rune: 2 }, "briar_staff", "defence"),
  teleport("tarhollow_teleport", "Tarhollow Teleport", 61, { oath_rune: 2, ember_rune: 2 }, 680, 2272, 2656),
  elemental("gale", "storm", 62, { gale_rune: 5, heart_rune: 1 }, 360, 17),
  orbSpell("ember", 63, 730),
  teleport("mourn_teleport", "Mourn Teleport", 64, { oath_rune: 2, ember_rune: 2, tide_rune: 2 }, 740, 3872, 3552, { needs: { quest: "silence_at_mourn", stage: 5 } }),
  elemental("tide", "storm", 65, { gale_rune: 5, tide_rune: 7, heart_rune: 1 }, 375, 18),
  other("expose", "Expose", 66, { tide_rune: 5, stone_rune: 5, shade_rune: 1 }, 760, "curse", { curse: { stat: "defence", share: 0.1 } }),
  orbSpell("gale", 66, 760),
  enchant("wyrmstone", 68, { star_rune: 1, stone_rune: 15, tide_rune: 15 }, 780),
  elemental("stone", "storm", 70, { gale_rune: 5, stone_rune: 7, heart_rune: 1 }, 400, 19),
  other("wither", "Wither", 73, { stone_rune: 8, tide_rune: 8, shade_rune: 1 }, 830, "curse", { curse: { stat: "strength", share: 0.1 } }),
  send("send_oakridge", "Send to Oakridge", 74, { stone_rune: 1, oath_rune: 1, shade_rune: 1 }, 840, "oakridge_teleport"),
  elemental("ember", "storm", 75, { gale_rune: 5, ember_rune: 7, heart_rune: 1 }, 425, 20),
  other("mire", "Mire", 79, { bloom_rune: 4, stone_rune: 5, tide_rune: 5 }, 890, "bind", { holds: 24, maxHit: 5 }),
  other("daze", "Daze", 80, { stone_rune: 12, tide_rune: 12, shade_rune: 1 }, 900, "curse", { curse: { stat: "attack", share: 0.1 } }),
  other("charge", "Charge", 80, { gale_rune: 3, ember_rune: 3, heart_rune: 3 }, 1800, "utility", { on: "self", charge: true }),
  elemental("gale", "fury", 81, { gale_rune: 7, fury_rune: 1 }, 445, 21),
  send("send_wickstead", "Send to Wickstead", 82, { tide_rune: 1, oath_rune: 1, shade_rune: 1 }, 920, "wickstead_teleport"),
  elemental("tide", "fury", 85, { gale_rune: 7, tide_rune: 10, fury_rune: 1 }, 465, 22),
  enchant("onyx", 87, { star_rune: 1, stone_rune: 20, ember_rune: 20 }, 970),
  elemental("stone", "fury", 90, { gale_rune: 7, stone_rune: 10, fury_rune: 1 }, 485, 23),
  send("send_brinehaven", "Send to Brinehaven", 90, { oath_rune: 1, shade_rune: 2 }, 1000, "brinehaven_teleport"),
  enchant("sunstone", 93, { star_rune: 1, heart_rune: 20, shade_rune: 20 }, 1100),
  elemental("ember", "fury", 95, { gale_rune: 7, ember_rune: 10, fury_rune: 1 }, 505, 24),
];

/** Ticks a teleport's cast takes before the caster goes: the reference's three. */
export const TELEPORT_TICKS = 3;
/** Ticks Hearthward's long cast takes, and how long before it can be cast again (milliseconds, kept across logouts). */
export const HEARTH_TICKS = 16;
export const HEARTH_WAIT_MS = 30 * 60 * 1000;

/** Charge: how long the high spells hit the harder, the most they hit meanwhile, and how soon it can be cast again (the reference's). */
export const CHARGE_TICKS = 700;
export const CHARGED_MAX_HIT = 30;
export const CHARGE_WAIT_TICKS = 100;

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
 * 1, and up to 8 once Ember Shot is reached at 13), never less than the spell's own. Thought Dart hits up
 * to a tenth of the level and ten more; a high spell up to 30 while the caster is `charged`.
 */
export function spellMaxHit(spell: Spell, magicLevel: number, charged = false): number {
  if (spell.dart) return Math.floor(magicLevel / 10) + 10;
  if (spell.chargeable && charged) return CHARGED_MAX_HIT;
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
