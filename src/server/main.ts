import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { WebSocket, WebSocketServer } from "ws";
import { TICK_MS, VIEW_DISTANCE, WS_PATH } from "../shared/constants.ts";
import { energyPercent, MAX_ENERGY } from "../shared/energy.ts";
import { stylesOf } from "../shared/combat.ts";
import { isValidLook, normalizeLook } from "../shared/look.ts";
import { readXp, type SkillKey } from "../shared/skills.ts";
import { nowFighting, NOTHING_COMES } from "../shared/messages.ts";
import { CLOSE_KICKED, CLOSE_RESTART, parseC2S, type C2S, type S2C } from "../shared/protocol.ts";
import { buildOakridge, OAKRIDGE_SEED } from "../shared/oakridge.ts";
import { buyPrice, sellPrice, SHOPS } from "../shared/shops.ts";
import { RECIPES } from "../shared/recipes.ts";
import { ITEM_BY_KEY } from "../shared/items.ts";
import { Accounts, RateLimiter, type PendingSignup } from "./auth.ts";
import { loadOrCreateKey, Secrets } from "./crypto.ts";
import { Store } from "./db.ts";
import { fileMailer, sendmailMailer, type Mailer } from "./mail.ts";
import { bonusesOf, readEquipment, readInventory, starterKit, type Equipment, type Inventory } from "./inventory.ts";
import { censor } from "./names.ts";
import { World, type Player } from "./world.ts";

const PORT = Number(process.env.PORT ?? 3000);
/** Development only: serve the client from this folder. In production the web server serves it. */
const STATIC_DIR = process.env.OAKRIDGE_STATIC ? resolve(process.env.OAKRIDGE_STATIC) : null;
/** Database, server key and backups live here, outside the web root. */
const DATA_DIR = resolve(process.env.OAKRIDGE_DATA ?? join(process.cwd(), "data"));
const IDLE_ANON_MS = 10 * 60 * 1000;
const HEARTBEAT_MS = 20_000;
const SAVE_MS = 60_000;
/** Per-connection message budget: bursts of up to 20, refilled by 10 every tick. */
const MSG_BURST = 20;
const MSG_REFILL = 10;

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".map": "application/json", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml",
  ".webp": "image/webp", ".ico": "image/x-icon", ".woff2": "font/woff2", ".mp3": "audio/mpeg",
};

function mailer(): Mailer {
  const setting = process.env.OAKRIDGE_MAIL ?? (existsSync("/usr/sbin/sendmail") ? "sendmail" : `file:${join(DATA_DIR, "outbox.jsonl")}`);
  return setting.startsWith("file:") ? fileMailer(resolve(setting.slice(5))) : sendmailMailer();
}

interface Client {
  ip: string;
  accountId: number | null;
  name: string | null;
  token: string | null;
  pending: PendingSignup | null;
  player: Player | null;
  alive: boolean;
  budget: number;
  /** An email is being sent for this connection; further auth messages wait for it. */
  busy: boolean;
  since: number;
  /** The run energy (percent), run state and hitpoints this client last heard about. */
  sentEnergy: number;
  sentRun: boolean;
  sentHp: number;
  sentMaxHp: number;
  /** Ids of objects the world put there after the map was built (fires) that this client has been told about. */
  sentObjects: Set<number>;
}

/** What a character's save holds (the characters table stores it as JSON). */
interface CharacterData {
  v: 1;
  look: number[];
  x: number;
  y: number;
  run: boolean;
  energy: number;
  inventory: Inventory;
  equipment: Equipment;
  /** XP per skill, in tenths (missing from saves made before skills existed). */
  xp: Record<SkillKey, number>;
  /** Hitpoints left, the chosen fighting style and whether hitting back is on (missing before combat). */
  hp?: number;
  style?: number;
  retaliate?: boolean;
}

function readCharacter(raw: unknown): CharacterData | null {
  if (typeof raw !== "object" || raw === null) return null;
  const c = raw as Partial<CharacterData>;
  if (c.v !== 1 || !isValidLook(c.look) || !Number.isInteger(c.x) || !Number.isInteger(c.y)) return null;
  const energy = Number.isInteger(c.energy) ? Math.min(MAX_ENERGY, Math.max(0, c.energy!)) : MAX_ENERGY;
  // Characters saved before items existed get the starter kit, once.
  const inventory = readInventory(c.inventory) ?? starterKit();
  return {
    v: 1, look: normalizeLook(c.look), x: c.x!, y: c.y!, run: c.run === true, energy, inventory, equipment: readEquipment(c.equipment),
    xp: readXp(c.xp),
    hp: Number.isInteger(c.hp) && c.hp! >= 1 ? c.hp : undefined,
    style: Number.isInteger(c.style) && c.style! >= 0 && c.style! < 8 ? c.style : 0,
    retaliate: c.retaliate !== false,
  };
}

/**
 * The world's random numbers. A test run can pin them with OAKRIDGE_TEST_RAND (a number from 0 up to 1;
 * 0 makes every roll succeed and every timer take its shortest time). Production never sets it.
 */
function worldRandom(): () => number {
  const raw = process.env.OAKRIDGE_TEST_RAND;
  const pinned = Number(raw);
  if (!raw || !(pinned >= 0 && pinned < 1)) return Math.random;
  log(`random numbers pinned to ${pinned} (test run)`);
  return () => pinned;
}

/** Moderators: account names listed one per line in data/admins.txt, re-read every minute. */
let admins = new Set<string>();
function loadAdmins(): void {
  try {
    admins = new Set(readFileSync(join(DATA_DIR, "admins.txt"), "utf8").split("\n").map((l) => l.trim().toLowerCase()).filter(Boolean));
  } catch {
    admins = new Set();
  }
}
loadAdmins();

const chatLimiter = new RateLimiter();

/** Every public chat line as sent, before the filter: what moderators review. */
function logChat(client: Client, text: string): void {
  try {
    appendFileSync(join(DATA_DIR, "chat.log"), `${JSON.stringify({ at: new Date().toISOString(), account: client.accountId, name: client.name, text })}\n`);
  } catch (err) {
    log("chat log failed", err);
  }
}

const store = new Store(join(DATA_DIR, "oakridge.db"));
const secrets = new Secrets(loadOrCreateKey(join(DATA_DIR, "server.key")));
const accounts = new Accounts(store, secrets, mailer());
const world = new World(buildOakridge(OAKRIDGE_SEED), worldRandom());
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
  const head = req.method === "HEAD";
  if (!STATIC_DIR || (req.method !== "GET" && !head)) {
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
    res.writeHead(200, {
      "content-type": MIME[extname(file)] ?? "application/octet-stream", "content-length": body.byteLength, "cache-control": "no-cache",
    });
    res.end(head ? undefined : body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("Not found");
  }
}

/** The client's address. The web server in front appends it to X-Forwarded-For, so the last entry is the one it saw. */
function clientIp(req: IncomingMessage): string {
  const forwarded = req.headers["x-forwarded-for"];
  const list = (Array.isArray(forwarded) ? forwarded.join(",") : forwarded ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return list.at(-1) ?? req.socket.remoteAddress ?? "unknown";
}

const wss = new WebSocketServer({ server, path: WS_PATH, maxPayload: 4096 });

wss.on("connection", (ws, req) => {
  const client: Client = {
    ip: clientIp(req), accountId: null, name: null, token: null, pending: null, player: null,
    alive: true, budget: MSG_BURST, busy: false, since: Date.now(), sentEnergy: -1, sentRun: false, sentHp: -1, sentMaxHp: -1,
    sentObjects: new Set(),
  };
  clients.set(ws, client);
  ws.on("pong", () => { client.alive = true; });
  ws.on("message", (data, isBinary) => {
    if (--client.budget < 0) {
      ws.close(4008, "too many messages");
      return;
    }
    if (isBinary) return;
    const msg = parseC2S(data.toString());
    if (!msg) return;
    handle(ws, client, msg).catch((err: unknown) => {
      log("message error", err);
      send(ws, { t: "auth_error", reason: "Something went wrong. Please try again." });
    });
  });
  ws.on("close", () => {
    clients.delete(ws);
    leaveWorld(client);
  });
  ws.on("error", (err) => log("socket error", err.message));
});

async function handle(ws: WebSocket, client: Client, msg: C2S): Promise<void> {
  // In the world: play messages.
  if (client.player) {
    const p = client.player;
    if (msg.t === "walk") world.walk(p, msg.x, msg.y);
    else if (msg.t === "run") world.setRun(p, msg.on && p.energy > 0);
    else if (msg.t === "chat") chat(ws, client, p, msg.text);
    else if (msg.t === "take") world.take(p, msg.uid);
    else if (msg.t === "drop") world.drop(p, msg.slot);
    else if (msg.t === "swap") world.swap(p, msg.from, msg.to);
    else if (msg.t === "equip") world.equip(p, msg.slot);
    else if (msg.t === "unequip") world.unequip(p, msg.where);
    else if (msg.t === "use") game(ws, world.eat(p, msg.slot));
    else if (msg.t === "use_item") world.useItems(p, msg.slot, msg.on);
    else if (msg.t === "object") world.interact(p, msg.id);
    else if (msg.t === "use_object") world.interact(p, msg.id, msg.slot);
    else if (msg.t === "spot") world.fish(p, msg.id);
    else if (msg.t === "attack") world.attack(p, msg.id);
    else if (msg.t === "talk") world.talk(p, msg.id);
    else if (msg.t === "say") world.answer(p, msg.option);
    else if (msg.t === "deposit") world.deposit(p, msg.slot, msg.count);
    else if (msg.t === "withdraw") world.withdraw(p, msg.slot, msg.count);
    else if (msg.t === "buy") world.buy(p, msg.slot, msg.count);
    else if (msg.t === "sell") world.sell(p, msg.slot, msg.count);
    else if (msg.t === "make") world.make(p, msg.index, msg.count);
    else if (msg.t === "close") world.closeScreen(p);
    else if (msg.t === "style") setStyle(ws, client, p, msg.index);
    else if (msg.t === "retaliate") {
      world.setRetaliate(p, msg.on);
      send(ws, { t: "combat", style: p.style, retaliate: p.retaliate });
      saveCharacters([client]);
    } else if (msg.t === "look") {
      world.setLook(p, msg.look);
      saveCharacters([client]);
    } else if (msg.t === "logout") logout(ws, client);
    return;
  }
  // Logged in, not yet in the world.
  if (client.accountId !== null) {
    if (msg.t === "enter") enter(ws, client, msg.look);
    else if (msg.t === "logout") logout(ws, client);
    return;
  }
  // Not logged in: sign-up, login and resuming a session. One email at a time per connection.
  if (client.busy) return;
  switch (msg.t) {
    case "signup": {
      if (msg.method === "totp") {
        const r = accounts.startTotpSignup(msg.name, client.ip);
        if (!r.ok) return send(ws, { t: "auth_error", reason: r.reason });
        client.pending = r.value.pending;
        return send(ws, { t: "signup_totp", secret: r.value.secret, uri: r.value.uri });
      }
      client.busy = true;
      try {
        const r = await accounts.startEmailSignup(msg.name, msg.email, client.ip);
        if (!r.ok) return send(ws, { t: "auth_error", reason: r.reason });
        client.pending = r.value.pending;
        return send(ws, { t: "signup_email", to: r.value.to });
      } finally {
        client.busy = false;
      }
    }
    case "signup_confirm": {
      if (!client.pending) return send(ws, { t: "auth_error", reason: "Start the sign-up again." });
      const method = client.pending.method;
      const r = accounts.finishSignup(client.pending, msg.code);
      if (!r.ok) return send(ws, { t: "auth_error", reason: r.reason });
      const token = accounts.newSession(r.value.accountId);
      signIn(client, r.value.accountId, r.value.name, token);
      log("signup", r.value.name, method, `ip=${client.ip}`);
      return send(ws, { t: "signup_done", name: r.value.name, token, backupCodes: r.value.backupCodes });
    }
    case "login_email": {
      client.busy = true;
      try {
        const r = await accounts.sendLoginCode(msg.name, client.ip);
        return send(ws, r.ok ? { t: "email_sent", to: r.value.to } : { t: "auth_error", reason: r.reason });
      } finally {
        client.busy = false;
      }
    }
    case "login": {
      const r = accounts.login(msg.name, msg.code, client.ip);
      if (!r.ok) return send(ws, { t: "auth_error", reason: r.reason });
      const token = accounts.newSession(r.value.accountId);
      signIn(client, r.value.accountId, r.value.name, token);
      log("login", r.value.name, r.value.usedBackup ? "backup-code" : "", `ip=${client.ip}`);
      return send(ws, { t: "authed", name: r.value.name, token, hasCharacter: hasCharacter(r.value.accountId), backupLeft: r.value.backupLeft });
    }
    case "resume": {
      const r = accounts.resume(msg.token);
      if (!r.ok) return send(ws, { t: "auth_error", reason: r.reason });
      signIn(client, r.value.accountId, r.value.name, msg.token);
      return send(ws, { t: "authed", name: r.value.name, token: msg.token, hasCharacter: hasCharacter(r.value.accountId), backupLeft: -1 });
    }
    default:
      return;
  }
}

const game = (ws: WebSocket, text: string) => send(ws, { t: "game", text });

/** Choosing a fighting style: the index is kept inside what the held weapon offers, and named back. */
function setStyle(ws: WebSocket, client: Client, p: Player, index: number): void {
  const styles = stylesOf(world.weaponClassOf(p));
  world.setStyle(p, Math.min(index, styles.length - 1));
  send(ws, { t: "combat", style: p.style, retaliate: p.retaliate });
  game(ws, nowFighting(styles[p.style]!.name));
  saveCharacters([client]);
}

/** Public chat: filtered, rate limited, heard by everyone within view. "::" lines are moderator commands. */
function chat(ws: WebSocket, client: Client, p: Player, text: string): void {
  if (text.startsWith("::")) {
    command(ws, client, text.slice(2));
    return;
  }
  const account = store.accountById(client.accountId!);
  const now = Date.now();
  if (account && account.muted_until > now) {
    game(ws, `You're muted for another ${Math.ceil((account.muted_until - now) / 60000)} minute(s).`);
    return;
  }
  if (!chatLimiter.allow(`chat:${client.accountId}`, 4, 3000, now)) {
    game(ws, "You're talking too fast. Wait a moment.");
    return;
  }
  logChat(client, text);
  const line: S2C = { t: "chat", id: p.id, name: p.name, text: censor(text) };
  for (const [otherWs, other] of clients) {
    const q = other.player;
    if (q && Math.max(Math.abs(q.x - p.x), Math.abs(q.y - p.y)) <= VIEW_DISTANCE) send(otherWs, line);
  }
}

function clientByName(name: string): [WebSocket, Client] | undefined {
  const key = name.trim().toLowerCase();
  for (const entry of clients) if (entry[1].name?.toLowerCase() === key) return entry;
  return undefined;
}

function removeClient(ws: WebSocket, client: Client, reason: string): void {
  leaveWorld(client);
  send(ws, { t: "kicked", reason });
  client.accountId = null;
  ws.close(CLOSE_KICKED, "removed");
}

/** Moderator commands: mute, unmute, kick, ban, unban, players. Anyone else is told it doesn't exist. */
function command(ws: WebSocket, client: Client, line: string): void {
  if (!client.name || !admins.has(client.name.toLowerCase())) return game(ws, "Unknown command.");
  const [verb = "", ...rest] = line.trim().split(/\s+/);
  const minutesArg = verb === "mute" && /^\d+$/.test(rest.at(-1) ?? "") && rest.length > 1 ? Number(rest.pop()) : 60;
  const target = rest.join(" ");
  if (verb === "players") {
    return game(ws, `${world.players.size} online: ${[...world.players.values()].map((q) => q.name).join(", ")}`);
  }
  const account = target ? store.accountByNameKey(target.toLowerCase()) : undefined;
  if (!account) return game(ws, target ? `No account called ${target}.` : "Usage: ::mute name [minutes], ::unmute, ::kick, ::ban, ::unban, ::players");
  const online = clientByName(account.name);
  switch (verb) {
    case "mute":
      store.setMutedUntil(account.id, Date.now() + minutesArg * 60000);
      if (online) game(online[0], `You've been muted for ${minutesArg} minute(s).`);
      return game(ws, `Muted ${account.name} for ${minutesArg} minute(s).`);
    case "unmute":
      store.setMutedUntil(account.id, 0);
      return game(ws, `Unmuted ${account.name}.`);
    case "kick":
      if (online) removeClient(online[0], online[1], "You were removed from the game by a moderator.");
      return game(ws, online ? `Kicked ${account.name}.` : `${account.name} isn't online.`);
    case "ban":
      store.setBanned(account.id, true);
      if (online) removeClient(online[0], online[1], "This account has been banned.");
      log("ban", account.name, `by=${client.name}`);
      return game(ws, `Banned ${account.name}.`);
    case "unban":
      store.setBanned(account.id, false);
      log("unban", account.name, `by=${client.name}`);
      return game(ws, `Unbanned ${account.name}.`);
    default:
      return game(ws, "Unknown command.");
  }
}

function hasCharacter(accountId: number): boolean {
  return readCharacter(store.loadCharacter(accountId)) !== null;
}

/** One session per account: signing in ends any other connection on the same account. */
function signIn(client: Client, accountId: number, name: string, token: string): void {
  for (const [ws, other] of clients) {
    if (other !== client && other.accountId === accountId) {
      leaveWorld(other);
      send(ws, { t: "kicked", reason: "Your account logged in somewhere else." });
      other.accountId = null;
      ws.close(CLOSE_KICKED, "logged in elsewhere");
    }
  }
  client.accountId = accountId;
  client.name = name;
  client.token = token;
  client.pending = null;
}

function enter(ws: WebSocket, client: Client, look: number[] | undefined): void {
  const saved = readCharacter(store.loadCharacter(client.accountId!));
  const chosen = look ?? saved?.look;
  if (!chosen) return send(ws, { t: "auth_error", reason: "Design your character first." });
  const player = world.add(client.name!, chosen, {
    at: saved ?? undefined, run: saved?.run, energy: saved?.energy ?? MAX_ENERGY, inventory: saved?.inventory ?? starterKit(), equipment: saved?.equipment,
    xp: saved?.xp, hp: saved?.hp, style: saved?.style, retaliate: saved?.retaliate,
  });
  client.player = player;
  if (!saved || look) saveCharacters([client]);
  send(ws, {
    t: "welcome", id: player.id, name: player.name, tick: world.tick, tickMs: TICK_MS,
    seed: OAKRIDGE_SEED, x: player.x, y: player.y, plane: player.plane, look: player.look,
    energy: energyPercent(player.energy), run: player.run, hp: player.hp, maxHp: world.maxHpOf(player),
  });
  send(ws, { t: "world", ...world.worldView(player.plane), added: world.spawnedObjects.filter((o) => o.plane === player.plane) });
  client.sentObjects = new Set(world.spawnedObjects.filter((o) => o.plane === player.plane).map((o) => o.id));
  send(ws, { t: "skills", xp: player.xp });
  send(ws, { t: "combat", style: player.style, retaliate: player.retaliate });
  game(ws, "Welcome to Oakridge Online.");
  log("enter", player.name, `online=${world.players.size}`);
}

function leaveWorld(client: Client): void {
  if (!client.player) return;
  saveCharacters([client]);
  world.remove(client.player.id);
  log("leave", client.player.name, `online=${world.players.size}`);
  client.player = null;
}

function logout(ws: WebSocket, client: Client): void {
  leaveWorld(client);
  if (client.token) accounts.endSession(client.token);
  client.accountId = null;
  client.name = null;
  client.token = null;
  send(ws, { t: "logged_out" });
}

function saveCharacters(list: Iterable<Client>): void {
  const rows: Array<{ accountId: number; data: CharacterData }> = [];
  for (const c of list) {
    if (!c.player || c.accountId === null) continue;
    const p = c.player;
    rows.push({
      accountId: c.accountId,
      data: {
        v: 1, look: p.look, x: p.x, y: p.y, run: p.run, energy: p.energy, inventory: p.inventory, equipment: p.equipment, xp: p.xp,
        hp: p.hp, style: p.style, retaliate: p.retaliate,
      },
    });
  }
  try {
    store.saveCharacters(rows, Date.now());
  } catch (err) {
    log("save failed", err);
  }
}

/**
 * Whatever screen the player has open, with its contents worked out fresh. One message kind per screen;
 * a null payload is what closes it on the client.
 */
function sendScreen(ws: WebSocket, p: Player): void {
  const screen = p.screen;
  if (!screen) {
    // Which one was open is no longer known, so every screen is told to shut. They are cheap messages.
    send(ws, { t: "bank", items: null });
    send(ws, { t: "shop", name: null });
    send(ws, { t: "say", speaker: null });
    send(ws, { t: "make", title: null });
    return;
  }
  if (screen.kind === "bank") {
    send(ws, { t: "bank", items: p.bank });
    return;
  }
  if (screen.kind === "shop") {
    const shop = world.shopFor(p);
    if (!shop) return send(ws, { t: "shop", name: null });
    const items = shop.stock.map((line) => {
      const normal = SHOPS[shop.key]!.stock.find((l) => l.id === line.id)?.count ?? 0;
      return {
        id: line.id, count: line.count,
        buy: buyPrice(shop.def, line.id, line.count, normal),
        sell: sellPrice(shop.def, line.id, line.count, normal),
      };
    });
    send(ws, { t: "shop", name: shop.def.name, items });
    return;
  }
  if (screen.kind === "talk") {
    const box = world.dialogueFor(p);
    if (!box) return send(ws, { t: "say", speaker: null });
    send(ws, { t: "say", speaker: box.speaker, lines: box.lines, options: box.options, npc: box.npc });
    return;
  }
  const options = screen.recipes.map((i) => {
    const recipe = RECIPES[i]!;
    const made = ITEM_BY_KEY.get(recipe.item)!;
    const can = world.canMakeNow(p, recipe);
    return { id: made.id, each: recipe.each, can: can.left, ...(can.why ? { note: can.why } : {}) };
  });
  send(ws, { t: "make", title: screen.title, options });
}

let nextTickAt = 0;

function tick(): void {
  try {
    world.step();
    const online = world.players.size;
    for (const [ws, client] of clients) {
      client.budget = Math.min(MSG_BURST, client.budget + MSG_REFILL);
      if (!client.player) continue;
      const p = client.player;
      const view = world.viewFor(p);
      const msg: S2C = { t: "tick", n: world.tick, online, ents: view.ents };
      if (view.gone.length) msg.gone = view.gone;
      const energy = energyPercent(p.energy), maxHp = world.maxHpOf(p);
      if (energy !== client.sentEnergy || p.run !== client.sentRun || p.hp !== client.sentHp || maxHp !== client.sentMaxHp) {
        msg.you = { energy, run: p.run, hp: p.hp, maxHp };
        client.sentEnergy = energy;
        client.sentRun = p.run;
        client.sentHp = p.hp;
        client.sentMaxHp = maxHp;
      }
      if (view.itemsAdd.length || view.itemsGone.length) {
        msg.items = {};
        if (view.itemsAdd.length) msg.items.add = view.itemsAdd;
        if (view.itemsGone.length) msg.items.gone = view.itemsGone;
      }
      if (world.objectChanges.length) msg.objs = world.objectChanges;
      if (world.openChanges.length) msg.opens = world.openChanges;
      if (world.spotChanges.length) msg.spots = world.spotChanges;
      // Objects the world put there since this client last heard (a fire someone lit).
      const added = world.spawnedObjects.filter((o) => o.plane === p.plane && !client.sentObjects.has(o.id));
      if (added.length) {
        msg.added = added;
        for (const o of added) client.sentObjects.add(o.id);
      }
      if (world.goneObjects.length) {
        msg.removed = world.goneObjects;
        for (const id of world.goneObjects) client.sentObjects.delete(id);
      }
      // A stair or ladder moves the player to a whole other scene: say so first, then hand over the
      // world that plane has, because the client throws away everything it was holding.
      if (p.planeTick === world.tick) {
        send(ws, { t: "plane", plane: p.plane, x: p.x, y: p.y });
        const here = world.spawnedObjects.filter((o) => o.plane === p.plane);
        send(ws, { t: "world", ...world.worldView(p.plane), added: here });
        client.sentObjects = new Set(here.map((o) => o.id));
      }
      send(ws, msg);
      if (p.screenDirty) {
        sendScreen(ws, p);
        p.screenDirty = false;
      }
      if (p.invDirty) {
        send(ws, { t: "inventory", items: p.inventory });
        p.invDirty = false;
      }
      if (p.equipDirty) {
        send(ws, { t: "equipment", items: p.equipment, bonuses: bonusesOf(p.equipment), weight: p.weight });
        p.equipDirty = false;
      }
      for (const skill of p.xpChanged) send(ws, { t: "xp", skill, xp: p.xp[skill] });
      p.xpChanged.clear();
      for (const text of p.messages) game(ws, text);
      p.messages = [];
      for (const cue of p.sounds) send(ws, { t: "sound", cue });
      p.sounds = [];
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
  const now = Date.now();
  for (const [ws, client] of clients) {
    if (!client.alive || (client.accountId === null && now - client.since > IDLE_ANON_MS)) {
      ws.terminate();
      continue;
    }
    client.alive = false;
    ws.ping();
  }
}, HEARTBEAT_MS).unref();

setInterval(() => {
  saveCharacters(clients.values());
  for (const c of clients.values()) if (c.token && c.player) accounts.keepAlive(c.token);
  accounts.prune();
  chatLimiter.prune(Date.now(), 60_000);
  loadAdmins();
}, SAVE_MS).unref();

function backup(): void {
  try {
    const made = store.dailyBackup(new Date());
    if (made) log("backup", made);
  } catch (err) {
    log("backup failed", err);
  }
}
setInterval(backup, 60 * 60 * 1000).unref();

function shutdown(signal: string): void {
  log("stopping on", signal);
  saveCharacters(clients.values());
  for (const ws of clients.keys()) ws.close(CLOSE_RESTART, "server restarting");
  server.close();
  setTimeout(() => {
    store.close();
    process.exit(0);
  }, 300).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

server.listen(PORT, () => {
  log("world server started", `pid=${process.pid}`, `port=${PORT}`, `data=${DATA_DIR}`, STATIC_DIR ? `static=${STATIC_DIR}` : "");
  backup();
  nextTickAt = Date.now() + TICK_MS;
  setTimeout(tick, TICK_MS);
});
