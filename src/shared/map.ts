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
 * Things that stand on a tile and are neither tree nor rock: the furniture of a village. `stairs`,
 * `ladder` and `trapdoor` carry a `to` and move a player between planes (PLAN §8.5); `bank_booth`,
 * `counter`, `furnace`, `anvil`, `range` and `fire` are what Phases 7 and 8 do their work at.
 */
export const PROP_KINDS = [
  "rock", "bush", "reed", "crop", "signpost", "bank_booth", "counter", "furnace", "anvil", "range", "fire",
  "millstone", "grave", "sarcophagus", "stall", "table", "barrel", "crate", "stairs", "ladder", "well", "chest",
  "trapdoor", "boat", "altar", "dead_tree", "kiln", "vent", "round_tower", "bell",
  // Runesmithing (Phase 18): a rune's altar (its rune in `tag`) and the stones ringed round it, the glimstone
  // rock of the pit, and the portal out of it.
  "rune_altar", "standing_stone", "glimstone", "portal",
  // Gems (the magic plan, stage A5): a rock that gives up gems rather than ore.
  "gem_rock",
] as const;
/** Things that run along one edge of a tile rather than filling it. */
export const EDGE_KINDS = ["fence", "wall", "stone_wall", "wall_window", "door", "gate", "field_gate", "barred", "sealed", "adit", "open_stair", "sign"] as const;
/**
 * What a trade's sign shows (a `sign`'s tag): the same picture over every such door in every town, so a
 * building says what it is from down the street — scales for a bank, an anvil for a smithy, a tankard
 * for an inn, a loaf for a provisioner, and so on through the trades.
 */
export const SIGN_ICONS = ["bank", "anvil", "swords", "breastplate", "bow", "star", "tankard", "bread", "apples", "fish", "tools", "ring", "anchor"] as const;
export type SignIcon = (typeof SIGN_ICONS)[number];
/**
 * A sign's id comes from the wall edge it hangs on, above every id the builder hands out, and hanging
 * one draws no random number: a town gains its signs and every other object and roll stays as it was.
 */
export const SIGN_IDS = 10_000_000;
export const signId = (x: number, y: number, side: number): number => SIGN_IDS + (y * 8192 + x) * 4 + side;
/**
 * An object put in after every roll (Runesmithing's altars and pit) takes its id from its plane, tile and
 * side, above the signs', and draws no random number: whichever sites a build has, it has the same id, and
 * nothing built before it moves. Within the frame a tile's x and y fit twelve bits each.
 */
export const FIXED_IDS = 200_000_000;
export const fixedId = (x: number, y: number, plane: number, side = 0): number =>
  FIXED_IDS + (((plane + 4) * 4 + side) * 4096 + (y & 4095)) * 4096 + (x & 4095);
/** The ones that open: a player may click them, and `openable()` says so. */
const OPENABLE = new Set<string>(["door", "gate", "field_gate"]);
/**
 * The ones that carry a player to another plane: a stair, a ladder, a trapdoor in a city street, an
 * adit's open mouth in a hillside, and a barrow's stair with its slab shoved aside (edges, like the barred
 * and sealed ones they replace, so their tiles stay free).
 */
const CLIMBABLE = new Set<string>(["stairs", "ladder", "trapdoor", "adit", "open_stair"]);
/** The ones that lie a fixed way rather than turned at random: a boat lies along its berth, by its `side`; a round tower stands true. */
const ALIGNED = new Set<string>(["boat", "round_tower"]);

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
/** Whether a kind is climbed to the plane its `to` names. */
export const climbable = (kind: ObjectKind): boolean => CLIMBABLE.has(kind);
/** Whether a kind is drawn turned by its `side` (0 along the east–west line, 1 north–south) rather than at random. */
export const aligned = (kind: ObjectKind): boolean => ALIGNED.has(kind);

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
  /** For a wall: how many storeys of it stand here. 1 unless a floor is built on top of this one. */
  tall?: number;
  /** Which shop a counter sells from, which quarry an adit belongs to — whatever the kind alone can't say. */
  tag?: string;
}

export const UNDERLAY_GRASS = 0;
export const UNDERLAY_FOREST = 1;
export const UNDERLAY_DIRT = 2;
export const UNDERLAY_SAND = 3;
/** Bare rock: the dark beyond a dungeon's rooms, which nobody walks on. */
export const UNDERLAY_ROCK = 4;
/** The red earth of the Cinderwaste (PLAN §7.8): hot, bare, and nothing grows on it. */
export const UNDERLAY_CINDER = 5;
/** The grey stone of the Greycaps (PLAN §7.8): a range too steep to walk, and nothing grows on it. */
export const UNDERLAY_STONE = 6;
/** The Sallowfen's ground (PLAN §7.8): dark, sodden, and more water than land. */
export const UNDERLAY_FEN = 7;

export const OVERLAY_NONE = 0;
export const OVERLAY_PATH = 1;
export const OVERLAY_WATER = 2;

/**
 * What covers a building's tiles: clay tile or slate on a hipped roof, thatch on a barn, or a flat
 * roof behind a crenellated parapet — the keep, the church tower and the gatehouse. Outdoors is 0.
 */
export const ROOF_NONE = 0;
export const ROOF_CLAY = 1;
export const ROOF_SLATE = 2;
export const ROOF_THATCH = 3;
export const ROOF_KEEP = 4;
/**
 * Caldmoor's (PLAN §7.7 rule 10: a second kingdom reads as a different country): steep slate between two
 * stone gables that rise over it in crow-steps, a chimney on a gable's head.
 */
export const ROOF_GABLE = 5;
export type RoofStyle = typeof ROOF_CLAY | typeof ROOF_SLATE | typeof ROOF_THATCH | typeof ROOF_KEEP | typeof ROOF_GABLE;

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

/** A rectangle of world tiles, inclusive at both ends: how every site in PLAN §7.4 is written down. */
export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export const boxOf = (x0: number, y0: number, x1: number, y1: number): Box => ({ x0, y0, x1, y1 });

// --- Regions -----------------------------------------------------------------------------------

/** Tiles along one side of a region (PLAN §7.1): the unit the world is stored in and streamed by. */
export const REGION = 64;
/** A region's id, one byte each (PLAN §7.1): Oakridge's is 12850. */
export const regionId = (rx: number, ry: number): number => rx * 256 + ry;
/** The region a tile (or corner) coordinate falls in. */
export const regionOf = (t: number): number => Math.floor(t / REGION);

/**
 * One 64×64 block of a plane's tiles: the map's storage, made the first time anything is written into
 * it, so a frame of 660 regions costs only what has been built on it (PLAN §7.2). The arrays are local
 * to the region's south-west corner (x0, y0); every function in this file takes world coordinates and
 * finds the region itself. Corner heights are 64 × 64 too: the height at corner (x0 + i, y0 + j) is
 * heights[j * 64 + i], and a corner on the east or north edge belongs to the next region over.
 */
export interface Region {
  readonly rx: number;
  readonly ry: number;
  /** The world tile at the region's south-west corner. */
  readonly x0: number;
  readonly y0: number;
  readonly heights: Float32Array;
  readonly underlay: Uint8Array;
  readonly overlay: Uint8Array;
  readonly indoors: Uint8Array;
  readonly roofs: Uint8Array;
  /**
   * Whether a tile of it has been written. A region that only holds the heights of a neighbour's
   * east or north edge is not built: nothing stands on it and nothing draws it.
   */
  built: boolean;
}

/** The tiles a region covers. */
export const regionBox = (r: Region): Box => boxOf(r.x0, r.y0, r.x0 + REGION - 1, r.y0 + REGION - 1);

/**
 * One plane of the world, in **absolute world tile coordinates** (PLAN §7.1). `width × height` from
 * (originX, originY) is the frame: what may be built. The tiles themselves live in regions, made as they
 * are written, so the client and the server hold only the parts of the frame that exist. Every accessor
 * here takes world coordinates and does the lookup itself, so the server, the protocol and saved
 * characters only ever see the final numbers. Tile (x, y) spans x..x+1 east and y..y+1 north; heights
 * are in tile units, one per corner.
 */
export interface WorldMap {
  readonly width: number;
  readonly height: number;
  readonly originX: number;
  readonly originY: number;
  /** 0 ground, +1/+2 upper floors, −1..−3 underground. */
  readonly plane: number;
  /** The regions anything has been written to, by `regionId`. */
  readonly regions: Map<number, Region>;
  readonly objects: MapObject[];
  readonly collision: CollisionMap;
  /** Items lying in the world that come back a while after being taken (respawn is in ticks). */
  readonly spawns: ItemSpawn[];
  /** Creatures that live on the map. */
  readonly monsters: MonsterSpawn[];
  /** Fishing waters: `count` spots at a time, each on one of `tiles` (water beside a bank), moving now and then. */
  readonly fishing: FishingWater[];
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
  /** Ids the build handed out and then took back: lengths of rail opened where a fishing spot lies beyond (worldgen.ts). */
  readonly retired?: readonly number[];
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

/**
 * A frame with nothing on it: regions come into being as they are written. This is what the world is
 * built on (PLAN §7.1's 46 × 32 regions), and everything not built on it is blocked and undrawn.
 */
export function frameMap(width: number, height: number, originX = 0, originY = 0, plane = 0): WorldMap {
  return {
    width,
    height,
    originX,
    originY,
    plane,
    regions: new Map(),
    objects: [],
    collision: new CollisionMap(width, height, originX, originY),
    spawns: [],
    monsters: [],
    fishing: [],
  };
}

/** How many regions a blank map may cover: it is for fixtures and previews, and every tile of it exists. */
const BLANK_MAP_REGIONS = 64;

/**
 * A small map whose every tile exists: flat, grass, open ground, the way a fixture or a preview wants
 * it. A frame meant to be built on sparsely is a `frameMap`.
 */
export function blankMap(width: number, height: number, originX = 0, originY = 0, plane = 0): WorldMap {
  const map = frameMap(width, height, originX, originY, plane);
  const rx0 = regionOf(originX), rx1 = regionOf(originX + width - 1), ry0 = regionOf(originY), ry1 = regionOf(originY + height - 1);
  if ((rx1 - rx0 + 1) * (ry1 - ry0 + 1) > BLANK_MAP_REGIONS) throw new Error(`a blank map of ${width}×${height} is too big: build on a frameMap`);
  for (let ry = ry0; ry <= ry1; ry++) for (let rx = rx0; rx <= rx1; rx++) tileRegion(map, Math.max(originX, rx * REGION), Math.max(originY, ry * REGION));
  return map;
}

/** Index into a map's tile arrays for a world tile, or -1 when it is off the map. */
export function tileIndex(map: WorldMap, x: number, y: number): number {
  const lx = x - map.originX, ly = y - map.originY;
  return lx >= 0 && ly >= 0 && lx < map.width && ly < map.height ? ly * map.width + lx : -1;
}

/** The region holding tile or corner (x, y), if anything has been written there. */
export function regionAt(map: WorldMap, x: number, y: number): Region | undefined {
  return map.regions.get(regionId(regionOf(x), regionOf(y)));
}

/** Makes the region holding (x, y) if it is not there yet. Only the frame's corners may lie beyond its tiles. */
function regionMade(map: WorldMap, x: number, y: number, corner: boolean): Region | undefined {
  const lx = x - map.originX, ly = y - map.originY;
  const room = corner ? 0 : -1;
  if (lx < 0 || ly < 0 || lx > map.width + room || ly > map.height + room) return undefined;
  const rx = regionOf(x), ry = regionOf(y), id = regionId(rx, ry);
  let r = map.regions.get(id);
  if (!r) {
    r = {
      rx, ry, x0: rx * REGION, y0: ry * REGION,
      heights: new Float32Array(REGION * REGION),
      underlay: new Uint8Array(REGION * REGION), overlay: new Uint8Array(REGION * REGION),
      indoors: new Uint8Array(REGION * REGION), roofs: new Uint8Array(REGION * REGION),
      built: false,
    };
    map.regions.set(id, r);
  }
  return r;
}

/**
 * The region a tile is written into: made if need be, and marked built. Its collision flags come into
 * being with it, open, so ground somebody built is ground somebody can walk on.
 */
export function tileRegion(map: WorldMap, x: number, y: number): Region | undefined {
  const r = regionMade(map, x, y, false);
  if (r && !r.built) {
    r.built = true;
    map.collision.touch(x, y);
  }
  return r;
}

const local = (r: Region, x: number, y: number) => (y - r.y0) * REGION + (x - r.x0);

export function underlayAt(map: WorldMap, x: number, y: number): number {
  const r = regionAt(map, x, y);
  return r ? r.underlay[local(r, x, y)]! : UNDERLAY_GRASS;
}

export function overlayAt(map: WorldMap, x: number, y: number): number {
  const r = regionAt(map, x, y);
  return r ? r.overlay[local(r, x, y)]! : OVERLAY_NONE;
}

/** How many floors stand on a tile from this plane up; 0 outdoors. */
export function indoorsAt(map: WorldMap, x: number, y: number): number {
  const r = regionAt(map, x, y);
  return r ? r.indoors[local(r, x, y)]! : 0;
}

/** Which roof (ROOF_*) covers a tile; ROOF_NONE outdoors. */
export function roofAt(map: WorldMap, x: number, y: number): number {
  const r = regionAt(map, x, y);
  return r ? r.roofs[local(r, x, y)]! : ROOF_NONE;
}

export function setUnderlay(map: WorldMap, x: number, y: number, value: number): void {
  const r = tileRegion(map, x, y);
  if (r) r.underlay[local(r, x, y)] = value;
}

export function setOverlay(map: WorldMap, x: number, y: number, value: number): void {
  const r = tileRegion(map, x, y);
  if (r) r.overlay[local(r, x, y)] = value;
}

export function setIndoors(map: WorldMap, x: number, y: number, value: number): void {
  const r = tileRegion(map, x, y);
  if (r) r.indoors[local(r, x, y)] = value;
}

export function setRoof(map: WorldMap, x: number, y: number, value: number): void {
  const r = tileRegion(map, x, y);
  if (r) r.roofs[local(r, x, y)] = value;
}

/** The height of a corner; a corner off the frame reads as the nearest one on it, so a slope never runs off the edge of the world. */
export function cornerHeight(map: WorldMap, cx: number, cy: number): number {
  const x = Math.max(map.originX, Math.min(map.originX + map.width, cx));
  const y = Math.max(map.originY, Math.min(map.originY + map.height, cy));
  const r = regionAt(map, x, y);
  return r ? r.heights[local(r, x, y)]! : 0;
}

/** Sets a corner's height. The region holding it is made if need be, but a corner alone does not make it built. */
export function setCornerHeight(map: WorldMap, cx: number, cy: number, value: number): void {
  const r = regionMade(map, cx, cy, true);
  if (r) r.heights[local(r, cx, cy)] = value;
}

/** The regions something has been built on, in no particular order. */
export function builtRegions(map: WorldMap): Region[] {
  return [...map.regions.values()].filter((r) => r.built);
}

/** The built regions that touch a box of tiles. */
export function regionsIn(map: WorldMap, box: Box): Region[] {
  const out: Region[] = [];
  for (let ry = regionOf(box.y0); ry <= regionOf(box.y1); ry++) {
    for (let rx = regionOf(box.x0); rx <= regionOf(box.x1); rx++) {
      const r = map.regions.get(regionId(rx, ry));
      if (r?.built) out.push(r);
    }
  }
  return out;
}

/** The smallest box of tiles holding every built region, cut to the frame; null before anything is built. */
export function builtBounds(map: WorldMap): Box | null {
  let box: Box | null = null;
  for (const r of builtRegions(map)) {
    const b = regionBox(r);
    box = box ? boxOf(Math.min(box.x0, b.x0), Math.min(box.y0, b.y0), Math.max(box.x1, b.x1), Math.max(box.y1, b.y1)) : b;
  }
  if (!box) return null;
  return boxOf(
    Math.max(box.x0, map.originX), Math.max(box.y0, map.originY),
    Math.min(box.x1, map.originX + map.width - 1), Math.min(box.y1, map.originY + map.height - 1),
  );
}

/** The objects standing in a box of tiles. */
export function objectsIn(map: WorldMap, box: Box): MapObject[] {
  return map.objects.filter((o) => o.x >= box.x0 && o.x <= box.x1 && o.y >= box.y0 && o.y <= box.y1);
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

/** Whether a world tile is under a roof or a floor above: no sky, no outdoor light. */
export function isIndoors(map: WorldMap, x: number, y: number): boolean {
  return indoorsAt(map, x, y) > 0;
}

/** How many floors stand on a tile from this plane up; 0 outdoors. */
export function floorsAbove(map: WorldMap, x: number, y: number): number {
  return indoorsAt(map, x, y);
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
    if (overlayAt(map, tx, ty) === overlay) n++;
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
  const own = overlayAt(map, x, y);
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
