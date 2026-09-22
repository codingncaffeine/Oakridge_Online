import assert from "node:assert/strict";
import { test } from "node:test";
import { CollisionMap } from "../src/shared/collision.ts";
import { findPath, findPathTo, limitCheckpoints, reaches, type Tile } from "../src/shared/pathfind.ts";

const open = () => new CollisionMap(40, 40);
const dirs = (path: Tile[], sx: number, sy: number) => path.map((t, i) => {
  const prev = i === 0 ? { x: sx, y: sy } : path[i - 1]!;
  return [t.x - prev.x, t.y - prev.y] as const;
});

test("open ground: shortest walk, straight steps first, then diagonal", () => {
  const path = findPath(open(), 10, 10, 12, 15);
  assert.equal(path.length, 5);
  assert.deepEqual(path.at(-1), { x: 12, y: 15 });
  const kinds = dirs(path, 10, 10).map(([dx, dy]) => (dx !== 0 && dy !== 0 ? "diag" : "straight"));
  assert.deepEqual(kinds, ["straight", "straight", "straight", "diag", "diag"]);
});

test("every step is a legal single step", () => {
  const map = open();
  for (let y = 5; y < 30; y++) map.block(20, y);
  const path = findPath(map, 10, 15, 30, 16);
  let x = 10, y = 15;
  for (const t of path) {
    assert.ok(map.canStep(x, y, t.x - x, t.y - y), `illegal step to ${t.x},${t.y}`);
    x = t.x;
    y = t.y;
  }
  assert.deepEqual({ x, y }, { x: 30, y: 16 });
});

test("a wall with one gap forces the walk through the gap", () => {
  const walled = open(), control = open();
  for (let x = 0; x < 40; x++) if (x !== 25) walled.addWall(x, 20, 0);
  const through = findPath(walled, 10, 18, 10, 23);
  assert.ok(through.some((t) => t.x === 25 && t.y === 21), "walk should cross at the gap");
  // Control: the same walk with no wall goes straight up, so the wall is what made it long.
  assert.equal(findPath(control, 10, 18, 10, 23).length, 5);
  assert.ok(through.length > 20);
});

test("no cutting a corner past a blocked tile", () => {
  const map = open();
  map.block(11, 10);
  assert.deepEqual(findPath(map, 10, 10, 11, 11), [{ x: 10, y: 11 }, { x: 11, y: 11 }]);
  assert.deepEqual(findPath(open(), 10, 10, 11, 11), [{ x: 11, y: 11 }]);
});

test("unreachable target: walk to the reachable tile nearest to it", () => {
  const map = open();
  // A closed 3x3 room around (30, 30).
  for (let x = 29; x <= 31; x++) {
    map.addWall(x, 29, 2);
    map.addWall(x, 31, 0);
  }
  for (let y = 29; y <= 31; y++) {
    map.addWall(29, y, 3);
    map.addWall(31, y, 1);
  }
  const path = findPath(map, 20, 30, 30, 30);
  assert.deepEqual(path.at(-1), { x: 28, y: 30 });
});

test("clicking a blocked tile walks next to it", () => {
  const map = open();
  map.block(15, 10);
  assert.deepEqual(findPath(map, 10, 10, 15, 10).at(-1), { x: 14, y: 10 });
});

test("already there, or nowhere reachable within reach of the target", () => {
  assert.deepEqual(findPath(open(), 5, 5, 5, 5), []);
  const boxed = open();
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) boxed.block(5 + dx!, 5 + dy!);
  assert.deepEqual(findPath(boxed, 5, 5, 30, 30), []);
});

test("walking up to an object stops beside one of its sides, never off a corner", () => {
  const map = open();
  map.block(20, 20);
  const tree = { x: 20, y: 20, w: 1, h: 1 };
  const path = findPathTo(map, 15, 15, tree);
  assert.equal(path.length, 5, "the shortest walk");
  const end = path.at(-1)!;
  assert.ok(reaches(map, end.x, end.y, tree), `ends where it reaches: ${end.x},${end.y}`);
  assert.ok(end.x === 20 || end.y === 20, "on a side, not a corner");
  assert.equal(reaches(map, 19, 19, tree), false, "a corner doesn't reach");
  assert.equal(reaches(map, 19, 20, tree), true);
  assert.equal(reaches(map, 18, 20, tree), false, "two tiles off doesn't reach");
  assert.deepEqual(findPathTo(map, 21, 20, tree), [], "already beside it");
});

test("a wall on the edge between stops the reach, so the walk goes round to another side", () => {
  const map = open();
  map.block(20, 20);
  map.addWall(19, 20, 1);
  const tree = { x: 20, y: 20, w: 1, h: 1 };
  assert.equal(reaches(map, 19, 20, tree), false);
  const end = findPathTo(map, 16, 20, tree).at(-1)!;
  assert.ok(reaches(map, end.x, end.y, tree), `ends where it reaches: ${end.x},${end.y}`);
  assert.notDeepEqual(end, { x: 19, y: 20 });
});

test("an object nobody can get beside: the walk ends as near as it gets", () => {
  const map = open();
  map.block(20, 20);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) map.block(20 + dx, 20 + dy);
  const tree = { x: 20, y: 20, w: 1, h: 1 };
  const end = findPathTo(map, 10, 20, tree).at(-1)!;
  assert.equal(reaches(map, end.x, end.y, tree), false);
  assert.equal(Math.max(Math.abs(end.x - 20), Math.abs(end.y - 20)), 1, `a corner beside it: ${end.x},${end.y}`);
});

test("a walk keeps only its first 25 turning points", () => {
  const zigzag: Tile[] = [];
  let x = 0, y = 0;
  for (let i = 0; i < 40; i++) {
    if (i % 2 === 0) x++;
    else y++;
    zigzag.push({ x, y });
  }
  const cut = limitCheckpoints(zigzag, 0, 0);
  assert.equal(cut.length, 25);
  assert.deepEqual(cut.at(-1), zigzag[24]);
  const straight = Array.from({ length: 40 }, (_, i) => ({ x: i + 1, y: 0 }));
  assert.equal(limitCheckpoints(straight, 0, 0).length, 40);
});
