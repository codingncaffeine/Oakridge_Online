// Crafting, built out (PLAN Phase 20), C4: the rest of the leather ladder (vambraces, hard leather, a coif, studs set
// into a jerkin and trousers) and three tiers of hide armour from the hides of sand stalkers, rift hounds and the sear
// drake, at the reference's levels and XP. Each rung is plainly better for an archer than the one below; every kill of
// the three leaves its hide, and all three live somewhere in the world.
import assert from "node:assert/strict";
import { test } from "node:test";
import { addItem, countOf, emptyInventory } from "../src/server/inventory.ts";
import { World, type Player } from "../src/server/world.ts";
import { BONUS_NAMES, item, ITEM_BY_KEY } from "../src/shared/items.ts";
import { blankMap, isEdgeKind, oneMap, type MapObject, type WorldStack } from "../src/shared/map.ts";
import { crafted, makeNeedsLevel, needMaterials, smithed, tanned } from "../src/shared/messages.ts";
import { monster } from "../src/shared/monsters.ts";
import { buildOakridge, OAKRIDGE_SEED } from "../src/shared/oakridge.ts";
import { RECIPES } from "../src/shared/recipes.ts";
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

/** A run at a bench: the list it offers, then a run of one recipe, as many as `count` (-1: all it can). */
function makeAt(world: World, p: Player, bench: MapObject, made: string, count = -1): string[] {
  p.messages = [];
  world.interact(p, bench.id);
  assert.ok(stepUntil(world, () => p.screen?.kind === "make"), `the ${bench.kind} offers its list`);
  const screen = p.screen as { kind: "make"; recipes: number[] };
  const at = screen.recipes.findIndex((i) => RECIPES[i]!.item === made);
  assert.ok(at >= 0, `and ${made} is on it`);
  world.make(p, at, count);
  assert.ok(stepUntil(world, () => p.making === null, 120), "the run finishes");
  return p.messages;
}

const TIERS = [
  { key: "stalker", creature: "sand_stalker", levels: [57, 60, 63], xp: [620, 1240, 1860] },
  { key: "hound", creature: "rift_hound", levels: [66, 68, 71], xp: [700, 1400, 2100] },
  { key: "drake", creature: "sear_drake", levels: [73, 75, 77], xp: [780, 1560, 2340] },
] as const;

test("the rest of the leather ladder and three tiers of hide armour stand at the reference's levels and XP", () => {
  const recipe = (key: string) => {
    const r = RECIPES.filter((x) => x.item === key);
    assert.equal(r.length, 1, `one recipe makes ${key}`);
    return r[0]!;
  };
  const row = (key: string) => {
    const r = recipe(key);
    return [key, r.skill, r.level, r.xp, r.at.join("|"), r.tool ?? "", r.needs.map((n) => `${n.item}×${n.count}`).join(" ")];
  };
  const want: unknown[][] = [
    ["leather_vambraces", "crafting", 11, 220, "range", "needle", "leather×1"],
    ["hard_leather", "crafting", 28, 100, "range", "", "cowhide×1 coins×8"],
    ["hard_leather_body", "crafting", 28, 350, "range", "needle", "hard_leather×1"],
    ["leather_coif", "crafting", 38, 370, "range", "needle", "leather×1"],
    ["steel_studs", "smithing", 36, 375, "anvil", "hammer", "steel_bar×1"],
    ["studded_jerkin", "crafting", 41, 400, "range", "", "leather_jerkin×1 steel_studs×1"],
    ["studded_trousers", "crafting", 44, 420, "range", "", "leather_trousers×1 steel_studs×1"],
  ];
  for (const t of TIERS) {
    want.push([`${t.key}_leather`, "crafting", t.levels[0], 100, "range", "", `${t.key}_hide×1 coins×20`]);
    want.push([`${t.key}hide_vambraces`, "crafting", t.levels[0], t.xp[0], "range", "needle", `${t.key}_leather×1`]);
    want.push([`${t.key}hide_chaps`, "crafting", t.levels[1], t.xp[1], "range", "needle", `${t.key}_leather×2`]);
    want.push([`${t.key}hide_body`, "crafting", t.levels[2], t.xp[2], "range", "needle", `${t.key}_leather×3`]);
  }
  assert.deepEqual(want.map((w) => row(w[0] as string)), want);
  // Everything sewn is worn in its slot, and shows on the figure: a tint for what covers the body, a model for the head.
  const slots: Record<string, string> = { vambraces: "hands", chaps: "legs", body: "body" };
  const worn: Array<[string, string]> = [
    ["leather_vambraces", "hands"], ["hard_leather_body", "body"], ["leather_coif", "head"], ["studded_jerkin", "body"], ["studded_trousers", "legs"],
    ...TIERS.flatMap((t) => Object.entries(slots).map(([piece, slot]): [string, string] => [`${t.key}hide_${piece}`, slot])),
  ];
  for (const [key, slot] of worn) {
    const equip = item(key).equip;
    assert.equal(equip?.slot, slot, `${key} is worn on the ${slot}`);
    if (slot !== "head") assert.ok(Object.keys(equip!.tint ?? {}).length === 1, `${key} colours the figure where it is worn`);
  }
});

test("each rung is plainly better for an archer than the one below it, and every hide tier better all round", () => {
  const at = (name: (typeof BONUS_NAMES)[number]) => BONUS_NAMES.indexOf(name);
  const b = (key: string): number[] => ITEM_BY_KEY.get(key)!.equip!.bonuses!;
  const ladders: Record<string, string[]> = {
    hands: ["leather_gloves", "leather_vambraces", "stalkerhide_vambraces", "houndhide_vambraces", "drakehide_vambraces"],
    legs: ["leather_trousers", "studded_trousers", "stalkerhide_chaps", "houndhide_chaps", "drakehide_chaps"],
    body: ["leather_jerkin", "hard_leather_body", "studded_jerkin", "stalkerhide_body", "houndhide_body", "drakehide_body"],
    head: ["leather_cap", "leather_coif"],
  };
  const defences = ["Stab defence", "Slash defence", "Crush defence", "Magic defence", "Ranged defence"] as const;
  for (const [slot, keys] of Object.entries(ladders)) {
    for (let i = 1; i < keys.length; i++) {
      const lo = b(keys[i - 1]!), hi = b(keys[i]!);
      assert.ok(hi[at("Ranged defence")]! > lo[at("Ranged defence")]!, `${slot}: ${keys[i]} turns arrows better than ${keys[i - 1]}`);
      assert.ok(hi[at("Ranged")]! >= lo[at("Ranged")]!, `${slot}: ${keys[i]} aims no worse than ${keys[i - 1]}`);
      const hide = (k: string) => /^(stalker|hound|drake)hide_/.test(k);
      if (hide(keys[i]!) && hide(keys[i - 1]!)) {
        for (const d of [...defences, "Ranged"] as const) assert.ok(hi[at(d)]! > lo[at(d)]!, `${slot}: ${keys[i]} beats ${keys[i - 1]} in ${d}`);
      }
    }
  }
  // An archer's armour gives up a little magic for its aim.
  for (const key of Object.values(ladders).flat().filter((k) => b(k)[at("Ranged")]! > 0)) assert.ok(b(key)[at("Magic")]! < 0, `${key} costs some magic`);
});

test("a hide is tanned at a range for coins and sewn into its tier's vambraces, chaps and body, in a crafter's words", () => {
  for (const t of TIERS) {
    const stack = field([], [["range", 16, 17]]);
    const world = new World(stack, () => 0.99);
    const p = world.add(`Tanner${t.key}`, undefined, {
      at: { x: 16, y: 16 }, xp: levels({ crafting: t.levels[2] }),
      inventory: packed([[`${t.key}_hide`, 6], ["coins", 125], ["needle", 1]]),
    });
    const range = stack.planes.get(0)!.objects[0]!;
    const xp0 = p.xp.crafting;
    const tan = makeAt(world, p, range, `${t.key}_leather`);
    assert.ok(tan.includes(tanned(item(`${t.key}_leather`).name)), `tanned: ${JSON.stringify(tan)}`);
    assert.deepEqual([countOf(p.inventory, id(`${t.key}_hide`)), countOf(p.inventory, id(`${t.key}_leather`)), countOf(p.inventory, id("coins"))],
      [0, 6, 5], "six hides, six leathers, 20 coins each");
    assert.equal(p.xp.crafting - xp0, 600, "10 XP a hide");
    const pieces: Array<[string, number]> = [["vambraces", 1], ["chaps", 2], ["body", 3]];
    pieces.forEach(([piece, leathers], i) => {
      const key = `${t.key}hide_${piece}`;
      const before = [p.xp.crafting, countOf(p.inventory, id(`${t.key}_leather`))];
      const said = makeAt(world, p, range, key, 1);
      assert.equal(countOf(p.inventory, id(key)), 1, `one ${key} made`);
      assert.equal(before[1]! - countOf(p.inventory, id(`${t.key}_leather`)), leathers, `${key} takes ${leathers} leather`);
      assert.equal(p.xp.crafting - before[0]!, t.xp[i], `${key} pays its XP`);
      assert.ok(said.includes(crafted(item(key).name)), `worked: ${JSON.stringify(said)}`);
    });
  }
  assert.equal(tanned("Hard leather"), "You tan the hide into hard leather.");
  assert.equal(crafted("Stalkerhide chaps"), "You work the leather into a pair of stalkerhide chaps.");
});

test("studs are hammered out of steel at an anvil and set into a jerkin and a pair of trousers at a range", () => {
  const stack = field([], [["anvil", 15, 17], ["range", 17, 17]]);
  const world = new World(stack, () => 0.99);
  const p = world.add("Studder", undefined, {
    at: { x: 16, y: 16 }, xp: levels({ smithing: 36, crafting: 44 }),
    inventory: packed([["steel_bar", 2], ["hammer", 1], ["leather_jerkin", 1], ["leather_trousers", 1]]),
  });
  const [anvil, range] = stack.planes.get(0)!.objects;
  const hammered = makeAt(world, p, anvil!, "steel_studs");
  assert.equal(countOf(p.inventory, id("steel_studs")), 2, "a bar a set of studs");
  assert.ok(hammered.includes("You hammer out steel studs."), `in the smith's words, plural and all: ${JSON.stringify(hammered)}`);
  assert.equal(smithed("Bronze dagger"), "You hammer out a bronze dagger.", "one thing still takes its article");
  for (const [key, from] of [["studded_jerkin", "leather_jerkin"], ["studded_trousers", "leather_trousers"]] as const) {
    const said = makeAt(world, p, range!, key);
    assert.deepEqual([countOf(p.inventory, id(key)), countOf(p.inventory, id(from))], [1, 0], `${from} studded into ${key}`);
    assert.ok(said.includes(crafted(item(key).name)), `worked: ${JSON.stringify(said)}`);
  }
  assert.equal(countOf(p.inventory, id("steel_studs")), 0, "both sets of studs went in");
});

test("a crafter a level short of a tier is shown its tanning and refused, with the level it wants", () => {
  const world = new World(field([], [["range", 16, 17]]), () => 0.99);
  const p = world.add("Novice", undefined, {
    at: { x: 16, y: 16 }, xp: levels({ crafting: 56 }), inventory: packed([["stalker_hide", 1], ["coins", 20], ["needle", 1]]),
  });
  const tan = RECIPES.find((r) => r.item === "stalker_leather")!;
  assert.deepEqual(world.canMakeNow(p, tan), { left: 0, why: makeNeedsLevel("Crafting", 57, "Stalker leather") });
  p.xp.crafting = xpForLevel(57);
  assert.deepEqual(world.canMakeNow(p, tan), { left: 1, why: "" }, "and at 57 it can");
  // The notes name stuff as stuff, and a plural as a plural: no "a" before either, and the verb agrees.
  assert.equal(makeNeedsLevel("Crafting", 57, "Stalker leather"), "Crafting level 57 is needed to make stalker leather.");
  assert.equal(makeNeedsLevel("Smithing", 36, "Steel studs"), "Smithing level 36 is needed to make steel studs.");
  assert.equal(needMaterials("Steel studs"), "You haven't got what steel studs take.");
  assert.equal(needMaterials("Ball of wool"), "You haven't got what a ball of wool takes.", "a ball of wool is still one thing");
  assert.equal(makeNeedsLevel("Crafting", 38, "Leather coif"), "Crafting level 38 is needed to make a leather coif.");
  assert.equal(makeNeedsLevel("Crafting", 1, "Molten glass"), "Crafting level 1 is needed to make molten glass.", "glass ends in s and is no plural");
});

test("every kill of a sand stalker, a rift hound or the sear drake leaves its hide, and all three live in the world", () => {
  for (const t of TIERS) {
    assert.ok(monster(t.creature).drops.always?.some((d) => d.item === `${t.key}_hide` && d.min === undefined), `${t.creature} always drops one ${t.key} hide`);
    // Every roll at 0: every blow lands, and the rare and main tables give whatever they give; the hide is certain.
    const world = new World(field([[t.creature, 12, 16]]), () => 0);
    const p = world.add(`Hunter${t.key}`, undefined, { at: { x: 11, y: 16 }, xp: levels({ attack: 99, strength: 99, defence: 99, hitpoints: 99 }), inventory: emptyInventory() });
    const n = [...world.npcs.values()][0]!;
    world.attack(p, n.id);
    assert.ok(stepUntil(world, () => n.deathTick !== 0, 400), `the ${t.creature} goes down`);
    const left = [...world.ground.values()].filter((g) => g.x === n.x && g.y === n.y && g.id === id(`${t.key}_hide`));
    assert.deepEqual(left.map((g) => g.count), [1], `a ${t.key} hide lies where it fell`);
  }
  const world = buildOakridge(OAKRIDGE_SEED);
  const spawned = new Map<string, number>();
  for (const map of world.planes.values()) for (const m of map.monsters) spawned.set(m.monster, (spawned.get(m.monster) ?? 0) + 1);
  for (const t of TIERS) assert.ok((spawned.get(t.creature) ?? 0) > 0, `${t.creature} spawns somewhere (${spawned.get(t.creature) ?? 0})`);
});
