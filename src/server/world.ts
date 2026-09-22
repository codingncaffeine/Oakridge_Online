import { BLOCKED } from "../shared/collision.ts";
import { VIEW_DISTANCE } from "../shared/constants.ts";
import {
  combatLevel, damageRoll, DEFAULT_CLASS, lands, styleAt, styleXp, swing, WEAPON_CLASSES,
  type Fighter, type WeaponClassName,
} from "../shared/combat.ts";
import { energyRegen, MAX_ENERGY, runDrain } from "../shared/energy.ts";
import {
  METHODS, NET_CATCH, RESOURCES, SPOT_MOVE, tierValue, TOOLS, type MethodName, type ToolKind, type Yield,
} from "../shared/gathering.ts";
import { ITEM_BY_ID, ITEM_BY_KEY, VISIBLE_GEAR, type Bonuses, type EquipSlot, type Stack } from "../shared/items.ts";
import { lookFromSeed } from "../shared/look.ts";
import { solidObjects, type MapObject, type WorldMap } from "../shared/map.ts";
import {
  ALREADY_FIGHTING, ateItem, CANT_REACH, defeated, GATHER_START, gotItem, levelUp, NEED_TOOL, needLevel, NO_DUELLING,
  NO_ROOM, NOT_HURT, NOTHING_COMES, PACK_FULL, toolNeedsLevel, YOU_DIED,
} from "../shared/messages.ts";
import {
  attacksOnSight, DROP_DENOMINATOR, levelOf, MONSTER_BY_KEY, REGEN_TICKS, TOLERANCE_TICKS, type Drop, type MonsterDef,
} from "../shared/monsters.ts";
import { findPath, findPathTo, reaches, type Rect, type Tile } from "../shared/pathfind.ts";
import type { ActView, EntityUpdate, GroundItemView, SoundCue, SpotView } from "../shared/protocol.ts";
import { hashString } from "../shared/rng.ts";
import { levelForXp, MAX_XP, noXp, SKILL_NAME, successChance, xpForLevel, type SkillKey } from "../shared/skills.ts";
import {
  addItem, bonusesOf, canHold, emptyInventory, equipFrom, swapSlots, takeFrom, unequip, weightOf,
  type Equipment, type Inventory,
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
  | { kind: "spot"; id: number }
  /** Going after an entity to fight it. */
  | { kind: "attack"; id: number };

/** Ticks a killed creature lies where it fell before it leaves the world. */
export const DEATH_TICKS = 3;
/** Ticks between a wandering creature's steps. */
const WANDER_EVERY = 8;
/** Chance a creature with nothing to do takes a step in a given wander beat. */
const WANDER_CHANCE = 0.35;
/** How far past its wander radius a creature may be dragged before it gives up and walks home. */
const LEASH = 8;

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

  // --- Fighting ---
  /** Hitpoints now. Full is the Hitpoints level. */
  hp: number;
  /** The entity being fought, or null. */
  target: number | null;
  /** The tick of the next swing. */
  nextAttack: number;
  /** Which of the held weapon's styles is chosen, by index. */
  style: number;
  /** Whether being hit starts a fight back. */
  retaliate: boolean;
  /** Damage taken this tick, one number per blow; 0 is a blow turned aside. */
  hits: number[];
  /** Whether a blow was thrown this tick. */
  swung: boolean;
  /** The tick hitpoints last changed, so viewers get the new bar in that tick. */
  hpTick: number;
  /** The tick the player was killed, while they are shown falling. */
  deathTick: number;
  /** The tick of the next hitpoint regained on its own. */
  nextRegen: number;
  /** The tick from which creatures around here start ignoring this player. */
  toleranceFrom: number;
}

/** A creature in the world. It shares the entity id space with players, so one view can carry both. */
export interface Npc {
  readonly id: number;
  readonly def: MonsterDef;
  /** The tile it spawned on: it wanders around this and comes back to it. */
  readonly home: Tile;
  x: number;
  y: number;
  hp: number;
  target: number | null;
  nextAttack: number;
  path: Tile[];
  moved: Tile[];
  hits: number[];
  swung: boolean;
  hpTick: number;
  act: ActView | null;
  actTick: number;
  /** The tick it was killed, while it lies where it fell and waits to come back; 0 while alive. */
  deathTick: number;
  /** The tick it comes back; 0 while alive. */
  respawnAt: number;
  /** Damage each player has done to it this life, deciding whose the loot is. */
  readonly damage: Map<number, number>;
  /** The tick of its next hitpoint regained, and of its next wander beat. */
  nextRegen: number;
  nextWander: number;
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
  hp?: number;
  style?: number;
  retaliate?: boolean;
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

/** Saved hitpoints read back: a whole number from 1 up to full, and full for anything missing or odd. */
function clampHp(saved: number | undefined, full: number): number {
  return Number.isInteger(saved) && saved! >= 1 ? Math.min(full, saved!) : full;
}

/** Equipment that goes in a hand sounds of metal and leather straps; everything else sounds of cloth. */
const heldInHand = (where: EquipSlot) => where === "weapon" || where === "shield";

export class World {
  readonly map: WorldMap;
  readonly players = new Map<number, Player>();
  readonly npcs = new Map<number, Npc>();
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
    for (const s of map.monsters) {
      const def = MONSTER_BY_KEY.get(s.monster);
      if (def && canStand(map, s.x, s.y)) this.spawnNpc(def, s.x, s.y);
    }
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
    const xp = state.xp ?? noXp();
    const full = levelForXp(xp.hitpoints);
    const player: Player = {
      id: this.nextId++, name, look, lookTick: 0, gearTick: 0, x: start.x, y: start.y,
      run: state.run ?? false, energy: state.energy ?? MAX_ENERGY, inventory, equipment, weight: weightOf(inventory, equipment),
      xp, xpChanged: new Set(),
      path: [], walkTo: null, approach: null, action: null, gathering: null, act: null, actTick: 0, fxTick: 0,
      moved: [], known: new Set(), knownItems: new Set(), messages: [], sounds: [], invDirty: true, equipDirty: true,
      hp: clampHp(state.hp, full), target: null, nextAttack: 0, style: state.style ?? 0, retaliate: state.retaliate ?? true,
      hits: [], swung: false, hpTick: 0, deathTick: 0, nextRegen: this.tick + REGEN_TICKS, toleranceFrom: this.tick,
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
    // Anything that was fighting them has nothing left to fight.
    for (const n of this.npcs.values()) {
      if (n.target === id) {
        n.target = null;
        this.setNpcAct(n, null);
      }
    }
  }

  walk(player: Player, x: number, y: number): void {
    this.stopGathering(player);
    this.disengage(player);
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
    this.disengage(p);
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
    this.disengage(p);
    p.walkTo = null;
    p.approach = oneTile(o.x, o.y);
    p.action = { kind: "object", id: o.id, use };
  }

  /** Walks up to a fishing spot and fishes it. */
  fish(p: Player, id: number): void {
    const s = this.spots[id];
    if (!s) return;
    this.stopGathering(p);
    this.disengage(p);
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

  // --- Fighting ----------------------------------------------------------------------------

  /** A player's full hitpoints: their Hitpoints level. */
  maxHpOf(p: Player): number {
    return levelForXp(p.xp.hitpoints);
  }

  /** A player's combat level, for the aggression rule and for anyone looking at them. */
  combatLevelOf(p: Player): number {
    return combatLevel({
      attack: levelForXp(p.xp.attack), strength: levelForXp(p.xp.strength),
      defence: levelForXp(p.xp.defence), hitpoints: levelForXp(p.xp.hitpoints),
    });
  }

  /** Which family of styles the player's held weapon offers; bare hands for anything that isn't one. */
  weaponClassOf(p: Player): WeaponClassName {
    return ITEM_BY_ID.get(p.equipment.weapon?.id ?? 0)?.equip?.weapon ?? DEFAULT_CLASS;
  }

  /** Ticks between this player's swings. */
  private speedOf(p: Player): number {
    return WEAPON_CLASSES[this.weaponClassOf(p)].speed;
  }

  private fighterOfPlayer(p: Player, bonuses: Bonuses): Fighter {
    return {
      attack: levelForXp(p.xp.attack), strength: levelForXp(p.xp.strength), defence: levelForXp(p.xp.defence),
      bonuses, stance: styleAt(this.weaponClassOf(p), p.style).stance,
    };
  }

  /**
   * A creature as the rolls see it. Its own bonus counts on offence in its own type of blow only, and on
   * defence against whichever type is coming at it, so the arrays are built per roll.
   */
  private fighterOfNpc(n: Npc, against: "attack" | "defence"): Fighter {
    const d = n.def;
    const bonuses: Bonuses = new Array(12).fill(0) as Bonuses;
    if (against === "attack") {
      bonuses[{ stab: 0, slash: 1, crush: 2 }[d.attackType]] = d.attackBonus;
    } else {
      bonuses[5] = d.defenceBonus.stab;
      bonuses[6] = d.defenceBonus.slash;
      bonuses[7] = d.defenceBonus.crush;
    }
    return { attack: d.attack, strength: d.strength, defence: d.defence, bonuses, stance: null };
  }

  /** Melee range: orthogonally beside it, with no wall on the edge between. Never off a corner. */
  private inMeleeRange(ax: number, ay: number, bx: number, by: number): boolean {
    const dx = bx - ax, dy = by - ay;
    return Math.abs(dx) + Math.abs(dy) === 1 && !this.map.collision.wallBetween(ax, ay, dx, dy);
  }

  /** The player or creature an id names, whichever it is. */
  private entityAt(id: number): Player | Npc | undefined {
    return this.players.get(id) ?? this.npcs.get(id);
  }

  /** Whether a creature is drawn at all: on its feet, or still lying where it fell. */
  private inWorld(n: Npc): boolean {
    return n.deathTick === 0 || this.tick < n.deathTick + DEATH_TICKS;
  }

  private isNpc(e: Player | Npc): e is Npc {
    return (e as Npc).def !== undefined;
  }

  /** Whether something can still be fought: it exists, and it isn't lying dead. */
  private alive(e: Player | Npc | undefined): e is Player | Npc {
    if (!e) return false;
    return e.deathTick === 0;
  }

  /** Walks over to an entity and fights it. Player against player waits for a phase that allows it. */
  attack(p: Player, id: number): void {
    if (id === p.id) return;
    const target = this.entityAt(id);
    if (!this.alive(target)) return;
    if (!this.isNpc(target)) {
      p.messages.push(NO_DUELLING);
      return;
    }
    // A creature already fighting someone else is theirs until that fight ends.
    if (target.target !== null && target.target !== p.id && this.alive(this.entityAt(target.target))) {
      p.messages.push(ALREADY_FIGHTING);
      return;
    }
    this.stopGathering(p);
    p.walkTo = null;
    p.approach = null;
    p.action = { kind: "attack", id };
    p.target = id;
  }

  setStyle(p: Player, index: number): void {
    p.style = index;
  }

  setRetaliate(p: Player, on: boolean): void {
    p.retaliate = on;
  }

  /** Eats something that mends: it heals, and the stack goes down by one. */
  eat(p: Player, slot: number): string {
    const def = ITEM_BY_ID.get(p.inventory[slot]?.id ?? 0);
    if (!def || def.action !== "Eat" || !def.heals) return NOTHING_COMES;
    if (p.hp >= this.maxHpOf(p)) return NOT_HURT;
    takeFrom(p.inventory, slot, 1);
    this.setHp(p, Math.min(this.maxHpOf(p), p.hp + def.heals));
    p.sounds.push("eat");
    this.itemsChanged(p, false);
    return ateItem(def.name);
  }

  private setHp(e: Player | Npc, hp: number): void {
    if (e.hp === hp) return;
    e.hp = hp;
    e.hpTick = this.seenTick;
  }

  /** Puts a creature into the world at a tile, fresh and at full health. */
  private spawnNpc(def: MonsterDef, x: number, y: number): Npc {
    const npc: Npc = {
      id: this.nextId++, def, home: { x, y }, x, y, hp: def.hitpoints, target: null, nextAttack: 0,
      path: [], moved: [], hits: [], swung: false, hpTick: 0, act: null, actTick: 0, deathTick: 0, respawnAt: 0,
      damage: new Map(), nextRegen: this.tick + REGEN_TICKS, nextWander: this.tick + this.pick(WANDER_EVERY),
    };
    this.npcs.set(npc.id, npc);
    return npc;
  }

  private setNpcAct(n: Npc, act: ActView | null): void {
    const a = n.act;
    const same = act === null ? a === null : a !== null && a.anim === act.anim && a.x === act.x && a.y === act.y;
    if (same) return;
    n.act = act;
    n.actTick = this.seenTick;
  }

  /** One tick for every creature: the dead come back, the living pick a fight, chase, wander or go home. */
  private stepNpcs(): void {
    const taken = new Set<number>();
    for (const n of this.npcs.values()) if (n.deathTick === 0) taken.add(n.y * this.map.width + n.x);
    for (const n of this.npcs.values()) {
      n.moved = [];
      n.hits = [];
      n.swung = false;
      if (n.deathTick !== 0) {
        if (this.tick >= n.respawnAt) this.reviveNpc(n, taken);
        continue;
      }
      // A target that walked off, died or logged out is let go.
      const target = n.target === null ? undefined : this.entityAt(n.target);
      if (!this.alive(target) || this.chebyshev(n.x, n.y, target.x, target.y) > n.def.aggro + LEASH) {
        n.target = null;
        this.setNpcAct(n, null);
      }
      if (n.target === null) this.lookForPrey(n);
      if (n.hp < n.def.hitpoints && this.tick >= n.nextRegen) {
        this.setHp(n, n.hp + 1);
        n.nextRegen = this.tick + REGEN_TICKS;
      }
      this.moveNpc(n, taken);
    }
  }

  /** A creature that starts fights looks for the nearest player it would take on. */
  private lookForPrey(n: Npc): void {
    if (n.def.aggro === 0) return;
    let best: Player | null = null, bestDistance = Infinity;
    for (const p of this.players.values()) {
      if (p.deathTick !== 0) continue;
      const distance = this.chebyshev(n.x, n.y, p.x, p.y);
      if (distance > n.def.aggro || distance >= bestDistance) continue;
      // Creatures lose interest in anyone who has been standing among them for ten minutes.
      if (this.tick - p.toleranceFrom >= TOLERANCE_TICKS) continue;
      if (!attacksOnSight(n.def, this.combatLevelOf(p))) continue;
      best = p;
      bestDistance = distance;
    }
    if (best) n.target = best.id;
  }

  /** Chasing, wandering or walking home: one step a tick, straight at it, and blocked means stopped. */
  private moveNpc(n: Npc, taken: Set<number>): void {
    const target = n.target === null ? undefined : this.entityAt(n.target);
    const homeDistance = this.chebyshev(n.x, n.y, n.home.x, n.home.y);
    let goal: Tile | null = null;
    if (this.alive(target)) {
      this.setNpcAct(n, { anim: "fight", tool: 0, x: target.x, y: target.y });
      if (this.inMeleeRange(n.x, n.y, target.x, target.y)) return;
      goal = { x: target.x, y: target.y };
    } else if (homeDistance > n.def.wander) {
      goal = n.home;
    } else if (this.tick >= n.nextWander) {
      n.nextWander = this.tick + WANDER_EVERY;
      if (this.rand() >= WANDER_CHANCE) return;
      goal = { x: n.home.x + this.pick(2 * n.def.wander + 1) - n.def.wander, y: n.home.y + this.pick(2 * n.def.wander + 1) - n.def.wander };
    }
    if (!goal) return;
    const step = this.stepToward(n, goal, taken);
    if (!step) return;
    taken.delete(n.y * this.map.width + n.x);
    n.x = step.x;
    n.y = step.y;
    n.moved.push(step);
    taken.add(n.y * this.map.width + n.x);
  }

  /**
   * One step from a creature toward a tile: diagonally when both axes differ, and if that is blocked,
   * whichever single axis still closes the distance. Nothing when every way is blocked.
   */
  private stepToward(n: Npc, goal: Tile, taken: Set<number>): Tile | null {
    const dx = Math.sign(goal.x - n.x), dy = Math.sign(goal.y - n.y);
    if (dx === 0 && dy === 0) return null;
    const tries: Array<[number, number]> = [];
    if (dx !== 0 && dy !== 0) tries.push([dx, dy], [dx, 0], [0, dy]);
    else if (dx !== 0) tries.push([dx, 0]);
    else tries.push([0, dy]);
    for (const [sx, sy] of tries) {
      const nx = n.x + sx, ny = n.y + sy;
      if (!this.map.collision.canStep(n.x, n.y, sx, sy)) continue;
      if (taken.has(ny * this.map.width + nx)) continue;
      return { x: nx, y: ny };
    }
    return null;
  }

  private chebyshev(ax: number, ay: number, bx: number, by: number): number {
    return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
  }

  /** A killed creature standing up again: back on its own tile if it's free, otherwise beside it. */
  private reviveNpc(n: Npc, taken: Set<number>): void {
    let at: Tile | null = null;
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]] as const) {
      const x = n.home.x + dx, y = n.home.y + dy;
      if (!canStand(this.map, x, y) || taken.has(y * this.map.width + x)) continue;
      at = { x, y };
      break;
    }
    if (!at) return; // Nowhere free; it tries again next tick.
    n.x = at.x;
    n.y = at.y;
    n.hp = n.def.hitpoints;
    n.hpTick = this.seenTick;
    n.deathTick = 0;
    n.respawnAt = 0;
    n.target = null;
    n.damage.clear();
    n.nextAttack = 0;
    n.nextRegen = this.tick + REGEN_TICKS;
    n.act = null;
    n.actTick = this.seenTick;
    taken.add(at.y * this.map.width + at.x);
  }

  /** Every fighter whose swing is due this tick throws it. */
  private stepCombat(): void {
    for (const p of this.players.values()) {
      if (p.deathTick !== 0 || p.target === null) continue;
      const target = this.entityAt(p.target);
      if (!this.alive(target) || !this.isNpc(target)) {
        this.disengage(p);
        continue;
      }
      if (!this.inMeleeRange(p.x, p.y, target.x, target.y)) continue;
      // In range and standing still: face it, and stop whatever else was going on.
      this.stopGathering(p);
      p.path = [];
      this.setAct(p, { anim: "fight", tool: p.equipment.weapon?.id ?? 0, x: target.x, y: target.y });
      if (this.tick < p.nextAttack) continue;
      p.nextAttack = this.tick + this.speedOf(p);
      p.swung = true;
      const style = styleAt(this.weaponClassOf(p), p.style);
      const damage = swing(this.fighterOfPlayer(p, bonusesOf(p.equipment)), this.fighterOfNpc(target, "defence"), style.type, this.rand);
      this.landOnNpc(target, damage, p);
      // XP is paid per point of damage, so a blow that lands for nothing earns nothing.
      if (damage > 0) {
        for (const [skill, amount] of Object.entries(styleXp(style.stance))) this.giveXp(p, skill as SkillKey, amount * damage);
      }
    }
    for (const n of this.npcs.values()) {
      if (n.deathTick !== 0 || n.target === null) continue;
      const target = this.entityAt(n.target);
      if (!this.alive(target) || this.isNpc(target)) {
        n.target = null;
        this.setNpcAct(n, null);
        continue;
      }
      if (!this.inMeleeRange(n.x, n.y, target.x, target.y)) continue;
      if (this.tick < n.nextAttack) continue;
      n.nextAttack = this.tick + n.def.speed;
      n.swung = true;
      // The same accuracy roll as a player's, but a creature's damage comes from its own max hit.
      const attacker = this.fighterOfNpc(n, "attack");
      const defender = this.fighterOfPlayer(target, bonusesOf(target.equipment));
      const damage = lands(attacker, defender, n.def.attackType, this.rand) ? damageRoll(n.def.maxHit, this.rand) : 0;
      this.landOnPlayer(target, damage, n);
    }
  }

  private landOnNpc(n: Npc, damage: number, by: Player): void {
    n.hits.push(damage);
    if (damage > 0) {
      this.setHp(n, Math.max(0, n.hp - damage));
      n.damage.set(by.id, (n.damage.get(by.id) ?? 0) + damage);
    }
    // Being hit turns a creature on whoever hit it, unless it is already busy with someone.
    if (n.target === null || !this.alive(this.entityAt(n.target))) n.target = by.id;
    if (n.hp === 0) this.killNpc(n);
  }

  private landOnPlayer(p: Player, damage: number, by: Npc): void {
    p.hits.push(damage);
    if (damage > 0) {
      this.setHp(p, Math.max(0, p.hp - damage));
      p.sounds.push("hurt");
    }
    // Hitting back takes up the same fight a player would have started themselves, so it follows too.
    if (p.retaliate && p.target === null && p.deathTick === 0) {
      p.target = by.id;
      p.action = { kind: "attack", id: by.id };
      p.path = [];
    }
    if (p.hp === 0) this.killPlayer(p);
  }

  /** A creature killed: it stops, lies where it fell for a beat, leaves its drop and comes back later. */
  private killNpc(n: Npc): void {
    n.target = null;
    n.path = [];
    this.setNpcAct(n, null);
    n.deathTick = this.seenTick;
    n.respawnAt = n.deathTick + DEATH_TICKS + n.def.respawn;
    let best: Player | undefined, bestDamage = 0;
    for (const [id, done] of n.damage) {
      const p = this.players.get(id);
      if (p && done > bestDamage) {
        best = p;
        bestDamage = done;
      }
    }
    this.dropLoot(n, best);
    for (const p of this.players.values()) {
      if (p.target === n.id) this.disengage(p);
    }
    if (best) best.messages.push(defeated(n.def.name));
  }

  /** What a kill leaves on the tile it fell on: everything in `always`, then one roll of the main table. */
  private dropLoot(n: Npc, to: Player | undefined): void {
    const owner = to?.name ?? null;
    const leave = (drop: Drop) => {
      const def = ITEM_BY_KEY.get(drop.item);
      if (!def) return;
      const min = drop.min ?? 1, max = drop.max ?? min;
      const count = min + (max > min ? this.pick(max - min + 1) : 0);
      if (count > 0) this.putDown({ id: def.id, count }, n.x, n.y, owner);
    };
    for (const drop of n.def.drops.always ?? []) leave(drop);
    const main = n.def.drops.main ?? [];
    if (main.length === 0) return;
    let roll = this.pick(DROP_DENOMINATOR);
    for (const drop of main) {
      if (roll < drop.weight) {
        leave(drop);
        return;
      }
      roll -= drop.weight;
    }
  }

  /** A player killed: they fall, then wake at the spawn with their hitpoints back. */
  private killPlayer(p: Player): void {
    p.deathTick = this.seenTick;
    p.target = null;
    p.path = [];
    p.walkTo = null;
    p.approach = null;
    p.action = null;
    this.stopGathering(p);
    this.setAct(p, null);
    p.sounds.push("die");
    p.messages.push(YOU_DIED);
    for (const n of this.npcs.values()) {
      if (n.target === p.id) {
        n.target = null;
        this.setNpcAct(n, null);
      }
    }
  }

  /** The tick after falling: back on the spawn tile, whole again, and left alone for a moment. */
  private respawnPlayer(p: Player): void {
    p.deathTick = 0;
    p.x = this.map.spawn.x;
    p.y = this.map.spawn.y;
    p.moved = [];
    p.energy = MAX_ENERGY;
    this.setHp(p, this.maxHpOf(p));
    p.nextRegen = this.tick + REGEN_TICKS;
    p.toleranceFrom = this.tick;
  }

  /** Stops fighting, and stops facing whatever it was. */
  private disengage(p: Player): void {
    p.target = null;
    if (p.act?.anim === "fight") this.setAct(p, null);
    if (p.action?.kind === "attack") p.action = null;
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
        p.hits = [];
        p.swung = false;
        // A killed player lies where they fell for a beat, then wakes at the spawn.
        if (p.deathTick !== 0) {
          p.moved = [];
          if (this.tick >= p.deathTick + DEATH_TICKS) this.respawnPlayer(p);
          continue;
        }
        // Chasing something that moves: aim again at where it is now.
        if (p.action?.kind === "attack") {
          const target = this.entityAt(p.action.id);
          if (this.alive(target) && !this.inMeleeRange(p.x, p.y, target.x, target.y)) p.approach = oneTile(target.x, target.y);
        }
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
          // Walking up to something to fight it stops the moment it is within reach.
          if (this.stopsToFight(p)) {
            p.path = [];
            break;
          }
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
        if (p.hp < this.maxHpOf(p) && this.tick >= p.nextRegen) {
          this.setHp(p, p.hp + 1);
          p.nextRegen = this.tick + REGEN_TICKS;
        }
      }
      this.stepNpcs();
      this.stepCombat();
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

  /** Whether this player is walking up to something to fight, and is already close enough to swing. */
  private stopsToFight(p: Player): boolean {
    if (p.action?.kind !== "attack") return false;
    const target = this.entityAt(p.action.id);
    return this.alive(target) && this.inMeleeRange(p.x, p.y, target.x, target.y);
  }

  private resolveAction(p: Player): void {
    const a = p.action;
    if (!a) return;
    if (a.kind === "take") {
      this.resolveTake(p, a.uid);
      return;
    }
    if (a.kind === "attack") {
      const target = this.entityAt(a.id);
      if (!this.alive(target)) {
        this.disengage(p);
        return;
      }
      // The action stays while the fight does: a creature that wanders off is followed, not lost.
      if (this.inMeleeRange(p.x, p.y, target.x, target.y)) {
        p.path = [];
        return;
      }
      // Nowhere left to walk and still out of reach: it can't be got at from here.
      if (p.path.length === 0 && !p.walkTo && !p.approach) {
        this.disengage(p);
        p.messages.push(CANT_REACH);
      }
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
      const newHp = q.hpTick === this.tick, died = q.deathTick === this.tick;
      if (!isNew && q.moved.length === 0 && !newLook && !newGear && !newAct && !fx && !newHp && !died && !q.swung && q.hits.length === 0) continue;
      const update: EntityUpdate = { id: q.id, x: q.x, y: q.y };
      if (q.moved.length) update.steps = q.moved.map((t): [number, number] => [t.x, t.y]);
      if (isNew || newLook) update.look = q.look;
      if (isNew || newGear) update.gear = this.gearOf(q);
      if (newAct || (isNew && q.act)) update.act = q.act;
      if (fx) update.fx = "levelup";
      if (isNew || newHp) update.hp = [q.hp, this.maxHpOf(q)];
      if (q.hits.length) update.hits = q.hits;
      if (q.swung) update.swing = 1;
      if (died) update.dead = 1;
      if (isNew) {
        update.name = q.name;
        p.known.add(q.id);
      }
      ents.push(update);
    }
    for (const n of this.npcs.values()) {
      if (!this.inWorld(n) || !near(n.x, n.y)) continue;
      inView.add(n.id);
      const isNew = !p.known.has(n.id);
      const newAct = n.actTick === this.tick, newHp = n.hpTick === this.tick;
      const died = n.deathTick === this.tick;
      if (!isNew && n.moved.length === 0 && !newAct && !newHp && !died && !n.swung && n.hits.length === 0) continue;
      const update: EntityUpdate = { id: n.id, x: n.x, y: n.y };
      if (n.moved.length) update.steps = n.moved.map((t): [number, number] => [t.x, t.y]);
      if (newAct || (isNew && n.act)) update.act = n.act;
      if (isNew || newHp) update.hp = [n.hp, n.def.hitpoints];
      if (n.hits.length) update.hits = n.hits;
      if (n.swung) update.swing = 1;
      if (died) update.dead = 1;
      if (isNew) {
        update.npc = n.def.key;
        update.name = n.def.name;
        p.known.add(n.id);
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
