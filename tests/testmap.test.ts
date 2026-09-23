import assert from "node:assert/strict";
import { test } from "node:test";
import { BLOCKED } from "../src/shared/collision.ts";
import {
  CATCHES, METHODS, RESOURCES, TOOLS, type MethodName, type ToolKind,
} from "../src/shared/gathering.ts";
import { OVERLAY_WATER, TREE_KINDS, type ObjectKind } from "../src/shared/map.ts";
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

/**
 * §8.1's rule, held on the map rather than only in the plan: the better the resource, the longer the
 * walk to it. Trees are checked rung by rung — each grove is further out than the one below it — and
 * the ores in bands, because the five past coal share one face in the far corner and their order
 * inside it is by how deep in the face they sit, not by how far from the start.
 */
test("every rung of every ladder stands somewhere, and the better ones are the longer walk", () => {
  const walks = (kind: ObjectKind) =>
    map.objects.filter((o) => o.kind === kind).map((o) => Math.hypot(o.x - map.spawn.x, o.y - map.spawn.y));
  const mean = (kind: ObjectKind) => {
    const all = walks(kind);
    assert.ok(all.length > 0, `nothing on the map is a ${kind}`);
    return all.reduce((a, b) => a + b, 0) / all.length;
  };

  // The six groves past oak are graded among themselves, and the best tree is the longest walk to any
  // tree. The plain tree and the oak are not part of that order: both are scattered through the whole
  // wood, so their averages sit on top of each other. On the real map §8.1 separates them by district,
  // which a 64-tile square has no room for.
  const groves = TREE_KINDS.slice(2);
  groves.forEach((kind, i) => {
    if (i === 0) return;
    const below = groves[i - 1]!;
    assert.ok(mean(kind) > mean(below), `${kind} is ${mean(kind).toFixed(1)} out, no further than ${below} at ${mean(below).toFixed(1)}`);
  });
  const best = TREE_KINDS.at(-1)!;
  for (const kind of TREE_KINDS) {
    if (kind !== best) assert.ok(mean(best) > mean(kind), `${best} is no longer a walk than ${kind}`);
  }
  assert.ok(mean("tree") > 0 && mean("oak") > 0, "the starter wood is still there");

  // Copper up to coal is the beginner's outcrop; silver up to starfall is the far face. Every rock of
  // the second band is a longer walk than every rock of the first.
  const near = ["copper_rock", "tin_rock", "iron_rock", "coal_rock"] as const;
  const far = ["silver_rock", "coldiron_rock", "gold_rock", "emberite_rock", "starfall_rock"] as const;
  for (const kind of [...near, ...far]) assert.ok(walks(kind).length > 0, `nothing on the map is a ${kind}`);
  const nearest = Math.min(...far.flatMap(walks)), furthest = Math.max(...near.flatMap(walks));
  assert.ok(nearest > furthest, `the far face starts at ${nearest.toFixed(1)}, but the outcrop reaches ${furthest.toFixed(1)}`);

  // One water for each way of fishing, and they are found in that order walking outward.
  assert.deepEqual(map.fishing.map((w) => w.method), ["net", "angle", "trap", "harpoon"]);
  const toWater = map.fishing.map((w) => Math.min(...w.tiles.map((t) => Math.hypot(t.x - map.spawn.x, t.y - map.spawn.y))));
  toWater.forEach((d, i) => assert.ok(i === 0 || d > toWater[i - 1]!, `${map.fishing[i]!.method} water is ${d.toFixed(1)} out, no further than the one before`));
});

test("every item the map means to leave lying about is actually there", () => {
  // A tile named in the list can have grown a tree since: the map moves the item aside rather than
  // dropping it, which is what used to happen to the fishing rod, silently.
  const wanted = [
    "coins", "bread", "logs", "leather_cap", "bronze_dagger", "raw_sardine", "copper_ore", "leather_boots", "red_cape",
    "bronze_axe", "bronze_pickaxe", "fishing_net", "iron_axe", "iron_pickaxe", "steel_axe", "steel_pickaxe",
    "fishing_rod", "bait", "creel", "harpoon",
  ];
  assert.deepEqual(map.spawns.map((s) => s.item), wanted, "every listed item, in the order it is listed");
  for (const s of map.spawns) assert.equal(map.collision.get(s.x, s.y) & BLOCKED, 0, `${s.item} lies on open ground`);
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
  assert.deepEqual([map.fishing[0]!.tiles.length, map.fishing[0]!.count], [8, 2], "the pond a beginner finds");
  for (const water of map.fishing) {
    assert.ok(water.tiles.length >= water.count, `${water.method}: ${water.count} spots need at least that many tiles`);
    for (const t of water.tiles) {
      const spot = { x: t.x, y: t.y, w: 1, h: 1 };
      assert.equal(map.overlay[t.y * map.width + t.x], OVERLAY_WATER, `${t.x},${t.y} is water`);
      const end = findPathTo(map.collision, map.spawn.x, map.spawn.y, spot).at(-1) ?? map.spawn;
      assert.ok(reaches(map.collision, end.x, end.y, spot), `the ${water.method} spot at ${t.x},${t.y} can be fished from ${end.x},${end.y}`);
    }
    // A spot only ever moves within its own water, so nothing can drift between two kinds of fishing.
    const shared = map.fishing.filter((o) => o !== water).flatMap((o) => o.tiles).filter((o) => water.tiles.some((t) => t.x === o.x && t.y === o.y));
    assert.deepEqual(shared, [], `${water.method} shares no tile with another water`);
  }
});

/**
 * A player who loses their tools has no shop to buy from and no smithy to make one until Phase 7, so
 * the map has to keep a tool for every kind of gathering it offers — one they may use at the level that
 * gathering itself starts at. With only the better tools lying about, losing a bronze axe ended
 * woodcutting for that character: every axe on the map wanted a level they did not have.
 *
 * It asks what the map offers rather than what tools exist, so water or rock put here later brings its
 * own tool into the check, and a harpoon — no part of a beginner's kit — is not asked for.
 */
test("the map offers a tool that can be used, for every kind of gathering on it", () => {
  const needed = new Map<ToolKind, number>();
  const wants = (method: MethodName, level: number) => {
    const { tool } = METHODS[method];
    needed.set(tool, Math.min(needed.get(tool) ?? level, level));
  };
  for (const o of map.objects) {
    const def = RESOURCES[o.kind];
    if (def) wants(def.method, def.yields.level);
  }
  for (const water of map.fishing) wants(water.method, Math.min(...CATCHES[water.method].map((y) => y.level)));
  assert.deepEqual(
    [...needed.keys()].sort(), ["axe", "creel", "harpoon", "net", "pickaxe", "rod"],
    "the kinds of gathering the test map offers",
  );

  for (const [kind, level] of needed) {
    const starter = TOOLS[kind][0]!;
    assert.ok(starter.level <= level, `the humblest ${kind} wants level ${starter.level}, but ${kind} work starts at ${level}`);
    const spawn = map.spawns.find((s) => s.item === starter.item);
    assert.ok(spawn, `${starter.item} lies somewhere on the map`);
    // A tool a beginner may need has to be near enough to find without knowing the map. The rest are
    // meant to be walked to: the walk is the point of them.
    const away = Math.max(Math.abs(spawn.x - map.spawn.x), Math.abs(spawn.y - map.spawn.y));
    if (starter.level === 1) assert.ok(away <= 20, `a beginner's ${kind} is on the near half of the map (${away} tiles off)`);
    const end = findPath(map.collision, map.spawn.x, map.spawn.y, spawn.x, spawn.y).at(-1) ?? map.spawn;
    assert.deepEqual([end.x, end.y], [spawn.x, spawn.y], `and can be walked to`);
  }
  // A rod is no use without bait, and nothing else on the map supplies any.
  assert.ok(map.spawns.some((s) => s.item === "bait"), "bait lies near the rod's water");
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
