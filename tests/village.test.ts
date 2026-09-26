// Phase 7's systems, and Phase 8's rules: the bank, shops whose prices move with stock, doors that
// swing, stairs that change plane, conversations, and everything the workbenches make.
import assert from "node:assert/strict";
import { test } from "node:test";
import { BLOCKED } from "../src/shared/collision.ts";
import { ITEM_BY_ID, ITEM_BY_KEY, INVENTORY_SIZE, item, type Stack } from "../src/shared/items.ts";
import { blankMap, isEdgeKind, oneMap, type MapObject, type WorldMap, type WorldStack } from "../src/shared/map.ts";
import { BANK_FULL, NO_ROOM, SHOP_NO_BUY, TOO_POOR } from "../src/shared/messages.ts";
import { buyPrice, GLIMSTONE_PRICE, sellPrice, SHOPS } from "../src/shared/shops.ts";
import { burnChance, FIRES, RECIPES, recipesAt } from "../src/shared/recipes.ts";
import { SKILL_KEYS, levelForXp, xpForLevel } from "../src/shared/skills.ts";
import { DIALOGUE, DIALOGUE_START } from "../src/shared/dialogue.ts";
import { addItem, countOf, emptyInventory, type Inventory } from "../src/server/inventory.ts";
import { buy, deposit, drift, emptyBank, newShop, sell, withdraw } from "../src/server/trading.ts";
import { findPath } from "../src/shared/pathfind.ts";
import { DOOR_TICKS, World, type Player } from "../src/server/world.ts";

const coins = item("coins").id, logs = item("logs").id, bread = item("bread").id;

/** A small flat map with whatever objects a test needs, so a check is about one thing only. */
function field(objects: Array<[string, number, number, Partial<MapObject>?]> = [], planes = 1): WorldStack {
  const maps: WorldMap[] = [];
  let id = 1;
  for (let p = 0; p < planes; p++) {
    const map = blankMap(32, 32, 0, 0, p);
    maps.push(map);
  }
  for (const [kind, x, y, extra] of objects) {
    const plane = extra?.plane ?? 0;
    const map = maps[plane]!;
    const o: MapObject = { id: id++, kind: kind as MapObject["kind"], x, y, plane, side: 0, variant: 0.5, ...extra };
    map.objects.push(o);
    if (isEdgeKind(o.kind)) map.collision.addWall(x, y, o.side);
    else map.collision.block(x, y);
  }
  const stack = oneMap(maps[0]!, { x: 16, y: 16 }, "field");
  for (const map of maps.slice(1)) stack.planes.set(map.plane, map);
  return stack;
}

/** Runs the world until `done`, or gives up after `ticks`. */
function stepUntil(world: World, done: () => boolean, ticks = 60): boolean {
  for (let i = 0; i < ticks; i++) {
    if (done()) return true;
    world.step();
  }
  return done();
}

const said = (p: Player, text: string) => p.messages.includes(text);

// --- The bank ------------------------------------------------------------------------------------

test("the bank stacks everything, and gives it back a slot at a time", () => {
  const inv = emptyInventory(), bank = emptyBank();
  // Six loose logs in six slots: the bank holds them in one.
  addItem(inv, logs, 6);
  assert.equal(inv.filter((s) => s?.id === logs).length, 6, "logs do not stack in a pack");
  assert.equal(deposit(inv, bank, inv.findIndex((s) => s?.id === logs), -1), null);
  assert.equal(bank.filter(Boolean).length, 1, "and take one bank slot between them");
  assert.equal(bank[0]!.count, 6);
  assert.equal(inv.filter(Boolean).length, 0, "with nothing left in the pack");

  // Back out again: unstackable things need a pack slot each, so "all" is capped by the room there is.
  for (let i = 0; i < INVENTORY_SIZE - 2; i++) addItem(inv, bread, 1);
  assert.equal(withdraw(inv, bank, 0, -1), null);
  assert.equal(inv.filter((s) => s?.id === logs).length, 2, "only what fits comes out");
  assert.equal(bank[0]!.count, 4, "the rest stays in the bank");
});

test("a full bank says so, and a full pack refuses a withdrawal", () => {
  const inv = emptyInventory(), bank = emptyBank();
  // Every bank slot spoken for by a different kind of thing.
  const kinds = [...ITEM_BY_ID.keys()].slice(0, bank.length);
  bank.forEach((_, i) => { bank[i] = { id: kinds[i % kinds.length]!, count: 1 }; });
  // A kind the bank is not already holding has nowhere to go.
  const spare = [...ITEM_BY_ID.keys()].find((id) => !bank.some((s) => s?.id === id));
  if (spare !== undefined) {
    addItem(inv, spare, 1);
    assert.equal(deposit(inv, bank, inv.findIndex((s) => s?.id === spare), 1), BANK_FULL);
  }
  // A kind it IS holding still fits, which is the control: the bank is full of kinds, not of things.
  const known = bank[0]!.id;
  addItem(inv, known, 1);
  assert.equal(deposit(inv, bank, inv.findIndex((s) => s?.id === known), 1), null);

  const packed = emptyInventory();
  for (let i = 0; i < INVENTORY_SIZE; i++) addItem(packed, bread, 1);
  assert.equal(withdraw(packed, bank, 0, 1), NO_ROOM);
});

test("a banker opens the bank, and walking away shuts it", () => {
  const stack = field([["bank_booth", 16, 18]]);
  const world = new World(stack);
  const p = world.add("Saver", undefined, { inventory: emptyInventory() });
  addItem(p.inventory, logs, 3);
  world.interact(p, world.objectAt(16, 18)!.id);
  assert.ok(stepUntil(world, () => p.screen?.kind === "bank"), "standing at the booth opens the bank");
  world.deposit(p, p.inventory.findIndex((s) => s?.id === logs), -1);
  assert.equal(p.bank.find((s) => s?.id === logs)?.count, 3);
  world.walk(p, 16, 10);
  assert.ok(stepUntil(world, () => p.screen === null, 5), "and walking away shuts it");
});

// --- Shops ----------------------------------------------------------------------------------------

test("a shop charges more as its shelf empties, and pays less as it fills", () => {
  const def = SHOPS.oakridge_general!;
  const line = def.stock.find((l) => l.count > 4)!;
  const normal = line.count;
  const full = buyPrice(def, line.id, normal, normal);
  const short = buyPrice(def, line.id, 1, normal);
  const over = buyPrice(def, line.id, normal * 3, normal);
  assert.ok(short > full, `a bare shelf costs more (${short} > ${full})`);
  assert.ok(over < full, `a piled one costs less (${over} < ${full})`);
  // ⛔ Nothing may make coins out of a counter: what it pays is always under what it charges.
  for (const stock of [0, 1, normal, normal * 2, normal * 10]) {
    assert.ok(
      sellPrice(def, line.id, stock, normal) < buyPrice(def, line.id, stock, normal),
      `at stock ${stock} it pays less than it charges`,
    );
  }
});

test("buying takes the coins and the stock; selling is refused for what a shop does not deal in", () => {
  const shop = newShop("oakridge_tools", 0);
  const inv = emptyInventory();
  const axe = shop.stock.find((l) => l.id === item("bronze_axe").id)!;
  const price = buyPrice(shop.def, axe.id, axe.count, SHOPS.oakridge_tools!.stock.find((l) => l.id === axe.id)!.count);
  addItem(inv, coins, price * 2);
  const before = axe.count;
  assert.equal(buy(inv, shop, shop.stock.indexOf(axe), 1), null);
  assert.equal(axe.count, before - 1, "one leaves the shelf");
  assert.ok(inv.some((s) => s?.id === axe.id), "and arrives in the pack");
  assert.ok((inv.find((s) => s?.id === coins)?.count ?? 0) < price * 2, "the coins are spent");

  // Nothing to spend: the shop says so rather than handing anything over.
  const poor = emptyInventory();
  assert.equal(buy(poor, shop, shop.stock.indexOf(axe), 1), TOO_POOR);

  // The tool shop deals in tools, not in bread.
  const seller = emptyInventory();
  addItem(seller, bread, 1);
  assert.equal(sell(seller, shop, seller.findIndex((s) => s?.id === bread), 1), SHOP_NO_BUY);
  // The general store takes anything: the control for the line above.
  const general = newShop("oakridge_general", 0);
  assert.equal(sell(seller, general, seller.findIndex((s) => s?.id === bread), 1), null);
});

/**
 * Glimstone stacks 99 a slot, so a withdrawal of it fills the pack a stackful a free slot and no further: the
 * bank keeps the rest. A withdrawal that asked only whether there was a free slot would move all 500 and lose
 * what the pack could not hold.
 */
test("withdrawing glimstone fills the pack 99 a slot, the bank keeps what will not fit, and depositing takes every stack back", () => {
  const glim = item("glimstone").id;
  const bank = emptyBank(), inv = emptyInventory();
  bank[0] = { id: glim, count: 500 };
  addItem(inv, logs, 25);
  assert.equal(withdraw(inv, bank, 0, -1), null);
  const kept = () => bank[0]?.count ?? 0;
  assert.deepEqual([countOf(inv, glim), kept()], [297, 203], "three free slots, three stacks");
  assert.equal(withdraw(inv, bank, 0, -1), NO_ROOM);
  assert.equal(deposit(inv, bank, inv.findIndex((s) => s?.id === glim), -1), null);
  assert.deepEqual([countOf(inv, glim), kept()], [0, 500], "every stack back in the one bank slot");
});

/**
 * Glimstone on the ground lies in piles of at most a stackful, so any one pile goes into a single slot: a
 * pile joins the one already there only while that has room, and the rest lies beside it.
 */
test("glimstone on the ground lies in piles of 99 at most, and each one can be taken into a single slot", () => {
  const glim = item("glimstone").id;
  const world = new World(field());
  const inv = emptyInventory();
  addItem(inv, logs, 27);
  const p = world.add("Gleaner", undefined, { at: { x: 10, y: 10 }, inventory: inv });
  world.putDown({ id: glim, count: 150 }, 10, 10, p.name, 0);
  world.putDown({ id: glim, count: 60 }, 10, 10, p.name, 0);
  const piles = () => [...world.ground.values()].filter((g) => g.id === glim).map((g) => g.count).sort((x, y) => y - x);
  assert.deepEqual(piles(), [99, 99, 12], "the 51 took 48 of the 60, and 12 lie beside");
  const full = [...world.ground.values()].find((g) => g.id === glim && g.count === 99)!;
  world.take(p, full.uid);
  assert.ok(stepUntil(world, () => countOf(p.inventory, glim) === 99, 10), "a whole pile into the one free slot");
  assert.deepEqual(piles(), [99, 12]);
});

/** Glimstone's price is set at 5 coins and does not move with the shelf, and a bought-out shelf comes back 20 a beat. */
test("glimstone costs 5 coins whatever the shelf holds, pays less than that, and its shelf comes back fast", () => {
  const glim = item("glimstone").id;
  const def = SHOPS.oakridge_runes!, normal = def.stock.find((l) => l.id === glim)!.count;
  for (const stock of [0, 1, normal, normal * 3]) assert.equal(buyPrice(def, glim, stock, normal), GLIMSTONE_PRICE, `at ${stock} on the shelf`);
  assert.ok(sellPrice(def, glim, normal, normal) < GLIMSTONE_PRICE, "no loop that prints coins");
  // The control: a line without a set price still climbs as the shelf empties.
  const rune = item("gale_rune").id, runes = def.stock.find((l) => l.id === rune)!.count;
  assert.ok(buyPrice(def, rune, 1, runes) > buyPrice(def, rune, runes, runes));
  const shop = newShop("oakridge_runes", 0), slot = shop.stock.findIndex((l) => l.id === glim);
  const inv = emptyInventory();
  addItem(inv, coins, 5000);
  assert.equal(buy(inv, shop, slot, 500), null);
  assert.deepEqual([countOf(inv, glim), countOf(inv, coins), shop.stock[slot]!.count], [500, 2500, 0], "a whole shelf at 5 each");
  assert.equal(drift(shop, shop.nextDrift), true);
  assert.equal(shop.stock[slot]!.count, 20, "twenty back a beat");
  assert.equal(shop.stock.find((l) => l.id === rune)!.count, runes, "and a full line stays full");
});

test("a shop's shelf drifts back to what it is meant to keep, both ways", () => {
  const shop = newShop("oakridge_general", 0);
  const line = shop.stock.find((l) => l.count > 3)!;
  const normal = line.count;
  const beat = shop.def.driftTicks;
  /** One drift beat, at the tick it is due: `drift` moves nothing between them. */
  const beatAt = (tick: number) => drift(shop, tick);
  assert.equal(beatAt(1), false, "the control: nothing drifts before its beat is due");

  // Bought out, it fills again, one at a time.
  line.count = 0;
  let tick = 0;
  for (let n = 0; n < normal + 2; n++) beatAt((tick += beat));
  assert.equal(line.count, normal, "a bought-out line comes back to its usual stock");

  // Sold into, it drains away again.
  line.count = normal + 5;
  for (let n = 0; n < 6; n++) beatAt((tick += beat));
  assert.equal(line.count, normal, "and an over-full one comes back down");

  // A kind the shop does not keep at all drains away to nothing and leaves the list.
  const stranger = item("iron_ore").id;
  assert.ok(!shop.def.stock.some((l) => l.id === stranger), "the control: the store does not deal in ore");
  shop.stock.push({ id: stranger, count: 2 });
  const kinds = shop.stock.length;
  for (let n = 0; n < 4; n++) beatAt((tick += beat));
  assert.ok(shop.stock.length < kinds || !shop.stock.some((l) => l.id === stranger && l.count > 0),
    "what it does not deal in goes away");
});

// --- Doors, gates and planes -----------------------------------------------------------------------

test("a door blocks until it is opened, and shuts itself again", () => {
  const stack = field([["door", 16, 17, { side: 0 }]]);
  const ground = stack.planes.get(0)!;
  const world = new World(stack);
  const door = ground.objects[0]!;
  assert.ok(ground.collision.wallBetween(16, 17, 0, 1), "shut, it is a wall");
  const p = world.add("Knocker");
  world.interact(p, door.id);
  assert.ok(stepUntil(world, () => world.opened.has(door.id)), "clicking it opens it");
  assert.ok(!ground.collision.wallBetween(16, 17, 0, 1), "and the way through is clear");
  assert.ok(world.openChanges.some(([id, open]) => id === door.id && open === 1), "everyone is told");
  // It shuts itself after a while, whether or not anyone is still there.
  for (let i = 0; i < DOOR_TICKS + 2; i++) world.step();
  assert.ok(!world.opened.has(door.id), "and shuts itself in the end");
  assert.ok(ground.collision.wallBetween(16, 17, 0, 1), "with the wall back");
});

test("a stair moves a player to the plane it leads to, and back", () => {
  const stack = field([
    ["stairs", 16, 17, { to: 1 }],
    ["stairs", 16, 17, { plane: 1, to: 0 }],
  ], 2);
  const world = new World(stack);
  const up = stack.planes.get(0)!.objects[0]!, down = stack.planes.get(1)!.objects[0]!;
  const p = world.add("Climber");
  assert.equal(p.plane, 0);
  world.interact(p, up.id);
  assert.ok(stepUntil(world, () => p.plane === 1), "up the stairs");
  world.interact(p, down.id);
  assert.ok(stepUntil(world, () => p.plane === 0), "and down again");
});

test("nobody on another plane is in view, and nothing there can be clicked", () => {
  const stack = field([["stairs", 16, 17, { to: 1 }], ["tree", 18, 18, { plane: 1 }]], 2);
  const world = new World(stack);
  const a = world.add("Downstairs"), b = world.add("Upstairs");
  b.plane = 1;
  assert.ok(!world.viewFor(a).ents.some((e) => e.id === b.id), "a player upstairs is out of sight");
  b.plane = 0;
  assert.ok(world.viewFor(a).ents.some((e) => e.id === b.id), "the control: on the same plane they are seen");
  // A tree on the floor above cannot be worked from below.
  const upstairsTree = stack.planes.get(1)!.objects[0]!;
  world.interact(a, upstairsTree.id);
  assert.equal(a.action, null, "and an object up there is not a thing to click at");
});

// --- Conversations -----------------------------------------------------------------------------------

test("every conversation starts somewhere, and every option leads somewhere real", () => {
  for (const [who, tree] of Object.entries(DIALOGUE)) {
    assert.ok(tree[DIALOGUE_START], `${who} has a first thing to say`);
    for (const [name, node] of Object.entries(tree)) {
      assert.ok(node.lines.length > 0, `${who}/${name} says something`);
      for (const option of node.options ?? []) {
        if (option.to) assert.ok(tree[option.to], `${who}/${name} -> ${option.to} exists`);
        if (option.act === "shop") assert.ok(true);
      }
    }
  }
});

test("talking to a shopkeeper offers the trade, and taking it opens that shop", () => {
  const stack = field();
  const ground = stack.planes.get(0)!;
  ground.monsters.push({ monster: "shopkeeper_general", x: 16, y: 18 });
  const world = new World(stack);
  const keeper = [...world.npcs.values()][0]!;
  const p = world.add("Shopper");
  world.talk(p, keeper.id);
  assert.ok(stepUntil(world, () => p.screen?.kind === "talk"), "the conversation opens");
  const box = world.dialogueFor(p)!;
  assert.equal(box.speaker, keeper.def.name);
  const trade = box.options.findIndex((t) => /see what you have|show me/i.test(t));
  assert.ok(trade >= 0, `a trade is offered: ${JSON.stringify(box.options)}`);
  world.answer(p, trade);
  assert.equal(p.screen?.kind, "shop");
  assert.equal(world.shopFor(p)?.key, "oakridge_general");
});

// --- Phase 8: the recipes -----------------------------------------------------------------------------

test("every recipe makes a real item out of real materials, at a station that offers it", () => {
  for (const r of RECIPES) {
    assert.ok(ITEM_BY_KEY.has(r.item), `${r.item} is a real item`);
    assert.ok(r.each >= 1);
    assert.ok(r.needs.length > 0, `${r.item} takes something`);
    for (const ing of r.needs) {
      assert.ok(ITEM_BY_KEY.has(ing.item), `${r.item} takes ${ing.item}, which is a real item`);
      assert.ok(ing.count >= 1);
    }
    assert.ok(r.at.length > 0, `${r.item} is made somewhere`);
    assert.ok(SKILL_KEYS.includes(r.skill), `${r.item} trains a real skill`);
    assert.ok(r.level >= 1 && r.level <= 99, `${r.item} needs a real level`);
    assert.ok(r.xp > 0, `${r.item} is worth making`);
    if (r.tool) assert.ok(ITEM_BY_KEY.has(r.tool), `${r.item} wants a real tool`);
    if (r.burnt) assert.ok(ITEM_BY_KEY.has(r.burnt), `${r.item} ruins into a real item`);
  }
  // Every station a map object names offers something.
  for (const station of ["furnace", "anvil", "range", "fire"] as const) {
    assert.ok(recipesAt(station).length > 0, `a ${station} has something to make`);
  }
});

test("the metal ladder runs bronze to starfall, and steel upward needs coal", () => {
  const bars = ["bronze_bar", "iron_bar", "steel_bar", "coldiron_bar", "emberite_bar", "starfall_bar"];
  const smelts = bars.map((bar) => RECIPES.find((r) => r.item === bar && r.at.includes("furnace")));
  smelts.forEach((r, i) => assert.ok(r, `${bars[i]} can be smelted`));
  // PLAN §8.3: 1 / 15 / 30 / 50 / 70 / 85, and each tier above iron takes coal.
  assert.deepEqual(smelts.map((r) => r!.level), [1, 15, 30, 50, 70, 85]);
  for (const bar of bars.slice(2)) {
    const r = RECIPES.find((x) => x.item === bar)!;
    assert.ok(r.needs.some((n) => n.item === "coal"), `${bar} needs coal — which is why Phase 7 puts a seam in`);
  }
  // Each metal can be hammered into the same seven shapes, so the ladder reads the same all the way up.
  for (const metal of ["bronze", "iron", "steel", "coldiron", "emberite", "starfall"]) {
    // What is hammered out OF that metal's bars, which is not the same as what is merely named for it:
    // a bronze arrow is fletched at an anvil out of shafts, feathers and heads.
    const shapes = RECIPES.filter((r) =>
      r.at.includes("anvil") && r.needs.some((n) => n.item === `${metal}_bar`) && !r.item.endsWith("arrowheads"));
    assert.equal(shapes.length, 7, `${metal} makes seven things: ${shapes.map((r) => r.item).join(", ")}`);
  }
});

test("cooking burns less as the level rises, and stops burning where the recipe says", () => {
  for (const r of RECIPES.filter((x) => x.burn)) {
    const low = burnChance(r, r.level);
    const high = burnChance(r, r.burn!.stops - 1);
    assert.ok(low > 0, `${r.item} can be ruined at the level it is learnt`);
    assert.ok(high < low, `${r.item} burns less with practice`);
    assert.equal(burnChance(r, r.burn!.stops), 0, `${r.item} stops burning at ${r.burn!.stops}`);
    assert.equal(burnChance(r, 99), 0);
  }
  // The control: a recipe with no burn never burns, whatever the level.
  const bar = RECIPES.find((r) => r.item === "bronze_bar")!;
  assert.equal(burnChance(bar, 1), 0);
});

test("firemaking has a tier for every kind of logs, in the ladder's order", () => {
  const woods = ["logs", "oak_logs", "alder_logs", "rowan_logs", "blackthorn_logs", "ironbark_logs", "sable_logs", "heartoak_logs"];
  assert.deepEqual(FIRES.map((f) => f.logs), woods);
  for (const f of FIRES) assert.ok(ITEM_BY_KEY.has(f.logs), `${f.logs} is a real item`);
  const levels = FIRES.map((f) => f.level);
  assert.deepEqual([...levels].sort((a, b) => a - b), levels, "and they climb");
  const burns = FIRES.map((f) => f.ticks);
  assert.deepEqual([...burns].sort((a, b) => a - b), burns, "with better wood burning longer");
});

test("lighting a fire spends the logs, puts a fire on the tile, and it burns out", () => {
  const stack = field();
  const world = new World(stack, () => 0);
  const p = world.add("Firestarter", undefined, { inventory: emptyInventory() });
  addItem(p.inventory, item("tinderbox").id, 1);
  addItem(p.inventory, logs, 2);
  const before = world.objectAt(p.x, p.y);
  assert.equal(before, undefined, "the control: nothing stands on the tile yet");
  world.useItems(p, p.inventory.findIndex((s) => s?.id === item("tinderbox").id), p.inventory.findIndex((s) => s?.id === logs));
  const fire = world.objectAt(p.x, p.y);
  assert.equal(fire?.kind, "fire", "a fire is on the tile");
  assert.equal(p.inventory.filter((s) => s?.id === logs).length, 1, "one lot of logs is spent");
  assert.ok(p.xp.firemaking > xpForLevel(1), "and it paid Firemaking");
  assert.ok(world.spawnedObjects.includes(fire!), "everyone is told about it");
  const burn = FIRES[0]!.ticks;
  for (let i = 0; i < burn + 2; i++) world.step();
  assert.equal(world.objectAt(fire!.x, fire!.y), undefined, "and it burns out");
  assert.ok(world.goneObjects.includes(fire!.id) || world.objectOf(fire!.id) === undefined);
});

test("a run of making spends its materials, pays its XP, and stops when they run out", () => {
  const stack = field([["furnace", 16, 17]]);
  const world = new World(stack, () => 0.99);
  const p = world.add("Smelter", undefined, { inventory: emptyInventory() });
  addItem(p.inventory, item("copper_ore").id, 3);
  addItem(p.inventory, item("tin_ore").id, 3);
  world.interact(p, world.objectAt(16, 17)!.id);
  assert.ok(stepUntil(world, () => p.screen?.kind === "make"), "the furnace offers its list");
  const screen = p.screen as { kind: "make"; recipes: number[] };
  const bronze = screen.recipes.findIndex((i) => RECIPES[i]!.item === "bronze_bar");
  assert.ok(bronze >= 0, "and bronze is on it");
  world.make(p, bronze, -1);
  assert.ok(stepUntil(world, () => p.making === null, 40), "the run finishes");
  const bars = p.inventory.filter((s) => s?.id === item("bronze_bar").id).length;
  assert.equal(bars, 3, "three bars out of three pairs of ore");
  assert.equal(p.inventory.filter((s) => s?.id === item("copper_ore").id).length, 0, "and the ore is gone");
  assert.equal(levelForXp(p.xp.smithing) >= 1, true);
  assert.ok(p.xp.smithing > xpForLevel(1), "Smithing was paid");
});

test("making stops when the maker walks away", () => {
  const stack = field([["anvil", 16, 17]]);
  const world = new World(stack, () => 0.99);
  const p = world.add("Smith", undefined, { inventory: emptyInventory() });
  addItem(p.inventory, item("hammer").id, 1);
  addItem(p.inventory, item("bronze_bar").id, 8);
  world.interact(p, world.objectAt(16, 17)!.id);
  assert.ok(stepUntil(world, () => p.screen?.kind === "make"));
  const screen = p.screen as { kind: "make"; recipes: number[] };
  const dagger = screen.recipes.findIndex((i) => RECIPES[i]!.item === "bronze_dagger");
  world.make(p, dagger, 8);
  world.step();
  assert.ok(p.making, "the run is under way");
  world.walk(p, 16, 26);
  assert.ok(stepUntil(world, () => p.making === null, 6), "and walking away ends it");
  assert.ok(p.inventory.some((s) => s?.id === item("bronze_bar").id), "with bars left over");
});

test("a recipe above the player's level, or short of materials, says which", () => {
  const stack = field([["anvil", 16, 17]]);
  const world = new World(stack, () => 0.99);
  const p = world.add("Novice", undefined, { inventory: emptyInventory() });
  addItem(p.inventory, item("hammer").id, 1);
  const starfall = RECIPES.find((r) => r.item === "starfall_sword")!;
  const bronze = RECIPES.find((r) => r.item === "bronze_dagger")!;
  assert.match(world.canMakeNow(p, starfall).why, /Smithing level/, "too hard says the level");
  assert.match(world.canMakeNow(p, bronze).why, /haven't got/, "short of bars says so");
  addItem(p.inventory, item("bronze_bar").id, 2);
  assert.equal(world.canMakeNow(p, bronze).left, 2, "and with bars, it says how many");
  assert.equal(world.canMakeNow(p, bronze).why, "");
});

test("a workbench a player is not beside offers nothing", () => {
  const stack = field([["anvil", 16, 17]]);
  const world = new World(stack, () => 0.99);
  const p = world.add("Distant", undefined, { inventory: emptyInventory() });
  p.x = 16;
  p.y = 26;
  world.make(p, 0, 1);
  assert.equal(p.making, null, "making needs the bench open, and the bench needs reaching");
});

// --- The pack and the bank together ------------------------------------------------------------------

test("what the bank holds survives a logout, because it is part of the save", () => {
  const bank: Array<Stack | null> = emptyBank();
  bank[0] = { id: logs, count: 40 };
  const stack = field();
  const world = new World(stack);
  const p = world.add("Keeper", undefined, { bank });
  assert.equal(p.bank[0]?.count, 40);
  const fresh = world.add("Newcomer");
  assert.equal(fresh.bank.filter(Boolean).length, 0, "the control: a new character's bank is empty");
});

test("a blocked tile refuses a fire, and so does one that already has something on it", () => {
  const stack = field([["rock", 16, 16]]);
  const world = new World(stack, () => 0);
  const p = world.add("Blocked", undefined, { inventory: emptyInventory() });
  addItem(p.inventory, item("tinderbox").id, 1);
  addItem(p.inventory, logs, 1);
  p.x = 16;
  p.y = 16;
  assert.notEqual(stack.planes.get(0)!.collision.get(16, 16) & BLOCKED, 0, "the control: the tile is taken");
  world.useItems(p, p.inventory.findIndex((s) => s?.id === item("tinderbox").id), p.inventory.findIndex((s) => s?.id === logs));
  assert.ok(said(p, "There's nowhere here to set a fire."));
  assert.ok(p.inventory.some((s) => s?.id === logs), "and the logs are still in the pack");
});

/** Keeps the inventory type used above honest. */
const _typed: Inventory = emptyInventory();
void _typed;

// --- Dying, now that there is a bank to leave things in ------------------------------------------

/**
 * Kills a player for real: a creature that starts fights, standing next to them, with every roll
 * pinned to land. Nothing here reaches past the world's own doors, so the death is the game's.
 */
function killed(carrying: string[], wearing: string[] = []): { world: World; p: Player; where: { x: number; y: number } } {
  const stack = field();
  stack.planes.get(0)!.monsters.push({ monster: "mudfoot_warchief", x: 17, y: 16 });
  const world = new World(stack, () => 0);
  const p = world.add("Unlucky", undefined, { at: { x: 16, y: 16 }, inventory: emptyInventory() });
  for (const key of [...carrying, ...wearing]) addItem(p.inventory, item(key).id, 1);
  for (const key of wearing) world.equip(p, p.inventory.findIndex((sl) => sl?.id === item(key).id));
  const where = { x: p.x, y: p.y };
  stepUntil(world, () => p.deathTick !== 0, 300);
  assert.notEqual(p.deathTick, 0, "the warchief saw to them");
  return { world, p, where };
}

test("a death leaves everything but the three best things where the player fell", () => {
  // Three things worth keeping and three worth losing, so the split is unambiguous either way.
  const keep = ["steel_sword", "steel_axe", "iron_sword"];
  const lose = ["bread", "logs", "bones"];
  const { world, p, where } = killed([...keep, ...lose]);

  const held = new Set(p.inventory.filter(Boolean).map((sl) => sl!.id));
  for (const key of keep) assert.ok(held.has(item(key).id), `the ${key} was worth keeping`);
  for (const key of lose) assert.ok(!held.has(item(key).id), `the ${key} was not`);
  const pile = [...world.ground.values()].filter((g) => g.x === where.x && g.y === where.y);
  assert.deepEqual(new Set(pile.map((g) => g.id)), new Set(lose.map((k) => item(k).id)), "the rest lies where they fell");
  assert.ok(pile.every((g) => g.owner === "Unlucky"), "theirs to pick up first");
  assert.ok(said(p, "Whatever you were carrying is lying where you fell. Best hurry."));
});

test("what is worn counts as carried when the reaper calls", () => {
  const { world, p } = killed(["bones"], ["bronze_helm", "wooden_shield", "leather_boots"]);
  // Bones are the least valuable thing there, worn or not, so they are what goes.
  const pile = [...world.ground.values()].map((g) => g.id);
  assert.deepEqual(pile, [item("bones").id], "the cheapest thing is dropped, worn or carried");
  assert.ok(p.equipment.head, "and the helm stays on their head");
});

test("a player with three things or fewer loses nothing at all", () => {
  const { world, p } = killed(["bronze_axe", "bread"]);
  assert.equal([...world.ground.values()].length, 0, "nothing was dropped");
  assert.equal(p.inventory.filter(Boolean).length, 2, "and both things are still carried");
});

/**
 * ⛔ A door runs along a tile EDGE, and its tile is the one inside the building. Walking up to that
 * tile from outside means crossing the very edge the door blocks — so until the approach covered both
 * tiles, a shut door could only be opened from the inside, and nobody could ever get into a shop.
 */
test("a door opens from outside as well as in, and the way through opens with it", () => {
  // A one-room hut: walls all round, with a door in its south wall.
  const walls: Array<[string, number, number, Partial<MapObject>?]> = [];
  for (let x = 14; x <= 18; x++) {
    walls.push([x === 16 ? "door" : "wall", x, 14, { side: 2 }]);
    walls.push(["wall", x, 18, { side: 0 }]);
  }
  for (let y = 14; y <= 18; y++) {
    walls.push(["wall", 14, y, { side: 3 }]);
    walls.push(["wall", 18, y, { side: 1 }]);
  }
  const stack = field(walls);
  const ground = stack.planes.get(0)!;
  const door = ground.objects.find((o) => o.kind === "door")!;
  const world = new World(stack);

  // Outside, to the south of the hut. The control: the doorway really is shut against them.
  const outside = world.add("Outside", undefined, { at: { x: 16, y: 11 } });
  assert.ok(ground.collision.wallBetween(16, 14, 0, -1), "the control: the doorway is a wall");
  // A walk that cannot reach its target ends on the nearest tile it can, so the endpoint is the test.
  const reaches16 = (fx: number, fy: number) => {
    const end = findPath(ground.collision, fx, fy, 16, 16).at(-1);
    return end?.x === 16 && end.y === 16;
  };
  assert.ok(!reaches16(16, 11), "and nobody can walk in");

  world.interact(outside, door.id);
  assert.ok(stepUntil(world, () => world.opened.has(door.id), 40), "clicking it from outside opens it");
  assert.ok(!ground.collision.wallBetween(16, 14, 0, -1), "the doorway is clear");
  assert.ok(reaches16(outside.x, outside.y), "and now they can walk in");

  // And from inside, the same door shuts again.
  const inside = world.add("Inside", undefined, { at: { x: 16, y: 16 } });
  world.interact(inside, door.id);
  assert.ok(stepUntil(world, () => !world.opened.has(door.id), 40), "clicking it from inside shuts it");
  assert.ok(ground.collision.wallBetween(16, 14, 0, -1), "and the wall is back");
});

test("a counter inside a building can be got at once its door is open", () => {
  const walls: Array<[string, number, number, Partial<MapObject>?]> = [];
  for (let x = 14; x <= 18; x++) {
    walls.push([x === 16 ? "door" : "wall", x, 14, { side: 2 }]);
    walls.push(["wall", x, 18, { side: 0 }]);
  }
  for (let y = 14; y <= 18; y++) {
    walls.push(["wall", 14, y, { side: 3 }]);
    walls.push(["wall", 18, y, { side: 1 }]);
  }
  walls.push(["counter", 16, 17, { tag: "oakridge_general" }]);
  const stack = field(walls);
  const world = new World(stack);
  const door = stack.planes.get(0)!.objects.find((o) => o.kind === "door")!;
  const p = world.add("Customer", undefined, { at: { x: 16, y: 11 }, inventory: emptyInventory() });

  // Shut, the counter is out of reach and the game says so.
  world.interact(p, world.objectAt(16, 17)!.id);
  assert.ok(stepUntil(world, () => said(p, "You can't get to that from here."), 40), "shut, it cannot be got at");
  assert.equal(p.screen, null);

  // Open the door, walk in, and the shop opens.
  p.messages = [];
  world.interact(p, door.id);
  assert.ok(stepUntil(world, () => world.opened.has(door.id), 40));
  world.interact(p, world.objectAt(16, 17)!.id);
  assert.ok(stepUntil(world, () => p.screen?.kind === "shop", 60), `the shop opens: ${JSON.stringify(p.messages)}`);
  assert.equal(world.shopFor(p)?.key, "oakridge_general");
});
