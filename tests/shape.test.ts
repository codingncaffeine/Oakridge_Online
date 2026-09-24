import assert from "node:assert/strict";
import { test } from "node:test";
import { blankMap, heightAt, OVERLAY_PATH, setCornerHeight, setOverlay, tileShape, type WorldMap } from "../src/shared/map.ts";

const paint = (map: WorldMap, tiles: Array<[number, number]>) => {
  for (const [x, y] of tiles) setOverlay(map, x, y, OVERLAY_PATH);
};

test("a straight road is whole tiles with crisp edges", () => {
  const map = blankMap(12, 12);
  for (let x = 0; x < 12; x++) paint(map, [[x, 5], [x, 6]]);
  assert.deepEqual(tileShape(map, 4, 5).fill, [true, true]);
  assert.deepEqual(tileShape(map, 4, 6).fill, [true, true]);
  assert.deepEqual(tileShape(map, 4, 4).fill, [false, false], "the grass beside it stays grass");
  assert.deepEqual(tileShape(map, 4, 7).fill, [false, false]);
});

test("a bend cuts the outer corner and fills the inner one along the diagonal", () => {
  const map = blankMap(12, 12);
  // An L: a road east along y = 5..6 from x = 0 to 6, then north along x = 5..6 from y = 5 up.
  for (let x = 0; x <= 6; x++) paint(map, [[x, 5], [x, 6]]);
  for (let y = 7; y < 12; y++) paint(map, [[5, y], [6, y]]);
  const outer = tileShape(map, 6, 5); // the road's south-east corner tile
  assert.equal(outer.overlay, OVERLAY_PATH);
  assert.equal(outer.fill.filter(Boolean).length, 1, "outer corner tile keeps one triangle");
  const inner = tileShape(map, 4, 7); // grass in the crook of the L
  assert.equal(inner.overlay, OVERLAY_PATH);
  assert.equal(inner.fill.filter(Boolean).length, 1, "inner corner tile gains one triangle");
  // Control: the same tiles on a straight road are untouched.
  const straight = blankMap(12, 12);
  for (let x = 0; x < 12; x++) paint(straight, [[x, 5], [x, 6]]);
  assert.deepEqual(tileShape(straight, 6, 5).fill, [true, true]);
});

test("the ground height follows the same split the renderer draws", () => {
  const map = blankMap(4, 4);
  setCornerHeight(map, 1, 1, 1); // raise corner (1, 1): tile (1, 1)'s south-west corner
  const shape = tileShape(map, 1, 1);
  // At the tile centre the height is the mean of the diagonal the tile was split along.
  const expected = shape.swNe ? (1 + 0) / 2 : 0;
  assert.equal(heightAt(map, 1.5, 1.5), expected);
});
