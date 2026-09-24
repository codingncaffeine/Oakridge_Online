// The streaming preview (#streampreview): a wide world of nothing in particular — eight regions a side
// of seeded hills, woods, two roads, lakes and a cottage every so often — walked across at speed by a
// player the page moves itself, so region streaming (Phase 12) can be watched in the real renderer
// before the world has a second district. With a beacon it reports what came up and went down against
// the numbers the rule predicts, how long the worst frame took, and posts a snapshot across a region
// seam, where a wrong colour blend or normal would show as a line.
import * as THREE from "three";
import { STARTER_LOOK } from "../shared/look.ts";
import { REGION, UNDERLAY_DIRT, UNDERLAY_FOREST, UNDERLAY_GRASS, OVERLAY_WATER, setOverlay, type WorldStack } from "../shared/map.ts";
import { boxOf, building, road, scatter, WorldBuilder, type Point } from "../shared/worldgen.ts";
import { valueNoise2D } from "../shared/rng.ts";
import type { Sound } from "./audio.ts";
import { Game } from "./game.ts";
import type { Hud } from "./hud.ts";
import { KEEP_WITHIN, LOAD_WITHIN } from "./streaming.ts";
import type { Chatbox } from "./ui/chatbox.ts";
import type { ContextMenu } from "./ui/menu.ts";

/** Regions a side, and the row the walk runs along: the middle of region row 4. */
const REGIONS = 8;
const SIDE = REGIONS * REGION;
const ROW = 256;
/** Where the walk starts and ends, in tiles; the end stops one short of dropping a sixth column. */
const START_X = 32;
const END_X = 478;
/** Tiles a step, and the time between steps: about five times a run, so the walk takes seconds. */
const STEP = 2;
const STEP_MS = 60;
/** Where the seam snapshot looks: the line between region columns 3 and 4, with a cottage across it. */
const SEAM_X = 256;

/** A world that goes on for a while: enough regions to cross, with things on them to draw. */
export function buildWide(seed: number): WorldStack {
  const b = new WorldBuilder(SIDE, SIDE, 0, 0, seed);
  const hills = valueNoise2D(seed), woods = valueNoise2D(seed + 7);
  for (let cy = 0; cy <= SIDE; cy++) {
    for (let cx = 0; cx <= SIDE; cx++) b.setHeight(0, cx, cy, 5 * hills(cx / 40, cy / 40) + 1.4 * hills(cx / 9 + 50, cy / 9));
  }
  for (let y = 0; y < SIDE; y++) {
    for (let x = 0; x < SIDE; x++) {
      const w = woods(x / 12, y / 12), d = hills(x / 25 + 9, y / 25);
      b.setUnderlay(0, x, y, w > 0.62 ? UNDERLAY_FOREST : d > 0.72 ? UNDERLAY_DIRT : UNDERLAY_GRASS);
    }
  }
  // Three lakes, each a levelled dip, so the shore's diagonal cuts cross a seam somewhere.
  const map = b.plane(0);
  for (const [lx, ly, r] of [[150, 300, 9], [330, 220, 12], [470, 290, 7]] as const) {
    for (let y = ly - r; y <= ly + r; y++) {
      for (let x = lx - r; x <= lx + r; x++) {
        if (Math.hypot(x + 0.5 - lx, y + 0.5 - ly) > r) continue;
        setOverlay(map, x, y, OVERLAY_WATER);
        map.collision.block(x, y);
      }
    }
    b.level(0, boxOf(lx - r, ly - r, lx + r, ly + r), b.meanHeight(0, boxOf(lx - r, ly - r, lx + r, ly + r)) - 0.6);
  }
  const east: Point[] = [[0, ROW + 0.5], [SIDE - 1, ROW + 0.5]], north: Point[] = [[SEAM_X + 0.5, 0], [SEAM_X + 0.5, SIDE - 1]];
  road(b, 0, east, 1.4);
  road(b, 0, north, 1.4);
  // A cottage every so often along the road, and one set square across the seam the snapshot looks at.
  for (let x = 40; x < SIDE - 8; x += 96) {
    building(b, { box: boxOf(x, ROW + 4, x + 6, ROW + 9), doors: [{ side: 2, along: 3 }], windows: [{ side: 2, along: 1 }], floor: UNDERLAY_DIRT });
  }
  building(b, {
    box: boxOf(SEAM_X - 4, ROW - 9, SEAM_X + 3, ROW - 4), doors: [{ side: 0, along: 4 }], windows: [{ side: 0, along: 1 }, { side: 0, along: 6 }],
    floor: UNDERLAY_DIRT,
  });
  for (let ry = 0; ry < REGIONS; ry++) {
    for (let rx = 0; rx < REGIONS; rx++) {
      const at = { x: rx * REGION + 32, y: ry * REGION + 32, r: 30 };
      scatter(b, 0, "tree", at, 36, (x, y) => Math.abs(y - ROW) > 3 && Math.abs(x - SEAM_X) > 3);
      scatter(b, 0, "rock", at, 4);
    }
  }
  return b.finish({ x: START_X, y: ROW, plane: 0 }, "wide");
}

/** Where the walk is, and the frame timings gathered along it. */
interface Walk {
  x: number;
  frames: number;
  worst: number;
  slow: number;
  seamShot: boolean;
}

export function startStreamPreview(
  container: HTMLElement, hud: Hud, chat: Chatbox, menu: ContextMenu, sound: Sound,
  beacon: ((line: string) => Promise<void>) | null,
): void {
  const stack = buildWide(11);
  const game = new Game(container, stack, () => {}, hud, chat, menu, sound);
  const me = 1;
  game.welcome({
    t: "welcome", id: me, name: "Walker", tick: 0, tickMs: 600, seed: 11, x: START_X, y: ROW, plane: 0, look: STARTER_LOOK,
    energy: 100, run: true, hp: 10, maxHp: 10,
  });
  let tick = 1;
  const walk: Walk = { x: START_X, frames: 0, worst: 0, slow: 0, seamShot: false };
  const place = (x: number, first = false) => {
    game.applyTick({ t: "tick", n: tick++, online: 1, ents: [first ? { id: me, x, y: ROW, name: "Walker", look: STARTER_LOOK } : { id: me, x, y: ROW }] });
  };
  place(START_X, true);

  // Frame timings, kept only while the walk is under way.
  let last = performance.now(), walking = true;
  const frame = (now: number) => {
    const dt = now - last;
    last = now;
    if (walking && walk.frames > 5) {
      walk.worst = Math.max(walk.worst, dt);
      if (dt > 34) walk.slow++;
    }
    walk.frames++;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  const stepper = setInterval(() => {
    if (walk.x >= END_X) {
      clearInterval(stepper);
      walking = false;
      if (beacon) void report(game, walk, beacon);
      return;
    }
    walk.x = Math.min(END_X, walk.x + STEP);
    place(walk.x);
    if (beacon && !walk.seamShot && walk.x >= SEAM_X + 16) {
      walk.seamShot = true;
      // Both sides of the seam are up here: a line along x = 256 in this picture is a streaming fault.
      void beacon(`SHOT stream_seam ${game.snapshot({ target: new THREE.Vector3(SEAM_X, 1.5, -(ROW - 4)), yaw: 0.35, pitch: 0.55, distance: 30 })}`);
    }
  }, STEP_MS);
}

/**
 * What the rule predicts for a walk along one row from START_X to END_X: every column within
 * LOAD_WITHIN ahead comes up once, every column more than KEEP_WITHIN behind goes once, and what is
 * left is the three columns around the end. Three rows are involved throughout (the row walked and its
 * neighbours), so each column is three regions.
 */
export function predicted(): { loads: number; unloads: number; left: number } {
  let loads = 0, unloads = 0;
  for (let c = 0; c < REGIONS; c++) {
    const x0 = c * REGION, x1 = x0 + REGION - 1;
    // Up if it was ever within reach: at the start, or as the walk came level with it.
    if (x0 - START_X <= LOAD_WITHIN || (x0 <= END_X && x0 - LOAD_WITHIN <= END_X)) loads++;
    if (END_X - x1 > KEEP_WITHIN) unloads++;
  }
  return { loads: loads * 3, unloads: unloads * 3, left: (loads - unloads) * 3 };
}

async function report(game: Game, walk: Walk, beacon: (line: string) => Promise<void>): Promise<void> {
  const want = predicted();
  const got = { loads: game.streamer.loads, unloads: game.streamer.unloads, left: game.regionsUp };
  const ok = got.loads === want.loads && got.unloads === want.unloads && got.left === want.left;
  await beacon(`STREAM ${ok ? "ok" : "FAIL"}: loads ${got.loads}/${want.loads}, unloads ${got.unloads}/${want.unloads}, regions up ${got.left}/${want.left}, rebuilds ${game.rebuilds}, map pictures ${game.pictures.count} kept of ${game.pictures.renders} rendered`);
  await beacon(`STREAM frames ${walk.frames}: worst ${walk.worst.toFixed(1)} ms, ${walk.slow} over 34 ms, walked ${END_X - START_X} tiles`);
  await beacon(`SHOT stream_end ${game.snapshot(null)}`);
  await beacon("DONE");
}
