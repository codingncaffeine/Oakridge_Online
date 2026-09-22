import { MAX_NAME_LENGTH } from "./constants.ts";
import { isValidLook, normalizeLook } from "./look.ts";

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
  | { t: "logout" };

/** Longest chat message, in characters. */
export const MAX_CHAT = 80;

const span = (from: number, to: number) => `${String.fromCharCode(from)}-${String.fromCharCode(to)}`;
/**
 * What chat drops: control characters, zero-width and direction marks, line and paragraph separators.
 * Built from character codes so no invisible character sits in the source.
 */
const INVISIBLE = new RegExp(`[${span(0, 0x1f)}${span(0x7f, 0x9f)}${span(0x200b, 0x200f)}${span(0x2028, 0x202e)}${span(0x2066, 0x2069)}]`, "g");

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
  /** `you` carries the player's own run energy (a percentage) and run state whenever either changes. */
  | { t: "tick"; n: number; online: number; ents: EntityUpdate[]; gone?: number[]; you?: { energy: number; run: boolean } }
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
    case "logout":
      return { t: "logout" };
    default:
      return null;
  }
}

function isTileCoord(v: unknown): v is number {
  return Number.isInteger(v) && (v as number) >= 0 && (v as number) < 1 << 16;
}

/** Trims and collapses spaces; null unless 1–12 letters, digits, spaces, hyphens or underscores. */
export function cleanName(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, " ");
  return name.length >= 1 && name.length <= MAX_NAME_LENGTH && /^[A-Za-z0-9 _-]+$/.test(name) ? name : null;
}
