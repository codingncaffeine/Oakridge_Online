// The tools a map is built with: terrain shaping, water, roads, scatter, and buildings. `oakridge.ts`
// authors the district with these; the seeded parts (wilderness, woods, quarry faces) work exactly as
// the test map's did, because a region of nowhere-in-particular should cost nothing to make.
import { BLOCKED, type Side } from "./collision.ts";
import {
  cornerHeight, frameMap, indoorsAt, isEdgeKind, OVERLAY_NONE, OVERLAY_PATH, OVERLAY_WATER, overlayAt, ROOF_CLAY, ROOF_KEEP, ROOF_SLATE, setCornerHeight,
  fixedId, regionId, regionOf, setIndoors, setOverlay, setRoof, setUnderlay, signId, tileIndex, tileRegion, UNDERLAY_DIRT,
  type Box, type FishingWater, type ItemSpawn, type MapObject, type MonsterSpawn, type ObjectKind, type Place,
  type RoofStyle, type SignIcon, type WorldMap, type WorldStack,
} from "./map.ts";
import type { Tile } from "./pathfind.ts";
import { mulberry32 } from "./rng.ts";
import { SHOPS } from "./shops.ts";

export type Point = readonly [number, number];

/** A box of world tiles lives in map.ts now (the regions are boxes too); it is still had from here. */
export { boxOf, type Box } from "./map.ts";

/**
 * How far a floor stands above the one below it, in tile units. The renderer's walls are this tall.
 * Measured against the reference (2026-09-24): a wall stands about a quarter taller than the people
 * beside it, who are 1.62 tall here.
 */
export const STOREY = 2.0;
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
  /**
   * The tiles this builder may write: a site's own box, so a road running off its edge or a scatter
   * beside it never spills onto the region next door, which stays unbuilt until its own site is
   * written. Null writes anywhere on the frame.
   */
  clip: Box | null = null;
  /** Ids handed out and then taken back, once the build was done with them (`openRailsToFishing`). */
  readonly retired: number[] = [];
  private nextId = 1;

  constructor(width: number, height: number, originX: number, originY: number, seed: number) {
    this.width = width;
    this.height = height;
    this.originX = originX;
    this.originY = originY;
    this.rand = mulberry32(seed);
  }

  /** The plane's map, made the first time it is asked for: a frame, with regions coming into being as they are built on. */
  plane(plane: number): WorldMap {
    let map = this.planes.get(plane);
    if (!map) {
      map = frameMap(this.width, this.height, this.originX, this.originY, plane);
      this.planes.set(plane, map);
    }
    return map;
  }

  /** A random whole number from 0 to n - 1. */
  pick(n: number): number {
    return Math.min(n - 1, Math.floor(this.rand() * n));
  }

  /** Whether a tile is inside the clip, or there is none. A corner may sit on the clip's far edge. */
  within(x: number, y: number, corner = false): boolean {
    const c = this.clip, past = corner ? 1 : 0;
    return !c || (x >= c.x0 && y >= c.y0 && x <= c.x1 + past && y <= c.y1 + past);
  }

  /** Puts an object on a plane, blocking its tile or flagging its edge, and gives it its id. */
  place(plane: number, kind: ObjectKind, x: number, y: number, extra: Partial<MapObject> = {}): MapObject | null {
    const map = this.plane(plane);
    // An object makes its region built, or a fence across otherwise untouched ground would stand on nothing.
    if (!this.within(x, y) || tileIndex(map, x, y) < 0 || !tileRegion(map, x, y)) return null;
    const o: MapObject = { id: this.nextId++, kind, x, y, plane, side: 0, variant: this.rand(), ...extra };
    map.objects.push(o);
    if (isEdgeKind(kind)) map.collision.addWall(x, y, o.side);
    else map.collision.block(x, y);
    return o;
  }

  /**
   * Hangs a trade's sign on a wall edge. Its id is the edge's (signId) and it draws no random number,
   * so a town gains its signs and every other object's id and every later roll stay as they were.
   */
  hangSign(plane: number, x: number, y: number, side: Side, icon: SignIcon): MapObject | null {
    const map = this.plane(plane);
    if (!this.within(x, y) || tileIndex(map, x, y) < 0 || !tileRegion(map, x, y)) return null;
    const o: MapObject = { id: signId(x, y, side), kind: "sign", x, y, plane, side, variant: 0.5, tag: icon };
    map.objects.push(o);
    map.collision.addWall(x, y, side);
    return o;
  }

  /**
   * Puts an object in after every roll: its id from where it stands (fixedId) and its turn from a hash of
   * the tile, so it draws no random number and every other object's id and every roll stay as they were.
   */
  placeFixed(plane: number, kind: ObjectKind, x: number, y: number, extra: Partial<MapObject> = {}): MapObject | null {
    const map = this.plane(plane);
    // Only on ground a site has already built: asking tileRegion would build the region, and a build without
    // that site would gain a scrap of it round the object.
    if (!this.within(x, y) || tileIndex(map, x, y) < 0 || !map.regions.get(regionId(regionOf(x), regionOf(y)))?.built) return null;
    const side = extra.side ?? 0, turn = (((x * 73856093) ^ (y * 19349663)) >>> 0) % 1000;
    const o: MapObject = { id: fixedId(x, y, plane, side), kind, x, y, plane, side, variant: turn / 1000, ...extra };
    map.objects.push(o);
    if (isEdgeKind(kind)) map.collision.addWall(x, y, side);
    else map.collision.block(x, y);
    return o;
  }

  /** Whether a tile on a plane is free of objects, water and walls. */
  free(plane: number, x: number, y: number): boolean {
    const map = this.plane(plane);
    return this.within(x, y) && tileIndex(map, x, y) >= 0 && (map.collision.get(x, y) & BLOCKED) === 0 && overlayAt(map, x, y) !== OVERLAY_WATER;
  }

  /** Reads and writes a tile's underlay, overlay and indoors flag in world coordinates. */
  setUnderlay(plane: number, x: number, y: number, value: number): void {
    if (this.within(x, y)) setUnderlay(this.plane(plane), x, y, value);
  }

  setOverlay(plane: number, x: number, y: number, value: number): void {
    if (this.within(x, y)) setOverlay(this.plane(plane), x, y, value);
  }

  overlayAt(plane: number, x: number, y: number): number {
    return overlayAt(this.plane(plane), x, y);
  }

  setIndoors(plane: number, x: number, y: number, value: number): void {
    if (this.within(x, y)) setIndoors(this.plane(plane), x, y, value);
  }

  setRoof(plane: number, x: number, y: number, value: number): void {
    if (this.within(x, y)) setRoof(this.plane(plane), x, y, value);
  }

  /** A tile corner's height, in world corner coordinates. */
  setHeight(plane: number, cx: number, cy: number, value: number): void {
    if (this.within(cx, cy, true)) setCornerHeight(this.plane(plane), cx, cy, value);
  }

  heightAtCorner(plane: number, cx: number, cy: number): number {
    return cornerHeight(this.plane(plane), cx, cy);
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
    return { planes: this.planes, spawn, name, retired: [...this.retired] };
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

/**
 * Where along a polyline a point falls: the distance to it, and how far along its length the nearest
 * point is (0 at the first point, 1 at the last). A stream's level is read off `t`, so its water
 * comes down from its source to its mouth.
 */
export function alongPolyline(px: number, py: number, points: ReadonlyArray<Point>): { d: number; t: number } {
  let best = Infinity, at = 0, walked = 0, total = 0;
  for (let i = 1; i < points.length; i++) total += Math.hypot(points[i]![0] - points[i - 1]![0], points[i]![1] - points[i - 1]![1]);
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1]!, [bx, by] = points[i]!;
    const abx = bx - ax, aby = by - ay;
    const len = Math.hypot(abx, aby);
    const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / (len * len)));
    const d = Math.hypot(px - ax - abx * t, py - ay - aby * t);
    if (d < best) {
      best = d;
      at = total === 0 ? 0 : (walked + t * len) / total;
    }
    walked += len;
  }
  return { d: best, t: at };
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
  /** What covers it: clay tile unless said otherwise (ROOF_* in map.ts). */
  roof?: RoofStyle;
  /**
   * A house has glazed windows; a keep has arrow slits. The walls are the same stone either way, and
   * the renderer tells them apart by the tag this puts on every wall and window.
   */
  style?: "house" | "keep";
  /**
   * How many storeys the ground floor's walls stand, when that is more than the floors it has: a tower
   * is two storeys of wall with nothing inside, and no stair up. Defaults to `storeys`.
   */
  height?: number;
  /** The trade's sign, hung outside beside the first door (see `sign`): a bank's scales, a smithy's anvil, an inn's tankard. */
  sign?: SignIcon;
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
  const roof = spec.roof ?? ROOF_CLAY;
  const tag = spec.style === "keep" ? "keep" : undefined;
  const walls = Math.max(storeys, spec.height ?? storeys);

  for (let s = 0; s < storeys; s++) {
    const plane = base + s;
    // A floor stands a storey above the one below, so an upper room is over the ground, not in it.
    b.level(plane, box, height + s * STOREY);
    // How many storeys of wall stand from this floor up: the ground floor of a two-storey house draws
    // its walls that tall, and its roof goes that much higher (the renderer reads this).
    const above = walls - s;
    for (let y = box.y0; y <= box.y1; y++) {
      for (let x = box.x0; x <= box.x1; x++) {
        if (spec.floor !== undefined) b.setUnderlay(plane, x, y, spec.floor);
        b.setOverlay(plane, x, y, OVERLAY_NONE);
        b.setIndoors(plane, x, y, above);
        b.setRoof(plane, x, y, roof);
      }
    }
    // South (side 2) and north (0) walls run east-west; west (3) and east (1) run north-south.
    for (let x = box.x0; x <= box.x1; x++) {
      wall(b, plane, x, box.y0, 2, doorAt.get(key(2, x - box.x0)), s === 0, above, tag);
      wall(b, plane, x, box.y1, 0, doorAt.get(key(0, x - box.x0)), s === 0, above, tag);
    }
    for (let y = box.y0; y <= box.y1; y++) {
      wall(b, plane, box.x0, y, 3, doorAt.get(key(3, y - box.y0)), s === 0, above, tag);
      wall(b, plane, box.x1, y, 1, doorAt.get(key(1, y - box.y0)), s === 0, above, tag);
    }
  }
  if (storeys > 1 && spec.stair) {
    for (let s = 0; s < storeys; s++) {
      const plane = base + s;
      if (s + 1 < storeys) b.place(plane, "stairs", spec.stair.x, spec.stair.y, { to: plane + 1 });
      if (s > 0) b.place(plane, "stairs", spec.stair.x, spec.stair.y, { to: plane - 1 });
    }
  }
  if (spec.sign && spec.doors.length > 0) sign(b, box, spec.doors[0]!, spec.sign, [...spec.doors, ...(spec.windows ?? [])], base);
}

/**
 * One length of wall: a door where the spec asks for one on the ground floor, a window, or plain wall.
 * Every one carries `tall`, the storeys of wall standing here: a door draws the stone over its lintel
 * up to the same height as the wall beside it, so nothing has to be stacked on top of it.
 */
function wall(
  b: WorldBuilder, plane: number, x: number, y: number, side: Side,
  what: "door" | "window" | undefined, ground: boolean, tall: number, tag: string | undefined,
): void {
  const kind: ObjectKind = what === "door" && ground ? "door" : what === "window" ? "wall_window" : "wall";
  b.place(plane, kind, x, y, tag === undefined ? { side, tall } : { side, tall, tag });
}

/**
 * A tower: two storeys of stone wall round a box nobody goes into, flat-roofed behind a parapet, with
 * arrow slits where asked. A keep's turrets, a church's bell tower, a gatehouse and the corners of a
 * city wall are all this.
 */
export function tower(b: WorldBuilder, box: Box, windows: DoorSpec[] = []): void {
  building(b, { box, doors: [], windows, floor: UNDERLAY_DIRT, height: 2, roof: ROOF_KEEP, style: "keep" });
}

/**
 * A fenced enclosure with a gap for a gate: what a farm pen and a stockade are made of. The gap gets a
 * timber field gate that swings, unless `leaf` is false and it is left open, as a yard off a street is.
 * (The heavy `gate` is a gatehouse's, hung in stone; in a fence line it reads as a house door.)
 */
export function fence(b: WorldBuilder, plane: number, box: Box, gate: Tile | null, kind: ObjectKind = "fence", leaf = true): void {
  for (let x = box.x0; x <= box.x1; x++) {
    if (!(gate && gate.x === x && gate.y === box.y0)) b.place(plane, kind, x, box.y0, { side: 2 });
    if (!(gate && gate.x === x && gate.y === box.y1)) b.place(plane, kind, x, box.y1, { side: 0 });
  }
  for (let y = box.y0; y <= box.y1; y++) {
    if (!(gate && gate.y === y && gate.x === box.x0)) b.place(plane, kind, box.x0, y, { side: 3 });
    if (!(gate && gate.y === y && gate.x === box.x1)) b.place(plane, kind, box.x1, y, { side: 1 });
  }
  if (gate && leaf) b.place(plane, "field_gate", gate.x, gate.y, { side: gate.y === box.y0 ? 2 : gate.y === box.y1 ? 0 : gate.x === box.x0 ? 3 : 1 });
}

/** How a town builds: the roof it puts on, and whether its walls are a house's or a keep's. Unsaid, a shop is clay-tiled and a bank slated. */
export interface TownLook {
  roof?: RoofStyle;
  style?: "house" | "keep";
}

/**
 * A trade's sign on the outside of a building, beside its door, where it reads from down the street: on
 * the first plain length of that wall next to the door, one side and then the other, never on a window
 * or a corner.
 */
export function sign(b: WorldBuilder, box: Box, door: DoorSpec, icon: SignIcon, openings: readonly DoorSpec[] = [], plane = 0): void {
  const across = door.side === 0 || door.side === 2;
  const length = across ? box.x1 - box.x0 : box.y1 - box.y0;
  const used = new Set(openings.filter((o) => o.side === door.side).map((o) => o.along));
  used.add(door.along);
  for (const along of [door.along + 1, door.along - 1, door.along + 2, door.along - 2]) {
    if (along < 1 || along > length - 1 || used.has(along)) continue;
    const x = across ? box.x0 + along : door.side === 1 ? box.x1 : box.x0;
    const y = across ? (door.side === 0 ? box.y1 : box.y0) : box.y0 + along;
    b.hangSign(plane, x, y, door.side, icon);
    return;
  }
}

/** A shop: the building, a row of counters along the wall opposite the door, the keeper behind them, and its trade's sign by the door. */
export function shop(b: WorldBuilder, box: Box, door: DoorSpec, tag: string, keeper: string, windows: DoorSpec[] = [], look: TownLook = {}): void {
  building(b, { box, doors: [door], windows, floor: UNDERLAY_DIRT, roof: look.roof, style: look.style, sign: SHOPS[tag]?.sign });
  // The counters run along the wall opposite the door; the keeper stands between them and it.
  const back = door.side === 2 ? box.y1 - 1 : door.side === 0 ? box.y0 + 1 : null;
  if (back !== null) {
    for (let x = box.x0 + 2; x <= box.x1 - 2; x++) b.place(0, "counter", x, back, { tag });
    b.spawnMonster({ monster: keeper, x: Math.round((box.x0 + box.x1) / 2), y: door.side === 2 ? box.y1 : box.y0 });
  } else {
    const x = door.side === 1 ? box.x0 + 1 : box.x1 - 1;
    for (let y = box.y0 + 2; y <= box.y1 - 2; y++) b.place(0, "counter", x, y, { tag });
    b.spawnMonster({ monster: keeper, x: door.side === 1 ? box.x0 : box.x1, y: Math.round((box.y0 + box.y1) / 2) });
  }
}

/** A bank: a slated building with a door in its south wall, its row of booths along the back wall, and two bankers behind them. */
export function bank(b: WorldBuilder, box: Box, door: DoorSpec, look: TownLook = {}): void {
  building(b, {
    box, doors: [door], windows: [{ side: door.side, along: 1 }, { side: door.side, along: box.x1 - box.x0 - 1 }], floor: UNDERLAY_DIRT,
    roof: look.roof ?? ROOF_SLATE, style: look.style, sign: "bank",
  });
  for (let x = box.x0 + 2; x <= box.x1 - 2; x++) b.place(0, "bank_booth", x, box.y1 - 1);
  b.spawnMonster({ monster: "banker", x: box.x0 + 3, y: box.y1 });
  b.spawnMonster({ monster: "banker", x: box.x1 - 3, y: box.y1 });
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

/** A wall on every edge of a box but the tiles in `skip`: a city's curtain, a hold's, with its towers and gates left out. */
export function curtain(b: WorldBuilder, box: Box, skip: readonly Box[]): void {
  const skipped = (x: number, y: number) => skip.some((s) => inBox(s, x, y));
  for (let x = box.x0; x <= box.x1; x++) {
    if (!skipped(x, box.y0)) b.place(0, "stone_wall", x, box.y0, { side: 2 });
    if (!skipped(x, box.y1)) b.place(0, "stone_wall", x, box.y1, { side: 0 });
  }
  for (let y = box.y0; y <= box.y1; y++) {
    if (!skipped(box.x0, y)) b.place(0, "stone_wall", box.x0, y, { side: 3 });
    if (!skipped(box.x1, y)) b.place(0, "stone_wall", box.x1, y, { side: 1 });
  }
}

// --- Walkable ways to the water ------------------------------------------------------------------

/**
 * Eases the ground along a way to a walkable grade: every corner within `half` of the line is brought to
 * the way's own height there — `from` at its first point, `to` at its last, straight between — and the
 * ground beside it blends back to its own over `fall` tiles more, so a cut or a fill has sloped sides
 * rather than walls. What a way down a bank to a jetty or a landing needs, where the bank would otherwise
 * drop like a cliff and read as somewhere nobody can go (the user's report, 2026-09-25). The corners of
 * water and of anything built stay as they are, and so does anything outside the clip; `from` and `to`
 * default to the ground's own height at the line's two ends. Heights only: nothing placed moves.
 */
export function easeAlong(b: WorldBuilder, line: readonly Point[], half: number, fall: number, to?: number, from?: number): void {
  const map = b.plane(0);
  const [sx, sy] = line[0]!, [ex, ey] = line.at(-1)!;
  const h0 = from ?? cornerHeight(map, Math.round(sx), Math.round(sy));
  const h1 = to ?? cornerHeight(map, Math.round(ex), Math.round(ey));
  const reach = half + fall;
  const xs = line.map(([x]) => x), ys = line.map(([, y]) => y);
  const x0 = Math.floor(Math.min(...xs) - reach), x1 = Math.ceil(Math.max(...xs) + reach);
  const y0 = Math.floor(Math.min(...ys) - reach), y1 = Math.ceil(Math.max(...ys) + reach);
  // A corner is kept if any tile round it is water or indoors: the river keeps its level and a floor stays flat.
  const kept = (cx: number, cy: number) =>
    [[cx - 1, cy - 1], [cx, cy - 1], [cx - 1, cy], [cx, cy]].some(([tx, ty]) => b.overlayAt(0, tx!, ty!) === OVERLAY_WATER || indoorsAt(map, tx!, ty!) > 0);
  // Worked out first and written after, so no corner's new height feeds its neighbour's.
  const writes: Array<readonly [number, number, number]> = [];
  for (let cy = y0; cy <= y1; cy++) {
    for (let cx = x0; cx <= x1; cx++) {
      const { d, t } = alongPolyline(cx, cy, line);
      if (d >= reach || kept(cx, cy)) continue;
      const h = cornerHeight(map, cx, cy);
      writes.push([cx, cy, h + (h0 + (h1 - h0) * t - h) * smoothstep(reach, half, d)]);
    }
  }
  for (const [cx, cy, h] of writes) b.setHeight(0, cx, cy, h);
}

/** A rail along a jetty or a berth, or a mole's low parapet: things a line is cast over. A wall of a house or a city is not. */
const castOver = (o: MapObject): boolean => o.kind === "fence" || (o.kind === "stone_wall" && o.tag === "mole");

/**
 * Opens a jetty's rail, or a mole's parapet, where a fishing spot lies beyond it. A spot is fished from a
 * tile beside it with nothing on the edge between, and a rail on every such edge left a spot nobody could
 * fish (the user's report, 2026-09-25: "fishing is impossible from that dock"). So wherever a spot's tile
 * has no open side, the first side of it that a player can stand on loses its length of rail. Run once the
 * whole world is built, after the last roll: taking a length of rail away then moves no id and no roll.
 */
export function openRailsToFishing(b: WorldBuilder): void {
  const STEP: ReadonlyArray<readonly [number, number]> = [[0, 1], [1, 0], [0, -1], [-1, 0]];
  for (const map of b.planes.values()) {
    if (map.fishing.length === 0) continue;
    // Every edge by one name, whichever of its two tiles an object was placed from.
    const edge = (x: number, y: number, side: number) => (side === 0 ? `${x},${y},n` : side === 1 ? `${x},${y},e` : side === 2 ? `${x},${y - 1},n` : `${x - 1},${y},e`);
    const onEdge = new Map<string, MapObject[]>();
    for (const o of map.objects) {
      if (!isEdgeKind(o.kind)) continue;
      const k = edge(o.x, o.y, o.side);
      onEdge.set(k, [...(onEdge.get(k) ?? []), o]);
    }
    const open = (x: number, y: number) => (map.collision.get(x, y) & BLOCKED) === 0;
    const gone = new Set<MapObject>();
    for (const water of map.fishing) {
      for (const t of water.tiles) {
        const sides = [0, 1, 2, 3] as const;
        if (sides.some((s) => open(t.x + STEP[s]![0], t.y + STEP[s]![1]) && !map.collision.wallBetween(t.x, t.y, STEP[s]![0], STEP[s]![1]))) continue;
        for (const s of sides) {
          const [dx, dy] = STEP[s]!;
          // Only an edge that holds nothing but rail: a wall that shares it keeps its hold on the edge.
          const on = onEdge.get(edge(t.x, t.y, s));
          if (!open(t.x + dx, t.y + dy) || !on?.length || !on.every(castOver)) continue;
          for (const o of on) gone.add(o);
          map.collision.removeWall(t.x, t.y, s);
          if (!map.collision.wallBetween(t.x, t.y, dx, dy)) break;
        }
      }
    }
    if (gone.size > 0) {
      const kept = map.objects.filter((o) => !gone.has(o));
      map.objects.length = 0;
      map.objects.push(...kept);
      for (const o of gone) b.retired.push(o.id);
    }
  }
}
