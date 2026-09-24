// Ground cover and fire (PLAN Phase 15): where the grass grows — never on a path, water, a floor or a
// rock; thick along an edge and round a trunk, thin in the open — and where the flames stand, on the
// fires and nowhere else, placed as the renderer places the thing they burn on.
import assert from "node:assert/strict";
import { test } from "node:test";
import { blankMap, OVERLAY_PATH, OVERLAY_WATER, setIndoors, setOverlay, type MapObject } from "../../src/shared/map.ts";
import { FIRES, flamePlan, GRASS_EDGE, GRASS_OPEN, GRASS_ROUND_TREE, grassPlan } from "../../src/client/render/groundplan.ts";
import { propPlacement } from "../../src/client/render/placement.ts";

/** A field with a path down it, water past that, a fence across it, a tree, a rock and a floor. */
function field() {
  const map = blankMap(32, 32);
  for (let y = 0; y < 32; y++) {
    setOverlay(map, 10, y, OVERLAY_PATH);
    setOverlay(map, 20, y, OVERLAY_WATER);
  }
  for (let x = 0; x < 32; x++) map.collision.addWall(x, 5, 0);
  const tree: MapObject = { id: 1, kind: "tree", x: 25, y: 25, plane: 0, side: 0, variant: 0.3 };
  const rock: MapObject = { id: 2, kind: "rock", x: 27, y: 27, plane: 0, side: 0, variant: 0.6 };
  map.objects.push(tree, rock);
  setIndoors(map, 3, 3, 1);
  return { map, tree, rock };
}

test("grass grows on grass and nowhere else: not on a path, on water, on a floor or through a rock", () => {
  const { map, rock } = field();
  const tufts = grassPlan(map, { x0: 0, y0: 0, x1: 31, y1: 31 });
  assert.ok(tufts.length > 100, `a field grows grass (${tufts.length} tufts)`);
  for (const t of tufts) {
    const x = Math.floor(t.x), y = Math.floor(t.y);
    assert.ok(x >= 0 && x < 32 && y >= 0 && y < 32, "on the field");
    assert.notEqual(x, 10, `a tuft at ${t.x.toFixed(2)},${t.y.toFixed(2)} stands on the path`);
    assert.notEqual(x, 20, `a tuft at ${t.x.toFixed(2)},${t.y.toFixed(2)} stands on the water`);
    assert.ok(!(x === 3 && y === 3), "a tuft stands on a floor");
    assert.ok(!(x === rock.x && y === rock.y), "a tuft grows through the rock");
    assert.ok(t.scale > 0.5 && t.scale < 1.5 && t.tint > 0.7 && t.tint < 1.3, "a sensible size and green");
  }
  assert.deepEqual(grassPlan(map, { x0: 0, y0: 0, x1: 31, y1: 31 }), tufts, "the same field grows the same grass");
});

test("grass is thick along an edge and round a trunk, thin in the open", () => {
  const { map, tree } = field();
  const tufts = grassPlan(map, { x0: 0, y0: 0, x1: 31, y1: 31 });
  const on = (x: number, y?: number) => tufts.filter((t) => Math.floor(t.x) === x && (y === undefined || Math.floor(t.y) === y)).length;
  // The two columns beside the path against three open columns (rows below the fence's row, which is an edge of its own).
  const besidePath = on(9) + on(11), open = on(14) + on(15) + on(16);
  assert.ok(besidePath > open * 2, `thicker beside the path (${besidePath}) than in the open (${open})`);
  assert.ok(on(19) + on(21) > open * 2, `and on the water's banks (${on(19) + on(21)})`);
  // The tiles under the fence: rows 5 and 6 share its wall, so both are edges.
  let fenceRow = 0, openRow = 0;
  for (let x = 12; x < 19; x++) { fenceRow += on(x, 5) + on(x, 6); openRow += on(x, 12) + on(x, 13); }
  assert.ok(fenceRow > openRow * 2, `thicker along the fence (${fenceRow}) than two open rows (${openRow})`);
  // Round the trunk: on the tree's own tile, clear of its middle.
  const round = tufts.filter((t) => Math.floor(t.x) === tree.x && Math.floor(t.y) === tree.y);
  assert.ok(round.length >= 1, "grass round the trunk");
  for (const t of round) {
    const r = Math.hypot(t.x - tree.x - 0.5, t.y - tree.y - 0.5);
    assert.ok(r > 0.3 && r < 0.5, `a tuft ${r.toFixed(2)} from the trunk's middle`);
  }
  assert.ok(GRASS_EDGE > GRASS_OPEN * 4 && GRASS_ROUND_TREE > GRASS_OPEN * 4, "the constants say so too");
});

test("flames stand on fires, forges and ranges, where the renderer puts the thing they burn on, and on nothing else", () => {
  const map = blankMap(16, 16);
  const fire: MapObject = { id: 7, kind: "fire", x: 5, y: 5, plane: 0, side: 0, variant: 0.2 };
  const furnace: MapObject = { id: 8, kind: "furnace", x: 9, y: 9, plane: 0, side: 0, variant: 0.7 };
  const table: MapObject = { id: 9, kind: "table", x: 3, y: 3, plane: 0, side: 0, variant: 0.5 };
  const tongues = flamePlan(map, [fire, furnace, table]);
  assert.equal(tongues.length, FIRES.fire!.tongues + FIRES.furnace!.tongues, "a fire's tongues and a furnace's, none for the table");
  const onFire = tongues.filter((t) => Math.abs(t.x - 5.5) < 0.01 && Math.abs(t.z + 5.5) < 0.01);
  assert.equal(onFire.length, FIRES.fire!.tongues, "the campfire's stand at its heart");
  assert.ok(onFire.every((t) => t.y > 0 && t.size > 0.8), "above the ground, full size");
  // The furnace's stand at its mouth: half a tile from its middle, whichever way its variant turned it.
  const atMouth = tongues.filter((t) => !onFire.includes(t));
  const { scale } = propPlacement(furnace.variant);
  for (const t of atMouth) {
    const off = Math.hypot(t.x - 9.5, t.z + 9.5);
    assert.ok(Math.abs(off - 0.5 * scale) < 0.01, `a tongue ${off.toFixed(3)} from the furnace's middle, its mouth being ${(0.5 * scale).toFixed(3)} out`);
  }
  // The control: a differently turned furnace puts its mouth elsewhere.
  const turned = flamePlan(map, [{ ...furnace, variant: 0.31 }]);
  assert.notEqual(turned[0]!.x.toFixed(3), atMouth[0]!.x.toFixed(3), "the mouth follows the turn");
  assert.deepEqual(flamePlan(map, [table]), [], "nothing burns on a table");
});
