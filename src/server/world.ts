import { CHEST_DENOMINATOR, CHESTS } from "../shared/chests.ts";
import { BLOCKED } from "../shared/collision.ts";
import { VIEW_DISTANCE } from "../shared/constants.ts";
import {
  combatLevel, damageRoll, DEFAULT_CLASS, DEFENCE_XP, HITPOINTS_XP, lands, PRAYER_BONUS, rangeOf, speedOf, styleAt, styleXp, swing,
  type Fighter, type Style, type WeaponClassName,
} from "../shared/combat.ts";
import { boostsOf, drainPerTick, PRAYER_BY_KEY, readPrayers, type PrayerKey } from "../shared/prayers.ts";
import { SPELL_DAMAGE_XP, SPELLS } from "../shared/spells.ts";
import { energyRegen, MAX_ENERGY, runDrain } from "../shared/energy.ts";
import {
  CATCHES, METHODS, RESOURCES, SPOT_MOVE, tierValue, TOOLS,
  type FishingMethod, type MethodName, type ToolKind, type Yield,
} from "../shared/gathering.ts";
import { EQUIP_SLOTS, ITEM_BY_ID, ITEM_BY_KEY, VISIBLE_GEAR, type Bonuses, type EquipSlot, type Stack } from "../shared/items.ts";
import { lookFromSeed } from "../shared/look.ts";
import {
  asStack, climbable, isEdgeKind, openable, planeOf, solidObjects, type FishingWater, type ItemSpawn, type MapObject, type Place,
  type WorldMap, type WorldStack,
} from "../shared/map.ts";
import {
  ALREADY_FIGHTING, ateItem, burnt, CANT_REACH, cooked, defeated, FIRE_LIT, GATHER_START, gotItem, levelUp,
  makeNeedsLevel, NEED_BAIT, NEED_TOOL, needLevel, needMaterials, NO_DUELLING, NO_FIRE_HERE, NO_ROOM, NOT_HURT,
  LOST_ON_DEATH, NOTHING_COMES, NOTHING_LEFT, NOTHING_TO_SAY, PACK_FULL, smelted, smithed, STOPPED_MAKING,
  toolNeedsLevel, YOU_DIED, CHEST_EMPTY, chestFound,
  BURIED, NO_ARROWS, noReagent, PRAYER_FULL, PRAYER_RESTORED, PRAYER_SPENT, prayerNeeds, spellNeeds,
} from "../shared/messages.ts";
import { burnChance, FIRE_BY_LOGS, RECIPES, recipesAt, type Recipe } from "../shared/recipes.ts";
import { SHOPS } from "../shared/shops.ts";
import {
  buy as buyFrom, deposit as depositItem, emptyBank, newShop, sell as sellTo, withdraw as withdrawItem,
  type ShopState,
} from "./trading.ts";
import {
  attacksOnSight, DROP_DENOMINATOR, levelOf, MONSTER_BY_KEY, RARE_DENOMINATOR, REGEN_TICKS, TOLERANCE_TICKS,
  type Drop, type MonsterDef, type WeightedDrop,
} from "../shared/monsters.ts";
import { besides, findPath, findPathBeside, findPathTo, reaches, type Rect, type Tile } from "../shared/pathfind.ts";
import type { ActView, EntityUpdate, GroundItemView, SoundCue, SpotView } from "../shared/protocol.ts";
import { hashString } from "../shared/rng.ts";
import { DIALOGUE, DIALOGUE_START } from "../shared/dialogue.ts";
import { STATION_OF, type Station } from "../shared/stations.ts";
import { levelForXp, MAX_XP, noXp, SKILL_NAME, successChance, xpForLevel, type SkillKey } from "../shared/skills.ts";
import type { Condition, DialogueNode, DialogueOption, DialogueTree, Effect } from "../shared/dialogue.ts";
import { questBegun, questComplete, questPointsLine } from "../shared/messages.ts";
import { BUSY_TRADING, noRoomFor, TRADE_DONE, tradeDeclined, tradeSent, tradeWish } from "../shared/messages.ts";
import { isComplete, noQuests, QUEST_BY_KEY, questPoints, stageOf, type QuestStages } from "../shared/quests.ts";
import {
  addItem, bonusesOf, canHold, countOf, emptyInventory, equipFrom, spendItem, swapSlots, takeFrom, unequip, weightOf,
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
  | { kind: "attack"; id: number }
  /** Going over to a person to talk to them. */
  | { kind: "talk"; id: number }
  /** Going over to another player to offer a trade (PLAN Phase 10). */
  | { kind: "trade"; id: number };

/** Ticks a killed creature lies where it fell before it leaves the world. */
export const DEATH_TICKS = 3;
/** Ticks between a wandering creature's steps. */
const WANDER_EVERY = 8;
/** Chance a creature with nothing to do takes a step in a given wander beat. */
const WANDER_CHANCE = 0.35;
/** How far past its wander radius a creature may be dragged before it gives up and walks home. */
const LEASH = 8;
/** How many of their things a player keeps when they are killed: the classic's three (PLAN §5). */
export const KEPT_ON_DEATH = 3;
/** Ticks an opened door or gate stands open before it swings shut on its own (30 s). */
export const DOOR_TICKS = 50;
/** Ticks between one thing and the next in a run of making, as the classic paces its own. */
export const MAKE_TICKS = 3;

/** What the "make X" window is called at each workbench. */
const MAKE_TITLE: Record<Station, string> = {
  bank: "Bank", shop: "Shop", furnace: "What to smelt", anvil: "What to make",
  range: "What to cook", fire: "What to cook", mill: "Mill", altar: "Altar",
};
/** Which animation the maker plays, so far the one hammering pose for all of them. */
const MAKE_ANIM: Record<Station, "make"> = {
  bank: "make", shop: "make", furnace: "make", anvil: "make", range: "make", fire: "make", mill: "make", altar: "make",
};
/** The line a finished thing prints, in the register of the bench it came off. */
const MAKE_MESSAGE: Record<Station, (name: string) => string> = {
  bank: smithed, shop: smithed, furnace: smelted, anvil: smithed, range: cooked, fire: cooked, mill: smithed, altar: smithed,
};

/** A gathering action under way, and the tick of its next roll. */
export interface Gathering {
  method: MethodName;
  target: GatherTarget;
  nextRoll: number;
}

/**
 * The one screen a player has open. The classic allows exactly one at a time, and opening anything —
 * or walking away, or being hit — closes whatever was there.
 */
export type Screen =
  | { kind: "bank" }
  /** A shop, by its key in `SHOPS`. */
  | { kind: "shop"; shop: string }
  /** Talking to an NPC: which one, and where in its dialogue tree the conversation has got to. */
  | { kind: "talk"; npc: number; node: string }
  /** A "make X" list: the station it belongs to, and the recipes it offers, by index into `RECIPES`. */
  | { kind: "make"; station: Station; title: string; recipes: number[] }
  /** A trade with another player (PLAN Phase 10): the trade itself is in `trades`, by either player's id. */
  | { kind: "trade" };

/** What can lie on a trade's table: an item and how many. */
export interface Offered {
  id: number;
  count: number;
}

/**
 * A trade between two players: what each has put on the table (out of their packs, held here until
 * the trade completes or is called off), who has accepted, and which of its two screens it is on —
 * the offer, where things are added and taken back, then the confirmation, where nothing moves.
 */
export interface Trade {
  a: number;
  b: number;
  offers: Map<number, Offered[]>;
  accepted: Set<number>;
  stage: "offer" | "confirm";
}

/** Ticks a trade request waits for the other to take it up. */
export const TRADE_REQUEST_TICKS = 100;

/** Making the same thing several times over: one lands every `MAKE_TICKS` until the count runs out. */
export interface Making {
  recipe: number;
  left: number;
  nextAt: number;
  station: Station;
  /** The tile being worked, so walking away stops it. */
  at: Tile;
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
  /** Which plane they stand on: 0 ground, +1/+2 upper floors, −1..−3 underground (PLAN §8.5). */
  plane: number;
  /** The tick the plane last changed, so viewers drop them and the client rebuilds the scene. */
  planeTick: number;
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
  /** The same for closing on something to fight: this walk ends beside it, never on it. */
  chase: Tile | null;
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

  // --- Screens ---
  /** The one screen open in front of them, as in the classic: a bank, a shop, a talk, a make-X list. */
  screen: Screen | null;
  /** Whether the open screen's contents need sending again this tick. */
  screenDirty: boolean;
  /** What the bank holds. Everything in it stacks, whatever the item. */
  bank: Array<Stack | null>;
  /** Repeated making under way: which recipe, how many are left, and the tick the next one lands. */
  making: Making | null;

  // --- Quests (PLAN Phase 9) ---
  /** Every quest's stage, by its key; one not there is not begun. */
  quests: QuestStages;
  /** Creatures killed since a quest's stage last changed, by their key: what "three since I asked" counts. */
  tally: Record<string, number>;
  /** Whether the quests need sending again this tick. */
  questsDirty: boolean;

  // --- Social (PLAN Phase 10) ---
  /** The player being followed, kept beside until something else is asked for; null otherwise. */
  follow: number | null;

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
  /**
   * The tick they stood back up. A body is shown toppled onto its side and stays that way until it is
   * told otherwise, so waking at the spawn has to be said as plainly as falling over was.
   */
  riseTick: number;
  /** The tick of the next hitpoint regained on its own. */
  nextRegen: number;
  /** The tick from which creatures around here start ignoring this player. */
  toleranceFrom: number;

  // --- Ranged, magic and prayer (PLAN Phase 11) ---
  /** Prayer points left. Full is the Prayer level. */
  prayer: number;
  /** The prayers that are on, by key. */
  readonly prayers: Set<PrayerKey>;
  /** Points drained so far toward the next whole one taken off. */
  prayerDrain: number;
  /** Whether the set of prayers needs sending again this tick. */
  prayersDirty: boolean;
  /** An arrow loosed or a spell cast this tick, for viewers to draw crossing to its target. */
  shot: EntityUpdate["shot"] | null;
}

/** A creature in the world. It shares the entity id space with players, so one view can carry both. */
export interface Npc {
  readonly id: number;
  readonly def: MonsterDef;
  /** The tile it spawned on: it wanders around this and comes back to it. */
  readonly home: Tile;
  x: number;
  y: number;
  readonly plane: number;
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
  plane: number;
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
  readonly plane: number;
  moveAt: number;
}

export interface PlayerState {
  at?: { x: number; y: number; plane?: number };
  bank?: Array<Stack | null>;
  run?: boolean;
  energy?: number;
  inventory?: Inventory;
  equipment?: Equipment;
  xp?: Record<SkillKey, number>;
  hp?: number;
  style?: number;
  retaliate?: boolean;
  quests?: QuestStages;
  prayer?: number;
  prayers?: string[];
}

/** Where a saved character may stand again: inside the map and not on a blocked tile. */
export function canStand(map: WorldMap, x: number, y: number): boolean {
  return Number.isInteger(x) && Number.isInteger(y) && map.collision.inBounds(x, y) && (map.collision.get(x, y) & BLOCKED) === 0;
}

/** Where a saved character may stand again, plane and all. */
export function canStandIn(stack: WorldStack, at: Place): boolean {
  const map = stack.planes.get(at.plane);
  return map !== undefined && canStand(map, at.x, at.y);
}

/** Appearance for a player who didn't send one: picked from the name, so it stays the same. */
export function lookFor(name: string): number[] {
  return lookFromSeed(hashString(name.toLowerCase()));
}

const oneTile = (x: number, y: number): Rect => ({ x, y, w: 1, h: 1 });

/**
 * The tiles a player may stand on to work an object. A tree or a counter is its own tile; a door,
 * a gate or a wall runs along a tile EDGE, and its tile is the one inside the building — so the rect
 * covers both tiles that share the edge, or the door could only ever be opened from the inside.
 */
function approachRect(o: MapObject): Rect {
  if (!isEdgeKind(o.kind)) return oneTile(o.x, o.y);
  const [dx, dy] = EDGE_STEP[o.side]!;
  return { x: Math.min(o.x, o.x + dx), y: Math.min(o.y, o.y + dy), w: 1 + Math.abs(dx), h: 1 + Math.abs(dy) };
}

/** The step across each side of a tile: north, east, south, west. */
const EDGE_STEP: ReadonlyArray<readonly [number, number]> = [[0, 1], [1, 0], [0, -1], [-1, 0]];

/** Saved hitpoints read back: a whole number from 1 up to full, and full for anything missing or odd. */
function clampHp(saved: number | undefined, full: number): number {
  return Number.isInteger(saved) && saved! >= 1 ? Math.min(full, saved!) : full;
}

/** Equipment that goes in a hand sounds of metal and leather straps; everything else sounds of cloth. */
const heldInHand = (where: EquipSlot) => where === "weapon" || where === "shield";

export class World {
  readonly stack: WorldStack;
  /** The ground plane. Every plane shares this one's origin, width and height. */
  readonly map: WorldMap;
  /** Where a new character wakes, and where a dead one comes back. */
  readonly spawn: Place;
  readonly players = new Map<number, Player>();
  readonly npcs = new Map<number, Npc>();
  readonly ground = new Map<number, GroundItem>();
  /** Objects that ran out (felled trees, empty rocks), with the tick each comes back. */
  readonly depleted = new Map<number, number>();
  readonly spots: Spot[] = [];
  tick = 0;
  /** This tick's changes that every client hears about: objects that ran out (1) or came back (0), spots that moved. */
  objectChanges: Array<[number, 0 | 1]> = [];
  /** Doors and gates that swung open (1) or shut (0) this tick. */
  openChanges: Array<[number, 0 | 1]> = [];
  spotChanges: SpotView[] = [];
  private nextId = 1;
  private nextUid = 1;
  private readonly respawns: Array<{ spawn: number; tick: number }> = [];
  /** Random numbers in [0, 1): Math.random, or a fixed stand-in for tests. */
  private readonly rand: () => number;
  /** Every object on every plane, by its id. */
  private readonly objectById = new Map<number, MapObject>();
  /** Objects that fill a tile, by `tileKey`. */
  private readonly solid = new Map<number, MapObject>();
  /** Every plane's item spawns gathered into one list; the index is how a ground item names its spawn. */
  private readonly itemSpawns: ItemSpawn[] = [];
  /** Every plane's fishing waters gathered into one list, and the plane each sits on. */
  private readonly waters: Array<FishingWater & { plane: number }> = [];
  /** Doors and gates standing open, by object id, with the tick each shuts itself again. */
  readonly opened = new Map<number, number>();
  /** Ticks of chopping left before a tree can fall, for trees with a timer that isn't full. */
  private readonly life = new Map<number, number>();
  /** The last tick each tree was chopped. */
  private readonly choppedAt = new Map<number, number>();
  /** Fires burning now, by object id, with the tick each goes out. */
  private readonly fires = new Map<number, number>();
  /** Objects put into the world after the map was built (fires), for clients that arrive later. */
  readonly spawnedObjects: MapObject[] = [];
  /** Objects that left the world this tick. */
  goneObjects: number[] = [];
  /** The next id for an object the world creates. Map objects are numbered below this. */
  private nextObjectId = 1;
  private stepping = false;

  constructor(world: WorldStack | WorldMap, rand: () => number = Math.random) {
    const stack = asStack(world);
    this.stack = stack;
    this.map = stack.planes.get(0) ?? [...stack.planes.values()][0]!;
    this.spawn = stack.spawn;
    this.rand = rand;
    for (const map of stack.planes.values()) {
      for (const o of map.objects) {
        this.objectById.set(o.id, o);
        this.nextObjectId = Math.max(this.nextObjectId, o.id + 1);
      }
      for (const [key, o] of solidObjects(map)) this.solid.set(this.planeBase(map.plane) + key, o);
      for (const s of map.spawns) this.itemSpawns.push({ ...s, plane: s.plane ?? map.plane });
      for (const water of map.fishing) this.waters.push({ ...water, plane: water.plane ?? map.plane });
    }
    this.itemSpawns.forEach((_, i) => this.placeSpawn(i));
    for (const map of stack.planes.values()) {
      for (const s of map.monsters) {
        const def = MONSTER_BY_KEY.get(s.monster);
        const plane = s.plane ?? map.plane;
        if (def && canStand(map, s.x, s.y)) this.spawnNpc(def, s.x, s.y, plane);
      }
    }
    this.waters.forEach((water, w) => {
      const free = [...water.tiles];
      for (let n = 0; n < water.count && free.length > 0; n++) {
        const [t] = free.splice(this.pick(free.length), 1);
        this.spots.push({ id: this.spots.length, water: w, x: t!.x, y: t!.y, plane: water.plane, moveAt: this.between(SPOT_MOVE) });
      }
    });
  }

  /** The plane's map, or the ground plane when that plane is empty. */
  mapOf(plane: number): WorldMap {
    return planeOf(this.stack, plane);
  }

  /** Where a plane's tiles start in the keys `solid` and the wander sets use. */
  private planeBase(plane: number): number {
    return (plane + 8) * this.map.width * this.map.height;
  }

  /** One number naming a tile on a plane: what every per-tile lookup in the world is keyed by. */
  tileKey(x: number, y: number, plane: number): number {
    return this.planeBase(plane) + (y - this.map.originY) * this.map.width + (x - this.map.originX);
  }

  /** An object anywhere in the stack, by the id the protocol uses. */
  objectOf(id: number): MapObject | undefined {
    return this.objectById.get(id);
  }

  /** The object filling a tile, if one does: the same lookup the client does under the cursor. */
  objectAt(x: number, y: number, plane = 0): MapObject | undefined {
    return this.solid.get(this.tileKey(x, y, plane));
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
    const saved: Place | null = state.at ? { x: state.at.x, y: state.at.y, plane: state.at.plane ?? 0 } : null;
    // A character saved on a map this one replaced — the test map's tiles are all outside Oakridge —
    // is outside the world now, so it wakes on the green once, and only once (PLAN §7.1).
    const start = saved && canStandIn(this.stack, saved) ? saved : this.stack.spawn;
    const inventory = state.inventory ?? emptyInventory(), equipment = state.equipment ?? {};
    const xp = state.xp ?? noXp();
    const full = levelForXp(xp.hitpoints);
    const player: Player = {
      id: this.nextId++, name, look, lookTick: 0, gearTick: 0, x: start.x, y: start.y, plane: start.plane, planeTick: 0,
      run: state.run ?? false, energy: state.energy ?? MAX_ENERGY, inventory, equipment, weight: weightOf(inventory, equipment),
      xp, xpChanged: new Set(),
      path: [], walkTo: null, approach: null, chase: null, action: null, gathering: null, act: null, actTick: 0, fxTick: 0,
      moved: [], known: new Set(), knownItems: new Set(), messages: [], sounds: [], invDirty: true, equipDirty: true,
      screen: null, screenDirty: false, bank: state.bank ?? emptyBank(), making: null,
      quests: state.quests ?? noQuests(), tally: {}, questsDirty: false, follow: null,
      hp: clampHp(state.hp, full), target: null, nextAttack: 0, style: state.style ?? 0, retaliate: state.retaliate ?? true,
      hits: [], swung: false, hpTick: 0, deathTick: 0, riseTick: 0, nextRegen: this.tick + REGEN_TICKS, toleranceFrom: this.tick,
      prayer: clampHp(state.prayer, levelForXp(xp.prayer)), prayers: readPrayers(state.prayers), prayerDrain: 0, prayersDirty: false, shot: null,
    };
    this.players.set(player.id, player);
    return player;
  }

  setLook(player: Player, look: number[]): void {
    player.look = look;
    player.lookTick = this.tick + 1;
  }

  remove(id: number): void {
    // A trade they were in is called off, and their things go back to them before they go.
    const leaving = this.players.get(id), trade = this.trades.get(id);
    if (leaving && trade) this.cancelTrade(trade, leaving);
    this.tradeRequests.delete(id);
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
    player.chase = null;
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
  putDown(s: Stack, x: number, y: number, owner: string | null, plane = 0): void {
    let count = s.count;
    if (ITEM_BY_ID.get(s.id)?.stackable) {
      for (const it of this.ground.values()) {
        if (it.x === x && it.y === y && it.plane === plane && it.id === s.id && it.owner === owner && it.spawn === null) {
          count += it.count;
          this.ground.delete(it.uid);
          break;
        }
      }
    }
    const uid = this.nextUid++;
    this.ground.set(uid, {
      uid, id: s.id, count, x, y, plane, owner,
      publicTick: this.tick + PRIVATE_TICKS, despawnTick: this.tick + LIFETIME_TICKS, spawn: null,
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
    const s = this.itemSpawns[i]!;
    const def = ITEM_BY_KEY.get(s.item);
    if (!def) return;
    const uid = this.nextUid++;
    this.ground.set(uid, {
      uid, id: def.id, count: s.count, x: s.x, y: s.y, plane: s.plane ?? 0,
      owner: null, publicTick: 0, despawnTick: Infinity, spawn: i,
    });
  }

  /** Item ids worn in VISIBLE_GEAR order (0 for nothing), as other players draw them. */
  gearOf(p: Player): number[] {
    return VISIBLE_GEAR.map((where) => p.equipment[where]?.id ?? 0);
  }

  // --- Objects, fishing spots and gathering ---------------------------------------------------

  /** Walks up to a map object: to use the item in `useSlot` on it, or else to do its own first option. */
  interact(p: Player, id: number, useSlot: number | null = null): void {
    const o = this.objectById.get(id);
    if (!o || o.plane !== p.plane) return;
    let use: { slot: number; item: number } | null = null;
    if (useSlot !== null) {
      const s = p.inventory[useSlot];
      if (!s) return;
      use = { slot: useSlot, item: s.id };
    } else if (!this.hasOwnAction(o)) {
      return;
    }
    this.stopGathering(p);
    this.disengage(p);
    p.walkTo = null;
    p.approach = approachRect(o);
    p.action = { kind: "object", id: o.id, use };
  }

  /** Whether clicking an object on its own does anything: gather it, open it, climb it, work at it. */
  private hasOwnAction(o: MapObject): boolean {
    if (openable(o.kind) || climbable(o.kind)) return true;
    if (o.kind === "chest") return !this.depleted.has(o.id);
    if (STATION_OF[o.kind] !== undefined) return true;
    return RESOURCES[o.kind] !== undefined && !this.depleted.has(o.id);
  }

  /**
   * Standing beside an object with something in hand. Anything offered to a workbench opens that
   * bench's list — which is what every shipping game of this kind does, and saves teaching two ways
   * in. Everything else comes to nothing.
   */
  private useOnObject(p: Player, slot: number, o: MapObject): void {
    const station = STATION_OF[o.kind];
    if (station && station !== "bank" && station !== "shop" && station !== "mill" && station !== "altar") {
      this.openMake(p, station, o);
      return;
    }
    if (station === "bank") {
      this.openScreen(p, { kind: "bank" });
      return;
    }
    p.messages.push(NOTHING_COMES);
  }

  /**
   * One inventory item used on another. The only pair that means anything so far is a tinderbox and
   * logs: it sets a fire on the tile the player stands on (PLAN Phase 8, Firemaking).
   */
  useItems(p: Player, slot: number, on: number): void {
    const a = p.inventory[slot], b = p.inventory[on];
    if (!a || !b) return;
    const tinderbox = ITEM_BY_KEY.get("tinderbox")!.id;
    const logsSlot = a.id === tinderbox ? on : b.id === tinderbox ? slot : -1;
    if (logsSlot < 0) {
      p.messages.push(NOTHING_COMES);
      return;
    }
    this.lightFire(p, logsSlot);
  }

  /**
   * Lighting a fire. The logs go on the tile the player stands on; a tile that already carries an
   * object, or that a fire is already burning on, will not take another.
   */
  lightFire(p: Player, slot: number): void {
    const held = p.inventory[slot];
    const def = held ? ITEM_BY_ID.get(held.id) : undefined;
    const tier = def ? FIRE_BY_LOGS.get(def.key) : undefined;
    if (!def || !tier) {
      p.messages.push(NOTHING_COMES);
      return;
    }
    const level = levelForXp(p.xp.firemaking);
    if (level < tier.level) {
      p.messages.push(makeNeedsLevel(SKILL_NAME.firemaking, tier.level, def.name));
      return;
    }
    const map = this.mapOf(p.plane);
    if (this.solid.has(this.tileKey(p.x, p.y, p.plane)) || (map.collision.get(p.x, p.y) & BLOCKED) !== 0) {
      p.messages.push(NO_FIRE_HERE);
      return;
    }
    this.stopGathering(p);
    this.disengage(p);
    this.closeScreen(p);
    takeFrom(p.inventory, slot, 1);
    this.itemsChanged(p, false);
    this.addFire(p.x, p.y, p.plane, tier.ticks);
    this.giveXp(p, "firemaking", tier.xp);
    p.messages.push(FIRE_LIT);
  }

  /**
   * Puts a fire on a tile for a while. A fire is a real map object so it can be cooked on, seen by
   * everyone and walked around; it is added to the plane it burns on and taken away when it goes out.
   */
  private addFire(x: number, y: number, plane: number, ticks: number): MapObject {
    const map = this.mapOf(plane);
    const o: MapObject = { id: this.nextObjectId++, kind: "fire", x, y, plane, side: 0, variant: this.rand() };
    map.objects.push(o);
    map.collision.block(x, y);
    this.objectById.set(o.id, o);
    this.solid.set(this.tileKey(x, y, plane), o);
    this.fires.set(o.id, this.tick + ticks);
    this.objectChanges.push([o.id, 0]);
    this.spawnedObjects.push(o);
    return o;
  }

  /** A fire that has burnt down: off the map, off every client, and the tile is free again. */
  private removeFire(id: number): void {
    const o = this.objectById.get(id);
    this.fires.delete(id);
    if (!o) return;
    const map = this.mapOf(o.plane);
    const at = map.objects.indexOf(o);
    if (at >= 0) map.objects.splice(at, 1);
    map.collision.unblock(o.x, o.y);
    this.objectById.delete(id);
    this.solid.delete(this.tileKey(o.x, o.y, o.plane));
    const spawned = this.spawnedObjects.indexOf(o);
    if (spawned >= 0) this.spawnedObjects.splice(spawned, 1);
    this.goneObjects.push(id);
    for (const q of this.players.values()) if (q.making?.at.x === o.x && q.making.at.y === o.y) this.stopMaking(q, true);
  }

  /** Standing beside an object with nothing in hand: whatever that object's own first option is. */
  private reached(p: Player, o: MapObject): void {
    if (openable(o.kind)) {
      this.setOpen(o.id, !this.opened.has(o.id));
      return;
    }
    if (climbable(o.kind)) {
      this.climb(p, o);
      return;
    }
    if (o.kind === "chest") {
      this.searchChest(p, o);
      return;
    }
    const station = STATION_OF[o.kind];
    if (station) {
      this.openStation(p, o, station);
      return;
    }
    const def = RESOURCES[o.kind];
    if (def && !this.depleted.has(o.id)) {
      this.startGathering(p, def.method, { kind: "object", id: o.id }, oneTile(o.x, o.y), def.noun);
    }
  }

  /**
   * A door or gate swings. Opening it takes the wall off the tile edge on both tiles that share it;
   * shutting it puts the wall back. An open door shuts itself after DOOR_TICKS so a village left alone
   * does not end up standing wide open, which is what the classic's doors do.
   */
  setOpen(id: number, open: boolean): void {
    const o = this.objectById.get(id);
    if (!o || !openable(o.kind)) return;
    if (open === this.opened.has(id)) return;
    const collision = this.mapOf(o.plane).collision;
    if (open) {
      collision.removeWall(o.x, o.y, o.side);
      this.opened.set(id, this.tick + DOOR_TICKS);
    } else {
      collision.addWall(o.x, o.y, o.side);
      this.opened.delete(id);
    }
    this.openChanges.push([id, open ? 1 : 0]);
  }

  /**
   * Searching a chest (PLAN §8.5): one roll down its table, the same way a kill's main roll is made, and
   * the thing found goes straight into the pack. Then it stands open and empty, like a felled tree, until
   * its respawn brings it back. A full pack leaves it shut with everything still in it.
   */
  private searchChest(p: Player, o: MapObject): void {
    const def = o.tag !== undefined ? CHESTS[o.tag] : undefined;
    if (!def || this.depleted.has(o.id)) {
      p.messages.push(CHEST_EMPTY);
      return;
    }
    let roll = this.pick(CHEST_DENOMINATOR);
    let found: WeightedDrop | null = null;
    for (const drop of def.loot) {
      if (roll < drop.weight) {
        found = drop;
        break;
      }
      roll -= drop.weight;
    }
    const item = found ? ITEM_BY_KEY.get(found.item) : undefined;
    if (!found || !item) {
      p.messages.push(CHEST_EMPTY);
      return;
    }
    const min = found.min ?? 1, max = found.max ?? min;
    const count = min + (max > min ? this.pick(max - min + 1) : 0);
    if (!canHold(p.inventory, item.id, count)) {
      p.messages.push(PACK_FULL);
      return;
    }
    addItem(p.inventory, item.id, count);
    this.itemsChanged(p, false);
    p.messages.push(chestFound(item.name, count));
    this.depleted.set(o.id, this.tick + def.respawn);
    this.objectChanges.push([o.id, 1]);
  }

  /** Up a stair or down a ladder: onto the same tile of the plane it leads to, or the nearest free one. */
  private climb(p: Player, o: MapObject): void {
    const to = o.to ?? o.plane;
    const map = this.stack.planes.get(to);
    if (!map) {
      p.messages.push(NOTHING_COMES);
      return;
    }
    const at = this.nearestStanding(map, o.x, o.y);
    if (!at) {
      p.messages.push(NOTHING_COMES);
      return;
    }
    this.closeScreen(p);
    this.stopGathering(p);
    this.disengage(p);
    p.path = [];
    p.moved = [];
    p.x = at.x;
    p.y = at.y;
    this.setPlane(p, to);
  }

  /** The tile itself if it can be stood on, otherwise the nearest that can, out to four rings. */
  private nearestStanding(map: WorldMap, x: number, y: number): Tile | null {
    for (let ring = 0; ring <= 4; ring++) {
      for (let dy = -ring; dy <= ring; dy++) {
        for (let dx = -ring; dx <= ring; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
          if (canStand(map, x + dx, y + dy)) return { x: x + dx, y: y + dy };
        }
      }
    }
    return null;
  }

  /**
   * Moves a player to another plane. Everything their client knows is dropped, because a plane is a
   * whole separate scene: the server re-sends the world view and every entity in the next tick.
   */
  private setPlane(p: Player, plane: number): void {
    if (p.plane === plane) return;
    p.plane = plane;
    p.planeTick = this.seenTick;
    p.known.clear();
    p.knownItems.clear();
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

  /** Which of the four ways to fish a spot offers: whatever its water holds (PLAN §8.4). */
  private methodOf(s: Spot): FishingMethod {
    return this.waters[s.water]!.method;
  }

  private spotView(s: Spot): SpotView {
    return { id: s.id, x: s.x, y: s.y, method: this.methodOf(s) };
  }

  /**
   * What a client needs on arriving, and again whenever it changes plane: every object that has run out,
   * every door standing open, and the fishing spots on the plane it is now looking at.
   */
  worldView(plane: number): { depleted: number[]; spots: SpotView[]; opened: number[] } {
    return {
      depleted: [...this.depleted.keys()],
      opened: [...this.opened.keys()],
      spots: this.spots.filter((s) => s.plane === plane).map((s) => this.spotView(s)),
    };
  }

  // --- Screens: the bank, the shops, talking, and making things --------------------------------

  /** Shops are kept per world, not per player: everyone buys from the same shelf. */
  private readonly shops = new Map<string, ShopState>();

  private shopState(key: string): ShopState | null {
    if (!SHOPS[key]) return null;
    let shop = this.shops.get(key);
    if (!shop) {
      shop = newShop(key, this.tick);
      this.shops.set(key, shop);
    }
    return shop;
  }

  /** The shop a player has open, if the one they have open is a shop. */
  shopFor(p: Player): ShopState | null {
    return p.screen?.kind === "shop" ? this.shopState(p.screen.shop) : null;
  }

  /** Opens a screen, closing whatever was there. One at a time, as the classic has it. */
  private openScreen(p: Player, screen: Screen): void {
    this.stopMaking(p, false);
    p.screen = screen;
    p.screenDirty = true;
  }

  /** Closes whatever screen is open. Silent when there was none. A trade shut from either side is called off for both. */
  closeScreen(p: Player): void {
    this.stopMaking(p, false);
    if (!p.screen) return;
    if (p.screen.kind === "trade") {
      const trade = this.trades.get(p.id);
      if (trade) this.cancelTrade(trade, p);
    }
    p.screen = null;
    p.screenDirty = true;
  }

  /** Standing at a counter, a booth or a workbench: whatever that station is for. */
  private openStation(p: Player, o: MapObject, station: Station): void {
    if (station === "bank") {
      this.openScreen(p, { kind: "bank" });
      return;
    }
    if (station === "shop") {
      const key = o.tag ?? "";
      if (!this.shopState(key)) {
        p.messages.push(NOTHING_COMES);
        return;
      }
      this.openScreen(p, { kind: "shop", shop: key });
      return;
    }
    if (station === "mill") {
      p.messages.push(NOTHING_COMES);
      return;
    }
    if (station === "altar") {
      this.prayAt(p);
      return;
    }
    this.openMake(p, station, o);
  }

  /** The "make X" list for a workbench: everything it offers, whether or not the player can make it. */
  private openMake(p: Player, station: Station, o: MapObject): void {
    const recipes = recipesAt(station);
    if (recipes.length === 0) {
      p.messages.push(NOTHING_COMES);
      return;
    }
    this.openScreen(p, { kind: "make", station, title: MAKE_TITLE[station], recipes });
    p.making = null;
    this.makeAt.set(p.id, { x: o.x, y: o.y });
  }

  /** Where each player's open workbench stands, so walking away stops the work. */
  private readonly makeAt = new Map<number, Tile>();

  deposit(p: Player, slot: number, count: number): void {
    if (p.screen?.kind !== "bank") return;
    const err = depositItem(p.inventory, p.bank, slot, count);
    if (err) p.messages.push(err);
    else {
      this.itemsChanged(p, false);
      p.screenDirty = true;
    }
  }

  withdraw(p: Player, slot: number, count: number): void {
    if (p.screen?.kind !== "bank") return;
    const err = withdrawItem(p.inventory, p.bank, slot, count);
    if (err) p.messages.push(err);
    else {
      this.itemsChanged(p, false);
      p.screenDirty = true;
    }
  }

  buy(p: Player, slot: number, count: number): void {
    const shop = this.shopFor(p);
    if (!shop) return;
    const err = buyFrom(p.inventory, shop, slot, count);
    if (err) p.messages.push(err);
    else {
      this.itemsChanged(p, false);
      this.shopChanged(shop);
    }
  }

  sell(p: Player, slot: number, count: number): void {
    const shop = this.shopFor(p);
    if (!shop) return;
    const err = sellTo(p.inventory, shop, slot, count);
    if (err) p.messages.push(err);
    else {
      this.itemsChanged(p, false);
      this.shopChanged(shop);
    }
  }

  /** A shop's shelf changed, so everyone standing at that counter sees it. */
  private shopChanged(shop: ShopState): void {
    for (const q of this.players.values()) if (q.screen?.kind === "shop" && q.screen.shop === shop.key) q.screenDirty = true;
  }

  /** Walks over to a person and opens what they have to say. */
  talk(p: Player, id: number): void {
    const n = this.npcs.get(id);
    if (!n || !this.inWorld(n) || n.plane !== p.plane) return;
    if (!n.def.talk || !DIALOGUE[n.def.talk]) {
      p.messages.push(NOTHING_TO_SAY);
      return;
    }
    this.stopGathering(p);
    this.disengage(p);
    this.closeScreen(p);
    p.walkTo = null;
    p.approach = null;
    p.chase = { x: n.x, y: n.y };
    p.action = { kind: "talk", id };
  }

  /** Standing beside the person: the conversation opens at its first node, or where that node's branches send this player. */
  private reachedNpc(p: Player, n: Npc): void {
    const tree = n.def.talk ? DIALOGUE[n.def.talk] : undefined;
    if (!tree?.[DIALOGUE_START]) {
      p.messages.push(NOTHING_TO_SAY);
      return;
    }
    this.openScreen(p, { kind: "talk", npc: n.id, node: this.landOn(tree, DIALOGUE_START, p) });
  }

  /**
   * Answering the open dialogue: -1 closes it, anything else follows that option — by its place among
   * the options this player was shown, since a hidden one is not there to be chosen. What the option
   * does happens first, then the conversation moves on.
   */
  answer(p: Player, option: number): void {
    if (p.screen?.kind !== "talk") return;
    const n = this.npcs.get(p.screen.npc);
    const tree = n?.def.talk ? DIALOGUE[n.def.talk] : undefined;
    const node = tree?.[p.screen.node];
    if (!tree || !node || option < 0) {
      this.closeScreen(p);
      return;
    }
    const chosen = this.visibleOptions(p, node)[option];
    if (!chosen) {
      this.closeScreen(p);
      return;
    }
    for (const effect of chosen.do ?? []) this.applyEffect(p, effect);
    if (chosen.act === "bank") {
      this.openScreen(p, { kind: "bank" });
      return;
    }
    if (chosen.act === "shop") {
      const key = n!.def.shop ?? "";
      if (this.shopState(key)) this.openScreen(p, { kind: "shop", shop: key });
      else this.closeScreen(p);
      return;
    }
    if (chosen.act === "close" || !chosen.to || !tree[chosen.to]) {
      this.closeScreen(p);
      return;
    }
    p.screen = { kind: "talk", npc: p.screen.npc, node: this.landOn(tree, chosen.to, p) };
    p.screenDirty = true;
  }

  /** The dialogue box a player should be shown, or null when nothing is open. */
  dialogueFor(p: Player): { speaker: string; lines: string[]; options: string[]; npc: string } | null {
    if (p.screen?.kind !== "talk") return null;
    const n = this.npcs.get(p.screen.npc);
    const node = n?.def.talk ? DIALOGUE[n.def.talk]?.[p.screen.node] : undefined;
    if (!n || !node) return null;
    return { speaker: n.def.name, lines: node.lines, options: this.visibleOptions(p, node).map((o) => o.text), npc: n.def.key };
  }

  // --- Following and trading (PLAN Phase 10) ---------------------------------------------------------

  /** Trades under way, by either player's id, and requests waiting for the other to take them up. */
  private readonly trades = new Map<number, Trade>();
  private readonly tradeRequests = new Map<number, { to: number; tick: number }>();

  /** Whether two players stand within a step of each other. */
  private beside(p: Player, q: Player): boolean {
    return Math.max(Math.abs(p.x - q.x), Math.abs(p.y - q.y)) <= 1;
  }

  /** Walks after another player and keeps beside them until something else is asked for. */
  follow(p: Player, id: number): void {
    const q = this.players.get(id);
    if (!q || q === p || q.plane !== p.plane) return;
    this.stopGathering(p);
    this.disengage(p);
    this.closeScreen(p);
    p.walkTo = null;
    p.approach = null;
    p.action = null;
    p.follow = id;
  }

  /** Walks up to another player to offer a trade, or to take up theirs. */
  trade(p: Player, id: number): void {
    const q = this.players.get(id);
    if (!q || q === p || q.plane !== p.plane) return;
    this.stopGathering(p);
    this.disengage(p);
    this.closeScreen(p);
    p.follow = null;
    p.walkTo = null;
    p.approach = null;
    p.chase = { x: q.x, y: q.y };
    p.action = { kind: "trade", id };
  }

  /**
   * Beside the other player: if they have asked to trade with us lately, the trade opens for both;
   * otherwise our request is noted and they are told, and it waits for them to ask back.
   */
  private requestTrade(p: Player, q: Player): void {
    if (this.trades.has(p.id) || this.trades.has(q.id)) {
      p.messages.push(BUSY_TRADING);
      return;
    }
    const theirs = this.tradeRequests.get(q.id);
    if (theirs && theirs.to === p.id && this.tick - theirs.tick <= TRADE_REQUEST_TICKS) {
      this.tradeRequests.delete(q.id);
      this.tradeRequests.delete(p.id);
      this.openTrade(p, q);
      return;
    }
    this.tradeRequests.set(p.id, { to: q.id, tick: this.tick });
    p.messages.push(tradeSent(q.name));
    q.messages.push(tradeWish(p.name));
  }

  private openTrade(p: Player, q: Player): void {
    const trade: Trade = { a: p.id, b: q.id, offers: new Map([[p.id, []], [q.id, []]]), accepted: new Set(), stage: "offer" };
    this.trades.set(p.id, trade);
    this.trades.set(q.id, trade);
    this.openScreen(p, { kind: "trade" });
    this.openScreen(q, { kind: "trade" });
  }

  /** The trade screen a player should be shown, or null when they are not in one. */
  tradeFor(p: Player): { with: string; mine: Offered[]; theirs: Offered[]; stage: "offer" | "confirm"; accepted: [boolean, boolean] } | null {
    const trade = this.trades.get(p.id);
    if (!trade || p.screen?.kind !== "trade") return null;
    const otherId = trade.a === p.id ? trade.b : trade.a;
    const other = this.players.get(otherId);
    if (!other) return null;
    return {
      with: other.name, mine: trade.offers.get(p.id) ?? [], theirs: trade.offers.get(otherId) ?? [], stage: trade.stage,
      accepted: [trade.accepted.has(p.id), trade.accepted.has(otherId)],
    };
  }

  /** Anything on the table changed: nobody has accepted the new table, and both screens are drawn again. */
  private tradeChanged(trade: Trade): void {
    trade.accepted.clear();
    for (const id of [trade.a, trade.b]) {
      const p = this.players.get(id);
      if (p) p.screenDirty = true;
    }
  }

  /** Puts `count` of an inventory slot's item on the table (-1 for every one of it), out of the pack until the trade ends. */
  tradeOffer(p: Player, slot: number, count: number): void {
    const trade = this.trades.get(p.id);
    if (!trade || p.screen?.kind !== "trade" || trade.stage !== "offer") return;
    const held = p.inventory[slot];
    if (!held) return;
    const have = countOf(p.inventory, held.id);
    const n = count === -1 ? have : Math.min(count, have);
    if (n <= 0 || !spendItem(p.inventory, held.id, n)) return;
    const mine = trade.offers.get(p.id)!;
    const line = mine.find((o) => o.id === held.id);
    if (line) line.count += n;
    else mine.push({ id: held.id, count: n });
    this.packChanged(p);
    this.tradeChanged(trade);
  }

  /** Takes `count` of one of the player's own offered lines back into the pack (-1 for all of it). */
  tradeTake(p: Player, index: number, count: number): void {
    const trade = this.trades.get(p.id);
    if (!trade || p.screen?.kind !== "trade" || trade.stage !== "offer") return;
    const mine = trade.offers.get(p.id)!;
    const line = mine[index];
    if (!line) return;
    const n = count === -1 ? line.count : Math.min(count, line.count);
    if (n <= 0) return;
    if (!canHold(p.inventory, line.id, n)) {
      p.messages.push(NO_ROOM);
      return;
    }
    addItem(p.inventory, line.id, n);
    line.count -= n;
    if (line.count === 0) mine.splice(index, 1);
    this.packChanged(p);
    this.tradeChanged(trade);
  }

  /**
   * Accepting: on the offer screen, both accepting moves the trade to its confirmation; on that, both
   * accepting makes the exchange, if each has the room for what the other offered. Nothing moves
   * until both have said yes twice.
   */
  tradeAccept(p: Player): void {
    const trade = this.trades.get(p.id);
    if (!trade || p.screen?.kind !== "trade") return;
    trade.accepted.add(p.id);
    if (trade.accepted.size < 2) {
      for (const id of [trade.a, trade.b]) {
        const q = this.players.get(id);
        if (q) q.screenDirty = true;
      }
      return;
    }
    if (trade.stage === "offer") {
      trade.stage = "confirm";
      this.tradeChanged(trade);
      return;
    }
    this.completeTrade(trade);
  }

  private completeTrade(trade: Trade): void {
    const a = this.players.get(trade.a), b = this.players.get(trade.b);
    if (!a || !b) return;
    const fits = (p: Player, incoming: Offered[]) => {
      const copy = p.inventory.map((s) => (s ? { ...s } : null));
      return incoming.every((o) => addItem(copy, o.id, o.count) === 0);
    };
    const toA = trade.offers.get(b.id) ?? [], toB = trade.offers.get(a.id) ?? [];
    const short = !fits(a, toA) ? a : !fits(b, toB) ? b : null;
    if (short) {
      a.messages.push(noRoomFor(short.name));
      b.messages.push(noRoomFor(short.name));
      trade.stage = "offer";
      this.tradeChanged(trade);
      return;
    }
    this.trades.delete(a.id);
    this.trades.delete(b.id);
    for (const o of toA) addItem(a.inventory, o.id, o.count);
    for (const o of toB) addItem(b.inventory, o.id, o.count);
    for (const p of [a, b]) {
      this.packChanged(p);
      p.messages.push(TRADE_DONE);
      p.screen = null;
      p.screenDirty = true;
    }
  }

  /** The trade called off by `by`: everything on the table goes back to whoever put it there, and the other is told. */
  private cancelTrade(trade: Trade, by: Player): void {
    // Out of the map first, or closing the other's screen would call this off again.
    this.trades.delete(trade.a);
    this.trades.delete(trade.b);
    for (const id of [trade.a, trade.b]) {
      const p = this.players.get(id);
      if (!p) continue;
      for (const o of trade.offers.get(id) ?? []) {
        const left = addItem(p.inventory, o.id, o.count);
        if (left > 0) this.putDown({ id: o.id, count: left }, p.x, p.y, p.name, p.plane);
      }
      this.packChanged(p);
      if (p !== by) {
        p.messages.push(tradeDeclined(by.name));
        if (p.screen?.kind === "trade") {
          p.screen = null;
          p.screenDirty = true;
        }
      }
    }
  }

  // --- Conditions, effects and quests (PLAN Phase 9) ------------------------------------------------

  /** Whether one condition of a dialogue holds for this player. */
  private holds(p: Player, c: Condition): boolean {
    if ("quest" in c) {
      const stage = stageOf(p.quests, c.quest);
      if ("stage" in c) return stage === c.stage;
      if ("atLeast" in c) return stage >= c.atLeast;
      return stage < c.below;
    }
    if ("has" in c) {
      const def = ITEM_BY_KEY.get(c.has);
      return def !== undefined && countOf(p.inventory, def.id) >= (c.count ?? 1);
    }
    return (p.tally[c.tally] ?? 0) >= c.count;
  }

  private allHold(p: Player, list: Condition[] | undefined): boolean {
    return (list ?? []).every((c) => this.holds(p, c));
  }

  /** The node a conversation lands on: the one named, or where its branches send this player — the first whose conditions all hold. */
  private landOn(tree: DialogueTree, name: string, p: Player): string {
    const node = tree[name];
    if (!node) return name;
    for (const b of node.branch ?? []) if (tree[b.to] && this.allHold(p, b.when)) return b.to;
    return name;
  }

  /** The options this player is offered: those with no conditions, and those whose conditions all hold. */
  private visibleOptions(p: Player, node: DialogueNode): DialogueOption[] {
    return (node.options ?? []).filter((o) => this.allHold(p, o.when));
  }

  /** What an option does: a quest's stage set, things taken or given, XP, a line said. */
  private applyEffect(p: Player, e: Effect): void {
    if ("quest" in e) {
      const q = QUEST_BY_KEY.get(e.quest);
      if (!q) return;
      const before = stageOf(p.quests, e.quest);
      p.quests[e.quest] = e.stage;
      p.tally = {};
      p.questsDirty = true;
      if (isComplete(q, e.stage) && !isComplete(q, before)) {
        p.messages.push(questComplete(q.name), questPointsLine(q.points, questPoints(p.quests)));
        p.fxTick = this.seenTick;
      } else if (before === 0 && e.stage > 0) {
        p.messages.push(questBegun(q.name));
      }
      return;
    }
    if ("take" in e) {
      const def = ITEM_BY_KEY.get(e.take);
      if (def && spendItem(p.inventory, def.id, e.count ?? 1)) this.packChanged(p);
      return;
    }
    if ("give" in e) {
      const def = ITEM_BY_KEY.get(e.give);
      if (def) this.giveOrDrop(p, { id: def.id, count: e.count ?? 1 });
      return;
    }
    if ("xp" in e) {
      this.giveXp(p, e.xp, e.tenths);
      return;
    }
    p.messages.push(e.say);
  }

  /** Something into the pack, or at the player's feet when it will not fit: a reward is never refused for want of room. */
  private giveOrDrop(p: Player, s: Stack): void {
    if (canHold(p.inventory, s.id, s.count)) {
      addItem(p.inventory, s.id, s.count);
      this.packChanged(p);
    } else {
      this.putDown(s, p.x, p.y, p.name, p.plane);
    }
  }

  private packChanged(p: Player): void {
    p.invDirty = true;
    p.weight = weightOf(p.inventory, p.equipment);
  }

  /**
   * Starting a run of making: the list says how many the player can manage, and one lands every
   * MAKE_TICKS until the count runs out, the materials do, or they walk away.
   */
  make(p: Player, option: number, count: number): void {
    if (p.screen?.kind !== "make") return;
    const station = p.screen.station;
    // The client names a line of the list it was sent, not a recipe: the list's order is the server's.
    const index = p.screen.recipes[option];
    const recipe = index === undefined ? undefined : RECIPES[index];
    if (index === undefined || !recipe) return;
    const at = this.makeAt.get(p.id);
    if (!at) return;
    const can = this.canMakeNow(p, recipe);
    if (can.left === 0) {
      p.messages.push(can.why);
      return;
    }
    const want = count === -1 ? can.left : Math.min(count, can.left);
    this.closeScreen(p);
    p.making = { recipe: index, left: want, nextAt: this.tick + 1, station, at };
    this.setAct(p, { anim: MAKE_ANIM[station], tool: this.makeTool(recipe), x: at.x, y: at.y });
  }

  /** How many of a recipe the player could make now, and the reason when the answer is none. */
  canMakeNow(p: Player, recipe: Recipe): { left: number; why: string } {
    const made = ITEM_BY_KEY.get(recipe.item);
    if (!made) return { left: 0, why: NOTHING_COMES };
    const level = levelForXp(p.xp[recipe.skill]);
    if (level < recipe.level) return { left: 0, why: makeNeedsLevel(SKILL_NAME[recipe.skill], recipe.level, made.name) };
    if (recipe.tool && countOf(p.inventory, ITEM_BY_KEY.get(recipe.tool)!.id) === 0) {
      return { left: 0, why: needMaterials(made.name) };
    }
    let left = Infinity;
    for (const ing of recipe.needs) {
      const def = ITEM_BY_KEY.get(ing.item);
      if (!def) return { left: 0, why: NOTHING_COMES };
      left = Math.min(left, Math.floor(countOf(p.inventory, def.id) / ing.count));
    }
    if (!Number.isFinite(left) || left <= 0) return { left: 0, why: needMaterials(made.name) };
    return { left, why: "" };
  }

  /** The item shown in the maker's hand: the recipe's own tool, or nothing. */
  private makeTool(recipe: Recipe): number {
    return recipe.tool ? ITEM_BY_KEY.get(recipe.tool)?.id ?? 0 : 0;
  }

  /** One tick of a run of making: spend the materials, roll for a burn if it can burn, pay the XP. */
  private stepMaking(p: Player): void {
    const job = p.making;
    if (!job) return;
    // Walking away, or being pulled into a fight, ends it.
    if (p.moved.length > 0 || p.target !== null || !reaches(this.mapOf(p.plane).collision, p.x, p.y, oneTile(job.at.x, job.at.y))) {
      this.stopMaking(p, true);
      return;
    }
    if (this.tick < job.nextAt) return;
    const recipe = RECIPES[job.recipe]!;
    const can = this.canMakeNow(p, recipe);
    if (can.left === 0) {
      p.messages.push(can.left === 0 && can.why ? can.why : NOTHING_LEFT);
      this.stopMaking(p, false);
      return;
    }
    const made = ITEM_BY_KEY.get(recipe.item)!;
    if (!canHold(p.inventory, made.id, recipe.each)) {
      p.messages.push(PACK_FULL);
      this.stopMaking(p, false);
      return;
    }
    for (const ing of recipe.needs) spendItem(p.inventory, ITEM_BY_KEY.get(ing.item)!.id, ing.count);
    const level = levelForXp(p.xp[recipe.skill]);
    const ruined = recipe.burnt !== undefined && this.rand() < burnChance(recipe, level);
    if (ruined) {
      addItem(p.inventory, ITEM_BY_KEY.get(recipe.burnt!)!.id, 1);
      p.messages.push(burnt(made.name));
    } else {
      addItem(p.inventory, made.id, recipe.each);
      p.messages.push(MAKE_MESSAGE[job.station](made.name));
      this.giveXp(p, recipe.skill, recipe.xp);
    }
    this.itemsChanged(p, false);
    job.left--;
    job.nextAt = this.tick + MAKE_TICKS;
    if (job.left <= 0) this.stopMaking(p, false);
  }

  /** Ends a run of making. `say` adds the line that explains why, for the times it was interrupted. */
  private stopMaking(p: Player, say: boolean): void {
    if (!p.making) return;
    p.making = null;
    this.makeAt.delete(p.id);
    if (p.act?.anim === "make") this.setAct(p, null);
    if (say) p.messages.push(STOPPED_MAKING);
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
    if (target.kind === "spot") return CATCHES[this.methodOf(this.spots[target.id]!)];
    return [RESOURCES[this.objectById.get(target.id)!.kind]!.yields];
  }

  /** A method that spends something (a rod's bait) and the player has none left: what to tell them. */
  private outOfSupply(p: Player, method: MethodName): boolean {
    const spends = METHODS[method].spends;
    return spends !== undefined && countOf(p.inventory, ITEM_BY_KEY.get(spends)!.id) === 0;
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
    if (this.outOfSupply(p, method)) {
      p.messages.push(NEED_BAIT);
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
    if (this.outOfSupply(p, g.method)) {
      p.messages.push(NEED_BAIT);
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
    if (m.spends) spendItem(p.inventory, ITEM_BY_KEY.get(m.spends)!.id, 1);
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
    const life = RESOURCES[this.objectById.get(id)!.kind]!.life;
    if (life > 0) this.life.set(id, Math.max(0, (this.life.get(id) ?? life) - 1));
  }

  /** After an object gives something: it runs out (a tree only once its timer is spent) and everyone working it stops. */
  private yielded(id: number): void {
    const def = RESOURCES[this.objectById.get(id)!.kind]!;
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
      const full = RESOURCES[this.objectById.get(id)!.kind]!.life;
      if (left + 1 >= full) this.life.delete(id);
      else this.life.set(id, left + 1);
    }
  }

  /** Moves a spot to another free tile of its water. Whoever was fishing it stops; whoever was walking to it follows. */
  private moveSpot(s: Spot): void {
    s.moveAt = this.tick + this.between(SPOT_MOVE);
    const taken = new Set(this.spots.filter((o) => o.water === s.water).map((o) => this.tileKey(o.x, o.y, o.plane)));
    const free = this.waters[s.water]!.tiles.filter((t) => !taken.has(this.tileKey(t.x, t.y, s.plane)));
    if (free.length === 0) return;
    const t = free[this.pick(free.length)]!;
    s.x = t.x;
    s.y = t.y;
    this.spotChanges.push(this.spotView(s));
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
      ranged: levelForXp(p.xp.ranged), magic: levelForXp(p.xp.magic), prayer: levelForXp(p.xp.prayer),
    });
  }

  /** Which family of styles the player's held weapon offers; bare hands for anything that isn't one. */
  weaponClassOf(p: Player): WeaponClassName {
    return ITEM_BY_ID.get(p.equipment.weapon?.id ?? 0)?.equip?.weapon ?? DEFAULT_CLASS;
  }

  /** The style the player is fighting in, from the weapon's list. */
  private styleOf(p: Player): Style {
    return styleAt(this.weaponClassOf(p), p.style);
  }

  /** Ticks between this player's swings. */
  private speedOf(p: Player): number {
    return speedOf(this.weaponClassOf(p), this.styleOf(p));
  }

  /** How far this player's style reaches: beside the target for a hand weapon, tiles away for a bow or a spell. */
  private reachOf(p: Player): number {
    return rangeOf(this.styleOf(p));
  }

  private fighterOfPlayer(p: Player, bonuses: Bonuses): Fighter {
    const arrow = ITEM_BY_ID.get(p.equipment.ammo?.id ?? 0);
    return {
      attack: levelForXp(p.xp.attack), strength: levelForXp(p.xp.strength), defence: levelForXp(p.xp.defence),
      ranged: levelForXp(p.xp.ranged), magic: levelForXp(p.xp.magic),
      bonuses, rangedStrength: arrow?.equip?.slot === "ammo" ? (arrow.equip.bonuses?.[4] ?? 0) : 0,
      boosts: boostsOf(p.prayers), stance: this.styleOf(p).stance,
    };
  }

  /**
   * A creature as the rolls see it. Its own bonus counts on offence in its own type of blow only, and on
   * defence against whichever type is coming at it, so the arrays are built per roll. An arrow or a
   * spell meets its crush number: a creature has no armour to draw a bolt or turn an arrow.
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
      bonuses[8] = d.defenceBonus.crush;
      bonuses[9] = d.defenceBonus.crush;
    }
    return { attack: d.attack, strength: d.strength, defence: d.defence, ranged: 1, magic: 1, bonuses, rangedStrength: 0, boosts: {}, stance: null };
  }

  /** Melee range: orthogonally beside it, with no wall on the edge between. Never off a corner. */
  private inMeleeRange(a: Player | Npc, b: Player | Npc): boolean {
    return a.plane === b.plane && besides(this.mapOf(a.plane).collision, a.x, a.y, b.x, b.y);
  }

  /**
   * Whether a player's blow can reach the target from where they stand: beside it for a hand weapon;
   * within the style's tiles with a clear line for an arrow or a spell. The line is walked tile by tile
   * the way a step would be, so a wall or a tree in the way stops it — a shot never goes through a wall.
   */
  private inReach(p: Player, target: Player | Npc): boolean {
    const range = this.reachOf(p);
    if (range <= 1) return this.inMeleeRange(p, target);
    if (p.plane !== target.plane || this.chebyshev(p.x, p.y, target.x, target.y) > range) return false;
    return this.clearLine(p.plane, p.x, p.y, target.x, target.y);
  }

  /** Whether nothing solid lies on the straight line between two tiles, stepping it as a walk would. */
  private clearLine(plane: number, x0: number, y0: number, x1: number, y1: number): boolean {
    const collision = this.mapOf(plane).collision;
    const dx = x1 - x0, dy = y1 - y0, n = Math.max(Math.abs(dx), Math.abs(dy));
    let x = x0, y = y0;
    for (let i = 1; i <= n; i++) {
      const nx = x0 + Math.round((dx * i) / n), ny = y0 + Math.round((dy * i) / n);
      if (nx === x && ny === y) continue;
      if (!collision.canStep(x, y, nx - x, ny - y)) return false;
      x = nx;
      y = ny;
    }
    return true;
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
    // The people of Oakridge are not creatures: nobody swings at them (PLAN §7.4).
    if (target.def.person) {
      p.messages.push(NO_DUELLING);
      return;
    }
    // A creature already fighting someone else is theirs until that fight ends.
    if (target.target !== null && target.target !== p.id && this.alive(this.entityAt(target.target))) {
      p.messages.push(ALREADY_FIGHTING);
      return;
    }
    this.stopGathering(p);
    this.closeScreen(p);
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

  /** An item's own action from the pack: food is eaten, bones are buried, anything else comes to nothing. */
  use(p: Player, slot: number): string {
    const def = ITEM_BY_ID.get(p.inventory[slot]?.id ?? 0);
    if (def?.action === "Eat") return this.eat(p, slot);
    if (def?.action === "Bury") return this.bury(p, slot);
    return NOTHING_COMES;
  }

  /** Buries bones (PLAN Phase 11): Prayer XP, and a new Prayer level is a new point on the spot. */
  bury(p: Player, slot: number): string {
    const def = ITEM_BY_ID.get(p.inventory[slot]?.id ?? 0);
    if (!def || def.action !== "Bury") return NOTHING_COMES;
    takeFrom(p.inventory, slot, 1);
    const before = levelForXp(p.xp.prayer);
    this.giveXp(p, "prayer", def.prayerXp ?? 0);
    if (levelForXp(p.xp.prayer) > before) p.prayer = Math.min(this.maxPrayerOf(p), p.prayer + 1);
    p.sounds.push("drop");
    this.itemsChanged(p, false);
    return BURIED;
  }

  // --- Prayer (PLAN Phase 11) ----------------------------------------------------------------

  /** A player's full prayer points: their Prayer level. */
  maxPrayerOf(p: Player): number {
    return levelForXp(p.xp.prayer);
  }

  /**
   * A prayer switched on or off. Turning one on needs its level and a point to spend, and turns off
   * any other prayer on the same skill; the client is always told the set afterwards, so a refused
   * toggle snaps back.
   */
  pray(p: Player, key: string, on: boolean): void {
    const prayer = PRAYER_BY_KEY.get(key as PrayerKey);
    if (!prayer) return;
    p.prayersDirty = true;
    if (!on) {
      p.prayers.delete(prayer.key);
      return;
    }
    if (p.prayers.has(prayer.key)) return;
    if (levelForXp(p.xp.prayer) < prayer.level) {
      p.messages.push(prayerNeeds(prayer.level, prayer.name));
      return;
    }
    if (p.prayer <= 0) {
      p.messages.push(PRAYER_SPENT);
      return;
    }
    for (const other of p.prayers) if (PRAYER_BY_KEY.get(other)!.skill === prayer.skill) p.prayers.delete(other);
    p.prayers.add(prayer.key);
  }

  /** The prayers that are on cost their points as the ticks go by; at nothing, every one goes out. */
  private drainPrayer(p: Player): void {
    if (p.prayers.size === 0) return;
    p.prayerDrain += drainPerTick(p.prayers, bonusesOf(p.equipment)[PRAYER_BONUS] ?? 0);
    while (p.prayerDrain >= 1) {
      p.prayerDrain -= 1;
      p.prayer = Math.max(0, p.prayer - 1);
    }
    if (p.prayer === 0) {
      p.prayers.clear();
      p.prayersDirty = true;
      p.prayerDrain = 0;
      p.messages.push(PRAYER_SPENT);
    }
  }

  /** Praying at an altar puts every point back. */
  private prayAt(p: Player): void {
    const full = this.maxPrayerOf(p);
    if (p.prayer >= full) {
      p.messages.push(PRAYER_FULL);
      return;
    }
    p.prayer = full;
    p.messages.push(PRAYER_RESTORED);
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
  private spawnNpc(def: MonsterDef, x: number, y: number, plane = 0): Npc {
    const npc: Npc = {
      id: this.nextId++, def, home: { x, y }, x, y, plane, hp: def.hitpoints, target: null, nextAttack: 0,
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
    for (const n of this.npcs.values()) if (n.deathTick === 0) taken.add(this.tileKey(n.x, n.y, n.plane));
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
    if (n.def.aggro === 0 || n.def.person) return;
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
      if (this.inMeleeRange(n, target)) return;
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
    taken.delete(this.tileKey(n.x, n.y, n.plane));
    n.x = step.x;
    n.y = step.y;
    n.moved.push(step);
    taken.add(this.tileKey(n.x, n.y, n.plane));
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
    const collision = this.mapOf(n.plane).collision;
    for (const [sx, sy] of tries) {
      const nx = n.x + sx, ny = n.y + sy;
      if (!collision.canStep(n.x, n.y, sx, sy)) continue;
      if (taken.has(this.tileKey(nx, ny, n.plane))) continue;
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
      if (!canStand(this.mapOf(n.plane), x, y) || taken.has(this.tileKey(x, y, n.plane))) continue;
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
    taken.add(this.tileKey(at.x, at.y, n.plane));
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
      if (!this.inReach(p, target)) continue;
      // In range and standing still: face it, and stop whatever else was going on.
      this.stopGathering(p);
      p.path = [];
      this.setAct(p, { anim: "fight", tool: p.equipment.weapon?.id ?? 0, x: target.x, y: target.y });
      if (this.tick < p.nextAttack) continue;
      const style = this.styleOf(p);
      if (style.type === "ranged") {
        if (!this.loose(p, target, style)) this.disengage(p);
        continue;
      }
      if (style.type === "magic") {
        if (!this.cast(p, target, style)) this.disengage(p);
        continue;
      }
      p.nextAttack = this.tick + this.speedOf(p);
      p.swung = true;
      const damage = swing(this.fighterOfPlayer(p, bonusesOf(p.equipment)), this.fighterOfNpc(target, "defence"), style.type, this.rand);
      // XP is paid per point of damage DEALT, so a blow that lands for nothing earns nothing, and a
      // killing blow earns what the creature had left rather than what the roll came to.
      const dealt = this.landOnNpc(target, damage, p);
      if (dealt > 0) {
        for (const [skill, amount] of Object.entries(styleXp(style.stance))) this.giveXp(p, skill as SkillKey, amount * dealt);
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
      if (!this.inMeleeRange(n, target)) continue;
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

  /**
   * An arrow loosed (PLAN Phase 11): one off the quiver a shot, and the shot is told to viewers. With
   * nothing in the quiver there is no shot, and the caller stands the archer down.
   */
  private loose(p: Player, target: Npc, style: Style): boolean {
    const quiver = p.equipment.ammo;
    if (!quiver || ITEM_BY_ID.get(quiver.id)?.equip?.slot !== "ammo") {
      p.messages.push(NO_ARROWS);
      return false;
    }
    p.nextAttack = this.tick + this.speedOf(p);
    p.swung = true;
    p.shot = { to: target.id, kind: "arrow" };
    const damage = swing(this.fighterOfPlayer(p, bonusesOf(p.equipment)), this.fighterOfNpc(target, "defence"), "ranged", this.rand);
    quiver.count -= 1;
    if (quiver.count <= 0) delete p.equipment.ammo;
    this.itemsChanged(p, true);
    const dealt = this.landOnNpc(target, damage, p);
    if (dealt > 0) {
      for (const [skill, amount] of Object.entries(styleXp(style.stance))) this.giveXp(p, skill as SkillKey, amount * dealt);
    }
    return true;
  }

  /**
   * A spell cast (PLAN Phase 11): the style's spell, needing its Magic level and one of its reagent,
   * which is spent whether or not the bolt lands. The cast pays its own Magic XP; damage pays more.
   */
  private cast(p: Player, target: Npc, style: Style): boolean {
    const spell = SPELLS[style.spell!];
    if (levelForXp(p.xp.magic) < spell.level) {
      p.messages.push(spellNeeds(spell.level, spell.name));
      return false;
    }
    const reagent = ITEM_BY_KEY.get(spell.reagent)!;
    if (!spendItem(p.inventory, reagent.id, 1)) {
      p.messages.push(noReagent(reagent.name));
      return false;
    }
    this.itemsChanged(p, false);
    p.nextAttack = this.tick + this.speedOf(p);
    p.swung = true;
    p.shot = { to: target.id, kind: spell.bolt };
    const damage = swing(this.fighterOfPlayer(p, bonusesOf(p.equipment)), this.fighterOfNpc(target, "defence"), "magic", this.rand, spell.maxHit);
    const dealt = this.landOnNpc(target, damage, p);
    this.giveXp(p, "magic", spell.xp + SPELL_DAMAGE_XP * dealt);
    if (dealt > 0) this.giveXp(p, "hitpoints", HITPOINTS_XP * dealt);
    return true;
  }

  /**
   * A blow landing on a creature. Returns what it actually took off it: a roll bigger than the life
   * left in it counts for what was there, as the classic's hitsplat does, or a killing blow is shown
   * and paid for as though the creature had more to give than it had.
   */
  private landOnNpc(n: Npc, damage: number, by: Player): number {
    const dealt = Math.min(damage, n.hp);
    n.hits.push(dealt);
    if (dealt > 0) {
      this.setHp(n, n.hp - dealt);
      n.damage.set(by.id, (n.damage.get(by.id) ?? 0) + dealt);
    }
    // Being hit turns a creature on whoever hit it, unless it is already busy with someone.
    if (n.target === null || !this.alive(this.entityAt(n.target))) n.target = by.id;
    if (n.hp === 0) this.killNpc(n);
    return dealt;
  }

  /** The same for a blow landing on a player: it counts for the hitpoints they had, and no more. */
  private landOnPlayer(p: Player, damage: number, by: Npc): void {
    const dealt = Math.min(damage, p.hp);
    p.hits.push(dealt);
    if (dealt > 0) {
      this.setHp(p, p.hp - dealt);
      p.sounds.push("hurt");
      // Defending trains Defence, whether or not the blow is being answered.
      this.giveXp(p, "defence", DEFENCE_XP * dealt);
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
    if (best) {
      best.messages.push(defeated(n.def.name));
      // The kill is theirs, as the loot is: what a quest's "three since I asked" counts.
      best.tally[n.def.key] = (best.tally[n.def.key] ?? 0) + 1;
    }
  }

  /**
   * What a kill leaves on the tile it fell on: everything in `always`, then one thing besides — the
   * rare table gets first refusal, and the main table has the roll only if the rare one came to
   * nothing.
   */
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
    /** One roll down a weighted table; true if it landed on something. */
    const rollOn = (table: readonly WeightedDrop[], outOf: number) => {
      let roll = this.pick(outOf);
      for (const drop of table) {
        if (roll < drop.weight) {
          leave(drop);
          return true;
        }
        roll -= drop.weight;
      }
      return false;
    };
    if (rollOn(n.def.drops.rare ?? [], RARE_DENOMINATOR)) return;
    rollOn(n.def.drops.main ?? [], DROP_DENOMINATOR);
  }

  /**
   * A player killed: they drop everything but their three best things where they fell, then wake at
   * the spawn with their hitpoints back. This is the classic's rule, and it only became fair in Phase
   * 7 — until there was a bank and a shop, a death would wipe a player's only tools with no way to
   * replace them, so until then death cost nothing but the walk back (PLAN §5).
   */
  private killPlayer(p: Player): void {
    p.deathTick = this.seenTick;
    p.target = null;
    p.path = [];
    p.walkTo = null;
    p.approach = null;
    p.action = null;
    this.stopGathering(p);
    this.stopMaking(p, false);
    this.closeScreen(p);
    this.setAct(p, null);
    this.spillOnDeath(p);
    p.sounds.push("die");
    p.messages.push(YOU_DIED);
    for (const n of this.npcs.values()) {
      if (n.target === p.id) {
        n.target = null;
        this.setNpcAct(n, null);
      }
    }
  }

  /**
   * What a death costs: everything carried and worn except the three most valuable things, left in a
   * pile where the player fell. Coins are counted as a whole stack, so a purse is either kept or lost
   * entire — splitting it would be the wrong kind of clever.
   */
  private spillOnDeath(p: Player): void {
    const worth = (s: Stack) => {
      const def = ITEM_BY_ID.get(s.id);
      if (!def) return 0;
      return def.stackable ? def.value * s.count : def.value;
    };
    type Held = { stack: Stack; from: { kind: "inventory"; slot: number } | { kind: "worn"; where: EquipSlot } };
    const held: Held[] = [];
    p.inventory.forEach((s, slot) => { if (s) held.push({ stack: s, from: { kind: "inventory", slot } }); });
    for (const where of EQUIP_SLOTS) {
      const s = p.equipment[where];
      if (s) held.push({ stack: s, from: { kind: "worn", where } });
    }
    if (held.length === 0) return;
    // The three best are kept. An unstackable item is one thing, so a pack of ten logs keeps one log.
    const keeping = new Set<Held>([...held].sort((a, b) => worth(b.stack) - worth(a.stack)).slice(0, KEPT_ON_DEATH));
    let lost = 0;
    for (const item of held) {
      if (keeping.has(item)) continue;
      const taken = item.from.kind === "inventory"
        ? takeFrom(p.inventory, item.from.slot)
        : (delete p.equipment[item.from.where], item.stack);
      if (!taken || taken.count <= 0) continue;
      // The pile is the dead player's alone for the usual private spell, then anyone's.
      this.putDown(taken, p.x, p.y, p.name, p.plane);
      lost++;
    }
    if (lost > 0) {
      this.itemsChanged(p, true);
      p.messages.push(LOST_ON_DEATH);
    }
  }

  /** The tick after falling: back on the spawn tile, whole again, and left alone for a moment. */
  private respawnPlayer(p: Player): void {
    p.deathTick = 0;
    p.riseTick = this.seenTick;
    this.setPlane(p, this.spawn.plane);
    p.x = this.spawn.x;
    p.y = this.spawn.y;
    p.moved = [];
    p.energy = MAX_ENERGY;
    this.setHp(p, this.maxHpOf(p));
    p.nextRegen = this.tick + REGEN_TICKS;
    p.toleranceFrom = this.tick;
    // Waking whole: the prayer points come back too, with every prayer off.
    p.prayer = this.maxPrayerOf(p);
    p.prayers.clear();
    p.prayerDrain = 0;
    p.prayersDirty = true;
  }

  /** Stops fighting, stops chasing, and stops facing whatever it was. */
  private disengage(p: Player): void {
    p.target = null;
    p.chase = null;
    if (p.act?.anim === "fight") this.setAct(p, null);
    if (p.action?.kind === "attack") p.action = null;
  }

  // --- The tick ----------------------------------------------------------------------------

  /** One tick: pending walks become paths, everyone moves 1 tile (2 running), actions resolve, the world ages. */
  step(): void {
    this.tick++;
    this.stepping = true;
    this.objectChanges = [];
    this.openChanges = [];
    this.spotChanges = [];
    this.goneObjects = [];
    try {
      for (const p of this.players.values()) {
        const collision = this.mapOf(p.plane).collision;
        p.hits = [];
        p.swung = false;
        p.shot = null;
        // A killed player lies where they fell for a beat, then wakes at the spawn.
        if (p.deathTick !== 0) {
          p.moved = [];
          if (this.tick >= p.deathTick + DEATH_TICKS) this.respawnPlayer(p);
          continue;
        }
        this.drainPrayer(p);
        // Chasing something that moves: aim again at where it is now.
        if (p.action?.kind === "attack") {
          const target = this.entityAt(p.action.id);
          if (this.alive(target) && !this.inReach(p, target)) p.chase = { x: target.x, y: target.y };
        } else if (p.action?.kind === "trade") {
          const other = this.players.get(p.action.id);
          if (other && !this.beside(p, other)) p.chase = { x: other.x, y: other.y };
        }
        // Following someone: after them whenever they are more than a step away, until anything else
        // is asked for — a walk, an approach, an action — or they die, change plane or leave.
        if (p.follow !== null) {
          const q = this.players.get(p.follow);
          if (!q || q.deathTick !== 0 || q.plane !== p.plane || p.walkTo || p.approach || p.action) p.follow = null;
          else if (!this.beside(p, q)) p.chase = { x: q.x, y: q.y };
          else p.path = [];
        }
        if (p.walkTo) {
          p.path = findPath(collision, p.x, p.y, p.walkTo.x, p.walkTo.y);
          p.walkTo = null;
        } else if (p.approach) {
          p.path = findPathTo(collision, p.x, p.y, p.approach);
          p.approach = null;
        } else if (p.chase) {
          // Up to a creature, but never onto it: the walk ends on a tile beside it.
          p.path = findPathBeside(collision, p.x, p.y, p.chase);
          p.chase = null;
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
        // Walking away shuts whatever screen was open, as every game of this kind does. This comes
        // BEFORE the action resolves: a player arriving at a counter moved on the very tick they got
        // there, and a close afterwards would shut the screen that arrival had just opened.
        if (p.moved.length > 0 && p.screen !== null) this.closeScreen(p);
        this.resolveAction(p);
        if (p.gathering) this.gather(p);
        if (p.making) this.stepMaking(p);
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
      for (const [id, at] of this.opened) if (this.tick >= at) this.setOpen(id, false);
      for (const [id, at] of this.fires) if (this.tick >= at) this.removeFire(id);
      for (const s of this.spots) if (this.tick >= s.moveAt) this.moveSpot(s);
    } finally {
      this.stepping = false;
    }
  }

  /** Whether this player is walking up to something to fight, and is already close enough to swing, shoot or cast. */
  private stopsToFight(p: Player): boolean {
    if (p.action?.kind !== "attack") return false;
    const target = this.entityAt(p.action.id);
    return this.alive(target) && this.inReach(p, target);
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
      if (this.inReach(p, target)) {
        p.path = [];
        return;
      }
      // Nowhere left to walk and still out of reach: it can't be got at from here.
      if (p.path.length === 0 && !p.walkTo && !p.approach && !p.chase) {
        this.disengage(p);
        p.messages.push(CANT_REACH);
      }
      return;
    }
    // Walking over to trade: the offer is made as soon as they are beside the other player.
    if (a.kind === "trade") {
      const other = this.players.get(a.id);
      if (!other || other.deathTick !== 0 || other.plane !== p.plane) {
        p.action = null;
        return;
      }
      if (this.beside(p, other)) {
        p.action = null;
        p.path = [];
        this.requestTrade(p, other);
      } else if (p.path.length === 0 && !p.walkTo && !p.approach && !p.chase) {
        p.action = null;
        p.messages.push(CANT_REACH);
      }
      return;
    }
    // Walking over to talk: the conversation opens as soon as they are beside the person.
    if (a.kind === "talk") {
      const n = this.npcs.get(a.id);
      if (!n || !this.inWorld(n) || n.plane !== p.plane) {
        p.action = null;
        return;
      }
      if (this.inMeleeRange(p, n)) {
        p.path = [];
        p.action = null;
        this.reachedNpc(p, n);
      } else if (p.path.length === 0 && !p.walkTo && !p.approach && !p.chase) {
        p.action = null;
        p.messages.push(CANT_REACH);
      } else {
        p.chase = { x: n.x, y: n.y };
      }
      return;
    }
    const object = a.kind === "object" ? this.objectById.get(a.id) : undefined;
    const at = a.kind === "object" ? object : this.spots[a.id];
    if (!at) {
      p.action = null;
      return;
    }
    const rect = object ? approachRect(object) : oneTile(at.x, at.y);
    if (reaches(this.mapOf(p.plane).collision, p.x, p.y, rect)) {
      p.path = [];
      p.action = null;
      if (a.kind === "spot") {
        this.startGathering(p, this.methodOf(this.spots[a.id]!), { kind: "spot", id: a.id }, oneTile(at.x, at.y), "spot");
      } else if (a.use) {
        if (p.inventory[a.use.slot]?.id === a.use.item) this.useOnObject(p, a.use.slot, object!);
      } else {
        this.reached(p, object!);
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
      if (it.spawn !== null) this.respawns.push({ spawn: it.spawn, tick: this.tick + this.itemSpawns[it.spawn]!.respawn });
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
    // Only what stands on the same plane: an upper floor and the room below it share tiles, and a
    // client only ever holds one plane's scene at a time.
    const near = (e: { x: number; y: number; plane: number }) =>
      e.plane === p.plane && Math.max(Math.abs(e.x - p.x), Math.abs(e.y - p.y)) <= VIEW_DISTANCE;
    for (const q of this.players.values()) {
      if (!near(q)) continue;
      inView.add(q.id);
      const isNew = !p.known.has(q.id);
      const newLook = q.lookTick === this.tick, newGear = q.gearTick === this.tick;
      const newAct = q.actTick === this.tick, fx = q.fxTick === this.tick;
      const newHp = q.hpTick === this.tick, died = q.deathTick === this.tick, rose = q.riseTick === this.tick;
      if (!isNew && q.moved.length === 0 && !newLook && !newGear && !newAct && !fx && !newHp && !died && !rose
        && !q.swung && !q.shot && q.hits.length === 0) continue;
      const update: EntityUpdate = { id: q.id, x: q.x, y: q.y };
      if (q.moved.length) update.steps = q.moved.map((t): [number, number] => [t.x, t.y]);
      if (isNew || newLook) update.look = q.look;
      if (isNew || newGear) update.gear = this.gearOf(q);
      if (newAct || (isNew && q.act)) update.act = q.act;
      if (fx) update.fx = "levelup";
      if (isNew || newHp) update.hp = [q.hp, this.maxHpOf(q)];
      if (q.hits.length) update.hits = q.hits;
      if (q.swung) update.swing = 1;
      if (q.shot) update.shot = q.shot;
      if (died) update.dead = 1;
      // Back on their feet, which a viewer cannot work out for itself: a body stays toppled until told.
      else if (rose) update.dead = 0;
      if (isNew) {
        update.name = q.name;
        p.known.add(q.id);
      }
      ents.push(update);
    }
    for (const n of this.npcs.values()) {
      if (!this.inWorld(n) || !near(n)) continue;
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
      if (!near(it) || !this.canSee(p, it)) continue;
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
