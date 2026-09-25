// Combat: the classic's rolls (effective levels, an attack roll against a defence roll, a flat damage
// roll up to a max hit), with this game's own stances, weapon classes, speeds and XP rates. Melee came
// first; Phase 11 put a bow, a staff and the prayers through the same two rolls.
import { BONUS_NAMES, type Bonuses } from "./items.ts";
import type { SkillKey } from "./skills.ts";
import { SPELL_RANGE } from "./spells.ts";

/** How a blow is thrown: the three ways a hand weapon strikes, an arrow, or a spell. */
export type MeleeType = "stab" | "slash" | "crush";
export type AttackType = MeleeType | "magic" | "ranged";
export const MELEE_TYPES: MeleeType[] = ["stab", "slash", "crush"];
export const ATTACK_TYPES: AttackType[] = ["stab", "slash", "crush", "magic", "ranged"];

/** The five levels the rolls read. Hitpoints and Prayer are not among them: they are what the rolls spend. */
export type CombatSkill = "attack" | "strength" | "defence" | "ranged" | "magic";

/**
 * How a swing is thrown. Each leans the fighter one way: the stance lends three invisible levels to the
 * skill it trains, Balanced lends one to each of the three melee skills, and Far lends one to Ranged
 * and three to Defence. Quick lends nothing and takes a tick off the draw instead.
 */
export type Stance = "precise" | "forceful" | "guarded" | "balanced" | "aimed" | "quick" | "far" | "casting" | "warding";

/** Which bonus in an equipment `Bonuses` array an attack type reads, on offence and on defence. */
export const ATTACK_BONUS: Record<AttackType, number> = { stab: 0, slash: 1, crush: 2, magic: 3, ranged: 4 };
export const DEFENCE_BONUS: Record<AttackType, number> = { stab: 5, slash: 6, crush: 7, magic: 8, ranged: 9 };
export const STRENGTH_BONUS = BONUS_NAMES.indexOf("Strength");
export const PRAYER_BONUS = BONUS_NAMES.indexOf("Prayer");

/**
 * One option on the combat tab: what it's called, how it strikes, and how it's thrown. A bow's styles
 * reach `range` tiles; a staff's casting styles cast the spell the staff is set to (`autocast`, chosen in
 * the spellbook); `speed` is the ticks between blows when it isn't the weapon's own.
 */
export interface Style {
  name: string;
  type: AttackType;
  stance: Stance;
  range?: number;
  speed?: number;
  autocast?: true;
}

/** The invisible levels a stance lends to each skill. */
export function stanceBoost(stance: Stance, skill: CombatSkill): number {
  switch (stance) {
    case "balanced": return skill === "attack" || skill === "strength" || skill === "defence" ? 1 : 0;
    case "precise": return skill === "attack" ? 3 : 0;
    case "forceful": return skill === "strength" ? 3 : 0;
    case "guarded": return skill === "defence" ? 3 : 0;
    case "aimed": return skill === "ranged" ? 3 : 0;
    case "quick": return 0;
    case "far": return skill === "ranged" ? 1 : skill === "defence" ? 3 : 0;
    case "casting": return skill === "magic" ? 3 : 0;
    case "warding": return skill === "defence" ? 3 : 0;
  }
}

/**
 * XP per point of damage, in tenths. A stance pays 4 XP into the skill it trains, or 1.3 into each of
 * the three when Balanced; every hit pays 1.3 into Hitpoints on top. (The classic's Hitpoints rate is
 * 1.33; tenths are the smallest XP this game stores, so ours is 1.3.)
 */
export const HITPOINTS_XP = 13;

/**
 * XP per point of damage TAKEN, in tenths: defending trains Defence. Half of what a stance pays into
 * the skill it trains, so a guarded stance is still the quicker way to train it and this is the trickle
 * that comes of being on the receiving end.
 *
 * It is paid on damage rather than on every blow thrown, so a blow that lands for nothing earns nothing
 * — the same rule as on the attacking side — and standing in front of something too weak to land on
 * you earns nothing at all.
 */
export const DEFENCE_XP = 20;

/**
 * What a stance pays per point of damage. Far splits between Ranged and Defence. A cast's XP is the
 * spell's own business (see `SPELLS`): these two lines are only what a stance would pay per point.
 */
export function styleXp(stance: Stance): Partial<Record<SkillKey, number>> {
  switch (stance) {
    case "balanced": return { attack: 13, strength: 13, defence: 13, hitpoints: HITPOINTS_XP };
    case "precise": return { attack: 40, hitpoints: HITPOINTS_XP };
    case "forceful": return { strength: 40, hitpoints: HITPOINTS_XP };
    case "guarded": return { defence: 40, hitpoints: HITPOINTS_XP };
    case "aimed":
    case "quick": return { ranged: 40, hitpoints: HITPOINTS_XP };
    case "far": return { ranged: 20, defence: 20, hitpoints: HITPOINTS_XP };
    case "casting": return { magic: 20, hitpoints: HITPOINTS_XP };
    case "warding": return { magic: 13, defence: 10, hitpoints: HITPOINTS_XP };
  }
}

/** A family of weapons: which styles it offers and how many ticks it takes between swings. */
export interface WeaponClass {
  styles: Style[];
  speed: number;
}

/** How far a bow's arrow carries, in tiles, and how much further when the archer takes their time. */
export const BOW_RANGE = 7;
export const FAR_RANGE = 9;

/**
 * The weapon families. Bare hands are the fallback for anything with no class of its own, so a player
 * holding a fish still has somewhere to put their fists. A bow shoots; a staff casts the spell it is set
 * to, plainly or warding (Magic and Defence), and can still be swung.
 */
export const WEAPON_CLASSES = {
  unarmed: {
    speed: 4,
    styles: [
      { name: "Jab", type: "crush", stance: "precise" },
      { name: "Hook", type: "crush", stance: "forceful" },
      { name: "Cover", type: "crush", stance: "guarded" },
    ],
  },
  blade: {
    speed: 4,
    styles: [
      { name: "Thrust", type: "stab", stance: "precise" },
      { name: "Rip", type: "slash", stance: "forceful" },
      { name: "Feint", type: "stab", stance: "balanced" },
      { name: "Turn aside", type: "slash", stance: "guarded" },
    ],
  },
  sword: {
    speed: 5,
    styles: [
      { name: "Cleave", type: "slash", stance: "precise" },
      { name: "Hew", type: "slash", stance: "forceful" },
      { name: "Run through", type: "stab", stance: "balanced" },
      { name: "Ward", type: "slash", stance: "guarded" },
    ],
  },
  axe: {
    speed: 5,
    styles: [
      { name: "Bite", type: "slash", stance: "precise" },
      { name: "Swing", type: "slash", stance: "forceful" },
      { name: "Flat of the blade", type: "crush", stance: "forceful" },
      { name: "Hold off", type: "slash", stance: "guarded" },
    ],
  },
  pick: {
    speed: 5,
    styles: [
      { name: "Pierce", type: "stab", stance: "precise" },
      { name: "Drive", type: "stab", stance: "forceful" },
      { name: "Hammer down", type: "crush", stance: "forceful" },
      { name: "Fend", type: "stab", stance: "guarded" },
    ],
  },
  club: {
    speed: 5,
    styles: [
      { name: "Rap", type: "crush", stance: "precise" },
      { name: "Batter", type: "crush", stance: "forceful" },
      { name: "Jab", type: "stab", stance: "balanced" },
      { name: "Shield up", type: "crush", stance: "guarded" },
    ],
  },
  bow: {
    speed: 5,
    styles: [
      { name: "Aimed", type: "ranged", stance: "aimed", range: BOW_RANGE },
      { name: "Quick", type: "ranged", stance: "quick", range: BOW_RANGE, speed: 4 },
      { name: "Far", type: "ranged", stance: "far", range: FAR_RANGE },
    ],
  },
  staff: {
    speed: 5,
    styles: [
      { name: "Cast", type: "magic", stance: "casting", range: SPELL_RANGE, autocast: true },
      { name: "Cast warding", type: "magic", stance: "warding", range: SPELL_RANGE, autocast: true },
      { name: "Bash", type: "crush", stance: "forceful" },
      { name: "Block", type: "crush", stance: "guarded" },
    ],
  },
} as const satisfies Record<string, WeaponClass>;

export type WeaponClassName = keyof typeof WEAPON_CLASSES;
export const DEFAULT_CLASS: WeaponClassName = "unarmed";

/** The styles a weapon class offers, and a style index kept inside that list. */
export const stylesOf = (cls: WeaponClassName): readonly Style[] => WEAPON_CLASSES[cls].styles;
export const styleAt = (cls: WeaponClassName, index: number): Style => {
  const list = stylesOf(cls);
  return list[Math.min(Math.max(0, Math.floor(index)), list.length - 1)]!;
};

/** Ticks between blows in a style: its own speed when it names one, the weapon's otherwise. */
export const speedOf = (cls: WeaponClassName, style: Style): number => style.speed ?? WEAPON_CLASSES[cls].speed;
/** How far a style reaches: beside the target for anything that is not a bow or a spell. */
export const rangeOf = (style: Style): number => style.range ?? 1;

/**
 * A fighter's levels, worn bonuses and stance, as both rolls need them. An NPC has no stance, no
 * prayers and no worn equipment: its bonuses come from its own definition.
 */
export interface Fighter {
  attack: number;
  strength: number;
  defence: number;
  ranged: number;
  magic: number;
  bonuses: Bonuses;
  /** The arrow's own Ranged number, which is to an arrow what the worn Strength bonus is to a blow. */
  rangedStrength: number;
  /** The shares the prayers that are on lend to each level: 0.05 for a fifth-level prayer. */
  boosts: Partial<Record<CombatSkill, number>>;
  /** The stance a player is fighting in; null for a monster. */
  stance: Stance | null;
}

/**
 * A fighter's level in one combat skill once a prayer's share, the stance and the flat +8 are in. A
 * monster has no stance, so it takes the classic's flat +9 (the same +8, plus the one level an NPC's
 * stance lends).
 */
export function effectiveLevel(f: Fighter, skill: CombatSkill): number {
  const level = Math.floor(f[skill] * (1 + (f.boosts[skill] ?? 0)));
  return f.stance === null ? level + 9 : level + stanceBoost(f.stance, skill) + 8;
}

/** Which level throws a blow of that type. */
export const attackSkillOf = (type: AttackType): CombatSkill => type === "ranged" ? "ranged" : type === "magic" ? "magic" : "attack";

/** The roll an attack makes: its effective level for the type of blow, against the bonus for it. */
export function attackRoll(f: Fighter, type: AttackType): number {
  return effectiveLevel(f, attackSkillOf(type)) * ((f.bonuses[ATTACK_BONUS[type]] ?? 0) + 64);
}

/** The roll a defender makes against a blow of that type. */
export function defenceRoll(f: Fighter, type: AttackType): number {
  return effectiveLevel(f, "defence") * ((f.bonuses[DEFENCE_BONUS[type]] ?? 0) + 64);
}

/** The chance a blow lands: the classic's two cases, which meet where the rolls are equal. */
export function hitChance(attack: number, defence: number): number {
  const p = attack > defence ? 1 - (defence + 2) / (2 * (attack + 1)) : attack / (2 * (defence + 1));
  return Math.min(1, Math.max(0, p));
}

/** The most damage one blow can do: effective strength against the strength bonus worn. */
export function maxHit(f: Fighter): number {
  const strength = (f.bonuses[STRENGTH_BONUS] ?? 0) + 64;
  return Math.floor((effectiveLevel(f, "strength") * strength + 320) / 640);
}

/** The most an arrow can do: the same arithmetic, with effective Ranged for the level and the arrow's own number for the bonus. */
export function rangedMaxHit(f: Fighter): number {
  return Math.floor((effectiveLevel(f, "ranged") * (f.rangedStrength + 64) + 320) / 640);
}

/**
 * Whether a blow gets through: the accuracy half of a swing on its own, for a fighter whose damage is
 * set some other way (a creature carries its max hit outright). `rand` gives numbers in [0, 1).
 */
export function lands(attacker: Fighter, defender: Fighter, type: AttackType, rand: () => number): boolean {
  return rand() < hitChance(attackRoll(attacker, type), defenceRoll(defender, type));
}

/**
 * How hard a blow that got through falls: flat, from nothing up to the most it could do. The roll is
 * taken from the top down, so that a test pinning the world's random numbers to 0 — which means "every
 * roll succeeds" everywhere else — gets the hardest blow rather than the softest. Reading it from the
 * bottom up would make a pinned run land every hit for nothing, and nothing could ever be killed.
 */
export function damageRoll(most: number, rand: () => number): number {
  return Math.min(most, Math.floor((1 - rand()) * (most + 1)));
}

/**
 * One swing: a roll to land it, then a flat roll from 0 to the max hit — the blow's own for melee, the
 * arrow's for a shot, or `most` when the caller sets it (a spell carries its own).
 *
 * A blow a PLAYER gets through never lands for nothing — the classic pushes a rolled nothing up to
 * one, for players only (the classic's own rule; the source is in the plan). It matters most at the
 * beginning, where the max hit is 1 and half of every landed blow would otherwise show a nought and
 * read as a miss. A creature's blow can still come to nothing.
 */
export function swing(attacker: Fighter, defender: Fighter, type: AttackType, rand: () => number, most?: number): number {
  if (!lands(attacker, defender, type, rand)) return 0;
  const top = most ?? (type === "ranged" ? rangedMaxHit(attacker) : maxHit(attacker));
  const rolled = damageRoll(top, rand);
  return attacker.stance === null ? rolled : Math.max(1, rolled);
}

/**
 * The combat level, on the classic's shape with our numbers: a quarter of a level each for Defence and
 * Hitpoints and an eighth for Prayer, plus the best of the three ways of fighting — 0.325 of Attack and
 * Strength together, or of one and a half Ranged, or of one and a half Magic. A creature has none of
 * the three new skills, and comes out where it always did.
 */
export function combatLevel(levels: {
  attack: number; strength: number; defence: number; hitpoints: number; ranged?: number; magic?: number; prayer?: number;
}): number {
  const base = (levels.defence + levels.hitpoints + Math.floor((levels.prayer ?? 1) / 2)) / 4;
  const melee = (13 * (levels.attack + levels.strength)) / 40;
  const ranged = (13 * Math.floor(1.5 * (levels.ranged ?? 1))) / 40;
  const magic = (13 * Math.floor(1.5 * (levels.magic ?? 1))) / 40;
  return Math.floor(base + Math.max(melee, ranged, magic));
}

/** Ticks between a fighter's swings when its weapon says nothing: the common speed. */
export const DEFAULT_SPEED = 4;
