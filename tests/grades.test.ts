// The ways a player is meant to walk come at a walkable grade (the user's report, 2026-09-25: "for areas
// like that the grade should be more gradual otherwise it looks like the player can't get there"). Nowhere
// in the world does a path climb like a cliff; the ways shaped for it — the landing on Sablewood Isle, the
// Harrow's tracks through its tors and the road through the Harrow Gate — come at a gentle one; and
// Brinehaven's quay rises from its berths to its buildings' floors, so every door on its front opens onto it.
import assert from "node:assert/strict";
import { test } from "node:test";
import { OFFICE, POTS, QUAY, WORKSHOP } from "../src/shared/brinehaven.ts";
import { HARROW } from "../src/shared/harrow.ts";
import { builtRegions, cornerHeight, heightAt, OVERLAY_PATH, overlayAt, setCornerHeight, type WorldMap } from "../src/shared/map.ts";
import { buildOakridge, OAKRIDGE_SEED } from "../src/shared/oakridge.ts";
import { LANDING_ROOT } from "../src/shared/tarhollow.ts";
import { boxOf, inBox, type Box } from "../src/shared/worldgen.ts";

const stack = buildOakridge(OAKRIDGE_SEED);
const ground = stack.planes.get(0)!;
const ACROSS: ReadonlyArray<readonly [number, number]> = [[0, 1], [1, 0], [0, -1], [-1, 0]];

/**
 * The steepest ways inside a box: every walkable step with a path at either end, by how far its height changes
 * tile to tile, and every path tile by how far its own edges climb. ⛔ Both are needed: a tile's centre reads
 * only the two corners on its diagonal, and the diagonal is chosen by height, so one corner raised under a
 * path turns every diagonal round it away and no centre moves.
 */
function grades(map: WorldMap, box: Box): { step: number; stepAt: string; edge: number; edgeAt: string } {
  let step = 0, edge = 0, stepAt = "", edgeAt = "";
  for (let y = box.y0; y <= box.y1; y++) {
    for (let x = box.x0; x <= box.x1; x++) {
      if (overlayAt(map, x, y) === OVERLAY_PATH) {
        const sw = cornerHeight(map, x, y), se = cornerHeight(map, x + 1, y), ne = cornerHeight(map, x + 1, y + 1), nw = cornerHeight(map, x, y + 1);
        const e = Math.max(Math.abs(se - sw), Math.abs(ne - se), Math.abs(nw - ne), Math.abs(sw - nw));
        if (e > edge) [edge, edgeAt] = [e, `${x},${y}`];
      }
      for (const [dx, dy] of [[1, 0], [0, 1]] as const) {
        if (overlayAt(map, x, y) !== OVERLAY_PATH && overlayAt(map, x + dx, y + dy) !== OVERLAY_PATH) continue;
        if (!map.collision.canStep(x, y, dx, dy)) continue;
        const d = Math.abs(heightAt(map, x + 0.5, y + 0.5) - heightAt(map, x + dx + 0.5, y + dy + 0.5));
        if (d > step) [step, stepAt] = [d, `${x},${y}→${x + dx},${y + dy}`];
      }
    }
  }
  return { step, stepAt, edge, edgeAt };
}

/** The steepest ways over every built region of the ground. */
function worldGrades(map: WorldMap) {
  let worst = { step: 0, stepAt: "", edge: 0, edgeAt: "" };
  for (const r of builtRegions(map)) {
    const g = grades(map, boxOf(r.x0, r.y0, r.x0 + 63, r.y0 + 63));
    worst = { ...(g.step > worst.step ? { step: g.step, stepAt: g.stepAt } : { step: worst.step, stepAt: worst.stepAt }), ...(g.edge > worst.edge ? { edge: g.edge, edgeAt: g.edgeAt } : { edge: worst.edge, edgeAt: worst.edgeAt }) };
  }
  return worst;
}

test("no path anywhere in the world climbs like a cliff", () => {
  const g = worldGrades(ground);
  assert.ok(g.step <= 1.0, `no step on or off a path climbs more than a unit a tile (worst ${g.step.toFixed(2)} at ${g.stepAt})`);
  assert.ok(g.edge <= 1.5, `and no path tile's own edge climbs more than a unit and a half (worst ${g.edge.toFixed(2)} at ${g.edgeAt})`);
  // The control: the old jetty's drop planted back under the path on the green, and both checks see it.
  const at = { x: 3232, y: 3232 };
  assert.equal(overlayAt(ground, at.x, at.y), OVERLAY_PATH, "the plant is under a path");
  const was = cornerHeight(ground, at.x, at.y);
  setCornerHeight(ground, at.x, at.y, was + 2.5);
  try {
    const planted = grades(ground, boxOf(at.x - 3, at.y - 3, at.x + 3, at.y + 3));
    assert.ok(planted.edge > 1.5, `the control: a cliff planted under the green's path is found (${planted.edge.toFixed(2)})`);
  } finally {
    setCornerHeight(ground, at.x, at.y, was);
  }
});

test("the ways shaped to it come at a walkable grade: Sablewood Isle's landing, the Harrow's tracks and the Harrow Gate", () => {
  for (const [name, box] of [
    ["the way up from Sablewood Isle's landing", boxOf(LANDING_ROOT.x0 - 2, LANDING_ROOT.y0 - 8, LANDING_ROOT.x1 + 2, LANDING_ROOT.y1)],
    ["the Harrow's tracks, and the road through the gate", HARROW],
  ] as const) {
    const g = grades(ground, box);
    assert.ok(g.step <= 0.6, `${name}: no step over 0.6 a tile (worst ${g.step.toFixed(2)} at ${g.stepAt})`);
  }
  // It really does come down to the landing: over two units from the path's top to the held sand.
  const top = heightAt(ground, 2290.5, 2694.5), foot = heightAt(ground, 2290.5, LANDING_ROOT.y0 + 5.5);
  assert.ok(top - foot > 2, `from ${top.toFixed(2)} down to the landing at ${foot.toFixed(2)}`);
});

test("Brinehaven's quay rises from its berths to the floors of the buildings on its front, and every door there opens onto it", () => {
  let onQuay = 0;
  for (const [name, box] of [["the creel shop", POTS], ["the harbourmaster's office", OFFICE], ["the shipwright's workshop", WORKSHOP]] as const) {
    const doors = ground.objects.filter((o) => o.kind === "door" && inBox(box, o.x, o.y));
    assert.ok(doors.length > 0, `${name} has a door`);
    for (const d of doors) {
      const [dx, dy] = ACROSS[d.side]!;
      const inside = heightAt(ground, d.x + 0.5, d.y + 0.5), outside = heightAt(ground, d.x + dx + 0.5, d.y + dy + 0.5);
      if (!inBox(QUAY, d.x + dx, d.y + dy)) continue;
      onQuay++;
      assert.ok(Math.abs(inside - outside) <= 0.6, `${name}'s door at ${d.x},${d.y} opens level onto the quay (${inside.toFixed(2)} in, ${outside.toFixed(2)} out)`);
    }
  }
  assert.ok(onQuay >= 1, `the doors that open onto the quay were looked at (${onQuay})`);
  const g = grades(ground, QUAY);
  assert.ok(g.step <= 1.0, `the quay has no cliff in it (worst ${g.step.toFixed(2)} at ${g.stepAt})`);
});
