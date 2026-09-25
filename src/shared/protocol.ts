import { MAX_NAME_LENGTH } from "./constants.ts";
import type { FishingMethod, MethodName } from "./gathering.ts";
import type { MapObject } from "./map.ts";
import { BANK_SIZE, EQUIP_SLOTS, INVENTORY_SIZE, MAX_STACK, type EquipSlot, type Stack } from "./items.ts";
import { isValidLook, normalizeLook } from "./look.ts";
import type { SkillKey } from "./skills.ts";

/** Client → server. Before login only the sign-up/login messages count; in the world, the play ones. */
export type C2S =
  | { t: "signup"; name: string; method: "totp" }
  | { t: "signup"; name: string; method: "email"; email: string }
  | { t: "signup_confirm"; code: string }
  | { t: "login"; name: string; code: string }
  | { t: "login_email"; name: string }
  | { t: "resume"; token: string }
  | { t: "enter"; look?: number[] }
  | { t: "look"; look: number[] }
  | { t: "walk"; x: number; y: number }
  | { t: "run"; on: boolean }
  | { t: "chat"; text: string }
  | { t: "take"; uid: number }
  | { t: "drop"; slot: number }
  | { t: "swap"; from: number; to: number }
  | { t: "equip"; slot: number }
  | { t: "unequip"; where: EquipSlot }
  | { t: "use"; slot: number }
  /** Turn a prayer on or off, by its key (PLAN Phase 11). */
  | { t: "pray"; key: string; on: boolean }
  /** One inventory item used on another. */
  | { t: "use_item"; slot: number; on: number }
  /** Walk up to a map object and do its first option: chop a tree, mine a rock, open a door, climb a stair. */
  | { t: "object"; id: number }
  /** Walk up to a map object and use an inventory item on it. */
  | { t: "use_object"; slot: number; id: number }
  /** Walk up to a fishing spot and fish it. */
  | { t: "spot"; id: number }
  /** Walk up to an entity and fight it. */
  | { t: "attack"; id: number }
  /** Walk up to an NPC and talk to it. */
  | { t: "talk"; id: number }
  /** A test run only: stand the player on a tile, so a check can start a long way from the green. Production drops it. */
  | { t: "place"; x: number; y: number }
  /** Answer the open dialogue: the index of the option chosen, or -1 to close it. */
  | { t: "say"; option: number }
  /** Bank: move `count` of an inventory slot in, or of a bank slot out. -1 means everything there. */
  | { t: "deposit"; slot: number; count: number }
  | { t: "withdraw"; slot: number; count: number }
  /** Shop: buy `count` of the shop's slot, or sell `count` of an inventory slot. */
  | { t: "buy"; slot: number; count: number }
  | { t: "sell"; slot: number; count: number }
  /** Close whatever screen is open (bank, shop, dialogue, the make-X list). */
  | { t: "close" }
  /** Answer an open "make X" list: the index of the recipe chosen, and how many to make. */
  | { t: "make"; index: number; count: number }
  /** Pick a fighting style: an index into the styles the held weapon offers. */
  | { t: "style"; index: number }
  /** Turn hitting back automatically on or off. */
  | { t: "retaliate"; on: boolean }
  /** Cast a spell from the spellbook on a creature, once (the magic plan): the spell's key and the creature's id. */
  | { t: "cast"; spell: string; id: number }
  /** Set the spell a staff casts, by key, or clear it with an empty key. */
  | { t: "autocast"; spell: string }
  // --- Social (PLAN Phase 10) ---
  /** A private message to a player, by name. */
  | { t: "pm"; to: string; text: string }
  | { t: "friend_add"; name: string }
  | { t: "friend_remove"; name: string }
  | { t: "ignore_add"; name: string }
  | { t: "ignore_remove"; name: string }
  /** Walk after another player and keep beside them until something else is asked for. */
  | { t: "follow"; id: number }
  /** Walk up to another player and offer a trade, or take up theirs. */
  | { t: "trade"; id: number }
  /** In a trade: put `count` of an inventory slot on the table, or take `count` of one of your own offered lines back. */
  | { t: "trade_offer"; slot: number; count: number }
  | { t: "trade_take"; slot: number; count: number }
  | { t: "trade_accept" }
  | { t: "logout" }
  /**
   * Back in after losing the connection: what the page saw of the loss, for the server's log. The close
   * code and whether it was clean, how long ago it was and how long the server had been silent before it
   * (ms), whether the page was in the background or the browser offline, and how many tries failed.
   */
  | { t: "dropped"; code: number; clean: boolean; reason: string; ago: number; quiet: number; hidden: boolean; offline: boolean; tries: number };

/** An item lying on the ground, as a client sees it. */
export interface GroundItemView {
  uid: number;
  id: number;
  count: number;
  x: number;
  y: number;
}

/** One line of a shop's stock: what it is, how many are on the shelf, and what it costs each way. */
export interface ShopSlotView {
  id: number;
  count: number;
  /** What the shop charges for one, and what it pays for one, at the current stock. */
  buy: number;
  sell: number;
}

/** One line of a "make X" list: the item made, how many the player can make now, and why not if none. */
export interface MakeOptionView {
  id: number;
  /** How many of it one action makes (a bar, five arrows). */
  each: number;
  /** How many the player has the materials and the level for; 0 greys the line out. */
  can: number;
  /** Why the line is greyed out, when it is. */
  note?: string;
}

/** Longest chat message, in characters. */
export const MAX_CHAT = 80;

const span = (from: number, to: number) => `${String.fromCharCode(from)}-${String.fromCharCode(to)}`;
/**
 * What chat drops: control characters, zero-width and direction marks, line and paragraph separators.
 * Built from character codes so no invisible character sits in the source.
 */
const INVISIBLE = new RegExp(`[${span(0, 0x1f)}${span(0x7f, 0x9f)}${span(0x200b, 0x200f)}${span(0x2028, 0x202e)}${span(0x2066, 0x2069)}]`, "g");

/** A sound the server asks the player's own client to play. */
export type SoundCue = "take" | "drop" | "wield" | "wear" | "eat" | "hurt" | "die";

/** A fishing spot, as a client sees it: where it is, and which of the four ways to fish it offers. */
export interface SpotView {
  id: number;
  x: number;
  y: number;
  method: FishingMethod;
}

/** A skill action under way: its animation, the tool in hand (an item id), and the tile being worked. */
export interface ActView {
  anim: MethodName | "fight" | "make";
  tool: number;
  x: number;
  y: number;
}

/** One entity in a tick update. Stationary entities the client already knows are left out. */
export interface EntityUpdate {
  id: number;
  x: number;
  y: number;
  /** Tiles entered this tick, in order; the last one is (x, y). */
  steps?: Array<[number, number]>;
  /** The name comes the first time this client sees the entity; the look then, and whenever it changes. */
  name?: string;
  look?: number[];
  /** Worn item ids in the server's visible-gear order (0 for none): sent with the look, and when it changes. */
  gear?: number[];
  /** The skill action it's doing: sent when first seen (if any) and whenever it starts, changes or stops (null). */
  act?: ActView | null;
  /** A one-off effect to play this tick. */
  fx?: "levelup";
  /** A creature rather than a player: its key in the bestiary, sent the first time this client sees it. */
  npc?: string;
  /** Hitpoints now and at full, sent when first seen and whenever they change. */
  hp?: [number, number];
  /** Damage taken this tick, one number per blow; 0 is a blow that was turned aside. */
  hits?: number[];
  /** It threw a blow this tick. */
  swing?: 1;
  /** 1: just killed and on its way out of the world. 0: back on its feet, so stand it up again. */
  dead?: 0 | 1;
  /** It loosed an arrow or cast a spell this tick at that entity: the client draws it crossing (PLAN Phase 11). */
  shot?: { to: number; kind: "arrow" | string };
}

/** Server → client. */
export type S2C =
  | { t: "signup_totp"; secret: string; uri: string }
  | { t: "signup_email"; to: string }
  | { t: "signup_done"; name: string; token: string; backupCodes: string[] }
  | { t: "email_sent"; to: string }
  | { t: "authed"; name: string; token: string; hasCharacter: boolean; backupLeft: number }
  | { t: "auth_error"; reason: string }
  /** `now` is the server's clock, which the sky keeps to: the same hour and weather for everyone (PLAN Phase 16). */
  | {
    t: "welcome"; id: number; name: string; tick: number; tickMs: number; now: number; seed: number; x: number; y: number;
    plane: number; look: number[]; energy: number; run: boolean; hp: number; maxHp: number; prayer: number; maxPrayer: number;
  }
  /**
   * `you` carries the player's own run energy (a percentage), run state and hitpoints whenever any of
   * them changes; `items` the ground items that came into or left view; `objs` map objects that ran out
   * (1) or came back (0), by object id; `opens` doors and gates that swung open (1) or shut (0);
   * `spots` fishing spots that moved.
   */
  | {
    t: "tick"; n: number; online: number; ents: EntityUpdate[]; gone?: number[];
    you?: { energy: number; run: boolean; hp: number; maxHp: number; prayer: number; maxPrayer: number };
    items?: { add?: GroundItemView[]; gone?: number[] }; objs?: Array<[number, 0 | 1]>;
    opens?: Array<[number, 0 | 1]>; spots?: SpotView[];
    /** Objects that came into the world (a lit fire) or left it (one that burnt out). */
    added?: MapObject[]; removed?: number[];
  }
  /** How the player is fighting: the style index into their weapon's list, and whether they hit back. */
  | { t: "combat"; style: number; retaliate: boolean; autocast: string }
  /** Which prayers are on, by key: sent on entering and whenever the set changes (PLAN Phase 11). */
  | { t: "prayers"; on: string[] }
  /**
   * You are now standing on this plane, at this tile. Sent on entering the world and whenever a stair
   * or ladder moves you, because the client rebuilds its whole scene around one plane at a time.
   */
  | { t: "plane"; plane: number; x: number; y: number }
  /**
   * On entering the world and on every plane change: every object that has run out, every door standing
   * open, every object put there since the map was built (fires), and where the fishing spots are.
   */
  | { t: "world"; depleted: number[]; spots: SpotView[]; opened: number[]; added: MapObject[] }
  /** The bank's contents, sent when it opens and after every move. `null` closes it. */
  | { t: "bank"; items: Array<Stack | null> | null }
  /** A shop's stock and its name, sent when it opens and after every trade. `null` closes it. */
  | { t: "shop"; name: string | null; items?: ShopSlotView[] }
  /** What an NPC is saying now, and what the player may say back. `null` closes the box. */
  | { t: "say"; speaker: string | null; lines?: string[]; options?: string[]; npc?: string }
  /** The "make X" list: what can be made here, and how many of each the player has materials for. */
  | { t: "make"; title: string | null; options?: MakeOptionView[] }
  /** Every skill's XP (tenths), on entering the world. */
  | { t: "skills"; xp: Record<SkillKey, number> }
  /** Every quest's stage and the points earned, on entering the world and whenever a stage changes (PLAN Phase 9). */
  | { t: "quests"; stages: Record<string, number>; points: number }
  /** The friends and the ignored, on entering and whenever a list or a friend's presence changes (PLAN Phase 10). */
  | { t: "friends"; friends: Array<{ name: string; online: boolean }>; ignores: string[] }
  /** A private message: who it is from and to; both ends get it. */
  | { t: "pm"; from: string; to: string; text: string }
  /** A trade under way: who with, what each side has on the table, which of its two screens it is on, and who has accepted. `null` closes it. */
  | { t: "trade"; with: string | null; mine?: Stack[]; theirs?: Stack[]; stage?: "offer" | "confirm"; accepted?: [boolean, boolean] }
  /** One skill's new XP total (tenths), whenever it grows. */
  | { t: "xp"; skill: SkillKey; xp: number }
  /** A sound for something the player just did. */
  | { t: "sound"; cue: SoundCue }
  | { t: "inventory"; items: Array<Stack | null> }
  | { t: "equipment"; items: Partial<Record<EquipSlot, Stack>>; bonuses: number[]; weight: number }
  | { t: "chat"; id: number; name: string; text: string }
  | { t: "game"; text: string }
  | { t: "kicked"; reason: string }
  | { t: "logged_out" }
  | { t: "denied"; reason: string };

/** Close code the server sends when it restarts; clients reconnect. */
export const CLOSE_RESTART = 4001;
/** Close code for "logged in somewhere else"; clients must not reconnect. */
export const CLOSE_KICKED = 4002;

const str = (v: unknown, max: number): v is string => typeof v === "string" && v.length <= max;
/** The longest span a "dropped" report can give: a day, in ms. */
export const DAY_MS = 86_400_000;

/** Parses and shape-checks a client message; anything malformed is null. */
export function parseC2S(raw: string): C2S | null {
  let m: unknown;
  try {
    m = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof m !== "object" || m === null) return null;
  const o = m as Record<string, unknown>;
  switch (o.t) {
    case "signup":
      if (!str(o.name, 64)) return null;
      if (o.method === "totp") return { t: "signup", name: o.name, method: "totp" };
      if (o.method === "email" && str(o.email, 254)) return { t: "signup", name: o.name, method: "email", email: o.email };
      return null;
    case "signup_confirm":
      return str(o.code, 32) ? { t: "signup_confirm", code: o.code } : null;
    case "login":
      return str(o.name, 64) && str(o.code, 32) ? { t: "login", name: o.name, code: o.code } : null;
    case "login_email":
      return str(o.name, 64) ? { t: "login_email", name: o.name } : null;
    case "resume":
      return str(o.token, 128) ? { t: "resume", token: o.token } : null;
    case "enter":
      if (o.look === undefined) return { t: "enter" };
      return isValidLook(o.look) ? { t: "enter", look: normalizeLook(o.look) } : null;
    case "look":
      return isValidLook(o.look) ? { t: "look", look: normalizeLook(o.look) } : null;
    case "walk":
      return isTileCoord(o.x) && isTileCoord(o.y) ? { t: "walk", x: o.x, y: o.y } : null;
    case "run":
      return typeof o.on === "boolean" ? { t: "run", on: o.on } : null;
    case "chat": {
      if (!str(o.text, 400)) return null;
      // Control characters out, spaces collapsed, then capped at the chat length.
      const text = o.text.replace(INVISIBLE, "").replace(/ +/g, " ").trim().slice(0, MAX_CHAT);
      return text ? { t: "chat", text } : null;
    }
    case "take":
      return Number.isInteger(o.uid) && (o.uid as number) > 0 ? { t: "take", uid: o.uid as number } : null;
    case "drop":
    case "equip":
    case "use":
      return isSlot(o.slot) ? { t: o.t, slot: o.slot } : null;
    case "swap":
      return isSlot(o.from) && isSlot(o.to) ? { t: "swap", from: o.from, to: o.to } : null;
    case "use_item":
      return isSlot(o.slot) && isSlot(o.on) && o.slot !== o.on ? { t: "use_item", slot: o.slot, on: o.on } : null;
    case "object":
      return isObjectId(o.id) ? { t: "object", id: o.id } : null;
    case "use_object":
      return isSlot(o.slot) && isObjectId(o.id) ? { t: "use_object", slot: o.slot, id: o.id } : null;
    case "spot":
      return isIndex(o.id) ? { t: "spot", id: o.id } : null;
    case "attack":
      return Number.isInteger(o.id) && (o.id as number) > 0 ? { t: "attack", id: o.id as number } : null;
    case "talk":
      return Number.isInteger(o.id) && (o.id as number) > 0 ? { t: "talk", id: o.id as number } : null;
    case "place":
      return Number.isInteger(o.x) && Number.isInteger(o.y) ? { t: "place", x: o.x as number, y: o.y as number } : null;
    case "say":
      return Number.isInteger(o.option) && (o.option as number) >= -1 && (o.option as number) < 16
        ? { t: "say", option: o.option as number } : null;
    case "deposit":
    case "withdraw":
      return isBankSlot(o.slot) && isCount(o.count) ? { t: o.t, slot: o.slot, count: o.count } : null;
    case "buy":
    case "sell":
      return isBankSlot(o.slot) && isCount(o.count) ? { t: o.t, slot: o.slot, count: o.count } : null;
    case "make":
      return isIndex(o.index) && isCount(o.count) ? { t: "make", index: o.index, count: o.count } : null;
    case "close":
      return { t: "close" };
    case "style":
      return Number.isInteger(o.index) && (o.index as number) >= 0 && (o.index as number) < 8 ? { t: "style", index: o.index as number } : null;
    case "pray":
      return typeof o.key === "string" && o.key.length <= 32 && typeof o.on === "boolean" ? { t: "pray", key: o.key, on: o.on } : null;
    case "retaliate":
      return typeof o.on === "boolean" ? { t: "retaliate", on: o.on } : null;
    case "cast":
      return typeof o.spell === "string" && o.spell.length <= 32 && Number.isInteger(o.id) && (o.id as number) > 0 ? { t: "cast", spell: o.spell, id: o.id as number } : null;
    case "autocast":
      return typeof o.spell === "string" && o.spell.length <= 32 ? { t: "autocast", spell: o.spell } : null;
    case "unequip":
      return (EQUIP_SLOTS as readonly unknown[]).includes(o.where) ? { t: "unequip", where: o.where as EquipSlot } : null;
    case "pm": {
      if (!str(o.to, 64) || !str(o.text, 400)) return null;
      const text = o.text.replace(INVISIBLE, "").replace(/ +/g, " ").trim().slice(0, MAX_CHAT);
      return text ? { t: "pm", to: o.to, text } : null;
    }
    case "friend_add":
    case "friend_remove":
    case "ignore_add":
    case "ignore_remove":
      return str(o.name, 64) ? { t: o.t, name: o.name } : null;
    case "follow":
    case "trade":
      return Number.isInteger(o.id) && (o.id as number) > 0 ? { t: o.t, id: o.id as number } : null;
    case "trade_offer":
    case "trade_take":
      return isSlot(o.slot) && isCount(o.count) ? { t: o.t, slot: o.slot, count: o.count } : null;
    case "trade_accept":
      return { t: "trade_accept" };
    case "logout":
      return { t: "logout" };
    case "dropped": {
      const ms = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= DAY_MS;
      if (!Number.isInteger(o.code) || (o.code as number) < 1000 || (o.code as number) > 4999) return null;
      if (typeof o.clean !== "boolean" || typeof o.hidden !== "boolean" || typeof o.offline !== "boolean") return null;
      if (!ms(o.ago) || !ms(o.quiet) || !Number.isInteger(o.tries) || (o.tries as number) < 0 || (o.tries as number) > 1000) return null;
      if (!str(o.reason, 123)) return null;
      // The reason goes into a one-line log: printable characters only.
      return {
        t: "dropped", code: o.code as number, clean: o.clean, reason: o.reason.replace(/[^\x20-\x7e]/g, "").slice(0, 60),
        ago: o.ago, quiet: o.quiet, hidden: o.hidden, offline: o.offline, tries: o.tries as number,
      };
    }
    default:
      return null;
  }
}

function isSlot(v: unknown): v is number {
  return Number.isInteger(v) && (v as number) >= 0 && (v as number) < INVENTORY_SIZE;
}

/** A slot in a screen bigger than the pack: the bank's tabs, a shop's stock. */
function isBankSlot(v: unknown): v is number {
  return Number.isInteger(v) && (v as number) >= 0 && (v as number) < BANK_SIZE;
}

/**
 * An object's id: whatever the world hands out — the map's own from 1, a sign's from SIGN_IDS by its
 * edge (map.ts), a lit fire's above every one of those (world.ts) — so anything a signed 32-bit int holds.
 * ⛔ Object ids went through isIndex's 2^24 until the signs took ids from ten million up and the fires
 * followed them past it: every click on a lit fire was dropped as malformed, and cooking on one did
 * nothing (2026-09-25).
 */
function isObjectId(v: unknown): v is number {
  return Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 0x7fffffff;
}

/** An index into a list the server owns (a spot, a recipe). */
function isIndex(v: unknown): v is number {
  return Number.isInteger(v) && (v as number) >= 0 && (v as number) < 1 << 24;
}

/** How many of something to move: 1 up to a stack, or -1 for "all of them". */
function isCount(v: unknown): v is number {
  return Number.isInteger(v) && ((v as number) === -1 || ((v as number) >= 1 && (v as number) <= MAX_STACK));
}

function isTileCoord(v: unknown): v is number {
  return Number.isInteger(v) && (v as number) >= 0 && (v as number) < 1 << 16;
}

/** Trims and collapses spaces; null unless 1–12 letters, digits, spaces, hyphens or underscores. */
export function cleanName(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, " ");
  return name.length >= 1 && name.length <= MAX_NAME_LENGTH && /^[A-Za-z0-9 _-]+$/.test(name) ? name : null;
}
