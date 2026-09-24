// Prayer (PLAN Phase 11). Burying bones pays Prayer XP; prayer points equal the Prayer level and drain
// while a prayer is on, faster for the stronger ones; an altar restores them. Eight prayers, each a
// share added to one combat level: five per cent at 1, 4, 7, 10 and 13, ten per cent at 16, 19 and 22.
// Every name here is this game's own; the shape of the mechanism is the classic's.
import type { CombatSkill } from "./combat.ts";

export type PrayerKey =
  | "steady_hand" | "stone_skin" | "oxs_back" | "hawks_eye" | "clear_mind" | "sure_strike" | "iron_hide" | "bulls_heart";

export interface Prayer {
  key: PrayerKey;
  name: string;
  /** The Prayer level it takes to use it. */
  level: number;
  /** Which level it lends to, and what share of that level. */
  skill: CombatSkill;
  share: number;
  /** Ticks between the points it costs: one point every this many ticks while it is on. */
  drain: number;
  examine: string;
}

export const PRAYERS: Prayer[] = [
  { key: "steady_hand", name: "Steady Hand", level: 1, skill: "attack", share: 0.05, drain: 20, examine: "Lends a twentieth to your Attack." },
  { key: "stone_skin", name: "Stone Skin", level: 4, skill: "defence", share: 0.05, drain: 20, examine: "Lends a twentieth to your Defence." },
  { key: "oxs_back", name: "Ox's Back", level: 7, skill: "strength", share: 0.05, drain: 20, examine: "Lends a twentieth to your Strength." },
  { key: "hawks_eye", name: "Hawk's Eye", level: 10, skill: "ranged", share: 0.05, drain: 20, examine: "Lends a twentieth to your Ranged." },
  { key: "clear_mind", name: "Clear Mind", level: 13, skill: "magic", share: 0.05, drain: 20, examine: "Lends a twentieth to your Magic." },
  { key: "sure_strike", name: "Sure Strike", level: 16, skill: "attack", share: 0.1, drain: 10, examine: "Lends a tenth to your Attack." },
  { key: "iron_hide", name: "Iron Hide", level: 19, skill: "defence", share: 0.1, drain: 10, examine: "Lends a tenth to your Defence." },
  { key: "bulls_heart", name: "Bull's Heart", level: 22, skill: "strength", share: 0.1, drain: 10, examine: "Lends a tenth to your Strength." },
];

export const PRAYER_BY_KEY = new Map(PRAYERS.map((p) => [p.key, p]));

/**
 * The shares the prayers that are on lend to each level: one a skill, the strongest of any two that
 * name the same one (though turning one on turns the other off, so two never stay on together).
 */
export function boostsOf(on: Iterable<string>): Partial<Record<CombatSkill, number>> {
  const boosts: Partial<Record<CombatSkill, number>> = {};
  for (const key of on) {
    const prayer = PRAYER_BY_KEY.get(key as PrayerKey);
    if (prayer) boosts[prayer.skill] = Math.max(boosts[prayer.skill] ?? 0, prayer.share);
  }
  return boosts;
}

/**
 * Points drained a tick by the prayers that are on, added up. A Prayer bonus on worn equipment slows
 * every drain: each point of it stretches the ticks between points by a thirtieth.
 */
export function drainPerTick(on: Iterable<string>, prayerBonus = 0): number {
  let drain = 0;
  for (const key of on) {
    const prayer = PRAYER_BY_KEY.get(key as PrayerKey);
    if (prayer) drain += 1 / (prayer.drain * (1 + Math.max(0, prayerBonus) / 30));
  }
  return drain;
}

/** Saved prayer keys read back defensively: only real ones, each once. */
export function readPrayers(raw: unknown): Set<PrayerKey> {
  const on = new Set<PrayerKey>();
  if (!Array.isArray(raw)) return on;
  for (const key of raw) if (typeof key === "string" && PRAYER_BY_KEY.has(key as PrayerKey)) on.add(key as PrayerKey);
  return on;
}
