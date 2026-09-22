import { BLOCKED, type Side } from "./collision.ts";
import {
  blankMap, OVERLAY_PATH, OVERLAY_WATER, UNDERLAY_DIRT, UNDERLAY_FOREST, UNDERLAY_SAND,
  type MapObject, type ObjectKind, type WorldMap,
} from "./map.ts";
import { mulberry32, valueNoise2D } from "./rng.ts";

export const TEST_MAP_SEED = 1;
const SIZE = 64;
const SPAWN = { x: 32, y: 30 };

type Point = readonly [number, number];
const ROADS: ReadonlyArray<ReadonlyArray<Point>> = [
  [[1, 29], [14, 31], [26, 30], [32.5, 30.5], [40, 29], [52, 31], [63, 30]],
  [[32.5, 30.5], [33, 38], [31, 47], [32, 63]],
  [[45, 29.5], [48, 38], [50.5, 44]],
];
const POND = { x: 47, y: 14, rx: 8, ry: 5.5 };
const OUTCROP = { x: 51, y: 49, r: 5 };
const PEN = { x0: 36, y0: 36, x1: 43, y1: 41, gateX: 39 };
const RUIN = { x0: 12, y0: 42, x1: 18, y1: 48 };

/**
 * The 64×64 test area. It is built from a seed: rolling grass, a pond with sand banks, dirt roads, a
 * wood of oaks and plain trees, a rocky outcrop, a fenced pen with a gate, and a roofless stone ruin.
 * The server and the client both build it, so it never travels over the network.
 */
export function buildTestMap(seed: number): WorldMap {
  const map: WorldMap = { ...blankMap(SIZE, SIZE), spawn: { ...SPAWN } };
  const { heights, underlay, overlay, collision, objects } = map;
  const rand = mulberry32(seed);
  const hills = valueNoise2D(seed), wobble = valueNoise2D(seed + 101), woods = valueNoise2D(seed + 202);
  const rowW = SIZE + 1;

  const rawHeight = (cx: number, cy: number) =>
    3.2 * (0.55 * hills(cx / 17, cy / 17) + 0.3 * hills(cx / 8 + 40, cy / 8) + 0.15 * hills(cx / 4, cy / 4 + 40));
  const plaza = rawHeight(SPAWN.x + 0.5, SPAWN.y + 0.5);
  for (let cy = 0; cy <= SIZE; cy++) {
    for (let cx = 0; cx <= SIZE; cx++) {
      const keep = smoothstep(4, 9, Math.hypot(cx - SPAWN.x - 0.5, cy - SPAWN.y - 0.5));
      heights[cy * rowW + cx] = plaza + (rawHeight(cx, cy) - plaza) * keep;
    }
  }

  // Pond: a wobbly ellipse of water, its floor levelled below the lowest bank, ringed with sand.
  const pondShape = (x: number, y: number) =>
    ((x + 0.5 - POND.x) / POND.rx) ** 2 + ((y + 0.5 - POND.y) / POND.ry) ** 2 - 0.3 * (wobble(x / 3, y / 3) - 0.5);
  let waterLevel = Infinity;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (pondShape(x, y) >= 1) continue;
      overlay[y * SIZE + x] = OVERLAY_WATER;
      collision.block(x, y);
      for (const [cx, cy] of corners(x, y)) waterLevel = Math.min(waterLevel, heights[cy * rowW + cx]!);
    }
  }
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (overlay[y * SIZE + x] === OVERLAY_WATER) {
        for (const [cx, cy] of corners(x, y)) heights[cy * rowW + cx] = waterLevel - 0.35;
      } else if (pondShape(x, y) < 1.45) {
        underlay[y * SIZE + x] = UNDERLAY_SAND;
      }
    }
  }

  const forestness = (x: number, y: number) => smoothstep(27, 17, x) * (0.55 + 0.45 * woods(x / 6, y / 6));
  const nearOutcrop = (x: number, y: number) =>
    Math.hypot(x + 0.5 - OUTCROP.x, y + 0.5 - OUTCROP.y) < OUTCROP.r + 1.5 * wobble(x / 2, y / 2);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = y * SIZE + x;
      if (overlay[i] === OVERLAY_WATER) continue;
      if (nearOutcrop(x, y)) underlay[i] = UNDERLAY_DIRT;
      else if (underlay[i] !== UNDERLAY_SAND && forestness(x, y) > 0.45) underlay[i] = UNDERLAY_FOREST;
      const cx = x + 0.5, cy = y + 0.5;
      const onRoad = ROADS.some((road) => distanceToPolyline(cx, cy, road) < 0.95);
      if (onRoad || Math.max(Math.abs(x - SPAWN.x), Math.abs(y - SPAWN.y)) <= 2) overlay[i] = OVERLAY_PATH;
    }
  }

  const place = (kind: ObjectKind, x: number, y: number, side: Side = 0) => {
    const object: MapObject = { kind, x, y, side, variant: rand() };
    objects.push(object);
    if (kind === "fence" || kind === "wall") collision.addWall(x, y, side);
    else collision.block(x, y);
  };

  for (let x = PEN.x0; x <= PEN.x1; x++) {
    if (x !== PEN.gateX) place("fence", x, PEN.y0, 2);
    place("fence", x, PEN.y1, 0);
  }
  for (let y = PEN.y0; y <= PEN.y1; y++) {
    place("fence", PEN.x0, y, 3);
    place("fence", PEN.x1, y, 1);
  }

  // The ruin: a doorway in the south wall, a collapsed stretch of the north wall, a gap in the west wall.
  for (let x = RUIN.x0; x <= RUIN.x1; x++) {
    if (x !== 15) place("wall", x, RUIN.y0, 2);
    if (x !== 13 && x !== 14) place("wall", x, RUIN.y1, 0);
  }
  for (let y = RUIN.y0; y <= RUIN.y1; y++) {
    if (y !== 45) place("wall", RUIN.x0, y, 3);
    place("wall", RUIN.x1, y, 1);
  }

  const reserved = (x: number, y: number) =>
    overlay[y * SIZE + x] !== 0 || (collision.get(x, y) & BLOCKED) !== 0
    || Math.hypot(x - SPAWN.x, y - SPAWN.y) < 6
    || inRect(x, y, PEN.x0 - 1, PEN.y0 - 1, PEN.x1 + 1, PEN.y1 + 1)
    || inRect(x, y, RUIN.x0 - 1, RUIN.y0 - 1, RUIN.x1 + 1, RUIN.y1 + 1);

  for (let n = 0; n < 60 && objects.filter((o) => o.kind === "rock").length < 11; n++) {
    const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * OUTCROP.r;
    const x = Math.floor(OUTCROP.x + Math.cos(a) * r), y = Math.floor(OUTCROP.y + Math.sin(a) * r);
    if (!reserved(x, y)) place("rock", x, y);
  }
  for (const [x, y] of [[8, 20], [24, 55], [58, 22], [40, 52]] as const) if (!reserved(x, y)) place("rock", x, y);

  for (let y = 1; y < SIZE - 1; y++) {
    for (let x = 1; x < SIZE - 1; x++) {
      const f = forestness(x, y), roll = rand(), pick = rand();
      if (reserved(x, y) || roll >= (f > 0.45 ? 0.3 * f : 0.022)) continue;
      place(pick < (f > 0.45 ? 0.45 : 0.3) ? "oak" : "tree", x, y);
    }
  }
  return map;
}

function corners(x: number, y: number): Point[] {
  return [[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1]];
}

function inRect(x: number, y: number, x0: number, y0: number, x1: number, y1: number): boolean {
  return x >= x0 && x <= x1 && y >= y0 && y <= y1;
}

function smoothstep(edge0: number, edge1: number, v: number): number {
  const t = Math.max(0, Math.min(1, (v - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function distanceToPolyline(px: number, py: number, points: ReadonlyArray<Point>): number {
  let best = Infinity;
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1]!, [bx, by] = points[i]!;
    const abx = bx - ax, aby = by - ay;
    const t = Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / (abx * abx + aby * aby)));
    best = Math.min(best, Math.hypot(px - ax - abx * t, py - ay - aby * t));
  }
  return best;
}
