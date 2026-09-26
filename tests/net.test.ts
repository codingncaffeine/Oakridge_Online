// Runs the BUILT server bundle (dist/app/server.js, what ships) with real WebSocket clients, a scratch
// data folder and a file mailer. Build first: tools/check.sh does.
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { base32Decode, hotp, totpStep } from "../src/server/totp.ts";
import { TICK_MS } from "../src/shared/constants.ts";
import { item } from "../src/shared/items.ts";
import { STARTER_LOOK } from "../src/shared/look.ts";
import { carved, gotItem, HEARTH_BROKEN, noSuchPlayer, NOTHING_COMES, SEND_STAY, sendAsk, sendAsked, sendGo, sheared, spellNeeds } from "../src/shared/messages.ts";
import { fixedId } from "../src/shared/map.ts";
import { ALTAR_BY_RUNE } from "../src/shared/runesmithing.ts";
import { findPath, findPathTo, reaches } from "../src/shared/pathfind.ts";
import type { S2C } from "../src/shared/protocol.ts";
import { noXp } from "../src/shared/skills.ts";
import { SPELL_BY_KEY } from "../src/shared/spells.ts";
import { buildOakridge, OAKRIDGE_SEED } from "../src/shared/oakridge.ts";

const BUNDLE = "dist/app/server.js";
// Test data stays inside the project folder (scratch/ is ignored by git).
const SCRATCH = join(import.meta.dirname, "..", "scratch", "tmp");
mkdirSync(SCRATCH, { recursive: true });
const DATA = mkdtempSync(join(SCRATCH, "oakridge-test-"));
const OUTBOX = join(DATA, "outbox.jsonl");
let server: ChildProcess;
let port = 0;

async function startServer(): Promise<void> {
  // The world's random numbers are pinned at 0: every gathering roll succeeds, every timer takes its shortest time.
  server = spawn(process.execPath, [BUNDLE], {
    env: { ...process.env, PORT: String(port), OAKRIDGE_DATA: DATA, OAKRIDGE_MAIL: `file:${OUTBOX}`, OAKRIDGE_TEST_RAND: "0" },
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
  // The code used to sign up is kept: a test that recomputes "the code for now" gets a different one
  // whenever the 30-second step turns over mid-test.
  const used = codeFor(secret);
  const done = await c.ask({ t: "signup_confirm", code: used }, "signup_done", "auth_error");
  assert.equal(done.t, "signup_done", JSON.stringify(done));
  const d = done as Extract<S2C, { t: "signup_done" }>;
  const welcome = await c.ask({ t: "enter", look: STARTER_LOOK }, "welcome", "auth_error");
  assert.equal(welcome.t, "welcome");
  return { c, secret, used, token: d.token, backupCodes: d.backupCodes, welcome: welcome as Extract<S2C, { t: "welcome" }> };
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
  const map = buildOakridge(OAKRIDGE_SEED).planes.get(0)!;
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
  const replay = await g.c.ask({ t: "login", name: "gamma", code: g.used }, "authed", "auth_error");
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
  const map = buildOakridge(OAKRIDGE_SEED).planes.get(0)!;
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

type Inv = Extract<S2C, { t: "inventory" }>;
type Equip = Extract<S2C, { t: "equipment" }>;

test("items: starter kit, equip seen by others, private drops, taking, and it all saves", async () => {
  const axe = item("bronze_axe").id, pickaxe = item("bronze_pickaxe").id, coins = item("coins").id;
  const a = await totpPlayer("Itema"), b = await totpPlayer("Itemb");
  const kit = await a.c.next((m): m is Inv => m.t === "inventory");
  assert.equal(kit.items.filter(Boolean).length, 8, "starter kit");
  assert.equal(kit.items[0]?.id, axe);

  // Equip the axe: the owner's panels update and the other player sees it in the character's gear.
  let from = b.c.inbox.length;
  const eq = await a.c.ask({ t: "equip", slot: 0 }, "equipment");
  assert.equal((eq as Equip).items.weapon?.id, axe);
  await b.c.next((m): m is Tick => m.t === "tick" && m.ents.some((u) => u.id === a.welcome.id && u.gear?.includes(axe)), 3000, from);

  // One item used on another: nothing to make yet, so the classic reply.
  const used = await a.c.ask({ t: "use_item", slot: 2, on: 3 }, "game");
  assert.equal(used.text, NOTHING_COMES);

  // Drop the pickaxe: the dropper sees it at once, the other player doesn't (it's private for 60 s).
  from = b.c.inbox.length;
  const aFrom = a.c.inbox.length;
  a.c.send({ t: "drop", slot: 1 });
  const dropped = await a.c.next((m): m is Tick => m.t === "tick" && !!m.items?.add?.some((i) => i.id === pickaxe), 3000, aFrom);
  const uid = dropped.items!.add!.find((i) => i.id === pickaxe)!.uid;
  await b.c.next((m): m is Tick => m.t === "tick" && m.n >= dropped.n + 3, 4000, from);
  assert.ok(!b.c.inbox.slice(from).some((e) => e.msg.t === "tick" && e.msg.items?.add?.some((i) => i.uid === uid)), "private drop hidden from others");

  // Take it back, then walk over to the coin spawn and take that.
  const back = await a.c.ask({ t: "take", uid }, "inventory");
  assert.ok((back as Inv).items.some((s) => s?.id === pickaxe));
  const coinSpawn = a.c.inbox.flatMap((e) => (e.msg.t === "tick" ? e.msg.items?.add ?? [] : [])).find((i) => i.id === coins);
  assert.ok(coinSpawn, "the coin spawn is in view");
  // The starter kit's coins plus whatever this spawn holds, read from the spawn rather than assumed:
  // the map decides how many lie on the green, and the map is free to change.
  const purse = (kit.items.find((sl) => sl?.id === coins)?.count ?? 0) + coinSpawn.count;
  a.c.send({ t: "take", uid: coinSpawn.uid });
  const rich = await a.c.next((m): m is Inv => m.t === "inventory" && m.items.some((s) => s?.id === coins && s.count === purse), 8000);
  assert.ok(rich);

  // What is prayed and the spell a staff is set to are kept too: both were once dropped on the way back in.
  await a.c.ask({ t: "pray", key: "steady_hand", on: true }, "prayers");
  const set = await a.c.ask({ t: "autocast", spell: "gale_shot" }, "combat");
  assert.equal((set as Extract<S2C, { t: "combat" }>).autocast, "gale_shot");

  // Log out and back in: the inventory and equipment are where they were.
  await a.c.ask({ t: "logout" }, "logged_out");
  const again = await a.c.ask({ t: "login", name: "Itema", code: codeFor(a.secret, 1) }, "authed", "auth_error");
  assert.equal(again.t, "authed", JSON.stringify(again));
  const inFrom = a.c.inbox.length;
  await a.c.ask({ t: "enter" }, "welcome");
  const saved = await a.c.next((m): m is Inv => m.t === "inventory", 3000, inFrom);
  assert.ok(saved.items.some((s) => s?.id === coins && s.count === purse), "coins kept");
  const savedEq = await a.c.next((m): m is Equip => m.t === "equipment", 3000, inFrom);
  assert.equal(savedEq.items.weapon?.id, axe, "axe still in hand");
  const prayed = await a.c.next((m): m is Extract<S2C, { t: "prayers" }> => m.t === "prayers", 3000, inFrom);
  assert.deepEqual(prayed.on, ["steady_hand"], "the prayer that was on is on again");
  const fighting = await a.c.next((m): m is Extract<S2C, { t: "combat" }> => m.t === "combat", 3000, inFrom);
  assert.equal(fighting.autocast, "gale_shot", "and the staff is set to the same spell");
  a.c.close();
  b.c.close();
});

type Skills = Extract<S2C, { t: "skills" }>;
type Xp = Extract<S2C, { t: "xp" }>;
type WorldMsg = Extract<S2C, { t: "world" }>;

test("gathering: chop a tree while another player watches; the log, the XP and the fall; XP is saved", async () => {
  const lumber = await totpPlayer("Lumber"), watcher = await totpPlayer("Watcher");
  const start = await lumber.c.next((m): m is Skills => m.t === "skills");
  assert.deepEqual(start.xp, noXp(), "a fresh character starts every skill where that skill starts");
  const world = await lumber.c.next((m): m is WorldMsg => m.t === "world");
  // Oakridge's own two waters are both net spots, as PLAN §8.4 has it: the district deliberately stops
  // at smelt, and the rod, the creel and the harpoon are what the settlements of Wave 1 are for.
  assert.ok(world.spots.length > 0, "there are fishing spots");
  assert.deepEqual([...new Set(world.spots.map((s) => s.method))].sort(), ["angle", "harpoon", "net", "trap"], "and Stonecote adds the rod water up the North Road, Brinehaven the creel beds down the Coast Road (Wave 1), and Tarhollow the harpoon's blackfish off its jetty (Wave 2)");

  // The plain tree nearest to where Lumber stands, by the walk up to it.
  const map = buildOakridge(OAKRIDGE_SEED).planes.get(0)!;
  const w = lumber.welcome;
  const tree = map.objects.filter((o) => o.kind === "tree" && !world.depleted.includes(o.id))
    .map((o) => ({ o, walk: findPathTo(map.collision, w.x, w.y, { x: o.x, y: o.y, w: 1, h: 1 }) }))
    .filter(({ o, walk }) => { const end = walk.at(-1) ?? w; return reaches(map.collision, end.x, end.y, { x: o.x, y: o.y, w: 1, h: 1 }); })
    .sort((a, b) => a.walk.length - b.walk.length)[0]!.o;

  // The wood starts a walk away from the green, further than either player can see the other from the
  // spawn, so the watcher goes over first and waits there: the point of the check is that a SECOND
  // player sees the chopping, not how far apart they can stand.
  const stand = findPathTo(map.collision, w.x, w.y, { x: tree.x, y: tree.y, w: 1, h: 1 }).at(-1) ?? w;
  watcher.c.send({ t: "walk", x: stand.x, y: stand.y + 1 });
  await watcher.c.next(
    (m): m is Tick => m.t === "tick"
      && m.ents.some((u) => u.id === watcher.welcome.id && Math.abs(u.x - tree.x) <= 3 && Math.abs(u.y - tree.y) <= 3),
    40000,
  );

  const seenFrom = watcher.c.inbox.length, from = lumber.c.inbox.length;
  lumber.c.send({ t: "object", id: tree.id });
  const acting = await watcher.c.next((m): m is Tick => m.t === "tick" && m.ents.some((u) => u.id === w.id && u.act?.anim === "chop"), 40000, seenFrom);
  assert.deepEqual(acting.ents.find((u) => u.id === w.id)!.act, { anim: "chop", tool: item("bronze_axe").id, x: tree.x, y: tree.y });
  const logs = await lumber.c.next((m): m is Inv => m.t === "inventory" && m.items.some((s) => s?.id === item("logs").id), 12000, from);
  assert.ok(logs);
  const xp = await lumber.c.next((m): m is Xp => m.t === "xp", 3000, from);
  assert.deepEqual(xp, { t: "xp", skill: "woodcutting", xp: 220 });
  await lumber.c.next((m): m is Extract<S2C, { t: "game" }> => m.t === "game" && m.text === gotItem("chop", "Logs"), 3000, from);
  // The tree falls for everyone, and the chopping stops.
  await watcher.c.next((m): m is Tick => m.t === "tick" && !!m.objs?.some(([id, out]) => id === tree.id && out === 1), 3000, seenFrom);
  await watcher.c.next((m): m is Tick => m.t === "tick" && m.ents.some((u) => u.id === w.id && u.act === null), 3000, seenFrom);

  // A newcomer hears the tree is down; after logging out and back in, the XP is still there.
  const late = await totpPlayer("Latecomer");
  const lateWorld = await late.c.next((m): m is WorldMsg => m.t === "world");
  assert.ok(lateWorld.depleted.includes(tree.id), "the fallen tree is in the newcomer's world state");
  await lumber.c.ask({ t: "logout" }, "logged_out");
  const again = await lumber.c.ask({ t: "login", name: "Lumber", code: codeFor(lumber.secret, 1) }, "authed", "auth_error");
  assert.equal(again.t, "authed", JSON.stringify(again));
  const inFrom = lumber.c.inbox.length;
  await lumber.c.ask({ t: "enter" }, "welcome");
  const saved = await lumber.c.next((m): m is Skills => m.t === "skills", 3000, inFrom);
  assert.equal(saved.xp.woodcutting, 220);
  for (const c of [lumber.c, watcher.c, late.c]) c.close();
});

test("friends, private messages and ignoring: a friend shows in the world, a message reaches them, an ignored one's does not, and leaving shows away", async () => {
  const a = await totpPlayer("Friendly"), b = await totpPlayer("Friend");
  // A adds B: the list says B is in the world. A name that is nobody's is refused with a word.
  const list = await a.c.ask({ t: "friend_add", name: "Friend" }, "friends");
  assert.deepEqual(list.friends, [{ name: "Friend", online: true }]);
  const refused = await a.c.ask({ t: "friend_add", name: "Nobody Here" }, "game");
  assert.equal(refused.text, noSuchPlayer("Nobody Here"));
  // A messages B: both ends see it.
  const from = b.c.inbox.length;
  const echo = await a.c.ask({ t: "pm", to: "Friend", text: "hello there" }, "pm");
  assert.deepEqual(echo, { t: "pm", from: "Friendly", to: "Friend", text: "hello there" });
  const got = await b.c.next((m): m is Extract<S2C, { t: "pm" }> => m.t === "pm", 3000, from);
  assert.equal(got.text, "hello there");
  // B ignores A: A's next message goes nowhere, though A still sees it sent; B hears nothing in a second.
  const ignored = await b.c.ask({ t: "ignore_add", name: "Friendly" }, "friends");
  assert.deepEqual(ignored.ignores, ["Friendly"]);
  const from2 = b.c.inbox.length;
  await a.c.ask({ t: "pm", to: "Friend", text: "still there?" }, "pm");
  await new Promise((r) => setTimeout(r, 800));
  assert.ok(!b.c.inbox.slice(from2).some((e) => e.msg.t === "pm"), "B hears nothing from someone ignored");
  // B stops ignoring: A's messages reach B again (the control).
  const cleared = await b.c.ask({ t: "ignore_remove", name: "Friendly" }, "friends");
  assert.deepEqual(cleared.ignores, []);
  const from3 = b.c.inbox.length;
  await a.c.ask({ t: "pm", to: "Friend", text: "back?" }, "pm");
  await b.c.next((m): m is Extract<S2C, { t: "pm" }> => m.t === "pm" && m.text === "back?", 3000, from3);
  // B leaves: A's list shows B away, and a message to B says so.
  const from4 = a.c.inbox.length;
  b.c.send({ t: "logout" });
  await a.c.next((m): m is Extract<S2C, { t: "friends" }> => m.t === "friends" && m.friends.some((f) => f.name === "Friend" && !f.online), 5000, from4);
  const gone = await a.c.ask({ t: "pm", to: "Friend", text: "gone?" }, "game");
  assert.equal(gone.text, "Friend is not online.");
  const removed = await a.c.ask({ t: "friend_remove", name: "Friend" }, "friends");
  assert.deepEqual(removed.friends, []);
  a.c.close();
  b.c.close();
});

test("spells on oneself, the pack and the ground reach the world: Hearthward is drawn for the caster and an onlooker and a step breaks it, and a spell above the level is refused by name", async () => {
  const caster = await totpPlayer("Caster"), onlooker = await totpPlayer("Onlooker");
  const id = caster.welcome.id;
  const said = (text: string) => (m: S2C): m is Extract<S2C, { t: "game" }> => m.t === "game" && m.text === text;
  const needs = (key: string) => spellNeeds(SPELL_BY_KEY.get(key)!.level, SPELL_BY_KEY.get(key)!.name);
  // Hearthward asks no level and no runes: its cast is drawn at the caster, for the caster and for anyone in view.
  const casting = (m: S2C): m is Tick => m.t === "tick" && m.ents.some((u) => u.id === id && u.spell === "hearthward");
  const from = caster.c.inbox.length, seen = onlooker.c.inbox.length;
  caster.c.send({ t: "cast_self", spell: "hearthward" });
  await caster.c.next(casting, 3000, from);
  await onlooker.c.next(casting, 3000, seen);
  // A step breaks it, and the caster is told.
  const walked = caster.c.inbox.length;
  caster.c.send({ t: "walk", x: caster.welcome.x + 2, y: caster.welcome.y });
  await caster.c.next(said(HEARTH_BROKEN), 3000, walked);
  // On an item in the pack, and on one on the ground (dropped at the caster's feet): the level is asked for by name.
  const gild = caster.c.inbox.length;
  caster.c.send({ t: "cast_item", spell: "lesser_gilding", slot: 0 });
  await caster.c.next(said(needs("lesser_gilding")), 3000, gild);
  const pickaxe = item("bronze_pickaxe").id, dropFrom = caster.c.inbox.length;
  caster.c.send({ t: "drop", slot: 1 });
  const dropped = await caster.c.next((m): m is Tick => m.t === "tick" && !!m.items?.add?.some((i) => i.id === pickaxe), 3000, dropFrom);
  const grab = caster.c.inbox.length;
  caster.c.send({ t: "cast_ground", spell: "beckon", uid: dropped.items!.add!.find((i) => i.id === pickaxe)!.uid });
  await caster.c.next(said(needs("beckon")), 3000, grab);
  caster.c.close();
  onlooker.c.close();
});

test("Send-to through the built server: cast on another player, who is asked in the dialogue box, and a yes sends them to the town", async () => {
  const sender = await totpPlayer("Sender"), asked = await totpPlayer("Askee");
  const said = (text: string) => (m: S2C): m is Extract<S2C, { t: "game" }> => m.t === "game" && m.text === text;
  const spell = SPELL_BY_KEY.get("send_wickstead")!, lands = SPELL_BY_KEY.get("wickstead_teleport")!.lands!;
  // A fresh character has not the level: the cast on a player is read, routed and refused by name.
  const early = sender.c.inbox.length;
  sender.c.send({ t: "cast", spell: spell.key, id: asked.welcome.id });
  await sender.c.next(said(spellNeeds(spell.level, spell.name)), 3000, early);
  // The level and the runes (a test run's grant), then the cast: the other player is asked, the caster told so.
  const granted = sender.c.inbox.length;
  for (const [what, n] of [["magic", spell.level], ["oath_rune", 1], ["shade_rune", 1], ["tide_rune", 1]] as const) sender.c.send({ t: "grant", what, n });
  await sender.c.next((m): m is Inv => m.t === "inventory" && m.items.some((s) => s?.id === item("tide_rune").id), 3000, granted);
  const from = sender.c.inbox.length, seen = asked.c.inbox.length;
  sender.c.send({ t: "cast", spell: spell.key, id: asked.welcome.id });
  const question = await asked.c.next((m): m is Extract<S2C, { t: "say" }> => m.t === "say" && m.speaker === "Sender", 3000, seen);
  assert.deepEqual(question, { t: "say", speaker: "Sender", lines: [sendAsk("Sender", "Wickstead")], options: [sendGo("Wickstead"), SEND_STAY] });
  await sender.c.next(said(sendAsked("Askee")), 3000, from);
  // A yes: after the teleport's cast they stand where Wickstead's teleport lands.
  const answered = asked.c.inbox.length;
  asked.c.send({ t: "say", option: 0 });
  await asked.c.next((m): m is Tick => m.t === "tick" && m.ents.some((u) => u.id === asked.welcome.id && u.x === lands.x && u.y === lands.y), 5000, answered);
  sender.c.close();
  asked.c.close();
});

test("carving through the built server: an altar's id, far above the builder's, is read, and the glimstone comes back as runes", async () => {
  const carver = await totpPlayer("Carver");
  const gale = ALTAR_BY_RUNE.get("gale_rune")!;
  const said = (text: string) => (m: S2C): m is Extract<S2C, { t: "game" }> => m.t === "game" && m.text === text;
  const granted = carver.c.inbox.length;
  for (const [what, n] of [["runesmithing", 11], ["gale_charm", 1], ["glimstone", 5]] as const) carver.c.send({ t: "grant", what, n });
  // Glimstone stacks: the five arrive as one slot of five.
  await carver.c.next((m): m is Inv => m.t === "inventory" && m.items.some((s) => s?.id === item("glimstone").id && s.count === 5), 3000, granted);
  carver.c.send({ t: "place", x: gale.at.x + 1, y: gale.at.y });
  const from = carver.c.inbox.length;
  carver.c.send({ t: "object", id: fixedId(gale.at.x, gale.at.y, gale.at.plane) });
  await carver.c.next(said(carved(10, "Gale rune")), 5000, from);
  const pack = await carver.c.next((m): m is Inv => m.t === "inventory" && m.items.some((s) => s?.id === item("gale_rune").id), 3000, from);
  assert.equal(pack.items.find((s) => s?.id === item("gale_rune").id)?.count, 10, "five stones, two gale runes each at level 11");
  carver.c.close();
});

test("bags through the built server: a worn bag lengthens the pack, and a relog keeps it worn and the pack as long", async () => {
  const packer = await totpPlayer("Packer");
  const granted = packer.c.inbox.length;
  packer.c.send({ t: "grant", what: "large_pouch", n: 1 });
  const pack = await packer.c.next((m): m is Inv => m.t === "inventory" && m.items.some((s) => s?.id === item("large_pouch").id), 3000, granted);
  const worn = packer.c.inbox.length;
  packer.c.send({ t: "wear_bag", slot: pack.items.findIndex((s) => s?.id === item("large_pouch").id) });
  const bags = await packer.c.next((m): m is Extract<S2C, { t: "bags" }> => m.t === "bags" && m.items[0]?.id === item("large_pouch").id, 3000, worn);
  assert.equal(bags.items.length, 5, "five bag slots");
  const longer = await packer.c.next((m): m is Inv => m.t === "inventory" && m.items.length === 34, 3000, worn);
  assert.ok(!longer.items.some((s) => s?.id === item("large_pouch").id), "the pouch left the pack for its bag slot");
  // Log out and back in: still worn, the pack still 34 slots.
  await packer.c.ask({ t: "logout" }, "logged_out");
  const again = await packer.c.ask({ t: "login", name: "Packer", code: codeFor(packer.secret, 1) }, "authed", "auth_error");
  assert.equal(again.t, "authed", JSON.stringify(again));
  const inFrom = packer.c.inbox.length;
  await packer.c.ask({ t: "enter" }, "welcome");
  const back = await packer.c.next((m): m is Inv => m.t === "inventory", 3000, inFrom);
  assert.equal(back.items.length, 34, "the pack as long as it was");
  const wornAgain = await packer.c.next((m): m is Extract<S2C, { t: "bags" }> => m.t === "bags", 3000, inFrom);
  assert.equal(wornAgain.items[0]?.id, item("large_pouch").id, "and the pouch still worn");
  // Taken off, it comes back into the pack and the pack is 28 again.
  const off = packer.c.inbox.length;
  packer.c.send({ t: "remove_bag", index: 0 });
  const shorter = await packer.c.next((m): m is Inv => m.t === "inventory" && m.items.length === 28, 3000, off);
  assert.ok(shorter.items.some((s) => s?.id === item("large_pouch").id), "the pouch is back in the pack");
  packer.c.close();
});

test("shearing through the built server: an item used on a creature is read, and shears on a ram come back as wool", async () => {
  const shearer = await totpPlayer("Shearer");
  const granted = shearer.c.inbox.length;
  shearer.c.send({ t: "grant", what: "shears", n: 1 });
  const pack = await shearer.c.next((m): m is Inv => m.t === "inventory" && m.items.some((s) => s?.id === item("shears").id), 3000, granted);
  const slot = pack.items.findIndex((s) => s?.id === item("shears").id);
  // Into Hollowbeck Farm's sheep pen, among the rams.
  const from = shearer.c.inbox.length;
  shearer.c.send({ t: "place", x: 3241, y: 3285 });
  const seen = await shearer.c.next((m): m is Extract<S2C, { t: "tick" }> => m.t === "tick" && m.ents.some((u) => u.npc === "ram"), 5000, from);
  const ram = seen.ents.find((u) => u.npc === "ram")!;
  const asked = shearer.c.inbox.length;
  shearer.c.send({ t: "use_npc", slot, id: ram.id });
  await shearer.c.next((m): m is Extract<S2C, { t: "game" }> => m.t === "game" && m.text === sheared("Ram"), 10000, asked);
  const wool = await shearer.c.next((m): m is Inv => m.t === "inventory" && m.items.some((s) => s?.id === item("wool").id), 3000, asked);
  assert.equal(wool.items.find((s) => s?.id === item("wool").id)?.count, 1);
  shearer.c.close();
});
