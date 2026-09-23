import { CollisionMap, type Side } from "./collision.ts";
import type { FishingMethod } from "./gathering.ts";
import type { Tile } from "./pathfind.ts";

/** The eight woodcutting tiers of PLAN §8.2, worst to best; `RESOURCES` gives each its levels. */
export const TREE_KINDS = ["tree", "oak", "alder", "rowan", "blackthorn", "ironbark", "sablewood", "heartoak"] as const;
/** The eight mining tiers of PLAN §8.3, worst to best. Plain `rock` carries nothing and is not one of them. */
export const ORE_KINDS = [
  "copper_rock", "tin_rock", "iron_rock", "coal_rock", "silver_rock", "coldiron_rock", "gold_rock", "emberite_rock", "starfall_rock",
] as const;

/**
 * Things that stand on a tile and are neither tree nor rock: the furniture of a village. `stairs` and
 * `ladder` carry a `to` and move a player between planes (PLAN §8.5); `bank_booth`, `counter`, `furnace`,
 * `anvil`, `range` and `fire` are what Phases 7 and 8 do their work at.
 */
export const PROP_KINDS = [
  "rock", "bush", "reed", "crop", "signpost", "bank_booth", "counter", "furnace", "anvil", "range", "fire",
  "millstone", "grave", "sarcophagus", "stall", "table", "barrel", "crate", "stairs", "ladder",
] as const;
/** Things that run along one edge of a tile rather than filling it. */
export const EDGE_KINDS = ["fence", "wall", "wall_window", "door", "gate", "barred", "sealed"] as const;
/** The ones that open: a player may click them, and `openable()` says so. */
const OPENABLE = new Set<string>(["door", "gate"]);

export type TreeKind = (typeof TREE_KINDS)[number];
export type OreKind = (typeof ORE_KINDS)[number];
export type PropKind = (typeof PROP_KINDS)[number];
export type EdgeKind = (typeof EDGE_KINDS)[number];
export type ObjectKind = TreeKind | OreKind | PropKind | EdgeKind;

const TREES = new Set<string>(TREE_KINDS);
const EDGES = new Set<string>(EDGE_KINDS);
/** Whether a kind is a tree: what leaves a stump, and what makes a noise when it comes down. */
export const isTree = (kind: ObjectKind): kind is TreeKind => TREES.has(kind);
/** Whether a kind runs along a tile edge rather than filling the tile. */
export const isEdgeKind = (kind: ObjectKind): kind is EdgeKind => EDGES.has(kind);
/** Whether a kind swings open and shut when clicked. */
export const openable = (kind: ObjectKind): boolean => OPENABLE.has(kind);

/** A placed object. Trees, rocks and props fill their tile; fences, walls and doors run along one edge. */
export interface MapObject {
  /** Its name to the server and every client: unique across the whole plane stack. */
  id: number;
  kind: ObjectKind;
  x: number;
  y: number;
  /** Which plane it stands on: 0 ground, +1/+2 upper floors, −1..−3 underground (PLAN §8.5). */
  plane: number;
  side: Side;
  /** Seeded per-object value in [0, 1) that picks size, turn and tint. */
  variant: number;
  /** For stairs and ladders: the plane they lead to. */
  to?: number;
  /** Which shop a counter sells from, which quarry an adit belongs to — whatever the kind alone can't say. */
  tag?: string;
}

export const UNDERLAY_GRASS = 0;
export const UNDERLAY_FOREST = 1;
export const UNDERLAY_DIRT = 2;
export const UNDERLAY_SAND = 3;

export const OVERLAY_NONE = 0;
export const OVERLAY_PATH = 1;
export const OVERLAY_WATER = 2;

export interface ItemSpawn {
  item: string;
  count: number;
  x: number;
  y: number;
  respawn: number;
  plane?: number;
}

/** Where a creature lives: it wanders around this tile and comes back to it after being killed. */
export interface MonsterSpawn {
  monster: string;
  x: number;
  y: number;
  plane?: number;
}

/** A tile on a named plane: everything in the world stands on one of these (PLAN §7.1, §8.5). */
export interface Place {
  x: number;
  y: number;
  plane: number;
}

export const samePlace = (a: Place, b: Place): boolean => a.x === b.x && a.y === b.y && a.plane === b.plane;

/**
 * One plane of the world, in **absolute world tile coordinates** (PLAN §7.1). The arrays are local —
 * `width × height` starting at (originX, originY) — but every accessor here takes world coordinates and
 * does the subtraction itself, so the server, the protocol and saved characters only ever see the final
 * numbers. Tile (x, y) spans x..x+1 east and y..y+1 north; heights are in tile units, one per corner.
 */
export interface WorldMap {
  readonly width: number;
  readonly height: number;
  readonly originX: number;
  readonly originY: number;
  /** 0 ground, +1/+2 upper floors, −1..−3 underground. */
  readonly plane: number;
  /** (width + 1) * (height + 1) corner heights, row by row from the south. */
  readonly heights: Float32Array;
  readonly underlay: Uint8Array;
  readonly overlay: Uint8Array;
  readonly objects: MapObject[];
  readonly collision: CollisionMap;
  /** Items lying in the world that come back a while after being taken (respawn is in ticks). */
  readonly spawns: ItemSpawn[];
  /** Creatures that live on the map. */
  readonly monsters: MonsterSpawn[];
  /** Fishing waters: `count` spots at a time, each on one of `tiles` (water beside a bank), moving now and then. */
  readonly fishing: FishingWater[];
  /** Tiles the sky does not reach: an upper floor's footprint, a cave's roof. Nothing here is rained on or lit as outdoors. */
  readonly indoors: Uint8Array;
}

/**
 * The whole world a client holds at once: one `WorldMap` per plane, all sharing an origin and a size,
 * plus where a new character wakes up. Planes are separate maps rather than a third array dimension so
 * that every accessor, the collision map and the pathfinder stay two-dimensional and unchanged.
 */
export interface WorldStack {
  readonly planes: Map<number, WorldMap>;
  readonly spawn: Place;
  /** The map name, for logs and the plan; the client builds the same one from the same seed. */
  readonly name: string;
}

/** The plane's map, or the ground plane when that plane does not exist. */
export function planeOf(stack: WorldStack, plane: number): WorldMap {
  return stack.planes.get(plane) ?? stack.planes.get(0)!;
}

/** A stack of one ground plane: what a test fixture and the old single-plane maps are. */
export function oneMap(map: WorldMap, spawn?: Tile, name = "map"): WorldStack {
  const at = spawn ?? { x: map.originX + (map.width >> 1), y: map.originY + (map.height >> 1) };
  return { planes: new Map([[map.plane, map]]), spawn: { ...at, plane: map.plane }, name };
}

/** Takes either a whole stack or a lone map, so a fixture can hand over one plane and mean it. */
export function asStack(world: WorldStack | WorldMap): WorldStack {
  return "planes" in world ? world : oneMap(world);
}

/** Every object in the stack, whatever plane it stands on. */
export function allObjects(stack: WorldStack): MapObject[] {
  return [...stack.planes.values()].flatMap((m) => m.objects);
}

export interface FishingWater {
  tiles: Tile[];
  count: number;
  /** Which of the four ways to fish its spots offer, and so what they bring up (PLAN §8.4). */
  method: FishingMethod;
  plane?: number;
}

export function blankMap(width: number, height: number, originX = 0, originY = 0, plane = 0): WorldMap {
  return {
    width,
    height,
    originX,
    originY,
    plane,
    heights: new Float32Array((width + 1) * (height + 1)),
    underlay: new Uint8Array(width * height),
    overlay: new Uint8Array(width * height),
    objects: [],
    collision: new CollisionMap(width, height, originX, originY),
    spawns: [],
    monsters: [],
    fishing: [],
    indoors: new Uint8Array(width * height),
  };
}

/** Index into a map's tile arrays for a world tile, or -1 when it is off the map. */
export function tileIndex(map: WorldMap, x: number, y: number): number {
  const lx = x - map.originX, ly = y - map.originY;
  return lx >= 0 && ly >= 0 && lx < map.width && ly < map.height ? ly * map.width + lx : -1;
}

/** Objects that fill their tile (trees, rocks, props), keyed by tile index: at most one per tile. */
export function solidObjects(map: WorldMap): Map<number, MapObject> {
  const at = new Map<number, MapObject>();
  for (const o of map.objects) {
    if (isEdgeKind(o.kind)) continue;
    const i = tileIndex(map, o.x, o.y);
    if (i >= 0) at.set(i, o);
  }
  return at;
}

/** Objects that run along a tile edge (walls, fences, doors), keyed by tile index then side. */
export function edgeObjects(map: WorldMap): Map<number, MapObject[]> {
  const at = new Map<number, MapObject[]>();
  for (const o of map.objects) {
    if (!isEdgeKind(o.kind)) continue;
    const i = tileIndex(map, o.x, o.y);
    if (i < 0) continue;
    const list = at.get(i);
    if (list) list.push(o);
    else at.set(i, [o]);
  }
  return at;
}

export function cornerHeight(map: WorldMap, cx: number, cy: number): number {
  const x = Math.max(0, Math.min(map.width, cx - map.originX)), y = Math.max(0, Math.min(map.height, cy - map.originY));
  return map.heights[y * (map.width + 1) + x]!;
}

/** Whether a world tile is under a roof or a floor above: no sky, no outdoor light. */
export function isIndoors(map: WorldMap, x: number, y: number): boolean {
  const i = tileIndex(map, x, y);
  return i >= 0 && map.indoors[i] === 1;
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
    const i = tileIndex(map, tx, ty);
    if (i >= 0 && map.overlay[i] === overlay) n++;
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
  const at = tileIndex(map, x, y);
  const own = at >= 0 ? map.overlay[at]! : OVERLAY_NONE;
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
  const x = map.originX + Math.max(0, Math.min(map.width - 1, Math.floor(fx) - map.originX));
  const y = map.originY + Math.max(0, Math.min(map.height - 1, Math.floor(fy) - map.originY));
  const u = Math.max(0, Math.min(1, fx - x)), v = Math.max(0, Math.min(1, fy - y));
  const sw = cornerHeight(map, x, y), se = cornerHeight(map, x + 1, y);
  const ne = cornerHeight(map, x + 1, y + 1), nw = cornerHeight(map, x, y + 1);
  if (splitsSwNe(map, x, y)) {
    return u >= v ? sw + (se - sw) * u + (ne - se) * v : sw + (ne - nw) * u + (nw - sw) * v;
  }
  return u + v <= 1 ? sw + (se - sw) * u + (nw - sw) * v : ne + (nw - ne) * (1 - u) + (se - ne) * (1 - v);
}
