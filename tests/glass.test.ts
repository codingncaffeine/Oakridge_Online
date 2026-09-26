// Crafting, built out (PLAN Phase 20), C5: glass. A bucket filled at a sandpit in the Dunes, seaweed off Brinehaven's
// shore burnt to soda ash, the two melted into molten glass at a furnace (the bucket comes back), and the glass blown
// there with a pipe into the reference's pieces at its levels and XP. The sandpits and the seaweed stand where a
// beginner can reach them on foot and nothing that starts fights can reach them, and the seaweed washes up again.
import assert from "node:assert/strict";
import { test } from "node:test";
import { addItem, countOf, emptyInventory } from "../src/server/inventory.ts";
import { canStand, World, type Player } from "../src/server/world.ts";
import { SANDPITS, SEAWEED, SEAWEED_RESPAWN } from "../src/shared/craftworks.ts";
import { INVENTORY_SIZE, item } from "../src/shared/items.ts";
import { blankMap, FIXED_IDS, isEdgeKind, oneMap, overlayAt, OVERLAY_PATH, OVERLAY_WATER, type MapObject, type WorldMap, type WorldStack } from "../src/shared/map.ts";
import { ASHED, blownInto, FILLED_SAND, MELTED, needMaterials } from "../src/shared/messages.ts";
import { MONSTER_BY_KEY } from "../src/shared/monsters.ts";
import { buildOakridge, OAKRIDGE_SEED } from "../src/shared/oakridge.ts";
import { RECIPES } from "../src/shared/recipes.ts";
import { SHOPS } from "../src/shared/shops.ts";
import { noXp, xpForLevel } from "../src/shared/skills.ts";
import { STATION_OF, STATION_VERB } from "../src/shared/stations.ts";

const id = (key: string) => item(key).id;

/** A 32×32 field with the objects a test names, and nothing else. */
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

/** A run at a bench, opened by clicking it or by using an item on it: what it offers, and what the run said. */
function makeAt(world: World, p: Player, bench: MapObject, made: string, use?: string, count = -1): { said: string[]; offered: string[] } {
  p.messages = [];
  world.interact(p, bench.id, use ? p.inventory.findIndex((s) => s?.id === id(use)) : null);
  assert.ok(stepUntil(world, () => p.screen?.kind === "make"), `the ${bench.kind} offers its list (${JSON.stringify(p.messages)})`);
  const offered = (p.screen as { recipes: number[] }).recipes.map((i) => RECIPES[i]!.item);
  const at = offered.indexOf(made);
  assert.ok(at >= 0, `and ${made} is on it`);
  world.make(p, at, count);
  assert.ok(stepUntil(world, () => p.making === null, 120), "the run finishes");
  return { said: p.messages, offered };
}

const BLOWN: Array<[string, number, number]> = [
  ["beer_glass", 1, 175], ["candle_lantern", 4, 190], ["oil_lamp", 12, 250], ["vial", 33, 350],
  ["fishbowl", 42, 425], ["glass_orb", 46, 525], ["lantern_lens", 49, 550], ["light_orb", 87, 700],
];

test("glass is at the reference's levels and XP: sand and ash for nothing, molten glass at 1, and every piece blown at its own", () => {
  const row = (key: string) => {
    const r = RECIPES.filter((r) => r.item === key);
    assert.equal(r.length, 1, `one recipe makes ${key}`);
    const [only] = r;
    return [key, only!.level, only!.xp, only!.at.join("|"), only!.tool ?? "", only!.needs.map((n) => `${n.item}×${n.count}`).join(" "),
      (only!.returns ?? []).map((n) => `${n.item}×${n.count}`).join(" ")];
  };
  const want: unknown[][] = [
    ["bucket_of_sand", 1, 0, "sand", "", "bucket×1", ""],
    ["soda_ash", 1, 0, "fire|range", "", "seaweed×1", ""],
    ["molten_glass", 1, 200, "furnace", "", "bucket_of_sand×1 soda_ash×1", "bucket×1"],
    ...BLOWN.map(([key, level, xp]) => [key, level, xp, "furnace", "glassblowing_pipe", "molten_glass×1", ""]),
  ];
  assert.deepEqual(want.map((w) => row(w[0] as string)), want);
  // A sandpit is a place a bucket is used on, as a trough is for clay: no click of its own.
  assert.deepEqual([STATION_OF.sandpit, STATION_VERB.sand], ["sand", null]);
});

test("a bucket filled at a sandpit, seaweed burnt to ash, both melted at a furnace with the bucket back, and the glass blown, in a glassmaker's words", () => {
  const stack = field([["sandpit", 16, 18], ["range", 14, 16], ["furnace", 18, 16]]);
  const world = new World(stack, () => 0.99);
  const p = world.add("Glassmaker", undefined, {
    at: { x: 16, y: 16 }, inventory: packed([["bucket", 3], ["seaweed", 3]]), xp: { ...noXp(), crafting: xpForLevel(46) },
  });
  const [pit, range, furnace] = stack.planes.get(0)!.objects;

  // A sandpit has nothing to do on its own; a bucket used on it opens the filling list.
  p.messages = [];
  world.interact(p, pit!.id);
  assert.equal(p.action, null, "clicking a sandpit starts nothing");
  const filled = makeAt(world, p, pit!, "bucket_of_sand", "bucket");
  assert.deepEqual(filled.offered, ["bucket_of_sand"]);
  assert.ok(filled.said.includes(FILLED_SAND), `filled: ${JSON.stringify(filled.said)}`);
  assert.deepEqual([countOf(p.inventory, id("bucket")), countOf(p.inventory, id("bucket_of_sand"))], [0, 3]);
  const ashed = makeAt(world, p, range!, "soda_ash");
  assert.ok(ashed.said.includes(ASHED), `ashed: ${JSON.stringify(ashed.said)}`);
  assert.deepEqual([countOf(p.inventory, id("seaweed")), countOf(p.inventory, id("soda_ash"))], [0, 3]);
  assert.equal(p.xp.crafting, xpForLevel(46), "neither pays anything");

  // Melted at the furnace: three molten glass, and the three buckets back.
  const melted = makeAt(world, p, furnace!, "molten_glass");
  assert.ok(melted.said.includes(MELTED), `melted: ${JSON.stringify(melted.said)}`);
  assert.deepEqual([id("bucket_of_sand"), id("soda_ash"), id("molten_glass"), id("bucket")].map((i) => countOf(p.inventory, i)), [0, 0, 3, 3],
    "the sand and ash are glass, and the buckets are back");
  assert.equal(p.xp.crafting - xpForLevel(46), 600, "20 XP a melt");

  // Blowing wants the pipe: without it the furnace shows the glass and refuses it.
  const orb = RECIPES.find((r) => r.item === "glass_orb")!;
  assert.deepEqual(world.canMakeNow(p, orb), { left: 0, why: needMaterials("Glass orb") });
  addItem(p.inventory, id("glassblowing_pipe"), 1);
  const before = p.xp.crafting;
  const blown = makeAt(world, p, furnace!, "glass_orb", undefined, 1);
  assert.ok(blown.said.includes(blownInto("Glass orb")), `blown: ${JSON.stringify(blown.said)}`);
  assert.equal(blownInto("Glass orb"), "You blow the molten glass into a glass orb.");
  assert.equal(p.xp.crafting - before, 525, "52.5 XP an orb");
  assert.ok(blown.offered.includes("light_orb") && blown.offered.includes("vial"), "the furnace offers every piece");
  makeAt(world, p, furnace!, "vial", undefined, 1);
  assert.deepEqual([countOf(p.inventory, id("glass_orb")), countOf(p.inventory, id("vial")), countOf(p.inventory, id("molten_glass"))], [1, 1, 1]);
  assert.equal(countOf(p.inventory, id("glassblowing_pipe")), 1, "and the pipe is kept");
});

test("a full pack melts glass too: the sand and ash leave before the glass and the bucket need their room", () => {
  const stack = field([["furnace", 16, 17]]);
  const world = new World(stack, () => 0.99);
  const p = world.add("Packed", undefined, { at: { x: 16, y: 16 }, inventory: emptyInventory() });
  for (let i = 0; i < INVENTORY_SIZE / 2; i++) {
    addItem(p.inventory, id("bucket_of_sand"), 1);
    addItem(p.inventory, id("soda_ash"), 1);
  }
  assert.equal(p.inventory.filter((s) => s === null).length, 0, "every slot is taken");
  makeAt(world, p, stack.planes.get(0)!.objects[0]!, "molten_glass");
  assert.deepEqual([countOf(p.inventory, id("molten_glass")), countOf(p.inventory, id("bucket"))], [INVENTORY_SIZE / 2, INVENTORY_SIZE / 2]);
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

test("the sandpits stand at the Dunes' edge by Sandreach and the seaweed on Brinehaven's shore: free ground, reached on foot, out of every fight's reach", () => {
  const stack = buildOakridge(OAKRIDGE_SEED), ground = stack.planes.get(0)!;
  const bare = buildOakridge(OAKRIDGE_SEED, { craftworks: false }).planes.get(0)!;
  const fighters = ground.monsters.filter((m) => MONSTER_BY_KEY.get(m.monster)!.aggro > 0);
  const clear = (x: number, y: number) => fighters.find((m) => {
    const d = MONSTER_BY_KEY.get(m.monster)!;
    return Math.max(Math.abs(m.x - x), Math.abs(m.y - y)) <= d.wander + d.aggro;
  });
  // The sandpits: from Sandreach's square, a tile beside each is reached on foot, and nothing that starts fights reaches it.
  const sandreach = flood(ground, { x: 3872, y: 3043 });
  assert.ok(fighters.some((m) => m.monster === "dune_scorpion"), "the Dunes' scorpions are among them");
  for (const at of SANDPITS) {
    const o = ground.objects.find((o) => o.kind === "sandpit" && o.x === at.x && o.y === at.y);
    assert.ok(o, `a sandpit at ${at.x},${at.y}`);
    assert.ok(o.id >= FIXED_IDS, "under its place's own id");
    assert.ok(canStand(bare, at.x, at.y) && overlayAt(bare, at.x, at.y) !== OVERLAY_PATH, `sandpit ${at.x},${at.y}: its tile was free ground and no path`);
    const beside = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const).filter(([dx, dy]) => sandreach.has(`${at.x + dx},${at.y + dy}`));
    assert.ok(beside.length > 0, `sandpit ${at.x},${at.y}: a tile beside it is reached on foot from the square`);
    for (const [dx, dy] of beside) assert.equal(clear(at.x + dx, at.y + dy)?.monster, undefined, `sandpit ${at.x},${at.y}: out of reach of anything that starts fights`);
  }
  // The seaweed: an item that lies on the tide line, beside the sea, reached from Brinehaven's square, back in a minute.
  const brinehaven = flood(ground, { x: 2916, y: 3044 });
  for (const at of SEAWEED) {
    const spawn = ground.spawns.find((s) => s.item === "seaweed" && s.x === at.x && s.y === at.y);
    assert.ok(spawn, `seaweed at ${at.x},${at.y}`);
    assert.equal(spawn.respawn, SEAWEED_RESPAWN);
    assert.ok(brinehaven.has(`${at.x},${at.y}`), `seaweed at ${at.x},${at.y} is reached on foot from the square`);
    assert.ok(([[1, 0], [-1, 0], [0, 1], [0, -1]] as const).some(([dx, dy]) => overlayAt(ground, at.x + dx, at.y + dy) === OVERLAY_WATER), `seaweed at ${at.x},${at.y} lies beside the sea`);
    assert.equal(clear(at.x, at.y)?.monster, undefined, `seaweed at ${at.x},${at.y}: out of reach of anything that starts fights`);
  }
  // Sold where it is wanted: buckets at Oakridge's general store and the Caravan Post, the pipe at the Post.
  const sells = (shop: string, key: string) => SHOPS[shop]!.stock.some((l) => l.id === id(key) && l.count > 0);
  assert.deepEqual([sells("oakridge_general", "bucket"), sells("sandreach_caravan", "bucket"), sells("sandreach_caravan", "glassblowing_pipe")], [true, true, true]);
});

test("seaweed taken off the shore washes up again a minute later", () => {
  const stack = buildOakridge(OAKRIDGE_SEED);
  const world = new World(stack, () => 0.99);
  const at = SEAWEED[0]!;
  const p = world.add("Beachcomber", undefined, { at: { x: at.x - 1, y: at.y }, inventory: emptyInventory() });
  const lying = () => [...world.ground.values()].find((g) => g.id === id("seaweed") && g.x === at.x && g.y === at.y);
  const weed = lying();
  assert.ok(weed, "the seaweed lies on the shore");
  world.take(p, weed.uid);
  assert.ok(stepUntil(world, () => countOf(p.inventory, id("seaweed")) === 1, 20), "and is taken");
  assert.equal(lying(), undefined, "leaving the shore bare");
  const taken = world.tick;
  assert.ok(stepUntil(world, () => lying() !== undefined, SEAWEED_RESPAWN + 20), "until the tide brings more");
  assert.ok(world.tick - taken >= SEAWEED_RESPAWN - 1, `after its minute (${world.tick - taken} ticks)`);
});
