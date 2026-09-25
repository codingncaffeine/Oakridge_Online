// Ashbarrow Deep (PLAN §8.5, opened in Wave 3): the barrow's sealed stair is open, down to the crypt on
// plane −1 and back; the rooms are floor and everything else rock; the tomb's chest can be reached down
// the hall; the dead, the graves and the warden's equal are where the card puts them; the area below
// the barrow has its own name; and a world built without it is the same world everywhere else, the slab
// back over the stair under the same id.
import assert from "node:assert/strict";
import { test } from "node:test";
import { DEEP_CHEST, DEEP_DEAD, DEEP_PLANE, DEEP_REGION, DEEP_ROOMS, DEEP_STAIR } from "../src/shared/ashbarrow.ts";
import { CHESTS } from "../src/shared/chests.ts";
import { HOLLOWS_REGION } from "../src/shared/fenhollows.ts";
import { BLOCKED } from "../src/shared/collision.ts";
import { builtRegions, regionId, UNDERLAY_ROCK, underlayAt, type WorldMap } from "../src/shared/map.ts";
import { levelOf, MONSTER_BY_KEY } from "../src/shared/monsters.ts";
import { areaAt, buildOakridge, OAKRIDGE_SEED, SITES } from "../src/shared/oakridge.ts";
import { findPathBeside } from "../src/shared/pathfind.ts";
import { inBox } from "../src/shared/worldgen.ts";

const stack = buildOakridge(OAKRIDGE_SEED);
const ground = stack.planes.get(0)!;
const below = stack.planes.get(DEEP_PLANE)!;
const open = (map: WorldMap, x: number, y: number) => (map.collision.get(x, y) & BLOCKED) === 0;
const inRoom = (x: number, y: number) => DEEP_ROOMS.some((r) => inBox(r, x, y));

test("the stair on the mound's top is open, leads down, and the one below leads back up", () => {
  const down = ground.objects.find((o) => o.x === DEEP_STAIR.x && o.y === DEEP_STAIR.y && o.kind === "open_stair");
  assert.ok(down && down.to === DEEP_PLANE && down.side === 2, "the open stair on the mound's top leads down");
  assert.ok(!ground.objects.some((o) => o.kind === "sealed" && o.x === DEEP_STAIR.x && o.y === DEEP_STAIR.y), "and no sealed slab lies on the barrow now (the Dunes' tombs are sealed on purpose)");
  assert.ok(inBox(SITES["ashbarrow"]!, DEEP_STAIR.x, DEEP_STAIR.y), "it is in the barrow");
  const up = below.objects.find((o) => o.kind === "stairs" && o.x === DEEP_STAIR.x && o.y === DEEP_STAIR.y);
  assert.ok(up && up.to === 0, "the one below leads back up");
  assert.ok(open(ground, DEEP_STAIR.x, DEEP_STAIR.y), "and the stair's own tile can be stood on, so coming up lands on it");
});

test("the crypt: rooms of floor in a region of rock, the tomb's chest reachable down the hall, and the card's contents", () => {
  let rock = 0, floor = 0;
  for (let y = DEEP_REGION.y0; y <= DEEP_REGION.y1; y++) {
    for (let x = DEEP_REGION.x0; x <= DEEP_REGION.x1; x++) {
      if (inRoom(x, y)) {
        floor++;
        assert.notEqual(underlayAt(below, x, y), UNDERLAY_ROCK, `room tile ${x},${y} is floor`);
      } else {
        rock++;
        assert.equal(underlayAt(below, x, y), UNDERLAY_ROCK, `tile ${x},${y} outside the rooms is rock`);
        assert.ok(!open(below, x, y), "and blocked");
      }
    }
  }
  assert.ok(rock > floor * 4, `one plane of crypt, not a cavern: ${floor} tiles of room in ${rock} of rock`);
  const start = { x: DEEP_STAIR.x + 1, y: DEEP_STAIR.y };
  assert.ok(open(below, start.x, start.y), "there is somewhere to stand at the foot of the stair");
  const toChest = findPathBeside(below.collision, start.x, start.y, DEEP_CHEST);
  assert.ok(toChest.length > 0, "the tomb's chest can be reached");
  assert.ok(toChest.some((t) => inBox(DEEP_ROOMS[1]!, t.x, t.y)), "and the way goes down the hall");
  const mine = (kind: string) => below.objects.filter((o) => o.kind === kind && inBox(DEEP_REGION, o.x, o.y));
  assert.ok(mine("sarcophagus").length >= 8, "the dead are laid along the hall and in the tomb");
  assert.ok(mine("grave").length >= 4, "and buried in the niches");
  const chest = mine("chest")[0];
  assert.ok(chest && chest.tag === "ashbarrow" && chest.x === DEEP_CHEST.x && chest.y === DEEP_CHEST.y, "the chest at the tomb's end");
  assert.equal(CHESTS["ashbarrow"]!.loot.reduce((n, d) => n + d.weight, 0), 128, "whose table never comes up empty");
  // Who keeps it: the barrow's own dead, in the band (§8.5: 20–45), on open floor, and the warden's equal in the tomb.
  for (const [monster, x, y] of DEEP_DEAD) {
    assert.ok(inRoom(x, y) && open(below, x, y), `${monster} at ${x},${y} stands on open floor`);
    assert.ok(below.monsters.some((s) => s.monster === monster && s.x === x && s.y === y), "and is spawned there");
    assert.ok(levelOf(MONSTER_BY_KEY.get(monster)!) <= 45, `${monster} is inside the band`);
  }
  assert.ok(below.monsters.some((s) => s.monster === "barrow_warden" && inBox(DEEP_ROOMS[4]!, s.x, s.y)), "the warden's equal keeps the tomb");
  assert.equal(areaAt(3171, 3150, DEEP_PLANE).key, "ashbarrowdeep", "below the barrow is the Deep");
  assert.equal(areaAt(3171, 3150, 0).key, "ashbarrow", "the control: above it is the barrow");
});

/** ⛔ The control: built last and rolling nothing, so the world without it is the same world everywhere but under the barrow, and the stair is the same object, sealed. */
test("a world built without the Deep is the same world everywhere else, with the stair sealed under the same id", () => {
  const without = buildOakridge(OAKRIDGE_SEED, { ashbarrow: false });
  const alone = without.planes.get(0)!;
  const stair = ground.objects.find((o) => o.x === DEEP_STAIR.x && o.y === DEEP_STAIR.y && o.kind === "open_stair")!;
  const slab = alone.objects.find((o) => o.x === DEEP_STAIR.x && o.y === DEEP_STAIR.y && o.kind === "sealed")!;
  assert.ok(slab, "the slab lies over it without the Deep");
  assert.equal(slab.id, stair.id, "as the same object");
  const key = (o: { id: number; kind: string; x: number; y: number; side: number; tag?: string }) => `${o.id}:${o.kind}:${o.x},${o.y}:${o.side}:${o.tag ?? ""}`;
  assert.equal(
    ground.objects.filter((o) => o.id !== stair.id).map(key).join("|"), alone.objects.filter((o) => o.id !== stair.id).map(key).join("|"),
    "every other object on the ground is the same, with the same id",
  );
  for (const r of builtRegions(alone)) {
    const both = ground.regions.get(regionId(r.rx, r.ry))!;
    for (const field of ["heights", "underlay", "overlay", "indoors", "roofs"] as const) assert.deepEqual([...both[field]], [...r[field]], `region ${r.rx},${r.ry}: ${field} unchanged`);
  }
  assert.deepEqual(alone.monsters, ground.monsters, "the same creatures above ground");
  for (const [plane, before] of without.planes) {
    if (plane === 0) continue;
    const after = stack.planes.get(plane)!;
    // (The Fen Hollows are built after the Deep, so their things take other ids without it: their own test holds them.)
    const theirs = (m: WorldMap) => m.objects.filter((o) => !inBox(DEEP_REGION, o.x, o.y) && !inBox(HOLLOWS_REGION, o.x, o.y)).map(key).join("|");
    assert.equal(theirs(after), theirs(before), `plane ${plane}: every other site's objects are the same`);
  }
  const under = regionId(Math.floor(DEEP_STAIR.x / 64), Math.floor(DEEP_STAIR.y / 64));
  assert.ok(below.regions.get(under)?.built === true && without.planes.get(DEEP_PLANE)?.regions.get(under)?.built !== true, "the control: the crypt's region is built only with the Deep");
});
