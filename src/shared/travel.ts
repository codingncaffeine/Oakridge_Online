// Crossings (PLAN §7.6, Wave 2): the places a boat can put a player down, by the name a dialogue's
// `travel` effect uses. A crossing is the one way to move that is not a walk: the ferryman takes the
// fare and the player stands at the far landing the same tick, on whatever plane it is on. Each
// landing is a tile beside the jetty on land; the world stands the player on the nearest tile that can
// be stood on, as a stair does, so a crate left on the tile does not strand anyone at sea.
import type { Tile } from "./pathfind.ts";

export interface Landing extends Tile {
  plane: number;
}

/** The ferry's two ends: Brinehaven's third berth, and the landing on Sablewood Isle's north shore below Tarhollow. */
export const TRAVEL: Record<string, Landing> = {
  brinehaven: { x: 2890, y: 3049, plane: 0 },
  tarhollow: { x: 2289, y: 2711, plane: 0 },
  // Not a crossing but a word: Orrin Vell sends a player down into the glimstone pit (Runesmithing, Phase 18).
  glimpit: { x: 3031, y: 3676, plane: -3 },
};

/** What the ferry costs, either way. */
export const FERRY_FARE = 20;
