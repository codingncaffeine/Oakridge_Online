// Melee combat: the classic's rolls (effective levels, an attack roll against a defence roll, a flat
// damage roll up to a max hit), with this game's own stances, weapon classes, speeds and XP rates.
import { BONUS_NAMES, type Bonuses } from "./items.ts";
import type { SkillKey } from "./skills.ts";

export type AttackType = "stab" | "slash" | "crush";
export const ATTACK_TYPES: AttackType[] = ["stab", "slash", "crush"];

/**
 * How a swing is thrown. Each leans the fighter one way: the stance lends three invisible levels to the
 * skill it trains, and Balanced lends one to each of the three.
 */
export type Stance = "precise" | "forceful" | "guarded" | "balanced";

/** Which bonus in an equipment `Bonuses` array an attack type reads, on offence and on defence. */
export const ATTACK_BONUS: Record<AttackType, number> = { stab: 0, slash: 1, crush: 2 };
export const DEFENCE_BONUS: Record<AttackType, number> = { stab: 5, slash: 6, crush: 7 };
export const STRENGTH_BONUS = BONUS_NAMES.indexOf("Strength");

/** One option on the combat tab: what it's called, how it strikes, and how it's thrown. */
export interface Style {
  name: string;
  type: AttackType;
  stance: Stance;
}

/**
 * The stance's invisible levels, by skill. The classic's +3 to the one skill a stance trains, and +1 to
 * each of the three for a controlled stance.
 */
export function stanceBoost(stance: Stance, skill: "attack" | "strength" | "defence"): number {
  if (stance === "balanced") return 1;
  const trains: Record<Exclude<Stance, "balanced">, string> = { precise: "attack", forceful: "strength", guarded: "defence" };
  return trains[stance] === skill ? 3 : 0;
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

export function styleXp(stance: Stance): Partial<Record<SkillKey, number>> {
  if (stance === "balanced") return { attack: 13, strength: 13, defence: 13, hitpoints: HITPOINTS_XP };
  const skill = ({ precise: "attack", forceful: "strength", guarded: "defence" } as const)[stance];
  return { [skill]: 40, hitpoints: HITPOINTS_XP };
}

/** A family of weapons: which styles it offers and how many ticks it takes between swings. */
export interface WeaponClass {
  styles: Style[];
  speed: number;
}

/**
 * The weapon families. Bare hands are the fallback for anything with no class of its own, so a player
 * holding a fish still has somewhere to put their fists.
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
} as const satisfies Record<string, WeaponClass>;

export type WeaponClassName = keyof typeof WEAPON_CLASSES;
export const DEFAULT_CLASS: WeaponClassName = "unarmed";

/** The styles a weapon class offers, and a style index kept inside that list. */
export const stylesOf = (cls: WeaponClassName): readonly Style[] => WEAPON_CLASSES[cls].styles;
export const styleAt = (cls: WeaponClassName, index: number): Style => {
  const list = stylesOf(cls);
  return list[Math.min(Math.max(0, Math.floor(index)), list.length - 1)]!;
};

/**
 * A fighter's levels, worn bonuses and stance, as both rolls need them. An NPC has no stance and no
 * worn equipment: its bonuses come from its own definition.
 */
export interface Fighter {
  attack: number;
  strength: number;
  defence: number;
  bonuses: Bonuses;
  /** The stance a player is fighting in; null for a monster. */
  stance: Stance | null;
}

/**
 * A fighter's level in one combat skill once the stance and the flat +8 are in. A monster has no
 * stance, so it takes the classic's flat +9 (the same +8, plus the one level an NPC's stance lends).
 */
export function effectiveLevel(f: Fighter, skill: "attack" | "strength" | "defence"): number {
  const level = f[skill];
  return f.stance === null ? level + 9 : level + stanceBoost(f.stance, skill) + 8;
}

/** The roll an attack makes: its effective attack against the bonus for the type of blow it throws. */
export function attackRoll(f: Fighter, type: AttackType): number {
  return effectiveLevel(f, "attack") * ((f.bonuses[ATTACK_BONUS[type]] ?? 0) + 64);
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
 * One swing: a roll to land it, then a flat roll from 0 to the max hit.
 *
 * A blow a PLAYER gets through never lands for nothing — the classic pushes a rolled nothing up to
 * one, for players only (the classic's own rule; the source is in the plan). It matters most at the
 * beginning, where the max hit is 1 and half of every landed blow would otherwise show a nought and
 * read as a miss. A creature's blow can still come to nothing.
 */
export function swing(attacker: Fighter, defender: Fighter, type: AttackType, rand: () => number): number {
  if (!lands(attacker, defender, type, rand)) return 0;
  const rolled = damageRoll(maxHit(attacker), rand);
  return attacker.stance === null ? rolled : Math.max(1, rolled);
}

/**
 * The combat level, on the classic's formula: a quarter of a level each for Defence and Hitpoints, and
 * 0.325 each for Attack and Strength. Ranged, Magic and Prayer join it in a later phase.
 */
export function combatLevel(levels: { attack: number; strength: number; defence: number; hitpoints: number }): number {
  const base = (levels.defence + levels.hitpoints) / 4;
  return Math.floor(base + (13 * (levels.attack + levels.strength)) / 40);
}

/** Ticks between a fighter's swings when its weapon says nothing: the common speed. */
export const DEFAULT_SPEED = 4;
