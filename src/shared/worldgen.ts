// The tools a map is built with: terrain shaping, water, roads, scatter, and buildings. `oakridge.ts`
// authors the district with these; the seeded parts (wilderness, woods, quarry faces) work exactly as
// the test map's did, because a region of nowhere-in-particular should cost nothing to make.
import { BLOCKED, type Side } from "./collision.ts";
import {
  blankMap, isEdgeKind, OVERLAY_NONE, OVERLAY_PATH, OVERLAY_WATER, tileIndex,
  type FishingWater, type ItemSpawn, type MapObject, type MonsterSpawn, type ObjectKind, type Place,
  type WorldMap, type WorldStack,
} from "./map.ts";
import type { Tile } from "./pathfind.ts";
import { mulberry32 } from "./rng.ts";

export type Point = readonly [number, number];

/** A rectangle of world tiles, inclusive at both ends: how every site in PLAN §7.4 is written down. */
export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export const boxOf = (x0: number, y0: number, x1: number, y1: number): Box => ({ x0, y0, x1, y1 });
export const inBox = (b: Box, x: number, y: number): boolean => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1;
export const centreOf = (b: Box): Tile => ({ x: Math.round((b.x0 + b.x1) / 2), y: Math.round((b.y0 + b.y1) / 2) });

/**
 * Builds a stack of planes that share an origin and a size, handing out object ids from one counter so
 * an id names exactly one object anywhere in the world.
 */
export class WorldBuilder {
  readonly planes = new Map<number, WorldMap>();
  readonly width: number;
  readonly height: number;
  readonly originX: number;
  readonly originY: number;
  readonly rand: () => number;
  private nextId = 1;

  constructor(width: number, height: number, originX: number, originY: number, seed: number) {
    this.width = width;
    this.height = height;
    this.originX = originX;
    this.originY = originY;
    this.rand = mulberry32(seed);
  }

  /** The plane's map, made the first time it is asked for. */
  plane(plane: number): WorldMap {
    let map = this.planes.get(plane);
    if (!map) {
      map = blankMap(this.width, this.height, this.originX, this.originY, plane);
      this.planes.set(plane, map);
    }
    return map;
  }

  /** A random whole number from 0 to n - 1. */
  pick(n: number): number {
    return Math.min(n - 1, Math.floor(this.rand() * n));
  }

  /** Puts an object on a plane, blocking its tile or flagging its edge, and gives it its id. */
  place(plane: number, kind: ObjectKind, x: number, y: number, extra: Partial<MapObject> = {}): MapObject | null {
    const map = this.plane(plane);
    if (tileIndex(map, x, y) < 0) return null;
    const o: MapObject = { id: this.nextId++, kind, x, y, plane, side: 0, variant: this.rand(), ...extra };
    map.objects.push(o);
    if (isEdgeKind(kind)) map.collision.addWall(x, y, o.side);
    else map.collision.block(x, y);
    return o;
  }

  /** Whether a tile on a plane is free of objects, water and walls. */
  free(plane: number, x: number, y: number): boolean {
    const map = this.plane(plane);
    const i = tileIndex(map, x, y);
    return i >= 0 && (map.collision.get(x, y) & BLOCKED) === 0 && map.overlay[i] !== OVERLAY_WATER;
  }

  /** Reads and writes a tile's underlay, overlay and indoors flag in world coordinates. */
  setUnderlay(plane: number, x: number, y: number, value: number): void {
    const map = this.plane(plane);
    const i = tileIndex(map, x, y);
    if (i >= 0) map.underlay[i] = value;
  }

  setOverlay(plane: number, x: number, y: number, value: number): void {
    const map = this.plane(plane);
    const i = tileIndex(map, x, y);
    if (i >= 0) map.overlay[i] = value;
  }

  overlayAt(plane: number, x: number, y: number): number {
    const map = this.plane(plane);
    const i = tileIndex(map, x, y);
    return i >= 0 ? map.overlay[i]! : OVERLAY_NONE;
  }

  setIndoors(plane: number, x: number, y: number, value: 0 | 1): void {
    const map = this.plane(plane);
    const i = tileIndex(map, x, y);
    if (i >= 0) map.indoors[i] = value;
  }

  /** A tile corner's height, in world corner coordinates. */
  cornerIndex(cx: number, cy: number): number {
    const lx = cx - this.originX, ly = cy - this.originY;
    if (lx < 0 || ly < 0 || lx > this.width || ly > this.height) return -1;
    return ly * (this.width + 1) + lx;
  }

  setHeight(plane: number, cx: number, cy: number, value: number): void {
    const i = this.cornerIndex(cx, cy);
    if (i >= 0) this.plane(plane).heights[i] = value;
  }

  heightAtCorner(plane: number, cx: number, cy: number): number {
    const i = this.cornerIndex(cx, cy);
    return i >= 0 ? this.plane(plane).heights[i]! : 0;
  }

  /** Flattens every corner of a box to one height: what a floor, a green or a yard needs. */
  level(plane: number, b: Box, height: number): void {
    for (let cy = b.y0; cy <= b.y1 + 1; cy++) for (let cx = b.x0; cx <= b.x1 + 1; cx++) this.setHeight(plane, cx, cy, height);
  }

  /** The mean ground height under a box, which is what a building should be levelled to. */
  meanHeight(plane: number, b: Box): number {
    let sum = 0, n = 0;
    for (let cy = b.y0; cy <= b.y1 + 1; cy++) {
      for (let cx = b.x0; cx <= b.x1 + 1; cx++) {
        sum += this.heightAtCorner(plane, cx, cy);
        n++;
      }
    }
    return n > 0 ? sum / n : 0;
  }

  spawnItem(spawn: ItemSpawn): void {
    this.plane(spawn.plane ?? 0).spawns.push(spawn);
  }

  spawnMonster(spawn: MonsterSpawn): void {
    this.plane(spawn.plane ?? 0).monsters.push(spawn);
  }

  addWater(water: FishingWater): void {
    this.plane(water.plane ?? 0).fishing.push(water);
  }

  finish(spawn: Place, name: string): WorldStack {
    return { planes: this.planes, spawn, name };
  }
}

// --- Terrain -----------------------------------------------------------------------------------

export function smoothstep(edge0: number, edge1: number, v: number): number {
  const t = Math.max(0, Math.min(1, (v - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Distance from a point to the nearest point of a polyline: how a road's width is measured. */
export function distanceToPolyline(px: number, py: number, points: ReadonlyArray<Point>): number {
  let best = Infinity;
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1]!, [bx, by] = points[i]!;
    const abx = bx - ax, aby = by - ay;
    const len = abx * abx + aby * aby;
    const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / len));
    best = Math.min(best, Math.hypot(px - ax - abx * t, py - ay - aby * t));
  }
  return best;
}

export function corners(x: number, y: number): Point[] {
  return [[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1]];
}

// --- Buildings ---------------------------------------------------------------------------------

/** Which wall of a building a door is in, and how far along it. */
export interface DoorSpec {
  /** The side of the building the door pierces. */
  side: Side;
  /** How far along that wall, counted from its low end (west for a north/south wall, south for east/west). */
  along: number;
}

export interface BuildingSpec {
  /** The building's footprint in world tiles, walls included. */
  box: Box;
  plane?: number;
  /** Where its doors are. Every building has at least one, or nobody can get in. */
  doors: DoorSpec[];
  /** Windows, written the same way as doors; they light the wall but do not open. */
  windows?: DoorSpec[];
  /** Floors above the ground one. Each gets the same walls and a stair up from the one below. */
  storeys?: number;
  /** Where the stair between floors stands, in world tiles. Needed when `storeys` is set. */
  stair?: Tile;
  /** The floor's underlay. */
  floor?: number;
}

/**
 * Puts up a building: four walls on the footprint's edges, doors and windows where asked for, a
 * levelled floor, and the whole footprint marked indoors so the renderer knows to lift its roof when
 * someone steps inside. Upper storeys get the same walls on the plane above, joined by a stair.
 *
 * Walls sit on the *outer* edge of the footprint's border tiles, so the inside of the box is the room
 * and a wall is never a tile a player could stand on.
 */
export function building(b: WorldBuilder, spec: BuildingSpec): void {
  const { box } = spec;
  const base = spec.plane ?? 0;
  const storeys = Math.max(1, spec.storeys ?? 1);
  const height = b.meanHeight(base, box);
  const doorAt = new Map<string, "door" | "window">();
  const key = (side: Side, along: number) => `${side}:${along}`;
  for (const d of spec.doors) doorAt.set(key(d.side, d.along), "door");
  for (const w of spec.windows ?? []) doorAt.set(key(w.side, w.along), "window");

  for (let s = 0; s < storeys; s++) {
    const plane = base + s;
    b.level(plane, box, height + s * 0);
    for (let y = box.y0; y <= box.y1; y++) {
      for (let x = box.x0; x <= box.x1; x++) {
        if (spec.floor !== undefined) b.setUnderlay(plane, x, y, spec.floor);
        b.setOverlay(plane, x, y, OVERLAY_NONE);
        b.setIndoors(plane, x, y, 1);
      }
    }
    // South (side 2) and north (0) walls run east-west; west (3) and east (1) run north-south.
    for (let x = box.x0; x <= box.x1; x++) {
      wall(b, plane, x, box.y0, 2, doorAt.get(key(2, x - box.x0)), s === 0);
      wall(b, plane, x, box.y1, 0, doorAt.get(key(0, x - box.x0)), s === 0);
    }
    for (let y = box.y0; y <= box.y1; y++) {
      wall(b, plane, box.x0, y, 3, doorAt.get(key(3, y - box.y0)), s === 0);
      wall(b, plane, box.x1, y, 1, doorAt.get(key(1, y - box.y0)), s === 0);
    }
  }
  if (storeys > 1 && spec.stair) {
    for (let s = 0; s < storeys; s++) {
      const plane = base + s;
      if (s + 1 < storeys) b.place(plane, "stairs", spec.stair.x, spec.stair.y, { to: plane + 1 });
      if (s > 0) b.place(plane, "stairs", spec.stair.x, spec.stair.y, { to: plane - 1 });
    }
  }
}

/** One length of wall: a door where the spec asks for one on the ground floor, a window, or plain stone. */
function wall(b: WorldBuilder, plane: number, x: number, y: number, side: Side, what: "door" | "window" | undefined, ground: boolean): void {
  if (what === "door" && ground) {
    b.place(plane, "door", x, y, { side });
    return;
  }
  b.place(plane, what === "window" ? "wall_window" : "wall", x, y, { side });
}

/** A fenced enclosure with a gap for a gate: what a farm pen and a stockade are made of. */
export function fence(b: WorldBuilder, plane: number, box: Box, gate: Tile | null, kind: ObjectKind = "fence"): void {
  for (let x = box.x0; x <= box.x1; x++) {
    if (!(gate && gate.x === x && gate.y === box.y0)) b.place(plane, kind, x, box.y0, { side: 2 });
    if (!(gate && gate.x === x && gate.y === box.y1)) b.place(plane, kind, x, box.y1, { side: 0 });
  }
  for (let y = box.y0; y <= box.y1; y++) {
    if (!(gate && gate.y === y && gate.x === box.x0)) b.place(plane, kind, box.x0, y, { side: 3 });
    if (!(gate && gate.y === y && gate.x === box.x1)) b.place(plane, kind, box.x1, y, { side: 1 });
  }
  if (gate) b.place(plane, "gate", gate.x, gate.y, { side: gate.y === box.y0 ? 2 : gate.y === box.y1 ? 0 : gate.x === box.x0 ? 3 : 1 });
}

/** Lays a path along a polyline: `width` tiles either side of it get the path overlay. */
export function road(b: WorldBuilder, plane: number, points: ReadonlyArray<Point>, width = 0.95): void {
  const xs = points.map(([x]) => x), ys = points.map(([, y]) => y);
  const x0 = Math.floor(Math.min(...xs) - width - 1), x1 = Math.ceil(Math.max(...xs) + width + 1);
  const y0 = Math.floor(Math.min(...ys) - width - 1), y1 = Math.ceil(Math.max(...ys) + width + 1);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (b.overlayAt(plane, x, y) === OVERLAY_WATER) continue;
      if (distanceToPolyline(x + 0.5, y + 0.5, points) < width) b.setOverlay(plane, x, y, OVERLAY_PATH);
    }
  }
}

/** Scatters `count` objects over a disc, skipping tiles that are taken. Returns what it managed to place. */
export function scatter(
  b: WorldBuilder,
  plane: number,
  kind: ObjectKind,
  at: { x: number; y: number; r: number },
  count: number,
  ok: (x: number, y: number) => boolean = () => true,
): MapObject[] {
  const placed: MapObject[] = [];
  for (let n = 0; n < count * 40 && placed.length < count; n++) {
    const a = b.rand() * Math.PI * 2, r = Math.sqrt(b.rand()) * at.r;
    const x = Math.round(at.x + Math.cos(a) * r), y = Math.round(at.y + Math.sin(a) * r);
    if (!b.free(plane, x, y) || !ok(x, y)) continue;
    const o = b.place(plane, kind, x, y);
    if (o) placed.push(o);
  }
  return placed;
}
