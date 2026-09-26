// Crafting, built out (PLAN Phase 20), C6: silver goods. A holy symbol cast from a silver bar, strung with wool and
// blessed at an altar, which steadies prayer; and a silver sickle, which blessed the same way bites the undead harder
// than the living. At the reference's levels and XP; the blessing is no recipe but a thing laid on an altar.
import assert from "node:assert/strict";
import { test } from "node:test";
import { addItem, bonusesOf, countOf, emptyInventory } from "../src/server/inventory.ts";
import { World, type Player } from "../src/server/world.ts";
import { PRAYER_BONUS } from "../src/shared/combat.ts";
import { item } from "../src/shared/items.ts";
import { blankMap, isEdgeKind, oneMap, type MapObject, type WorldStack } from "../src/shared/map.ts";
import { blessed, NOTHING_COMES, smelted, strung } from "../src/shared/messages.ts";
import { drainPerTick } from "../src/shared/prayers.ts";
import { BLESSINGS, RECIPES } from "../src/shared/recipes.ts";
import { noXp, xpForLevel, type SkillKey } from "../src/shared/skills.ts";

const id = (key: string) => item(key).id;

/** A 32×32 field with the creatures and objects a test names, and nothing else. */
function field(monsters: Array<[string, number, number]>, objects: Array<[string, number, number]> = []): WorldStack {
  const map = blankMap(32, 32);
  for (const [key, x, y] of monsters) map.monsters.push({ monster: key, x, y });
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

const levels = (at: Partial<Record<SkillKey, number>>): Record<SkillKey, number> => {
  const xp = noXp();
  for (const [skill, level] of Object.entries(at)) xp[skill as SkillKey] = xpForLevel(level);
  return xp;
};

/** A run at a bench: the list it offers, then one of a recipe. */
function makeAt(world: World, p: Player, bench: MapObject, made: string): string[] {
  p.messages = [];
  world.interact(p, bench.id);
  assert.ok(stepUntil(world, () => p.screen?.kind === "make"), `the ${bench.kind} offers its list`);
  const screen = p.screen as { kind: "make"; recipes: number[] };
  const at = screen.recipes.findIndex((i) => RECIPES[i]!.item === made);
  assert.ok(at >= 0, `and ${made} is on it`);
  world.make(p, at, 1);
  assert.ok(stepUntil(world, () => p.making === null, 40), "the run finishes");
  return p.messages;
}

/** Uses the item in the pack on an object, and waits for what that says. */
function useOn(world: World, p: Player, key: string, o: MapObject): string[] {
  p.messages = [];
  world.interact(p, o.id, p.inventory.findIndex((s) => s?.id === id(key)));
  assert.ok(stepUntil(world, () => p.messages.length > 0, 30), `using ${key} on the ${o.kind} comes to something`);
  return p.messages;
}

test("silver goods are at the reference's levels and XP, and an altar blesses the symbol and the sickle", () => {
  const row = (key: string) => {
    const r = RECIPES.filter((r) => r.item === key);
    assert.equal(r.length, 1, `one recipe makes ${key}`);
    return [key, r[0]!.level, r[0]!.xp, r[0]!.at.join("|"), r[0]!.needs.map((n) => `${n.item}×${n.count}`).join(" ")];
  };
  const want = [
    ["unstrung_symbol", 16, 500, "furnace", "silver_bar×1"],
    ["unblessed_symbol", 16, 40, "fire|range|anvil", "unstrung_symbol×1 ball_of_wool×1"],
    ["silver_sickle", 18, 500, "furnace", "silver_bar×1"],
  ];
  assert.deepEqual(want.map((w) => row(w[0] as string)), want);
  assert.deepEqual({ ...BLESSINGS }, { unblessed_symbol: "holy_symbol", silver_sickle: "blessed_silver_sickle" });
  for (const key of ["holy_symbol", "blessed_silver_sickle"]) assert.equal(RECIPES.some((r) => r.item === key), false, `${key} is blessed, not made`);
});

test("a symbol and a sickle are cast at a furnace, the symbol strung, and both blessed at an altar where nothing else is", () => {
  const stack = field([], [["furnace", 14, 16], ["range", 18, 16], ["altar", 16, 18]]);
  const world = new World(stack, () => 0.99);
  const p = world.add("Silversmith", undefined, {
    at: { x: 16, y: 16 }, xp: levels({ crafting: 18 }), inventory: packed([["silver_bar", 2], ["ball_of_wool", 1], ["bronze_dagger", 1]]),
  });
  const [furnace, range, altar] = stack.planes.get(0)!.objects;
  assert.ok(makeAt(world, p, furnace!, "unstrung_symbol").includes(smelted("Unstrung symbol")), "the symbol is poured");
  assert.ok(makeAt(world, p, furnace!, "silver_sickle").includes(smelted("Silver sickle")), "and the sickle");
  const threaded = makeAt(world, p, range!, "unblessed_symbol");
  assert.ok(threaded.includes(strung("Unblessed symbol")), `strung: ${JSON.stringify(threaded)}`);
  assert.equal(strung("Unblessed symbol"), "You thread the wool through, and have an unblessed symbol.");
  assert.equal(p.xp.crafting - xpForLevel(18), 500 + 500 + 40, "50 XP a casting and 4 for the stringing");

  const slot = p.inventory.findIndex((s) => s?.id === id("unblessed_symbol"));
  assert.deepEqual(useOn(world, p, "unblessed_symbol", altar!), [blessed("Unblessed symbol")]);
  assert.deepEqual(p.inventory[slot], { id: id("holy_symbol"), count: 1 }, "the holy symbol lies where the unblessed one was");
  assert.deepEqual(useOn(world, p, "silver_sickle", altar!), [blessed("Silver sickle")]);
  assert.equal(countOf(p.inventory, id("blessed_silver_sickle")), 1);
  // A dagger laid on the altar is not changed, and the altar still takes prayers when it is clicked.
  assert.deepEqual(useOn(world, p, "bronze_dagger", altar!), [NOTHING_COMES]);
  assert.equal(countOf(p.inventory, id("bronze_dagger")), 1);
  assert.equal(blessed("Silver sickle"), "You lay the silver sickle on the altar, and it comes up blessed.");
});

test("a holy symbol worn steadies prayer: its Prayer 8 stretches every drain by eight thirtieths", () => {
  const worn = bonusesOf({ neck: { id: id("holy_symbol"), count: 1 } });
  assert.equal(worn[PRAYER_BONUS], 8);
  assert.equal(bonusesOf({ neck: { id: id("unblessed_symbol"), count: 1 } })[PRAYER_BONUS] ?? 0, 0, "unblessed, it does nothing");
  const bare = drainPerTick(["steady_hand"], 0), steadied = drainPerTick(["steady_hand"], worn[PRAYER_BONUS]);
  assert.ok(Math.abs(bare / steadied - (1 + 8 / 30)) < 1e-9, `a prayer drains ${bare / steadied}× slower`);
});

test("a blessed silver sickle bites the undead 15% harder at the top of its blow, and nothing else: not the living, not unblessed", () => {
  /** The top of one blow: every roll at 0 lands the blow at its most. */
  const blow = (creature: string, weapon: string) => {
    const roll = { queue: [] as number[] };
    const world = new World(field([[creature, 12, 16]]), () => roll.queue.shift() ?? 0.5);
    const p = world.add("Reaper", undefined, {
      at: { x: 11, y: 16 }, xp: levels({ attack: 60, strength: 60, defence: 60, hitpoints: 60 }), equipment: { weapon: { id: id(weapon), count: 1 } },
    });
    const n = [...world.npcs.values()][0]!;
    world.attack(p, n.id);
    roll.queue = [0, 0];
    world.step();
    return n.def.hitpoints - n.hp;
  };
  const plainDead = blow("grave_shambler", "silver_sickle"), blessedDead = blow("grave_shambler", "blessed_silver_sickle");
  const plainLiving = blow("wild_boar", "silver_sickle"), blessedLiving = blow("wild_boar", "blessed_silver_sickle");
  assert.ok(plainDead > 0 && plainLiving > 0, "the blows land");
  assert.equal(blessedDead, Math.floor(plainDead * 1.15), `blessed, it bites the undead harder (${plainDead} → ${blessedDead})`);
  assert.ok(blessedDead > plainDead, "and that is more than the plain sickle's");
  assert.equal(blessedLiving, plainLiving, "the living feel no difference");
});
