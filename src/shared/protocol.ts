import { MAX_NAME_LENGTH } from "./constants.ts";

/** Client → server. */
export type C2S =
  | { t: "hello"; name: string }
  | { t: "walk"; x: number; y: number }
  | { t: "run"; on: boolean };

/** One entity in a tick update. Stationary entities the client already knows are left out. */
export interface EntityUpdate {
  id: number;
  x: number;
  y: number;
  /** Tiles entered this tick, in order; the last one is (x, y). */
  steps?: Array<[number, number]>;
  /** Sent the first time this client sees the entity. */
  name?: string;
  look?: number[];
}

/** Server → client. */
export type S2C =
  | { t: "welcome"; id: number; name: string; tick: number; tickMs: number; seed: number; x: number; y: number }
  | { t: "tick"; n: number; online: number; ents: EntityUpdate[]; gone?: number[] }
  | { t: "denied"; reason: string };

/** Close code the server sends when it restarts; clients reconnect. */
export const CLOSE_RESTART = 4001;

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
    case "hello":
      return typeof o.name === "string" && o.name.length <= 64 ? { t: "hello", name: o.name } : null;
    case "walk":
      return isTileCoord(o.x) && isTileCoord(o.y) ? { t: "walk", x: o.x, y: o.y } : null;
    case "run":
      return typeof o.on === "boolean" ? { t: "run", on: o.on } : null;
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
