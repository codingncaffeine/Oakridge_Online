// Runesmithing (PLAN Phase 18, the user's name for the skill): carving the runes Magic spends out of
// glimstone, at each rune's altar. The reference's rune-making skill is the working system: each altar's level, the
// XP a stone pays and the levels at which a stone carves two runes, three and more come over as they are.
// The names, the stone, where the altars stand and the rule that an altar answers only to someone carrying
// its charm are this game's. The altars and the glimstone pit are built after every roll, and every object
// in them takes its id from where it stands (fixedId), so nothing else in the world moves for them.
import { UNDERLAY_DIRT, UNDERLAY_ROCK } from "./map.ts";
import type { Area } from "./oakridge.ts";
import type { RuneKey } from "./spells.ts";
import { TUNE } from "./tunes.ts";
import { boxOf, inBox, STOREY, type Box, type WorldBuilder } from "./worldgen.ts";

export interface Altar {
  rune: RuneKey;
  /** The Runesmithing level it takes to carve here. */
  level: number;
  /** XP a stone pays, in tenths. */
  xp: number;
  /** Whether it takes pure glimstone only (every altar past Sinew's, as the reference's past its sixth). */
  pure: boolean;
  /** The levels at which a stone carves one rune more: two at the first, three at the second, and on. */
  more: readonly number[];
  /** Where the altar stands, in the middle of its ring of stones. */
  at: { x: number; y: number; plane: number };
}

/**
 * Every altar, in level order. The places are PLAN Phase 18's, found by `scratch/tmp/ruinfinder.ts` (free,
 * gently sloped ground with room round it, reached on foot): Gale in the East Meadow a short walk from the
 * green, Thought by the Stockade, Tide in Wickstead, Stone in Stonecote, Ember and Oath in the Cinderwaste,
 * Sinew north of the Harrow Gate, Star in the Dunes, Wild and Grave out on the Harrow, Bloom on Sablewood
 * Isle, Heart in the Sallowfen, Shade in the Fen Hollows' drowned chapel, and Fury at the bottom of the Rift.
 * Shade pays 12 XP a stone (the reference makes that rune from another stone entirely); Fury 8, as the
 * reference's own last altar does.
 */
export const ALTARS: readonly Altar[] = [
  { rune: "gale_rune", level: 1, xp: 50, pure: false, more: [11, 22, 33, 44, 55, 66, 77, 88, 99], at: { x: 3276, y: 3244, plane: 0 } },
  { rune: "thought_rune", level: 2, xp: 55, pure: false, more: [14, 28, 42, 56, 70, 84, 98], at: { x: 3149, y: 3224, plane: 0 } },
  { rune: "tide_rune", level: 5, xp: 60, pure: false, more: [19, 38, 57, 76, 95], at: { x: 2908, y: 3271, plane: 0 } },
  { rune: "stone_rune", level: 9, xp: 65, pure: false, more: [26, 52, 78], at: { x: 3192, y: 3431, plane: 0 } },
  { rune: "ember_rune", level: 14, xp: 70, pure: false, more: [35, 70], at: { x: 3463, y: 3203, plane: 0 } },
  { rune: "sinew_rune", level: 20, xp: 75, pure: false, more: [46, 92], at: { x: 3117, y: 3612, plane: 0 } },
  { rune: "star_rune", level: 27, xp: 80, pure: true, more: [59], at: { x: 3881, y: 2988, plane: 0 } },
  { rune: "wild_rune", level: 35, xp: 85, pure: true, more: [74], at: { x: 3220, y: 3700, plane: 0 } },
  { rune: "bloom_rune", level: 44, xp: 90, pure: true, more: [91], at: { x: 2314, y: 2681, plane: 0 } },
  { rune: "oath_rune", level: 54, xp: 95, pure: true, more: [95], at: { x: 3780, y: 3120, plane: 0 } },
  { rune: "grave_rune", level: 65, xp: 100, pure: true, more: [99], at: { x: 2951, y: 3868, plane: 0 } },
  { rune: "heart_rune", level: 77, xp: 105, pure: true, more: [], at: { x: 3741, y: 3444, plane: 0 } },
  { rune: "shade_rune", level: 90, xp: 120, pure: true, more: [], at: { x: 3872, y: 3527, plane: -2 } },
  { rune: "fury_rune", level: 95, xp: 80, pure: true, more: [], at: { x: 3381, y: 3788, plane: -2 } },
];
export const ALTAR_BY_RUNE: ReadonlyMap<string, Altar> = new Map(ALTARS.map((a) => [a.rune, a]));
/** An altar's charm, by item key: the Gale altar's is the gale charm. */
export const charmOf = (a: Altar): string => a.rune.replace(/_rune$/, "_charm");
export const ALTAR_BY_CHARM: ReadonlyMap<string, Altar> = new Map(ALTARS.map((a) => [charmOf(a), a]));
/** How many runes a stone carves into at this level. */
export const runesPerStone = (a: Altar, level: number): number => 1 + a.more.filter((l) => level >= l).length;

/** The ring round an altar: a standing stone at each corner of the five by five it stands in the middle of. */
export const RING: ReadonlyArray<readonly [number, number]> = [[-2, -2], [2, -2], [-2, 2], [2, 2]];

/** Every altar in its ring, where its site stands (an altar whose region is not built is left out). */
export function buildRuins(b: WorldBuilder): void {
  b.clip = null;
  for (const a of ALTARS) {
    if (!b.placeFixed(a.at.plane, "rune_altar", a.at.x, a.at.y, { tag: a.rune })) continue;
    for (const [dx, dy] of RING) b.placeFixed(a.at.plane, "standing_stone", a.at.x + dx, a.at.y + dy);
  }
}

// --- The glimstone pit ---------------------------------------------------------------------------------

/** The pit: a cave on the deepest plane under region (47, 57), where no other dungeon lies. It is reached by Orrin Vell's word alone. */
export const PIT_PLANE = -3;
const PIT_FLOOR = -4 * STOREY;
export const PIT_REGION: Box = boxOf(3008, 3648, 3071, 3711);
/** The cave's floor: a long chamber with a bay off either side. */
const PIT_ROOMS: readonly Box[] = [boxOf(3028, 3668, 3049, 3684), boxOf(3032, 3664, 3045, 3667), boxOf(3032, 3685, 3045, 3688)];
/** Where Vell puts a player down, and the portal out beside it at the chamber's west end. */
export const PIT_LANDING = { x: 3031, y: 3676, plane: PIT_PLANE };
export const PIT_PORTAL = { x: 3029, y: 3676 };
/** The glimstone rocks, round the chamber's walls and in the bays. */
export const PIT_ROCKS: ReadonlyArray<readonly [number, number]> = [
  [3036, 3670], [3043, 3670], [3048, 3676], [3043, 3682], [3036, 3682], [3039, 3665], [3039, 3687],
];
export const PIT_AREA: Area = { key: "glimpit", name: "The glimstone pit", track: TUNE.woods };
export const inPit = (x: number, y: number, plane: number): boolean => plane === PIT_PLANE && inBox(PIT_REGION, x, y);

/** Cuts the pit out of the rock: the whole region rock, the rooms floored, walls round the floor, the rocks and the portal. */
export function buildGlimstonePit(b: WorldBuilder): void {
  b.clip = PIT_REGION;
  const map = b.plane(PIT_PLANE);
  // A floor of its own height, not the surface's over it: a world built without the Harrow has no surface there.
  const level = PIT_FLOOR;
  const floor = (x: number, y: number) => PIT_ROOMS.some((r) => inBox(r, x, y));
  for (let cy = PIT_REGION.y0; cy <= PIT_REGION.y1 + 1; cy++) for (let cx = PIT_REGION.x0; cx <= PIT_REGION.x1 + 1; cx++) b.setHeight(PIT_PLANE, cx, cy, level);
  for (let y = PIT_REGION.y0; y <= PIT_REGION.y1; y++) {
    for (let x = PIT_REGION.x0; x <= PIT_REGION.x1; x++) {
      if (floor(x, y)) {
        b.setUnderlay(PIT_PLANE, x, y, UNDERLAY_DIRT);
        continue;
      }
      b.setUnderlay(PIT_PLANE, x, y, UNDERLAY_ROCK);
      map.collision.block(x, y);
    }
  }
  for (let y = PIT_REGION.y0; y <= PIT_REGION.y1; y++) {
    for (let x = PIT_REGION.x0; x <= PIT_REGION.x1; x++) {
      if (!floor(x, y)) continue;
      for (const [dx, dy, side] of [[0, 1, 0], [1, 0, 1], [0, -1, 2], [-1, 0, 3]] as const) {
        if (!floor(x + dx, y + dy)) b.placeFixed(PIT_PLANE, "stone_wall", x, y, { side, tag: "cave" });
      }
    }
  }
  for (const [x, y] of PIT_ROCKS) b.placeFixed(PIT_PLANE, "glimstone", x, y);
  b.placeFixed(PIT_PLANE, "portal", PIT_PORTAL.x, PIT_PORTAL.y);
}
