import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addItem, bonusesOf, canHold, countOf, emptyInventory, equipFrom, readEquipment, readInventory, roomFor, spendItem, starterKit, swapSlots,
  takeFrom, unequip, weightOf, type Equipment,
} from "../src/server/inventory.ts";
import { GLIMSTONE_STACK, item, ITEMS, MAX_STACK, slotLimit, stackLabel } from "../src/shared/items.ts";
import { CANT_WEAR, NO_ROOM } from "../src/shared/messages.ts";

const coins = item("coins").id, logs = item("logs").id, axe = item("bronze_axe").id, dagger = item("bronze_dagger").id;

test("item ids are unique and permanent-looking", () => {
  assert.equal(new Set(ITEMS.map((d) => d.id)).size, ITEMS.length);
  assert.equal(new Set(ITEMS.map((d) => d.key)).size, ITEMS.length);
});

test("stackables share one slot; other items take a slot each", () => {
  const inv = emptyInventory();
  assert.equal(addItem(inv, coins, 50), 0);
  assert.equal(addItem(inv, coins, 25), 0);
  assert.equal(inv.filter(Boolean).length, 1);
  assert.equal(countOf(inv, coins), 75);
  assert.equal(addItem(inv, logs, 30), 3, "27 free slots, 3 logs left over");
  assert.equal(countOf(inv, logs), 27);
  assert.equal(canHold(inv, logs, 1), false);
  assert.equal(canHold(inv, coins, 1), true, "coins still stack onto their slot");
  assert.equal(addItem(inv, coins, MAX_STACK), 75, "a stack stops at the maximum");
});

/**
 * A capped stack (glimstone, 99 a slot): what comes in tops up the stacks already there before it starts
 * another, the room left is what those stacks lack plus a stackful a free slot, and what does not fit comes
 * back. Uncapped stackables keep their one slot (the test above).
 */
test("glimstone stacks 99 to a slot: new stones top up the stacks there first, and the room left says what will fit", () => {
  const glim = item("glimstone").id, pure = item("pure_glimstone").id;
  assert.deepEqual([GLIMSTONE_STACK, slotLimit(item("glimstone")), slotLimit(item("pure_glimstone")), slotLimit(item("logs")), slotLimit(item("coins"))], [99, 99, 99, 1, MAX_STACK]);
  const inv = emptyInventory();
  assert.equal(addItem(inv, glim, 150), 0);
  assert.deepEqual(inv.filter(Boolean).map((s) => s!.count), [99, 51], "150 is a full stack and one of 51");
  assert.equal(addItem(inv, glim, 60), 0);
  assert.deepEqual(inv.filter(Boolean).map((s) => s!.count), [99, 99, 12], "the 51 filled up before a new stack began");
  addItem(inv, logs, 25);
  assert.equal(roomFor(inv, glim), 87, "a full pack has room for what its last stack lacks");
  assert.deepEqual([canHold(inv, glim, 87), canHold(inv, glim, 88)], [true, false]);
  assert.equal(addItem(inv, glim, 100), 13, "87 fit and 13 come back");
  assert.equal(countOf(inv, glim), 297);
  assert.equal(spendItem(inv, glim, 150), true, "a spend takes from any stack");
  assert.equal(countOf(inv, glim), 147);
  // Pure glimstone stacks the same way, and a stack's weight counts once, as every stackable's does.
  const bag = emptyInventory();
  addItem(bag, pure, 198);
  assert.deepEqual(bag.filter(Boolean).map((s) => s!.count), [99, 99]);
  assert.equal(weightOf(bag, {}), 0.6);
  assert.equal(roomFor(bag, logs), 26, "one log a free slot");
});

test("taking, swapping and weight", () => {
  const inv = emptyInventory();
  addItem(inv, coins, 10);
  addItem(inv, logs, 2);
  assert.deepEqual(takeFrom(inv, 0, 4), { id: coins, count: 4 });
  assert.equal(countOf(inv, coins), 6);
  swapSlots(inv, 0, 5);
  assert.equal(inv[0], null);
  assert.equal(inv[5]?.id, coins);
  assert.equal(weightOf(inv, {}), 4, "two logs at 2 kg; coins weigh nothing");
});

test("equipping swaps with what was worn; unequipping needs space", () => {
  const inv = emptyInventory();
  addItem(inv, axe, 1);
  addItem(inv, dagger, 1);
  const equip: Equipment = {};
  assert.equal(equipFrom(inv, equip, 0), null);
  assert.equal(equip.weapon?.id, axe);
  assert.equal(inv[0], null);
  assert.equal(equipFrom(inv, equip, 1), null, "the dagger replaces the axe");
  assert.equal(equip.weapon?.id, dagger);
  assert.equal(inv[1]?.id, axe, "the axe goes where the dagger was");
  assert.equal(equipFrom(inv, equip, 1), null);
  assert.equal(equipFrom(inv, equip, 5), CANT_WEAR);
  assert.ok(bonusesOf(equip)[1]! > 0, "a slash bonus from the axe");
  addItem(inv, logs, 27);
  assert.equal(unequip(inv, equip, "weapon"), NO_ROOM);
});

test("saves are read back defensively, and the starter kit is complete", () => {
  assert.equal(readInventory(undefined), null, "no inventory in the save");
  const inv = readInventory([{ id: coins, count: 5 }, { id: 9999, count: 1 }, { id: logs, count: -1 }, "junk"]);
  assert.deepEqual(inv!.slice(0, 4), [{ id: coins, count: 5 }, null, null, null]);
  assert.deepEqual(readEquipment({ weapon: { id: axe, count: 1 }, head: { id: axe, count: 1 } }), { weapon: { id: axe, count: 1 } }, "an axe isn't a hat");
  const kit = starterKit();
  assert.equal(kit.filter(Boolean).length, 8);
  assert.equal(countOf(kit, coins), 25);
});

test("stack labels follow the classic colours", () => {
  assert.deepEqual(stackLabel(99_999), { text: "99999", color: "yellow" });
  assert.deepEqual(stackLabel(100_000), { text: "100K", color: "white" });
  assert.deepEqual(stackLabel(12_345_678), { text: "12M", color: "green" });
});
