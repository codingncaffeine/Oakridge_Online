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
 * How a tile is drawn: its two triangles, and which of them show an overlay (path or water).
 * `swNe` true splits along the south-west to north-east diagonal: triangles (SW, SE, NE) and
 * (SW, NE, NW); false splits the other way: (SW, SE, NW) and (SE, NE, NW).
 */
export interface TileShape {
  overlay: number;
  swNe: boolean;
  fill: [boolean, boolean];
}

/** Share of the four tiles meeting at corner (cx, cy) that carry `overlay`. */
function overlayShare(map: WorldMap, cx: number, cy: number, overlay: number): number {
  let n = 0;
  for (const [tx, ty] of [[cx - 1, cy - 1], [cx, cy - 1], [cx - 1, cy], [cx, cy]] as const) {
    if (tx >= 0 && ty >= 0 && tx < map.width && ty < map.height && map.overlay[ty * map.width + tx] === overlay) n++;
  }
  return n / 4;
}

/**
 * Overlay edges follow the tile diagonals where they bend, so paths and shores run in smooth lines
 * instead of stair steps. A corner counts as covered when at least two of the four tiles around it
 * carry the overlay. A tile with exactly three covered corners is cut along the diagonal that isolates
 * the fourth. An overlay tile keeps the covered triangle; a plain tile gains it. Every other tile is
 * all overlay or all ground, split along the smaller height difference so slopes stay smooth.
 */
export function tileShape(map: WorldMap, x: number, y: number): TileShape {
  const sw = cornerHeight(map, x, y), se = cornerHeight(map, x + 1, y);
  const ne = cornerHeight(map, x + 1, y + 1), nw = cornerHeight(map, x, y + 1);
  const heightSplit = Math.abs(sw - ne) <= Math.abs(se - nw);
  const own = map.overlay[y * map.width + x]!;
  for (const overlay of [OVERLAY_WATER, OVERLAY_PATH]) {
    if (own !== overlay && own !== OVERLAY_NONE) continue;
    const covered = ([[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1]] as const).map(([cx, cy]) => overlayShare(map, cx, cy, overlay) >= 0.5);
    const count = covered.filter(Boolean).length;
    if (count === 3) {
      const out = covered.indexOf(false); // 0 SW, 1 SE, 2 NE, 3 NW
      const swNe = out === 1 || out === 3;
      const firstHoldsOut = out === 0 || out === 1;
      return { overlay, swNe, fill: [!firstHoldsOut, firstHoldsOut] };
    }
    if (own === overlay) return { overlay, swNe: heightSplit, fill: [true, true] };
  }
  return { overlay: OVERLAY_NONE, swNe: heightSplit, fill: [false, false] };
}

/** Which diagonal splits tile (x, y): true = south-west to north-east. The renderer and heightAt agree. */
export function splitsSwNe(map: WorldMap, x: number, y: number): boolean {
  return tileShape(map, x, y).swNe;
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
