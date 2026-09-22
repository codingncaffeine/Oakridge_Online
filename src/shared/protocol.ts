import { MAX_NAME_LENGTH } from "./constants.ts";
import { EQUIP_SLOTS, INVENTORY_SIZE, type EquipSlot, type Stack } from "./items.ts";
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
  /** One inventory item used on another. */
  | { t: "use_item"; slot: number; on: number }
  /** Walk up to the object on tile (x, y) and do its first option (chop a tree, mine a rock). */
  | { t: "object"; x: number; y: number }
  /** Walk up to the object on tile (x, y) and use an inventory item on it. */
  | { t: "use_object"; slot: number; x: number; y: number }
  /** Walk up to a fishing spot and fish it. */
  | { t: "spot"; id: number }
  | { t: "logout" };

/** An item lying on the ground, as a client sees it. */
export interface GroundItemView {
  uid: number;
  id: number;
  count: number;
  x: number;
  y: number;
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
export type SoundCue = "take" | "drop" | "wield" | "wear";

/** A fishing spot, as a client sees it. */
export interface SpotView {
  id: number;
  x: number;
  y: number;
}

/** A skill action under way: its animation, the tool in hand (an item id), and the tile being worked. */
export interface ActView {
  anim: "chop" | "mine" | "net";
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
}

/** Server → client. */
export type S2C =
  | { t: "signup_totp"; secret: string; uri: string }
  | { t: "signup_email"; to: string }
  | { t: "signup_done"; name: string; token: string; backupCodes: string[] }
  | { t: "email_sent"; to: string }
  | { t: "authed"; name: string; token: string; hasCharacter: boolean; backupLeft: number }
  | { t: "auth_error"; reason: string }
  | {
    t: "welcome"; id: number; name: string; tick: number; tickMs: number; seed: number; x: number; y: number;
    look: number[]; energy: number; run: boolean;
  }
  /**
   * `you` carries the player's own run energy (a percentage) and run state whenever either changes;
   * `items` the ground items that came into or left view; `objs` map objects that ran out (1) or came
   * back (0), by object id; `spots` fishing spots that moved.
   */
  | {
    t: "tick"; n: number; online: number; ents: EntityUpdate[]; gone?: number[]; you?: { energy: number; run: boolean };
    items?: { add?: GroundItemView[]; gone?: number[] }; objs?: Array<[number, 0 | 1]>; spots?: SpotView[];
  }
  /** On entering the world: every object that has run out, and where the fishing spots are. */
  | { t: "world"; depleted: number[]; spots: SpotView[] }
  /** Every skill's XP (tenths), on entering the world. */
  | { t: "skills"; xp: Record<SkillKey, number> }
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
      return isTileCoord(o.x) && isTileCoord(o.y) ? { t: "object", x: o.x, y: o.y } : null;
    case "use_object":
      return isSlot(o.slot) && isTileCoord(o.x) && isTileCoord(o.y) ? { t: "use_object", slot: o.slot, x: o.x, y: o.y } : null;
    case "spot":
      return Number.isInteger(o.id) && (o.id as number) >= 0 && (o.id as number) < 1 << 16 ? { t: "spot", id: o.id as number } : null;
    case "unequip":
      return (EQUIP_SLOTS as readonly unknown[]).includes(o.where) ? { t: "unequip", where: o.where as EquipSlot } : null;
    case "logout":
      return { t: "logout" };
    default:
      return null;
  }
}

function isSlot(v: unknown): v is number {
  return Number.isInteger(v) && (v as number) >= 0 && (v as number) < INVENTORY_SIZE;
}

function isTileCoord(v: unknown): v is number {
  return Number.isInteger(v) && (v as number) >= 0 && (v as number) < 1 << 16;
}

/** Trims and collapses spaces; null unless 1–12 letters, digits, spaces, hyphens or underscores. */
export function cleanName(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, " ");
  return name.length >= 1 && name.length <= MAX_NAME_LENGTH && /^[A-Za-z0-9 _-]+$/.test(name) ? name : null;
}
