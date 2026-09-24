// Region streaming's rule (Phase 12): the 3×3 block around the player is always up, a region is let go
// only once the player is a dead band past it, and a crossing builds one region a step so no frame
// takes the whole cost. Every count below is the number the rule predicts, not merely "some".
import assert from "node:assert/strict";
import { test } from "node:test";
import { KEEP_WITHIN, LOAD_WITHIN, regionDistance, Streamer } from "../src/client/streaming.ts";

/** A streamer over a grid of built regions, recording what it was told to build and drop. */
function grid(rx0: number, ry0: number, rx1: number, ry1: number) {
  const events: string[] = [];
  const s = new Streamer({
    built: (rx, ry) => rx >= rx0 && rx <= rx1 && ry >= ry0 && ry <= ry1,
    load: (rx, ry) => events.push(`+${rx},${ry}`),
    unload: (rx, ry) => events.push(`-${rx},${ry}`),
  });
  return { s, events };
}

test("the distance to a region is zero inside it and grows from its edge", () => {
  assert.equal(regionDistance(100, 100, 1, 1), 0, "inside region (1, 1)");
  assert.equal(regionDistance(63, 100, 1, 1), 1, "one tile west of it");
  assert.equal(regionDistance(200, 100, 1, 1), 200 - 127, "east of it, along x");
  assert.equal(regionDistance(200, 300, 1, 1), 300 - 127, "the longer axis counts");
  assert.ok(LOAD_WITHIN < KEEP_WITHIN, "there is a dead band");
});

test("standing still, the whole 3×3 block around the player comes up and nothing else", () => {
  const { s, events } = grid(0, 0, 5, 5);
  // A player in region (2, 2), 10 tiles from its west edge: every neighbour is within 64 tiles.
  while (s.pending(138, 150)) assert.ok(s.step(138, 150), "each step builds something while something is pending");
  assert.equal(s.loaded.size, 9);
  assert.equal(events.length, 9);
  for (let ry = 1; ry <= 3; ry++) for (let rx = 1; rx <= 3; rx++) assert.ok(events.includes(`+${rx},${ry}`), `region (${rx}, ${ry}) came up`);
  assert.equal(s.step(138, 150), false, "and a step with nothing to do changes nothing");
});

test("one region a step: a crossing is spread over frames, nearest first", () => {
  const { s, events } = grid(0, 0, 5, 5);
  assert.ok(s.step(138, 150, 1));
  assert.deepEqual(events, ["+2,2"], "the player's own region first");
  let steps = 1;
  while (s.pending(138, 150)) {
    s.step(138, 150, 1);
    steps++;
  }
  assert.equal(steps, 9, "nine steps for nine regions");
});

test("walking east builds the next column and drops the far one, and pacing back does nothing", () => {
  const { s, events } = grid(0, 0, 5, 5);
  while (s.pending(138, 150)) s.step(138, 150, 9);
  events.length = 0;
  // Into region (3, 2): column 4 is now within 64 tiles, column 1 is 137 - 64 = 73 tiles away — kept.
  while (s.pending(200, 150)) s.step(200, 150, 9);
  assert.deepEqual(events.filter((e) => e.startsWith("+")).sort(), ["+4,1", "+4,2", "+4,3"]);
  assert.deepEqual(events.filter((e) => e.startsWith("-")), [], "column 1 is inside the dead band, so it stays");
  assert.equal(s.loaded.size, 12);
  // Back to region (2, 2): column 4 is 256 - 190 = 66 tiles away, so nothing is dropped or built.
  events.length = 0;
  s.step(190, 150, 9);
  assert.deepEqual(events, [], "pacing over the line costs nothing");
  // Further on, past the dead band: column 4 is 106 tiles away and goes; column 1 is back within reach.
  s.step(150, 150, 9);
  assert.deepEqual(events.sort(), ["-4,1", "-4,2", "-4,3"]);
  assert.equal(s.loaded.size, 9);
  assert.equal(s.loads, 12);
  assert.equal(s.unloads, 3);
});

test("regions nothing was built on are never loaded, and the edge of the world is not an error", () => {
  const { s, events } = grid(2, 2, 4, 4);
  // A player in the built grid's corner region (2, 2): regions 1 and below are not built.
  while (s.pending(130, 130)) s.step(130, 130, 9);
  assert.deepEqual(events.sort(), ["+2,2", "+2,3", "+3,2", "+3,3"]);
  // Control: the same spot on a wider grid loads the full 3×3.
  const wide = grid(0, 0, 5, 5);
  while (wide.s.pending(130, 130)) wide.s.step(130, 130, 9);
  assert.equal(wide.s.loaded.size, 9);
});

test("clearing forgets the loaded set without telling the scene, which is thrown away whole", () => {
  const { s, events } = grid(0, 0, 5, 5);
  while (s.pending(138, 150)) s.step(138, 150, 9);
  s.clear();
  assert.equal(s.loaded.size, 0);
  assert.equal(events.filter((e) => e.startsWith("-")).length, 0);
});
