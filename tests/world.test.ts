import assert from "node:assert/strict";
import { test } from "node:test";
import { VIEW_DISTANCE } from "../src/shared/constants.ts";
import { blankMap } from "../src/shared/map.ts";
import { World } from "../src/server/world.ts";

test("walking moves one tile per tick, running two", () => {
  const world = new World(blankMap(64, 64));
  const walker = world.add("Walker"), runner = world.add("Runner");
  world.walk(walker, walker.x, walker.y + 6);
  world.walk(runner, runner.x, runner.y - 6);
  world.setRun(runner, true);
  world.step();
  assert.equal(walker.y, 33);
  assert.equal(runner.y, 30);
  world.step();
  world.step();
  assert.equal(walker.y, 35);
  assert.equal(runner.y, 26);
  assert.deepEqual(runner.moved, [{ x: 32, y: 27 }, { x: 32, y: 26 }]);
});

test("a click takes effect on the next tick, and a new click replaces the old path", () => {
  const world = new World(blankMap(64, 64));
  const p = world.add("Clicker");
  world.walk(p, 40, 32);
  assert.equal(p.x, 32, "nothing moves before the tick");
  world.step();
  assert.equal(p.x, 33);
  world.walk(p, 20, 32);
  world.step();
  assert.equal(p.x, 32);
});

test("view updates: newcomers arrive with name and look, then only moves, then gone", () => {
  const world = new World(blankMap(64, 64));
  const a = world.add("Alpha"), b = world.add("Beta");
  world.step();
  const first = world.viewFor(a);
  assert.deepEqual(first.ents.map((e) => [e.id, e.name]).sort(), [[a.id, "Alpha"], [b.id, "Beta"]]);
  world.step();
  assert.deepEqual(world.viewFor(a).ents, [], "nobody moved, nothing to send");

  world.walk(b, b.x + VIEW_DISTANCE + 3, b.y);
  world.setRun(b, true);
  world.step();
  const moving = world.viewFor(a).ents;
  assert.equal(moving.length, 1);
  assert.equal(moving[0]!.name, undefined, "known entities are not re-described");
  assert.equal(moving[0]!.steps?.length, 2);

  let gone: number[] = [];
  for (let i = 0; i < 12 && gone.length === 0; i++) {
    world.step();
    gone = world.viewFor(a).gone;
  }
  assert.deepEqual(gone, [b.id]);
  assert.equal(b.x - a.x, VIEW_DISTANCE + 1, "leaves view one tile past the view distance");
});
