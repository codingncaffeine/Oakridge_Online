import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addItem, bonusesOf, canHold, countOf, emptyBags, emptyInventory, equipFrom, fitPack, packSize, readBags, readEquipment, readInventory,
  removeBag, roomFor, spendItem, starterKit, swapSlots, takeFrom, unequip, wearBag, weightOf, type Equipment,
} from "../src/server/inventory.ts";
import { BAG_SLOTS, GLIMSTONE_STACK, INVENTORY_SIZE, item, ITEMS, MAX_PACK, MAX_STACK, slotLimit, stackLabel } from "../src/shared/items.ts";
import { BAGS_FULL, CANT_WEAR, NO_ROOM, takeOffNeeds } from "../src/shared/messages.ts";

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

/**
 * Worn bags (Crafting, C2): each adds its slots to the end of the pack, five at most; one comes off only when
 * the pack has as many empty slots as it takes away and one more for the bag, the empty ones nearest the end
 * going first so the rest stay where they were. Nothing is ever lost to a pack changing size.
 */
test("worn bags add their slots to the end of the pack, five at most, and come off only with room for their slots and themselves", () => {
  const pouch = item("small_pouch").id, pack = item("large_backpack").id;
  assert.deepEqual(["small_pouch", "large_pouch", "small_bag", "large_bag", "small_backpack", "large_backpack"].map((k) => item(k).bag), [4, 6, 8, 12, 16, 20]);
  assert.deepEqual([BAG_SLOTS, MAX_PACK], [5, INVENTORY_SIZE + 5 * 20]);
  const inv = emptyInventory(), bags = emptyBags();
  addItem(inv, pouch, 1);
  addItem(inv, pack, 1);
  assert.equal(wearBag(inv, bags, 0), null);
  assert.deepEqual([inv.length, packSize(bags), inv[0], bags[0]?.id], [32, 32, null, pouch], "the pouch is worn and the pack has 32 slots");
  assert.equal(wearBag(inv, bags, 1), null);
  assert.equal(inv.length, 52, "and the backpack's twenty more");
  assert.equal(wearBag(inv, bags, 5), CANT_WEAR, "an empty slot is not a bag");
  addItem(inv, logs, 45);
  assert.equal(inv.filter((x) => x === null).length, 7);
  assert.equal(removeBag(inv, bags, 1), takeOffNeeds("Large backpack", 21), "twenty slots and one for it, and only seven are empty");
  assert.equal(countOf(inv, logs), 45);
  // Emptied down to 30 logs: 22 empty, enough to take the backpack off. The logs keep their places.
  for (let slot = 51, n = 15; n > 0; slot--) if (inv[slot]?.id === logs) { inv[slot] = null; n--; }
  const before = inv.slice(0, 30).map((x) => x?.id ?? 0);
  assert.equal(removeBag(inv, bags, 1), null);
  assert.deepEqual([inv.length, countOf(inv, logs), countOf(inv, pack), bags[1]], [32, 30, 1, null], "32 slots again, every log kept, the backpack in the pack");
  assert.deepEqual(inv.slice(0, 30).map((x) => x?.id ?? 0), before, "and the logs where they were");
  // Five at most.
  const full = emptyInventory(), five = emptyBags();
  addItem(full, pouch, 6);
  for (let n = 0; n < 5; n++) assert.equal(wearBag(full, five, full.findIndex((x) => x?.id === pouch)), null);
  assert.equal(wearBag(full, five, full.findIndex((x) => x?.id === pouch)), BAGS_FULL, "the sixth bag is refused");
  assert.deepEqual([full.length, countOf(full, pouch)], [48, 1], "five pouches worn, the sixth still in the pack");
});

test("a pack read back or fitted to fewer slots keeps everything in it, and a save's bags are only bags", () => {
  const inv = emptyInventory(40);
  inv[35] = { id: logs, count: 1 };
  fitPack(inv, 28);
  assert.deepEqual([inv.length, inv[27]?.id], [28, logs], "the empty slots go, and the log at 35 moves down to the last slot left");
  const crowded = emptyInventory(30);
  addItem(crowded, logs, 30);
  fitPack(crowded, 28);
  assert.deepEqual([crowded.length, countOf(crowded, logs)], [30, 30], "thirty logs keep a pack thirty long rather than lose two");
  const read = readInventory([{ id: logs, count: 1 }], 32)!;
  assert.deepEqual([read.length, countOf(read, logs)], [32, 1], "a save's pack fitted out to the bags' size");
  assert.deepEqual(readBags([{ id: item("small_pouch").id, count: 1 }, { id: logs, count: 1 }, null, "junk"]).map((b) => b?.id ?? 0), [item("small_pouch").id, 0, 0, 0, 0]);
  assert.equal(readBags(undefined).length, BAG_SLOTS, "a save from before bags wears none");
  assert.equal(weightOf(emptyInventory(), {}, [{ id: item("large_backpack").id, count: 1 }]), 1.6, "a worn bag weighs what it weighs");
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
