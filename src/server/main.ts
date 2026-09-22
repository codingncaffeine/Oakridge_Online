import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { WebSocket, WebSocketServer } from "ws";
import { TICK_MS, WS_PATH } from "../shared/constants.ts";
import { CLOSE_RESTART, cleanName, parseC2S, type C2S, type S2C } from "../shared/protocol.ts";
import { buildTestMap, TEST_MAP_SEED } from "../shared/testmap.ts";
import { World, type Player } from "./world.ts";

const PORT = Number(process.env.PORT ?? 3000);
/** Development only: serve the client from this folder. In production the web server serves it. */
const STATIC_DIR = process.env.OAKRIDGE_STATIC ? resolve(process.env.OAKRIDGE_STATIC) : null;
const HELLO_TIMEOUT_MS = 10_000;
const HEARTBEAT_MS = 20_000;
/** Per-connection message budget: bursts of up to 20, refilled by 10 every tick. */
const MSG_BURST = 20;
const MSG_REFILL = 10;

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".map": "application/json", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml",
  ".webp": "image/webp", ".ico": "image/x-icon", ".woff2": "font/woff2",
};

interface Client {
  player: Player | null;
  alive: boolean;
  budget: number;
}

const world = new World(buildTestMap(TEST_MAP_SEED));
const clients = new Map<WebSocket, Client>();
/** Changes every time the process starts; the deploy script uses it to see a restart settle. */
const BOOT_ID = Math.random().toString(36).slice(2, 10);

function log(...parts: unknown[]): void {
  console.error(new Date().toISOString(), ...parts);
}

function send(ws: WebSocket, msg: S2C): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

const server = createServer((req, res) => {
  handleHttp(req, res).catch((err: unknown) => {
    log("http error", err);
    if (!res.headersSent) res.writeHead(500);
    res.end();
  });
});

async function handleHttp(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname === "/status") {
    res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(JSON.stringify({ online: world.players.size, tick: world.tick, boot: BOOT_ID }));
    return;
  }
  if (!STATIC_DIR || req.method !== "GET") {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("Not found");
    return;
  }
  let path: string;
  try {
    path = decodeURIComponent(url.pathname);
  } catch {
    res.writeHead(400);
    res.end();
    return;
  }
  if (path.endsWith("/")) path += "index.html";
  const file = normalize(join(STATIC_DIR, path));
  if (!file.startsWith(STATIC_DIR + sep)) {
    res.writeHead(403);
    res.end();
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream", "cache-control": "no-cache" });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("Not found");
  }
}

const wss = new WebSocketServer({ server, path: WS_PATH, maxPayload: 4096 });

wss.on("connection", (ws) => {
  const client: Client = { player: null, alive: true, budget: MSG_BURST };
  clients.set(ws, client);
  const helloTimer = setTimeout(() => {
    if (!client.player) ws.close(4000, "hello expected");
  }, HELLO_TIMEOUT_MS);

  ws.on("pong", () => {
    client.alive = true;
  });
  ws.on("message", (data, isBinary) => {
    if (--client.budget < 0) {
      ws.close(4008, "too many messages");
      return;
    }
    if (isBinary) return;
    const msg = parseC2S(data.toString());
    if (!msg) return;
    if (client.player) {
      play(client.player, msg);
      return;
    }
    if (msg.t !== "hello") return;
    const name = cleanName(msg.name);
    if (!name) {
      send(ws, { t: "denied", reason: "Names are 1–12 letters, numbers, spaces, hyphens or underscores." });
      return;
    }
    const lower = name.toLowerCase();
    for (const p of world.players.values()) {
      if (p.name.toLowerCase() === lower) {
        send(ws, { t: "denied", reason: "Someone with that name is already playing." });
        return;
      }
    }
    clearTimeout(helloTimer);
    const player = world.add(name);
    client.player = player;
    send(ws, {
      t: "welcome", id: player.id, name: player.name, tick: world.tick, tickMs: TICK_MS,
      seed: TEST_MAP_SEED, x: player.x, y: player.y,
    });
    log("join", name, `online=${world.players.size}`);
  });
  ws.on("close", () => {
    clearTimeout(helloTimer);
    clients.delete(ws);
    if (client.player) {
      world.remove(client.player.id);
      log("leave", client.player.name, `online=${world.players.size}`);
    }
  });
  ws.on("error", (err) => log("socket error", err.message));
});

function play(player: Player, msg: C2S): void {
  if (msg.t === "walk") world.walk(player, msg.x, msg.y);
  else if (msg.t === "run") world.setRun(player, msg.on);
}

let nextTickAt = 0;

function tick(): void {
  try {
    world.step();
    const online = world.players.size;
    for (const [ws, client] of clients) {
      client.budget = Math.min(MSG_BURST, client.budget + MSG_REFILL);
      if (!client.player) continue;
      const view = world.viewFor(client.player);
      send(ws, view.gone.length
        ? { t: "tick", n: world.tick, online, ents: view.ents, gone: view.gone }
        : { t: "tick", n: world.tick, online, ents: view.ents });
    }
  } catch (err) {
    log("tick error", err);
  } finally {
    nextTickAt += TICK_MS;
    const now = Date.now();
    // After a long pause (a suspended process), skip the lost ticks rather than racing through them.
    if (nextTickAt < now - 5 * TICK_MS) nextTickAt = now + TICK_MS;
    setTimeout(tick, Math.max(0, nextTickAt - now));
  }
}

setInterval(() => {
  for (const [ws, client] of clients) {
    if (!client.alive) {
      ws.terminate();
      continue;
    }
    client.alive = false;
    ws.ping();
  }
}, HEARTBEAT_MS).unref();

function shutdown(signal: string): void {
  log("stopping on", signal);
  for (const ws of clients.keys()) ws.close(CLOSE_RESTART, "server restarting");
  server.close();
  setTimeout(() => process.exit(0), 300).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

server.listen(PORT, () => {
  log("world server started", `pid=${process.pid}`, `port=${PORT}`, STATIC_DIR ? `static=${STATIC_DIR}` : "");
  nextTickAt = Date.now() + TICK_MS;
  setTimeout(tick, TICK_MS);
});
