// Gathering: what trees, rocks and fishing spots give, and the tools that work them. The mechanics are
// the classic ones (a roll every few ticks, chance by level and tool); the numbers are this game's own.
// The three ladders and where each rung of them stands in the world are PLAN §8.
import type { ObjectKind } from "./map.ts";
import type { SkillKey } from "./skills.ts";
import { GEM_ROCK_TABLE } from "./gems.ts";

export type ToolKind = "axe" | "pickaxe" | "net" | "rod" | "creel" | "harpoon";

/** Each tool family from worst to best: the item and the level (in the method's skill) it needs. */
export const TOOLS: Record<ToolKind, ReadonlyArray<{ item: string; level: number }>> = {
  axe: [{ item: "bronze_axe", level: 1 }, { item: "iron_axe", level: 6 }, { item: "steel_axe", level: 14 }],
  pickaxe: [{ item: "bronze_pickaxe", level: 1 }, { item: "iron_pickaxe", level: 6 }, { item: "steel_pickaxe", level: 14 }],
  net: [{ item: "fishing_net", level: 1 }],
  rod: [{ item: "fishing_rod", level: 22 }],
  creel: [{ item: "creel", level: 45 }],
  harpoon: [{ item: "harpoon", level: 58 }],
};

/** The four ways to fish. Each is a tool, a spot that offers it, and a pair of fish it brings up. */
export const FISHING_METHODS = ["net", "angle", "trap", "harpoon"] as const;
export type FishingMethod = (typeof FISHING_METHODS)[number];

export type MethodName = "chop" | "mine" | FishingMethod;

export interface Method {
  skill: SkillKey;
  tool: ToolKind;
  /** Ticks between rolls by tool tier (0 is the worst tool); the last value holds for higher tiers. */
  ticks: readonly number[];
  /** How much each tool tier multiplies the chance values by; the last value holds for higher tiers. */
  boost: readonly number[];
  /** An item spent on every success (a rod's bait). */
  spends?: string;
}

/**
 * A better axe raises the chance of each chop, which comes every 4 ticks whatever the axe; a better
 * pickaxe swings more often, with the chance set by level alone; the fishing tools are one tier each,
 * and only the rod costs anything to use.
 */
export const METHODS: Record<MethodName, Method> = {
  chop: { skill: "woodcutting", tool: "axe", ticks: [4], boost: [1, 1.4, 1.8] },
  mine: { skill: "mining", tool: "pickaxe", ticks: [8, 7, 6], boost: [1] },
  net: { skill: "fishing", tool: "net", ticks: [6], boost: [1] },
  angle: { skill: "fishing", tool: "rod", ticks: [5], boost: [1], spends: "bait" },
  trap: { skill: "fishing", tool: "creel", ticks: [6], boost: [1] },
  harpoon: { skill: "fishing", tool: "harpoon", ticks: [5], boost: [1] },
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
  /** The highest level that still gets it, when a better yield takes over above that (plain glimstone below Mining 30). */
  upTo?: number;
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
  /** A better yield from a higher level, tried first (pure glimstone from Mining 30). */
  better?: Yield;
  /** It never runs out: the glimstone pit's rocks, as the reference's own never does. */
  endless?: true;
  /** A roll that succeeds gives one of these, by weight, in place of the yield's own item (a gem rock). */
  table?: ReadonlyArray<{ item: string; weight: number }>;
}

const chop = (noun: string, yields: Yield, life: number, respawn: readonly [number, number]): ResourceDef =>
  ({ method: "chop", verb: "Chop down", noun, yields, life, respawn });
const mine = (noun: string, yields: Yield, respawn: readonly [number, number]): ResourceDef =>
  ({ method: "mine", verb: "Mine", noun, yields, life: 0, respawn });

/**
 * Every tree and rock, tier by tier (PLAN §8.2, §8.3). Up the ladder each one is slower to work, gives
 * more XP and is worth more, and the good ones keep you waiting longer for them to come back — which is
 * what stops a heartoak grove or a starfall seam being somewhere you simply stand.
 */
export const RESOURCES: Partial<Record<ObjectKind, ResourceDef>> = {
  // At level 3 with a bronze axe a tree takes about 11 s; it stays easier than an oak at the oak's level.
  tree: chop("tree", { item: "logs", level: 1, xp: 220, low: 52, high: 196 }, 0, [50, 90]),
  oak: chop("oak", { item: "oak_logs", level: 12, xp: 360, low: 34, high: 110 }, 30, [15, 15]),
  alder: chop("alder", { item: "alder_logs", level: 25, xp: 620, low: 22, high: 84 }, 40, [20, 20]),
  rowan: chop("rowan", { item: "rowan_logs", level: 37, xp: 940, low: 16, high: 66 }, 55, [30, 30]),
  blackthorn: chop("blackthorn", { item: "blackthorn_logs", level: 50, xp: 1350, low: 12, high: 52 }, 70, [40, 40]),
  ironbark: chop("ironbark", { item: "ironbark_logs", level: 63, xp: 1850, low: 9, high: 42 }, 90, [55, 55]),
  sablewood: chop("sablewood", { item: "sable_logs", level: 76, xp: 2450, low: 7, high: 34 }, 110, [70, 70]),
  heartoak: chop("heartoak", { item: "heartoak_logs", level: 90, xp: 3400, low: 5, high: 28 }, 150, [100, 100]),

  copper_rock: mine("rock", { item: "copper_ore", level: 1, xp: 160, low: 96, high: 340 }, [5, 5]),
  tin_rock: mine("rock", { item: "tin_ore", level: 1, xp: 160, low: 96, high: 340 }, [5, 5]),
  iron_rock: mine("rock", { item: "iron_ore", level: 12, xp: 320, low: 70, high: 380 }, [10, 10]),
  coal_rock: mine("seam", { item: "coal", level: 22, xp: 480, low: 48, high: 230 }, [50, 50]),
  silver_rock: mine("rock", { item: "silver_ore", level: 33, xp: 560, low: 34, high: 200 }, [60, 60]),
  coldiron_rock: mine("rock", { item: "coldiron_ore", level: 41, xp: 720, low: 26, high: 175 }, [100, 100]),
  gold_rock: mine("rock", { item: "gold_ore", level: 44, xp: 800, low: 24, high: 165 }, [100, 100]),
  emberite_rock: mine("rock", { item: "emberite_ore", level: 58, xp: 1050, low: 16, high: 130 }, [200, 200]),
  starfall_rock: mine("rock", { item: "starfall_ore", level: 78, xp: 1400, low: 8, high: 90 }, [400, 400]),
  // The glimstone pit (Runesmithing, Phase 18): plain glimstone below Mining 30 and pure from 30, as the
  // reference's does, 5 XP a stone, and the rock never runs out.
  glimstone: {
    ...mine("glimstone", { item: "glimstone", level: 1, xp: 50, low: 180, high: 400, upTo: 29 }, [0, 0]),
    better: { item: "pure_glimstone", level: 30, xp: 50, low: 180, high: 400 }, endless: true,
  },
  // A gem rock (the magic plan, stage A5): Mining 40 and 65 XP, as the reference's; each find a gem off its table.
  gem_rock: { ...mine("gem rock", { item: "uncut_opal", level: 40, xp: 650, low: 28, high: 120 }, [100, 100]), table: GEM_ROCK_TABLE },
};

/**
 * What each way of fishing brings up, highest level first: a roll tries them in that order, so a spot
 * gives its better fish once you can take it. The pairs are what makes the eight tiers of PLAN §8.4
 * four kinds of spot — where each kind of water is found is what walks a player round the coast.
 */
export const CATCHES: Record<FishingMethod, readonly Yield[]> = {
  net: [
    { item: "raw_smelt", level: 14, xp: 320, low: 22, high: 124 },
    { item: "raw_sardine", level: 1, xp: 110, low: 40, high: 250 },
  ],
  angle: [
    { item: "raw_grayling", level: 33, xp: 700, low: 22, high: 120 },
    { item: "raw_redfin", level: 22, xp: 500, low: 30, high: 150 },
  ],
  trap: [
    { item: "raw_deepclaw", level: 70, xp: 1150, low: 11, high: 70 },
    { item: "raw_bay_crab", level: 45, xp: 900, low: 18, high: 100 },
  ],
  harpoon: [
    { item: "raw_hoarfish", level: 85, xp: 1300, low: 8, high: 58 },
    { item: "raw_blackfish", level: 58, xp: 1000, low: 14, high: 84 },
  ],
};

/** A fishing spot stays this many ticks (from, to) before moving to another spot in its water. */
export const SPOT_MOVE: readonly [number, number] = [250, 530];
