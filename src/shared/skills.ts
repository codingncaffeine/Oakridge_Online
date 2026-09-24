// Skills and experience by the classic rules: levels 1–99 on the classic curve, with XP kept in tenths.

export const SKILLS = [
  { key: "attack", name: "Attack" },
  { key: "strength", name: "Strength" },
  { key: "defence", name: "Defence" },
  { key: "hitpoints", name: "Hitpoints" },
  { key: "woodcutting", name: "Woodcutting" },
  { key: "mining", name: "Mining" },
  { key: "fishing", name: "Fishing" },
  // Phase 8: the five skills the three gathering ladders feed.
  { key: "firemaking", name: "Firemaking" },
  { key: "cooking", name: "Cooking" },
  { key: "smithing", name: "Smithing" },
  { key: "crafting", name: "Crafting" },
  { key: "fletching", name: "Fletching" },
  // Phase 11: the other two ways of fighting, and the one that lends a hand to all three.
  { key: "ranged", name: "Ranged" },
  { key: "magic", name: "Magic" },
  { key: "prayer", name: "Prayer" },
] as const;
export type SkillKey = (typeof SKILLS)[number]["key"];
export const SKILL_KEYS: SkillKey[] = SKILLS.map((s) => s.key);
export const SKILL_NAME = Object.fromEntries(SKILLS.map((s) => [s.key, s.name])) as Record<SkillKey, string>;

export const MAX_LEVEL = 99;
/** The most XP a skill holds, in tenths: 200 million XP. Training on past it earns nothing. */
export const MAX_XP = 2_000_000_000;

/** Whole XP needed to reach each level: XP_TABLE[L] for level L, so XP_TABLE[1] = 0 and XP_TABLE[99] = 13,034,431. */
const XP_TABLE: number[] = (() => {
  const table = [0, 0];
  let sum = 0;
  for (let l = 1; l < MAX_LEVEL; l++) {
    sum += Math.floor(l + 300 * 2 ** (l / 7));
    table.push(Math.floor(sum / 4));
  }
  return table;
})();

/** XP (tenths) that reaches `level`. */
export function xpForLevel(level: number): number {
  return XP_TABLE[Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)))]! * 10;
}

/** The level that `xp` (tenths) has reached. */
export function levelForXp(xp: number): number {
  let lo = 1, hi = MAX_LEVEL;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (xp >= XP_TABLE[mid]! * 10) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * Where each skill starts. Hitpoints begins at level 10, as in the classic: a character with one
 * hitpoint would die to its first scratch. Everything else begins at level 1.
 */
export const START_LEVEL: Partial<Record<SkillKey, number>> = { hitpoints: 10 };

/** A fresh character's XP: nothing in anything, but Hitpoints already at its starting level. */
export function noXp(): Record<SkillKey, number> {
  return Object.fromEntries(SKILL_KEYS.map((k) => [k, xpForLevel(START_LEVEL[k] ?? 1)])) as Record<SkillKey, number>;
}

/**
 * Saved XP read back defensively: whole tenths from a skill's starting XP to the cap. Anything
 * missing or odd — including every save made before a skill existed — starts that skill afresh.
 */
export function readXp(raw: unknown): Record<SkillKey, number> {
  const xp = noXp();
  if (typeof raw !== "object" || raw === null) return xp;
  for (const k of SKILL_KEYS) {
    const v = (raw as Record<string, unknown>)[k];
    if (Number.isInteger(v) && (v as number) >= 0) xp[k] = Math.min(MAX_XP, Math.max(xp[k], v as number));
  }
  return xp;
}

/** Whole XP shown for a gain: the change in whole points, so two gains of 2.5 show as 2 and 3. */
export function shownGain(before: number, after: number): number {
  return Math.floor(after / 10) - Math.floor(before / 10);
}

/**
 * The classic skilling roll's chance of success: (1 + low) / 256 at level 1, rising in a straight line
 * to (1 + high) / 256 at level 99, rounded to a whole 256th and capped at certain.
 */
export function successChance(low: number, high: number, level: number): number {
  const p = (1 + Math.floor((low * (99 - level)) / 98 + (high * (level - 1)) / 98 + 0.5)) / 256;
  return Math.min(1, Math.max(0, p));
}
