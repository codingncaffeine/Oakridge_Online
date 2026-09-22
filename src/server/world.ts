import { BLOCKED } from "../shared/collision.ts";
import { VIEW_DISTANCE } from "../shared/constants.ts";
import { energyRegen, MAX_ENERGY, runDrain } from "../shared/energy.ts";
import {
  METHODS, NET_CATCH, RESOURCES, SPOT_MOVE, tierValue, TOOLS, type MethodName, type ToolKind, type Yield,
} from "../shared/gathering.ts";
import { ITEM_BY_ID, ITEM_BY_KEY, VISIBLE_GEAR, type EquipSlot, type Stack } from "../shared/items.ts";
import { lookFromSeed } from "../shared/look.ts";
import { solidObjects, type MapObject, type WorldMap } from "../shared/map.ts";
import {
  CANT_REACH, GATHER_START, gotItem, levelUp, NEED_TOOL, needLevel, NO_ROOM, NOTHING_COMES, PACK_FULL, toolNeedsLevel,
} from "../shared/messages.ts";
import { findPath, findPathTo, reaches, type Rect, type Tile } from "../shared/pathfind.ts";
import type { ActView, EntityUpdate, GroundItemView, SoundCue, SpotView } from "../shared/protocol.ts";
import { hashString } from "../shared/rng.ts";
import { levelForXp, MAX_XP, noXp, SKILL_NAME, successChance, type SkillKey } from "../shared/skills.ts";
import {
  addItem, canHold, emptyInventory, equipFrom, swapSlots, takeFrom, unequip, weightOf, type Equipment, type Inventory,
} from "./inventory.ts";

/** A dropped item is the dropper's alone for 60 s, then everyone's; it's gone at 180 s. In ticks: */
export const PRIVATE_TICKS = 100;
export const LIFETIME_TICKS = 300;

/** What a gathering action works: a map object (by id) or a fishing spot (by id). */
export type GatherTarget = { kind: "object"; id: number } | { kind: "spot"; id: number };

export type Action =
  | { kind: "take"; uid: number }
  /** Going to an object to gather from it, or to use an inventory item on it (the slot, and the item it held). */
  | { kind: "object"; id: number; use: { slot: number; item: number } | null }
  | { kind: "spot"; id: number };

/** A gathering action under way, and the tick of its next roll. */
export interface Gathering {
  method: MethodName;
  target: GatherTarget;
  nextRoll: number;
}

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
  /** XP per skill, in tenths. */
  xp: Record<SkillKey, number>;
  /** Skills whose XP grew since this player's client last heard. */
  readonly xpChanged: Set<SkillKey>;
  path: Tile[];
  /** Latest walk request; the next tick turns it into a path. */
  walkTo: Tile | null;
  /** The same for walking up to an object or a fishing spot. */
  approach: Rect | null;
  /** What the player is walking over to do. */
  action: Action | null;
  gathering: Gathering | null;
  /** The skill action other players see, and the tick it last changed. */
  act: ActView | null;
  actTick: number;
  /** The tick of the last level-up, when everyone nearby sees fireworks. */
  fxTick: number;
  /** Tiles entered during the current tick. */
  moved: Tile[];
  /** Entity ids and ground-item uids this player's client currently knows about. */
  readonly known: Set<number>;
  readonly knownItems: Set<number>;
  /** Game messages for this player, sent and cleared each tick. */
  messages: string[];
  /** Sounds for what this player just did, sent and cleared each tick. */
  sounds: SoundCue[];
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

/** A fishing spot: on one of its water's tiles until the tick it moves. */
export interface Spot {
  readonly id: number;
  readonly water: number;
  x: number;
  y: number;
  moveAt: number;
}

export interface PlayerState {
  at?: { x: number; y: number };
  run?: boolean;
  energy?: number;
  inventory?: Inventory;
  equipment?: Equipment;
  xp?: Record<SkillKey, number>;
}

/** Where a saved character may stand again: inside the map and not on a blocked tile. */
export function canStand(map: WorldMap, x: number, y: number): boolean {
  return Number.isInteger(x) && Number.isInteger(y) && map.collision.inBounds(x, y) && (map.collision.get(x, y) & BLOCKED) === 0;
}

/** Appearance for a player who didn't send one: picked from the name, so it stays the same. */
export function lookFor(name: string): number[] {
  return lookFromSeed(hashString(name.toLowerCase()));
}

const oneTile = (x: number, y: number): Rect => ({ x, y, w: 1, h: 1 });

/** Equipment that goes in a hand sounds of metal and leather straps; everything else sounds of cloth. */
const heldInHand = (where: EquipSlot) => where === "weapon" || where === "shield";

export class World {
  readonly map: WorldMap;
  readonly players = new Map<number, Player>();
  readonly ground = new Map<number, GroundItem>();
  /** Objects that ran out (felled trees, empty rocks), with the tick each comes back. */
  readonly depleted = new Map<number, number>();
  readonly spots: Spot[] = [];
  tick = 0;
  /** This tick's changes that every client hears about: objects that ran out (1) or came back (0), spots that moved. */
  objectChanges: Array<[number, 0 | 1]> = [];
  spotChanges: SpotView[] = [];
  private nextId = 1;
  private nextUid = 1;
  private readonly respawns: Array<{ spawn: number; tick: number }> = [];
  /** Random numbers in [0, 1): Math.random, or a fixed stand-in for tests. */
  private readonly rand: () => number;
  private readonly solid: Map<number, MapObject>;
  /** Ticks of chopping left before a tree can fall, for trees with a timer that isn't full. */
  private readonly life = new Map<number, number>();
  /** The last tick each tree was chopped. */
  private readonly choppedAt = new Map<number, number>();
  private stepping = false;

  constructor(map: WorldMap, rand: () => number = Math.random) {
    this.map = map;
    this.rand = rand;
    this.solid = solidObjects(map);
    map.spawns.forEach((_, i) => this.placeSpawn(i));
    map.fishing.forEach((water, w) => {
      const free = [...water.tiles];
      for (let n = 0; n < water.count && free.length > 0; n++) {
        const [t] = free.splice(this.pick(free.length), 1);
        this.spots.push({ id: this.spots.length, water: w, x: t!.x, y: t!.y, moveAt: this.between(SPOT_MOVE) });
      }
    });
  }

  /** A random whole number from 0 to n - 1. */
  private pick(n: number): number {
    return Math.min(n - 1, Math.floor(this.rand() * n));
  }

  /** A random whole number of ticks from `lo` to `hi`. */
  private between([lo, hi]: readonly [number, number]): number {
    return lo + this.pick(hi - lo + 1);
  }

  /** The tick in which viewers see a change made now: this one while it runs, otherwise the next. */
  private get seenTick(): number {
    return this.stepping ? this.tick : this.tick + 1;
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
      xp: state.xp ?? noXp(), xpChanged: new Set(),
      path: [], walkTo: null, approach: null, action: null, gathering: null, act: null, actTick: 0, fxTick: 0,
      moved: [], known: new Set(), knownItems: new Set(), messages: [], sounds: [], invDirty: true, equipDirty: true,
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
    this.stopGathering(player);
    player.walkTo = { x, y };
    player.approach = null;
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
    this.stopGathering(p);
    p.walkTo = { x: it.x, y: it.y };
    p.approach = null;
    p.action = { kind: "take", uid };
  }

  drop(p: Player, slot: number): void {
    const s = takeFrom(p.inventory, slot);
    if (!s) return;
    p.sounds.push("drop");
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
    const going = ITEM_BY_ID.get(p.inventory[slot]?.id ?? 0)?.equip?.slot;
    const err = equipFrom(p.inventory, p.equipment, slot);
    if (err) {
      p.messages.push(err);
      return;
    }
    if (going) p.sounds.push(heldInHand(going) ? "wield" : "wear");
    this.itemsChanged(p, true);
  }

  unequip(p: Player, where: EquipSlot): void {
    const worn = p.equipment[where] !== undefined;
    const err = unequip(p.inventory, p.equipment, where);
    if (err) {
      p.messages.push(err);
      return;
    }
    if (worn) p.sounds.push(heldInHand(where) ? "wield" : "wear");
    this.itemsChanged(p, true);
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

  // --- Objects, fishing spots and gathering ---------------------------------------------------

  /** Walks up to the object on (x, y): to use the item in `useSlot` on it, or else to gather from it. */
  interact(p: Player, x: number, y: number, useSlot: number | null = null): void {
    if (!this.map.collision.inBounds(x, y)) return;
    const o = this.solid.get(y * this.map.width + x);
    if (!o) return;
    let use: { slot: number; item: number } | null = null;
    if (useSlot !== null) {
      const s = p.inventory[useSlot];
      if (!s) return;
      use = { slot: useSlot, item: s.id };
    } else if (!RESOURCES[o.kind] || this.depleted.has(o.id)) {
      return;
    }
    this.stopGathering(p);
    p.walkTo = null;
    p.approach = oneTile(o.x, o.y);
    p.action = { kind: "object", id: o.id, use };
  }

  /** Walks up to a fishing spot and fishes it. */
  fish(p: Player, id: number): void {
    const s = this.spots[id];
    if (!s) return;
    this.stopGathering(p);
    p.walkTo = null;
    p.approach = oneTile(s.x, s.y);
    p.action = { kind: "spot", id };
  }

  /** What newcomers need: every object that has run out, and where the fishing spots are. */
  worldView(): { depleted: number[]; spots: SpotView[] } {
    return { depleted: [...this.depleted.keys()], spots: this.spots.map(({ id, x, y }) => ({ id, x, y })) };
  }

  private stopGathering(p: Player): void {
    if (!p.gathering) return;
    p.gathering = null;
    this.setAct(p, null);
  }

  private setAct(p: Player, act: ActView | null): void {
    const a = p.act;
    const same = act === null ? a === null : a !== null && a.anim === act.anim && a.tool === act.tool && a.x === act.x && a.y === act.y;
    if (same) return;
    p.act = act;
    p.actTick = this.seenTick;
  }

  private yieldsOf(target: GatherTarget): readonly Yield[] {
    return target.kind === "spot" ? NET_CATCH : [RESOURCES[this.map.objects[target.id]!.kind]!.yields];
  }

  private hasRoomFor(p: Player, yields: readonly Yield[]): boolean {
    return yields.some((y) => canHold(p.inventory, ITEM_BY_KEY.get(y.item)!.id, 1));
  }

  /** The best tool of a kind the player wields or carries and has the level for, or else what to tell them. */
  private toolFor(p: Player, kind: ToolKind, skill: SkillKey, level: number): { id: number; tier: number } | string {
    const tools = TOOLS[kind];
    const has = (id: number) => p.equipment.weapon?.id === id || p.inventory.some((s) => s?.id === id);
    let tooHard: { name: string; level: number } | null = null;
    for (let tier = tools.length - 1; tier >= 0; tier--) {
      const t = tools[tier]!, def = ITEM_BY_KEY.get(t.item)!;
      if (!has(def.id)) continue;
      if (level >= t.level) return { id: def.id, tier };
      if (!tooHard || t.level < tooHard.level) tooHard = { name: def.name, level: t.level };
    }
    return tooHard ? toolNeedsLevel(tooHard.name, SKILL_NAME[skill], tooHard.level) : NEED_TOOL[kind];
  }

  /** Arrived beside the target: checks the level, the tool and the room, then starts rolling. */
  private startGathering(p: Player, method: MethodName, target: GatherTarget, at: Rect, noun: string): void {
    const m = METHODS[method];
    const yields = this.yieldsOf(target);
    const level = levelForXp(p.xp[m.skill]);
    const easiest = Math.min(...yields.map((y) => y.level));
    if (level < easiest) {
      p.messages.push(needLevel(SKILL_NAME[m.skill], easiest, noun));
      return;
    }
    const tool = this.toolFor(p, m.tool, m.skill, level);
    if (typeof tool === "string") {
      p.messages.push(tool);
      return;
    }
    if (!this.hasRoomFor(p, yields)) {
      p.messages.push(PACK_FULL);
      return;
    }
    p.gathering = { method, target, nextRoll: this.tick + tierValue(m.ticks, tool.tier) };
    p.messages.push(GATHER_START[method]);
    this.setAct(p, { anim: method, tool: tool.id, x: at.x, y: at.y });
  }

  /** One tick of gathering: a tree's timer runs while it's chopped, and on the roll's tick the roll happens. */
  private gather(p: Player): void {
    const g = p.gathering!;
    const m = METHODS[g.method];
    if (g.method === "chop" && g.target.kind === "object") this.chopping(g.target.id);
    if (this.tick < g.nextRoll) return;
    const level = levelForXp(p.xp[m.skill]);
    const tool = this.toolFor(p, m.tool, m.skill, level);
    if (typeof tool === "string") {
      p.messages.push(tool);
      this.stopGathering(p);
      return;
    }
    const yields = this.yieldsOf(g.target);
    if (!this.hasRoomFor(p, yields)) {
      p.messages.push(PACK_FULL);
      this.stopGathering(p);
      return;
    }
    g.nextRoll = this.tick + tierValue(m.ticks, tool.tier);
    if (p.act) this.setAct(p, { ...p.act, tool: tool.id });
    const boost = tierValue(m.boost, tool.tier);
    // Tried in order, highest level first; each one the player can get has its own roll.
    const got = yields.find((y) => level >= y.level && this.rand() < successChance(y.low * boost, y.high * boost, level));
    if (!got) return;
    const def = ITEM_BY_KEY.get(got.item)!;
    addItem(p.inventory, def.id, 1);
    this.itemsChanged(p, false);
    p.messages.push(gotItem(g.method, def.name));
    this.giveXp(p, m.skill, got.xp);
    if (g.target.kind === "object") this.yielded(g.target.id);
  }

  /** Counts a tick of chopping against a tree's timer, once per tick however many are chopping it. */
  private chopping(id: number): void {
    if (this.choppedAt.get(id) === this.tick) return;
    this.choppedAt.set(id, this.tick);
    const life = RESOURCES[this.map.objects[id]!.kind]!.life;
    if (life > 0) this.life.set(id, Math.max(0, (this.life.get(id) ?? life) - 1));
  }

  /** After an object gives something: it runs out (a tree only once its timer is spent) and everyone working it stops. */
  private yielded(id: number): void {
    const def = RESOURCES[this.map.objects[id]!.kind]!;
    if (def.life > 0 && (this.life.get(id) ?? def.life) > 0) return;
    this.life.delete(id);
    this.depleted.set(id, this.tick + this.between(def.respawn));
    this.objectChanges.push([id, 1]);
    for (const q of this.players.values()) {
      if (q.gathering?.target.kind === "object" && q.gathering.target.id === id) this.stopGathering(q);
    }
  }

  /** Trees nobody chopped this tick win back a tick of their timer. */
  private regrowTrees(): void {
    for (const [id, left] of this.life) {
      if (this.choppedAt.get(id) === this.tick) continue;
      const full = RESOURCES[this.map.objects[id]!.kind]!.life;
      if (left + 1 >= full) this.life.delete(id);
      else this.life.set(id, left + 1);
    }
  }

  /** Moves a spot to another free tile of its water. Whoever was fishing it stops; whoever was walking to it follows. */
  private moveSpot(s: Spot): void {
    s.moveAt = this.tick + this.between(SPOT_MOVE);
    const w = this.map.width;
    const taken = new Set(this.spots.filter((o) => o.water === s.water).map((o) => o.y * w + o.x));
    const free = this.map.fishing[s.water]!.tiles.filter((t) => !taken.has(t.y * w + t.x));
    if (free.length === 0) return;
    const t = free[this.pick(free.length)]!;
    s.x = t.x;
    s.y = t.y;
    this.spotChanges.push({ id: s.id, x: s.x, y: s.y });
    for (const q of this.players.values()) {
      if (q.gathering?.target.kind === "spot" && q.gathering.target.id === s.id) this.stopGathering(q);
      else if (q.action?.kind === "spot" && q.action.id === s.id) q.approach = oneTile(s.x, s.y);
    }
  }

  private giveXp(p: Player, skill: SkillKey, amount: number): void {
    const before = p.xp[skill], after = Math.min(MAX_XP, before + amount);
    if (after === before) return;
    p.xp[skill] = after;
    p.xpChanged.add(skill);
    const level = levelForXp(after);
    if (level > levelForXp(before)) {
      p.messages.push(levelUp(SKILL_NAME[skill], level));
      p.fxTick = this.seenTick;
    }
  }

  // --- The tick ----------------------------------------------------------------------------

  /** One tick: pending walks become paths, everyone moves 1 tile (2 running), actions resolve, the world ages. */
  step(): void {
    this.tick++;
    this.stepping = true;
    this.objectChanges = [];
    this.spotChanges = [];
    try {
      const collision = this.map.collision;
      for (const p of this.players.values()) {
        if (p.walkTo) {
          p.path = findPath(collision, p.x, p.y, p.walkTo.x, p.walkTo.y);
          p.walkTo = null;
        } else if (p.approach) {
          p.path = findPathTo(collision, p.x, p.y, p.approach);
          p.approach = null;
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
        if (p.gathering) this.gather(p);
      }
      this.regrowTrees();
      for (const [uid, it] of this.ground) if (this.tick >= it.despawnTick) this.ground.delete(uid);
      for (let i = this.respawns.length - 1; i >= 0; i--) {
        if (this.tick >= this.respawns[i]!.tick) {
          this.placeSpawn(this.respawns[i]!.spawn);
          this.respawns.splice(i, 1);
        }
      }
      for (const [id, at] of this.depleted) {
        if (this.tick >= at) {
          this.depleted.delete(id);
          this.objectChanges.push([id, 0]);
        }
      }
      for (const s of this.spots) if (this.tick >= s.moveAt) this.moveSpot(s);
    } finally {
      this.stepping = false;
    }
  }

  private resolveAction(p: Player): void {
    const a = p.action;
    if (!a) return;
    if (a.kind === "take") {
      this.resolveTake(p, a.uid);
      return;
    }
    const at = a.kind === "object" ? this.map.objects[a.id]! : this.spots[a.id]!;
    if (reaches(this.map.collision, p.x, p.y, oneTile(at.x, at.y))) {
      p.path = [];
      p.action = null;
      if (a.kind === "spot") {
        this.startGathering(p, "net", { kind: "spot", id: a.id }, oneTile(at.x, at.y), "spot");
      } else if (a.use) {
        if (p.inventory[a.use.slot]?.id === a.use.item) p.messages.push(NOTHING_COMES);
      } else {
        const def = RESOURCES[this.map.objects[a.id]!.kind];
        if (def && !this.depleted.has(a.id)) this.startGathering(p, def.method, { kind: "object", id: a.id }, oneTile(at.x, at.y), def.noun);
      }
      return;
    }
    if (p.path.length === 0 && !p.walkTo && !p.approach) {
      p.action = null;
      p.messages.push(CANT_REACH);
    }
  }

  private resolveTake(p: Player, uid: number): void {
    const it = this.ground.get(uid);
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
      p.sounds.push("take");
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
      const newAct = q.actTick === this.tick, fx = q.fxTick === this.tick;
      if (!isNew && q.moved.length === 0 && !newLook && !newGear && !newAct && !fx) continue;
      const update: EntityUpdate = { id: q.id, x: q.x, y: q.y };
      if (q.moved.length) update.steps = q.moved.map((t): [number, number] => [t.x, t.y]);
      if (isNew || newLook) update.look = q.look;
      if (isNew || newGear) update.gear = this.gearOf(q);
      if (newAct || (isNew && q.act)) update.act = q.act;
      if (fx) update.fx = "levelup";
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
