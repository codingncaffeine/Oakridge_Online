import assert from "node:assert/strict";
import { test } from "node:test";
import { World } from "../src/server/world.ts";
import { energyRegen, MAX_ENERGY, runDrain } from "../src/shared/energy.ts";
import { blankMap } from "../src/shared/map.ts";

test("drain and regeneration follow the classic formulas", () => {
  assert.equal(runDrain(0, 1), 59); // floor(60 × (1 - 1/300))
  assert.equal(runDrain(0, 99), 40);
  assert.equal(runDrain(64, 1), 126); // floor(127 × 299/300)
  assert.equal(runDrain(200, 1), 126, "weight counts up to 64 kg");
  assert.equal(energyRegen(1), 15);
  assert.equal(energyRegen(99), 24);
  // Full to empty at no weight: about 170 ticks at level 1, 250 at level 99.
  assert.equal(Math.ceil(MAX_ENERGY / runDrain(0, 1)), 170);
  assert.equal(Math.ceil(MAX_ENERGY / runDrain(0, 99)), 250);
});

test("running drains energy, walking restores it, and run turns off at zero", () => {
  const world = new World(blankMap(128, 128));
  const p = world.add("Runner", undefined, { at: { x: 10, y: 64 }, run: true, energy: 150 });
  world.walk(p, 70, 64);
  world.step();
  assert.equal(p.moved.length, 2);
  assert.equal(p.energy, 150 - 59);
  world.step();
  world.step();
  assert.equal(p.energy, 0, "the last tick only takes what was left (32), never below zero");
  assert.equal(p.run, false, "run switched itself off");
  world.step();
  assert.equal(p.moved.length, 1, "walking now");
  assert.equal(p.energy, 15, "and recovering");
});

test("a single-tile step costs nothing even with run on", () => {
  const world = new World(blankMap(64, 64));
  const p = world.add("Stepper", undefined, { at: { x: 10, y: 10 }, run: true, energy: 5000 });
  world.walk(p, 11, 10);
  world.step();
  assert.equal(p.moved.length, 1);
  assert.equal(p.energy, 5015);
});
