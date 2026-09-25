// A connection the page lost without asking: what it saw, kept until the world takes the player back,
// then told to the server, whose log is the only record of a drop. The server sees one end of the
// connection and the page the other; together they say where it broke.
import { DAY_MS, type C2S } from "../shared/protocol.ts";

export interface Drop {
  code: number;
  clean: boolean;
  reason: string;
  /** When it happened (Date.now). */
  at: number;
  /** How long the server had been silent before it (ms). */
  quiet: number;
  /** Whether the page was in the background, and whether the browser thought it had no network. */
  hidden: boolean;
  offline: boolean;
  /** Tries that failed before one got back in. */
  tries: number;
}

const ms = (v: number) => Math.min(DAY_MS, Math.max(0, Math.round(v)));

/** The report, every number kept inside what the server takes. */
export function dropReport(d: Drop, now: number): Extract<C2S, { t: "dropped" }> {
  return {
    t: "dropped", code: Math.min(4999, Math.max(1000, Math.round(d.code))), clean: d.clean, reason: d.reason.slice(0, 123),
    ago: ms(now - d.at), quiet: ms(d.quiet), hidden: d.hidden, offline: d.offline, tries: Math.min(1000, Math.max(0, Math.round(d.tries))),
  };
}

/** A drop kept in the tab's session storage, read back; anything else (nothing kept, a mangled value) is none. */
export function readDrop(raw: string | null): Drop | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as Partial<Drop> | null;
    const num = (v: unknown) => typeof v === "number" && Number.isFinite(v);
    const ok = d !== null && num(d.code) && num(d.at) && num(d.quiet) && num(d.tries) && typeof d.reason === "string"
      && typeof d.clean === "boolean" && typeof d.hidden === "boolean" && typeof d.offline === "boolean";
    return ok ? (d as Drop) : null;
  } catch {
    return null;
  }
}
