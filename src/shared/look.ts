import { mulberry32 } from "./rng.ts";

/** A character's appearance: one index per slot, in this order. */
export const LOOK_SLOTS = [
  { key: "body", label: "Body", count: 2 },
  { key: "hair", label: "Head", count: 8 },
  { key: "beard", label: "Jaw", count: 6 },
  { key: "torso", label: "Torso", count: 5 },
  { key: "arms", label: "Arms", count: 3 },
  { key: "hands", label: "Hands", count: 3 },
  { key: "legs", label: "Legs", count: 3 },
  { key: "feet", label: "Feet", count: 2 },
  { key: "skin", label: "Skin", count: 8 },
  { key: "hairColor", label: "Hair", count: 12 },
  { key: "topColor", label: "Torso", count: 16 },
  { key: "legsColor", label: "Legs", count: 16 },
  { key: "feetColor", label: "Feet", count: 8 },
] as const;

export type LookKey = (typeof LOOK_SLOTS)[number]["key"];

/** Slot position by name, e.g. LOOK.hair === 1. */
export const LOOK = Object.fromEntries(LOOK_SLOTS.map((s, i) => [s.key, i])) as Record<LookKey, number>;

/** The second body type has no facial hair. */
export const BODY_B = 1;

export function isValidLook(v: unknown): v is number[] {
  return Array.isArray(v) && v.length === LOOK_SLOTS.length
    && v.every((n, i) => Number.isInteger(n) && n >= 0 && n < LOOK_SLOTS[i]!.count);
}

/** Applies the cross-slot rules: body type B always has facial hair "none". */
export function normalizeLook(look: number[]): number[] {
  const out = look.slice();
  if (out[LOOK.body] === BODY_B) out[LOOK.beard] = 0;
  return out;
}

/** A random but reproducible appearance. */
export function lookFromSeed(seed: number): number[] {
  const rand = mulberry32(seed);
  return normalizeLook(LOOK_SLOTS.map((s) => Math.floor(rand() * s.count)));
}

/** The look a first-time player starts from: short hair, goatee, vest over a shirt, trousers, boots. */
export const STARTER_LOOK = [0, 1, 1, 2, 0, 0, 0, 1, 1, 0, 6, 3, 1];
