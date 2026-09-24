// Which regions the client keeps built around the player (Phase 12, region streaming). The world's data
// is all there from the seed; what costs is the scene — terrain meshes, instanced objects, roofs, the
// minimap's pictures — so only the regions near the player have one. This is the rule alone, with no
// scene in it, so a test can walk a player across a grid and count what came and went.
import { REGION, regionId, regionOf } from "../shared/map.ts";

/**
 * A region whose nearest tile is within this many tiles is built: 64 keeps the whole 3×3 block around
 * the player's region up, so the ground under the fog (40 tiles) is never missing.
 */
export const LOAD_WITHIN = 64;
/**
 * A built region is let go only once its nearest tile is further than this. The 32 tiles between the
 * two are the dead band: pacing back and forth over a region line builds nothing twice.
 */
export const KEEP_WITHIN = 96;

/** The distance, in tiles along the longer axis, from a tile to the nearest tile of a region. */
export function regionDistance(x: number, y: number, rx: number, ry: number): number {
  const x0 = rx * REGION, y0 = ry * REGION;
  const dx = Math.max(x0 - x, 0, x - (x0 + REGION - 1));
  const dy = Math.max(y0 - y, 0, y - (y0 + REGION - 1));
  return Math.max(dx, dy);
}

export interface StreamHooks {
  /** Whether region (rx, ry) has anything built on it; nothing else is ever loaded. */
  built(rx: number, ry: number): boolean;
  load(rx: number, ry: number): void;
  unload(rx: number, ry: number): void;
}

/** The regions that are up, and the rule for changing them as the player moves. */
export class Streamer {
  /** Region ids that are built right now. */
  readonly loaded = new Set<number>();
  loads = 0;
  unloads = 0;
  private readonly hooks: StreamHooks;

  constructor(hooks: StreamHooks) {
    this.hooks = hooks;
  }

  /**
   * One step from the player's tile: what has drifted too far goes, then up to `budget` regions that
   * have come near are built (one a frame keeps a crossing from stalling the frame it happens on).
   * Returns whether the loaded set changed.
   */
  step(x: number, y: number, budget = 1): boolean {
    let changed = false;
    for (const id of [...this.loaded]) {
      const rx = Math.floor(id / 256), ry = id % 256;
      if (regionDistance(x, y, rx, ry) > KEEP_WITHIN) {
        this.loaded.delete(id);
        this.hooks.unload(rx, ry);
        this.unloads++;
        changed = true;
      }
    }
    let left = budget;
    for (const [rx, ry] of this.wanted(x, y)) {
      if (left <= 0) break;
      const id = regionId(rx, ry);
      if (this.loaded.has(id)) continue;
      this.loaded.add(id);
      this.hooks.load(rx, ry);
      this.loads++;
      left--;
      changed = true;
    }
    return changed;
  }

  /** Whether something near the player is still not built. */
  pending(x: number, y: number): boolean {
    return this.wanted(x, y).some(([rx, ry]) => !this.loaded.has(regionId(rx, ry)));
  }

  /** Forgets everything, telling nobody: for a plane change, where the scene is thrown away whole. */
  clear(): void {
    this.loaded.clear();
  }

  /** The built regions within LOAD_WITHIN of the tile, nearest first. */
  private wanted(x: number, y: number): Array<[number, number]> {
    const out: Array<[number, number, number]> = [];
    const rx0 = regionOf(x - LOAD_WITHIN), rx1 = regionOf(x + LOAD_WITHIN);
    const ry0 = regionOf(y - LOAD_WITHIN), ry1 = regionOf(y + LOAD_WITHIN);
    for (let ry = ry0; ry <= ry1; ry++) {
      for (let rx = rx0; rx <= rx1; rx++) {
        const d = regionDistance(x, y, rx, ry);
        if (d <= LOAD_WITHIN && this.hooks.built(rx, ry)) out.push([rx, ry, d]);
      }
    }
    out.sort((a, b) => a[2] - b[2]);
    return out.map(([rx, ry]) => [rx, ry]);
  }
}
