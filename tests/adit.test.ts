// The Copperfoot Adit (PLAN §8.5, opened in Wave 2): the quarry's barred mouth is a stair now, down to
// the workings on plane −1 and back; the rooms are floor and everything else rock; the chest at the end
// can be reached through the passage; the seams, the bats, the rats and the brute are where the card
// puts them; the area below the quarry has its own name; and a world built without it is the same world
// everywhere else, the mouth barred again under the same id.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ADIT_CHEST, ADIT_MOUTH, ADIT_PLANE, ADIT_REGION, ADIT_ROOMS, ADIT_SEAMS } from "../src/shared/adit.ts";
import { DEEP_REGION } from "../src/shared/ashbarrow.ts";
import { HOLLOWS_REGION } from "../src/shared/fenhollows.ts";
import { CHESTS } from "../src/shared/chests.ts";
import { BLOCKED } from "../src/shared/collision.ts";
import { builtRegions, regionId, UNDERLAY_ROCK, underlayAt, type WorldMap } from "../src/shared/map.ts";
import { areaAt, buildOakridge, OAKRIDGE_SEED, SITES } from "../src/shared/oakridge.ts";
import { findPathBeside } from "../src/shared/pathfind.ts";
import { RESOURCES } from "../src/shared/gathering.ts";
import { inBox } from "../src/shared/worldgen.ts";

const stack = buildOakridge(OAKRIDGE_SEED);
const ground = stack.planes.get(0)!;
const below = stack.planes.get(ADIT_PLANE)!;
const open = (map: WorldMap, x: number, y: number) => (map.collision.get(x, y) & BLOCKED) === 0;
const inRoom = (x: number, y: number) => ADIT_ROOMS.some((r) => inBox(r, x, y));

test("the mouth is a stair down where the bars were, and the one below leads back up", () => {
  const down = ground.objects.find((o) => o.x === ADIT_MOUTH.x && o.y === ADIT_MOUTH.y && o.kind !== "signpost");
  assert.ok(down && down.kind === "adit" && down.to === ADIT_PLANE && down.side === 1, "the open mouth in the quarry's east wall leads down");
  assert.ok(!ground.objects.some((o) => o.kind === "barred"), "and no barred mouth stands anywhere now");
  const up = below.objects.find((o) => o.kind === "stairs" && o.x === ADIT_MOUTH.x && o.y === ADIT_MOUTH.y);
  assert.ok(up && up.to === 0, "the one below leads back up");
  assert.ok(ground.objects.some((o) => o.kind === "signpost" && Math.abs(o.x - ADIT_MOUTH.x) <= 2 && o.y === ADIT_MOUTH.y), "the signpost still stands beside it");
  assert.ok(inBox(SITES["quarry"]!, ADIT_MOUTH.x, ADIT_MOUTH.y), "the mouth is in the quarry");
});

test("the workings: rooms of floor in a region of rock, the chest reachable through the passage, and the card's contents", () => {
  let rock = 0, floor = 0;
  for (let y = ADIT_REGION.y0; y <= ADIT_REGION.y1; y++) {
    for (let x = ADIT_REGION.x0; x <= ADIT_REGION.x1; x++) {
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
  assert.ok(rock > floor * 4, `one plane of workings, not a cavern: ${floor} tiles of room in ${rock} of rock`);
  assert.equal(builtRegions(below).filter((r) => inBox(ADIT_REGION, r.x0, r.y0)).length, 1, "one region below the quarry");
  const start = { x: ADIT_MOUTH.x - 1, y: ADIT_MOUTH.y };
  assert.ok(open(below, start.x, start.y), "there is somewhere to stand at the foot of the stair");
  const toChest = findPathBeside(below.collision, start.x, start.y, ADIT_CHEST);
  assert.ok(toChest.length > 0, "the chest can be reached");
  const [, , passage] = ADIT_ROOMS;
  assert.ok(toChest.some((t) => inBox(passage, t.x, t.y)), "and the way goes through the crooked passage");
  const walls = below.objects.filter((o) => o.kind === "stone_wall" && o.tag === "cave" && inBox(ADIT_REGION, o.x, o.y));
  assert.ok(walls.length >= 100, `the rooms are walled (${walls.length} lengths)`);
  assert.ok(!walls.some((o) => o.x === ADIT_ROOMS[1].x0 && o.y === passage.y0 + 1 && o.side === 3), "the passage is open into the first chamber");
  assert.ok(walls.some((o) => o.x === ADIT_ROOMS[1].x0 && o.y === ADIT_ROOMS[1].y0 && o.side === 3), "the control: the chamber's west wall stands elsewhere");
  // The seams: seven, at Mining 22, where the site says.
  // (The plane holds the Hollow's and the sewers' rooms too: only what is under the quarry is the Adit's.)
  const seams = below.objects.filter((o) => o.kind === "coal_rock" && inBox(ADIT_REGION, o.x, o.y));
  assert.equal(seams.length, ADIT_SEAMS.length, "seven seams of coal");
  for (const s of seams) assert.ok(ADIT_SEAMS.some((at) => at.x === s.x && at.y === s.y) && inRoom(s.x, s.y), `the seam at ${s.x},${s.y} is on a room's floor where it was written`);
  assert.ok(RESOURCES["coal_rock"], "coal is a resource the ladder knows (its level is PLAN §8.3's, held by the gathering tests)");
  // Bats, rats and the brute, every one on the floor.
  const kinds = new Map<string, number>();
  for (const s of below.monsters) {
    if (!inBox(ADIT_REGION, s.x, s.y)) continue;
    kinds.set(s.monster, (kinds.get(s.monster) ?? 0) + 1);
    assert.ok(inRoom(s.x, s.y), `${s.monster} at ${s.x},${s.y} stands on a room's floor`);
    assert.ok(open(below, s.x, s.y) || below.objects.some((o) => o.x === s.x && o.y === s.y), "and can be stood on");
  }
  assert.ok((kinds.get("cave_bat") ?? 0) >= 6, `bats (${kinds.get("cave_bat")})`);
  assert.ok((kinds.get("giant_rat") ?? 0) >= 3, `rats (${kinds.get("giant_rat")})`);
  assert.equal(kinds.get("quarry_brute"), 1, "and the brute at the chest");
  const chest = below.objects.find((o) => o.kind === "chest" && inBox(ADIT_REGION, o.x, o.y));
  assert.ok(chest && chest.x === ADIT_CHEST.x && chest.y === ADIT_CHEST.y && chest.tag === "adit", "the chest at the far end");
  assert.equal(CHESTS["adit"]!.loot.reduce((n, d) => n + d.weight, 0), 128, "whose table never comes up empty");
  assert.ok(CHESTS["adit"]!.loot.some((d) => d.item === "coal"), "and gives coal among other things");
  assert.equal(areaAt(3300, 3296, ADIT_PLANE).key, "adit", "below the quarry is the Adit");
  assert.equal(areaAt(3300, 3296, 0).key, "quarry", "the control: above it is the quarry");
});

/**
 * ⛔ The control. The Adit is built last and rolls nothing, so a world built without it is the same
 * world everywhere but under the quarry — every region on every plane, every object with the same id,
 * every creature, every item — and the mouth is the same object, barred instead of a stair.
 */
test("a world built without the Adit is the same world everywhere else, with the mouth barred under the same id", () => {
  const without = buildOakridge(OAKRIDGE_SEED, { adit: false });
  const alone = without.planes.get(0)!;
  const mouth = ground.objects.find((o) => o.x === ADIT_MOUTH.x && o.y === ADIT_MOUTH.y && o.kind === "adit")!;
  const barred = alone.objects.find((o) => o.x === ADIT_MOUTH.x && o.y === ADIT_MOUTH.y && o.kind !== "signpost")!;
  assert.equal(barred.kind, "barred", "the bars stand without it");
  assert.equal(barred.id, mouth.id, "as the same object");
  assert.equal(alone.objects.length, ground.objects.length, "the ground plane holds the same number of things");
  const key = (o: { id: number; kind: string; x: number; y: number; side: number; tag?: string }) => `${o.id}:${o.kind}:${o.x},${o.y}:${o.side}:${o.tag ?? ""}`;
  assert.equal(
    ground.objects.filter((o) => o.id !== mouth.id).map(key).join("|"), alone.objects.filter((o) => o.id !== mouth.id).map(key).join("|"),
    "and every other object is the same, with the same id",
  );
  for (const r of builtRegions(alone)) {
    const both = ground.regions.get(regionId(r.rx, r.ry))!;
    for (const field of ["heights", "underlay", "overlay", "indoors", "roofs"] as const) assert.deepEqual([...both[field]], [...r[field]], `region ${r.rx},${r.ry}: ${field} unchanged`);
  }
  assert.deepEqual(alone.monsters, ground.monsters, "the same creatures above ground");
  assert.deepEqual(alone.spawns, ground.spawns, "and the same things lying about");
  for (const [plane, before] of without.planes) {
    if (plane === 0) continue;
    const after = stack.planes.get(plane)!;
    // (Ashbarrow Deep and the Fen Hollows are built after the Adit, so their things take other ids without it: their own tests hold them.)
    const later = (o: { x: number; y: number }) => inBox(DEEP_REGION, o.x, o.y) || inBox(HOLLOWS_REGION, o.x, o.y);
    const theirs = (m: WorldMap) => m.objects.filter((o) => !inBox(ADIT_REGION, o.x, o.y) && !later(o)).map(key).join("|");
    assert.equal(theirs(after), theirs(before), `plane ${plane}: every other site's objects are the same`);
    assert.deepEqual(after.monsters.filter((s) => !inBox(ADIT_REGION, s.x, s.y)), before.monsters.filter((s) => !inBox(ADIT_REGION, s.x, s.y)), `plane ${plane}: and their creatures`);
  }
  // The control's control: the region under the quarry is built only with the Adit.
  const belowWithout = without.planes.get(ADIT_PLANE);
  const under = regionId(Math.floor(ADIT_MOUTH.x / 64), Math.floor(ADIT_MOUTH.y / 64));
  assert.ok(below.regions.get(under)?.built === true, "the region under the quarry is built with the Adit");
  assert.ok(belowWithout?.regions.get(under)?.built !== true, "and not without it");
  assert.ok(below.objects.length > (belowWithout?.objects.length ?? 0) + 100, "which is where the workings are");
});
