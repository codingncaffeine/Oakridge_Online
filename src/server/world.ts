import { LOOK_SIZES, VIEW_DISTANCE } from "../shared/constants.ts";
import type { WorldMap } from "../shared/map.ts";
import { findPath, type Tile } from "../shared/pathfind.ts";
import type { EntityUpdate } from "../shared/protocol.ts";
import { hashString } from "../shared/rng.ts";

export interface Player {
  readonly id: number;
  readonly name: string;
  readonly look: number[];
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

/** Appearance derived from the name until characters are designed at sign-up. */
export function lookFor(name: string): number[] {
  let h = hashString(name.toLowerCase());
  return LOOK_SIZES.map((choices) => {
    const pick = h % choices;
    h = Math.floor(h / choices);
    return pick;
  });
}

export class World {
  readonly map: WorldMap;
  readonly players = new Map<number, Player>();
  tick = 0;
  private nextId = 1;

  constructor(map: WorldMap) {
    this.map = map;
  }

  add(name: string): Player {
    const player: Player = {
      id: this.nextId++, name, look: lookFor(name), x: this.map.spawn.x, y: this.map.spawn.y,
      run: false, path: [], walkTo: null, moved: [], known: new Set(),
    };
    this.players.set(player.id, player);
    return player;
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
      if (!isNew && q.moved.length === 0) continue;
      const update: EntityUpdate = { id: q.id, x: q.x, y: q.y };
      if (q.moved.length) update.steps = q.moved.map((t): [number, number] => [t.x, t.y]);
      if (isNew) {
        update.name = q.name;
        update.look = q.look;
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
