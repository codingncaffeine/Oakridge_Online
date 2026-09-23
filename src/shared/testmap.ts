import { BLOCKED, type Side } from "./collision.ts";
import {
  blankMap, OVERLAY_PATH, OVERLAY_WATER, UNDERLAY_DIRT, UNDERLAY_FOREST, UNDERLAY_SAND,
  type MapObject, type ObjectKind, type WorldMap,
} from "./map.ts";
import { findPath } from "./pathfind.ts";
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
    const object: MapObject = { id: objects.length, kind, x, y, side, variant: rand() };
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
  // The outcrop's rocks carry ore: iron at its heart, copper and tin around it.
  const centre = (o: MapObject) => Math.hypot(o.x + 0.5 - OUTCROP.x, o.y + 0.5 - OUTCROP.y);
  objects.filter((o) => o.kind === "rock").sort((a, b) => centre(a) - centre(b)).forEach((o, i) => {
    o.kind = i < 3 ? "iron_rock" : i % 2 ? "copper_rock" : "tin_rock";
  });
  for (const [x, y] of [[8, 20], [24, 55], [58, 22], [40, 52]] as const) if (!reserved(x, y)) place("rock", x, y);

  for (let y = 1; y < SIZE - 1; y++) {
    for (let x = 1; x < SIZE - 1; x++) {
      const f = forestness(x, y), roll = rand(), pick = rand();
      if (reserved(x, y) || roll >= (f > 0.45 ? 0.2 * f : 0.018)) continue;
      place(pick < (f > 0.45 ? 0.45 : 0.3) ? "oak" : "tree", x, y);
    }
  }

  // Items lying about that come back after being taken: [item, count, x, y, respawn ticks].
  const spawns: ReadonlyArray<readonly [string, number, number, number, number]> = [
    ["coins", 10, 30, 28, 200], ["bread", 1, 34, 32, 100], ["logs", 1, 22, 30, 100], ["leather_cap", 1, 15, 45, 150],
    ["bronze_dagger", 1, 38, 38, 150], ["raw_sardine", 1, 46, 21, 100], ["copper_ore", 1, 47, 45, 100],
    ["leather_boots", 1, 33, 45, 150], ["red_cape", 1, 58, 30, 200],
    // A beginner's tools near the start, since a player who loses theirs has no shop to buy another
    // from and no smithy to make one: every other tool on this map needs a level they may not have.
    ["bronze_axe", 1, 30, 32, 100], ["bronze_pickaxe", 1, 34, 28, 100], ["fishing_net", 1, 44, 20, 100],
    // Better tools, until there are shops and smithing: iron ones out in the open, steel ones behind walls.
    ["iron_axe", 1, 20, 34, 300], ["iron_pickaxe", 1, 45, 47, 300], ["steel_axe", 1, 17, 47, 300], ["steel_pickaxe", 1, 42, 40, 300],
  ];
  for (const [item, count, x, y, respawn] of spawns) {
    if ((collision.get(x, y) & BLOCKED) === 0) map.spawns.push({ item, count, x, y, respawn });
  }

  // Creatures, by where they live: the pen, the roads, the pond, the western wood, the outcrop, the
  // ruin, and a goblin camp on the southern road. Each is scattered over free ground near its centre.
  const camp = { x: 27, y: 54 };
  const herds: ReadonlyArray<readonly [string, number, number, number, number]> = [
    ["cow", 4, (PEN.x0 + PEN.x1) / 2, (PEN.y0 + PEN.y1) / 2, 3],
    ["ram", 2, (PEN.x0 + PEN.x1) / 2, (PEN.y0 + PEN.y1) / 2, 3],
    ["field_rat", 6, SPAWN.x, SPAWN.y, 12],
    ["hen", 4, 36, 33, 4],
    ["mallard", 3, POND.x, POND.y + 6, 5],
    ["pond_newt", 3, POND.x - 7, POND.y + 3, 4],
    ["marsh_frog", 3, POND.x + 6, POND.y + 4, 4],
    ["thicket_spider", 5, 18, 24, 7],
    ["giant_rat", 4, 22, 38, 6],
    ["wild_boar", 3, 14, 18, 6],
    ["grey_wolf", 4, 9, 33, 6],
    ["cave_bat", 4, OUTCROP.x - 6, OUTCROP.y - 4, 5],
    ["dust_scorpion", 3, OUTCROP.x, OUTCROP.y, 5],
    ["quarry_brute", 1, OUTCROP.x + 4, OUTCROP.y + 3, 2],
    ["mudfoot_goblin", 6, camp.x, camp.y, 5],
    ["mudfoot_raider", 3, camp.x + 4, camp.y - 3, 4],
    ["mudfoot_warchief", 1, camp.x, camp.y - 1, 1],
    ["highwayman", 2, 56, 30, 4],
    ["ruin_skeleton", 3, (RUIN.x0 + RUIN.x1) / 2, (RUIN.y0 + RUIN.y1) / 2, 3],
    ["grave_shambler", 2, RUIN.x0 - 3, RUIN.y1 + 3, 3],
    ["barrow_warden", 1, (RUIN.x0 + RUIN.x1) / 2, RUIN.y1 - 1, 1],
  ];
  const livedIn = new Set<number>();
  for (const [monster, count, cx, cy, radius] of herds) {
    for (let placed = 0, tries = 0; placed < count && tries < 200; tries++) {
      const x = Math.round(cx + (rand() * 2 - 1) * radius), y = Math.round(cy + (rand() * 2 - 1) * radius);
      if (x < 1 || y < 1 || x >= SIZE - 1 || y >= SIZE - 1) continue;
      const key = y * SIZE + x;
      if (livedIn.has(key) || (collision.get(x, y) & BLOCKED) !== 0 || overlay[key] === OVERLAY_WATER) continue;
      // Nothing dangerous within sight of where players arrive.
      if (Math.hypot(x - SPAWN.x, y - SPAWN.y) < 5) continue;
      livedIn.add(key);
      map.monsters.push({ monster, x, y });
      placed++;
    }
  }

  // Fishing: eight water tiles spread around the pond, each beside a bank a player can reach; two spots at a time.
  const banks: Array<{ x: number; y: number; angle: number }> = [];
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (overlay[y * SIZE + x] !== OVERLAY_WATER) continue;
      const bank = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const).some(([dx, dy]) => {
        const bx = x + dx, by = y + dy;
        if (!collision.inBounds(bx, by) || (collision.get(bx, by) & BLOCKED) !== 0) return false;
        const walk = findPath(collision, SPAWN.x, SPAWN.y, bx, by).at(-1);
        return walk?.x === bx && walk.y === by;
      });
      if (bank) banks.push({ x, y, angle: Math.atan2(y + 0.5 - POND.y, x + 0.5 - POND.x) });
    }
  }
  banks.sort((a, b) => a.angle - b.angle);
  const picks = Math.min(8, banks.length);
  const tiles = Array.from({ length: picks }, (_, i) => banks[Math.floor((i * banks.length) / picks)]!).map(({ x, y }) => ({ x, y }));
  map.fishing.push({ tiles, count: 2, method: "net" });
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
