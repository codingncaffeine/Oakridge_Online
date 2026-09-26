// Crafting, built out (PLAN Phase 20). C1: shears used on a ram take its wool, which grows back; wool spins
// into a ball at a spinning wheel and four balls weave into cloth at a loom, at the reference's levels and XP;
// Crafting's finish lines say what was done rather than what the bench does; and the wheel and the loom stand
// at the back of Hollowbeck Farm's barn, reached on foot, put in without moving anything else.
import assert from "node:assert/strict";
import { test } from "node:test";
import { addItem, countOf, emptyInventory } from "../src/server/inventory.ts";
import { SHORN_TICKS, World, type Player } from "../src/server/world.ts";
import { LOOM, WHEEL } from "../src/shared/craftworks.ts";
import { item } from "../src/shared/items.ts";
import { blankMap, FIXED_IDS, isEdgeKind, oneMap, type MapObject, type WorldMap, type WorldStack } from "../src/shared/map.ts";
import { crafted, cut, NOTHING_COMES, sheared, shornAlready, spun, TANNED, woven } from "../src/shared/messages.ts";
import { buildOakridge, OAKRIDGE_SEED } from "../src/shared/oakridge.ts";
import { RECIPES } from "../src/shared/recipes.ts";
import { SHOPS } from "../src/shared/shops.ts";
import { noXp, xpForLevel } from "../src/shared/skills.ts";

const id = (key: string) => item(key).id;

/** A 32×32 field with the creatures and objects a test names, and nothing else. */
function field(monsters: Array<[string, number, number]>, objects: Array<[string, number, number]> = []): WorldStack {
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

const packed = (entries: Array<[string, number]>) => {
  const inv = emptyInventory();
  for (const [key, n] of entries) addItem(inv, id(key), n);
  return inv;
};

test("shears used on a ram take its wool, which grows back before it can be shorn again; anything else comes to nothing", () => {
  // Every roll at 0.99: a ram never takes a wander step, so the walk over is short and sure.
  const world = new World(field([["ram", 16, 18], ["cow", 20, 18]]), () => 0.99);
  const p = world.add("Shearer", undefined, { at: { x: 16, y: 16 }, inventory: packed([["shears", 1], ["bronze_axe", 1]]) });
  const [ram, cow] = [...world.npcs.values()];
  const slot = (key: string) => p.inventory.findIndex((s) => s?.id === id(key));
  const use = (key: string, n: typeof ram) => {
    p.messages = [];
    world.useOnNpc(p, slot(key), n!.id);
    return stepUntil(world, () => p.action === null && p.messages.length > 0, 30);
  };
  assert.ok(use("shears", ram), "they walk over and shear it");
  assert.deepEqual([countOf(p.inventory, id("wool")), p.messages], [1, [sheared("Ram")]]);
  assert.ok(use("shears", ram));
  assert.deepEqual([countOf(p.inventory, id("wool")), p.messages], [1, [shornAlready("Ram")]], "not twice in a row");
  for (let i = 0; i < SHORN_TICKS; i++) world.step();
  assert.ok(use("shears", ram));
  assert.deepEqual([countOf(p.inventory, id("wool")), p.messages], [2, [sheared("Ram")]], "its wool grew back");
  // The controls: an axe on the ram, and shears on a cow, come to nothing.
  assert.ok(use("bronze_axe", ram));
  assert.deepEqual([countOf(p.inventory, id("wool")), p.messages], [2, [NOTHING_COMES]], "an axe on a ram comes to nothing");
  assert.ok(use("shears", cow));
  assert.deepEqual([countOf(p.inventory, id("wool")), p.messages], [2, [NOTHING_COMES]], "and shears on a cow come to nothing");
});

/** A run at a bench: the list it offers, then the whole run of one recipe. */
function makeAt(world: World, p: Player, bench: MapObject, made: string): string[] {
  p.messages = [];
  world.interact(p, bench.id);
  assert.ok(stepUntil(world, () => p.screen?.kind === "make"), `the ${bench.kind} offers its list`);
  const screen = p.screen as { kind: "make"; recipes: number[] };
  const at = screen.recipes.findIndex((i) => RECIPES[i]!.item === made);
  assert.ok(at >= 0, `and ${made} is on it`);
  world.make(p, at, -1);
  assert.ok(stepUntil(world, () => p.making === null, 80), "the run finishes");
  return p.messages;
}

test("wool spins into a ball at a wheel, and four balls weave into wool cloth at a loom, at the reference's levels and XP", () => {
  const wheel = RECIPES.find((r) => r.item === "ball_of_wool")!, loom = RECIPES.find((r) => r.item === "wool_cloth")!;
  assert.deepEqual([wheel.skill, wheel.level, wheel.xp, wheel.at, wheel.needs], ["crafting", 1, 25, ["wheel"], [{ item: "wool", count: 1 }]]);
  assert.deepEqual([loom.skill, loom.level, loom.xp, loom.at, loom.needs], ["crafting", 10, 120, ["loom"], [{ item: "ball_of_wool", count: 4 }]]);
  const stack = field([], [["spinning_wheel", 15, 17], ["loom", 17, 17]]);
  const world = new World(stack, () => 0.99);
  const p = world.add("Weaver", undefined, { at: { x: 16, y: 16 }, inventory: packed([["wool", 8]]), xp: { ...noXp(), crafting: xpForLevel(10) } });
  const [wheelAt, loomAt] = stack.planes.get(0)!.objects;
  const said = makeAt(world, p, wheelAt!, "ball_of_wool");
  assert.deepEqual([countOf(p.inventory, id("wool")), countOf(p.inventory, id("ball_of_wool"))], [0, 8], "eight wool, eight balls");
  assert.ok(said.includes(spun("Ball of wool")), `in the spinner's words: ${JSON.stringify(said)}`);
  const before = p.xp.crafting;
  const wove = makeAt(world, p, loomAt!, "wool_cloth");
  assert.deepEqual([countOf(p.inventory, id("ball_of_wool")), countOf(p.inventory, id("wool_cloth"))], [0, 2], "eight balls, two lengths of cloth");
  assert.equal(p.xp.crafting - before, 240, "12 XP a length");
  assert.ok(wove.includes(woven("Wool cloth")), `in the weaver's words: ${JSON.stringify(wove)}`);
  // A loom does not spin: its list is the weaving, and the bags sewn there (C2).
  world.interact(p, loomAt!.id);
  stepUntil(world, () => p.screen?.kind === "make");
  assert.deepEqual((p.screen as { recipes: number[] }).recipes.map((i) => RECIPES[i]!.item),
    ["wool_cloth", "small_pouch", "large_pouch", "small_bag", "large_bag", "small_backpack", "large_backpack"]);
});

test("Crafting's lines say what was done at a range: a hide tanned, a gem cut, leather worked into a pair of gloves, never cooked", () => {
  const stack = field([], [["range", 16, 17]]);
  const world = new World(stack, () => 0.99);
  const p = world.add("Crafter", undefined, {
    at: { x: 16, y: 16 }, inventory: packed([["cowhide", 1], ["coins", 3], ["uncut_opal", 1], ["chisel", 1], ["needle", 1], ["thread", 5]]),
  });
  const range = stack.planes.get(0)!.objects[0]!;
  assert.ok(makeAt(world, p, range, "leather").includes(TANNED), "tanned");
  assert.ok(makeAt(world, p, range, "opal").includes(cut("Opal")), "cut");
  const gloves = makeAt(world, p, range, "leather_gloves");
  assert.ok(gloves.includes(crafted("Leather gloves")), `worked: ${JSON.stringify(gloves)}`);
  assert.equal(crafted("Leather gloves"), "You work the leather into a pair of leather gloves.");
  assert.ok(![...gloves].some((m) => m.startsWith("You cook")), "and nothing was cooked");
});

/** Every tile reached on foot from a start, by the collision map's own steps. */
function flood(map: WorldMap, from: { x: number; y: number }): Set<string> {
  const seen = new Set([`${from.x},${from.y}`]), queue = [[from.x, from.y] as [number, number]];
  while (queue.length) {
    const [x, y] = queue.pop()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const key = `${x + dx},${y + dy}`;
      if (seen.has(key) || !map.collision.inBounds(x + dx, y + dy) || !map.collision.canStep(x, y, dx, dy)) continue;
      seen.add(key);
      queue.push([x + dx, y + dy]);
    }
  }
  return seen;
}

test("the wheel and the loom stand at the back of Hollowbeck Farm's barn facing its door, reached from it, and moved nothing else", () => {
  const stack = buildOakridge(OAKRIDGE_SEED), ground = stack.planes.get(0)!;
  const wheel = ground.objects.find((o) => o.kind === "spinning_wheel")!, loom = ground.objects.find((o) => o.kind === "loom")!;
  assert.ok(wheel && loom, "both stand in the world");
  assert.deepEqual([wheel.x, wheel.y, wheel.side, loom.x, loom.y, loom.side], [WHEEL.x, WHEEL.y, 0, LOOM.x, LOOM.y, 0], "where the plan puts them, facing the door");
  assert.ok(wheel.id >= FIXED_IDS && loom.id >= FIXED_IDS, "under their places' own ids");
  const reach = flood(ground, { x: 3241, y: 3299 });
  assert.ok(reach.has(`${WHEEL.x},${WHEEL.y - 1}`) && reach.has(`${LOOM.x},${LOOM.y - 1}`), "the tile before each is reached from inside the barn door");
  // Walked to through the real world: from outside the shut door, the wheel's list opens.
  const world = new World(stack, () => 0.99);
  const p = world.add("Spinner", undefined, { at: { x: 3241, y: 3296 }, inventory: packed([["wool", 1]]) });
  const door = ground.objects.find((o) => o.kind === "door" && o.x === 3241 && o.y === 3298)!;
  world.interact(p, door.id);
  assert.ok(stepUntil(world, () => world.opened.has(door.id)), "the barn door opens");
  world.interact(p, wheel.id);
  assert.ok(stepUntil(world, () => p.screen?.kind === "make", 40), `the wheel's list opens (${JSON.stringify(p.messages)})`);

  const without = buildOakridge(OAKRIDGE_SEED, { craftworks: false });
  for (const [plane, before] of without.planes) {
    const after = stack.planes.get(plane)!;
    const key = (o: MapObject) => `${o.id}:${o.kind}:${o.x},${o.y}:${o.side}:${o.variant}:${o.tag ?? ""}`;
    assert.equal(after.objects.slice(0, before.objects.length).map(key).join("|"), before.objects.map(key).join("|"), `plane ${plane}: every object as it was`);
    assert.deepEqual(after.objects.slice(before.objects.length).map((o) => o.kind), plane === 0 ? ["spinning_wheel", "loom", "potters_wheel", "kiln", "trough", "clay_rock", "clay_rock", "clay_rock", "clay_rock"] : [], `plane ${plane}: and only the craftworks added`);
    assert.equal(after.regions.size, before.regions.size);
  }
  // Shears to shear with, where the tools are sold.
  assert.ok(SHOPS.oakridge_tools!.stock.some((l) => l.id === id("shears")), "Brayle's sells shears");
});
