/** Nothing may stand on the tile (water, a trunk, a rock). */
export const BLOCKED = 1 << 0;
/** A wall runs along that edge of the tile. Each wall is flagged on BOTH tiles that share the edge. */
export const WALL_N = 1 << 1;
export const WALL_E = 1 << 2;
export const WALL_S = 1 << 3;
export const WALL_W = 1 << 4;

/** Edge of a tile: north, east, south, west. */
export type Side = 0 | 1 | 2 | 3;

/** Tiles along one side of a region; the same as `REGION` in map.ts, kept here so this file stands alone. */
const REGION = 64;

/**
 * Movement flags for a rectangle of tiles, addressed in **absolute world tile coordinates** (PLAN §7.1):
 * the rectangle starts at (originX, originY) and runs `width` east and `height` north. x grows east, y
 * grows north. Anything outside the rectangle counts as blocked, and so does any 64×64 region inside it
 * that nothing has been written to: the flags are held per region, made the first time one is set, so
 * a frame of 660 regions costs only what has been built on it (Phase 12).
 */
export class CollisionMap {
  readonly width: number;
  readonly height: number;
  readonly originX: number;
  readonly originY: number;
  /** Flags per region, keyed by `rx * 256 + ry`, 64 × 64 a region: only the regions something was written to. */
  readonly regions = new Map<number, Uint8Array>();

  constructor(width: number, height: number, originX = 0, originY = 0) {
    this.width = width;
    this.height = height;
    this.originX = originX;
    this.originY = originY;
  }

  /** A map whose every tile is open ground: a fixture for the pathfinder. The world's maps come from map.ts. */
  static open(width: number, height: number, originX = 0, originY = 0): CollisionMap {
    const map = new CollisionMap(width, height, originX, originY);
    for (let y = originY; y < originY + height; y += REGION) for (let x = originX; x < originX + width; x += REGION) map.touch(x, y);
    return map;
  }

  inBounds(x: number, y: number): boolean {
    const lx = x - this.originX, ly = y - this.originY;
    return lx >= 0 && ly >= 0 && lx < this.width && ly < this.height;
  }

  /** Brings the region holding (x, y) into being, open: what building any tile of it does. */
  touch(x: number, y: number): void {
    this.flagsFor(x, y);
  }

  get(x: number, y: number): number {
    if (!this.inBounds(x, y)) return BLOCKED;
    const r = this.regions.get(Math.floor(x / REGION) * 256 + Math.floor(y / REGION));
    return r ? r[(y - Math.floor(y / REGION) * REGION) * REGION + (x - Math.floor(x / REGION) * REGION)]! : BLOCKED;
  }

  /** The flags of the region holding (x, y), made if need be, and the tile's place in them; null off the map. */
  private flagsFor(x: number, y: number): { flags: Uint8Array; i: number } | null {
    if (!this.inBounds(x, y)) return null;
    const rx = Math.floor(x / REGION), ry = Math.floor(y / REGION);
    const key = rx * 256 + ry;
    let flags = this.regions.get(key);
    if (!flags) {
      flags = new Uint8Array(REGION * REGION);
      this.regions.set(key, flags);
    }
    return { flags, i: (y - ry * REGION) * REGION + (x - rx * REGION) };
  }

  block(x: number, y: number): void {
    const at = this.flagsFor(x, y);
    if (at) at.flags[at.i]! |= BLOCKED;
  }

  unblock(x: number, y: number): void {
    const at = this.flagsFor(x, y);
    if (at) at.flags[at.i]! &= ~BLOCKED;
  }

  /** Puts a wall on one edge of (x, y), flagging the neighbour across that edge too. */
  addWall(x: number, y: number, side: Side): void {
    const [dx, dy, here, there] = WALL_SIDES[side]!;
    const a = this.flagsFor(x, y), b = this.flagsFor(x + dx, y + dy);
    if (a) a.flags[a.i]! |= here;
    if (b) b.flags[b.i]! |= there;
  }

  /** Takes a wall off one edge of (x, y), on both tiles that share it. */
  removeWall(x: number, y: number, side: Side): void {
    const [dx, dy, here, there] = WALL_SIDES[side]!;
    const a = this.flagsFor(x, y), b = this.flagsFor(x + dx, y + dy);
    if (a) a.flags[a.i]! &= ~here;
    if (b) b.flags[b.i]! &= ~there;
  }

  /** Can something standing on (x, y) take one step of (dx, dy), each in -1..1? */
  canStep(x: number, y: number, dx: number, dy: number): boolean {
    if (dx === 0 && dy === 0) return false;
    if (dx === 0 || dy === 0) return this.canStepStraight(x, y, dx, dy);
    // A diagonal needs both L-shaped routes around the corner open, so walls and blocked tiles can't be cut.
    return this.canStepStraight(x, y, dx, 0) && this.canStepStraight(x + dx, y, 0, dy)
      && this.canStepStraight(x, y, 0, dy) && this.canStepStraight(x, y + dy, dx, 0);
  }

  /** Is there a wall on the edge between (x, y) and its straight neighbour (x + dx, y + dy)? */
  wallBetween(x: number, y: number, dx: number, dy: number): boolean {
    const here = this.get(x, y), there = this.get(x + dx, y + dy);
    if (dx === 1) return (here & WALL_E) !== 0 || (there & WALL_W) !== 0;
    if (dx === -1) return (here & WALL_W) !== 0 || (there & WALL_E) !== 0;
    if (dy === 1) return (here & WALL_N) !== 0 || (there & WALL_S) !== 0;
    return (here & WALL_S) !== 0 || (there & WALL_N) !== 0;
  }

  private canStepStraight(x: number, y: number, dx: number, dy: number): boolean {
    return (this.get(x + dx, y + dy) & BLOCKED) === 0 && !this.wallBetween(x, y, dx, dy);
  }
}

/** Per side: offset to the neighbour across the edge, this tile's flag, the neighbour's flag. */
const WALL_SIDES: ReadonlyArray<readonly [number, number, number, number]> = [
  [0, 1, WALL_N, WALL_S],
  [1, 0, WALL_E, WALL_W],
  [0, -1, WALL_S, WALL_N],
  [-1, 0, WALL_W, WALL_E],
];
