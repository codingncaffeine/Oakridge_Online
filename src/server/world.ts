import { BLOCKED } from "../shared/collision.ts";
import { VIEW_DISTANCE } from "../shared/constants.ts";
import { lookFromSeed } from "../shared/look.ts";
import type { WorldMap } from "../shared/map.ts";
import { findPath, type Tile } from "../shared/pathfind.ts";
import type { EntityUpdate } from "../shared/protocol.ts";
import { hashString } from "../shared/rng.ts";

export interface Player {
  readonly id: number;
  readonly name: string;
  look: number[];
  /** The tick in which the look last changed, so viewers get the new one in that tick. */
  lookTick: number;
  x: number;
  y: number;
  run: boolean;
  path: Tile[];
  /** Latest walk request; the next tick turns it into a path. */
  walkTo: Tile | null;
  /** Tiles entered during the current tick. */
  moved: Tile[];
  /** Entity ids this player's client currently knows about. */
  readonly known: Set<number>;
}

/** Where a saved character may stand again: inside the map and not on a blocked tile. */
export function canStand(map: WorldMap, x: number, y: number): boolean {
  return Number.isInteger(x) && Number.isInteger(y) && map.collision.inBounds(x, y) && (map.collision.get(x, y) & BLOCKED) === 0;
}

/** Appearance for a player who didn't send one: picked from the name, so it stays the same. */
export function lookFor(name: string): number[] {
  return lookFromSeed(hashString(name.toLowerCase()));
}

export class World {
  readonly map: WorldMap;
  readonly players = new Map<number, Player>();
  tick = 0;
  private nextId = 1;

  constructor(map: WorldMap) {
    this.map = map;
  }

  /**
   * `look` must already be validated and normalized (see shared/look.ts). A saved position is used
   * when the character can still stand there; otherwise the player starts at the spawn.
   */
  add(name: string, look: number[] = lookFor(name), at?: { x: number; y: number }, run = false): Player {
    const start = at && canStand(this.map, at.x, at.y) ? at : this.map.spawn;
    const player: Player = {
      id: this.nextId++, name, look, lookTick: 0, x: start.x, y: start.y,
      run, path: [], walkTo: null, moved: [], known: new Set(),
    };
    this.players.set(player.id, player);
    return player;
  }

  setLook(player: Player, look: number[]): void {
    player.look = look;
    player.lookTick = this.tick + 1;
  }

  remove(id: number): void {
    this.players.delete(id);
  }

  walk(player: Player, x: number, y: number): void {
    player.walkTo = { x, y };
  }

  setRun(player: Player, on: boolean): void {
    player.run = on;
  }

  /** One tick: pending walk requests become paths, then everyone moves 1 tile, or 2 when running. */
  step(): void {
    this.tick++;
    const collision = this.map.collision;
    for (const p of this.players.values()) {
      if (p.walkTo) {
        p.path = findPath(collision, p.x, p.y, p.walkTo.x, p.walkTo.y);
        p.walkTo = null;
      }
      p.moved = [];
      const count = Math.min(p.path.length, p.run ? 2 : 1);
      for (let i = 0; i < count; i++) {
        const next = p.path[0]!;
        if (!collision.canStep(p.x, p.y, next.x - p.x, next.y - p.y)) {
          p.path = [];
          break;
        }
        p.path.shift();
        p.x = next.x;
        p.y = next.y;
        p.moved.push(next);
      }
    }
  }

  /** What p's client needs this tick: entities that came into view or moved, and ids that left view. */
  viewFor(p: Player): { ents: EntityUpdate[]; gone: number[] } {
    const ents: EntityUpdate[] = [];
    const inView = new Set<number>();
    for (const q of this.players.values()) {
      if (Math.max(Math.abs(q.x - p.x), Math.abs(q.y - p.y)) > VIEW_DISTANCE) continue;
      inView.add(q.id);
      const isNew = !p.known.has(q.id);
      const newLook = q.lookTick === this.tick;
      if (!isNew && q.moved.length === 0 && !newLook) continue;
      const update: EntityUpdate = { id: q.id, x: q.x, y: q.y };
      if (q.moved.length) update.steps = q.moved.map((t): [number, number] => [t.x, t.y]);
      if (isNew || newLook) update.look = q.look;
      if (isNew) {
        update.name = q.name;
        p.known.add(q.id);
      }
      ents.push(update);
    }
    const gone: number[] = [];
    for (const id of p.known) {
      if (!inView.has(id)) {
        gone.push(id);
        p.known.delete(id);
      }
    }
    return { ents, gone };
  }
}
