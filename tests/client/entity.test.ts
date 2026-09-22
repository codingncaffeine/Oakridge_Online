import assert from "node:assert/strict";
import { test } from "node:test";
import { Entity } from "../../src/client/entity.ts";
import { STARTER_LOOK } from "../../src/shared/look.ts";
import { blankMap } from "../../src/shared/map.ts";

const map = blankMap(16, 16);
const player = () => new Entity(1, "Faller", STARTER_LOOK, [], 8, 8);
/** A second of animation, in the steps the frame loop would take. */
const run = (e: Entity, seconds = 1) => {
  for (let i = 0; i < seconds * 20; i++) e.update(0.05, map);
};

/**
 * A creature's body leaves the world and takes its entity with it, so nothing ever had to stand one
 * back up. A player's body does not: they wake at the spawn as the same entity. Left toppled, they walk
 * about on their side, half in the ground — and every check of the death itself still passes.
 */
test("a killed player topples over, and stands up again when they wake at the spawn", () => {
  const e = player();
  run(e, 0.2);
  assert.equal(e.model.root.rotation.z, 0, "upright to start with");
  assert.equal(e.dying, false);

  e.die();
  run(e);
  assert.ok(e.dying, "it knows it is down");
  assert.ok(e.model.root.rotation.z > 1, `it lies on its side (${e.model.root.rotation.z.toFixed(2)} rad)`);

  e.rise();
  assert.equal(e.dying, false, "back on its feet");
  assert.equal(e.model.root.rotation.z, 0, "and standing upright again");
  // And it stays up: the next frames must not roll it back over.
  run(e);
  assert.equal(e.model.root.rotation.z, 0, "it is still upright a second later");
});

test("standing up again does not disturb where the model is", () => {
  const e = player();
  e.die();
  run(e);
  const where = e.model.root.position.clone();
  e.rise();
  run(e, 0.2);
  assert.deepEqual(
    [e.model.root.position.x, e.model.root.position.z],
    [where.x, where.z],
    "it stands up on the spot, not somewhere else",
  );
});
