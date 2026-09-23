/** Nothing may stand on the tile (water, a trunk, a rock). */
export const BLOCKED = 1 << 0;
/** A wall runs along that edge of the tile. Each wall is flagged on BOTH tiles that share the edge. */
export const WALL_N = 1 << 1;
export const WALL_E = 1 << 2;
export const WALL_S = 1 << 3;
export const WALL_W = 1 << 4;

/** Edge of a tile: north, east, south, west. */
export type Side = 0 | 1 | 2 | 3;

/**
 * Movement flags for a rectangle of tiles, addressed in **absolute world tile coordinates** (PLAN §7.1):
 * the rectangle starts at (originX, originY) and runs `width` east and `height` north. x grows east, y
 * grows north. Anything outside the rectangle counts as blocked.
 */
export class CollisionMap {
  readonly width: number;
  readonly height: number;
  readonly originX: number;
  readonly originY: number;
  readonly flags: Uint8Array;

  constructor(width: number, height: number, originX = 0, originY = 0) {
    this.width = width;
    this.height = height;
    this.originX = originX;
    this.originY = originY;
    this.flags = new Uint8Array(width * height);
  }

  inBounds(x: number, y: number): boolean {
    const lx = x - this.originX, ly = y - this.originY;
    return lx >= 0 && ly >= 0 && lx < this.width && ly < this.height;
  }

  /** Index into `flags` for a world tile, or -1 when it is off the map. */
  index(x: number, y: number): number {
    const lx = x - this.originX, ly = y - this.originY;
    return lx >= 0 && ly >= 0 && lx < this.width && ly < this.height ? ly * this.width + lx : -1;
  }

  get(x: number, y: number): number {
    const i = this.index(x, y);
    return i < 0 ? BLOCKED : this.flags[i]!;
  }

  block(x: number, y: number): void {
    const i = this.index(x, y);
    if (i >= 0) this.flags[i]! |= BLOCKED;
  }

  unblock(x: number, y: number): void {
    const i = this.index(x, y);
    if (i >= 0) this.flags[i]! &= ~BLOCKED;
  }

  /** Puts a wall on one edge of (x, y), flagging the neighbour across that edge too. */
  addWall(x: number, y: number, side: Side): void {
    const [dx, dy, here, there] = WALL_SIDES[side]!;
    const a = this.index(x, y), b = this.index(x + dx, y + dy);
    if (a >= 0) this.flags[a]! |= here;
    if (b >= 0) this.flags[b]! |= there;
  }

  /** Takes a wall off one edge of (x, y), on both tiles that share it. */
  removeWall(x: number, y: number, side: Side): void {
    const [dx, dy, here, there] = WALL_SIDES[side]!;
    const a = this.index(x, y), b = this.index(x + dx, y + dy);
    if (a >= 0) this.flags[a]! &= ~here;
    if (b >= 0) this.flags[b]! &= ~there;
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
