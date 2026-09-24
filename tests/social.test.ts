// Following and trading (PLAN Phase 10), on the world: a follower keeps beside the one followed and
// stops when anything else is asked for; a trade opens when both ask, holds what is put on the table
// out of both packs, takes two acceptances from each side before anything moves, gives everything
// back when either walks away or shuts it, and refuses to complete into a pack with no room.
import assert from "node:assert/strict";
import { test } from "node:test";
import { addItem, countOf } from "../src/server/inventory.ts";
import { TRADE_REQUEST_TICKS, World, type Player } from "../src/server/world.ts";
import { item } from "../src/shared/items.ts";
import { blankMap } from "../src/shared/map.ts";
import { NO_ROOM, noRoomFor, TRADE_DONE, tradeDeclined, tradeSent, tradeWish } from "../src/shared/messages.ts";

const field = () => blankMap(32, 32);
const stepUntil = (world: World, ok: () => boolean, max = 200) => {
  for (let i = 0; i < max && !ok(); i++) world.step();
  return ok();
};
const apart = (a: Player, b: Player) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
/** Which screen a player has open, read afresh (a checker that has seen it null would otherwise think it stays so). */
const screenOf = (p: Player): string | null => (p as { screen: { kind: string } | null }).screen?.kind ?? null;

test("following: after them until beside them, again when they move on, and over the moment anything else is asked for", () => {
  const world = new World(field(), () => 0.5);
  const a = world.add("A", undefined, { at: { x: 5, y: 5 } });
  const b = world.add("B", undefined, { at: { x: 14, y: 5 } });
  world.follow(a, b.id);
  assert.equal(a.follow, b.id);
  assert.ok(stepUntil(world, () => apart(a, b) === 1), "A walks up beside B");
  assert.equal(a.path.length, 0, "and stops there");
  world.walk(b, 24, 5);
  for (let i = 0; i < 14; i++) world.step();
  assert.ok(apart(a, b) <= 2, `A stays on B's heels (${apart(a, b)} apart)`);
  assert.ok(stepUntil(world, () => apart(a, b) === 1), "and is beside them again when B stops");
  // A's own walk ends the following.
  world.walk(a, 5, 5);
  world.step();
  assert.equal(a.follow, null, "a walk of their own ends it");
  assert.ok(stepUntil(world, () => a.x === 5 && a.y === 5), "and A goes where they asked");
  // Following someone who leaves the world ends too.
  world.follow(a, b.id);
  world.remove(b.id);
  world.step();
  assert.equal(a.follow, null);
  // The control: nobody follows themselves, or someone on another plane.
  world.follow(a, a.id);
  assert.equal(a.follow, null);
});

/** Two players beside each other, both with something to trade, and the trade opened between them. */
function tradingPair() {
  const world = new World(field(), () => 0.5);
  const a = world.add("A", undefined, { at: { x: 5, y: 5 } });
  const b = world.add("B", undefined, { at: { x: 6, y: 5 } });
  addItem(a.inventory, item("logs").id, 3);
  addItem(b.inventory, item("coins").id, 50);
  world.trade(a, b.id);
  world.step();
  assert.ok(a.messages.includes(tradeSent("B")), "A's request is sent");
  assert.ok(b.messages.includes(tradeWish("A")), "and B is told");
  assert.equal(screenOf(a), null, "nothing opens on one side's asking");
  world.trade(b, a.id);
  world.step();
  assert.equal(screenOf(a), "trade", "both asking opens it for A");
  assert.equal(screenOf(b), "trade", "and for B");
  return { world, a, b };
}

test("a trade: both must ask; what goes on the table leaves the pack; two acceptances each, and the exchange", () => {
  const { world, a, b } = tradingPair();
  const shown = world.tradeFor(a)!;
  assert.deepEqual([shown.with, shown.mine, shown.theirs, shown.stage, shown.accepted], ["B", [], [], "offer", [false, false]]);
  world.tradeOffer(a, 0, 2);
  assert.equal(countOf(a.inventory, item("logs").id), 1, "two logs left the pack");
  assert.deepEqual(world.tradeFor(a)!.mine, [{ id: item("logs").id, count: 2 }], "and lie on A's side of the table");
  assert.deepEqual(world.tradeFor(b)!.theirs, [{ id: item("logs").id, count: 2 }], "which B sees as theirs to get");
  world.tradeOffer(b, 0, 30);
  assert.equal(countOf(b.inventory, item("coins").id), 20);
  world.tradeAccept(a);
  assert.deepEqual(world.tradeFor(a)!.accepted, [true, false]);
  assert.deepEqual(world.tradeFor(b)!.accepted, [false, true], "B sees that A accepted");
  // Changing the table takes every acceptance back.
  world.tradeOffer(b, 0, 5);
  assert.deepEqual(world.tradeFor(a)!.accepted, [false, false], "a change to the table takes the acceptance back");
  assert.deepEqual(world.tradeFor(b)!.mine, [{ id: item("coins").id, count: 35 }]);
  // Taking something back.
  world.tradeTake(b, 0, 5);
  assert.equal(countOf(b.inventory, item("coins").id), 20);
  assert.deepEqual(world.tradeFor(b)!.mine, [{ id: item("coins").id, count: 30 }]);
  world.tradeAccept(a);
  world.tradeAccept(b);
  assert.equal(world.tradeFor(a)!.stage, "confirm", "both accepting moves to the confirmation");
  assert.deepEqual(world.tradeFor(a)!.accepted, [false, false], "where both must say yes again");
  world.tradeOffer(a, 0, 1);
  assert.equal(countOf(a.inventory, item("logs").id), 1, "and nothing more can be put on the table");
  world.tradeAccept(a);
  assert.equal(a.screen?.kind, "trade", "one yes is not enough");
  world.tradeAccept(b);
  assert.equal(a.screen, null, "the second closes the trade for A");
  assert.equal(b.screen, null, "and for B");
  assert.equal(countOf(a.inventory, item("coins").id), 30, "A has B's coins");
  assert.equal(countOf(a.inventory, item("logs").id), 1, "and the log kept back");
  assert.equal(countOf(b.inventory, item("logs").id), 2, "B has A's logs");
  assert.equal(countOf(b.inventory, item("coins").id), 20, "and the coins kept back");
  assert.ok(a.messages.includes(TRADE_DONE) && b.messages.includes(TRADE_DONE), "both are told");
  assert.equal(world.tradeFor(a), null, "and the trade is over");
});

test("a trade called off, by shutting it or by walking away, gives everything back and tells the other", () => {
  const { world, a, b } = tradingPair();
  world.tradeOffer(a, 0, 3);
  world.tradeOffer(b, 0, 50);
  world.closeScreen(a);
  assert.equal(countOf(a.inventory, item("logs").id), 3, "A's logs come back");
  assert.equal(countOf(b.inventory, item("coins").id), 50, "and B's coins");
  assert.equal(b.screen, null, "B's screen shuts too");
  assert.ok(b.messages.includes(tradeDeclined("A")), "and B is told who declined");
  assert.ok(!a.messages.includes(tradeDeclined("A")), "the control: A is not told about themselves");
  // Walking away shuts it the same way.
  const again = tradingPair();
  again.world.tradeOffer(again.a, 0, 1);
  again.world.walk(again.a, 10, 5);
  again.world.step();
  assert.equal(again.a.screen, null, "a step away shuts A's trade");
  assert.equal(again.b.screen, null, "and B's");
  assert.equal(countOf(again.a.inventory, item("logs").id), 3, "with the log back in A's pack");
  // Leaving the world in the middle of one.
  const third = tradingPair();
  third.world.tradeOffer(third.b, 0, 50);
  third.world.remove(third.b.id);
  assert.equal(third.a.screen, null, "B leaving shuts A's trade");
  assert.equal(countOf(third.b.inventory, item("coins").id), 50, "and B's coins are back in B's pack before they go");
});

test("a trade into a pack with no room is refused, and stays open to be changed", () => {
  const { world, a, b } = tradingPair();
  // B's pack: 28 kinds of thing, none of them logs.
  const fillers = [
    "oak_logs", "copper_ore", "tin_ore", "iron_ore", "raw_sardine", "bronze_axe", "bronze_pickaxe", "fishing_net", "tinderbox", "bronze_dagger",
    "wooden_shield", "leather_cap", "leather_jerkin", "leather_trousers", "leather_gloves", "leather_boots", "red_cape", "bread", "iron_axe",
    "steel_axe", "iron_pickaxe", "steel_pickaxe", "raw_smelt", "bones", "bronze_sword", "bronze_mace", "bronze_helm",
  ];
  for (const key of fillers) addItem(b.inventory, item(key).id, 1);
  assert.equal(b.inventory.filter((s) => s !== null).length, 28, "B's pack is full (coins and 27 others)");
  world.tradeOffer(a, 0, 3);
  world.tradeAccept(a);
  world.tradeAccept(b);
  world.tradeAccept(a);
  world.tradeAccept(b);
  assert.equal(a.screen?.kind, "trade", "the trade stays open");
  assert.equal(world.tradeFor(a)!.stage, "offer", "back on the offer screen");
  assert.ok(a.messages.includes(noRoomFor("B")) && b.messages.includes(noRoomFor("B")), "both told whose pack is full");
  assert.equal(countOf(a.inventory, item("logs").id), 0, "the logs are still on the table");
  // Taking back needs room too.
  world.tradeOffer(b, 1, 1);
  const bFull = b.inventory.filter((s) => s !== null).length;
  for (const key of ["silver_ore"]) addItem(b.inventory, item(key).id, 1);
  assert.equal(b.inventory.filter((s) => s !== null).length, bFull + 1);
  world.tradeTake(b, 0, 1);
  assert.ok(b.messages.includes(NO_ROOM), "B cannot take back into a full pack");
  // A request goes stale.
  const late = new World(field(), () => 0.5);
  const c = late.add("C", undefined, { at: { x: 5, y: 5 } }), d = late.add("D", undefined, { at: { x: 6, y: 5 } });
  late.trade(c, d.id);
  late.step();
  for (let i = 0; i <= TRADE_REQUEST_TICKS; i++) late.step();
  late.trade(d, c.id);
  late.step();
  assert.equal(c.screen, null, "C's old request has gone stale, so D's is a new one");
  assert.ok(c.messages.includes(tradeWish("D")));
});
