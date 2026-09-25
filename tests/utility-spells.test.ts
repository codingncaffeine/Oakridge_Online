// Magic, stage A3 (the magic plan): the spells cast on oneself, on an item and on the ground. The bones
// spells turn every bone in the pack; the gildings turn an item into two fifths or three fifths of its
// value in coins; Hand Forge draws the metal out of an ore for the Smithing level and XP the bar asks, with
// the rest of what the bar takes; Beckon calls an item from ten tiles over a clear line; a teleport takes
// its short cast and lands in its town on ground that can be stood on, Mourn's only once the Rill warden
// passes you; and Hearthward's long cast breaks at a step and then wants half an hour.
import assert from "node:assert/strict";
import { test } from "node:test";
import { addItem, countOf } from "../src/server/inventory.ts";
import { canStand, DEATH_TICKS, World, type Player } from "../src/server/world.ts";
import { ITEM_BY_KEY, item } from "../src/shared/items.ts";
import { blankMap } from "../src/shared/map.ts";
import {
  BECKON_FAR, forgeShort, GILD_COINS, HEARTH_BROKEN, hearthWait, makeNeedsLevel, NO_BONES, NOT_ORE, SPELL_NOT_YET,
} from "../src/shared/messages.ts";
import { buildOakridge, GREEN, OAKRIDGE_SEED } from "../src/shared/oakridge.ts";
import { MOURN_QUEST, RILL_PASSES_AT } from "../src/shared/quests.ts";
import { noXp, xpForLevel } from "../src/shared/skills.ts";
import { HEARTH_TICKS, SPELL_BY_KEY, SPELLS, TELEPORT_TICKS } from "../src/shared/spells.ts";

const stack = buildOakridge(OAKRIDGE_SEED);
const count = (p: Player, key: string) => countOf(p.inventory, item(key).id);

/** A caster on a blank field with the levels and the pack asked for; every roll pinned. */
function mage(levels: { magic?: number; smithing?: number }, pack: Array<[string, number]>) {
  const world = new World(blankMap(32, 32), () => 0);
  const xp = { ...noXp(), magic: xpForLevel(levels.magic ?? 1), smithing: xpForLevel(levels.smithing ?? 1) };
  const p = world.add("Mage", undefined, { at: { x: 10, y: 10 }, xp });
  for (const [key, n] of pack) {
    const def = item(key);
    if (def.stackable) addItem(p.inventory, def.id, n);
    else for (let i = 0; i < n; i++) addItem(p.inventory, def.id, 1);
  }
  return { world, p };
}

test("the bones spells turn every bone in the pack, and say so when there are none", () => {
  const { world, p } = mage({ magic: 15 }, [["bones", 3], ["tide_rune", 2], ["stone_rune", 2], ["bloom_rune", 1]]);
  const before = p.xp.magic;
  world.castSelf(p, "bones_to_bread");
  assert.equal(count(p, "bones"), 0, "no bones left");
  assert.equal(count(p, "bread"), 3, "three loaves in their place");
  assert.equal(count(p, "bloom_rune"), 0, "the recipe spent");
  assert.equal(p.xp.magic - before, 250, "twenty-five Magic XP");
  // A tick on (the spell's speed), cast again with no bones left.
  world.step();
  world.castSelf(p, "bones_to_bread");
  assert.ok(p.messages.includes(NO_BONES), "no bones: it says so");
  const plums = mage({ magic: 60 }, [["bones", 2], ["tide_rune", 4], ["stone_rune", 2], ["bloom_rune", 2]]);
  plums.world.castSelf(plums.p, "bones_to_plums");
  assert.equal(count(plums.p, "plum"), 2, "Bones to Plums makes plums");
  assert.equal(item("plum").heals, 8, "and a plum heals eight");
});

test("the gildings turn an item into two fifths or three fifths of its value in coins, and never coins", () => {
  const sword = item("iron_sword");
  const low = mage({ magic: 21 }, [["iron_sword", 1], ["ember_rune", 3], ["bloom_rune", 1]]);
  low.world.castItem(low.p, "lesser_gilding", low.p.inventory.findIndex((s) => s?.id === sword.id));
  assert.equal(count(low.p, "iron_sword"), 0, "the sword is gone");
  assert.equal(count(low.p, "coins"), Math.floor(sword.value * 0.4), "for two fifths of its value");
  const high = mage({ magic: 55 }, [["iron_sword", 1], ["ember_rune", 5], ["bloom_rune", 1]]);
  high.world.castItem(high.p, "greater_gilding", high.p.inventory.findIndex((s) => s?.id === sword.id));
  assert.equal(count(high.p, "coins"), Math.floor(sword.value * 0.6), "three fifths at the greater");
  const coins = mage({ magic: 21 }, [["coins", 100], ["ember_rune", 3], ["bloom_rune", 1]]);
  coins.world.castItem(coins.p, "lesser_gilding", coins.p.inventory.findIndex((s) => s?.id === item("coins").id));
  assert.ok(coins.p.messages.includes(GILD_COINS), "coins are refused");
  assert.equal(count(coins.p, "ember_rune"), 3, "with nothing spent");
});

test("Hand Forge draws the metal out of an ore, for the level, the rest of the bar's makings and the bar's Smithing XP", () => {
  const runes: Array<[string, number]> = [["ember_rune", 8], ["bloom_rune", 2]];
  const slotOf = (p: Player, key: string) => p.inventory.findIndex((s) => s?.id === item(key).id);
  const iron = mage({ magic: 43, smithing: 15 }, [["iron_ore", 1], ...runes]);
  const smithing = iron.p.xp.smithing;
  iron.world.castItem(iron.p, "hand_forge", slotOf(iron.p, "iron_ore"));
  assert.equal(count(iron.p, "iron_bar"), 1, "an iron bar");
  assert.equal(iron.p.xp.smithing - smithing, 125, "and the bar's Smithing XP");
  const early = mage({ magic: 43, smithing: 1 }, [["iron_ore", 1], ...runes]);
  early.world.castItem(early.p, "hand_forge", slotOf(early.p, "iron_ore"));
  assert.ok(early.p.messages.includes(makeNeedsLevel("Smithing", 15, "Iron bar")), "the Smithing level first");
  const noCoal = mage({ magic: 43, smithing: 30 }, [["iron_ore", 1], ["coal", 1], ...runes]);
  noCoal.world.castItem(noCoal.p, "hand_forge", slotOf(noCoal.p, "iron_ore"));
  assert.equal(count(noCoal.p, "iron_bar"), 1, "iron ore with too little coal for steel makes iron");
  assert.equal(count(noCoal.p, "coal"), 1, "and leaves the coal be");
  const steel = mage({ magic: 43, smithing: 30 }, [["iron_ore", 1], ["coal", 2], ...runes]);
  steel.world.castItem(steel.p, "hand_forge", slotOf(steel.p, "iron_ore"));
  assert.equal(count(steel.p, "steel_bar"), 1, "with the coal for it, iron ore makes steel");
  assert.equal(count(steel.p, "coal"), 0, "and takes the coal");
  const bronze = mage({ magic: 43, smithing: 1 }, [["copper_ore", 1], ...runes]);
  bronze.world.castItem(bronze.p, "hand_forge", slotOf(bronze.p, "copper_ore"));
  assert.ok(bronze.p.messages.includes(forgeShort("Tin ore")), "bronze wants its tin as well");
  assert.equal(count(bronze.p, "ember_rune"), 8, "and nothing is spent short of it");
  const coldiron = mage({ magic: 43, smithing: 50 }, [["coldiron_ore", 1], ["coal", 4], ...runes]);
  coldiron.world.castItem(coldiron.p, "hand_forge", slotOf(coldiron.p, "coldiron_ore"));
  assert.equal(count(coldiron.p, "coldiron_bar"), 1, "whatever heat a furnace would want");
  const sword = mage({ magic: 43 }, [["iron_sword", 1], ...runes]);
  sword.world.castItem(sword.p, "hand_forge", slotOf(sword.p, "iron_sword"));
  assert.ok(sword.p.messages.includes(NOT_ORE), "a sword is no ore");
});

test("Beckon calls an item from ten tiles over a clear line, and no further", () => {
  const { world, p } = mage({ magic: 33 }, [["oath_rune", 3], ["gale_rune", 3]]);
  const bread = item("bread").id;
  world.putDown({ id: bread, count: 1 }, 16, 10, null);
  const near = [...world.ground.values()].find((g) => g.id === bread)!;
  world.castGround(p, "beckon", near.uid);
  assert.equal(count(p, "bread"), 1, "six tiles off: it comes");
  assert.ok(!world.ground.has(near.uid), "and is gone from the ground");
  // Three ticks on (Beckon's speed), from further off.
  for (let i = 0; i < 3; i++) world.step();
  world.putDown({ id: bread, count: 1 }, 22, 10, null);
  const far = [...world.ground.values()].find((g) => g.id === bread)!;
  world.castGround(p, "beckon", far.uid);
  assert.ok(p.messages.includes(BECKON_FAR), "twelve tiles off: too far");
  assert.equal(count(p, "oath_rune"), 2, "and nothing spent on it");
  // Round a corner: a wall across the line stops it as it stops an arrow.
  for (let y = 5; y <= 15; y++) world.mapOf(0).collision.addWall(13, y, 1);
  world.putDown({ id: bread, count: 1 }, 15, 10, null);
  const walled = [...world.ground.values()].find((g) => g.id === bread && g.x === 15)!;
  world.castGround(p, "beckon", walled.uid);
  assert.equal(p.messages.filter((m) => m === BECKON_FAR).length, 2, "behind a wall: too far as well");
});

test("a spell on the pack, the ground or oneself waits its speed, the reference's: asked sooner, it does nothing and spends nothing", () => {
  const bread = item("bread").id, slotOf = (p: Player, key: string) => p.inventory.findIndex((s) => s?.id === item(key).id);
  const cases: Array<{ key: string; speed: number; levels: { magic: number; smithing?: number }; pack: Array<[string, number]>; cast: (w: World, p: Player) => void }> = [
    { key: "lesser_gilding", speed: 3, levels: { magic: 21 }, pack: [["iron_sword", 3], ["ember_rune", 9], ["bloom_rune", 3]], cast: (w, p) => w.castItem(p, "lesser_gilding", slotOf(p, "iron_sword")) },
    { key: "greater_gilding", speed: 5, levels: { magic: 55 }, pack: [["iron_sword", 3], ["ember_rune", 15], ["bloom_rune", 3]], cast: (w, p) => w.castItem(p, "greater_gilding", slotOf(p, "iron_sword")) },
    { key: "hand_forge", speed: 3, levels: { magic: 43, smithing: 15 }, pack: [["iron_ore", 3], ["ember_rune", 12], ["bloom_rune", 3]], cast: (w, p) => w.castItem(p, "hand_forge", slotOf(p, "iron_ore")) },
    {
      key: "beckon", speed: 3, levels: { magic: 33 }, pack: [["oath_rune", 3], ["gale_rune", 3]],
      cast: (w, p) => {
        if (![...w.ground.values()].some((g) => g.id === bread)) w.putDown({ id: bread, count: 1 }, 12, 10, null);
        w.castGround(p, "beckon", [...w.ground.values()].find((g) => g.id === bread)!.uid);
      },
    },
    {
      key: "bones_to_bread", speed: 1, levels: { magic: 15 }, pack: [["tide_rune", 6], ["stone_rune", 6], ["bloom_rune", 3]],
      cast: (w, p) => {
        if (count(p, "bones") === 0) addItem(p.inventory, item("bones").id, 1);
        w.castSelf(p, "bones_to_bread");
      },
    },
  ];
  for (const c of cases) {
    const spell = SPELL_BY_KEY.get(c.key)!;
    assert.equal(spell.speed, c.speed, `${spell.name}: the reference's ${c.speed} ticks`);
    const { world, p } = mage(c.levels, c.pack);
    const start = p.xp.magic, casts = () => (p.xp.magic - start) / spell.xp;
    const runes = () => spell.runes.map(([r]) => count(p, r)).join();
    c.cast(world, p);
    assert.equal(casts(), 1, `${spell.name}: the first cast goes`);
    const after = runes();
    // Asked again at once, and again a tick short of the spell's speed: nothing either time.
    c.cast(world, p);
    for (let t = 1; t < c.speed; t++) world.step();
    c.cast(world, p);
    assert.equal(casts(), 1, `${spell.name}: asked sooner than ${c.speed} ticks, it does nothing`);
    assert.equal(runes(), after, `${spell.name}: and spends nothing`);
    world.step();
    c.cast(world, p);
    assert.equal(casts(), 2, `${spell.name}: at ${c.speed} ticks it goes again`);
  }
});

/** A caster in the real world, on the green, with the runes of every teleport and the Magic to cast them. */
function traveller(quests: Record<string, number> = {}) {
  const world = new World(stack, () => 0);
  const p = world.add("Traveller", undefined, { at: { ...GREEN, plane: 0 }, xp: { ...noXp(), magic: xpForLevel(99) }, quests });
  for (const rune of ["oath_rune", "gale_rune", "ember_rune", "stone_rune", "tide_rune"]) addItem(p.inventory, ITEM_BY_KEY.get(rune)!.id, 100);
  return { world, p };
}

test("a teleport takes its short cast and lands in its town, on ground that can be stood on", () => {
  const teleports = SPELLS.filter((s) => s.kind === "teleport");
  assert.equal(teleports.length, 11, "Hearthward and ten towns");
  for (const s of teleports) {
    const at = s.lands!;
    const ground = stack.planes.get(at.plane)!;
    assert.ok(canStand(ground, at.x, at.y), `${s.name} lands on ground that can be stood on (${at.x},${at.y})`);
  }
  const { world, p } = traveller();
  world.castSelf(p, "thornbury_teleport");
  assert.equal(count(p, "oath_rune"), 99, "the recipe spent at the cast");
  world.walk(p, GREEN.x + 3, GREEN.y);
  for (let i = 0; i < TELEPORT_TICKS - 1; i++) world.step();
  assert.deepEqual({ x: p.x, y: p.y }, GREEN, "still on the green while it casts, a walk asked in the meantime notwithstanding");
  world.step();
  const lands = SPELL_BY_KEY.get("thornbury_teleport")!.lands!;
  assert.deepEqual({ x: p.x, y: p.y }, { x: lands.x, y: lands.y }, "then in Thornbury's square");
});

test("Mourn's teleport waits on the Rill warden's leave", () => {
  const early = traveller({ [MOURN_QUEST]: RILL_PASSES_AT - 1 });
  early.world.castSelf(early.p, "mourn_teleport");
  assert.ok(early.p.messages.includes(SPELL_NOT_YET), "refused before the gate would pass you");
  assert.equal(count(early.p, "oath_rune"), 100, "with nothing spent");
  const passed = traveller({ [MOURN_QUEST]: RILL_PASSES_AT });
  passed.world.castSelf(passed.p, "mourn_teleport");
  for (let i = 0; i < TELEPORT_TICKS; i++) passed.world.step();
  const lands = SPELL_BY_KEY.get("mourn_teleport")!.lands!;
  assert.deepEqual({ x: passed.p.x, y: passed.p.y }, { x: lands.x, y: lands.y }, "and goes once it would");
});

test("Hearthward: a long cast that a step breaks, home to the green, then half an hour before the next", () => {
  const { world, p } = traveller();
  world.travel(p, 3151, 3516, 0);
  world.castSelf(p, "hearthward");
  world.step();
  world.walk(p, 3151, 3512);
  world.step();
  assert.ok(p.messages.includes(HEARTH_BROKEN), "a step breaks it");
  assert.equal(p.teleport, null);
  world.castSelf(p, "hearthward");
  for (let i = 0; i < HEARTH_TICKS; i++) world.step();
  assert.deepEqual({ x: p.x, y: p.y }, GREEN, "left alone, it brings them home to the green");
  world.castSelf(p, "hearthward");
  assert.ok(p.messages.includes(hearthWait(30)), "and then it wants half an hour");
});

test("a death in the cast takes the teleport with it", () => {
  // Every roll pinned to 0: the warden's first blow lands for its most, and at one hitpoint that is death.
  const map = blankMap(32, 32);
  map.monsters.push({ monster: "barrow_warden", x: 16, y: 16 });
  const world = new World(map, () => 0);
  const p = world.add("Doomed", undefined, { at: { x: 15, y: 16 }, xp: noXp(), hp: 1 });
  world.castSelf(p, "hearthward");
  assert.ok(p.teleport, "the cast begins");
  for (let i = 0; i < HEARTH_TICKS && p.deathTick === 0; i++) world.step();
  assert.notEqual(p.deathTick, 0, "the warden kills them in the cast");
  assert.equal(p.teleport, null, "and the cast dies with them");
  for (let i = 0; i <= DEATH_TICKS + HEARTH_TICKS; i++) world.step();
  assert.deepEqual({ x: p.x, y: p.y }, { x: world.spawn.x, y: world.spawn.y }, "back on their feet at the spawn, and left there");
  world.castSelf(p, "hearthward");
  assert.ok(p.teleport && !p.messages.some((m) => m.startsWith("You can call on the hearth again")), "nor did the broken cast start the half hour");
});
