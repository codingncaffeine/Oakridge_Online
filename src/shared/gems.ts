// Gems (the magic plan, stage A5: what the enchanting spells work on). Ten gems, each found uncut and cut with
// a chisel at the reference's Crafting levels and XP; where they come from: a rare find in any ore rock, the
// gem rocks in Deepdelve's second level, and (for the three best) the worst creatures. The real stones keep
// their names; the reference's two invented ones are this game's own (Wyrmstone, Sunstone).
import type { WorldBuilder } from "./worldgen.ts";

export interface Gem {
  /** The cut gem's item key; its uncut one is "uncut_" + key. Names, examines and values are items.ts's. */
  key: string;
  /** Crafting level and XP (tenths) to cut it, the reference's. */
  level: number;
  xp: number;
  /** Its colour, for the models. */
  colour: number;
}

/**
 * The gems in order. Sunstone's cutting pays 200 XP where the reference's last gem pays 50: that one is made by
 * fusing a shard into a lesser gem, with the XP paid there, and this game has no fusing, so the ladder simply
 * rises (decided 2026-09-25).
 */
export const GEMS: readonly Gem[] = [
  { key: "opal", level: 1, xp: 150, colour: 0xe8f0f4 },
  { key: "jade", level: 13, xp: 200, colour: 0x5ab478 },
  { key: "red_topaz", level: 16, xp: 250, colour: 0xd8604a },
  { key: "sapphire", level: 20, xp: 500, colour: 0x2f5ae0 },
  { key: "emerald", level: 27, xp: 675, colour: 0x28c060 },
  { key: "ruby", level: 34, xp: 850, colour: 0xd01830 },
  { key: "diamond", level: 43, xp: 1075, colour: 0xf4f8ff },
  { key: "wyrmstone", level: 55, xp: 1375, colour: 0xa040d8 },
  { key: "onyx", level: 67, xp: 1675, colour: 0x1a1a22 },
  { key: "sunstone", level: 89, xp: 2000, colour: 0xf0a020 },
];
export const GEM_BY_KEY: ReadonlyMap<string, Gem> = new Map(GEMS.map((g) => [g.key, g]));

/** What a lucky swing at any ore rock turns up (1 in 256 of the ore mined): the reference's mining gems. */
export const MINING_GEMS: ReadonlyArray<{ item: string; weight: number }> = [
  { item: "uncut_sapphire", weight: 50 }, { item: "uncut_emerald", weight: 25 }, { item: "uncut_ruby", weight: 15 }, { item: "uncut_diamond", weight: 10 },
];
export const MINING_GEM_CHANCE = 1 / 256;
/** What a gem rock gives, by weight: mostly the soft stones, sometimes better. */
export const GEM_ROCK_TABLE: ReadonlyArray<{ item: string; weight: number }> = [
  { item: "uncut_opal", weight: 32 }, { item: "uncut_jade", weight: 24 }, { item: "uncut_red_topaz", weight: 16 }, { item: "uncut_sapphire", weight: 12 },
  { item: "uncut_emerald", weight: 8 }, { item: "uncut_ruby", weight: 5 }, { item: "uncut_diamond", weight: 3 },
];
/** Deepdelve's second level (its COLDIRON_PLANE; a test holds them equal): written here so gathering, which reads this file, pulls in no site. */
export const GEM_ROCK_PLANE = -2;
/** The gem rocks: against the walls of the two coldiron chambers of Deepdelve's second level. */
export const GEM_ROCKS: ReadonlyArray<readonly [number, number]> = [[2860, 3552], [2874, 3552], [2888, 3530], [2896, 3531]];

/** The gem rocks, put in after every roll under their places' ids, where Deepdelve's mine is built. */
export function buildGemRocks(b: WorldBuilder): void {
  b.clip = null;
  for (const [x, y] of GEM_ROCKS) b.placeFixed(GEM_ROCK_PLANE, "gem_rock", x, y);
}
