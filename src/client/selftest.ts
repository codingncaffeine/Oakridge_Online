// Scripted check for tools/browser-check.sh. Loaded with #selftest=<name>&beacon=<url>, the page joins,
// clicks a tile through the real input path, waits for the walk, samples the rendered pixels and
// posts a report line to the beacon.
import * as THREE from "three";
import { heightAt } from "../shared/map.ts";
import { findPath } from "../shared/pathfind.ts";
import type { C2S, S2C } from "../shared/protocol.ts";
import type { Game } from "./game.ts";
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
  try {
    report.joined = await until(() => game.local !== undefined && game.frames > 20, 15000);
    const me = game.local;
    if (!me) throw new Error("local player never appeared");
    const start = { x: me.tileX, y: me.tileY };
    // A reachable tile 5 east whose walk is exactly 5 steps (straight, unobstructed).
    let target = { x: start.x + 5, y: start.y };
    for (const dy of [0, 1, -1, 2, -2]) {
      const t = { x: start.x + 5, y: start.y + dy };
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
