// Gathering: what trees, rocks and fishing spots give, and the tools that work them. The mechanics are
// the classic ones (a roll every few ticks, chance by level and tool); the numbers are this game's own.
import type { ObjectKind } from "./map.ts";
import type { SkillKey } from "./skills.ts";

export type ToolKind = "axe" | "pickaxe" | "net";

/** Each tool family from worst to best: the item and the level (in the method's skill) it needs. */
export const TOOLS: Record<ToolKind, ReadonlyArray<{ item: string; level: number }>> = {
  axe: [{ item: "bronze_axe", level: 1 }, { item: "iron_axe", level: 6 }, { item: "steel_axe", level: 14 }],
  pickaxe: [{ item: "bronze_pickaxe", level: 1 }, { item: "iron_pickaxe", level: 6 }, { item: "steel_pickaxe", level: 14 }],
  net: [{ item: "fishing_net", level: 1 }],
};

export type MethodName = "chop" | "mine" | "net";

export interface Method {
  skill: SkillKey;
  tool: ToolKind;
  /** Ticks between rolls by tool tier (0 is the worst tool); the last value holds for higher tiers. */
  ticks: readonly number[];
  /** How much each tool tier multiplies the chance values by; the last value holds for higher tiers. */
  boost: readonly number[];
}

/**
 * A better axe raises the chance of each chop, which comes every 4 ticks whatever the axe; a better
 * pickaxe swings more often, with the chance set by level alone; a net is a net.
 */
export const METHODS: Record<MethodName, Method> = {
  chop: { skill: "woodcutting", tool: "axe", ticks: [4], boost: [1, 1.4, 1.8] },
  mine: { skill: "mining", tool: "pickaxe", ticks: [8, 7, 6], boost: [1] },
  net: { skill: "fishing", tool: "net", ticks: [6], boost: [1] },
};

export const tierValue = (list: readonly number[], tier: number): number => list[Math.min(tier, list.length - 1)]!;

/** One thing a resource can give: the item, the level it needs, XP (tenths), and the chance values. */
export interface Yield {
  item: string;
  level: number;
  xp: number;
  /** Chance values for the classic roll (see successChance): at level 1 and at level 99, in 256ths. */
  low: number;
  high: number;
}

export interface ResourceDef {
  method: MethodName;
  /** The menu option that starts it. */
  verb: string;
  /** What it's called in "you need a level" messages. */
  noun: string;
  yields: Yield;
  /** Ticks of chopping before a tree can fall (0: it runs out on its first yield). */
  life: number;
  /** Ticks until it comes back: from, to. */
  respawn: readonly [number, number];
}

export const RESOURCES: Partial<Record<ObjectKind, ResourceDef>> = {
  tree: {
    method: "chop", verb: "Chop down", noun: "tree", life: 0, respawn: [50, 90],
    yields: { item: "logs", level: 1, xp: 220, low: 70, high: 210 },
  },
  oak: {
    method: "chop", verb: "Chop down", noun: "oak", life: 30, respawn: [15, 15],
    yields: { item: "oak_logs", level: 12, xp: 360, low: 34, high: 110 },
  },
  copper_rock: {
    method: "mine", verb: "Mine", noun: "rock", life: 0, respawn: [5, 5],
    yields: { item: "copper_ore", level: 1, xp: 160, low: 96, high: 340 },
  },
  tin_rock: {
    method: "mine", verb: "Mine", noun: "rock", life: 0, respawn: [5, 5],
    yields: { item: "tin_ore", level: 1, xp: 160, low: 96, high: 340 },
  },
  iron_rock: {
    method: "mine", verb: "Mine", noun: "rock", life: 0, respawn: [10, 10],
    yields: { item: "iron_ore", level: 12, xp: 320, low: 70, high: 380 },
  },
};

/** What a net brings up, highest level first: each roll tries them in this order. */
export const NET_CATCH: readonly Yield[] = [
  { item: "raw_smelt", level: 14, xp: 320, low: 22, high: 124 },
  { item: "raw_sardine", level: 1, xp: 110, low: 40, high: 250 },
];

/** A fishing spot stays this many ticks (from, to) before moving to another spot in its water. */
export const SPOT_MOVE: readonly [number, number] = [250, 530];
