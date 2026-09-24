import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import { Entity } from "../../src/client/entity.ts";
import { CharacterModel } from "../../src/client/render/character.ts";
import { MonsterModel } from "../../src/client/render/monster.ts";
import { STARTER_LOOK } from "../../src/shared/look.ts";
import { blankMap } from "../../src/shared/map.ts";
import { VILLAGERS } from "../../src/shared/monsters.ts";

/**
 * The people of the village wear the player's own body (2026-09-24): a banker is a CharacterModel of
 * the look the bestiary gives them, a cow is still a creature. An apron is drawn, and drawn in front
 * of the clothes rather than inside them.
 */
test("a person of the village is drawn as a person, and a creature as a creature", () => {
  assert.ok(new Entity(2, "Banker", [], [], 8, 8, "banker").model instanceof CharacterModel, "the banker wears the player's body");
  assert.ok(new Entity(3, "Cow", [], [], 8, 8, "cow").model instanceof MonsterModel, "a cow is still a cow");
  const keeper = VILLAGERS.find((v) => v.key === "shopkeeper_tools")!;
  assert.ok(keeper.look && keeper.apron !== undefined, "the tool shop's keeper has a look and an apron");
  const plain = new CharacterModel(keeper.look!, []), aproned = new CharacterModel(keeper.look!, [], { apron: keeper.apron });
  // The farthest-forward vertex between the knees and the collar: the apron's, if it hangs in front.
  const front = (m: CharacterModel) => {
    m.root.updateMatrixWorld(true);
    let z = -Infinity, vertices = 0;
    const v = new THREE.Vector3();
    m.root.traverse((o) => {
      const g = (o as THREE.Mesh).geometry;
      if (!g) return;
      const p = g.getAttribute("position") as THREE.BufferAttribute;
      vertices += p.count;
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
        if (v.y > 0.5 && v.y < 1.2) z = Math.max(z, v.z);
      }
    });
    return { z, vertices };
  };
  const a = front(aproned), b = front(plain);
  assert.ok(a.vertices > b.vertices, `the apron adds geometry (${a.vertices} vs ${b.vertices} vertices)`);
  assert.ok(a.z > b.z + 0.01, `and hangs proud of the clothes (${a.z.toFixed(3)} vs ${b.z.toFixed(3)})`);
});

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
