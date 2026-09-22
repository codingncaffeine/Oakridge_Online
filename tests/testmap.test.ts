import assert from "node:assert/strict";
import { test } from "node:test";
import { BLOCKED } from "../src/shared/collision.ts";
import { OVERLAY_WATER } from "../src/shared/map.ts";
import { findPath } from "../src/shared/pathfind.ts";
import { buildTestMap, TEST_MAP_SEED } from "../src/shared/testmap.ts";

const map = buildTestMap(TEST_MAP_SEED);

test("the same seed builds the same map", () => {
  const again = buildTestMap(TEST_MAP_SEED);
  assert.deepEqual(again.heights, map.heights);
  assert.deepEqual(again.collision.flags, map.collision.flags);
  assert.deepEqual(again.objects, map.objects);
});

test("the map has its features", () => {
  const count = (kind: string) => map.objects.filter((o) => o.kind === kind).length;
  assert.ok(count("tree") + count("oak") > 60, `trees: ${count("tree") + count("oak")}`);
  assert.ok(count("oak") > 15, `oaks: ${count("oak")}`);
  assert.ok(count("rock") >= 10, `rocks: ${count("rock")}`);
  assert.ok(count("fence") > 20 && count("wall") > 20);
  const water = map.overlay.filter((o) => o === OVERLAY_WATER).length;
  assert.ok(water > 80, `water tiles: ${water}`);
  for (let i = 0; i < map.overlay.length; i++) {
    if (map.overlay[i] === OVERLAY_WATER) assert.ok(map.collision.flags[i]! & BLOCKED, "water blocks");
  }
});

test("spawn is open and the pen is only reachable through its gate", () => {
  assert.equal(map.collision.get(map.spawn.x, map.spawn.y) & BLOCKED, 0);
  const intoPen = findPath(map.collision, map.spawn.x, map.spawn.y, 39, 38);
  assert.deepEqual(intoPen.at(-1), { x: 39, y: 38 });
  assert.ok(intoPen.some((t) => t.x === 39 && t.y === 35), "enters through the south gate");
});

test("the ruin is entered through one of its gaps", () => {
  const inside = findPath(map.collision, map.spawn.x, map.spawn.y, 15, 45);
  assert.deepEqual(inside.at(-1), { x: 15, y: 45 });
  const gaps = [[15, 41], [13, 49], [14, 49], [11, 45]];
  assert.ok(inside.some((t) => gaps.some(([x, y]) => t.x === x && t.y === y)), "passes a gap tile");
});

test("item spawns lie on open tiles the player can walk to", () => {
  assert.ok(map.spawns.length >= 7, `spawns placed: ${map.spawns.length}`);
  for (const s of map.spawns) {
    const path = findPath(map.collision, map.spawn.x, map.spawn.y, s.x, s.y);
    const end = path.at(-1) ?? map.spawn;
    assert.deepEqual([end.x, end.y], [s.x, s.y], `${s.item} at ${s.x},${s.y} is reachable`);
  }
});
