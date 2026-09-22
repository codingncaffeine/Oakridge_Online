import type { CollisionMap } from "./collision.ts";

export interface Tile {
  x: number;
  y: number;
}

/** The tiles an object covers: x..x+w-1 east, y..y+h-1 north (1×1 for a tree, a rock or a fishing spot). */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Edge of the square searched for a walk. The walker stands on the north-east tile of its centre. */
const SEARCH = 128;
/** An unreachable target is swapped for the best reachable tile within this many tiles of it. */
const FALLBACK_RADIUS = 10;
/** A fallback tile must be fewer than this many steps away. */
const FALLBACK_MAX_STEPS = 100;
/** A walk keeps at most this many turning points; anything after is cut off. */
const MAX_CHECKPOINTS = 25;

// Expansion order: W, E, S, N, SW, SE, NW, NE. Tracing back through the direction that first reached
// each tile makes walks go straight first, then diagonal.
const DX = [-1, 1, 0, 0, -1, 1, -1, 1] as const;
const DY = [0, 0, -1, 1, -1, -1, 1, 1] as const;

const steps = new Int32Array(SEARCH * SEARCH);
const via = new Int8Array(SEARCH * SEARCH);
const queue = new Int32Array(SEARCH * SEARCH);

/**
 * The walk from (sx, sy) towards (tx, ty): one tile per step, excluding the start. If the target can't
 * be reached, the walk ends on the reachable tile nearest to it in straight-line distance (ties: fewer
 * steps) within FALLBACK_RADIUS. Returns [] when there is nowhere better to go.
 */
export function findPath(map: CollisionMap, sx: number, sy: number, tx: number, ty: number): Tile[] {
  return search(map, sx, sy, { x: tx, y: ty, w: 1, h: 1 }, (x, y) => x === tx && y === ty);
}

/**
 * The walk from (sx, sy) up to an object: it ends on the first tile, in search order, from which the
 * object can be reached (see `reaches`). When no such tile can be walked to, it ends on the reachable
 * tile nearest the object, as findPath does. [] when already there or when there is nowhere better.
 */
export function findPathTo(map: CollisionMap, sx: number, sy: number, r: Rect): Tile[] {
  return search(map, sx, sy, r, (x, y) => reaches(map, x, y, r));
}

/**
 * Can someone on (x, y) act on the object covering `r`? They must stand beside one of its sides (never
 * off a corner) with no wall on the edge between, or be inside it.
 */
export function reaches(map: CollisionMap, x: number, y: number, r: Rect): boolean {
  const alongX = x >= r.x && x < r.x + r.w, alongY = y >= r.y && y < r.y + r.h;
  if (alongX && alongY) return true;
  if (alongY && x === r.x - 1) return !map.wallBetween(x, y, 1, 0);
  if (alongY && x === r.x + r.w) return !map.wallBetween(x, y, -1, 0);
  if (alongX && y === r.y - 1) return !map.wallBetween(x, y, 0, 1);
  if (alongX && y === r.y + r.h) return !map.wallBetween(x, y, 0, -1);
  return false;
}

/** The breadth-first search both walks share: `done` says which tiles end it, `r` is where the fallback aims. */
function search(map: CollisionMap, sx: number, sy: number, r: Rect, done: (x: number, y: number) => boolean): Tile[] {
  if (done(sx, sy)) return [];
  const ox = sx - SEARCH / 2, oy = sy - SEARCH / 2;
  steps.fill(-1);
  const start = (sy - oy) * SEARCH + (sx - ox);

  steps[start] = 0;
  queue[0] = start;
  let head = 0, tail = 1, goal = -1;
  while (head < tail && goal < 0) {
    const cur = queue[head++]!;
    const cx = cur % SEARCH, cy = (cur - cx) / SEARCH;
    for (let d = 0; d < 8; d++) {
      const nx = cx + DX[d]!, ny = cy + DY[d]!;
      if (nx < 0 || ny < 0 || nx >= SEARCH || ny >= SEARCH) continue;
      const n = ny * SEARCH + nx;
      if (steps[n] !== -1 || !map.canStep(cx + ox, cy + oy, DX[d]!, DY[d]!)) continue;
      steps[n] = steps[cur]! + 1;
      via[n] = d;
      queue[tail++] = n;
      if (done(nx + ox, ny + oy)) { goal = n; break; }
    }
  }

  if (goal < 0) {
    // Nearest to the target rectangle by straight-line distance, then fewest steps.
    const x0 = r.x - ox, y0 = r.y - oy, x1 = x0 + r.w - 1, y1 = y0 + r.h - 1;
    let bestDist = Infinity, bestSteps = Infinity;
    for (let y = y0 - FALLBACK_RADIUS; y <= y1 + FALLBACK_RADIUS; y++) {
      for (let x = x0 - FALLBACK_RADIUS; x <= x1 + FALLBACK_RADIUS; x++) {
        if (x < 0 || y < 0 || x >= SEARCH || y >= SEARCH) continue;
        const s = steps[y * SEARCH + x]!;
        if (s < 0 || s >= FALLBACK_MAX_STEPS) continue;
        const dx = Math.max(x0 - x, 0, x - x1), dy = Math.max(y0 - y, 0, y - y1);
        const dist = dx * dx + dy * dy;
        if (dist < bestDist || (dist === bestDist && s < bestSteps)) {
          bestDist = dist;
          bestSteps = s;
          goal = y * SEARCH + x;
        }
      }
    }
    if (goal < 0 || goal === start) return [];
  }

  const path: Tile[] = [];
  for (let i = goal; i !== start;) {
    const x = i % SEARCH, y = (i - x) / SEARCH, d = via[i]!;
    path.push({ x: x + ox, y: y + oy });
    i = (y - DY[d]!) * SEARCH + (x - DX[d]!);
  }
  path.reverse();
  return limitCheckpoints(path, sx, sy);
}

/** Cuts a walk short at its MAX_CHECKPOINTS-th turning point (the tile before a change of direction). */
export function limitCheckpoints(path: Tile[], sx: number, sy: number): Tile[] {
  let turns = 0, px = sx, py = sy, lastDx = 0, lastDy = 0;
  for (let i = 0; i < path.length; i++) {
    const dx = path[i]!.x - px, dy = path[i]!.y - py;
    if (i > 0 && (dx !== lastDx || dy !== lastDy) && ++turns === MAX_CHECKPOINTS) return path.slice(0, i);
    lastDx = dx;
    lastDy = dy;
    px = path[i]!.x;
    py = path[i]!.y;
  }
  return path;
}
