import { CollisionMap, type Side } from "./collision.ts";
import type { Tile } from "./pathfind.ts";

export type ObjectKind = "tree" | "oak" | "rock" | "fence" | "wall";

/** A placed object. Trees and rocks fill their tile; fences and walls run along one edge of it. */
export interface MapObject {
  kind: ObjectKind;
  x: number;
  y: number;
  side: Side;
  /** Seeded per-object value in [0, 1) that picks size, turn and tint. */
  variant: number;
}

export const UNDERLAY_GRASS = 0;
export const UNDERLAY_FOREST = 1;
export const UNDERLAY_DIRT = 2;
export const UNDERLAY_SAND = 3;

export const OVERLAY_NONE = 0;
export const OVERLAY_PATH = 1;
export const OVERLAY_WATER = 2;

/** Tile (x, y) spans x..x+1 east and y..y+1 north. Heights are in tile units, one per tile corner. */
export interface WorldMap {
  readonly width: number;
  readonly height: number;
  /** (width + 1) * (height + 1) corner heights, row by row from the south. */
  readonly heights: Float32Array;
  readonly underlay: Uint8Array;
  readonly overlay: Uint8Array;
  readonly objects: MapObject[];
  readonly collision: CollisionMap;
  readonly spawn: Tile;
}

export function blankMap(width: number, height: number): WorldMap {
  return {
    width,
    height,
    heights: new Float32Array((width + 1) * (height + 1)),
    underlay: new Uint8Array(width * height),
    overlay: new Uint8Array(width * height),
    objects: [],
    collision: new CollisionMap(width, height),
    spawn: { x: width >> 1, y: height >> 1 },
  };
}

export function cornerHeight(map: WorldMap, cx: number, cy: number): number {
  const x = Math.max(0, Math.min(map.width, cx)), y = Math.max(0, Math.min(map.height, cy));
  return map.heights[y * (map.width + 1) + x]!;
}

/**
 * Which diagonal splits tile (x, y) into two triangles: true = south-west to north-east. The split
 * follows the smaller height difference so slopes stay smooth. The renderer and heightAt both use it.
 */
export function splitsSwNe(map: WorldMap, x: number, y: number): boolean {
  const sw = cornerHeight(map, x, y), se = cornerHeight(map, x + 1, y);
  const ne = cornerHeight(map, x + 1, y + 1), nw = cornerHeight(map, x, y + 1);
  return Math.abs(sw - ne) <= Math.abs(se - nw);
}

/** Ground height at any point, matching the rendered triangles exactly. */
export function heightAt(map: WorldMap, fx: number, fy: number): number {
  const x = Math.max(0, Math.min(map.width - 1, Math.floor(fx)));
  const y = Math.max(0, Math.min(map.height - 1, Math.floor(fy)));
  const u = Math.max(0, Math.min(1, fx - x)), v = Math.max(0, Math.min(1, fy - y));
  const sw = cornerHeight(map, x, y), se = cornerHeight(map, x + 1, y);
  const ne = cornerHeight(map, x + 1, y + 1), nw = cornerHeight(map, x, y + 1);
  if (splitsSwNe(map, x, y)) {
    return u >= v ? sw + (se - sw) * u + (ne - se) * v : sw + (ne - nw) * u + (nw - sw) * v;
  }
  return u + v <= 1 ? sw + (se - sw) * u + (nw - sw) * v : ne + (nw - ne) * (1 - u) + (se - ne) * (1 - v);
}
