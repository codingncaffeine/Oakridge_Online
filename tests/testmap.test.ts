import assert from "node:assert/strict";
import { test } from "node:test";
import { BLOCKED } from "../src/shared/collision.ts";
import { TOOLS } from "../src/shared/gathering.ts";
import { OVERLAY_WATER } from "../src/shared/map.ts";
import { findPath, findPathTo, reaches } from "../src/shared/pathfind.ts";
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
  assert.deepEqual([count("copper_rock"), count("tin_rock"), count("iron_rock")], [4, 4, 3], "ore in the outcrop's rocks");
  assert.ok(count("rock") >= 3, `plain rocks: ${count("rock")}`);
  assert.ok(map.objects.every((o, i) => o.id === i), "an object's id is its place in the list");
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

test("fishing tiles are water, each beside a bank the player can walk to", () => {
  const water = map.fishing[0]!;
  assert.equal(water.tiles.length, 8);
  assert.equal(water.count, 2);
  for (const t of water.tiles) {
    const spot = { x: t.x, y: t.y, w: 1, h: 1 };
    assert.equal(map.overlay[t.y * map.width + t.x], OVERLAY_WATER, `${t.x},${t.y} is water`);
    const end = findPathTo(map.collision, map.spawn.x, map.spawn.y, spot).at(-1) ?? map.spawn;
    assert.ok(reaches(map.collision, end.x, end.y, spot), `the spot at ${t.x},${t.y} can be fished from ${end.x},${end.y}`);
  }
});

/**
 * A player who loses their tools has no shop to buy from and no smithy to make one until Phase 7, so
 * the map has to keep a beginner's tool for every kind of gathering — and one they are allowed to use.
 * With only the better tools lying about, losing a bronze axe ended woodcutting for that character:
 * every axe on the map wanted a level they did not have.
 */
test("the map offers a tool a beginner may use, for every kind of gathering", () => {
  for (const [kind, tiers] of Object.entries(TOOLS)) {
    const starter = tiers[0]!;
    assert.equal(starter.level, 1, `the humblest ${kind} is for level 1`);
    const spawn = map.spawns.find((s) => s.item === starter.item);
    assert.ok(spawn, `${starter.item} lies somewhere on the map`);
    // Near enough to walk to without knowing the map: a net belongs by its water, not by the start.
    const away = Math.max(Math.abs(spawn.x - map.spawn.x), Math.abs(spawn.y - map.spawn.y));
    assert.ok(away <= 20, `and on the near half of the map (${away} tiles off)`);
    const end = findPath(map.collision, map.spawn.x, map.spawn.y, spawn.x, spawn.y).at(-1) ?? map.spawn;
    assert.deepEqual([end.x, end.y], [spawn.x, spawn.y], `and can be walked to`);
  }
});

test("item spawns lie on open tiles the player can walk to", () => {
  for (const key of ["iron_axe", "iron_pickaxe", "steel_axe", "steel_pickaxe"]) assert.ok(map.spawns.some((s) => s.item === key), `${key} is placed`);
  assert.ok(map.spawns.length >= 7, `spawns placed: ${map.spawns.length}`);
  for (const s of map.spawns) {
    const path = findPath(map.collision, map.spawn.x, map.spawn.y, s.x, s.y);
    const end = path.at(-1) ?? map.spawn;
    assert.deepEqual([end.x, end.y], [s.x, s.y], `${s.item} at ${s.x},${s.y} is reachable`);
  }
});
