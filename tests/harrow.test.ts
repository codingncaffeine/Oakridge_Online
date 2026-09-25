// The Harrow (PLAN §7.6, Wave 3): that the site is where the plan puts it; that building it changes
// nothing anywhere else and leaves Deepdelve's and Thornbury's north rows alone; that the ditch and the
// wall run the site's whole width and the only way over is the Harrow Gate, which stands open; that the
// sites dropped in stand where the plan puts them — the blackthorn, the heartoak grove, Gallowmere, the
// ruins, the Broken Tower — and the Rift goes down two levels to the starfall with the worst company on
// the map; that there is no bank, and worse company the further north; and that the warden talks.
import assert from "node:assert/strict";
import { test } from "node:test";
import { World } from "../src/server/world.ts";
import { ADIT_REGION } from "../src/shared/adit.ts";
import { DEEP_REGION } from "../src/shared/ashbarrow.ts";
import { CHESTS } from "../src/shared/chests.ts";
import { BLOCKED } from "../src/shared/collision.ts";
import { DIALOGUE } from "../src/shared/dialogue.ts";
import { SANDREACH_SITE } from "../src/shared/sandreach.ts";
import { inFenSites } from "../src/shared/sallowfen.ts";
import {
  BLACKTHORN, BRIDGE, BROKEN_TOWER, DEEP_RIFT_PLANE, DEEP_RIFT_ROOMS, DITCH, EAST_TRACK, GATE_GAP, GROVE, HARROW, HARROW_LABELS, MERE, RIFT_CHEST,
  RIFT_DOWN, RIFT_DWELLERS, RIFT_PLANE, RIFT_REGION, RIFT_ROOMS, RIFT_STAIR, ROAD_IN, STARFALL, WALL_Y, WEST_TRACK,
} from "../src/shared/harrow.ts";
import {
  builtRegions, cornerHeight, OVERLAY_PATH, OVERLAY_WATER, overlayAt, regionId, ROOF_NONE, roofAt, type WorldMap,
} from "../src/shared/map.ts";
import { levelOf, MONSTER_BY_KEY } from "../src/shared/monsters.ts";
import { areaAt, buildOakridge, MAP_EXITS, MAP_MARKS, OAKRIDGE_SEED } from "../src/shared/oakridge.ts";
import { besides, findPath } from "../src/shared/pathfind.ts";
import { inBox } from "../src/shared/worldgen.ts";

const stack = buildOakridge(OAKRIDGE_SEED);
const ground = stack.planes.get(0)!;
const onSite = ground.objects.filter((o) => inBox(HARROW, o.x, o.y));
const open = (map: WorldMap, x: number, y: number) => (map.collision.get(x, y) & BLOCKED) === 0;
const key = (x: number, y: number) => y * 8192 + x;
/**
 * Whether someone on `from` can walk to a tile beside `to`, in as many clicks as it takes: a flood by the
 * collision's own step rule. One walk proves less — the pathfinder searches only a window round the walker,
 * and stops as near as it can to what it cannot reach, so a walk that merely exists says nothing.
 */
const walksBeside = (map: WorldMap, from: { x: number; y: number }, to: { x: number; y: number }) => {
  const seen = new Set<number>([key(from.x, from.y)]);
  const queue = [from];
  for (let i = 0; i < queue.length; i++) {
    const t = queue[i]!;
    if (besides(map.collision, t.x, t.y, to.x, to.y)) return true;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      if (seen.has(key(t.x + dx, t.y + dy)) || !map.collision.canStep(t.x, t.y, dx, dy)) continue;
      seen.add(key(t.x + dx, t.y + dy));
      queue.push({ x: t.x + dx, y: t.y + dy });
    }
  }
  return false;
};

test("the site is regions 45–53 × 56–60, north of Deepdelve and Thornbury, and nothing beyond", () => {
  const ids = new Set(builtRegions(ground).map((r) => regionId(r.rx, r.ry)));
  for (let rx = 45; rx <= 53; rx++) for (let ry = 56; ry <= 60; ry++) assert.ok(ids.has(regionId(rx, ry)), `region ${rx},${ry} is built`);
  for (const [rx, ry] of [[44, 56], [54, 58], [49, 61], [44, 60]]) assert.ok(!ids.has(regionId(rx!, ry!)), `region ${rx},${ry} is not`);
  assert.equal(builtRegions(ground).length, 211, "the district's nine, Wave 1's thirty-five, Wave 2's thirty-two, Deepdelve's twelve, the Harrow's forty-five, Sandreach's thirty, and the Fen Road's twelve and the Sallowfen's thirty-six");
  assert.ok(onSite.length > 2000, `the heath has things standing on it (${onSite.length})`);
  assert.equal(onSite.filter((o) => o.kind === "bank_booth").length, 0, "and no bank anywhere, on purpose");
});

/** ⛔ The seam and the control: the world without the Harrow is the same world everywhere else, and the neighbours' north rows are theirs. */
test("building the Harrow changes nothing anywhere else, on any plane, and leaves the neighbours' north rows alone", () => {
  const without = buildOakridge(OAKRIDGE_SEED, { harrow: false });
  const alone = without.planes.get(0)!;
  assert.equal(builtRegions(alone).length, 118, "the control build is everything but the Harrow");
  const theirs = (o: { x: number; y: number; plane: number }) => !inBox(HARROW, o.x, o.y) && !inBox(SANDREACH_SITE, o.x, o.y) && !inFenSites(o.x, o.y) && !(o.plane < 0 && (inBox(ADIT_REGION, o.x, o.y) || inBox(DEEP_REGION, o.x, o.y)));
  for (const [plane, before] of without.planes) {
    const after = stack.planes.get(plane)!;
    for (const r of builtRegions(before).filter((r) => !inBox(SANDREACH_SITE, r.x0, r.y0) && !inFenSites(r.x0, r.y0))) {
      const both = after.regions.get(regionId(r.rx, r.ry))!;
      for (const field of ["heights", "underlay", "overlay", "indoors", "roofs"] as const) assert.deepEqual([...both[field]], [...r[field]], `plane ${plane}, region ${r.rx},${r.ry}: ${field} unchanged`);
    }
    const objects = (m: WorldMap) => m.objects.filter(theirs).map((o) => `${o.id}:${o.kind}:${o.x},${o.y}:${o.side}:${o.tag ?? ""}`).join("|");
    assert.equal(objects(after), objects(before), `plane ${plane}: their objects, with the same ids`);
    assert.deepEqual(after.monsters.filter((s) => !inBox(HARROW, s.x, s.y) && !inBox(SANDREACH_SITE, s.x, s.y) && !inFenSites(s.x, s.y)), before.monsters.filter((s) => !inBox(HARROW, s.x, s.y) && !inBox(SANDREACH_SITE, s.x, s.y) && !inFenSites(s.x, s.y)), `plane ${plane}: and their creatures`);
  }
  for (let cx = HARROW.x0; cx <= 3200; cx++) assert.equal(cornerHeight(ground, cx, HARROW.y0), cornerHeight(alone, cx, HARROW.y0), `corner ${cx},${HARROW.y0} is the neighbours'`);
  // No step: the row a tile in meets the seam exactly, and the row runs on past Thornbury's east end without a cliff.
  for (let cx = HARROW.x0; cx <= 3200; cx++) assert.ok(Math.abs(cornerHeight(ground, cx, HARROW.y0 + 1) - cornerHeight(ground, cx, HARROW.y0)) < 1e-6, `corner ${cx},${HARROW.y0 + 1} meets the seam`);
  assert.ok(Math.abs(cornerHeight(ground, 3201, HARROW.y0) - cornerHeight(ground, 3200, HARROW.y0)) < 0.5, "the seam row runs on past Thornbury's east end");
  assert.ok(ground.regions.get(regionId(50, 58))?.built === true && !alone.regions.has(regionId(50, 58)), "the control: the heath's regions exist only with the Harrow");
  assert.ok(ground.objects.length > alone.objects.length + 2000, "and the plane gained the heath");
});

test("the ditch and the wall run the whole width, and the only way over is the Harrow Gate, which stands open", () => {
  for (let x = HARROW.x0; x <= HARROW.x1; x++) {
    for (let y = DITCH.y0; y <= DITCH.y1; y++) {
      if (inBox(BRIDGE, x, y)) assert.ok(overlayAt(ground, x, y) === OVERLAY_PATH && open(ground, x, y), `the bridge at ${x},${y} can be walked`);
      else assert.ok(overlayAt(ground, x, y) === OVERLAY_WATER && !open(ground, x, y), `the ditch at ${x},${y} is water`);
    }
    if (!inBox(GATE_GAP, x, WALL_Y)) assert.ok(ground.collision.wallBetween(x, WALL_Y, 0, -1), `the wall stands on the north bank at ${x}`);
  }
  assert.equal(overlayAt(ground, ROAD_IN.x, ROAD_IN.y - 1), OVERLAY_PATH, "Thornbury's Ditch Road reaches its north edge");
  assert.equal(overlayAt(ground, ROAD_IN.x, ROAD_IN.y), OVERLAY_PATH, "and carries on over the seam");
  // Through the gate: a walk from Thornbury's side to the heath arrives, and it crosses the bridge and the gap.
  const walk = findPath(ground.collision, ROAD_IN.x, ROAD_IN.y, ROAD_IN.x, WALL_Y + 12);
  assert.deepEqual(walk.at(-1), { x: ROAD_IN.x, y: WALL_Y + 12 }, "a walk from the Ditch Road into the Harrow arrives");
  assert.ok(walk.some((t) => inBox(BRIDGE, t.x, t.y)) && walk.some((t) => inBox(GATE_GAP, t.x, t.y)), "over the bridge and through the gate");
  // Elsewhere: a walk north from the near bank never gets past the ditch, and goes round by the gate if it can.
  const west = findPath(ground.collision, 3000, 3586, 3000, 3600);
  assert.ok(west.every((t) => t.y < DITCH.y0 || (t.x >= BRIDGE.x0 - 1 && t.x <= BRIDGE.x1 + 1) || t.y > DITCH.y1), "no walk crosses the ditch but by the bridge");
  assert.equal(areaAt(3122, 3590).key, "harrowgate", "the gate has its own name");
});

test("the sites dropped into the heath: blackthorn past the ditch, the heartoak grove deep in, Gallowmere, the ruins and the Broken Tower", () => {
  const blackthorn = onSite.filter((o) => o.kind === "blackthorn");
  assert.ok(blackthorn.length >= 7, `blackthorn (WC 50) just past the ditch (${blackthorn.length})`);
  for (const t of blackthorn) assert.ok(Math.hypot(t.x - BLACKTHORN.x, t.y - BLACKTHORN.y) <= BLACKTHORN.r + 1 && t.y > WALL_Y, `the blackthorn at ${t.x},${t.y} is in its stand`);
  // (The district has kept two heartoaks at the Oakenshaw's far corner since Phase 7; the grove is the Harrow's.)
  const heartoak = onSite.filter((o) => o.kind === "heartoak");
  assert.equal(heartoak.length, 4, "heartoak (WC 90): one grove in the Harrow");
  for (const t of heartoak) assert.ok(Math.hypot(t.x - GROVE.x, t.y - GROVE.y) <= GROVE.r, `the heartoak at ${t.x},${t.y} is in the grove`);
  let mere = 0;
  for (let y = MERE.y - MERE.r; y <= MERE.y + MERE.r; y++) for (let x = MERE.x - MERE.r; x <= MERE.x + MERE.r; x++) if (overlayAt(ground, x, y) === OVERLAY_WATER) mere++;
  assert.ok(mere > 200, `Gallowmere is a mere (${mere} tiles of water)`);
  assert.ok(onSite.filter((o) => o.kind === "stone_wall" && o.tag === "ruin" && Math.hypot(o.x - MERE.x, o.y - MERE.y) < 24).length >= 60, "with its drowned village's walls round it");
  const tower = onSite.filter((o) => inBox(BROKEN_TOWER, o.x, o.y));
  assert.ok(tower.some((o) => o.kind === "stairs" && o.x === RIFT_STAIR.x && o.y === RIFT_STAIR.y && o.to === RIFT_PLANE), "the Broken Tower has the Rift's stair inside");
  assert.ok(tower.some((o) => o.kind === "door"), "and a door");
  assert.equal(roofAt(ground, RIFT_STAIR.x, RIFT_STAIR.y), ROOF_NONE, "and no roof: it is broken");
  // The tracks: path unbroken from where the Ditch Road comes in to the tile outside the tower's door, and to Gallowmere.
  const seen = new Set<number>([key(ROAD_IN.x, ROAD_IN.y)]);
  const queue: Array<[number, number]> = [[ROAD_IN.x, ROAD_IN.y]];
  while (queue.length > 0) {
    const [x, y] = queue.shift()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx, ny = y + dy;
      if (seen.has(key(nx, ny)) || !inBox(HARROW, nx, ny) || overlayAt(ground, nx, ny) !== OVERLAY_PATH) continue;
      seen.add(key(nx, ny));
      queue.push([nx, ny]);
    }
  }
  assert.ok(seen.has(key(RIFT_STAIR.x, BROKEN_TOWER.y0 - 1)), "the east track reaches the Broken Tower's door");
  assert.ok(seen.has(key(WEST_TRACK.at(-1)![0], WEST_TRACK.at(-1)![1])), "and the west track Gallowmere");
  for (const label of ["The Harrow", "The Broken Tower", "Gallowmere"]) assert.ok(HARROW_LABELS.some((l) => l.name === label && inBox(HARROW, l.x, l.y)), `the map names ${label}`);
  assert.ok(MAP_MARKS.some((m) => m.icon === "gate" && m.y === WALL_Y), "and marks the gate");
  assert.ok(!MAP_EXITS.some((e) => e.name.includes("Ditch Road")), "and the Ditch Road is no longer an exit: it runs on");
});

test("the Rift: two levels under the Broken Tower, the starfall at the bottom, and the worst company on the map", () => {
  const rift = stack.planes.get(RIFT_PLANE)!, deep = stack.planes.get(DEEP_RIFT_PLANE)!;
  assert.ok(rift.objects.some((o) => o.kind === "stairs" && o.x === RIFT_STAIR.x && o.y === RIFT_STAIR.y && o.to === 0), "the stair back up");
  assert.ok(rift.objects.some((o) => o.kind === "stairs" && o.x === RIFT_DOWN.x && o.y === RIFT_DOWN.y && o.to === DEEP_RIFT_PLANE), "and down");
  assert.ok(deep.objects.some((o) => o.kind === "stairs" && o.x === RIFT_DOWN.x && o.y === RIFT_DOWN.y && o.to === RIFT_PLANE), "and back");
  for (const [map, rooms, from, to] of [[rift, RIFT_ROOMS, { x: RIFT_STAIR.x + 1, y: RIFT_STAIR.y }, RIFT_DOWN], [deep, DEEP_RIFT_ROOMS, { x: RIFT_DOWN.x - 1, y: RIFT_DOWN.y }, RIFT_CHEST]] as const) {
    for (let y = RIFT_REGION.y0; y <= RIFT_REGION.y1; y++) {
      for (let x = RIFT_REGION.x0; x <= RIFT_REGION.x1; x++) if (!rooms.some((r) => inBox(r, x, y))) assert.ok(!open(map, x, y), `${x},${y} on plane ${map.plane} outside the rooms is rock`);
    }
    assert.ok(walksBeside(map, from, to), `the way on from ${from.x},${from.y} to ${to.x},${to.y} can be walked`);
  }
  const starfall = deep.objects.filter((o) => o.kind === "starfall_rock");
  assert.equal(starfall.length, STARFALL.length, "four starfall rocks (Mining 78), and none anywhere else");
  assert.equal([...stack.planes.values()].flatMap((m) => m.objects).filter((o) => o.kind === "starfall_rock").length, STARFALL.length, "starfall is the Rift's and nowhere else's");
  const chest = deep.objects.find((o) => o.kind === "chest" && inBox(RIFT_REGION, o.x, o.y));
  assert.ok(chest && chest.tag === "rift" && chest.x === RIFT_CHEST.x, "the chest at the bottom");
  assert.equal(CHESTS["rift"]!.loot.reduce((n, d) => n + d.weight, 0), 128, "whose table never comes up empty");
  for (const [monster, plane, x, y] of RIFT_DWELLERS) {
    const map = stack.planes.get(plane)!, rooms = plane === RIFT_PLANE ? RIFT_ROOMS : DEEP_RIFT_ROOMS;
    assert.ok(rooms.some((r) => inBox(r, x, y)) && open(map, x, y), `${monster} at ${x},${y} on plane ${plane} stands on open floor`);
    const level = levelOf(MONSTER_BY_KEY.get(monster)!);
    assert.ok(level >= 60 && level <= 90, `${monster} is level ${level}, in the Rift's band (PLAN §8.5: 60–90)`);
  }
  assert.ok(deep.monsters.some((s) => s.monster === "rift_wraith"), "the wraiths keep the bottom");
  assert.equal(areaAt(3360, 3790, DEEP_RIFT_PLANE).key, "rift", "below the tower is the Rift");
});

test("the Broken Tower's door opens on the Rift's stair, and the stair goes down", () => {
  // A world of its own, so a door swung open here leaves the shared map's walls as built for the other tests.
  const world = new World(buildOakridge(OAKRIDGE_SEED), () => 0.5);
  const surface = world.stack.planes.get(0)!;
  const door = surface.objects.find((o) => o.kind === "door" && inBox(BROKEN_TOWER, o.x, o.y))!;
  const stair = surface.objects.find((o) => o.kind === "stairs" && o.x === RIFT_STAIR.x && o.y === RIFT_STAIR.y)!;
  // On the east track's last bend, short of the outworks.
  const [bx, by] = EAST_TRACK.at(-2)!;
  const p = world.add("Delver", undefined, { at: { x: bx, y: by, plane: 0 } });
  // The control: with the door shut the stair is out of reach, so the tower's walls stand whole but for the door.
  world.interact(p, stair.id);
  for (let i = 0; i < 20; i++) world.step();
  assert.equal(p.plane, 0, `a shut door keeps the stair out of reach (stopped at ${p.x},${p.y})`);
  world.interact(p, door.id);
  for (let i = 0; i < 20 && !world.opened.has(door.id); i++) world.step();
  assert.ok(world.opened.has(door.id), "the door opens");
  world.interact(p, stair.id);
  for (let i = 0; i < 20 && p.plane === 0; i++) world.step();
  assert.equal(p.plane, RIFT_PLANE, "and the stair takes them down into the Rift");
});

test("no bank, worse company the further north, and the ditch warden says what is past the gate", () => {
  const surface = ground.monsters.filter((s) => inBox(HARROW, s.x, s.y) && !MONSTER_BY_KEY.get(s.monster)!.person);
  const worst = (y0: number, y1: number) => Math.max(0, ...surface.filter((s) => s.y >= y0 && s.y <= y1).map((s) => levelOf(MONSTER_BY_KEY.get(s.monster)!)));
  assert.ok(worst(3593, 3690) < worst(3780, 3903), `worse company the further north (${worst(3593, 3690)} by the ditch, ${worst(3780, 3903)} deep in)`);
  for (const s of surface) assert.ok(s.y > WALL_Y, `the ${s.monster} at ${s.x},${s.y} is past the wall, not on the near bank`);
  const warden = ground.monsters.find((s) => s.monster === "ditch_warden");
  assert.ok(warden && warden.y < DITCH.y0 && Math.abs(warden.x - ROAD_IN.x) < 6, "the warden stands on the near bank by the gate");
  const talk = DIALOGUE[MONSTER_BY_KEY.get("ditch_warden")!.talk!]!;
  assert.ok(talk["start"]!.lines[0]!.includes("no bank"), "and says there is no bank past it");
  // Walking in through the real world: a player at the gate crosses and stands in the Harrow.
  const world = new World(stack, () => 0.5);
  const p = world.add("Frontier", undefined, { at: { x: ROAD_IN.x, y: ROAD_IN.y + 1, plane: 0 } });
  world.walk(p, ROAD_IN.x, WALL_Y + 12);
  for (let i = 0; i < 60 && p.y !== WALL_Y + 12; i++) world.step();
  assert.equal(p.y, WALL_Y + 12, "a player walks through the gate into the Harrow");
  assert.equal(areaAt(p.x, p.y).key, "harrow", "and is in the Harrow");
});
