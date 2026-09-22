import type { CollisionMap } from "./collision.ts";

export interface Tile {
  x: number;
  y: number;
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
  const ox = sx - SEARCH / 2, oy = sy - SEARCH / 2;
  steps.fill(-1);
  const start = (sy - oy) * SEARCH + (sx - ox);
  const lx = tx - ox, ly = ty - oy;
  const target = lx >= 0 && ly >= 0 && lx < SEARCH && ly < SEARCH ? ly * SEARCH + lx : -1;

  steps[start] = 0;
  queue[0] = start;
  let head = 0, tail = 1, found = start === target;
  while (head < tail && !found) {
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
      if (n === target) { found = true; break; }
    }
  }

  let goal = target;
  if (!found) {
    let bestDist = Infinity, bestSteps = Infinity;
    goal = -1;
    for (let y = ly - FALLBACK_RADIUS; y <= ly + FALLBACK_RADIUS; y++) {
      for (let x = lx - FALLBACK_RADIUS; x <= lx + FALLBACK_RADIUS; x++) {
        if (x < 0 || y < 0 || x >= SEARCH || y >= SEARCH) continue;
        const s = steps[y * SEARCH + x]!;
        if (s < 0 || s >= FALLBACK_MAX_STEPS) continue;
        const dist = (x - lx) * (x - lx) + (y - ly) * (y - ly);
        if (dist < bestDist || (dist === bestDist && s < bestSteps)) {
          bestDist = dist;
          bestSteps = s;
          goal = y * SEARCH + x;
        }
      }
    }
    if (goal < 0) return [];
  }
  if (goal === start) return [];

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
