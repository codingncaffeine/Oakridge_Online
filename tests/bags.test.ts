// Bags (Crafting, C2): worn in five bag slots, each adding its slots to the end of the pack. Through the world a
// worn bag makes the pack longer and what comes in fills the new slots; a swap never lengthens the pack; a death
// keeps a worn bag among the three best things, slots and all, and loses a cheaper one with its slots; and the six
// are sewn at the loom with a needle, each size up at a higher level and taking more to make.
import assert from "node:assert/strict";
import { test } from "node:test";
import { addItem, countOf, emptyInventory } from "../src/server/inventory.ts";
import { World, type Player } from "../src/server/world.ts";
import { item, ITEM_BY_KEY } from "../src/shared/items.ts";
import { blankMap, isEdgeKind, oneMap, type MapObject, type WorldStack } from "../src/shared/map.ts";
import { sewn } from "../src/shared/messages.ts";
import { RECIPES } from "../src/shared/recipes.ts";
import { noXp, xpForLevel } from "../src/shared/skills.ts";

const id = (key: string) => item(key).id;
const BAGS = ["small_pouch", "large_pouch", "small_bag", "large_bag", "small_backpack", "large_backpack"];

function field(monsters: Array<[string, number, number]> = [], objects: Array<[string, number, number]> = []): WorldStack {
  const map = blankMap(32, 32);
  for (const [monster, x, y] of monsters) map.monsters.push({ monster, x, y });
  objects.forEach(([kind, x, y], i) => {
    const o: MapObject = { id: i + 1, kind: kind as MapObject["kind"], x, y, plane: 0, side: 0, variant: 0.5 };
    map.objects.push(o);
    if (isEdgeKind(o.kind)) map.collision.addWall(x, y, 0);
    else map.collision.block(x, y);
  });
  return oneMap(map, { x: 16, y: 16 }, "field");
}

function stepUntil(world: World, done: () => boolean, ticks = 60): boolean {
  for (let i = 0; i < ticks && !done(); i++) world.step();
  return done();
}

const carrying = (entries: Array<[string, number]>) => {
  const inv = emptyInventory();
  for (const [key, n] of entries) addItem(inv, id(key), n);
  return inv;
};

test("a bag worn through the world makes the pack longer, what comes in fills its slots, and a swap never lengthens the pack", () => {
  const world = new World(field(), () => 0.99);
  const p = world.add("Packer", undefined, { at: { x: 16, y: 16 }, inventory: carrying([["small_bag", 1]]) });
  const heavier = p.weight;
  world.wearBag(p, 0);
  assert.deepEqual([p.inventory.length, p.bags[0]?.id, p.bagsDirty, p.invDirty], [36, id("small_bag"), true, true], "36 slots, and both told");
  assert.equal(p.weight, heavier, "the bag weighs the same worn as carried");
  assert.equal(addItem(p.inventory, id("logs"), 40), 4, "36 logs go in, four do not");
  world.swap(p, 0, 50);
  assert.deepEqual([p.inventory.length, countOf(p.inventory, id("logs"))], [36, 36], "a swap past the end moves nothing and adds no slot");
  world.removeBag(p, 0);
  assert.equal(p.inventory.length, 36, "a full pack keeps its bag on");
  assert.ok(p.messages.some((m) => /empty slots/.test(m)), "and says why");
});

/** A player the warchief kills, wearing a bag, with what else they carry. */
function killedWearing(bag: string, carried: Array<[string, number]>): { world: World; p: Player } {
  const world = new World(field([["mudfoot_warchief", 17, 16]]), () => 0);
  const p = world.add("Unlucky", undefined, { at: { x: 16, y: 16 }, inventory: carrying([[bag, 1]]) });
  world.wearBag(p, 0);
  for (const [key, n] of carried) addItem(p.inventory, id(key), n);
  stepUntil(world, () => p.deathTick !== 0, 300);
  assert.notEqual(p.deathTick, 0, "the warchief saw to them");
  return { world, p };
}

test("a death keeps a worn bag among the three best things, slots and all, and loses a cheaper one with its slots", () => {
  const rich = killedWearing("large_backpack", [["gold_amulet", 1], ["gold_ring", 1], ["steel_sword", 1], ["logs", 20]]);
  assert.deepEqual([rich.p.bags[0]?.id, rich.p.inventory.length], [id("large_backpack"), 48], "the backpack is kept, worn, and its slots with it");
  assert.deepEqual([countOf(rich.p.inventory, id("gold_amulet")), countOf(rich.p.inventory, id("gold_ring")), countOf(rich.p.inventory, id("steel_sword"))], [1, 1, 0], "the amulet and the ring kept with it, the sword not");
  const poor = killedWearing("small_pouch", [["gold_amulet", 1], ["gold_ring", 1], ["steel_sword", 1], ["logs", 29]]);
  assert.deepEqual([poor.p.bags[0], poor.p.inventory.length], [null, 28], "the pouch is lost, and its four slots with it");
  assert.deepEqual(["gold_amulet", "gold_ring", "steel_sword"].map((k) => countOf(poor.p.inventory, id(k))), [1, 1, 1], "the three best kept, all of them");
  assert.ok([...poor.world.ground.values()].some((g) => g.id === id("small_pouch")), "the pouch lies where they fell");
});

test("the six bags are sewn at the loom with a needle, each size up at a higher level and taking more to make", () => {
  const recipes = BAGS.map((key) => RECIPES.find((r) => r.item === key)!);
  let last = { level: 0, needs: 0, slots: 0 };
  for (const r of recipes) {
    const needs = r.needs.reduce((n, x) => n + x.count, 0), slots = ITEM_BY_KEY.get(r.item)!.bag!;
    assert.deepEqual([r.skill, r.at, r.tool], ["crafting", ["loom"], "needle"], `${r.item} is sewn at the loom`);
    assert.ok(r.level > last.level && needs > last.needs && slots > last.slots, `${r.item}: level ${r.level}, ${needs} things, ${slots} slots, each more than the last`);
    last = { level: r.level, needs, slots };
  }
  assert.ok(recipes.at(-1)!.needs.some((x) => x.item === "emberite_bar"), "the large backpack needs emberite, the hardest metal to hand");

  // A small pouch sewn at a loom.
  const stack = field([], [["loom", 16, 17]]);
  const world = new World(stack, () => 0.99);
  const p = world.add("Sewer", undefined, { at: { x: 16, y: 16 }, inventory: carrying([["needle", 1], ["leather", 1], ["thread", 1]]), xp: { ...noXp(), crafting: xpForLevel(5) } });
  world.interact(p, stack.planes.get(0)!.objects[0]!.id);
  assert.ok(stepUntil(world, () => p.screen?.kind === "make"), "the loom's list opens");
  const at = (p.screen as { recipes: number[] }).recipes.findIndex((i) => RECIPES[i]!.item === "small_pouch");
  assert.ok(at >= 0, "and the small pouch is on it");
  world.make(p, at, 1);
  assert.ok(stepUntil(world, () => p.making === null, 40));
  assert.deepEqual([countOf(p.inventory, id("small_pouch")), countOf(p.inventory, id("leather"))], [1, 0]);
  assert.ok(p.messages.includes(sewn("Small pouch")), `sewn, in so many words: ${JSON.stringify(p.messages)}`);
});
