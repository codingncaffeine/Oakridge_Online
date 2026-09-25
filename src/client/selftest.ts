// Scripted check for tools/browser-check.sh. Loaded with #selftest=<name>&beacon=<url>, the page joins,
// clicks a tile through the real input path, waits for the walk, samples the rendered pixels and
// posts a report line to the beacon.
import * as THREE from "three";
import { ITEM_BY_ID, item } from "../shared/items.ts";
import { builtRegions, heightAt, indoorsAt, type MapObject, type ObjectKind } from "../shared/map.ts";
import { noSuchPlayer, NOTHING_COMES } from "../shared/messages.ts";
import { TOOLS } from "../shared/gathering.ts";
import { MONSTER_BY_KEY } from "../shared/monsters.ts";
import { GREEN } from "../shared/oakridge.ts";
import { findPath, findPathTo, reaches } from "../shared/pathfind.ts";
import { PRAYERS } from "../shared/prayers.ts";
import { QUESTS } from "../shared/quests.ts";
import { SKILLS } from "../shared/skills.ts";
import { TRAVEL } from "../shared/travel.ts";
import { BATTLE_TRACK, MUSIC_TRACKS } from "./sounds/index.ts";
import type { C2S, S2C } from "../shared/protocol.ts";
import { BATTLE_HOLD_MS, type Game } from "./game.ts";
import { objectInfo } from "./info.ts";
import type { Designer } from "./ui/designer.ts";

/**
 * Reports a line to the collector, and to the console (which the check's Firefox prints to stdout).
 * A snapshot runs to hundreds of kilobytes; firing a run of them off without waiting loses some of
 * them silently, so the promise is here to be awaited wherever a loop sends several in a row.
 */
export function beacon(url: string, line: string): Promise<void> {
  console.log(`[selftest] ${line.startsWith("SHOT ") ? `${line.slice(0, 40)}…` : line}`);
  // Keepalive is for reports that must survive the page going away. A snapshot is awaited instead, and
  // keepalive requests share a small budget that a run of them can exhaust.
  const send = () => fetch(url, { method: "POST", body: line, mode: "no-cors", keepalive: !line.startsWith("SHOT ") });
  return send().then(() => undefined, () => send().then(() => undefined, (err: unknown) => {
    // A report that never arrives would read as a check that passed. Say so where the run can see it.
    console.log(`[selftest] BEACON FAILED ${line.slice(0, 60)} ${String(err)}`);
  }));
}

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** The authenticator code for a base32 secret, `offset` time steps from now (Web Crypto HMAC-SHA-1). */
async function totp(secret: string, offset = 0): Promise<string> {
  const bytes: number[] = [];
  let bits = 0, value = 0;
  for (const ch of secret.replace(/\s/g, "").toUpperCase()) {
    value = (value << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  const key = await crypto.subtle.importKey("raw", new Uint8Array(bytes), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const counter = new ArrayBuffer(8);
  new DataView(counter).setUint32(4, Math.floor(Date.now() / 30000) + offset);
  const h = new Uint8Array(await crypto.subtle.sign("HMAC", key, counter));
  const off = h[19]! & 15;
  const bin = ((h[off]! & 0x7f) << 24) | (h[off + 1]! << 16) | (h[off + 2]! << 8) | h[off + 3]!;
  return String(bin % 1_000_000).padStart(6, "0");
}

/**
 * Gets the self-test into the world the way a player would. With a secret it logs in to that account;
 * without one it signs up, confirms with a computed code, ticks "saved" on the backup codes and
 * confirms the creator. Returns the handler that watches server messages while this happens.
 */
export function selfTestAuth(
  name: string, secret: string | null, url: string, send: (m: C2S) => Promise<void>, setHandler: (h: ((m: S2C) => void) | null) => void,
  shots = false,
): (m: S2C) => void {
  let tries = 0;
  const click = (id: string, delay: number) => setTimeout(() => document.getElementById(id)?.click(), delay);
  if (secret) void totp(secret).then((code) => send({ t: "login", name, code }));
  else void send({ t: "signup", name, method: "totp" });
  return (msg) => {
    if (msg.t === "signup_totp") {
      // With snapshots on, keep the setup QR exactly as the page drew it (drawn just after this handler runs).
      if (shots) setTimeout(() => beacon(url, `SHOT qr ${(document.getElementById("qr") as HTMLImageElement).src}`), 0);
      if (shots) beacon(url, `TRACE qr-uri ${msg.uri}`);
      void totp(msg.secret).then((code) => send({ t: "signup_confirm", code }));
    } else if (msg.t === "signup_done") {
      setTimeout(() => {
        const box = document.getElementById("backup-saved") as HTMLInputElement;
        box.checked = true;
        box.dispatchEvent(new Event("change"));
        click("backup-continue", 50);
        click("designer-confirm", 500);
      }, 100);
    } else if (msg.t === "authed" && !msg.hasCharacter) {
      click("designer-confirm", 500);
    } else if (msg.t === "auth_error") {
      beacon(url, `TRACE auth_error ${msg.reason}`);
      // A code already used this step (a quick re-run): the next step's code is still accepted.
      if (secret && /already used/.test(msg.reason) && tries++ < 1) void totp(secret, 1).then((code) => send({ t: "login", name, code }));
    } else if (msg.t === "welcome") {
      setHandler(null);
    }
  };
}

/** Opens the character creator on `look`, snapshots its preview, then confirms it closed. */
export async function snapshotCreator(designer: Designer, url: string, look: number[]): Promise<void> {
  void designer.open(look);
  await new Promise((r) => setTimeout(r, 600));
  beacon(url, `SHOT creator ${designer.snapshot()}`);
  document.getElementById("designer-confirm")?.click();
}

/** Interface parts showing before login (ids or classes); filled in by checkHiddenBeforeLogin. */
let shownBeforeLogin: string[] | null = null;

/** Run at page load, before logging in: no part of the game interface may be showing yet. */
export function checkHiddenBeforeLogin(): void {
  shownBeforeLogin = [...document.querySelectorAll<HTMLElement>(".hud")]
    .filter((el) => getComputedStyle(el).display !== "none")
    .map((el) => el.id || el.className);
}

export function installErrorBeacon(url: string): void {
  window.addEventListener("error", (e) => beacon(url, `ERROR ${e.message} @ ${e.filename}:${e.lineno}`));
  window.addEventListener("unhandledrejection", (e) => beacon(url, `REJECTION ${String(e.reason)}`));
}

const until = async (ok: () => boolean, ms: number) => {
  const end = performance.now() + ms;
  while (!ok() && performance.now() < end) await new Promise((r) => setTimeout(r, 50));
  return ok();
};

/** The page's icons (the tab icon, then the Android and iPhone home-screen ones) each load as an image. */
async function iconsLoad(): Promise<true | string> {
  const links = [...document.querySelectorAll<HTMLLinkElement>('link[rel="icon"], link[rel="apple-touch-icon"]')];
  const bad: string[] = [];
  for (const link of links) {
    const r = await fetch(link.href, { cache: "no-store" }).catch(() => null);
    if (!r?.ok || !(r.headers.get("content-type") ?? "").startsWith("image/")) bad.push(`${link.getAttribute("href")} (${r?.status ?? "failed"})`);
  }
  if (links.length !== 3) bad.push(`${links.length} icon links`);
  return bad.length === 0 || bad.join(", ");
}

/** How long a track is, read from its own header without playing a note of it. */
function trackLength(url: string): Promise<number> {
  return new Promise((resolve) => {
    const player = new Audio();
    player.preload = "metadata";
    player.addEventListener("loadedmetadata", () => resolve(player.duration));
    player.addEventListener("error", () => resolve(0));
    player.src = url;
  });
}

/** The pixels of a snapshot (a PNG data URL), decoded through a canvas. */
function decode(url: string): Promise<Uint8ClampedArray> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const g = canvas.getContext("2d")!;
      g.drawImage(img, 0, 0);
      resolve(g.getImageData(0, 0, canvas.width, canvas.height).data);
    };
    img.onerror = () => reject(new Error("a snapshot would not decode"));
    img.src = url;
  });
}

/** How many pixels two samples of a map picture disagree on; every pixel, when one of them is missing. */
function pixelsDiffering(a: Uint8ClampedArray | null, b: Uint8ClampedArray | null): number {
  if (!a || !b || a.length !== b.length) return Math.max(a?.length ?? 0, b?.length ?? 0) / 4;
  let n = 0;
  for (let i = 0; i < a.length; i += 4) {
    if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) n++;
  }
  return n;
}

/**
 * Walks to a tile and waits to arrive, asking again from wherever the last walk stopped. A walk is cut
 * short at its twenty-fifth turning point, as the classic's is, so crossing a wood takes several — which
 * is what a player does too, and why this is a loop rather than one click.
 */
async function walkTo(game: Game, x: number, y: number, within = 3): Promise<boolean> {
  const away = () => Math.hypot(game.local!.tileX - x, game.local!.tileY - y);
  for (let leg = 0; leg < 10 && away() > within; leg++) {
    const before = away();
    game.tell({ t: "walk", x, y });
    await until(() => away() <= within || (away() < before - 2 && !game.local!.moving), 20000);
    if (away() >= before) break;
  }
  return away() <= within;
}

/**
 * A test account keeps its position between runs, and a run ends wherever its last check was — the
 * live one ended at the innkeeper's counter once, behind the Split Oak's shut door, so the next run
 * found no tree in reach, nothing to fight, and no walk that got anywhere. If the player is indoors,
 * this opens the nearest shut door and steps out through it, and says so; outdoors it does nothing.
 */
async function letOut(game: Game): Promise<false | string> {
  const me = game.local!;
  if (indoorsAt(game.map, me.tileX, me.tileY) === 0) return false;
  const door = game.map.objects
    .filter((o) => o.kind === "door" && o.plane === game.plane)
    .map((o) => ({ o, d: Math.hypot(o.x - me.tileX, o.y - me.tileY) }))
    .sort((a, b) => a.d - b.d)[0];
  if (!door || door.d > 12) return `indoors at ${me.tileX},${me.tileY} with no door within reach`;
  const [dx, dy] = SIDE_STEP[door.o.side]!;
  if (game.map.collision.wallBetween(door.o.x, door.o.y, dx, dy)) {
    await walkTo(game, door.o.x, door.o.y, 4);
    game.tell({ t: "object", id: door.o.id });
    if (!await until(() => !game.map.collision.wallBetween(door.o.x, door.o.y, dx, dy), 20000)) return `the door at ${door.o.x},${door.o.y} would not open`;
  }
  const outside = { x: door.o.x + dx * 2, y: door.o.y + dy * 2 };
  const out = await walkTo(game, outside.x, outside.y, 1);
  return `${out ? "walked out" : "could not walk out"} through the door at ${door.o.x},${door.o.y}`;
}

/**
 * The nearest map object the camera can really see, with the screen point that hits it. An aim is only
 * accepted when `options()` at that point names the same object — which is the test the click itself
 * will apply, so a pass here means the click that follows lands where it was meant to.
 */
function visibleObject(
  game: Game,
  me: { tileX: number; tileY: number },
  want: (kind: ObjectKind) => boolean = () => true,
): { o: MapObject; at: { x: number; y: number } } | null {
  const near = game.map.objects
    .filter((o) => want(o.kind) && !game.depleted.has(o.id))
    .map((o) => ({ o, d: Math.hypot(o.x - me.tileX, o.y - me.tileY) }))
    .filter(({ d }) => d < 14)
    .sort((a, b) => a.d - b.d);
  for (const { o } of near.slice(0, 40)) {
    for (const lift of [0.9, 0.4, 1.6]) {
      const at = game.screenOf({ x: o.x, y: o.y }, lift);
      const r = game.renderer.domElement.getBoundingClientRect();
      if (at.x < r.left || at.x > r.right || at.y < r.top || at.y > r.bottom) continue;
      if (game.objectUnder(at.x, at.y)?.id === o.id) return { o, at };
    }
  }
  return null;
}

export async function runSelfTest(game: Game, url: string, shots = false): Promise<void> {
  const report: Record<string, unknown> = {};
  report.hiddenBeforeLogin = shownBeforeLogin === null ? "not checked" : shownBeforeLogin.length === 0 || shownBeforeLogin;
  report.icons = await iconsLoad();
  try {
    report.joined = await until(() => game.local !== undefined && game.frames > 20, 15000);
    const me = game.local;
    if (!me) throw new Error("local player never appeared");
    // What the client built: how many regions the world has, and which planes (Phase 12 grows both).
    report.world = `${builtRegions(game.map).length} regions, planes ${[...game.stack.planes.keys()].sort((a, b) => a - b).join("/")}`;
    // Out of whatever building the last run left the account in, before anything is measured.
    report.startedIndoors = await letOut(game);
    const start = { x: me.tileX, y: me.tileY };
    // Test accounts keep their position, so every walk heads toward the middle of the map: runs never
    // drift to an edge. Tiles are absolute world coordinates now, so the middle is the map's own.
    const midX = game.map.originX + game.map.width / 2;
    const toMiddle = start.x < midX ? 1 : -1;
    // A reachable tile 5 along whose walk is exactly 5 steps (straight, unobstructed). Either bearing
    // will do: the village has buildings on both sides of the green, so one side may be walled off.
    let target: { x: number; y: number } | null = null;
    for (const dir of [toMiddle, -toMiddle]) {
      for (const dy of [0, 1, -1, 2, -2]) {
        const t = { x: start.x + 5 * dir, y: start.y + dy };
        if (findPath(game.map.collision, start.x, start.y, t.x, t.y).length === 5) { target = t; break; }
      }
      if (target) break;
    }
    target ??= { x: start.x + 5 * toMiddle, y: start.y };
    const at = game.screenOf(target);
    const canvas = game.renderer.domElement;
    const picked = game.pick(at.x, at.y);
    report.pickedTarget = picked?.x === target.x && picked?.y === target.y;
    // Where it actually landed, so a miss says what was hit rather than only that something was.
    report.walkFrom = `${start.x},${start.y}`;
    report.walkTo = `${target.x},${target.y}`;
    if (report.pickedTarget !== true) report.pickedAt = picked ? `${picked.x},${picked.y}` : "nothing";
    canvas.dispatchEvent(new PointerEvent("pointerdown", { clientX: at.x, clientY: at.y, button: 0, bubbles: true }));
    const clickTick = game.lastTick, t0 = performance.now(), f0 = game.frames;
    report.arrived = await until(() => me.tileX === target.x && me.tileY === target.y, 10000);
    report.walkTicks = game.lastTick - clickTick;
    report.visualArrived = await until(() => Math.hypot(me.fx - target.x - 0.5, me.fy - target.y - 0.5) < 0.01, 3000);
    report.fps = Math.round(((game.frames - f0) * 1000) / (performance.now() - t0));

    const gl = game.renderer.getContext();
    game.renderer.render(game.scene, game.view.camera);
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, px = new Uint8Array(4);
    let dark = 0, total = 0, sum = [0, 0, 0];
    const colors = new Set<number>();
    for (let sy = 0; sy < 24; sy++) {
      for (let sx = 0; sx < 32; sx++) {
        gl.readPixels(Math.floor(((sx + 0.5) / 32) * w), Math.floor(((sy + 0.5) / 24) * h), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        total++;
        if (px[0]! + px[1]! + px[2]! < 24) { dark++; continue; }
        sum = [sum[0]! + px[0]!, sum[1]! + px[1]!, sum[2]! + px[2]!];
        colors.add(((px[0]! >> 4) << 8) | ((px[1]! >> 4) << 4) | (px[2]! >> 4));
      }
    }
    const lit = total - dark;
    report.pixels = {
      darkShare: +(dark / total).toFixed(2),
      litAverage: lit ? sum.map((v) => Math.round(v / lit)) : null,
      distinctColors: colors.size,
    };
    const info = game.renderer.info.render;
    report.draw = { calls: info.calls, triangles: info.triangles };
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    report.gpu = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    report.entities = game.entities.size;

    // The sky (PLAN Phase 16): it keeps the world's clock, and it changes with it. The same view drawn
    // at a forced noon and a forced midnight must differ; drawn at noon twice, it must not (the control).
    {
      const sky = game.sky;
      report.sky = { hour: +(sky.phase * 24).toFixed(1), weather: sky.weather.kind, clockOffsetMs: Math.round(sky.now() - Date.now()) };
      const orbit = { target: me.model.root.position.clone().setY(me.model.root.position.y + 1), yaw: 0.4, pitch: 0.3, distance: 12 };
      const drawAt = (phase: number) => {
        sky.forcedPhase = phase;
        sky.forcedWeather = { cover: 0, rain: 0, mist: 0, storm: 0 };
        sky.forcedFlash = 0;
        game.drawSkyNow();
        return game.snapshot(orbit);
      };
      const noon = drawAt(0.5), night = drawAt(0), again = drawAt(0.5);
      const fogByDay = (game.scene.fog as THREE.Fog).color.getHexString();
      drawAt(0);
      const fogByNight = (game.scene.fog as THREE.Fog).color.getHexString();
      sky.forcedPhase = null;
      sky.forcedWeather = null;
      sky.forcedFlash = null;
      game.drawSkyNow();
      const [atNoon, atNight, atNoonAgain] = await Promise.all([decode(noon), decode(night), decode(again)]);
      const changed = pixelsDiffering(atNoon, atNight), same = pixelsDiffering(atNoon, atNoonAgain);
      report.skyChanges = changed > (atNoon.length / 4) * 0.3 ? true : `only ${changed} px differ between noon and midnight`;
      report.skySteady = same === 0 ? true : `${same} px differ between noon and noon`;
      report.skyFog = fogByDay !== fogByNight ? `${fogByDay} by day, ${fogByNight} by night` : `the fog is ${fogByDay} day and night`;
    }

    // Ground cover and fire (PLAN Phase 15): grass stands over the regions up, and every fire in them burns.
    report.ground = { tufts: game.grassCount, flames: game.flameCount, regions: game.regionsUp };
    report.grassGrows = game.grassCount > 300 ? true : `only ${game.grassCount} tufts over ${game.regionsUp} regions`;
    report.firesBurn = game.flameCount > 0 ? true : "no flame on any fire, forge or range in the regions up";

    // The quest journal (PLAN Phase 9): its tab lists every quest, coloured, with the points at the top.
    {
      const tab = document.querySelector<HTMLButtonElement>('.side-tab[data-tab="quests"]');
      tab?.click();
      const listed = document.querySelectorAll("#quest-list .quest");
      const points = document.getElementById("quest-points")?.textContent ?? "";
      report.questsTab = tab && listed.length === QUESTS.length && /Quest points: \d+ of \d+/.test(points)
        ? `${listed.length} quests, ${[...listed].map((q) => q.className.replace("quest ", "")).join("/")}; ${points}`
        : `tab ${tab ? "found" : "missing"}, ${listed.length} of ${QUESTS.length} quests listed, points "${points}"`;
      listed[0] && (listed[0] as HTMLButtonElement).click();
      report.questJournal = !document.getElementById("quest-journal")?.hidden && (document.getElementById("quest-journal")?.textContent?.length ?? 0) > 40;
      document.querySelector<HTMLButtonElement>('.side-tab[data-tab="inventory"]')?.click();
    }

    // Prayer (PLAN Phase 11): the tab lists every prayer with the points over them, the orb reads as a
    // number out of a maximum, and a first-level prayer switched on stays on once the server has had its
    // say — a refused one would snap back within a tick — and goes out again when asked.
    {
      const tab = document.querySelector<HTMLButtonElement>('.side-tab[data-tab="prayers"]');
      tab?.click();
      const listed = document.querySelectorAll<HTMLButtonElement>("#prayer-grid .prayer-toggle");
      const points = document.getElementById("prayer-points")?.textContent ?? "";
      report.prayerTab = tab && listed.length === PRAYERS.length && /Prayer points: \d+ of \d+/.test(points)
        ? `${listed.length} prayers; ${points}`
        : `tab ${tab ? "found" : "missing"}, ${listed.length} of ${PRAYERS.length} prayers listed, points "${points}"`;
      report.prayerOrb = /^\d+$/.test(document.querySelector("#orb-prayer .orb-value")?.textContent ?? "")
        && /^Prayer points: \d+ of \d+$/.test(document.getElementById("orb-prayer")?.getAttribute("title") ?? "");
      const first = listed[0];
      const pressed = () => first?.getAttribute("aria-pressed") === "true";
      first?.click();
      await new Promise((r) => setTimeout(r, 1500));
      const stayedOn = pressed();
      first?.click();
      const wentOut = await until(() => !pressed(), 3000);
      report.prayerToggles = stayedOn && wentOut ? true : `on after a tick: ${stayedOn}, off again: ${wentOut}`;
      report.skillsListed = document.querySelectorAll("#skills-grid .skill").length === SKILLS.length ? true
        : `${document.querySelectorAll("#skills-grid .skill").length} of ${SKILLS.length}`;
      document.querySelector<HTMLButtonElement>('.side-tab[data-tab="inventory"]')?.click();
    }

    // The friends tab (PLAN Phase 10): its lists and its line, and a name that is nobody's is refused with a word.
    {
      const tab = document.querySelector<HTMLButtonElement>('.side-tab[data-tab="friends"]');
      tab?.click();
      const list = document.getElementById("friends-list"), input = document.getElementById("friends-add") as HTMLInputElement | null;
      report.friendsTab = tab && list && input ? true : "the friends tab, its list or its line is missing";
      if (input) {
        input.value = "Nobody Here";
        (document.getElementById("friends-add-button") as HTMLButtonElement).click();
        report.friendAddRefused = await until(() => [...document.querySelectorAll("#chat-lines .game")].some((el) => el.textContent === noSuchPlayer("Nobody Here")), 3000);
      }
      document.querySelector<HTMLButtonElement>('.side-tab[data-tab="inventory"]')?.click();
    }

    // Chat: typed into the chat line, back from the server into the chatbox and over the head.
    const input = document.getElementById("chat-input") as HTMLInputElement;
    const said = "hello from the self-test";
    input.value = said;
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    report.chat = await until(() => [...document.querySelectorAll("#chat-lines .said")].some((el) => el.textContent === said)
      && [...document.querySelectorAll(".overhead")].some((el) => el.textContent === said), 3000);

    // Right-click the nearest object the camera can actually see: the menu offers Examine, and Examine
    // prints that object's own text. Aiming at a tile is not enough in a village — a wall, a tree or a
    // roof can stand between the camera and whatever was aimed at — so the aim is checked before it is
    // used, and the report says what it settled on.
    const aimed = visibleObject(game, me);
    report.examineTarget = aimed ? `${aimed.o.kind} at ${aimed.o.x},${aimed.o.y}` : "nothing in sight";
    if (aimed) {
      canvas.dispatchEvent(new MouseEvent("contextmenu", { clientX: aimed.at.x, clientY: aimed.at.y, bubbles: true, cancelable: true }));
      const options = [...document.querySelectorAll<HTMLButtonElement>("#context-menu button")];
      report.menu = options.map((b) => b.textContent);
      options.find((b) => b.textContent?.startsWith("Examine"))?.click();
      const want = objectInfo(aimed.o.kind, false, aimed.o.tag).examine;
      report.examine = await until(() => [...document.querySelectorAll("#chat-lines .game")].some((el) => el.textContent === want), 1500);
    } else {
      report.examine = "nothing in sight to examine";
    }

    // Minimap: a click beside the centre walks there.
    const mini = document.getElementById("minimap") as HTMLCanvasElement, box = mini.getBoundingClientRect();
    const before = { x: me.tileX, y: me.tileY };
    // The camera still faces north here, so the minimap's right is east.
    mini.dispatchEvent(new PointerEvent("pointerdown", { clientX: box.left + box.width / 2 + 16 * toMiddle, clientY: box.top + box.height / 2, bubbles: true }));
    report.minimapWalk = await until(() => me.tileX !== before.x || me.tileY !== before.y, 4000);

    await itemChecks(game, report, shots ? url : null);
    await gatherChecks(game, report, shots ? url : null);
    await combatChecks(game, report, shots ? url : null);
    // Last, because it walks the player into the village and leaves them there.
    await villageChecks(game, report);
    // Sound is built muted for the self-test: these counts are the only proof it ran.
    report.sound = { loaded: game.sound.stats.loaded, failed: game.sound.stats.failed, played: { ...game.sound.stats.played } };
    // Sounds at once are capped, and they retire on the clock: after a pause the next one plays again.
    const plays = () => game.sound.stats.played.take ?? 0;
    const beforeBurst = plays();
    for (let i = 0; i < 20; i++) game.sound.effect("take");
    const capped = plays() - beforeBurst;
    await new Promise((r) => setTimeout(r, 1200));
    const afterPause = plays();
    game.sound.effect("take");
    report.soundVoices = { capped, recovers: plays() > afterPause };
    // Music: every track is served as audio the browser can read, and none of it ever plays in a check.
    const missing: string[] = [], lengths: number[] = [];
    for (const track of MUSIC_TRACKS) {
      const r = await fetch(track, { method: "HEAD" }).catch(() => null);
      if (!r?.ok || !(r.headers.get("content-type") ?? "").startsWith("audio/")) missing.push(`${track} (${r?.status ?? "failed"})`);
      else lengths.push(Math.round(await trackLength(track)));
    }
    report.music = {
      tracks: MUSIC_TRACKS.length, reachable: missing.length === 0 || missing, seconds: lengths,
      started: game.sound.music.stats.started,
      // Walking from one part of the district into another changes what is playing (PLAN Phase 13).
      areaChanges: game.sound.music.stats.areas,
      area: game.areaName,
      // The fight's music is served too, as audio, and has a length: it is looped, so it must be one.
      battleTrack: await (async () => {
        const r = await fetch(BATTLE_TRACK, { method: "HEAD" }).catch(() => null);
        if (!r?.ok || !(r.headers.get("content-type") ?? "").startsWith("audio/")) return `${BATTLE_TRACK} (${r?.status ?? "failed"})`;
        return Math.round(await trackLength(BATTLE_TRACK)) > 0 || "no length";
      })(),
    };

    if (shots) {
      beacon(url, `SHOT scene ${game.snapshot(null)}`);
      // The radar as the player sees it: drawn from the same pictures as the world map.
      beacon(url, `SHOT radar ${(document.getElementById("minimap") as HTMLCanvasElement).toDataURL("image/png")}`);
      const p = me.model.root.position;
      beacon(url, `SHOT character ${game.snapshot({ target: new THREE.Vector3(p.x, p.y + 0.85, p.z), yaw: -me.heading + 0.5, pitch: 0.22, distance: 3.2 })}`);
      const look = (name: string, tx: number, ty: number, lift: number, yaw: number, pitch: number, distance: number) =>
        beacon(url, `SHOT ${name} ${game.snapshot({ target: new THREE.Vector3(tx, heightAt(game.map, tx, ty) + lift, -ty), yaw, pitch, distance })}`);
      // Oakridge itself, from above the green looking over the bank and the shops, and from low down
      // in one of its lanes — the two views that show whether the village reads as a village.
      look("village", GREEN.x + 0.5, GREEN.y + 8, 3, 0, 0.62, 40);
      look("green", GREEN.x + 0.5, GREEN.y + 0.5, 1.2, 0.4, 0.26, 14);
      look("bank", 3230.5, 3241.5, 1.2, 0, 0.3, 14);
      look("smithy", 3242.5, 3224.5, 1.2, 2.3, 0.3, 13);
      look("inn", 3218.5, 3224.5, 1.2, 1.1, 0.28, 14);
      look("wood", 3200.5, 3240.5, 1.4, -1.2, 0.42, 12);
      // Level-up fireworks, caught part way through their burst.
      game.effects.levelUp(me.model.root);
      await new Promise((r) => setTimeout(r, 450));
      beacon(url, `SHOT levelup ${game.snapshot({ target: new THREE.Vector3(p.x, p.y + 1.1, p.z), yaw: -me.heading + 0.4, pitch: 0.25, distance: 4.2 })}`);
      look("quarry", 3294.5, 3296.5, 0.3, -0.5, 0.5, 20);
      look("barrow", 3171.5, 3169.5, 1, 0.3, 0.38, 24);
      const water = game.spots.list[0];
      if (water) look("water", water.x + 0.5, water.y + 0.5, 0, 0.6, 0.95, 4.5);
    }
  } catch (err) {
    report.failure = String(err);
  }
  beacon(url, `RESULT ${JSON.stringify(report)}`);
  beacon(url, "DONE");
}

/** A left click on an interface element, as pointer events at its centre (the press helper acts on release). */
function clickEl(el: Element, button = 0): void {
  const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
  const opts = { clientX: x, clientY: y, button, pointerId: 7, pointerType: "mouse", bubbles: true, cancelable: true };
  el.dispatchEvent(new PointerEvent("pointerdown", opts));
  el.dispatchEvent(new PointerEvent("pointerup", opts));
}

function rightClickEl(el: Element): string[] {
  const r = el.getBoundingClientRect();
  el.dispatchEvent(new MouseEvent("contextmenu", { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true, cancelable: true }));
  return [...document.querySelectorAll<HTMLButtonElement>("#context-menu button")].map((b) => b.textContent ?? "");
}

const menuItem = (text: string) => [...document.querySelectorAll<HTMLButtonElement>("#context-menu button")].find((b) => b.textContent === text);
const slotLabelled = (name: string) => document.querySelector<HTMLButtonElement>(`#inventory .inv-slot[aria-label="${name}"]`);
const chatSays = (text: string) => [...document.querySelectorAll("#chat-lines .game")].some((el) => el.textContent === text);

/**
 * The inventory and equipment through the real interface: wield the axe with a click and see it in hand,
 * take it off from the equipment tab, drop the bread with the menu and take it back off the ground,
 * drag two slots past each other and back, use one item on another, and examine one. Each step undoes
 * itself, so a saved test account keeps what it had.
 */
async function itemChecks(game: Game, report: Record<string, unknown>, shotsUrl: string | null): Promise<void> {
  const me = game.local!;
  // Stand still first (the minimap check may still be walking), so a drop lands where the character stands.
  const still = () => Math.hypot(me.fx - me.tileX - 0.5, me.fy - me.tileY - 0.5) < 0.01;
  await until(still, 6000);
  await new Promise((r) => setTimeout(r, 700));
  await until(still, 3000);
  // A saved account carries whatever the last run left it, so the count is not fixed: one that ended
  // its last run with the axe wielded comes back with seven things, and counting to eight then reports
  // a fault that is not one. What has to be true is that every slot holding something draws its icon.
  const filled = () => [...document.querySelectorAll<HTMLElement>("#inventory .inv-slot[aria-label]")]
    .filter((el) => (el.getAttribute("aria-label") ?? "Empty slot") !== "Empty slot");
  const showed = await until(() => filled().length > 0, 5000);
  const holds = filled(), drawn = holds.filter((el) => el.querySelector("img:not([hidden])")).length;
  report.inventory = !showed ? "the pack never showed anything"
    : drawn === holds.length ? `${drawn} items, every one drawn`
      : `${holds.length} items but only ${drawn} drawn`;
  const axe = item("bronze_axe").id, bread = item("bread").id;

  /**
   * Wield the axe: a left click on it. The equipment tab lists it, and the character holds it.
   *
   * A saved account carries whatever the last run left it holding, so on a live site the axe may
   * simply not be there. That used to throw, which took every later check down with it — gathering,
   * combat, sound and music all went unrun over one missing item. It says what the pack holds instead
   * and lets the rest of the run go on.
   */
  const axeSlot = slotLabelled("Bronze axe");
  if (!axeSlot) {
    const holding = [...document.querySelectorAll<HTMLElement>("#inventory .inv-slot[aria-label]")]
      .map((el) => el.getAttribute("aria-label")).filter((name) => name && name !== "Empty slot");
    report.wield = `no Bronze axe to wield; the pack holds ${holding.join(", ") || "nothing"}`;
  } else {
    clickEl(axeSlot);
    report.wield = await until(() => document.querySelector('.eq-slot[data-slot="weapon"]')?.getAttribute("aria-label") === "Weapon: Bronze axe" && !slotLabelled("Bronze axe"), 4000);
    report.gearShown = await until(() => me.gear.includes(axe), 3000);
    if (shotsUrl) {
      const p = me.model.root.position;
      beacon(shotsUrl, `SHOT wielded ${game.snapshot({ target: new THREE.Vector3(p.x, p.y + 0.85, p.z), yaw: -me.heading - 0.6, pitch: 0.2, distance: 3 })}`);
    }

    // Take it off again from the equipment tab.
    (document.querySelector('.side-tab[data-tab="equipment"]') as HTMLButtonElement).click();
    if (shotsUrl) await new Promise((r) => setTimeout(r, 100));
    clickEl(document.querySelector('.eq-slot[data-slot="weapon"]')!);
    report.remove = await until(() => slotLabelled("Bronze axe") !== null, 4000);
    (document.querySelector('.side-tab[data-tab="inventory"]') as HTMLButtonElement).click();
  }

  /**
   * Drop something, then pick it back up. Whatever is in the first filled slot will do: a run that
   * failed part way through leaves its loaf on the ground, and an account that must hold bread then
   * fails every run after the first for a reason that has nothing to do with the thing being tested.
   */
  const anySlot = [...document.querySelectorAll<HTMLElement>("#inventory .inv-slot[aria-label]")]
    .find((el) => !/^\d/.test(el.getAttribute("aria-label") ?? "") && el.getAttribute("aria-label") !== "Coins");
  const carriedName = anySlot?.getAttribute("aria-label")?.replace(/ x ?\d.*$/, "") ?? "";
  if (!anySlot || !carriedName) {
    // An empty pack is the account's state, not a fault in what is being tested, and it must not take
    // the checks after this one down with it.
    report.dropTakeUsed = "the pack is empty, so there was nothing to drop and take";
    return;
  }
  report.dropTakeUsed = carriedName;
  const carriedId = [...ITEM_BY_ID.values()].find((d) => d.name === carriedName)?.id ?? bread;
  report.invMenu = rightClickEl(anySlot);
  // The map has items lying about too, so the dropped one is told apart by its uid.
  const before = new Set(game.groundItems().map((g) => g.uid));
  menuItem(`Drop ${carriedName}`)?.click();
  const dropped = () => game.groundItems().find((g) => g.id === carriedId && !before.has(g.uid));
  report.drop = await until(() => dropped() !== undefined, 4000);
  const loaf = dropped();
  if (!loaf) {
    report.drop = `the dropped ${carriedName} never appeared`;
    return;
  }
  report.dropAtFeet = loaf.x === me.tileX && loaf.y === me.tileY;

  // Back off the ground: the default option over it is Take, and a left click takes it.
  const spot = game.screenOf({ x: loaf.x, y: loaf.y }, 0.04);
  const top = game.options(spot.x, spot.y)[0];
  report.takeDefault = top?.verb === "Take" && top.target === carriedName;
  if (report.takeDefault !== true) report.takeStolenBy = `${top?.verb} ${top?.target}`;
  // A creature standing on the loaf must not swallow the click: its click box is far bigger than it is,
  // and it stands on the ground, so it can sit between the camera and anything lying there.
  const squatter = [...game.entities.values()].find((e) => e.npc !== null && !e.dying);
  if (squatter) {
    const wasAt = { x: squatter.fx, y: squatter.fy };
    squatter.snapTo(loaf.x, loaf.y);
    squatter.update(0, game.map);
    const over = game.options(spot.x, spot.y)[0];
    report.itemBeatsCreature = over?.verb === "Take" && over.target === carriedName;
    if (report.itemBeatsCreature !== true) report.takeStolenBy = `${over?.verb} ${over?.target}`;
    squatter.snapTo(Math.floor(wasAt.x), Math.floor(wasAt.y));
    squatter.update(0, game.map);
  }
  game.renderer.domElement.dispatchEvent(new PointerEvent("pointerdown", { clientX: spot.x, clientY: spot.y, button: 0, bubbles: true }));
  report.take = await until(() => slotLabelled(carriedName) !== null && !game.groundItems().some((g) => g.uid === loaf.uid), 5000);

  // Drag the first slot onto the second, which swaps them; then back.
  const label = (i: number) => document.querySelector(`#inventory .inv-slot[data-slot="${i}"]`)?.getAttribute("aria-label");
  const [first, second] = [label(0), label(1)];
  const drag = (from: number, to: number) => {
    const a = document.querySelector(`#inventory .inv-slot[data-slot="${from}"]`)!, b = document.querySelector(`#inventory .inv-slot[data-slot="${to}"]`)!;
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    const at = (r: DOMRect) => ({ clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0, pointerId: 8, pointerType: "mouse", bubbles: true });
    a.dispatchEvent(new PointerEvent("pointerdown", at(ra)));
    a.dispatchEvent(new PointerEvent("pointermove", at(rb)));
    a.dispatchEvent(new PointerEvent("pointerup", at(rb)));
  };
  drag(0, 1);
  const swapped = label(0) === second && label(1) === first;
  // The server sends the pack back on the next tick, so the wait is for its word, not for a moment.
  const settled = async (a: string | null | undefined, b: string | null | undefined) =>
    await until(() => label(0) === a && label(1) === b, 4000);
  const kept = await settled(second, first);
  drag(1, 0);
  const back = await settled(first, second);
  report.swap = swapped && kept && back;
  if (report.swap !== true) {
    // ⛔ A false here says nothing on its own: which of the three steps went wrong is the whole point.
    report.swapFailed = { started: [first, second], swapped, keptAfterTheTick: kept, swappedBack: back, now: [label(0), label(1)] };
  }

  /**
   * The rest of these take the pack as they find it. A saved account carries whatever the last run
   * left it holding, and naming an item that is no longer there threw — which took every check after
   * it down, on the live site, over a loaf.
   */
  const byName = new Map([...ITEM_BY_ID.values()].map((d) => [d.name, d]));
  const held = [...document.querySelectorAll<HTMLElement>("#inventory .inv-slot[aria-label]")]
    .map((el) => ({ el, def: byName.get(el.getAttribute("aria-label") ?? "") }))
    .filter((s) => s.def !== undefined);

  // Use one thing on another: the tinderbox on whatever else is to hand. Nothing comes of any of
  // these pairs, and the game says so.
  const box = slotLabelled("Tinderbox");
  const other = held.find((s) => s.el !== box);
  if (box && other) {
    rightClickEl(box);
    menuItem("Use Tinderbox")?.click();
    const chosen = box.classList.contains("chosen");
    clickEl(other.el);
    report.useItem = chosen && await until(() => chatSays(NOTHING_COMES), 3000);
  } else {
    report.useItem = "no tinderbox and something else to try it on";
  }

  // Examine from the menu prints that item's own description, whatever the pack happens to hold.
  const examinable = held[0];
  if (examinable) {
    rightClickEl(examinable.el);
    menuItem(`Examine ${examinable.def!.name}`)?.click();
    report.examineItem = chatSays(examinable.def!.examine) || `examining ${examinable.def!.name} said nothing`;
  } else {
    report.examineItem = "the pack is empty, so there was nothing to examine";
  }
}

/**
 * The village's own screens, through the real interface: the bank takes things in and gives them back,
 * a shop names a price and takes the coins for it, a workbench offers its list, and a door swings.
 * Each walks the player over as a player would, so a pass means the whole chain works, not one method.
 */
async function villageChecks(game: Game, report: Record<string, unknown>): Promise<void> {
  const send = (msg: C2S) => game.tell(msg);
  const screen = document.getElementById("screen") as HTMLDivElement;
  const shown = () => !screen.hidden;
  const title = () => screen.querySelector(".screen-bar h3")?.textContent ?? screen.querySelector(".say-name")?.textContent ?? "";
  const goTo = (x: number, y: number, within = 3) => walkTo(game, x, y, within);

  /**
   * Walks over to the nearest object of a kind and does its first option, then waits for a screen. A
   * counter is inside a building and the building's door is shut, so the door on the way is opened
   * first — which is exactly what a player has to do, and the classic's own rule.
   */
  const useNearest = async (kinds: ObjectKind[], want: RegExp, ticks = 20000): Promise<boolean | string> => {
    const me = game.local!;
    const found = game.map.objects
      .filter((o) => kinds.includes(o.kind))
      .map((o) => ({ o, d: Math.hypot(o.x - me.tileX, o.y - me.tileY) }))
      .sort((a, b) => a.d - b.d)[0];
    if (!found) return `nothing of ${kinds.join("/")} on this map`;
    if (!await goTo(found.o.x, found.o.y, 6)) return `never got within reach of the ${found.o.kind}`;
    await openTheWay(found.o);
    send({ t: "object", id: found.o.id });
    if (await until(() => shown() && want.test(title()), ticks)) return true;
    return shown() ? `something else opened: ${title()}` : `nothing opened at the ${found.o.kind}`;
  };

  /** Opens the door nearest the thing being walked to, and waits for the way through to clear. */
  const openTheWay = async (target: { x: number; y: number }): Promise<void> => {
    const door = game.map.objects
      .filter((o) => o.kind === "door")
      .map((o) => ({ o, d: Math.hypot(o.x - target.x, o.y - target.y) }))
      .sort((a, b) => a.d - b.d)[0];
    if (!door || door.d > 12) return;
    const [dx, dy] = SIDE_STEP[door.o.side]!;
    if (!game.map.collision.wallBetween(door.o.x, door.o.y, dx, dy)) return;
    send({ t: "object", id: door.o.id });
    await until(() => !game.map.collision.wallBetween(door.o.x, door.o.y, dx, dy), 20000);
  };

  // The checks before this one leave the player out in the wood or up at the quarry. Oakridge is where
  // its own screens are, so the walk back comes first and the report says whether it got there.
  report.walkedToVillage = await goTo(GREEN.x, GREEN.y, 5);

  // The bank: open it at a booth, put something in, and take it back out.
  report.bankOpens = await useNearest(["bank_booth"], /bank/i);
  if (report.bankOpens === true) {
    const packSlot = screen.querySelector<HTMLElement>(".pack-row .bank-slot:not(.empty)");
    const bankedBefore = screen.querySelectorAll(".bank-grid:not(.pack) .bank-slot:not(.empty)").length;
    packSlot?.dispatchEvent(new PointerEvent("pointerdown", { clientX: 0, clientY: 0, button: 0, bubbles: true }));
    packSlot?.dispatchEvent(new PointerEvent("pointerup", { clientX: 0, clientY: 0, button: 0, bubbles: true }));
    report.banked = await until(
      () => screen.querySelectorAll(".bank-grid:not(.pack) .bank-slot:not(.empty)").length > bankedBefore, 4000);
    const bankSlot = screen.querySelector<HTMLElement>(".bank-grid:not(.pack) .bank-slot:not(.empty)");
    const packBefore = screen.querySelectorAll(".pack-row .bank-slot:not(.empty)").length;
    bankSlot?.dispatchEvent(new PointerEvent("pointerdown", { clientX: 0, clientY: 0, button: 0, bubbles: true }));
    bankSlot?.dispatchEvent(new PointerEvent("pointerup", { clientX: 0, clientY: 0, button: 0, bubbles: true }));
    report.withdrew = await until(() => screen.querySelectorAll(".pack-row .bank-slot:not(.empty)").length >= packBefore, 4000);
    send({ t: "close" });
    await until(() => !shown(), 2000);
  }

  // A shop: it opens with a price on every line, and buying takes coins and gives goods.
  report.shopOpens = await useNearest(["counter"], /store|tools|shop/i);
  if (report.shopOpens === true) {
    const line = screen.querySelector<HTMLElement>(".bank-grid:not(.pack) .bank-slot:not(.empty)");
    report.shopPrices = /coins each/.test(line?.title ?? "") || `no price on the first line: ${line?.title}`;
    send({ t: "close" });
    await until(() => !shown(), 2000);
  }

  // A workbench: the furnace offers what can be smelted, greying out what cannot be made yet.
  report.makeOpens = await useNearest(["furnace", "anvil", "range"], /smelt|make|cook/i);
  if (report.makeOpens === true) {
    const rows = screen.querySelectorAll(".make-cell");
    report.makeList = rows.length > 0 ? `${rows.length} things, ${screen.querySelectorAll(".make-cell.cant").length} out of reach` : "empty";
    send({ t: "close" });
    await until(() => !shown(), 2000);
  }

  // A door: clicking it swings it open, the way through clears, and clicking it again shuts it.
  const me = game.local!;
  const door = game.map.objects
    .filter((o) => o.kind === "door")
    .map((o) => ({ o, d: Math.hypot(o.x - me.tileX, o.y - me.tileY) }))
    .sort((a, b) => a.d - b.d)
    .find(({ o }) => { const [dx, dy] = SIDE_STEP[o.side]!; return game.map.collision.wallBetween(o.x, o.y, dx, dy); })?.o;
  if (door) {
    const [sx, sy] = SIDE_STEP[door.side]!;
    report.doorWasShut = true;
    await goTo(door.x, door.y, 4);
    send({ t: "object", id: door.id });
    report.doorOpens = await until(() => !game.map.collision.wallBetween(door.x, door.y, sx, sy), 20000);
    if (report.doorOpens === true) {
      send({ t: "object", id: door.id });
      report.doorShuts = await until(() => game.map.collision.wallBetween(door.x, door.y, sx, sy), 6000);
    }
  } else {
    report.doorOpens = "every door in sight already stands open";
  }

  // The world map: the button opens it, it draws something, it knows where the player is, and it shuts.
  const mapButton = document.getElementById("map-open") as HTMLButtonElement | null;
  const mapBox = document.getElementById("worldmap") as HTMLDivElement | null;
  if (mapButton && mapBox) {
    mapButton.click();
    report.mapOpens = await until(() => !mapBox.hidden, 2000);
    if (report.mapOpens === true) {
      const paper = document.getElementById("worldmap-canvas") as HTMLCanvasElement;
      // It is drawn over the frames after it opens, a region a frame, so the pixels are read once it is whole.
      report.mapWhole = await until(() => game.worldmap.settled, 15000);
      // It has to have drawn something: a blank map would pass every other check here.
      const ctx = paper.getContext("2d")!;
      const pixels = ctx.getImageData(0, 0, paper.width, paper.height).data;
      const seen = new Set<number>();
      for (let i = 0; i < pixels.length; i += 4 * 97) seen.add((pixels[i]! << 16) | (pixels[i + 1]! << 8) | pixels[i + 2]!);
      report.mapDrawn = seen.size > 8 ? `${seen.size} colours` : `only ${seen.size} colours — the map came out blank`;
      report.mapSaysWhereYouAre = /You are at \d+, \d+/.test(document.getElementById("worldmap-hint")?.textContent ?? "");
      // Zoomed right out, the whole built world is in view, and a drag across it must cost a frame,
      // not a second: it is drawn from pictures the cache keeps at every zoom, never rendered again.
      const out = document.getElementById("worldmap-out") as HTMLButtonElement;
      for (let i = 0; i < 4; i++) out.click();
      const fillFrom = performance.now();
      const filled = await until(() => game.worldmap.settled, 15000);
      const fillMs = Math.round(performance.now() - fillFrom);
      const rendersBefore = game.pictures.renders, drawsBefore = game.worldmap.draws;
      const r = paper.getBoundingClientRect(), mid = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      const opts = { pointerId: 7, pointerType: "mouse", bubbles: true, cancelable: true };
      paper.dispatchEvent(new PointerEvent("pointerdown", { ...opts, clientX: mid.x, clientY: mid.y }));
      paper.dispatchEvent(new PointerEvent("pointermove", { ...opts, clientX: mid.x + 40, clientY: mid.y + 25 }));
      paper.dispatchEvent(new PointerEvent("pointerup", { ...opts, clientX: mid.x + 40, clientY: mid.y + 25 }));
      await until(() => game.worldmap.draws > drawsBefore && game.worldmap.settled, 2000);
      const rendered = game.pictures.renders - rendersBefore, dragMs = Math.round(game.worldmap.lastDrawMs * 10) / 10;
      report.mapZoomedOut = { regions: game.worldmap.regionsShown, fillMs, dragMs, rendered, ok: filled && rendered === 0 && dragMs < 30 };
      // The paper changes size when the map opens and never again on its own: a canvas that sized its
      // paper back once grew it two pixels a frame, and the browser's resize watcher said so every frame.
      report.mapResizes = { paper: game.worldmap.resizes, view: game.resizes, draws: game.worldmap.draws, ok: game.worldmap.resizes <= 3 };
      (document.getElementById("worldmap-close") as HTMLButtonElement).click();
      // `hidden` may be the string "until-found" as well as a boolean, so it is coerced, not read.
      report.mapCloses = await until(() => mapBox.hidden !== false, 2000);
    }
  }

  // The ferry (PLAN §7.6, Wave 2), on a local run only: the server stands the player at Brinehaven's
  // berth (a test-run message production drops), the ferryman takes the fare, and the player comes up
  // on Sablewood Isle a thousand tiles off — the same plane, so the client must rebuild its scene as it
  // does for a plane change rather than walk the figure across the sea — and the crossing back lands
  // them on the quay again. The account is a fresh one on every local run, so nothing is stranded.
  if (location.hostname === "127.0.0.1" && me) {
    const berth = TRAVEL["brinehaven"]!, landing = TRAVEL["tarhollow"]!;
    // (A crossing rebuilds the scene and the player with it, so the player is looked up fresh each time, never held.)
    // (Between the crossing and the next tick there is no player at all: the checks wait rather than throw.)
    const here = () => game.local;
    const near = (to: { x: number; y: number }) => { const p = here(); return p !== undefined && Math.hypot(p.tileX - to.x, p.tileY - to.y) < 6; };
    send({ t: "place", x: berth.x, y: berth.y });
    report.ferryBerth = await until(() => near(berth) && game.regionsUp > 0, 8000);
    // Any box still up is shut first: a talk sent over an open box replaces the server's screen at once,
    // and a click on the old box in that moment lands on nothing.
    const dismiss = async () => {
      for (let i = 0; i < 3 && shown(); i++) {
        [...screen.querySelectorAll<HTMLButtonElement>(".say-option")].at(-1)?.click();
        await until(() => !shown(), 3000);
      }
    };
    const ride = async (who: string, to: { x: number; y: number }): Promise<true | string> => {
      await dismiss();
      const man = await (async () => {
        await until(() => [...game.entities.values()].some((e) => e.npc === who), 4000);
        return [...game.entities.values()].find((e) => e.npc === who);
      })();
      if (!man) return `no ${who} in view at ${here()?.tileX},${here()?.tileY}`;
      send({ t: "talk", id: man.id });
      if (!await until(() => shown() && screen.querySelector(".say-option") !== null, 8000)) return "the talk never opened";
      const option = [...screen.querySelectorAll<HTMLButtonElement>(".say-option")].find((b) => /Take me/.test(b.textContent ?? ""));
      if (!option) {
        const offered = [...screen.querySelectorAll(".say-option")].map((b) => b.textContent).join(" | ");
        await dismiss();
        // The fare is twenty coins each way, and a fresh account's earlier checks may have spent it: not a fault of the ferry.
        return offered.includes("What's on the isle?") ? `skipped: no fare left for the crossing back (offered: ${offered})` : `no crossing offered (${offered})`;
      }
      const framesBefore = game.frames;
      option.click();
      if (!await until(() => near(to), 8000)) {
        const chat = [...document.querySelectorAll("#chat-lines .game")].slice(-3).map((el) => el.textContent).join(" / ");
        return `never arrived: at ${here()?.tileX},${here()?.tileY}; box ${shown() ? `up (${title()})` : "down"}; chat: ${chat}`;
      }
      // The scene there comes up: the region under the player is loaded, and the frame loop kept running.
      if (!await until(() => game.regionsUp > 0 && here() !== undefined && !game.streamer.pending(here()!.tileX, here()!.tileY), 15000)) return "the far shore never built";
      return game.frames > framesBefore ? true : "the frame loop stopped";
    };
    if (report.ferryBerth === true) {
      report.ferryOut = await ride("ferryman", landing);
      report.ferryRegions = game.regionsUp;
      if (report.ferryOut === true) report.ferryBack = await ride("ferryman_isle", berth);
    }
  }

  // Talking: a villager says something, and the box offers a way out of the conversation.
  const person = [...game.entities.values()].find((e) => e.npc !== null && MONSTER_BY_KEY.get(e.npc)?.person);
  if (person) {
    send({ t: "talk", id: person.id });
    report.talkOpens = await until(() => shown() && screen.querySelector(".say-option") !== null, 15000);
    if (report.talkOpens === true) {
      report.talkSays = title();
      // The speaker's head beside their words (PLAN Phase 9): a picture rendered from their own model.
      const portrait = screen.querySelector<HTMLImageElement>(".say-portrait");
      report.talkPortrait = portrait ? (portrait.src.length > 2000 ? true : `a portrait ${portrait.src.length} bytes long`) : "no portrait in the box";
      const last = [...screen.querySelectorAll<HTMLButtonElement>(".say-option")].at(-1);
      last?.click();
      report.talkCloses = await until(() => !shown(), 3000);
    }
  } else {
    report.talkOpens = "nobody of the village in view";
  }
}

/** The step across each side of a tile: north, east, south, west. */
const SIDE_STEP: ReadonlyArray<readonly [number, number]> = [[0, 1], [1, 0], [0, -1], [-1, 0]];

/**
 * Gathering through the real interface: the default option on the nearest plain tree is "Chop down", and
 * a left click on it walks up and starts chopping, facing the tree with the axe in hand. A log comes (on
 * a local run every roll succeeds; on the live site it's down to the dice, so it may not), an XP drop
 * rises, the tree falls to a stump, and the skills tab shows the XP. The log is dropped again, so the
 * saved test account keeps what it had.
 */
async function gatherChecks(game: Game, report: Record<string, unknown>, shotsUrl: string | null): Promise<void> {
  const me = game.local!;
  const local = location.hostname === "127.0.0.1";
  const logs = () => document.querySelectorAll('#inventory .inv-slot[aria-label="Logs"]').length;

  /**
   * An axe first, because a saved account may no longer have one and then nothing below can run. The
   * map keeps tools lying about: it walks to the nearest one and takes it, which also leaves the
   * account holding an axe for the next run.
   */
  const axeIds = TOOLS.axe.map((t) => item(t.item).id);
  const axes = new Set(axeIds);
  // An axe above the account's Woodcutting level is refused, and refused reads exactly like broken:
  // what counts is holding one it may USE. The level is on the skills tab, where a player reads it.
  const woodcutting = Number(
    /level (\d+)/.exec(document.querySelector('.skill[data-skill="woodcutting"]')?.getAttribute("aria-label") ?? "")?.[1] ?? 1,
  );
  const usable = TOOLS.axe.filter((t) => t.level <= woodcutting).map((t) => item(t.item).name);
  const heldAxe = () => [...document.querySelectorAll<HTMLElement>("#inventory .inv-slot[aria-label]")]
    .some((el) => usable.includes(el.getAttribute("aria-label") ?? ""));
  if (!heldAxe()) {
    report.wantedAnAxe = `Woodcutting ${woodcutting}, so it needs one of: ${usable.join(", ")}`;
    // Only one it may use, worst first: a better axe lying closer is no use to a low-levelled account.
    const wanted = new Set(TOOLS.axe.filter((t) => t.level <= woodcutting).map((t) => item(t.item).id));
    const lying = game.groundItems()
      .filter((g) => wanted.has(g.id))
      .sort((a, b) => axeIds.indexOf(a.id) - axeIds.indexOf(b.id)
        || Math.hypot(a.x - me.tileX, a.y - me.tileY) - Math.hypot(b.x - me.tileX, b.y - me.tileY))[0];
    if (!lying) {
      report.chopping = "no axe in the pack and none lying about to pick up";
      return;
    }
    const spot = game.screenOf({ x: lying.x, y: lying.y }, 0.04);
    game.renderer.domElement.dispatchEvent(new PointerEvent("pointerdown", { clientX: spot.x, clientY: spot.y, button: 0, bubbles: true }));
    report.tookAnAxe = await until(heldAxe, 20000);
    if (report.tookAnAxe !== true) {
      report.chopping = "never got hold of an axe to chop with";
      return;
    }
  }
  const walkUp = (o: { x: number; y: number }) => findPathTo(game.map.collision, me.tileX, me.tileY, { x: o.x, y: o.y, w: 1, h: 1 });
  const tree = game.map.objects
    .filter((o) => o.kind === "tree" && !game.depleted.has(o.id))
    .map((o) => ({ o, walk: walkUp(o) }))
    .filter(({ o, walk }) => { const end = walk.at(-1) ?? { x: me.tileX, y: me.tileY }; return reaches(game.map.collision, end.x, end.y, { x: o.x, y: o.y, w: 1, h: 1 }); })
    .sort((a, b) => a.walk.length - b.walk.length)[0]?.o;
  if (!tree) {
    // Every tree within reach felled and not yet back: the world's state, not a fault, and the checks
    // after this one still have work to do.
    report.chopping = "no standing tree in reach to chop";
    return;
  }

  // The wood is a walk from the village, and the checks before this one may have left the player there.
  // Walking over first is what a player does, and it is also the only way the camera can see a tree.
  report.walkedToWood = await walkTo(game, tree.x, tree.y, 5);
  // A wood is crowded: aiming at a tile is not aiming at the tree on it, because another canopy can
  // stand between. Take an aim that lands on SOME plain tree — any of them will do, the check is that
  // a plain tree can be chopped — and only fall back to the walk-nearest one when none is in sight.
  const aim = visibleObject(game, me, (kind) => kind === "tree");
  const at = aim ? aim.at : game.screenOf({ x: tree.x, y: tree.y }, 0.9);
  const top = game.options(at.x, at.y)[0];
  report.chopDefault = top?.verb === "Chop down" && top.target === "Tree";
  if (report.chopDefault !== true) report.chopAimedAt = `${top?.verb} ${top?.target}`;
  // Exactly which object the click is about to name, so a refusal from the server can be told apart
  // from an aim that landed on the wrong tree.
  const under = game.objectUnder(at.x, at.y);
  report.chopTarget = under ? `#${under.id} ${under.kind} at ${under.x},${under.y}` : "nothing under the aim";
  // The map's picture of the tree before the chop, and of a patch of ground well away from it.
  const mapBefore = under ? game.pictures.sample(under.x, under.y, 2) : null;
  const awayBefore = under ? game.pictures.sample(under.x, under.y - 20, 2) : null;
  const before = logs();
  game.renderer.domElement.dispatchEvent(new PointerEvent("pointerdown", { clientX: at.x, clientY: at.y, button: 0, bubbles: true }));
  // Whichever axe it is holding: a saved account may have picked an iron or steel one up off the map,
  // and naming the bronze one reads "not chopping" while it chops perfectly well.
  report.chopping = await until(() => me.act?.anim === "chop" && axes.has(me.act.tool), 15000);
  if (report.chopping !== true) {
    // Say why rather than only "no": a saved account may be holding an axe above its Woodcutting
    // level, and the game says exactly that in the chatbox while the check reports a bare false.
    report.choppingFailed = {
      holding: [...document.querySelectorAll<HTMLElement>("#inventory .inv-slot[aria-label]")]
        .map((el) => el.getAttribute("aria-label")).filter((n) => n && !/^Empty/.test(n)),
      doing: me.act?.anim ?? "nothing",
      said: [...document.querySelectorAll("#chat-lines .game")].slice(-3).map((el) => el.textContent),
    };
  }
  // Whichever tree the click landed on is the one being chopped.
  const target = me.act ? game.map.objects.find((o) => o.x === me.act!.x && o.y === me.act!.y) : undefined;
  report.chopsATree = target?.kind === "tree" || target?.kind === "oak";
  const facing = () => {
    const want = Math.atan2(me.act!.x + 0.5 - me.fx, -(me.act!.y + 0.5 - me.fy)), diff = want - me.heading;
    return Math.abs(Math.atan2(Math.sin(diff), Math.cos(diff))) < 0.3;
  };
  report.facesTree = report.chopping === true && await until(facing, 3000);
  if (shotsUrl && report.chopping) {
    await new Promise((r) => setTimeout(r, 900));
    const p = me.model.root.position;
    beacon(shotsUrl, `SHOT chopping ${game.snapshot({ target: new THREE.Vector3(p.x, p.y + 0.85, p.z), yaw: -me.heading + Math.PI / 2, pitch: 0.2, distance: 3.4 })}`);
  }

  // The axe landing is what plays the chopping sound, so a swing must have been heard by now.
  report.chopHeard = await until(() => (game.sound.stats.played.chop ?? 0) > 0, 4000);
  report.log = await until(() => logs() > before, local ? 8000 : 25000);
  if (!report.log) {
    // Live, the rolls are real: a miss this long is unlucky, not broken. Stop chopping and move on.
    if (!local) report.log = "no log in 25 s (chance)";
    return;
  }
  report.xpDrop = await until(() => document.querySelector('#xp-drops .xp-drop[data-skill="woodcutting"]') !== null, 2000);
  report.fell = target !== undefined && await until(() => game.depleted.has(target.id), 3000);
  report.fellHeard = report.fell === true && await until(() => (game.sound.stats.played.fell ?? 0) > 0, 2000);
  // The map follows the world: the picture of the tree's region is rendered again once the tree is
  // down, and the canopy is gone from it while a patch of ground well away from it is as it was.
  if (report.fell === true && under && target && mapBefore && awayBefore) {
    if (target.id !== under.id) {
      report.mapFollowsTheWorld = `aimed at #${under.id} but chopped #${target.id}, so no picture to compare`;
    } else {
      const atTree = pixelsDiffering(mapBefore, game.pictures.sample(under.x, under.y, 2));
      const away = pixelsDiffering(awayBefore, game.pictures.sample(under.x, under.y - 20, 2));
      report.mapFollowsTheWorld = atTree > 0 && away === 0 ? true : `${atTree} px changed at the tree, ${away} away from it`;
    }
  }
  report.stoppedChopping = await until(() => me.act === null, 3000);
  if (shotsUrl && report.fell && target) {
    const p = me.model.root.position, tx = target.x + 0.5, ty = target.y + 0.5;
    beacon(shotsUrl, `SHOT stump ${game.snapshot({ target: new THREE.Vector3(tx, heightAt(game.map, tx, ty) + 0.4, -ty), yaw: Math.atan2(tx - p.x, -ty - p.z) + Math.PI, pitch: 0.45, distance: 3 })}`);
  }

  (document.querySelector('.side-tab[data-tab="skills"]') as HTMLButtonElement).click();
  const cell = document.querySelector('.skill[data-skill="woodcutting"]');
  report.skillsTab = /Woodcutting level \d+, [\d,]+ XP/.test(cell?.getAttribute("aria-label") ?? "") && !/, 0 XP/.test(cell?.getAttribute("aria-label") ?? "");
  (document.querySelector('.side-tab[data-tab="inventory"]') as HTMLButtonElement).click();

  // The log goes back on the ground, so the account's pack stays as it was.
  const slot = slotLabelled("Logs");
  if (slot) {
    rightClickEl(slot);
    menuItem("Drop Logs")?.click();
    report.logDropped = await until(() => logs() === before, 4000);
  }
}

/**
 * Fighting, through the real input path: find the nearest creature that can be walked up to, take the
 * menu's first option on it, and watch the whole exchange — the walk, the guard stance, blows landing
 * as hitsplats and a health bar, the hitpoints orb, and combat XP. Nothing here is faked: the counts
 * and the interface elements are what the running game produced.
 */
async function combatChecks(game: Game, report: Record<string, unknown>, shotsUrl: string | null): Promise<void> {
  const me = game.local!;
  const reachable = (e: { tileX: number; tileY: number }) => {
    const rect = { x: e.tileX, y: e.tileY, w: 1, h: 1 };
    const end = findPathTo(game.map.collision, me.tileX, me.tileY, rect).at(-1) ?? { x: me.tileX, y: me.tileY };
    return reaches(game.map.collision, end.x, end.y, rect);
  };
  // People of the village are not creatures: nobody may swing at them, so they are not quarry.
  const creatures = [...game.entities.values()]
    .filter((e) => e.npc !== null && !e.dying && !MONSTER_BY_KEY.get(e.npc)?.person);
  report.creaturesInView = creatures.length;
  // The nearest creature the camera can actually click: a creature in the wood is often behind a canopy
  // from where the camera stands, and a click aimed at it starts a chop instead (both live runs of
  // 2026-09-24 did that on a thicket spider). Anything passed over is reported, with what its click offered.
  const candidates = creatures.filter(reachable)
    .sort((a, b) => Math.hypot(a.fx - me.fx, a.fy - me.fy) - Math.hypot(b.fx - me.fx, b.fy - me.fy));
  let quarry: (typeof candidates)[number] | undefined, top: ReturnType<Game["options"]>[number] | undefined;
  let at = { x: 0, y: 0 };
  const passedOver: string[] = [];
  for (const c of candidates) {
    // Aimed at the middle of its click box, which is where a player's cursor would land.
    const p = game.screenOf({ x: c.tileX, y: c.tileY }, Math.max(0.55, c.model.height) / 2);
    const first = game.options(p.x, p.y)[0];
    if (first?.verb === "Attack" && first.target.startsWith(c.name)) {
      quarry = c;
      top = first;
      at = p;
      break;
    }
    passedOver.push(`${c.name} at ${c.tileX},${c.tileY} (${first ? `${first.verb} ${first.target}` : "nothing"})`);
  }
  if (!quarry) {
    report.combat = candidates.length > 0 ? `no creature in view can be clicked: ${passedOver.join("; ")}` : "nothing in view to fight";
    return;
  }
  report.quarry = quarry.name;
  if (passedOver.length > 0) report.quarryBehind = passedOver;

  // The menu offers a fight as its first option, with the creature's level beside its name.
  report.attackDefault = top?.verb === "Attack" && /\(level \d+\)$/.test(top.target);
  game.renderer.domElement.dispatchEvent(new PointerEvent("pointerdown", { clientX: at.x, clientY: at.y, button: 0, bubbles: true }));

  const wasAt = { x: me.tileX, y: me.tileY };
  report.engaged = await until(() => me.act?.anim === "fight", 15000);
  // The fight's music comes in with the fight (muted here: what is checked is that the game says so).
  if (report.engaged) report.battleMusic = await until(() => game.inBattle, 3000);
  if (!report.engaged) {
    // Say what actually happened instead of just "no": did the walk start, where did it end, what was said.
    report.combatFailed = {
      walked: me.tileX !== wasAt.x || me.tileY !== wasAt.y,
      me: `${me.tileX},${me.tileY}`,
      quarryAt: `${quarry.tileX},${quarry.tileY}`,
      stillThere: game.entities.has(quarry.id),
      said: [...document.querySelectorAll("#chat-lines .game")].slice(-4).map((el) => el.textContent),
    };
    return;
  }
  // Standing beside it, never off a corner, and turned to face it.
  report.besideQuarry = Math.abs(me.tileX - quarry.tileX) + Math.abs(me.tileY - quarry.tileY) === 1;
  report.facesQuarry = await until(() => {
    const want = Math.atan2(me.act!.x + 0.5 - me.fx, -(me.act!.y + 0.5 - me.fy)), diff = want - me.heading;
    return Math.abs(Math.atan2(Math.sin(diff), Math.cos(diff))) < 0.35;
  }, 3000);

  // A blow landing: a hitsplat over something, a health bar, and the sound of it.
  report.hitsplat = await until(() => document.querySelector(".hitsplat") !== null, 12000);
  report.healthBar = await until(() => document.querySelector(".healthbar") !== null, 12000);
  report.hitHeard = await until(() => (game.sound.stats.played.hit ?? 0) > 0, 6000);
  if (shotsUrl && report.hitsplat) {
    const p = me.model.root.position;
    await beacon(shotsUrl, `SHOT fighting ${game.snapshot({ target: new THREE.Vector3(p.x, p.y + 0.9, p.z), yaw: -me.heading + 1.1, pitch: 0.22, distance: 4 })}`);
  }

  // Combat XP arrives as a drop, and the combat tab knows the weapon's styles and the combat level.
  report.combatXp = await until(() => document.querySelector('#xp-drops .xp-drop[data-skill="attack"], #xp-drops .xp-drop[data-skill="hitpoints"]') !== null, 20000);
  (document.querySelector('.side-tab[data-tab="combat"]') as HTMLButtonElement).click();
  const styles = [...document.querySelectorAll<HTMLButtonElement>(".combat-style")];
  report.combatTab = {
    weapon: document.getElementById("combat-weapon")?.textContent,
    styles: styles.map((b) => b.firstChild?.textContent),
    level: /^Combat level: \d+$/.test(document.getElementById("combat-level")?.textContent ?? ""),
    chosen: styles.findIndex((b) => b.getAttribute("aria-pressed") === "true"),
  };
  // Choosing another style takes: the server says so, and the tab shows it. The tab rebuilds its
  // buttons each time, so the check has to look at whatever is on the page now, not the old nodes.
  const buttons = () => [...document.querySelectorAll<HTMLButtonElement>(".combat-style")];
  const chosenNow = () => buttons().findIndex((b) => b.getAttribute("aria-pressed") === "true");
  const other = styles.findIndex((b) => b.getAttribute("aria-pressed") !== "true");
  if (other >= 0) {
    styles[other]!.click();
    report.styleChosen = await until(() => chosenNow() === other, 3000);
  }

  /**
   * Every stance must actually pay into the skill it trains. Each is chosen through the tab and then
   * fought in, and the XP drop that follows is what proves it: a stance that trains Defence and never
   * pays any is the whole point of this check.
   */
  const trained: Record<string, string> = { Attack: "attack", Strength: "strength", Defence: "defence", Shared: "attack" };
  const paid: Record<string, boolean | string> = {};
  for (let i = 0; i < buttons().length; i++) {
    const button = buttons()[i]!;
    const trains = button.querySelector("small")?.textContent?.split("·").pop()?.trim() ?? "";
    const skill = trained[trains];
    if (!skill) {
      paid[`style${i}`] = `unknown skill "${trains}"`;
      continue;
    }
    button.click();
    if (!await until(() => chosenNow() === i, 3000)) {
      paid[trains] = "the tab never took the choice";
      continue;
    }
    // A fresh live target each time: the one fought a moment ago may well be dead by now, and a check
    // that swings at a corpse reports "no XP" for a stance that works perfectly.
    const live = [...game.entities.values()]
      .filter((e) => e.npc !== null && !e.dying && reachable(e))
      .sort((a, b) => Math.hypot(a.fx - me.fx, a.fy - me.fy) - Math.hypot(b.fx - me.fx, b.fy - me.fy))[0];
    if (!live) {
      paid[trains] = "nothing alive in reach to try it on";
      continue;
    }
    const drop = `#xp-drops .xp-drop[data-skill="${skill}"]`;
    for (const el of document.querySelectorAll(drop)) el.remove();
    // The skills tab carries the running total, so a drop that never appears can be told apart from
    // XP that never arrived at all.
    const totalOf = () => {
      const label = document.querySelector(`.skill[data-skill="${skill}"]`)?.getAttribute("aria-label") ?? "";
      return Number(/([\d,]+) XP/.exec(label)?.[1]?.replace(/,/g, "") ?? -1);
    };
    (document.querySelector('.side-tab[data-tab="skills"]') as HTMLButtonElement).click();
    const wasTotal = totalOf();
    (document.querySelector('.side-tab[data-tab="combat"]') as HTMLButtonElement).click();
    // Already toe to toe from the round before? Then stay there. Walking off to a new target is the
    // slow part, and reaching the fight is a precondition of this check, not the thing it tests: a
    // round that never gets into melee reports "this stance pays nothing" for a stance that works.
    /**
     * Take the fight from the menu at that point rather than left-clicking it. A creature standing
     * behind a tree offers "Chop down" there, and a plain click then walks the account to the tree and
     * the round reports a stance that pays nothing. What is offered goes in the line either way.
     */
    let offered = "already fighting";
    if (me.act?.anim !== "fight") {
      const at = game.screenOf({ x: live.fx - 0.5, y: live.fy - 0.5 }, Math.max(0.55, live.model.height) / 2);
      const menu = game.options(at.x, at.y);
      offered = menu[0]?.verb ?? "nothing";
      const fight = menu.find((o) => o.verb === "Attack");
      if (fight) fight.run();
      else game.renderer.domElement.dispatchEvent(new PointerEvent("pointerdown", { clientX: at.x, clientY: at.y, button: 0, bubbles: true }));
    }
    const away = Math.round(Math.hypot(live.fx - me.fx, live.fy - me.fy));
    const gotThere = await until(() => me.act?.anim === "fight", 15000);
    const sawDrop = gotThere && await until(() => document.querySelector(drop) !== null, 20000);
    (document.querySelector('.side-tab[data-tab="skills"]') as HTMLButtonElement).click();
    const nowTotal = totalOf();
    (document.querySelector('.side-tab[data-tab="combat"]') as HTMLButtonElement).click();
    // Everything close by is dead by the last round, and the walk to whatever is left can be longer
    // than the time this has. That is the check running out of road, not a stance paying nothing, so
    // it says so instead of reporting a failure — the distance is in the line either way.
    paid[trains] = sawDrop
      || (!gotThere && away > 10 && `(${live.name} was the nearest left alive, ${away} tiles off)`)
      || `${live.name} ${away} tiles off, click offered "${offered}": ${skill} XP ${wasTotal}->${nowTotal}, style ${chosenNow()}/${buttons().length}, `
      + `${gotThere ? "in melee" : "never reached it"}, hp ${document.querySelector("#orb-hp .orb-value")?.textContent}`;
  }
  report.stanceXp = paid;

  /**
   * Taking a blow pays Defence XP too. Fought here in a stance that trains something else, with the
   * Defence drops cleared first, so a drop that turns up can only have come from the damage taken.
   * Whether the creature lands anything in the time this has is chance, so a round where nothing lands
   * says so rather than failing.
   */
  const hpNow = () => Number(document.querySelector("#orb-hp .orb-value")?.textContent ?? "0");
  const offensive = buttons().findIndex((b) => /Attack|Strength/.test(b.querySelector("small")?.textContent ?? ""));
  if (offensive >= 0) {
    buttons()[offensive]!.click();
    await until(() => chosenNow() === offensive, 3000);
    for (const el of document.querySelectorAll('#xp-drops .xp-drop[data-skill="defence"]')) el.remove();
    if (me.act?.anim !== "fight") {
      const live = [...game.entities.values()]
        .filter((e) => e.npc !== null && !e.dying && reachable(e))
        .sort((a, b) => Math.hypot(a.fx - me.fx, a.fy - me.fy) - Math.hypot(b.fx - me.fx, b.fy - me.fy))[0];
      if (live) {
        const at = game.screenOf({ x: live.fx - 0.5, y: live.fy - 0.5 }, Math.max(0.55, live.model.height) / 2);
        game.renderer.domElement.dispatchEvent(new PointerEvent("pointerdown", { clientX: at.x, clientY: at.y, button: 0, bubbles: true }));
        await until(() => me.act?.anim === "fight", 15000);
      }
    }
    const startHp = hpNow();
    const hurt = await until(() => hpNow() < startHp, 25000);
    report.defenceFromHits = !hurt
      ? "(nothing landed on us)"
      : await until(() => document.querySelector('#xp-drops .xp-drop[data-skill="defence"]') !== null, 8000);
  }
  (document.querySelector('.side-tab[data-tab="inventory"]') as HTMLButtonElement).click();

  // The hitpoints orb reads as a number out of a maximum, and the world keeps drawing throughout.
  report.hpOrb = /^\d+$/.test(document.querySelector("#orb-hp .orb-value")?.textContent ?? "")
    && /^Hitpoints: \d+ of \d+$/.test(document.getElementById("orb-hp")?.getAttribute("title") ?? "");
  const drawn = game.frames;
  await new Promise((r) => setTimeout(r, 600));
  report.stillDrawing = game.frames > drawn;

  // Walking away ends the fight, so the account is left standing and not mid-brawl.
  const away = game.screenOf({ x: me.tileX, y: me.tileY });
  game.options(away.x, away.y).find((o) => o.verb === "Walk here")?.run();
  report.leftTheFight = await until(() => me.act === null, 5000);
  // And goes once the fight has been over a while: the world's own music comes back.
  if (report.battleMusic === true) report.battleOver = await until(() => !game.inBattle, BATTLE_HOLD_MS + 5000);
}
