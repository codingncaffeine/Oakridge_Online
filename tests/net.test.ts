// Runs the BUILT server bundle (dist/app/server.js, what ships) with real WebSocket clients, a scratch
// data folder and a file mailer. Build first: tools/check.sh does.
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { base32Decode, hotp, totpStep } from "../src/server/totp.ts";
import { TICK_MS } from "../src/shared/constants.ts";
import { STARTER_LOOK } from "../src/shared/look.ts";
import { findPath } from "../src/shared/pathfind.ts";
import type { S2C } from "../src/shared/protocol.ts";
import { buildTestMap, TEST_MAP_SEED } from "../src/shared/testmap.ts";

const BUNDLE = "dist/app/server.js";
const DATA = mkdtempSync(join(tmpdir(), "oakridge-test-"));
const OUTBOX = join(DATA, "outbox.jsonl");
let server: ChildProcess;
let port = 0;

async function startServer(): Promise<void> {
  server = spawn(process.execPath, [BUNDLE], {
    env: { ...process.env, PORT: String(port), OAKRIDGE_DATA: DATA, OAKRIDGE_MAIL: `file:${OUTBOX}` },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("server did not start")), 5000);
    server.stderr!.on("data", (d: Buffer) => {
      if (d.toString().includes("world server started")) {
        clearTimeout(timer);
        resolve();
      }
    });
  });
}

async function stopServer(): Promise<void> {
  const exited = new Promise((r) => server.once("exit", r));
  server.kill("SIGTERM");
  await exited;
}

before(async () => {
  assert.ok(existsSync(BUNDLE), `${BUNDLE} missing: build first`);
  port = 20000 + Math.floor(Math.random() * 20000);
  await startServer();
});

after(async () => {
  await stopServer();
  rmSync(DATA, { recursive: true, force: true });
});

class Client {
  readonly ws: WebSocket;
  readonly inbox: Array<{ msg: S2C; at: number }> = [];
  closeCode = 0;
  constructor() {
    this.ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    this.ws.onmessage = (e) => this.inbox.push({ msg: JSON.parse(String(e.data)) as S2C, at: performance.now() });
    this.ws.onclose = (e) => { this.closeCode = e.code; };
  }
  opened(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws.onopen = () => resolve();
      this.ws.onerror = () => reject(new Error("socket error"));
    });
  }
  send(obj: unknown): void {
    this.ws.send(typeof obj === "string" ? obj : JSON.stringify(obj));
  }
  /** The first message from index `from` on that satisfies `ok`. */
  async next<T extends S2C>(ok: (m: S2C) => m is T, ms = 3000, from = 0): Promise<T> {
    const end = performance.now() + ms;
    for (;;) {
      const hit = this.inbox.slice(from).find((e) => ok(e.msg));
      if (hit) return hit.msg as T;
      if (performance.now() > end) throw new Error(`timed out; last: ${JSON.stringify(this.inbox.at(-1)?.msg)}`);
      await new Promise((r) => setTimeout(r, 25));
    }
  }
  /** Sends `obj`, then waits for the first reply of one of the given types. */
  async ask<T extends S2C["t"]>(obj: unknown, ...types: T[]): Promise<Extract<S2C, { t: T }>> {
    const from = this.inbox.length;
    this.send(obj);
    return this.next((m): m is Extract<S2C, { t: T }> => (types as string[]).includes(m.t), 3000, from);
  }
  close(): void {
    this.ws.close();
  }
}

type Tick = Extract<S2C, { t: "tick" }>;
const connect = async () => {
  const c = new Client();
  await c.opened();
  return c;
};
const codeFor = (secret: string, stepOffset = 0) => hotp(base32Decode(secret), totpStep(Date.now()) + stepOffset);
const lastEmailCode = (to: string) => {
  const mails = readFileSync(OUTBOX, "utf8").trim().split("\n").map((l) => JSON.parse(l) as { to: string; text: string });
  const mail = mails.filter((m) => m.to === to).at(-1);
  return /code is: (\d{6})/.exec(mail?.text ?? "")?.[1] ?? "";
};

/** Signs up with an authenticator and enters the world; returns the client, secret and backup codes. */
async function totpPlayer(name: string) {
  const c = await connect();
  const setup = await c.ask({ t: "signup", name, method: "totp" }, "signup_totp", "auth_error");
  assert.equal(setup.t, "signup_totp", JSON.stringify(setup));
  const secret = (setup as Extract<S2C, { t: "signup_totp" }>).secret;
  const done = await c.ask({ t: "signup_confirm", code: codeFor(secret) }, "signup_done", "auth_error");
  assert.equal(done.t, "signup_done", JSON.stringify(done));
  const d = done as Extract<S2C, { t: "signup_done" }>;
  const welcome = await c.ask({ t: "enter", look: STARTER_LOOK }, "welcome", "auth_error");
  assert.equal(welcome.t, "welcome");
  return { c, secret, token: d.token, backupCodes: d.backupCodes, welcome: welcome as Extract<S2C, { t: "welcome" }> };
}

test("sign up with an authenticator and by email; both players see each other walk", async () => {
  const alpha = await totpPlayer("Alpha");
  assert.equal(alpha.backupCodes.length, 10);

  const b = await connect();
  const sent = await b.ask({ t: "signup", name: "Beta", method: "email", email: "Beta@Example.com" }, "signup_email", "auth_error");
  assert.deepEqual(sent, { t: "signup_email", to: "b**a@example.com" });
  const wrong = await b.ask({ t: "signup_confirm", code: "000000" }, "signup_done", "auth_error");
  assert.equal(wrong.t, "auth_error");
  const done = await b.ask({ t: "signup_confirm", code: lastEmailCode("beta@example.com") }, "signup_done", "auth_error");
  assert.equal(done.t, "signup_done", JSON.stringify(done));
  await b.ask({ t: "enter", look: STARTER_LOOK }, "welcome");

  const aId = alpha.welcome.id;
  await b.next((m): m is Tick => m.t === "tick" && m.ents.some((e) => e.id === aId && e.name === "Alpha"));
  const map = buildTestMap(TEST_MAP_SEED);
  const w = alpha.welcome;
  const target = [0, 1, -1].map((dy) => ({ x: w.x + 3, y: w.y + dy })).find((t) => findPath(map.collision, w.x, w.y, t.x, t.y).length === 3)!;
  const from = b.inbox.length;
  alpha.c.send({ t: "walk", x: target.x, y: target.y });
  await b.next((m): m is Tick => m.t === "tick" && m.ents.some((e) => e.id === aId && !!e.steps?.some(([x, y]) => x === target.x && y === target.y)), 5000, from);
  const seen = b.inbox.slice(from).flatMap((e) => (e.msg.t === "tick" ? e.msg.ents.find((u) => u.id === aId)?.steps ?? [] : []));
  assert.equal(seen.length, 3, JSON.stringify(seen));

  const tickCount = () => b.inbox.filter((e) => e.msg.t === "tick").length;
  await b.next((m): m is Tick => m.t === "tick" && tickCount() >= 8, 8000);
  const ticks = b.inbox.filter((e) => e.msg.t === "tick").map((e) => e.at);
  const gaps = ticks.slice(1).map((t, i) => t - ticks[i]!);
  for (const g of gaps) assert.ok(g > TICK_MS * 0.8 && g < TICK_MS * 1.25, `tick gap ${g.toFixed(0)} ms`);

  // The same email can't sign up twice, and the name is taken.
  const again = await b.ask({ t: "logout" }, "logged_out");
  assert.equal(again.t, "logged_out");
  const dupe = await b.ask({ t: "signup", name: "Beta", method: "totp" }, "signup_totp", "auth_error");
  assert.deepEqual(dupe, { t: "auth_error", reason: "That name is taken." });
  alpha.c.close();
  b.close();
});

test("codes: a used authenticator code is refused, backup codes work once, wrong codes lock", async () => {
  const g = await totpPlayer("Gamma");
  await g.c.ask({ t: "logout" }, "logged_out");
  // The sign-up used the current step's code, so the same code can't log in again.
  const replay = await g.c.ask({ t: "login", name: "gamma", code: codeFor(g.secret) }, "authed", "auth_error");
  assert.deepEqual(replay, { t: "auth_error", reason: "That code was already used. Wait for the next one." });
  // The next step's code is within the drift window and hasn't been used.
  const ok = await g.c.ask({ t: "login", name: "gamma", code: codeFor(g.secret, 1) }, "authed", "auth_error");
  assert.equal(ok.t, "authed", JSON.stringify(ok));
  assert.equal((ok as Extract<S2C, { t: "authed" }>).hasCharacter, true);
  await g.c.ask({ t: "logout" }, "logged_out");

  const backup = g.backupCodes[0]!;
  const viaBackup = await g.c.ask({ t: "login", name: "Gamma", code: backup.toUpperCase() }, "authed", "auth_error");
  assert.equal(viaBackup.t, "authed");
  assert.equal((viaBackup as Extract<S2C, { t: "authed" }>).backupLeft, 9);
  await g.c.ask({ t: "logout" }, "logged_out");
  const reused = await g.c.ask({ t: "login", name: "Gamma", code: backup }, "authed", "auth_error");
  assert.equal(reused.t, "auth_error");

  // Wrong codes: after the free failures (the reused backup code was one), a lockout starts.
  let last: S2C | null = null;
  for (let i = 0; i < 5; i++) last = await g.c.ask({ t: "login", name: "Gamma", code: "999999" }, "authed", "auth_error");
  assert.match((last as { reason: string }).reason, /try again in \d+ minute/);
  const locked = await g.c.ask({ t: "login", name: "Gamma", code: codeFor(g.secret, 1) }, "authed", "auth_error");
  assert.match((locked as { reason: string }).reason, /Too many wrong codes/);
  g.c.close();
});

test("one session per account: logging in again ends the first connection", async () => {
  const d = await totpPlayer("Delta");
  const second = await connect();
  const r = await second.ask({ t: "login", name: "Delta", code: d.backupCodes[1]! }, "authed", "auth_error");
  assert.equal(r.t, "authed");
  await d.c.next((m): m is Extract<S2C, { t: "kicked" }> => m.t === "kicked");
  await new Promise((res) => setTimeout(res, 200));
  assert.equal(d.c.closeCode, 4002);
  second.close();
});

test("names are checked, and junk is ignored", async () => {
  const c = await connect();
  c.send("not json");
  c.send({ t: "walk", x: 1, y: 1 });
  for (const [name, reason] of [["<script>", /letters/], ["Admin", /reserved/], [Buffer.from("QjFnRDFjaw==", "base64").toString(), /different name/]] as const) {
    const r = await c.ask({ t: "signup", name, method: "totp" }, "signup_totp", "auth_error");
    assert.match((r as { reason: string }).reason, reason, name);
  }
  const bad = await c.ask({ t: "signup", name: "Eps", method: "email", email: "not-an-address" }, "signup_email", "auth_error");
  assert.match((bad as { reason: string }).reason, /email address/);
  c.close();
});

test("a restart keeps characters, and a session resumes without a new code", async () => {
  const e = await totpPlayer("Epsilon");
  const w = e.welcome;
  const map = buildTestMap(TEST_MAP_SEED);
  const target = [0, 1, -1].map((dy) => ({ x: w.x - 2, y: w.y + dy })).find((t) => findPath(map.collision, w.x, w.y, t.x, t.y).length === 2)!;
  e.c.send({ t: "walk", x: target.x, y: target.y });
  await e.c.next((m): m is Tick => m.t === "tick" && m.ents.some((u) => u.id === w.id && u.x === target.x && u.y === target.y), 4000);

  await stopServer();
  await startServer();

  const back = await connect();
  const resumed = await back.ask({ t: "resume", token: e.token }, "authed", "auth_error");
  assert.equal(resumed.t, "authed", JSON.stringify(resumed));
  const welcome = await back.ask({ t: "enter" }, "welcome", "auth_error");
  assert.deepEqual(welcome.t === "welcome" ? [welcome.x, welcome.y] : null, [target.x, target.y], "back where they stood");
  const bogus = await (await connect()).ask({ t: "resume", token: "x".repeat(43) }, "authed", "auth_error");
  assert.equal(bogus.t, "auth_error");
  back.close();
});
