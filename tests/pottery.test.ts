// Crafting, built out (PLAN Phase 20). C3, pottery: clay mined at the quarry's clay rocks, softened with water at
// any well or trough, shaped at a potter's wheel and fired in a kiln, at the reference's levels and XP, each step
// in the potter's own words; the rocks, the trough, the wheel and a kiln put in at Hollowbeck Farm and its quarry,
// reached on foot, without moving anything else; and Kilnhold's charcoal kilns fire pots as well.
import assert from "node:assert/strict";
import { test } from "node:test";
import { addItem, countOf, emptyInventory } from "../src/server/inventory.ts";
import { canStand, World, type Player } from "../src/server/world.ts";
import { CLAY_ROCKS, FARM_KILN, POTTERS_WHEEL, TROUGH } from "../src/shared/craftworks.ts";
import { item } from "../src/shared/items.ts";
import { KILNS } from "../src/shared/kilnhold.ts";
import { MONSTER_BY_KEY } from "../src/shared/monsters.ts";
import { blankMap, FIXED_IDS, isEdgeKind, oneMap, overlayAt, OVERLAY_PATH, type MapObject, type WorldMap, type WorldStack } from "../src/shared/map.ts";
import { fired, shaped, SOFTENED } from "../src/shared/messages.ts";
import { buildOakridge, OAKRIDGE_SEED } from "../src/shared/oakridge.ts";
import { RECIPES } from "../src/shared/recipes.ts";
import { RESOURCES } from "../src/shared/gathering.ts";
import { noXp, xpForLevel } from "../src/shared/skills.ts";
import { STATION_OF, STATION_VERB } from "../src/shared/stations.ts";

const id = (key: string) => item(key).id;

function field(objects: Array<[string, number, number]>): WorldStack {
  const map = blankMap(32, 32);
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

/** Opens a bench's list (by its own click, or by using the item in `use` on it) and runs one recipe to the end. */
function makeAt(world: World, p: Player, bench: MapObject, made: string, use?: string): { said: string[]; offered: string[] } {
  p.messages = [];
  world.interact(p, bench.id, use ? p.inventory.findIndex((s) => s?.id === id(use)) : null);
  assert.ok(stepUntil(world, () => p.screen?.kind === "make"), `the ${bench.kind} offers its list (${JSON.stringify(p.messages)})`);
  const offered = (p.screen as { recipes: number[] }).recipes.map((i) => RECIPES[i]!.item);
  const at = offered.indexOf(made);
  assert.ok(at >= 0, `and ${made} is on it`);
  world.make(p, at, -1);
  assert.ok(stepUntil(world, () => p.making === null, 120), "the run finishes");
  return { said: p.messages, offered };
}

test("pottery is at the reference's levels and XP: softening for nothing, then each piece shaped and fired at the same level", () => {
  const row = (key: string) => {
    const r = RECIPES.find((r) => r.item === key)!;
    return [r.level, r.xp, r.at.join(), r.needs.map((n) => `${n.count} ${n.item}`).join()];
  };
  assert.deepEqual(row("soft_clay"), [1, 0, "water", "1 clay"]);
  const pieces: Array<[string, number, number, number]> = [["pot", 1, 63, 63], ["pie_dish", 7, 150, 100], ["bowl", 8, 180, 150], ["plant_pot", 19, 200, 175], ["pot_lid", 25, 200, 200]];
  for (const [piece, level, shapeXp, fireXp] of pieces) {
    assert.deepEqual(row(`unfired_${piece}`), [level, shapeXp, "potter", "1 soft_clay"], `shaping a ${piece}`);
    assert.deepEqual(row(piece), [level, fireXp, "kiln", `1 unfired_${piece}`], `firing a ${piece}`);
  }
  const clay = RESOURCES.clay_rock!;
  assert.deepEqual([clay.method, clay.yields.item, clay.yields.level, clay.yields.xp], ["mine", "clay", 1, 50], "clay is Mining 1 and 5 XP");
  // Water is used on, never clicked: a well keeps its Examine and nothing else.
  assert.deepEqual([STATION_OF.well, STATION_OF.trough, STATION_VERB.water], ["water", "water", null]);
  assert.deepEqual([STATION_VERB.potter, STATION_VERB.kiln], ["Shape", "Fire"]);
});

test("clay is mined, softened at a trough or a well, shaped at the wheel and fired in a kiln, in the potter's words", () => {
  const stack = field([["clay_rock", 16, 18], ["trough", 14, 16], ["well", 18, 16], ["potters_wheel", 16, 14], ["kiln", 20, 14]]);
  const world = new World(stack, () => 0);
  const p = world.add("Potter", undefined, {
    at: { x: 16, y: 16 }, inventory: packed([["bronze_pickaxe", 1], ["clay", 3]]), xp: { ...noXp(), crafting: xpForLevel(8) },
  });
  const [rock, trough, well, wheel, kiln] = stack.planes.get(0)!.objects;

  // One clay off the rock, 5 XP, and the rock back within three ticks.
  world.interact(p, rock!.id);
  assert.ok(stepUntil(world, () => countOf(p.inventory, id("clay")) === 4, 40), "a clay is mined");
  assert.equal(p.xp.mining, 50, "for 5 XP");
  assert.ok(world.depleted.has(rock!.id), "and the rock is spent");
  const spent = world.tick;
  assert.ok(stepUntil(world, () => !world.depleted.has(rock!.id), 5), "until it comes back");
  assert.ok(world.tick - spent <= 3, `in no more than three ticks (${world.tick - spent})`);
  p.gathering = null;

  // A trough has nothing to do on its own; clay used on it opens the softening list.
  p.messages = [];
  world.interact(p, trough!.id);
  assert.equal(p.action, null, "clicking a trough starts nothing");
  const soft = makeAt(world, p, trough!, "soft_clay", "clay");
  assert.deepEqual(soft.offered, ["soft_clay"]);
  assert.ok(soft.said.includes(SOFTENED), `softened: ${JSON.stringify(soft.said)}`);
  assert.deepEqual([countOf(p.inventory, id("clay")), countOf(p.inventory, id("soft_clay"))], [0, 4]);
  assert.equal(p.xp.crafting, xpForLevel(8), "softening pays nothing");
  // A well does the same.
  addItem(p.inventory, id("clay"), 1);
  assert.ok(makeAt(world, p, well!, "soft_clay", "clay").said.includes(SOFTENED), "a well softens clay too");
  assert.equal(countOf(p.inventory, id("soft_clay")), 5);

  // Shaped at the wheel: every piece is on its list, and the pots come off it.
  const before = p.xp.crafting;
  const thrown = makeAt(world, p, wheel!, "unfired_pot");
  assert.deepEqual(thrown.offered, ["unfired_pot", "unfired_pie_dish", "unfired_bowl", "unfired_plant_pot", "unfired_pot_lid"]);
  assert.ok(thrown.said.includes(shaped("Unfired pot")), `shaped: ${JSON.stringify(thrown.said)}`);
  assert.equal(shaped("Unfired pot"), "You shape the clay into a pot.");
  assert.deepEqual([countOf(p.inventory, id("soft_clay")), countOf(p.inventory, id("unfired_pot"))], [0, 5]);
  assert.equal(p.xp.crafting - before, 5 * 63, "6.3 XP a pot");

  // Fired in the kiln.
  const mid = p.xp.crafting;
  const baked = makeAt(world, p, kiln!, "pot");
  assert.deepEqual(baked.offered, ["pot", "pie_dish", "bowl", "plant_pot", "pot_lid"]);
  assert.ok(baked.said.includes(fired("Pot")), `fired: ${JSON.stringify(baked.said)}`);
  assert.equal(fired("Pot"), "You fire a pot in the kiln.");
  assert.deepEqual([countOf(p.inventory, id("unfired_pot")), countOf(p.inventory, id("pot"))], [0, 5]);
  assert.equal(p.xp.crafting - mid, 5 * 63, "and 6.3 XP a firing");
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

test("pottery stands at Hollowbeck Farm and its quarry, on ground that was free, each reached on foot", () => {
  const stack = buildOakridge(OAKRIDGE_SEED), ground = stack.planes.get(0)!;
  const bare = buildOakridge(OAKRIDGE_SEED, { craftworks: false }).planes.get(0)!;
  const placed: Array<[string, { x: number; y: number }]> = [
    ["potters_wheel", POTTERS_WHEEL], ["kiln", FARM_KILN], ["trough", TROUGH], ...CLAY_ROCKS.map((r) => ["clay_rock", r] as [string, { x: number; y: number }]),
  ];
  // Reached by the pathfinder's own steps, from the green and from inside the barn's door (a shut door is a wall
  // to a flood; the walk through it is the next test's).
  const reach = new Set([...flood(ground, { x: 3232, y: 3232 }), ...flood(ground, { x: 3241, y: 3299 })]);
  for (const [kind, at] of placed) {
    const o = ground.objects.find((o) => o.kind === kind && o.x === at.x && o.y === at.y);
    assert.ok(o, `a ${kind} at ${at.x},${at.y}`);
    assert.ok(o.id >= FIXED_IDS, `${kind}: under its place's own id`);
    assert.ok(canStand(bare, at.x, at.y) && overlayAt(bare, at.x, at.y) !== OVERLAY_PATH, `${kind}: its tile was free ground and no path`);
    // The classic's reach: a tile beside it, north, south, east or west, reached on foot with no wall between.
    const beside = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const).filter(([dx, dy]) =>
      reach.has(`${at.x + dx},${at.y + dy}`) && !ground.collision.wallBetween(at.x + dx, at.y + dy, -dx, -dy));
    assert.ok(beside.length > 0, `${kind}: a tile beside it is reached on foot`);
  }
  // Clay is a beginner's rock: nothing that starts fights can reach a tile beside one, whether it stands at home
  // or at the far end of its wander (a creature notices a player within its `aggro` of where it stands).
  const fighters = ground.monsters.filter((m) => MONSTER_BY_KEY.get(m.monster)!.aggro > 0);
  assert.ok(fighters.some((m) => m.monster === "cave_bat"), "the quarry's bats are among them");
  for (const r of CLAY_ROCKS) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const near = fighters.find((m) => {
        const d = MONSTER_BY_KEY.get(m.monster)!;
        return Math.max(Math.abs(m.x - (r.x + dx)), Math.abs(m.y - (r.y + dy))) <= d.wander + d.aggro;
      });
      assert.equal(near, undefined, `clay rock at ${r.x},${r.y}: out of reach of anything that starts fights`);
    }
  }
  // The trough stands outside the pen, against its north fence: reached from the barnyard, not from the pen.
  assert.ok(reach.has(`${TROUGH.x},${TROUGH.y + 1}`), "the trough is reached from the barnyard side");
  assert.ok(ground.collision.wallBetween(TROUGH.x, TROUGH.y - 1, 0, 1), "and the pen's fence runs along its back");
});

test("walked to through the real world: the barn's potter's wheel, the farm's kiln and trough, and a kiln at Kilnhold all open their lists", () => {
  const stack = buildOakridge(OAKRIDGE_SEED), ground = stack.planes.get(0)!;
  const world = new World(stack, () => 0.99);
  const p = world.add("Potter", undefined, {
    at: { x: 3241, y: 3296 }, inventory: packed([["clay", 1], ["soft_clay", 1], ["unfired_pot", 1]]),
  });
  const find = (kind: string, at: { x: number; y: number }) => ground.objects.find((o) => o.kind === kind && o.x === at.x && o.y === at.y)!;
  const opens = (o: MapObject, use?: string) => {
    p.messages = [];
    world.closeScreen(p);
    world.interact(p, o.id, use ? p.inventory.findIndex((s) => s?.id === id(use)) : null);
    return stepUntil(world, () => p.screen?.kind === "make", 80);
  };
  assert.ok(opens(find("trough", TROUGH), "clay"), `the trough takes the clay (${JSON.stringify(p.messages)})`);
  const door = ground.objects.find((o) => o.kind === "door" && o.x === 3241 && o.y === 3298)!;
  world.closeScreen(p);
  world.interact(p, door.id);
  assert.ok(stepUntil(world, () => world.opened.has(door.id), 60), "the barn door opens");
  assert.ok(opens(find("potters_wheel", POTTERS_WHEEL)), `the potter's wheel's list opens (${JSON.stringify(p.messages)})`);
  assert.ok(opens(find("kiln", FARM_KILN)), `and the farm's kiln's (${JSON.stringify(p.messages)})`);
  // Kilnhold: set down in the kiln yard, the nearest kiln fires pots too.
  const kilnhold = ground.objects.find((o) => o.kind === "kiln" && o.x === KILNS[0]!.x && o.y === KILNS[0]!.y)!;
  world.travel(p, KILNS[0]!.x, KILNS[0]!.y - 1, 0);
  assert.ok(opens(kilnhold), `a Kilnhold kiln's list opens (${JSON.stringify(p.messages)})`);
  assert.deepEqual((p.screen as { recipes: number[] }).recipes.map((i) => RECIPES[i]!.item), ["pot", "pie_dish", "bowl", "plant_pot", "pot_lid"]);
});
