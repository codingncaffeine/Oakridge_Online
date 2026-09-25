// Every way a connection, or the server itself, ends must leave a line in the log that says why: the log
// is the only record there is of a player being dropped. Runs the BUILT bundle (dist/app/server.js, what
// ships) like net.test.ts, each server on its own scratch data folder, and reads what it writes to stderr.
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { WebSocket as WsClient, type ClientOptions } from "ws";
import { deadRuns, describeDeadRun, describeDrop, span, whyClosed, writeRun } from "../src/server/disconnects.ts";
import { base32Decode, hotp, totpStep } from "../src/server/totp.ts";
import { STARTER_LOOK } from "../src/shared/look.ts";
import { DAY_MS, parseC2S, type C2S, type S2C } from "../src/shared/protocol.ts";

const BUNDLE = "dist/app/server.js";
// Test data stays inside the project folder (scratch/ is ignored by git).
const SCRATCH = join(import.meta.dirname, "..", "scratch", "tmp");
mkdirSync(SCRATCH, { recursive: true });
const folders: string[] = [];
const scratchFolder = () => {
  const dir = mkdtempSync(join(SCRATCH, "oakridge-drops-"));
  folders.push(dir);
  return dir;
};
// A failed check leaves its server running; left running, it would hold this file's run open for ever.
const servers: Server[] = [];
after(async () => {
  for (const server of servers) if (server.proc) await server.stop("SIGKILL");
  for (const dir of folders) rmSync(dir, { recursive: true, force: true });
});

/** The heartbeat the test servers run: short, so a connection that stops answering is cut in about a second. */
const HEARTBEAT_MS = 1000;
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

class Server {
  readonly lines: string[] = [];
  readonly port = 20000 + Math.floor(Math.random() * 20000);
  readonly data: string;
  proc: ChildProcess | null = null;
  private exited: Promise<void> = Promise.resolve();
  constructor(data: string) {
    this.data = data;
    servers.push(this);
  }

  async start(): Promise<void> {
    const proc = spawn(process.execPath, [BUNDLE], {
      env: {
        ...process.env, PORT: String(this.port), OAKRIDGE_DATA: this.data, OAKRIDGE_MAIL: `file:${join(this.data, "outbox.jsonl")}`,
        OAKRIDGE_HEARTBEAT_MS: String(HEARTBEAT_MS),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.proc = proc;
    this.exited = new Promise((r) => proc.once("exit", () => r()));
    let partial = "";
    proc.stderr!.on("data", (d: Buffer) => {
      const parts = (partial + d.toString()).split("\n");
      partial = parts.pop()!;
      this.lines.push(...parts);
    });
    await this.line(/world server started/, 5000, this.lines.length);
  }

  /** The first log line from index `from` on that matches, waited for. */
  async line(re: RegExp, ms = 3000, from = 0): Promise<string> {
    const end = performance.now() + ms;
    for (;;) {
      const hit = this.lines.slice(from).find((l) => re.test(l));
      if (hit) return hit;
      if (performance.now() > end) throw new Error(`no log line ${re}; the log:\n${this.lines.slice(from).join("\n")}`);
      await pause(20);
    }
  }

  async stop(signal: NodeJS.Signals = "SIGTERM"): Promise<void> {
    this.proc?.kill(signal);
    await this.exited;
    this.proc = null;
  }
}

class Player {
  readonly inbox: S2C[] = [];
  closeCode = 0;
  closedAt = 0;
  readonly ws: WsClient;
  private constructor(ws: WsClient) {
    this.ws = ws;
    ws.on("message", (data) => this.inbox.push(JSON.parse(String(data)) as S2C));
    ws.on("close", (code) => {
      this.closeCode = code;
      this.closedAt = performance.now();
    });
  }

  static async connect(server: Server, options: Record<string, unknown> = {}): Promise<Player> {
    const ws = new WsClient(`ws://127.0.0.1:${server.port}/ws`, options as ClientOptions);
    await new Promise<void>((resolve, reject) => {
      ws.once("open", () => resolve());
      ws.once("error", reject);
    });
    return new Player(ws);
  }

  send(msg: C2S | string): void {
    this.ws.send(typeof msg === "string" ? msg : JSON.stringify(msg));
  }

  /** Sends, then waits for the first reply of one of the given types. */
  async ask<T extends S2C["t"]>(msg: C2S, ...types: T[]): Promise<Extract<S2C, { t: T }>> {
    const from = this.inbox.length;
    this.send(msg);
    const end = performance.now() + 3000;
    for (;;) {
      const hit = this.inbox.slice(from).find((m) => (types as string[]).includes(m.t));
      if (hit) return hit as Extract<S2C, { t: T }>;
      if (performance.now() > end) throw new Error(`no ${types.join("/")}; last: ${JSON.stringify(this.inbox.at(-1))}`);
      await pause(20);
    }
  }

  /** Signs up with an authenticator and walks into the world; returns the session token. */
  async enter(name: string): Promise<string> {
    const setup = await this.ask({ t: "signup", name, method: "totp" }, "signup_totp", "auth_error");
    assert.equal(setup.t, "signup_totp", JSON.stringify(setup));
    const secret = (setup as Extract<S2C, { t: "signup_totp" }>).secret;
    const done = await this.ask({ t: "signup_confirm", code: hotp(base32Decode(secret), totpStep(Date.now())) }, "signup_done", "auth_error");
    assert.equal(done.t, "signup_done", JSON.stringify(done));
    const welcome = await this.ask({ t: "enter", look: STARTER_LOOK }, "welcome", "auth_error");
    assert.equal(welcome.t, "welcome", JSON.stringify(welcome));
    return (done as Extract<S2C, { t: "signup_done" }>).token;
  }

  async closed(ms = 3000): Promise<number> {
    const end = performance.now() + ms;
    while (!this.closedAt) {
      if (performance.now() > end) throw new Error("the connection was not closed");
      await pause(20);
    }
    return this.closeCode;
  }
}

test("every way a connection ends says why in the log", async () => {
  const data = scratchFolder();
  writeFileSync(join(data, "admins.txt"), "Warden\n");
  const server = new Server(data);
  await server.start();
  try {
    // Logging out is the player's own doing, and the page then reloads (1001).
    const leaver = await Player.connect(server);
    await leaver.enter("Leaver");
    await leaver.ask({ t: "logout" }, "logged_out");
    await server.line(/ leave Leaver online=\d+ — logged out$/);
    leaver.ws.close(1001);
    await server.line(/ disconnect Leaver code=1001 up=\S+ quiet=\S+ ip=\S+ — the page was closed, reloaded or left$/);

    const closer = await Player.connect(server);
    await closer.enter("Closer");
    closer.ws.close(1000);
    await server.line(/ disconnect Closer code=1000 .* — the browser closed it$/);
    await server.line(/ leave Closer online=\d+ — connection closed$/);

    // No closing handshake at all: the connection is simply cut.
    const cutter = await Player.connect(server);
    await cutter.enter("Cutter");
    cutter.ws.terminate();
    await server.line(/ disconnect Cutter code=1006 .* — cut off without a goodbye: the network, the host's proxy, or the browser itself went away$/);

    // A connection that stops answering pings is cut on the heartbeat after the one it missed: after one
    // heartbeat at the least, and within two.
    const silent = await Player.connect(server, { autoPong: false });
    const opened = performance.now();
    await silent.enter("Silent");
    await silent.closed(4 * HEARTBEAT_MS);
    const waited = silent.closedAt - opened;
    assert.ok(waited >= HEARTBEAT_MS && waited < 2 * HEARTBEAT_MS + 500, `cut after ${Math.round(waited)} ms`);
    await server.line(/ disconnect Silent code=1006 .* quiet=\S+ .* — the server ended it: stopped answering pings$/);
    await server.line(/ leave Silent online=\d+ — connection closed$/);

    // The same account in on a second connection ends the first.
    const first = await Player.connect(server);
    const token = await first.enter("Twice");
    const second = await Player.connect(server);
    await second.ask({ t: "resume", token }, "authed");
    await first.closed();
    await server.line(/ leave Twice online=\d+ — signed in elsewhere$/);
    await server.line(/ disconnect Twice code=\d+ .* — the server ended it: the account signed in on another connection \(ip=\S+\)$/);
    second.ws.close(1000);

    const warden = await Player.connect(server);
    await warden.enter("Warden");
    const rowdy = await Player.connect(server);
    await rowdy.enter("Rowdy");
    warden.send({ t: "chat", text: "::kick Rowdy" });
    await rowdy.closed();
    await server.line(/ leave Rowdy online=\d+ — removed by a moderator$/);
    await server.line(/ disconnect Rowdy code=\d+ .* — the server ended it: removed by a moderator \(You were removed from the game by a moderator\.\)$/);
    warden.ws.close(1000);

    // A flood is cut before it signs in, so it has no name.
    const flood = await Player.connect(server);
    for (let i = 0; i < 40; i++) flood.send({ t: "close" });
    await flood.closed();
    await server.line(/ disconnect - code=\d+ .* — the server ended it: too many messages$/);

    // A page back in after a drop says what it saw, once a connection.
    const dropper = await Player.connect(server);
    await dropper.enter("Dropper");
    const report: C2S = { t: "dropped", code: 1006, clean: false, reason: "", ago: 3200, quiet: 400, hidden: false, offline: false, tries: 2 };
    dropper.send(report);
    await server.line(/ client saw a drop Dropper at=\S+Z code=1006 clean=no quiet=0\.4s down=3\.2s tries=2 hidden=no offline=no — cut between the page and the server, with the browser online$/);
    dropper.send(report);
    dropper.send({ ...report, tries: 3 });
    await dropper.ask({ t: "chat", text: "::players" }, "game");
    assert.equal(server.lines.filter((l) => l.includes("client saw a drop Dropper")).length, 1, "one report a connection");
    // Malformed reports are dropped by the parser: the good one after them is still the connection's one
    // report, so they never reached the server's handler, let alone the log.
    const probe = await Player.connect(server);
    await probe.enter("Probe");
    probe.send(JSON.stringify({ ...report, code: 99 }));
    probe.send(JSON.stringify({ ...report, ago: -1 }));
    probe.send({ ...report, tries: 7 });
    await server.line(/ client saw a drop Probe .* tries=7 /);
    // Before signing in there is nothing to report, and nothing is logged.
    const anon = await Player.connect(server);
    anon.send(report);
    await pause(300);
    assert.equal(server.lines.filter((l) => l.includes("client saw a drop -")).length, 0);
    for (const p of [dropper, probe, anon]) p.ws.close(1000);
  } finally {
    await server.stop();
  }
});

test("a stop says whether a deploy asked for it", async () => {
  const data = scratchFolder();
  const server = new Server(data);
  await server.start();
  const stayer = await Player.connect(server);
  await stayer.enter("Stayer");
  await server.stop();
  await server.line(/ stopping on SIGTERM pid=\d+ boot=\w+ up=\S+ — NO deploy asked for it: the host restarted or stopped the app; online=1: Stayer$/);
  await server.line(/ exit code=0 pid=\d+ boot=\w+$/);
  assert.equal(await stayer.closed(), 4001, "the page is told the server is restarting");

  writeFileSync(join(data, "last-deploy.txt"), "abc1234 2026-09-25T18:00:00Z\n");
  let from = server.lines.length;
  await server.start();
  await server.stop();
  await server.line(/ stopping on SIGTERM .* — a deploy asked for it \(abc1234 2026-09-25T18:00:00Z, \d+\.\ds ago\); online=0$/, 3000, from);

  // A mark older than the deploy window belongs to an earlier deploy, not to this stop.
  const old = new Date(Date.now() - 10 * 60_000);
  utimesSync(join(data, "last-deploy.txt"), old, old);
  from = server.lines.length;
  await server.start();
  await server.stop();
  await server.line(/ stopping on SIGTERM .* — NO deploy asked for it/, 3000, from);
});

test("a run killed outright is told on the next start; a clean stop is not", async () => {
  const data = scratchFolder();
  const server = new Server(data);
  await server.start();
  const boot = /boot=(\w+)/.exec(await server.line(/world server started/))![1]!;
  const pid = server.proc!.pid!;
  await server.stop("SIGKILL");
  let from = server.lines.length;
  await server.start();
  await server.line(new RegExp(`the run pid=${pid} boot=${boot} ended without its clean stop: killed outright .*; started \\S+Z, last seen alive \\S+Z \\(rewritten every minute\\)$`), 3000, from);

  // The control: stopped cleanly, the next start has nothing to tell.
  await server.stop();
  from = server.lines.length;
  await server.start();
  await server.stop();
  assert.equal(server.lines.slice(from).filter((l) => l.includes("ended without its clean stop")).length, 0, server.lines.slice(from).join("\n"));
});

test("dead runs: a record is dead when its process is gone or it stopped being rewritten, never when it is this run's", () => {
  const data = scratchFolder();
  const now = Date.now();
  writeRun(data, { pid: 11, boot: "gone", started: now - 60_000, alive: now - 30_000 });
  writeRun(data, { pid: 12, boot: "live", started: now - 60_000, alive: now - 30_000 });
  writeRun(data, { pid: 13, boot: "stale", started: now - 600_000, alive: now - 200_000 });
  writeRun(data, { pid: 14, boot: "mine", started: now, alive: now });
  writeRun(data, { pid: 15, boot: "stopped", started: now - 60_000, alive: now - 30_000, stopping: now - 20_000 });
  writeFileSync(join(data, "runs", "torn.json"), "{\"pid\": 1");
  const running = (pid: number) => pid !== 11 && pid !== 15;
  const found = deadRuns(data, "mine", now, running);
  assert.deepEqual(found.map((r) => r.boot).sort(), ["gone", "stale", "stopped", "torn"]);
  assert.match(describeDeadRun(found.find((r) => r.boot === "stopped")!), /; it had been told to stop at \S+Z and was killed while stopping$/);
  assert.match(describeDeadRun(found.find((r) => r.boot === "torn")!), /^the run pid=\? boot=torn ended .*; last seen alive \S+Z \(rewritten every minute\)$/);
  // Told once: the records told are gone.
  assert.deepEqual(deadRuns(data, "mine", now, running), []);
});

test("close reasons, drop reports and spans read as they should", () => {
  assert.equal(whyClosed("stopped answering pings", 1006, ""), "the server ended it: stopped answering pings");
  assert.equal(whyClosed(null, 1001, ""), "the page was closed, reloaded or left");
  assert.match(whyClosed(null, 1006, ""), /^cut off without a goodbye/);
  assert.equal(whyClosed(null, 4321, "odd\nthing"), "closed with code 4321 \"oddthing\"");
  assert.deepEqual([400, 3200, 12_500, 185_000, 7_500_000].map(span), ["0.4s", "3.2s", "12s", "3m05s", "2h05m"]);

  const report = { t: "dropped", code: 1006, clean: false, reason: "", ago: 3200, quiet: 400, hidden: false, offline: false, tries: 2 } as const;
  assert.deepEqual(parseC2S(JSON.stringify(report)), report);
  assert.equal(describeDrop({ ...report, offline: true }, Date.now()).at(-1), "— the browser had no network");
  assert.equal(describeDrop({ ...report, code: 4001 }, Date.now()).at(-1), "— the server restarted");
  // In the background, a 1006 may be the browser's own doing: no verdict.
  assert.equal(describeDrop({ ...report, hidden: true }, Date.now()).at(-1), "offline=no");
  // Everything a page could send that the log must not take.
  for (const bad of [{ code: 999 }, { code: 5000 }, { ago: -1 }, { ago: DAY_MS + 1 }, { quiet: 1.5 }, { tries: 1001 }, { clean: "no" }, { reason: "x".repeat(124) }]) {
    assert.equal(parseC2S(JSON.stringify({ ...report, ...bad })), null, JSON.stringify(bad));
  }
  const odd = parseC2S(JSON.stringify({ ...report, reason: "line\nbreak\u0000 and more" }));
  assert.equal(odd?.t === "dropped" && odd.reason, "linebreak and more");
});
