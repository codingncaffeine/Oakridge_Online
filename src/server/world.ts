import { BLOCKED } from "../shared/collision.ts";
import { VIEW_DISTANCE } from "../shared/constants.ts";
import { energyRegen, MAX_ENERGY, runDrain } from "../shared/energy.ts";
import { ITEM_BY_ID, ITEM_BY_KEY, VISIBLE_GEAR, type EquipSlot, type Stack } from "../shared/items.ts";
import { lookFromSeed } from "../shared/look.ts";
import type { WorldMap } from "../shared/map.ts";
import { CANT_REACH, NO_ROOM } from "../shared/messages.ts";
import { findPath, type Tile } from "../shared/pathfind.ts";
import type { EntityUpdate, GroundItemView } from "../shared/protocol.ts";
import { hashString } from "../shared/rng.ts";
import {
  addItem, canHold, emptyInventory, equipFrom, swapSlots, takeFrom, unequip, weightOf, type Equipment, type Inventory,
} from "./inventory.ts";

/** A dropped item is the dropper's alone for 60 s, then everyone's; it's gone at 180 s. In ticks: */
export const PRIVATE_TICKS = 100;
export const LIFETIME_TICKS = 300;

export type Action = { kind: "take"; uid: number };

export interface Player {
  readonly id: number;
  readonly name: string;
  look: number[];
  /** The tick in which the look last changed, so viewers get the new one in that tick. */
  lookTick: number;
  /** The same for worn equipment. */
  gearTick: number;
  x: number;
  y: number;
  run: boolean;
  /** Run energy in units (0–10,000). */
  energy: number;
  inventory: Inventory;
  equipment: Equipment;
  /** Kilograms carried and worn, kept current as items move. */
  weight: number;
  path: Tile[];
  /** Latest walk request; the next tick turns it into a path. */
  walkTo: Tile | null;
  /** What the player is walking over to do. */
  action: Action | null;
  /** Tiles entered during the current tick. */
  moved: Tile[];
  /** Entity ids and ground-item uids this player's client currently knows about. */
  readonly known: Set<number>;
  readonly knownItems: Set<number>;
  /** Game messages for this player, sent and cleared each tick. */
  messages: string[];
  invDirty: boolean;
  equipDirty: boolean;
}

export interface GroundItem {
  uid: number;
  id: number;
  count: number;
  x: number;
  y: number;
  /** Whose it is while still private (a player name), or null for world items and public drops. */
  owner: string | null;
  publicTick: number;
  despawnTick: number;
  /** Which map spawn it came from; it comes back after being taken. */
  spawn: number | null;
}

export interface PlayerState {
  at?: { x: number; y: number };
  run?: boolean;
  energy?: number;
  inventory?: Inventory;
  equipment?: Equipment;
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
  readonly ground = new Map<number, GroundItem>();
  tick = 0;
  private nextId = 1;
  private nextUid = 1;
  private readonly respawns: Array<{ spawn: number; tick: number }> = [];

  constructor(map: WorldMap) {
    this.map = map;
    map.spawns.forEach((_, i) => this.placeSpawn(i));
  }

  /**
   * `look` must already be validated and normalized (see shared/look.ts). A saved position is used
   * when the character can still stand there; otherwise the player starts at the spawn.
   */
  add(name: string, look: number[] = lookFor(name), state: PlayerState = {}): Player {
    const start = state.at && canStand(this.map, state.at.x, state.at.y) ? state.at : this.map.spawn;
    const inventory = state.inventory ?? emptyInventory(), equipment = state.equipment ?? {};
    const player: Player = {
      id: this.nextId++, name, look, lookTick: 0, gearTick: 0, x: start.x, y: start.y,
      run: state.run ?? false, energy: state.energy ?? MAX_ENERGY, inventory, equipment, weight: weightOf(inventory, equipment),
      path: [], walkTo: null, action: null, moved: [], known: new Set(), knownItems: new Set(), messages: [],
      invDirty: true, equipDirty: true,
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
    player.action = null;
  }

  setRun(player: Player, on: boolean): void {
    player.run = on;
  }

  // --- Items -------------------------------------------------------------------------------

  canSee(p: Player, it: GroundItem): boolean {
    return it.owner === null || it.owner === p.name || this.tick >= it.publicTick;
  }

  /** Walks over to a ground item and picks it up on arrival. */
  take(p: Player, uid: number): void {
    const it = this.ground.get(uid);
    if (!it || !this.canSee(p, it)) return;
    p.walkTo = { x: it.x, y: it.y };
    p.action = { kind: "take", uid };
  }

  drop(p: Player, slot: number): void {
    const s = takeFrom(p.inventory, slot);
    if (!s) return;
    this.itemsChanged(p, false);
    this.putDown(s, p.x, p.y, p.name);
  }

  /**
   * Leaves a stack on the ground. A stackable item joins the same owner's pile of it on that tile; the
   * joined pile gets a new uid, so every viewer is told the old one is gone and sees the new count.
   */
  putDown(s: Stack, x: number, y: number, owner: string | null): void {
    let count = s.count;
    if (ITEM_BY_ID.get(s.id)?.stackable) {
      for (const it of this.ground.values()) {
        if (it.x === x && it.y === y && it.id === s.id && it.owner === owner && it.spawn === null) {
          count += it.count;
          this.ground.delete(it.uid);
          break;
        }
      }
    }
    const uid = this.nextUid++;
    this.ground.set(uid, {
      uid, id: s.id, count, x, y, owner, publicTick: this.tick + PRIVATE_TICKS, despawnTick: this.tick + LIFETIME_TICKS, spawn: null,
    });
  }

  swap(p: Player, from: number, to: number): void {
    swapSlots(p.inventory, from, to);
    p.invDirty = true;
  }

  equip(p: Player, slot: number): void {
    const err = equipFrom(p.inventory, p.equipment, slot);
    if (err) p.messages.push(err);
    else this.itemsChanged(p, true);
  }

  unequip(p: Player, where: EquipSlot): void {
    const err = unequip(p.inventory, p.equipment, where);
    if (err) p.messages.push(err);
    else this.itemsChanged(p, true);
  }

  private itemsChanged(p: Player, gear: boolean): void {
    p.invDirty = true;
    if (gear) {
      p.equipDirty = true;
      p.gearTick = this.tick + 1;
    }
    p.weight = weightOf(p.inventory, p.equipment);
  }

  private placeSpawn(i: number): void {
    const s = this.map.spawns[i]!;
    const def = ITEM_BY_KEY.get(s.item);
    if (!def) return;
    const uid = this.nextUid++;
    this.ground.set(uid, { uid, id: def.id, count: s.count, x: s.x, y: s.y, owner: null, publicTick: 0, despawnTick: Infinity, spawn: i });
  }

  /** Item ids worn in VISIBLE_GEAR order (0 for nothing), as other players draw them. */
  gearOf(p: Player): number[] {
    return VISIBLE_GEAR.map((where) => p.equipment[where]?.id ?? 0);
  }

  // --- The tick ----------------------------------------------------------------------------

  /** One tick: pending walks become paths, everyone moves 1 tile (2 running), actions resolve, items age. */
  step(): void {
    this.tick++;
    const collision = this.map.collision;
    for (const p of this.players.values()) {
      if (p.walkTo) {
        p.path = findPath(collision, p.x, p.y, p.walkTo.x, p.walkTo.y);
        p.walkTo = null;
      }
      p.moved = [];
      const count = Math.min(p.path.length, p.run && p.energy > 0 ? 2 : 1);
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
      // Only a tick spent running (two tiles) costs energy; any other tick restores it. Agility is 1 until skills exist.
      if (p.moved.length === 2) {
        p.energy = Math.max(0, p.energy - runDrain(p.weight, 1));
        if (p.energy === 0) p.run = false;
      } else {
        p.energy = Math.min(MAX_ENERGY, p.energy + energyRegen(1));
      }
      this.resolveAction(p);
    }
    for (const [uid, it] of this.ground) if (this.tick >= it.despawnTick) this.ground.delete(uid);
    for (let i = this.respawns.length - 1; i >= 0; i--) {
      if (this.tick >= this.respawns[i]!.tick) {
        this.placeSpawn(this.respawns[i]!.spawn);
        this.respawns.splice(i, 1);
      }
    }
  }

  private resolveAction(p: Player): void {
    const a = p.action;
    if (!a) return;
    const it = this.ground.get(a.uid);
    if (!it || !this.canSee(p, it)) {
      p.action = null;
      return;
    }
    if (p.x === it.x && p.y === it.y) {
      p.action = null;
      if (!canHold(p.inventory, it.id, it.count)) {
        p.messages.push(NO_ROOM);
        return;
      }
      addItem(p.inventory, it.id, it.count);
      this.ground.delete(it.uid);
      if (it.spawn !== null) this.respawns.push({ spawn: it.spawn, tick: this.tick + this.map.spawns[it.spawn]!.respawn });
      this.itemsChanged(p, false);
      return;
    }
    if (p.path.length === 0 && !p.walkTo) {
      p.action = null;
      p.messages.push(CANT_REACH);
    }
  }

  /** What p's client needs this tick: entities and ground items that came into view or changed, and what left. */
  viewFor(p: Player): { ents: EntityUpdate[]; gone: number[]; itemsAdd: GroundItemView[]; itemsGone: number[] } {
    const ents: EntityUpdate[] = [];
    const inView = new Set<number>();
    const near = (x: number, y: number) => Math.max(Math.abs(x - p.x), Math.abs(y - p.y)) <= VIEW_DISTANCE;
    for (const q of this.players.values()) {
      if (!near(q.x, q.y)) continue;
      inView.add(q.id);
      const isNew = !p.known.has(q.id);
      const newLook = q.lookTick === this.tick, newGear = q.gearTick === this.tick;
      if (!isNew && q.moved.length === 0 && !newLook && !newGear) continue;
      const update: EntityUpdate = { id: q.id, x: q.x, y: q.y };
      if (q.moved.length) update.steps = q.moved.map((t): [number, number] => [t.x, t.y]);
      if (isNew || newLook) update.look = q.look;
      if (isNew || newGear) update.gear = this.gearOf(q);
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

    const itemsAdd: GroundItemView[] = [], itemsGone: number[] = [], seen = new Set<number>();
    for (const it of this.ground.values()) {
      if (!near(it.x, it.y) || !this.canSee(p, it)) continue;
      seen.add(it.uid);
      if (!p.knownItems.has(it.uid)) {
        itemsAdd.push({ uid: it.uid, id: it.id, count: it.count, x: it.x, y: it.y });
        p.knownItems.add(it.uid);
      }
    }
    for (const uid of p.knownItems) {
      if (!seen.has(uid)) {
        itemsGone.push(uid);
        p.knownItems.delete(uid);
      }
    }
    return { ents, gone, itemsAdd, itemsGone };
  }
}
