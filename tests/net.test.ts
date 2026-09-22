// Runs the BUILT server bundle (dist/app/server.js, what ships) with real WebSocket clients.
// Build first: tools/check.sh does.
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { after, before, test } from "node:test";
import { TICK_MS } from "../src/shared/constants.ts";
import { findPath } from "../src/shared/pathfind.ts";
import type { S2C } from "../src/shared/protocol.ts";
import { buildTestMap, TEST_MAP_SEED } from "../src/shared/testmap.ts";

const BUNDLE = "dist/app/server.js";
let server: ChildProcess;
let port = 0;

before(async () => {
  assert.ok(existsSync(BUNDLE), `${BUNDLE} missing: build first`);
  port = 20000 + Math.floor(Math.random() * 20000);
  server = spawn(process.execPath, [BUNDLE], { env: { ...process.env, PORT: String(port) }, stdio: ["ignore", "pipe", "pipe"] });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("server did not start")), 5000);
    server.stderr!.on("data", (d: Buffer) => {
      if (d.toString().includes("world server started")) {
        clearTimeout(timer);
        resolve();
      }
    });
  });
});

after(() => {
  server.kill("SIGTERM");
});

class Client {
  readonly ws: WebSocket;
  readonly inbox: Array<{ msg: S2C; at: number }> = [];
  private waiters: Array<() => void> = [];
  constructor() {
    this.ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    this.ws.onmessage = (e) => {
      this.inbox.push({ msg: JSON.parse(String(e.data)) as S2C, at: performance.now() });
      for (const w of this.waiters.splice(0)) w();
    };
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
  /** Waits for the first message (from `from` on) that satisfies `ok`. */
  async next<T extends S2C>(ok: (m: S2C) => m is T, ms = 3000, from = 0): Promise<T> {
    const end = performance.now() + ms;
    for (;;) {
      const hit = this.inbox.slice(from).find((e) => ok(e.msg));
      if (hit) return hit.msg as T;
      if (performance.now() > end) throw new Error("timed out waiting for a message");
      await new Promise<void>((r) => {
        this.waiters.push(r);
        setTimeout(r, 50);
      });
    }
  }
  close(): void {
    this.ws.close();
  }
}

const isWelcome = (m: S2C): m is Extract<S2C, { t: "welcome" }> => m.t === "welcome";
const isDenied = (m: S2C): m is Extract<S2C, { t: "denied" }> => m.t === "denied";
type Tick = Extract<S2C, { t: "tick" }>;

test("two players see each other walk; ticks arrive every 600 ms", async () => {
  const a = new Client(), b = new Client();
  await Promise.all([a.opened(), b.opened()]);
  a.send({ t: "hello", name: "Alpha" });
  const wa = await a.next(isWelcome);
  b.send({ t: "hello", name: "Beta" });
  await b.next(isWelcome);
  const aId = wa.id;
  await b.next((m): m is Tick => m.t === "tick" && m.ents.some((e) => e.id === aId && e.name === "Alpha"));

  const map = buildTestMap(TEST_MAP_SEED);
  const target = [0, 1, -1].map((dy) => ({ x: wa.x + 3, y: wa.y + dy }))
    .find((t) => findPath(map.collision, wa.x, wa.y, t.x, t.y).length === 3)!;
  assert.ok(target, "a tile 3 steps east of spawn");
  const from = b.inbox.length;
  a.send({ t: "walk", x: target.x, y: target.y });
  const reaches = (m: S2C): m is Tick =>
    m.t === "tick" && m.ents.some((e) => e.id === aId && !!e.steps?.some(([x, y]) => x === target.x && y === target.y));
  await b.next(reaches, 5000, from);
  const seen = b.inbox.slice(from).flatMap((e) => (e.msg.t === "tick" ? e.msg.ents.find((u) => u.id === aId)?.steps ?? [] : []));
  assert.equal(seen.length, 3, `B saw A take 3 steps: ${JSON.stringify(seen)}`);
  assert.deepEqual(seen.at(-1), [target.x, target.y]);

  const tickCount = () => b.inbox.filter((e) => e.msg.t === "tick").length;
  await b.next((m): m is Tick => m.t === "tick" && tickCount() >= 8, 8000);
  const ticks = b.inbox.filter((e) => e.msg.t === "tick").map((e) => e.at);
  const gaps = ticks.slice(1).map((t, i) => t - ticks[i]!);
  assert.ok(gaps.length >= 7, `enough ticks to measure: ${gaps.length}`);
  for (const g of gaps) assert.ok(g > TICK_MS * 0.8 && g < TICK_MS * 1.25, `tick gap ${g.toFixed(0)} ms outside 480–750`);
  a.close();
  b.close();
});

test("junk is ignored, bad and duplicate names are refused", async () => {
  const c = new Client(), d = new Client();
  await Promise.all([c.opened(), d.opened()]);
  c.send("not json");
  c.send({ t: "walk", x: -5, y: 3 });
  c.send({ t: "hello", name: "<script>" });
  assert.match((await c.next(isDenied)).reason, /letters/);
  c.send({ t: "hello", name: "Gamma" });
  await c.next(isWelcome);
  d.send({ t: "hello", name: "gamma" });
  assert.match((await d.next(isDenied)).reason, /already playing/);
  const status = await (await fetch(`http://127.0.0.1:${port}/status`)).json() as { online: number };
  assert.ok(status.online >= 1);
  c.close();
  d.close();
});
