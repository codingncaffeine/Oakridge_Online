// The magic shops (magicshops.ts): a seller of staves, runes and glimstone in a house its town already had,
// within a walk of every altar that takes plain glimstone. Each one's sign, counters and keeper stand in that
// house; a player walks in off the street and buys a stack of glimstone at the set price; the keeper talks and
// offers the trade; and opening them moved nothing else in the world.
import assert from "node:assert/strict";
import { test } from "node:test";
import { addItem, countOf, emptyInventory } from "../src/server/inventory.ts";
import { World, type Player } from "../src/server/world.ts";
import { GLIMSTONE_STACK, item, ITEM_BY_ID } from "../src/shared/items.ts";
import { doorEdge, MAGIC_SHOPS, type MagicShop } from "../src/shared/magicshops.ts";
import { FIXED_IDS, type MapObject, type WorldStack } from "../src/shared/map.ts";
import { MONSTER_BY_KEY } from "../src/shared/monsters.ts";
import { buildOakridge, OAKRIDGE_SEED } from "../src/shared/oakridge.ts";
import { ALTARS } from "../src/shared/runesmithing.ts";
import { GLIMSTONE_PRICE, SHOPS } from "../src/shared/shops.ts";

const stack = buildOakridge(OAKRIDGE_SEED);
const ground = stack.planes.get(0)!;
const glim = item("glimstone").id, coins = item("coins").id;
const inBox = (s: MagicShop) => (o: { x: number; y: number }) => o.x >= s.box.x0 && o.x <= s.box.x1 && o.y >= s.box.y0 && o.y <= s.box.y1;

function stepUntil(world: World, done: () => boolean, ticks = 80): boolean {
  for (let i = 0; i < ticks && !done(); i++) world.step();
  return done();
}

/** The street tile outside a shop's door. */
function outside(s: MagicShop): { x: number; y: number } {
  const at = doorEdge(s.box, s.door);
  const [dx, dy] = [[0, 1], [1, 0], [0, -1], [-1, 0]][s.door.side]!;
  return { x: at.x + dx!, y: at.y + dy! };
}

test("each magic shop stands in its town's house: a star by the door, a counter row that is the shop's, and its keeper behind it", () => {
  for (const s of MAGIC_SHOPS) {
    const here = inBox(s);
    const counters = ground.objects.filter((o) => o.kind === "counter" && here(o));
    assert.ok(counters.length >= 2, `${s.tag}: ${counters.length} counters`);
    assert.ok(counters.every((o) => o.tag === s.tag && o.id >= FIXED_IDS), `${s.tag}: every counter is the shop's, put in after every roll`);
    const at = doorEdge(s.box, s.door);
    assert.ok(ground.objects.some((o) => o.kind === "door" && o.x === at.x && o.y === at.y && o.side === at.side), `${s.tag}: the house's own door`);
    const sign = ground.objects.find((o) => o.kind === "sign" && o.side === s.door.side && here(o));
    assert.equal(sign?.tag, "star", `${s.tag}: a star on the wall by the door`);
    assert.ok(Math.abs(sign!.x - at.x) + Math.abs(sign!.y - at.y) <= 2, `${s.tag}: beside the door`);
    const keepers = ground.monsters.filter((m) => m.monster === s.keeper);
    assert.equal(keepers.length, 1, `${s.tag}: one keeper`);
    assert.ok(here(keepers[0]!), `${s.tag}: inside the house`);
    const def = MONSTER_BY_KEY.get(s.keeper)!;
    assert.equal(def.shop, s.tag);
    assert.equal(SHOPS[s.tag]!.keeper, def.name, `${s.tag}: the shop names its keeper`);
    assert.ok(SHOPS[s.tag]!.stock.some((l) => l.id === glim && l.price === GLIMSTONE_PRICE), `${s.tag}: glimstone at ${GLIMSTONE_PRICE}`);
    assert.ok(SHOPS[s.tag]!.stock.some((l) => ITEM_BY_ID.get(l.id)!.key.endsWith("_staff")), `${s.tag}: and staves`);
  }
});

/**
 * Every altar that takes plain glimstone has a seller of it within a walk: the magic shops are where it is
 * sold, one near each of those altars. The control: without them, glimstone is sold in Thornbury alone,
 * and the Gale, Thought, Tide and Ember altars have nobody near.
 */
test("every altar that takes plain glimstone has a shop selling it within 160 tiles, and without the magic shops four do not", () => {
  const far = (world: WorldStack) => {
    const sellers = world.planes.get(0)!.objects.filter((o) => o.kind === "counter" && SHOPS[o.tag ?? ""]?.stock.some((l) => l.id === glim));
    return ALTARS.filter((a) => !a.pure).filter((a) => !sellers.some((o) => Math.max(Math.abs(o.x - a.at.x), Math.abs(o.y - a.at.y)) <= 160)).map((a) => a.rune);
  };
  assert.deepEqual(far(stack), [], "a seller near every one");
  assert.deepEqual(far(buildOakridge(OAKRIDGE_SEED, { magicshops: false })), ["gale_rune", "thought_rune", "tide_rune", "ember_rune"], "the control");
  // And none of the general stores sells it: magic supplies are the magic shops' trade.
  const sellers = Object.entries(SHOPS).filter(([, def]) => def.stock.some((l) => l.id === glim)).map(([key]) => key).sort();
  assert.deepEqual(sellers, ["thornbury_staves", ...MAGIC_SHOPS.map((s) => s.tag)].sort());
});

test("a player walks in off the street at every magic shop, and a stack of glimstone costs 99 times 5 coins and fills one slot", () => {
  const world = new World(stack, () => 0.5);
  MAGIC_SHOPS.forEach((s, n) => {
    const street = outside(s);
    const inv = emptyInventory();
    addItem(inv, coins, 1000);
    const p: Player = world.add(`Carver${n}`, undefined, { at: street, inventory: inv });
    const at = doorEdge(s.box, s.door);
    const door = ground.objects.find((o) => o.kind === "door" && o.x === at.x && o.y === at.y)!;
    world.interact(p, door.id);
    assert.ok(stepUntil(world, () => world.opened.has(door.id)), `${s.tag}: the door opens`);
    const counter = ground.objects.find((o): o is MapObject => o.kind === "counter" && o.tag === s.tag)!;
    world.interact(p, counter.id);
    assert.ok(stepUntil(world, () => p.screen?.kind === "shop"), `${s.tag}: the shop opens (${JSON.stringify(p.messages)})`);
    const shop = world.shopFor(p)!;
    assert.equal(shop.key, s.tag);
    world.buy(p, shop.stock.findIndex((l) => l.id === glim), GLIMSTONE_STACK);
    assert.equal(countOf(p.inventory, glim), GLIMSTONE_STACK, `${s.tag}: a stack bought`);
    assert.equal(p.inventory.filter((x) => x?.id === glim).length, 1, `${s.tag}: in one slot`);
    assert.equal(countOf(p.inventory, coins), 1000 - GLIMSTONE_STACK * GLIMSTONE_PRICE, `${s.tag}: at ${GLIMSTONE_PRICE} coins each, whatever the shelf`);
  });
});

test("each keeper talks, points the way to the altar near them, and offers the trade", () => {
  const world = new World(stack, () => 0.5);
  MAGIC_SHOPS.forEach((s, n) => {
    const keeper = [...world.npcs.values()].find((k) => k.def.key === s.keeper)!;
    const p = world.add(`Asker${n}`, undefined, { at: outside(s) });
    const at = doorEdge(s.box, s.door);
    const door = ground.objects.find((o) => o.kind === "door" && o.x === at.x && o.y === at.y)!;
    world.interact(p, door.id);
    stepUntil(world, () => world.opened.has(door.id));
    world.talk(p, keeper.id);
    assert.ok(stepUntil(world, () => p.screen?.kind === "talk"), `${s.tag}: the conversation opens (${JSON.stringify(p.messages)})`);
    const box = world.dialogueFor(p)!;
    assert.equal(box.speaker, keeper.def.name);
    const ask = box.options.findIndex((t) => /altar|runes come from/i.test(t));
    assert.ok(ask >= 0, `${s.tag}: the altar can be asked about: ${JSON.stringify(box.options)}`);
    world.answer(p, ask);
    const told = world.dialogueFor(p)!.lines.join(" ");
    assert.match(told, /Gale|Tide|Ember/, `${s.tag}: names the altar near it`);
    assert.match(told, /charm/, `${s.tag}: and that it takes a charm`);
    const trade = world.dialogueFor(p)!.options.findIndex((t) => /show me/i.test(t));
    world.answer(p, trade);
    assert.equal(world.shopFor(p)?.key, s.tag, `${s.tag}: the trade opens the keeper's own shop`);
  });
});

/**
 * A build without a town opens no shop in it and builds nothing where it would have stood: the shop checks for
 * its house's door before it hangs a sign, and a sign on ground no site built would build a region there.
 */
test("a build without Kilnhold opens no shop there and builds no scrap of it", () => {
  const without = buildOakridge(OAKRIDGE_SEED, { kilnhold: false }), bare = buildOakridge(OAKRIDGE_SEED, { kilnhold: false, magicshops: false });
  const objects = without.planes.get(0)!.objects;
  assert.ok(!objects.some((o) => o.kind === "counter" && o.tag === "kilnhold_staves"), "no counter of Brenner's");
  assert.ok(!without.planes.get(0)!.monsters.some((m) => m.monster === "ember_seller"), "and no keeper");
  assert.equal(without.planes.get(0)!.regions.size, bare.planes.get(0)!.regions.size, "and no region built for it");
  // The control: the other two still open.
  assert.deepEqual(MAGIC_SHOPS.filter((s) => objects.some((o) => o.kind === "counter" && o.tag === s.tag)).map((s) => s.tag), ["oakridge_runes", "wickstead_staves"]);
});

test("opening the magic shops moved nothing else: every other object keeps its id and place, every region its ground, every creature its spawn", () => {
  const without = buildOakridge(OAKRIDGE_SEED, { magicshops: false });
  const key = (o: MapObject) => `${o.id}:${o.kind}:${o.x},${o.y}:${o.side}:${o.variant}:${o.tag ?? ""}`;
  for (const [plane, before] of without.planes) {
    const after = stack.planes.get(plane)!;
    // Everything before, in order, then only the shops' signs and counters.
    assert.equal(after.objects.slice(0, before.objects.length).map(key).join("|"), before.objects.map(key).join("|"), `plane ${plane}: every object as it was`);
    const added = after.objects.slice(before.objects.length);
    assert.ok(added.every((o) => (o.kind === "sign" && o.tag === "star") || (o.kind === "counter" && MAGIC_SHOPS.some((s) => s.tag === o.tag))), `plane ${plane}: only signs and counters added`);
    for (const r of before.regions.values()) {
      const both = [...after.regions.values()].find((x) => x.rx === r.rx && x.ry === r.ry)!;
      for (const field of ["heights", "underlay", "overlay", "indoors", "roofs"] as const) assert.deepEqual([...both[field]], [...r[field]], `plane ${plane}, region ${r.rx},${r.ry}: ${field}`);
    }
    assert.equal(after.regions.size, before.regions.size, `plane ${plane}: no region built for them`);
    assert.deepEqual(after.monsters.slice(0, before.monsters.length), before.monsters, `plane ${plane}: every creature and person where they were`);
    assert.deepEqual(after.monsters.slice(before.monsters.length).map((m) => m.monster), plane === 0 ? MAGIC_SHOPS.map((s) => s.keeper) : []);
  }
  // The control: three signs and the counters are what is new.
  const added = ground.objects.length - without.planes.get(0)!.objects.length;
  assert.equal(added, 3 + ground.objects.filter((o) => o.kind === "counter" && MAGIC_SHOPS.some((s) => s.tag === o.tag)).length);
});
