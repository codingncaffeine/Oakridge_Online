// The water's edge (the user's report, 2026-09-25: "a pretty big drop off oakridge down to a dock ... also
// fishing is impossible from that dock"): every fishing spot in the world can be fished from a tile beside it
// with nothing on the edge between — a jetty's rail used to stand between the deck and every spot off it — a
// player on Oakridge's jetty nets from the spot off its end, and the way down the bank to the jetty comes down
// at a walkable grade instead of dropping to it.
import assert from "node:assert/strict";
import { test } from "node:test";
import { addItem, countOf } from "../src/server/inventory.ts";
import { World } from "../src/server/world.ts";
import { BLOCKED } from "../src/shared/collision.ts";
import { item } from "../src/shared/items.ts";
import { cornerHeight, heightAt, OVERLAY_PATH, overlayAt, setCornerHeight, type WorldMap } from "../src/shared/map.ts";
import { CANT_REACH } from "../src/shared/messages.ts";
import { buildOakridge, OAKRIDGE_SEED, SITES } from "../src/shared/oakridge.ts";
import { boxOf, inBox, type Box } from "../src/shared/worldgen.ts";

const stack = buildOakridge(OAKRIDGE_SEED);
const ground = stack.planes.get(0)!;
const SIDES = [[0, 1], [1, 0], [0, -1], [-1, 0]] as const;
const JETTY = SITES["jetty"]!;

/** The sides a spot's tile could be fished from: a standable tile beside it, with nothing on the edge between. */
function fishedFrom(map: WorldMap, t: { x: number; y: number }): number[] {
  return [0, 1, 2, 3].filter((s) => {
    const [dx, dy] = SIDES[s]!;
    return (map.collision.get(t.x + dx, t.y + dy) & BLOCKED) === 0 && !map.collision.wallBetween(t.x, t.y, dx, dy);
  });
}

/**
 * Every walkable step inside a box with a path at either end whose height changes by more than `limit` a
 * tile, and every edge of a path tile that climbs more than that along its own length. ⛔ Both are needed: a
 * tile's centre reads only the two corners on its diagonal, and the diagonal is chosen by height, so one
 * corner raised under a path turns every diagonal round it away and no centre moves.
 */
function steepSteps(map: WorldMap, box: Box, limit: number): string[] {
  const steep: string[] = [];
  for (let y = box.y0; y <= box.y1; y++) {
    for (let x = box.x0; x <= box.x1; x++) {
      if (overlayAt(map, x, y) === OVERLAY_PATH) {
        const sw = cornerHeight(map, x, y), se = cornerHeight(map, x + 1, y), ne = cornerHeight(map, x + 1, y + 1), nw = cornerHeight(map, x, y + 1);
        const edge = Math.max(Math.abs(se - sw), Math.abs(ne - se), Math.abs(nw - ne), Math.abs(sw - nw));
        if (edge > limit) steep.push(`${x},${y} edge (${edge.toFixed(2)})`);
      }
      for (const [dx, dy] of [[1, 0], [0, 1]] as const) {
        if (overlayAt(map, x, y) !== OVERLAY_PATH && overlayAt(map, x + dx, y + dy) !== OVERLAY_PATH) continue;
        if (!map.collision.canStep(x, y, dx, dy)) continue;
        const d = Math.abs(heightAt(map, x + 0.5, y + 0.5) - heightAt(map, x + dx + 0.5, y + dy + 0.5));
        if (d > limit) steep.push(`${x},${y}→${x + dx},${y + dy} (${d.toFixed(2)})`);
      }
    }
  }
  return steep;
}

test("every fishing spot in the world can be fished from a tile beside it, with no rail between", () => {
  let tiles = 0;
  for (const [plane, map] of stack.planes) {
    for (const w of map.fishing) {
      for (const t of w.tiles) {
        tiles++;
        assert.ok(fishedFrom(map, t).length > 0, `the ${w.method} spot tile at ${t.x},${t.y} (plane ${plane}) can be fished from somewhere`);
      }
    }
  }
  assert.ok(tiles >= 40, `the world's spots are all looked at (${tiles})`);
  // The rails that stood between are gone only where a spot is: the jetty keeps the rest of its rail.
  const rails = ground.objects.filter((o) => o.kind === "fence" && inBox(JETTY, o.x, o.y));
  assert.ok(rails.length >= 8, `the jetty is still railed (${rails.length} lengths)`);
  // The control: put the rail back on the open side of a spot off the jetty, and the check sees it.
  const spot = ground.fishing.flatMap((w) => w.tiles).find((t) => inBox(boxOf(JETTY.x0, JETTY.y0 - 1, JETTY.x1 + 1, JETTY.y1 + 1), t.x, t.y) && fishedFrom(ground, t).length === 1)!;
  assert.ok(spot, "a spot off the jetty fished only from its deck");
  const [side] = fishedFrom(ground, spot);
  ground.collision.addWall(spot.x, spot.y, side as 0 | 1 | 2 | 3);
  try {
    assert.equal(fishedFrom(ground, spot).length, 0, "the control: with the rail back, the spot cannot be fished");
  } finally {
    ground.collision.removeWall(spot.x, spot.y, side as 0 | 1 | 2 | 3);
  }
});

test("a player on Oakridge's jetty nets from the spot off its end, and a rail there would stop them", () => {
  const world = new World(stack, () => 0);
  // The jetty's end: the spot tile beyond the deck's last column, fished from the deck alone.
  const end = ground.fishing.flatMap((w) => w.tiles).find((t) => t.x === JETTY.x1 + 1 && inBox(JETTY, t.x - 1, t.y))!;
  assert.ok(end, "a spot tile off the jetty's end");
  const water = ground.fishing.findIndex((w) => w.tiles.includes(end));
  const spot = world.spots.find((s) => s.water === water)!;
  spot.x = end.x;
  spot.y = end.y;
  spot.moveAt = world.tick + 100000;
  const deck = { x: end.x - 1, y: end.y };
  const p = world.add("Netter", undefined, { at: { ...deck, plane: 0 } });
  addItem(p.inventory, item("fishing_net").id, 1);
  world.fish(p, spot.id);
  for (let i = 0; i < 30 && countOf(p.inventory, item("raw_sardine").id) === 0; i++) world.step();
  assert.ok(!p.messages.includes(CANT_REACH), "not told it cannot be reached");
  assert.equal(countOf(p.inventory, item("raw_sardine").id), 1, "and a sardine comes up");
  assert.ok(inBox(JETTY, p.x, p.y) && overlayAt(ground, p.x, p.y) === OVERLAY_PATH, `netted from the deck (${p.x},${p.y})`);
  // The control: the rail back across the deck's end, and the same cast is refused.
  world.map.collision.addWall(deck.x, deck.y, 1);
  try {
    const q = world.add("Railed", undefined, { at: { ...deck, plane: 0 } });
    addItem(q.inventory, item("fishing_net").id, 1);
    world.fish(q, spot.id);
    for (let i = 0; i < 30 && !q.messages.includes(CANT_REACH) && q.gathering === null; i++) world.step();
    assert.ok(q.messages.includes(CANT_REACH) || !(q.x === deck.x && q.y === deck.y && q.gathering !== null), "the control: with the rail across, the end cannot be fished from the deck");
  } finally {
    world.map.collision.removeWall(deck.x, deck.y, 1);
  }
});

test("the way down the bank from the village to Oakridge's jetty comes down at a walkable grade", () => {
  const approach = boxOf(3236, 3192, JETTY.x1, 3210);
  const LIMIT = 0.6;
  assert.deepEqual(steepSteps(ground, approach, LIMIT), [], "no step on the way down is steeper than a walkable grade");
  // It really comes down to the water: from the village's level to the deck's, over four units.
  const top = heightAt(ground, 3240.5, 3205.5), deck = heightAt(ground, JETTY.x0 + 6.5, 3199.5);
  assert.ok(top - deck > 4, `from ${top.toFixed(2)} at the village's edge down to the deck at ${deck.toFixed(2)}`);
  // The control: a step the old bank had, planted back under the path's last tiles, and the check sees it.
  const at = { x: 3250, y: 3200 };
  assert.equal(overlayAt(ground, at.x, at.y), OVERLAY_PATH, "the plant is under the path");
  const was = cornerHeight(ground, at.x, at.y);
  setCornerHeight(ground, at.x, at.y, was + 3);
  try {
    assert.ok(steepSteps(ground, approach, LIMIT).length > 0, "the control: a cliff planted on the way down is found");
  } finally {
    setCornerHeight(ground, at.x, at.y, was);
  }
});
