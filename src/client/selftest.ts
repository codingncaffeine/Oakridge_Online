// Scripted check for tools/browser-check.sh. Loaded with #selftest=<name>&beacon=<url>, the page joins,
// clicks a tile through the real input path, waits for the walk, samples the rendered pixels and
// posts a report line to the beacon.
import * as THREE from "three";
import { item } from "../shared/items.ts";
import { heightAt } from "../shared/map.ts";
import { NOTHING_COMES } from "../shared/messages.ts";
import { findPath } from "../shared/pathfind.ts";
import type { C2S, S2C } from "../shared/protocol.ts";
import type { Game } from "./game.ts";
import { OBJECT_INFO } from "./info.ts";
import type { Designer } from "./ui/designer.ts";

/** Reports a line to the collector, and to the console (which the check's Firefox prints to stdout). */
export function beacon(url: string, line: string): void {
  console.log(`[selftest] ${line.startsWith("SHOT ") ? `${line.slice(0, 40)}…` : line}`);
  fetch(url, { method: "POST", body: line, mode: "no-cors", keepalive: line.length < 60000 }).catch(() => {});
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
): (m: S2C) => void {
  let tries = 0;
  const click = (id: string, delay: number) => setTimeout(() => document.getElementById(id)?.click(), delay);
  if (secret) void totp(secret).then((code) => send({ t: "login", name, code }));
  else void send({ t: "signup", name, method: "totp" });
  return (msg) => {
    if (msg.t === "signup_totp") {
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

export async function runSelfTest(game: Game, url: string, shots = false): Promise<void> {
  const report: Record<string, unknown> = {};
  report.hiddenBeforeLogin = shownBeforeLogin === null ? "not checked" : shownBeforeLogin.length === 0 || shownBeforeLogin;
  try {
    report.joined = await until(() => game.local !== undefined && game.frames > 20, 15000);
    const me = game.local;
    if (!me) throw new Error("local player never appeared");
    const start = { x: me.tileX, y: me.tileY };
    // Test accounts keep their position, so every walk heads toward the middle of the map: runs never drift to an edge.
    const toMiddle = start.x < game.map.width / 2 ? 1 : -1;
    // A reachable tile 5 along whose walk is exactly 5 steps (straight, unobstructed).
    let target = { x: start.x + 5 * toMiddle, y: start.y };
    for (const dy of [0, 1, -1, 2, -2]) {
      const t = { x: start.x + 5 * toMiddle, y: start.y + dy };
      if (findPath(game.map.collision, start.x, start.y, t.x, t.y).length === 5) { target = t; break; }
    }
    const at = game.screenOf(target);
    const canvas = game.renderer.domElement;
    const picked = game.pick(at.x, at.y);
    report.pickedTarget = picked?.x === target.x && picked?.y === target.y;
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

    // Chat: typed into the chat line, back from the server into the chatbox and over the head.
    const input = document.getElementById("chat-input") as HTMLInputElement;
    const said = "hello from the self-test";
    input.value = said;
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    report.chat = await until(() => [...document.querySelectorAll("#chat-lines .said")].some((el) => el.textContent === said)
      && [...document.querySelectorAll(".overhead")].some((el) => el.textContent === said), 3000);

    // Right-click the nearest tree: the menu offers Walk here and Examine, and Examine prints its text.
    const tree = game.map.objects.filter((o) => o.kind === "tree" || o.kind === "oak")
      .sort((a, b) => Math.hypot(a.x - me.tileX, a.y - me.tileY) - Math.hypot(b.x - me.tileX, b.y - me.tileY))[0]!;
    const spot = game.screenOf({ x: tree.x, y: tree.y });
    canvas.dispatchEvent(new MouseEvent("contextmenu", { clientX: spot.x, clientY: spot.y - 30, bubbles: true, cancelable: true }));
    const options = [...document.querySelectorAll<HTMLButtonElement>("#context-menu button")];
    report.menu = options.map((b) => b.textContent);
    options.find((b) => b.textContent?.startsWith("Examine"))?.click();
    report.examine = await until(() => [...document.querySelectorAll("#chat-lines .game")].some((el) => el.textContent === OBJECT_INFO[tree.kind].examine), 1500);

    // Minimap: a click beside the centre walks there.
    const mini = document.getElementById("minimap") as HTMLCanvasElement, box = mini.getBoundingClientRect();
    const before = { x: me.tileX, y: me.tileY };
    // The camera still faces north here, so the minimap's right is east.
    mini.dispatchEvent(new PointerEvent("pointerdown", { clientX: box.left + box.width / 2 + 16 * toMiddle, clientY: box.top + box.height / 2, bubbles: true }));
    report.minimapWalk = await until(() => me.tileX !== before.x || me.tileY !== before.y, 4000);

    await itemChecks(game, report, shots ? url : null);

    if (shots) {
      beacon(url, `SHOT scene ${game.snapshot(null)}`);
      const p = me.model.root.position;
      beacon(url, `SHOT character ${game.snapshot({ target: new THREE.Vector3(p.x, p.y + 0.85, p.z), yaw: -me.heading + 0.5, pitch: 0.22, distance: 3.2 })}`);
      const tx = 13.5, ty = 29.5;
      beacon(url, `SHOT trees ${game.snapshot({ target: new THREE.Vector3(tx, heightAt(game.map, tx, ty) + 1.4, -ty), yaw: -1.2, pitch: 0.42, distance: 10 })}`);
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
  report.inventory = await until(() => document.querySelectorAll("#inventory .inv-slot img:not([hidden])").length >= 8, 5000);
  const axe = item("bronze_axe").id, bread = item("bread").id;

  // Wield the axe: a left click on it. The equipment tab lists it, and the character holds it.
  const axeSlot = slotLabelled("Bronze axe");
  if (!axeSlot) throw new Error("no axe in the inventory");
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

  // The bread's menu, then Drop: it lands on the tile the character stands on.
  const breadSlot = slotLabelled("Bread");
  if (!breadSlot) throw new Error("no bread in the inventory");
  report.invMenu = rightClickEl(breadSlot);
  // The map has bread lying about too, so the dropped loaf is told apart by its uid.
  const before = new Set(game.groundItems().map((g) => g.uid));
  menuItem("Drop Bread")?.click();
  const dropped = () => game.groundItems().find((g) => g.id === bread && !before.has(g.uid));
  report.drop = await until(() => dropped() !== undefined && !slotLabelled("Bread"), 4000);
  const loaf = dropped();
  if (!loaf) throw new Error("the dropped bread never appeared");
  report.dropAtFeet = loaf.x === me.tileX && loaf.y === me.tileY;

  // Back off the ground: the default option over it is Take, and a left click takes it.
  const spot = game.screenOf({ x: loaf.x, y: loaf.y }, 0.04);
  const top = game.options(spot.x, spot.y)[0];
  report.takeDefault = top?.verb === "Take" && top.target === "Bread";
  game.renderer.domElement.dispatchEvent(new PointerEvent("pointerdown", { clientX: spot.x, clientY: spot.y, button: 0, bubbles: true }));
  report.take = await until(() => slotLabelled("Bread") !== null && !game.groundItems().some((g) => g.uid === loaf.uid), 5000);

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
  await new Promise((r) => setTimeout(r, 1300));
  const kept = label(0) === second && label(1) === first;
  drag(1, 0);
  await new Promise((r) => setTimeout(r, 1300));
  report.swap = swapped && kept && label(0) === first && label(1) === second;

  // Use the tinderbox on the bread: nothing to make from those, and the game says so.
  const box = slotLabelled("Tinderbox");
  if (box) {
    rightClickEl(box);
    menuItem("Use Tinderbox")?.click();
    const chosen = box.classList.contains("chosen");
    clickEl(slotLabelled("Bread")!);
    report.useItem = chosen && await until(() => chatSays(NOTHING_COMES), 3000);
  }

  // Examine from the menu prints the item's description.
  rightClickEl(slotLabelled("Bronze axe")!);
  menuItem("Examine Bronze axe")?.click();
  report.examineItem = chatSays(item("bronze_axe").examine);
}
