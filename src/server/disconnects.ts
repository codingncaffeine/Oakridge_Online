// Why connections end, and why the server itself stops, in words the log can be read by. The server's
// own log is the only record of a player being dropped, so every close says why: the server's reason
// when it ended the connection, the browser's close code otherwise, and a page that gets back in says
// what it saw (the "dropped" report). A stop says whether a deploy asked for it; a run that ended
// without its clean stop (killed, or the machine went down) is found by the record it left behind.
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { C2S } from "../shared/protocol.ts";

/** A span of time, short: 0.4s, 12s, 3m05s, 2h04m. */
export function span(ms: number): string {
  const s = Math.max(0, ms) / 1000;
  if (s < 10) return `${s.toFixed(1)}s`;
  if (s < 60) return `${Math.floor(s)}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m${String(Math.floor(s % 60)).padStart(2, "0")}s`;
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}m`;
}

/** Text from a browser made safe for a one-line log: printable ASCII only, and short. */
export function printable(text: string, max = 60): string {
  return text.replace(/[^\x20-\x7e]/g, "").slice(0, max);
}

/**
 * Why a connection closed: the server's own reason when it was the one to end it, otherwise what the
 * close code says. 1006 is no closing handshake at all: the connection was cut.
 */
export function whyClosed(ending: string | null, code: number, reason: string): string {
  if (ending) return `the server ended it: ${ending}`;
  if (code === 1000) return "the browser closed it";
  if (code === 1001) return "the page was closed, reloaded or left";
  if (code === 1005) return "the browser closed it without saying why";
  if (code === 1006) return "cut off without a goodbye: the network, the host's proxy, or the browser itself went away";
  return `closed with code ${code}${reason ? ` ${JSON.stringify(printable(reason))}` : ""}`;
}

/** A page's own account of a connection it lost, as log fields; `now` dates the drop. */
export function describeDrop(d: Extract<C2S, { t: "dropped" }>, now: number): string[] {
  const yes = (v: boolean) => (v ? "yes" : "no");
  const fields = [
    `at=${new Date(now - d.ago).toISOString()}`, `code=${d.code}`, `clean=${yes(d.clean)}`, `quiet=${span(d.quiet)}`,
    `down=${span(d.ago)}`, `tries=${d.tries}`, `hidden=${yes(d.hidden)}`, `offline=${yes(d.offline)}`,
  ];
  if (d.reason) fields.push(`reason=${JSON.stringify(d.reason)}`);
  // Only what the fields themselves prove.
  if (d.offline) fields.push("— the browser had no network");
  else if (d.code === 4001) fields.push("— the server restarted");
  else if (d.code === 1006 && !d.hidden) fields.push("— cut between the page and the server, with the browser online");
  return fields;
}

/** The deploy script leaves this in the data folder just before it asks the host for a restart. */
export const DEPLOY_MARK = "last-deploy.txt";
/** A stop this soon after a deploy's mark is that deploy's (the host restarts more than once while it settles). */
export const DEPLOY_WINDOW_MS = 5 * 60_000;

/** The deploy a stop now belongs to (the mark's text and age), or null when no deploy asked for one. */
export function recentDeploy(dataDir: string, now: number): { what: string; ago: number } | null {
  try {
    const file = join(dataDir, DEPLOY_MARK);
    const ago = now - statSync(file).mtimeMs;
    if (ago > DEPLOY_WINDOW_MS) return null;
    return { what: printable(readFileSync(file, "utf8").trim(), 80), ago: Math.max(0, ago) };
  } catch {
    return null;
  }
}

/**
 * A running server's record on disk, one file a process. Its exit removes it, so a record whose process
 * is gone is a run that never reached its exit: killed outright, or the machine went down.
 */
export interface RunRecord {
  pid: number;
  boot: string;
  started: number;
  /** Rewritten every minute while the process lives. */
  alive: number;
  /** When a stop signal came, if one did: a record left with this set was killed while stopping. */
  stopping?: number;
}

const RUNS = "runs";
/** A record not rewritten for this long is a dead run whatever its pid says (pids get reused). */
export const STALE_MS = 3 * 60_000;

export function writeRun(dataDir: string, run: RunRecord): void {
  const dir = join(dataDir, RUNS);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${run.boot}.json`);
  writeFileSync(`${file}.tmp`, JSON.stringify(run));
  renameSync(`${file}.tmp`, file);
}

export function removeRun(dataDir: string, boot: string): void {
  rmSync(join(dataDir, RUNS, `${boot}.json`), { force: true });
}

/**
 * Other runs' records whose process is gone or which stopped being rewritten: each ended without
 * reaching its exit. They are removed as they are returned, so each is told once.
 */
export function deadRuns(dataDir: string, ownBoot: string, now: number, running: (pid: number) => boolean): RunRecord[] {
  const dir = join(dataDir, RUNS);
  if (!existsSync(dir)) return [];
  const dead: RunRecord[] = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".json") || name === `${ownBoot}.json`) continue;
    const file = join(dir, name);
    let run: RunRecord;
    try {
      run = JSON.parse(readFileSync(file, "utf8")) as RunRecord;
      if (!Number.isInteger(run.pid) || typeof run.alive !== "number") throw new Error("not a run record");
    } catch {
      // Unreadable: written by a process killed mid-write. Its file's age is all there is to go on.
      run = { pid: 0, boot: name.slice(0, -5), started: 0, alive: statSync(file).mtimeMs };
    }
    if (run.pid && running(run.pid) && now - run.alive < STALE_MS) continue;
    dead.push(run);
    rmSync(file, { force: true });
  }
  return dead;
}

/** Whether a process is alive (EPERM: alive, but not ours to signal). */
export function pidRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** A dead run, told as one line's words. The record is rewritten each minute, so it died within a minute of its last. */
export function describeDeadRun(run: RunRecord): string {
  const iso = (ms: number) => new Date(ms).toISOString();
  const which = `the run pid=${run.pid || "?"} boot=${run.boot}`;
  // Told to stop and then ended before its exit: a restart that did not wait for the process, not a crash.
  if (run.stopping) return `${which} was killed while stopping: told to stop at ${iso(run.stopping)}, it was ended before its exit (the host did not wait for it)`;
  return `${which} ended without its clean stop: killed outright (out of memory, the host, a hard kill) or the machine went down; `
    + `${run.started ? `started ${iso(run.started)}, ` : ""}last seen alive ${iso(run.alive)} (rewritten every minute)`;
}
