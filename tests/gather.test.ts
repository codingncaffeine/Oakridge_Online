import assert from "node:assert/strict";
import { test } from "node:test";
import { countOf, emptyInventory, starterKit } from "../src/server/inventory.ts";
import { World, type Player } from "../src/server/world.ts";
import {
  CATCHES, FISHING_METHODS, RESOURCES, TOOLS, type FishingMethod, type Yield,
} from "../src/shared/gathering.ts";
import { item, ITEM_BY_KEY } from "../src/shared/items.ts";
import { blankMap, ORE_KINDS, TREE_KINDS, type ObjectKind, type WorldMap } from "../src/shared/map.ts";
import {
  GATHER_START, gotItem, levelUp, NEED_BAIT, NEED_TOOL, needLevel, NOTHING_COMES, PACK_FULL, toolNeedsLevel,
} from "../src/shared/messages.ts";
import { reaches } from "../src/shared/pathfind.ts";
import { noXp, successChance, xpForLevel } from "../src/shared/skills.ts";

const id = (key: string) => item(key).id;

/** A 32×32 field with the given objects (each blocking its tile) and fishing waters. Players start at 16,16. */
function field(
  objects: Array<[ObjectKind, number, number]>,
  waters: Array<Array<[number, number]>> = [],
  method: FishingMethod = "net",
): WorldMap {
  const map = blankMap(32, 32);
  for (const [kind, x, y] of objects) {
    map.objects.push({ id: map.objects.length, kind, x, y, plane: 0, side: 0, variant: 0.5 });
    map.collision.block(x, y);
  }
  for (const tiles of waters) {
    for (const [x, y] of tiles) map.collision.block(x, y);
    map.fishing.push({ tiles: tiles.map(([x, y]) => ({ x, y })), count: 1, method });
  }
  return map;
}

/** Random numbers the test sets as it goes: `roll.next` is returned until changed, `roll.queue` first. */
function scripted(first: number) {
  const roll = { next: first, queue: [] as number[] };
  return { roll, rand: () => roll.queue.shift() ?? roll.next };
}

const stepUntil = (world: World, ok: () => boolean, max = 600) => {
  for (let i = 0; i < max && !ok(); i++) world.step();
  assert.ok(ok(), "never happened");
};
const said = (p: Player, text: string) => p.messages.includes(text);
const level = (skill: "woodcutting" | "mining" | "fishing", l: number) => ({ ...noXp(), [skill]: xpForLevel(l) });

test("chopping: walk beside the tree, face it, roll every 4 ticks, and a plain tree falls after one log", () => {
  const { roll, rand } = scripted(0.99);
  const world = new World(field([["tree", 16, 20]]), rand);
  const p = world.add("Chopper", undefined, { inventory: starterKit() });
  const watcher = world.add("Watcher", undefined, { at: { x: 10, y: 10 } });
  world.interact(p, world.objectAt(16, 20)!.id);
  stepUntil(world, () => p.gathering !== null);
  assert.deepEqual([p.x, p.y], [16, 19], "beside the tree's south side");
  assert.ok(said(p, GATHER_START.chop));
  assert.deepEqual(p.act, { anim: "chop", tool: id("bronze_axe"), x: 16, y: 20 });
  assert.deepEqual(world.viewFor(watcher).ents.find((e) => e.id === p.id)?.act, p.act, "others see the chopping");
  const started = world.tick;

  for (let i = 0; i < 12; i++) world.step();
  assert.equal(countOf(p.inventory, id("logs")), 0, "failed rolls give nothing");
  roll.next = 0;
  stepUntil(world, () => countOf(p.inventory, id("logs")) === 1);
  assert.equal((world.tick - started) % 4, 0, "a log only ever comes on a roll, every 4 ticks");
  assert.equal(p.xp.woodcutting, 220);
  assert.ok(said(p, gotItem("chop", "Logs")));
  assert.ok(world.depleted.has(0), "the tree fell");
  assert.deepEqual(world.objectChanges, [[0, 1]]);
  assert.equal(p.gathering, null);
  assert.equal(p.act, null);
  assert.equal(world.viewFor(watcher).ents.find((e) => e.id === p.id)?.act, null, "others see it stop");

  const fell = world.tick;
  stepUntil(world, () => !world.depleted.has(0));
  assert.equal(world.tick - fell, 50, "back after its shortest time (the random numbers are pinned at 0)");
  assert.deepEqual(world.objectChanges, [[0, 0]]);
});

test("a better axe raises the chance; a better pickaxe swings sooner", () => {
  // At Woodcutting 14 a plain tree gives a log on a roll under 90/256 with bronze, under 160/256 with steel.
  const chopWith = (axe: string) => {
    const world = new World(field([["tree", 16, 18]]), () => 0.5);
    const inv = emptyInventory();
    inv[0] = { id: id(axe), count: 1 };
    const p = world.add("Chopper", undefined, { inventory: inv, xp: level("woodcutting", 14) });
    world.interact(p, world.objectAt(16, 18)!.id);
    for (let i = 0; i < 12; i++) world.step();
    return countOf(p.inventory, id("logs"));
  };
  assert.equal(chopWith("bronze_axe"), 0);
  assert.equal(chopWith("steel_axe"), 1);

  // Every roll draws one random number, so the ticks of the draws are the ticks of the swings.
  const swings = (pick: string) => {
    const draws: number[] = [];
    const world: World = new World(field([["copper_rock", 16, 17]]), () => { draws.push(world.tick); return 0.99; });
    const p = world.add("Miner", undefined, { equipment: { weapon: { id: id(pick), count: 1 } }, xp: level("mining", 14) });
    world.interact(p, world.objectAt(16, 17)!.id);
    stepUntil(world, () => p.gathering !== null);
    const started = world.tick;
    for (let i = 0; i < 30; i++) world.step();
    return [started, ...draws].slice(0, 4).map((t, i, all) => (i ? t - all[i - 1]! : 0)).slice(1);
  };
  assert.deepEqual(swings("bronze_pickaxe"), [8, 8, 8]);
  assert.deepEqual(swings("iron_pickaxe"), [7, 7, 7]);
  assert.deepEqual(swings("steel_pickaxe"), [6, 6, 6]);
});

test("the best tool the player has the level for is used, worn or carried", () => {
  const start = (xp: number, inv: string[], wield?: string) => {
    const world = new World(field([["tree", 16, 17]]), () => 0.99);
    const inventory = emptyInventory();
    inv.forEach((key, i) => { inventory[i] = { id: id(key), count: 1 }; });
    const p = world.add("Chopper", undefined, {
      inventory, equipment: wield ? { weapon: { id: id(wield), count: 1 } } : {}, xp: level("woodcutting", xp),
    });
    world.interact(p, world.objectAt(16, 17)!.id);
    world.step();
    return p;
  };
  assert.equal(start(1, ["bronze_axe"], "steel_axe").act?.tool, id("bronze_axe"), "the wielded steel axe needs level 14");
  assert.equal(start(14, ["bronze_axe"], "steel_axe").act?.tool, id("steel_axe"));
  assert.equal(start(14, ["iron_axe", "steel_axe"]).act?.tool, id("steel_axe"), "carried is as good as wielded");
  const tooHard = start(1, ["steel_axe"]);
  assert.equal(tooHard.gathering, null);
  assert.ok(said(tooHard, toolNeedsLevel("Steel axe", "Woodcutting", 14)), tooHard.messages.join(" | "));
  const none = start(1, ["tinderbox"]);
  assert.ok(said(none, NEED_TOOL.axe), none.messages.join(" | "));
});

test("an oak needs the level, and its timer is shared: it runs while anyone chops and refills while nobody does", () => {
  const world = new World(field([["oak", 16, 18]]), () => 0);
  const low = world.add("Sapling", undefined, { inventory: starterKit() });
  world.interact(low, world.objectAt(16, 18)!.id);
  stepUntil(world, () => low.messages.length > 0);
  assert.ok(said(low, needLevel("Woodcutting", 12, "oak")), low.messages.join(" | "));
  assert.equal(low.gathering, null);
  world.remove(low.id);

  // One chopper who never misses: a log every 4 ticks while the 30-tick timer runs, then the log that fells it.
  const a = world.add("Axeman", undefined, { inventory: starterKit(), xp: level("woodcutting", 12) });
  world.interact(a, world.objectAt(16, 18)!.id);
  stepUntil(world, () => world.depleted.has(0));
  assert.equal(countOf(a.inventory, id("oak_logs")), 8, "7 logs while the timer runs, then the 8th fells it");

  // Chop 10 ticks, walk off for 10: the timer is full again, so the next go also takes 8 logs.
  stepUntil(world, () => !world.depleted.has(0));
  const b = world.add("Returner", undefined, { inventory: starterKit(), xp: level("woodcutting", 12) });
  world.interact(b, world.objectAt(16, 18)!.id);
  stepUntil(world, () => b.gathering !== null);
  for (let i = 0; i < 9; i++) world.step();
  world.walk(b, b.x, b.y - 3);
  for (let i = 0; i < 10; i++) world.step();
  const before = countOf(b.inventory, id("oak_logs"));
  world.interact(b, world.objectAt(16, 18)!.id);
  stepUntil(world, () => world.depleted.has(0));
  assert.equal(countOf(b.inventory, id("oak_logs")) - before, 8);

  // Two choppers share one timer: it falls on the same tick as for one, but both got logs meanwhile.
  stepUntil(world, () => !world.depleted.has(0));
  const c = world.add("North", undefined, { inventory: starterKit(), xp: level("woodcutting", 12), at: { x: 16, y: 20 } });
  const d = world.add("South", undefined, { inventory: starterKit(), xp: level("woodcutting", 12), at: { x: 16, y: 16 } });
  world.interact(c, world.objectAt(16, 18)!.id);
  world.interact(d, world.objectAt(16, 18)!.id);
  stepUntil(world, () => world.depleted.has(0));
  assert.equal(countOf(c.inventory, id("oak_logs")) + countOf(d.inventory, id("oak_logs")), 15, "the 8th roll fells it for whoever rolls first");
  assert.equal(c.gathering, null);
  assert.equal(d.gathering, null, "everyone chopping it stops when it falls");
});

test("a rock runs out after one ore and comes back; a full pack stops gathering", () => {
  const world = new World(field([["copper_rock", 16, 18], ["oak", 20, 16]]), () => 0);
  const p = world.add("Miner", undefined, { inventory: starterKit() });
  world.interact(p, world.objectAt(16, 18)!.id);
  stepUntil(world, () => world.depleted.has(0));
  assert.equal(countOf(p.inventory, id("copper_ore")), 1);
  assert.equal(p.xp.mining, 160);
  assert.ok(said(p, gotItem("mine", "Copper ore")));
  const out = world.tick;
  stepUntil(world, () => !world.depleted.has(0));
  assert.equal(world.tick - out, 5);

  // 27 things carried: the first oak log fills the pack, and the next roll stops with a message.
  const inv = emptyInventory();
  for (let i = 0; i < 27; i++) inv[i] = { id: id("bread"), count: 1 };
  inv[0] = { id: id("bronze_axe"), count: 1 };
  const full = world.add("Hoarder", undefined, { inventory: inv, xp: level("woodcutting", 12) });
  world.interact(full, world.objectAt(20, 16)!.id);
  stepUntil(world, () => said(full, PACK_FULL));
  assert.equal(countOf(full.inventory, id("oak_logs")), 1);
  assert.equal(full.gathering, null);
  world.interact(full, world.objectAt(20, 16)!.id);
  world.step();
  world.step();
  assert.equal(full.gathering, null, "a full pack can't start");
});

test("net fishing: the higher-level catch is rolled first; the spot moves and whoever fished it stops", () => {
  const { roll, rand } = scripted(0);
  const map = field([], [[[20, 16], [20, 22]]]);
  const world = new World(map, rand);
  const spot = world.spots[0]!;
  assert.deepEqual([spot.x, spot.y], [20, 16], "pinned at 0, the first tile");
  const fisher = world.add("Fisher", undefined, { inventory: starterKit() });
  world.fish(fisher, 0);
  stepUntil(world, () => countOf(fisher.inventory, id("raw_sardine")) === 1);
  assert.deepEqual([fisher.x, fisher.y], [19, 16]);
  assert.ok(said(fisher, gotItem("net", "Raw sardine")));
  assert.equal(fisher.xp.fishing, 110, "level 1 only ever nets sardines");
  // Off to one side while the next fisher rolls, so the scripted numbers are all theirs.
  world.walk(fisher, 16, 16);
  assert.equal(fisher.gathering, null);

  const pro = world.add("Pro", undefined, { inventory: starterKit(), xp: level("fishing", 14), at: { x: 20, y: 15 } });
  world.fish(pro, 0);
  stepUntil(world, () => countOf(pro.inventory, id("raw_smelt")) === 1);
  roll.queue.push(0.99, 0);
  stepUntil(world, () => countOf(pro.inventory, id("raw_sardine")) === 1);
  assert.equal(countOf(pro.inventory, id("raw_smelt")), 1, "a missed smelt roll still gets its sardine roll");

  // Both fish on with every roll missing (so neither pack fills) until the spot moves at its shortest time.
  roll.next = 0.99;
  world.fish(fisher, 0);
  stepUntil(world, () => world.tick === 249);
  assert.ok(fisher.gathering !== null && pro.gathering !== null, "both still fishing the tick before it moves");
  world.step();
  assert.deepEqual(world.spotChanges, [{ id: 0, x: 20, y: 22, method: "net" }], "it moved at tick 250, the shortest stay");
  assert.equal(fisher.gathering, null);
  assert.equal(pro.gathering, null);

  // Walking to a spot as it moves: the walk follows it.
  world.fish(fisher, 0);
  spot.moveAt = world.tick + 1;
  stepUntil(world, () => fisher.gathering !== null);
  assert.deepEqual([spot.x, spot.y], [20, 16]);
  assert.ok(reaches(map.collision, fisher.x, fisher.y, { x: 20, y: 16, w: 1, h: 1 }), `fishing the spot where it went, from ${fisher.x},${fisher.y}`);
});

/**
 * The three ladders of PLAN §8, checked against the order they are declared in rather than against a
 * copy of the numbers: a tier left out, put in the wrong place, or pointing at an item that doesn't
 * exist fails here rather than when a player walks up to it.
 */
test("every rung of the woodcutting, mining and fishing ladders is there, in order", () => {
  const rungs = (kinds: readonly ObjectKind[]) => kinds.map((kind) => {
    const def = RESOURCES[kind];
    assert.ok(def, `${kind} has no resource`);
    assert.ok(ITEM_BY_KEY.has(def.yields.item), `${kind} gives ${def.yields.item}, which is not an item`);
    return def.yields;
  });
  const rises = (name: string, values: number[]) =>
    values.forEach((v, i) => assert.ok(i === 0 || v > values[i - 1]!, `${name} at rung ${i}: ${v} after ${values[i - 1]}`));
  /**
   * Each rung is slower to work than the one below it, judged at the level it needs — which is the only
   * place the two can be compared. Their `high` values say nothing on their own: both copper and iron
   * pass 256/256 well before level 99, so at 99 they are both simply certain.
   */
  const harder = (name: string, rungs: Yield[]) => rungs.forEach((y, i) => {
    if (i === 0) return;
    const below = rungs[i - 1]!;
    const mine = successChance(y.low, y.high, y.level), under = successChance(below.low, below.high, y.level);
    assert.ok(mine < under, `${name}: ${y.item} at level ${y.level} is ${mine}, no harder than ${below.item} at ${under}`);
  });

  // Eight tiers of tree and eight of rock; the mining ladder's first rung is copper and tin together.
  const trees = rungs(TREE_KINDS);
  const rocks = rungs(ORE_KINDS.filter((k) => k !== "tin_rock"));
  // The fishing ladder interleaves its tools — creel 45, harpoon 58, creel 70, harpoon 85 — so it is
  // read in level order, not tool order. That interleaving is §8.4's point: it walks you round the coast.
  const fish = FISHING_METHODS.flatMap((m) => CATCHES[m]).sort((a, b) => a.level - b.level);
  assert.deepEqual([trees.length, rocks.length, fish.length], [8, 8, 8]);
  assert.deepEqual(
    [trees.at(-1)!.level, rocks.at(-1)!.level, fish.at(-1)!.level], [90, 78, 85],
    "the top of each ladder is where §8 puts it",
  );
  assert.equal(CATCHES.net[1]!.item, "raw_sardine", "the very first catch is the net's sardine");
  assert.equal(RESOURCES.coal_rock!.yields.level, 22, "coal is Mining 22, and Phase 7 builds it");

  for (const [name, rungs] of [["tree", trees], ["rock", rocks]] as const) {
    rises(`${name} level`, rungs.map((y) => y.level));
    rises(`${name} XP`, rungs.map((y) => y.xp));
    harder(name, rungs);
    for (const y of rungs) assert.ok(y.low < y.high, `${y.item}: ${y.low} at level 1 is not below ${y.high} at 99`);
  }
  // Fishing climbs in tool pairs: a rod is simply a better instrument than a net, so only the level and
  // the XP run all the way up. Within a pair, the better fish is the harder one.
  rises("fish level", fish.map((y) => y.level));
  rises("fish XP", fish.map((y) => y.xp));
  for (const m of FISHING_METHODS) harder(m, [...CATCHES[m]].reverse());
  for (const tools of Object.values(TOOLS)) for (const t of tools) assert.ok(ITEM_BY_KEY.has(t.item), `no item ${t.item}`);
});

test("each way of fishing wants its own tool, and a rod spends bait until there is none", () => {
  // A harpoon spot is no use to someone holding a net, however good they are.
  const netted = new World(field([], [[[20, 16]]], "harpoon"), () => 0);
  const wrong = netted.add("Netter", undefined, { inventory: starterKit(), xp: level("fishing", 58) });
  netted.fish(wrong, 0);
  stepUntil(netted, () => wrong.messages.length > 0);
  assert.ok(said(wrong, NEED_TOOL.harpoon), wrong.messages.join(" | "));
  assert.equal(wrong.gathering, null);

  const world = new World(field([], [[[20, 16]]], "angle"), () => 0);
  const inv = emptyInventory();
  inv[0] = { id: id("fishing_rod"), count: 1 };
  inv[1] = { id: id("bait"), count: 2 };
  const p = world.add("Angler", undefined, { inventory: inv, xp: level("fishing", 22) });
  world.fish(p, 0);
  stepUntil(world, () => countOf(p.inventory, id("raw_redfin")) === 2);
  assert.ok(said(p, GATHER_START.angle) && said(p, gotItem("angle", "Raw redfin")), p.messages.join(" | "));
  assert.equal(countOf(p.inventory, id("bait")), 0, "one bait a fish");
  stepUntil(world, () => said(p, NEED_BAIT));
  assert.equal(p.gathering, null, "out of bait stops the fishing");
  assert.equal(countOf(p.inventory, id("raw_redfin")), 2, "and no fish comes without one");

  // Rod and bait in hand is not enough: the water itself wants Fishing 22, and that gate comes first.
  const kit = emptyInventory();
  kit[0] = { id: id("fishing_rod"), count: 1 };
  kit[1] = { id: id("bait"), count: 5 };
  const early = world.add("Early", undefined, { inventory: kit, at: { x: 20, y: 18 } });
  world.fish(early, 0);
  stepUntil(world, () => early.messages.length > 0);
  assert.ok(said(early, needLevel("Fishing", 22, "spot")), early.messages.join(" | "));
  assert.equal(early.gathering, null);
  assert.equal(countOf(early.inventory, id("bait")), 5, "and nothing was spent finding out");
});

test("a level-up: a message, fireworks everyone nearby sees, and XP stops at 200 million", () => {
  const world = new World(field([["tree", 16, 17]]), () => 0);
  const p = world.add("Climber", undefined, { inventory: starterKit(), xp: { ...noXp(), woodcutting: xpForLevel(2) - 10 } });
  const watcher = world.add("Watcher", undefined, { at: { x: 12, y: 12 } });
  world.interact(p, world.objectAt(16, 17)!.id);
  stepUntil(world, () => p.xp.woodcutting > xpForLevel(2));
  assert.ok(said(p, levelUp("Woodcutting", 2)), p.messages.join(" | "));
  assert.equal(world.viewFor(watcher).ents.find((e) => e.id === p.id)?.fx, "levelup");
  world.step();
  assert.equal(world.viewFor(watcher).ents.find((e) => e.id === p.id)?.fx, undefined, "only in that tick");

  const capped = world.add("Capped", undefined, { inventory: starterKit(), xp: { ...noXp(), woodcutting: 2_000_000_000 - 100 } });
  stepUntil(world, () => !world.depleted.has(0));
  world.interact(capped, world.objectAt(16, 17)!.id);
  stepUntil(world, () => countOf(capped.inventory, id("logs")) === 1);
  assert.equal(capped.xp.woodcutting, 2_000_000_000);
});

test("the player hears their own item handling: taking, dropping, wielding and wearing", () => {
  const world = new World(field([]), () => 0);
  const p = world.add("Handler", undefined, { inventory: starterKit() });
  world.putDown({ id: id("bread"), count: 1 }, p.x, p.y, null, p.plane);
  const loaf = [...world.ground.values()].at(-1)!;
  world.take(p, loaf.uid);
  stepUntil(world, () => p.sounds.length > 0);
  assert.deepEqual(p.sounds, ["take"], "picking it up");
  p.sounds = [];

  world.equip(p, p.inventory.findIndex((s) => s?.id === id("bronze_axe")));
  assert.deepEqual(p.sounds, ["wield"], "an axe goes in the hand");
  p.sounds = [];
  world.unequip(p, "weapon");
  assert.deepEqual(p.sounds, ["wield"]);
  p.sounds = [];

  const shirt = emptyInventory();
  shirt[0] = { id: id("leather_jerkin"), count: 1 };
  const dressed = world.add("Dressed", undefined, { inventory: shirt });
  world.equip(dressed, 0);
  assert.deepEqual(dressed.sounds, ["wear"], "a jerkin goes on the body");

  world.drop(p, p.inventory.findIndex((s) => s?.id === id("bread")));
  assert.deepEqual(p.sounds, ["drop"]);
  p.sounds = [];
  world.equip(p, p.inventory.findIndex((s) => s === null));
  assert.deepEqual(p.sounds, [], "nothing to hear when there is nothing to equip");
});

test("using an item on an object walks there, then nothing comes of it", () => {
  const world = new World(field([["tree", 16, 19]]), () => 0.99);
  const p = world.add("User", undefined, { inventory: starterKit() });
  world.interact(p, world.objectAt(16, 19)!.id, 3);
  stepUntil(world, () => said(p, NOTHING_COMES));
  assert.deepEqual([p.x, p.y], [16, 18]);
  assert.equal(p.gathering, null, "using a tinderbox on a tree doesn't chop it");
});
