// The Fen Hollows (PLAN §8.5, Wave 4): old Mourn under the new. The slab at the mound's north edge is off
// and its stair goes down to the drowned lanes on plane −1 and on to old Mourn's chapel on plane −2, and a
// player climbs down both and back up through the real world; the rooms are floor and the rest of the region
// rock, with black water standing in them; every dry tile, every creature and the chest are got at on foot
// from the stair's foot; the bell lies at its pool's edge with the ringer over it; the company is in the band
// and the three new creatures live nowhere else; the reeve and Mourn's people say where the stair goes; and a
// world built without the Hollows is the same world everywhere else, the slab back over the stair under the
// same id.
import assert from "node:assert/strict";
import { test } from "node:test";
import { World, type Player } from "../src/server/world.ts";
import { CHESTS } from "../src/shared/chests.ts";
import { BLOCKED } from "../src/shared/collision.ts";
import {
  BELL, BELL_POOL, CHAPEL_STAIR, HOLLOWS_CHEST, HOLLOWS_DWELLERS, HOLLOWS_PLANE, HOLLOWS_REGION, HOLLOWS_STAIR, inPool, LANES, LANES_POOLS,
  LANES_ROOMS, OLD_CHAPEL, OLD_CHAPEL_PLANE, OLD_CHAPEL_ROOMS, OLD_WELL,
} from "../src/shared/fenhollows.ts";
import { builtRegions, OVERLAY_WATER, overlayAt, regionId, UNDERLAY_ROCK, underlayAt, type WorldMap } from "../src/shared/map.ts";
import { levelOf, MONSTER_BY_KEY } from "../src/shared/monsters.ts";
import { areaAt, buildOakridge, OAKRIDGE_SEED } from "../src/shared/oakridge.ts";
import { MOURN_QUEST } from "../src/shared/quests.ts";
import { MOURN } from "../src/shared/sallowfen.ts";
import { inBox, type Box } from "../src/shared/worldgen.ts";

const stack = buildOakridge(OAKRIDGE_SEED);
const ground = stack.planes.get(0)!;
const lanes = stack.planes.get(HOLLOWS_PLANE)!;
const chapel = stack.planes.get(OLD_CHAPEL_PLANE)!;
const key = (x: number, y: number) => y * 8192 + x;
const open = (map: WorldMap, x: number, y: number) => (map.collision.get(x, y) & BLOCKED) === 0;
const inAny = (rooms: readonly Box[], x: number, y: number) => rooms.some((r) => inBox(r, x, y));
/** The step across each side of a tile: north, east, south, west. */
const ACROSS: ReadonlyArray<readonly [number, number]> = [[0, 1], [1, 0], [0, -1], [-1, 0]];
const NEW_CREATURES = ["hollow_crawler", "drowned_mourner", "drowned_ringer"];

/** Every tile reached from `from` by the collision's own step rule, inside the Hollows' region. */
function flood(map: WorldMap, from: { x: number; y: number }): Set<number> {
  const seen = new Set<number>([key(from.x, from.y)]);
  const queue: Array<[number, number]> = [[from.x, from.y]];
  for (let head = 0; head < queue.length; head++) {
    const [x, y] = queue[head]!;
    for (const [dx, dy] of ACROSS) {
      const nx = x + dx, ny = y + dy;
      if (seen.has(key(nx, ny)) || !inBox(HOLLOWS_REGION, nx, ny) || !map.collision.canStep(x, y, dx, dy)) continue;
      seen.add(key(nx, ny));
      queue.push([nx, ny]);
    }
  }
  return seen;
}

/** Whether something filling its tile can be got at: a reached tile beside it, with no wall between. */
const besideReached = (map: WorldMap, reached: Set<number>, x: number, y: number) =>
  ACROSS.some(([dx, dy]) => reached.has(key(x + dx, y + dy)) && !map.collision.wallBetween(x + dx, y + dy, -dx, -dy));

/** The shape of a plane of the Hollows: floor in the rooms and rock round them, and water only in the pools, where it cannot be walked. */
function checkShape(map: WorldMap, rooms: readonly Box[], pools: ReadonlyArray<{ x: number; y: number; r: number }>, name: string): void {
  let rock = 0, floor = 0, water = 0;
  for (let y = HOLLOWS_REGION.y0; y <= HOLLOWS_REGION.y1; y++) {
    for (let x = HOLLOWS_REGION.x0; x <= HOLLOWS_REGION.x1; x++) {
      const wet = overlayAt(map, x, y) === OVERLAY_WATER;
      if (inAny(rooms, x, y)) {
        floor++;
        assert.notEqual(underlayAt(map, x, y), UNDERLAY_ROCK, `${name}: room tile ${x},${y} is floor`);
        assert.equal(wet, inPool(pools, x, y), `${name}: ${x},${y} is water exactly where a pool lies`);
        if (wet) {
          water++;
          assert.ok(!open(map, x, y), `${name}: the water at ${x},${y} cannot be walked`);
        }
      } else {
        rock++;
        assert.equal(underlayAt(map, x, y), UNDERLAY_ROCK, `${name}: ${x},${y} outside the rooms is rock`);
        assert.ok(!open(map, x, y) && !wet, `${name}: and blocked, and dry`);
      }
    }
  }
  assert.ok(rock > floor, `${name}: rooms cut in rock, not a cavern (${floor} of floor in ${rock} of rock)`);
  assert.ok(water >= 60, `${name}: black water standing in it (${water} tiles)`);
}

/** Every dry, open tile of every room is reached, room by room. */
function checkReached(map: WorldMap, rooms: Record<string, Box>, pools: ReadonlyArray<{ x: number; y: number; r: number }>, reached: Set<number>): void {
  for (const [name, room] of Object.entries(rooms)) {
    let dry = 0, got = 0;
    for (let y = room.y0; y <= room.y1; y++) {
      for (let x = room.x0; x <= room.x1; x++) {
        if (inPool(pools, x, y) || !open(map, x, y)) continue;
        dry++;
        if (reached.has(key(x, y))) got++;
      }
    }
    assert.ok(dry > 0, `${name} has floor to stand on`);
    assert.equal(got, dry, `${name}: every dry tile is got at from the stair's foot (${got} of ${dry})`);
  }
}

test("the slab at the mound's north edge is off: an open stair down to the drowned lanes, on down to the chapel, and back up both", () => {
  const down = ground.objects.find((o) => o.x === HOLLOWS_STAIR.x && o.y === HOLLOWS_STAIR.y && o.kind === "open_stair");
  assert.ok(down && down.to === HOLLOWS_PLANE && down.side === 2 && down.tag === "fenhollows", "the open stair at the mound's north edge leads down");
  assert.ok(!ground.objects.some((o) => o.kind === "sealed" && o.x === HOLLOWS_STAIR.x && o.y === HOLLOWS_STAIR.y), "and no slab lies over it now");
  assert.ok(inBox(MOURN, HOLLOWS_STAIR.x, HOLLOWS_STAIR.y), "it is in Mourn");
  assert.ok(open(ground, HOLLOWS_STAIR.x, HOLLOWS_STAIR.y), "its own tile can be stood on, so coming up lands on it");
  const up = lanes.objects.find((o) => o.kind === "stairs" && o.x === HOLLOWS_STAIR.x && o.y === HOLLOWS_STAIR.y);
  assert.ok(up && up.to === 0 && inBox(LANES.landing, up.x, up.y), "the stair on the landing leads back up");
  const on = lanes.objects.find((o) => o.kind === "stairs" && o.x === CHAPEL_STAIR.x && o.y === CHAPEL_STAIR.y);
  assert.ok(on && on.to === OLD_CHAPEL_PLANE && inBox(LANES.porch, on.x, on.y), "the old chapel's porch goes on down");
  const back = chapel.objects.find((o) => o.kind === "stairs" && o.x === CHAPEL_STAIR.x && o.y === CHAPEL_STAIR.y);
  assert.ok(back && back.to === HOLLOWS_PLANE && inBox(OLD_CHAPEL.nave, back.x, back.y), "and the nave's stair comes back up to it");
});

/** Clicks the object of this kind at this tile on the player's plane, and steps until they are on `plane`. */
function climb(world: World, p: Player, kind: string, at: { x: number; y: number }, plane: number): void {
  const o = world.mapOf(p.plane).objects.find((q) => q.kind === kind && q.x === at.x && q.y === at.y);
  assert.ok(o, `a ${kind} at ${at.x},${at.y} on plane ${p.plane}`);
  world.interact(p, o.id);
  for (let i = 0; i < 20 && p.plane !== plane; i++) world.step();
  assert.equal(p.plane, plane, `the ${kind} at ${at.x},${at.y} takes the player to plane ${plane}`);
}

test("a player climbs down from Mourn to the lanes, on down into the chapel, and back up the same way", () => {
  const world = new World(stack, () => 0.5);
  const p = world.add("Delver", undefined, { at: { x: HOLLOWS_STAIR.x - 1, y: HOLLOWS_STAIR.y, plane: 0 } });
  climb(world, p, "open_stair", HOLLOWS_STAIR, HOLLOWS_PLANE);
  assert.ok(inBox(LANES.landing, p.x, p.y), `down the stair onto the landing (at ${p.x},${p.y})`);
  world.travel(p, CHAPEL_STAIR.x, CHAPEL_STAIR.y + 1, HOLLOWS_PLANE);
  climb(world, p, "stairs", CHAPEL_STAIR, OLD_CHAPEL_PLANE);
  assert.ok(inBox(OLD_CHAPEL.nave, p.x, p.y), `down from the porch into the nave (at ${p.x},${p.y})`);
  climb(world, p, "stairs", CHAPEL_STAIR, HOLLOWS_PLANE);
  assert.ok(inBox(LANES.porch, p.x, p.y), `back up into the porch (at ${p.x},${p.y})`);
  world.travel(p, HOLLOWS_STAIR.x, HOLLOWS_STAIR.y - 1, HOLLOWS_PLANE);
  climb(world, p, "stairs", HOLLOWS_STAIR, 0);
  assert.ok(Math.abs(p.x - HOLLOWS_STAIR.x) <= 1 && Math.abs(p.y - HOLLOWS_STAIR.y) <= 1, `and up into Mourn by the stair (at ${p.x},${p.y})`);
});

test("the drowned lanes: rooms of floor in rock, black water standing in them, and every dry tile, the well and the way on down got at from the stair's foot", () => {
  checkShape(lanes, LANES_ROOMS, LANES_POOLS, "the lanes");
  const reached = flood(lanes, { x: HOLLOWS_STAIR.x - 1, y: HOLLOWS_STAIR.y - 1 });
  checkReached(lanes, LANES, LANES_POOLS, reached);
  const mine = (kind: string) => lanes.objects.filter((o) => o.kind === kind && inBox(HOLLOWS_REGION, o.x, o.y));
  assert.ok(mine("well").some((o) => o.x === OLD_WELL.x && o.y === OLD_WELL.y && inBox(LANES.square, o.x, o.y)), "old Mourn's well in its square");
  assert.ok(besideReached(lanes, reached, OLD_WELL.x, OLD_WELL.y), "and it can be walked up to");
  assert.ok(besideReached(lanes, reached, CHAPEL_STAIR.x, CHAPEL_STAIR.y), "the way on down can be walked up to");
  const ruins = lanes.objects.filter((o) => o.kind === "stone_wall" && o.tag === "ruin");
  assert.ok(ruins.length >= 30, `the stubs of old Mourn's houses stand (${ruins.length} lengths)`);
  // The houses meet the street through a doorway each, and nowhere else: a wall with its gap in it.
  for (const [house, x, side] of [[LANES.westHouse, LANES.westHouse.x1, 1], [LANES.eastHouse, LANES.eastHouse.x0, 3]] as const) {
    const front = ruins.filter((o) => o.x === x && o.side === side && o.y >= house.y0 && o.y <= house.y1);
    assert.equal(front.length, house.y1 - house.y0, "each house's front stands along the street but for one doorway");
  }
});

test("old Mourn's chapel: every dry tile got at from the stair's foot, the dead in the nave and the crypt, the bell at its pool's edge with the ringer over it, and the chest", () => {
  checkShape(chapel, OLD_CHAPEL_ROOMS, [BELL_POOL], "the chapel");
  const reached = flood(chapel, { x: CHAPEL_STAIR.x, y: CHAPEL_STAIR.y - 1 });
  checkReached(chapel, OLD_CHAPEL, [BELL_POOL], reached);
  const mine = (kind: string) => chapel.objects.filter((o) => o.kind === kind && inBox(HOLLOWS_REGION, o.x, o.y));
  assert.ok(mine("sarcophagus").filter((o) => inBox(OLD_CHAPEL.nave, o.x, o.y)).length >= 8, "old Mourn's dead in stone down the nave");
  assert.ok(mine("grave").filter((o) => inBox(OLD_CHAPEL.crypt, o.x, o.y)).length >= 6, "and in the crypt");
  const bell = mine("bell");
  assert.equal(bell.length, 1, "one bell");
  assert.deepEqual({ x: bell[0]!.x, y: bell[0]!.y }, BELL, "where the card puts it");
  assert.ok(inBox(OLD_CHAPEL.westEnd, BELL.x, BELL.y) && !inPool([BELL_POOL], BELL.x, BELL.y), "in the west end, on the floor");
  assert.ok(ACROSS.some(([dx, dy]) => overlayAt(chapel, BELL.x + dx, BELL.y + dy) === OVERLAY_WATER), "at the water's edge");
  assert.ok(besideReached(chapel, reached, BELL.x, BELL.y), "and it can be walked up to");
  const ringer = chapel.monsters.filter((s) => s.monster === "drowned_ringer");
  assert.equal(ringer.length, 1, "one ringer");
  assert.ok(Math.hypot(ringer[0]!.x - BELL.x, ringer[0]!.y - BELL.y) <= 3, "standing over the bell");
  const chest = mine("chest");
  assert.ok(chest.length === 1 && chest[0]!.tag === "fenhollows" && chest[0]!.x === HOLLOWS_CHEST.x && chest[0]!.y === HOLLOWS_CHEST.y, "the chest behind him");
  assert.ok(besideReached(chapel, reached, HOLLOWS_CHEST.x, HOLLOWS_CHEST.y), "got at round the pool");
  assert.equal(CHESTS["fenhollows"]!.loot.reduce((n, d) => n + d.weight, 0), 128, "and its table never comes up empty");
  // The west end is got at through the breach in the nave's old west wall, and not round it.
  const westWall = chapel.objects.filter((o) => o.kind === "stone_wall" && o.tag === "ruin" && o.x === OLD_CHAPEL.nave.x0 && o.side === 3);
  const span = OLD_CHAPEL.nave.y1 - OLD_CHAPEL.nave.y0 + 1;
  assert.ok(westWall.length >= span / 2 && westWall.length <= span - 6, `the old west wall stands, with a breach of ${span - westWall.length} in it`);
});

test("who keeps the Hollows: every one on dry floor where the card puts them, in the band, and the Hollows' three live nowhere else", () => {
  for (const [monster, plane, x, y] of HOLLOWS_DWELLERS) {
    const map = plane === HOLLOWS_PLANE ? lanes : chapel;
    const rooms = plane === HOLLOWS_PLANE ? LANES_ROOMS : OLD_CHAPEL_ROOMS;
    assert.ok(inAny(rooms, x, y) && open(map, x, y) && overlayAt(map, x, y) !== OVERLAY_WATER, `${monster} at ${x},${y} on plane ${plane} stands on dry floor`);
    assert.ok(map.monsters.some((s) => s.monster === monster && s.x === x && s.y === y), "and is spawned there");
    const level = levelOf(MONSTER_BY_KEY.get(monster)!);
    assert.ok(level >= 50 && level <= 70, `${monster} (level ${level}) is inside the band`);
  }
  for (const monster of NEW_CREATURES) {
    let here = 0;
    for (const [plane, map] of stack.planes) {
      for (const s of map.monsters) {
        if (s.monster !== monster) continue;
        assert.ok(plane < 0 && inBox(HOLLOWS_REGION, s.x, s.y), `${monster} lives only in the Hollows (one at ${s.x},${s.y} on plane ${plane})`);
        here++;
      }
    }
    assert.ok(here > 0, `${monster} lives in the Hollows`);
  }
  assert.equal(areaAt(3873, 3549, HOLLOWS_PLANE).key, "fenhollows", "the lanes are the Hollows");
  assert.equal(areaAt(3872, 3530, OLD_CHAPEL_PLANE).key, "fenhollows", "and so is the chapel");
  assert.equal(areaAt(3873, 3549, 0).key, "mourn", "the control: above them is Mourn");
});

/** The person's first tile beside them, the talk opened, and the box it shows. */
function talkTo(world: World, p: Player, who: string) {
  const n = [...world.npcs.values()].find((c) => c.def.key === who);
  assert.ok(n, `${who} is in the world`);
  const at = ACROSS.map(([dx, dy]) => ({ x: n.x + dx, y: n.y + dy, dx, dy })).find((t) => open(world.map, t.x, t.y) && !world.map.collision.wallBetween(n.x, n.y, t.dx, t.dy))!;
  world.travel(p, at.x, at.y, n.plane);
  world.talk(p, n.id);
  for (let i = 0; i < 20 && p.screen?.kind !== "talk"; i++) world.step();
  const box = world.dialogueFor(p);
  assert.ok(box, `talking to ${n.def.name} opens a box`);
  return box;
}

test("after the quest the reeve says where the stair goes and what is ringing, and Mourn's people know the slab has moved", () => {
  const world = new World(stack, () => 0.5);
  const p = world.add("Asker", undefined, { at: { x: 3872, y: 3552, plane: 0 }, quests: { [MOURN_QUEST]: 8 } });
  let box = talkTo(world, p, "mourn_reeve");
  const ask = box.options.indexOf("The slab's off the stair behind the bank.");
  assert.ok(ask >= 0, `the reeve can be asked about the slab (offered: ${box.options.join(" | ")})`);
  world.answer(p, ask);
  box = world.dialogueFor(p)!;
  assert.ok(box.lines.some((l) => l.includes("shoved from underneath")) && box.lines.some((l) => l.includes("ringing it")), "he says it was moved from below, and what is ringing");
  const q = world.add("Passer", undefined, { at: { x: 3872, y: 3552, plane: 0 }, quests: { [MOURN_QUEST]: 5 } });
  box = talkTo(world, q, "mournfolk");
  assert.ok(box.options.includes("What's under the slab behind the bank?"), "Mournfolk can be asked before the quest is done");
});

/** ⛔ The control: built after everything else, so the world without it is the same world everywhere but under Mourn, and the stair is the same object, sealed. */
test("a world built without the Hollows is the same world everywhere else, with the slab back over the stair under the same id", () => {
  const without = buildOakridge(OAKRIDGE_SEED, { fenhollows: false });
  const alone = without.planes.get(0)!;
  const stair = ground.objects.find((o) => o.x === HOLLOWS_STAIR.x && o.y === HOLLOWS_STAIR.y && o.kind === "open_stair")!;
  const slab = alone.objects.find((o) => o.x === HOLLOWS_STAIR.x && o.y === HOLLOWS_STAIR.y && o.kind === "sealed")!;
  assert.ok(slab && slab.tag === "fenhollows", "the slab lies over it without the Hollows");
  assert.equal(slab.id, stair.id, "as the same object");
  const sig = (o: { id: number; kind: string; x: number; y: number; side: number; tag?: string; variant: number }) =>
    `${o.id}:${o.kind}:${o.x},${o.y}:${o.side}:${o.tag ?? ""}:${o.variant}`;
  assert.equal(
    ground.objects.filter((o) => o.id !== stair.id).map(sig).join("|"), alone.objects.filter((o) => o.id !== stair.id).map(sig).join("|"),
    "every other object on the ground is the same, with the same id and the same turn",
  );
  for (const r of builtRegions(alone)) {
    const both = ground.regions.get(regionId(r.rx, r.ry))!;
    for (const field of ["heights", "underlay", "overlay", "indoors", "roofs"] as const) assert.deepEqual([...both[field]], [...r[field]], `region ${r.rx},${r.ry}: ${field} unchanged`);
  }
  assert.deepEqual(alone.monsters, ground.monsters, "the same creatures above ground");
  for (const [plane, before] of without.planes) {
    if (plane === 0) continue;
    const after = stack.planes.get(plane)!;
    const theirs = (m: WorldMap) => m.objects.filter((o) => !inBox(HOLLOWS_REGION, o.x, o.y)).map(sig).join("|");
    assert.equal(theirs(after), theirs(before), `plane ${plane}: every other site's objects are the same, ids and all`);
    const others = (m: WorldMap) => m.monsters.filter((s) => !inBox(HOLLOWS_REGION, s.x, s.y));
    assert.deepEqual(others(after), others(before), `plane ${plane}: and so are its creatures`);
  }
  const under = regionId(Math.floor(HOLLOWS_STAIR.x / 64), Math.floor(HOLLOWS_STAIR.y / 64));
  for (const plane of [HOLLOWS_PLANE, OLD_CHAPEL_PLANE]) {
    assert.ok(stack.planes.get(plane)?.regions.get(under)?.built === true, `plane ${plane}: Mourn's region is built with the Hollows`);
    assert.ok(without.planes.get(plane)?.regions.get(under)?.built !== true, `plane ${plane}: and not without them (the control)`);
  }
});
