// Runesmithing (PLAN Phase 18): an altar for every rune with the reference's levels, XP and runes a stone,
// each standing in its ring where the plan puts it and reached on foot; carving turns every stone the altar
// takes into its runes, and only for someone carrying its charm; the glimstone pit that Orrin Vell sends a
// player down to gives plain glimstone below Mining 30 and pure from 30, never runs out, and has a way out;
// a charm points the way to its altar; charms drop by band; and building all of it moved nothing else.
import assert from "node:assert/strict";
import { test } from "node:test";
import { addItem, countOf } from "../src/server/inventory.ts";
import { World, type Npc, type Player } from "../src/server/world.ts";
import { item } from "../src/shared/items.ts";
import { FIXED_IDS, fixedId, type WorldMap } from "../src/shared/map.ts";
import { ALTAR_SILENT, carved, carveNeeds, CHARM_HERE, charmPulls, CIRCLET_NEEDS_CHARM, PURE_ONLY } from "../src/shared/messages.ts";
import { RECIPES } from "../src/shared/recipes.ts";
import { levelOf, MONSTERS } from "../src/shared/monsters.ts";
import { areaAt, buildOakridge, GREEN, OAKRIDGE_SEED } from "../src/shared/oakridge.ts";
import { ALTAR_BY_RUNE, ALTARS, charmOf, circletXp, PIT_LANDING, PIT_PLANE, PIT_PORTAL, PIT_ROCKS, RING, runesPerStone, type Altar } from "../src/shared/runesmithing.ts";
import { PIT_OPENS_AT, PIT_QUEST } from "../src/shared/quests.ts";
import { mulberry32 } from "../src/shared/rng.ts";
import { noXp, xpForLevel } from "../src/shared/skills.ts";
import { RUNE_KEYS, SPELL_BY_KEY } from "../src/shared/spells.ts";

const stack = buildOakridge(OAKRIDGE_SEED);
const count = (p: Player, key: string) => countOf(p.inventory, item(key).id);
const altarOf = (rune: string) => ALTAR_BY_RUNE.get(rune)!;

/** Every tile reached on foot from a start on its plane, by the collision map's own steps. */
function flood(map: WorldMap, from: { x: number; y: number }): Set<number> {
  const seen = new Set([from.y * 8192 + from.x]), queue: Array<[number, number]> = [[from.x, from.y]];
  while (queue.length) {
    const [x, y] = queue.pop()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const key = (y + dy) * 8192 + x + dx;
      if (seen.has(key) || !map.collision.inBounds(x + dx, y + dy) || !map.collision.canStep(x, y, dx, dy)) continue;
      seen.add(key);
      queue.push([x + dx, y + dy]);
    }
  }
  return seen;
}

test("an altar for every rune, in level order, with the reference's ladder of runes a stone, and a charm that points to each", () => {
  assert.deepEqual(ALTARS.map((a) => a.rune).sort(), [...RUNE_KEYS].sort(), "one altar a rune");
  for (let i = 1; i < ALTARS.length; i++) assert.ok(ALTARS[i]!.level > ALTARS[i - 1]!.level, `${ALTARS[i]!.rune} comes after ${ALTARS[i - 1]!.rune}`);
  for (const a of ALTARS) {
    assert.ok(a.more.every((l, k) => l > a.level && (k === 0 || l > a.more[k - 1]!)), `${a.rune}'s extra runes come at rising levels past its own`);
    assert.equal(item(charmOf(a)).action, "Locate", `the ${charmOf(a)} can be asked the way`);
    assert.equal(a.pure, a.level > 20, `${a.rune} takes pure glimstone alone exactly when it is past Sinew's`);
  }
  // Against the reference's table: its first rune two a stone at 11 and three at 22; Bloom's two at 91; Heart's never more than one.
  assert.deepEqual([10, 11, 21, 22, 99].map((l) => runesPerStone(altarOf("gale_rune"), l)), [1, 2, 2, 3, 10]);
  assert.deepEqual([90, 91].map((l) => runesPerStone(altarOf("bloom_rune"), l)), [1, 2]);
  assert.equal(runesPerStone(altarOf("heart_rune"), 99), 1);
});

const PLACES: Record<string, string> = {
  gale_rune: "The East Meadow", thought_rune: "The Oakridge road", tide_rune: "Wickstead", stone_rune: "Stonecote", ember_rune: "The Cinderwaste",
  sinew_rune: "The Harrow", star_rune: "The Dunes", wild_rune: "The Harrow", bloom_rune: "Sablewood Isle", oath_rune: "The Cinderwaste",
  grave_rune: "The Harrow", heart_rune: "The Sallowfen", shade_rune: "The Fen Hollows", fury_rune: "The Rift",
};
/** Where a player walks up to each altar from: the green, Mourn (the Sallowfen is past the Rill gate), or the stair of its dungeon. */
const FROM = (a: Altar) => a.at.plane === -2 ? (a.rune === "shade_rune" ? { x: 3872, y: 3531 } : { x: 3385, y: 3788 })
  : a.rune === "heart_rune" ? SPELL_BY_KEY.get("mourn_teleport")!.lands! : a.rune === "bloom_rune" ? SPELL_BY_KEY.get("tarhollow_teleport")!.lands! : GREEN;

test("every altar stands in its ring of stones where the plan puts it, under its place's own id, and can be walked up to", () => {
  for (const a of ALTARS) {
    const map = stack.planes.get(a.at.plane)!, at = map.objects.filter((o) => o.x === a.at.x && o.y === a.at.y);
    const altar = at.find((o) => o.kind === "rune_altar");
    assert.ok(altar && altar.tag === a.rune, `the ${a.rune}'s altar stands at ${a.at.x},${a.at.y}`);
    assert.equal(altar!.id, fixedId(a.at.x, a.at.y, a.at.plane), "under its place's id");
    for (const [dx, dy] of RING) assert.ok(map.objects.some((o) => o.kind === "standing_stone" && o.x === a.at.x + dx && o.y === a.at.y + dy), `with a stone at ${dx},${dy}`);
    assert.equal(areaAt(a.at.x, a.at.y, a.at.plane).name, PLACES[a.rune], `the ${a.rune}'s altar is in ${PLACES[a.rune]}`);
    const reach = flood(map, FROM(a));
    const beside = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => reach.has((a.at.y + dy!) * 8192 + a.at.x + dx!));
    assert.ok(beside, `a tile beside the ${a.rune}'s altar is reached on foot`);
  }
  // The control: the flood does not reach inside what is shut. The Sallowfen's altar is not reached from the green, past the Rill gate.
  const heart = altarOf("heart_rune"), fromGreen = flood(stack.planes.get(0)!, GREEN);
  assert.ok(![[1, 0], [-1, 0]].some(([dx]) => fromGreen.has(heart.at.y * 8192 + heart.at.x + dx!)), "the flood from the green stops at the Rill gate");
});

/** A carver on the tile east of an altar, with the Runesmithing level asked and what is asked in the pack. */
function carver(rune: string, level: number, pack: Array<[string, number]>) {
  const world = new World(stack, () => 0), a = altarOf(rune);
  const p = world.add("Carver", undefined, { at: { x: a.at.x + 1, y: a.at.y, plane: a.at.plane }, xp: { ...noXp(), runesmithing: xpForLevel(level) } });
  for (const [key, n] of pack) {
    if (item(key).stackable) addItem(p.inventory, item(key).id, n);
    else for (let i = 0; i < n; i++) addItem(p.inventory, item(key).id, 1);
  }
  const carve = () => {
    world.interact(p, fixedId(a.at.x, a.at.y, a.at.plane));
    for (let i = 0; i < 5 && p.action !== null; i++) world.step();
  };
  return { world, p, carve };
}

test("carving turns every stone the altar takes into its runes, so many a stone by the level, for its XP a stone, and only with its charm", () => {
  const gale = carver("gale_rune", 22, [["gale_charm", 1], ["glimstone", 10], ["pure_glimstone", 5]]);
  const before = gale.p.xp.runesmithing;
  gale.carve();
  assert.equal(count(gale.p, "gale_rune"), 45, "fifteen stones, three gale runes each at level 22");
  assert.equal(count(gale.p, "glimstone") + count(gale.p, "pure_glimstone"), 0, "and the Gale altar takes both kinds of stone");
  assert.equal(gale.p.xp.runesmithing - before, 15 * 50, "for 5 XP a stone");
  assert.ok(gale.p.messages.includes(carved(45, "Gale rune")));
  const bare = carver("gale_rune", 22, [["glimstone", 10]]);
  bare.carve();
  assert.ok(bare.p.messages.includes(ALTAR_SILENT), "without its charm the altar does not answer");
  assert.equal(count(bare.p, "glimstone"), 10, "and nothing is carved");
  const early = carver("star_rune", 26, [["star_charm", 1], ["pure_glimstone", 4]]);
  early.carve();
  assert.ok(early.p.messages.includes(carveNeeds(27, "Star rune")), "short of the level it says the level");
  const plain = carver("star_rune", 27, [["star_charm", 1], ["glimstone", 4]]);
  plain.carve();
  assert.ok(plain.p.messages.includes(PURE_ONLY), "past Sinew's, plain glimstone will not do");
  const pure = carver("star_rune", 27, [["star_charm", 1], ["glimstone", 4], ["pure_glimstone", 4]]);
  pure.carve();
  assert.deepEqual([count(pure.p, "star_rune"), count(pure.p, "glimstone")], [4, 4], "the pure stones carve, one star rune each, and the plain are left");
});

/** A customer on the floor of Vell's shop, across the counter from him (the tile past it; he is talked to over it). */
function besideVell(world: World, mining = 1, quest = PIT_OPENS_AT): { p: Player; vell: Npc } {
  const vell = [...world.npcs.values()].find((n) => n.def.key === "staff_seller")!;
  const p = world.add(`Miner${mining}q${quest}`, undefined, { at: { x: vell.x + 2, y: vell.y, plane: vell.plane }, xp: { ...noXp(), mining: xpForLevel(mining) }, quests: { [PIT_QUEST]: quest } });
  assert.deepEqual([p.x, p.y], [vell.x + 2, vell.y], "the customer stands in the shop");
  addItem(p.inventory, item("bronze_pickaxe").id, 1);
  return { p, vell };
}
function say(world: World, p: Player, vell: Npc, ...answers: string[]): void {
  world.talk(p, vell.id);
  for (let i = 0; i < 20 && p.screen?.kind !== "talk"; i++) world.step();
  for (const text of answers) {
    const box = world.dialogueFor(p);
    const i = box?.options.indexOf(text) ?? -1;
    assert.ok(i >= 0, `"${text}" is on offer (offered: ${box?.options.join(" | ")})`);
    world.answer(p, i);
  }
}
/** Mines the pit's first rock until something comes of it, or thirty ticks. */
function mineOnce(world: World, p: Player): number {
  const [x, y] = PIT_ROCKS[0]!, id = fixedId(x, y, PIT_PLANE);
  world.interact(p, id);
  for (let i = 0; i < 30 && count(p, "glimstone") + count(p, "pure_glimstone") === 0; i++) world.step();
  return id;
}

test("Vell sends a player down to the pit, whose rock gives plain glimstone below Mining 30 and pure from 30 and never runs out, and the portal brings them up", () => {
  const world = new World(stack, () => 0);
  const low = besideVell(world, 1);
  say(world, low.p, low.vell, "Send me down to the glimstone pit.");
  assert.deepEqual([low.p.x, low.p.y, low.p.plane], [PIT_LANDING.x, PIT_LANDING.y, PIT_PLANE], "Vell's word puts them in the pit");
  assert.equal(areaAt(low.p.x, low.p.y, low.p.plane).name, "The glimstone pit");
  const rock = mineOnce(world, low.p);
  assert.equal(count(low.p, "glimstone"), 1, "below Mining 30 the rock gives plain glimstone");
  // A rock that ran out would stop everyone working it, however soon it came back.
  assert.ok(low.p.gathering !== null && !world.depleted.has(rock), "and it has not run out: they are still mining it");
  // From Mining 30 only pure, even on rolls that miss it: a seeded run of real rolls, filling the pack.
  const seeded = new World(stack, mulberry32(11));
  const high = besideVell(seeded, 30);
  say(seeded, high.p, high.vell, "Send me down to the glimstone pit.");
  const [rx, ry] = PIT_ROCKS[0]!;
  seeded.interact(high.p, fixedId(rx, ry, PIT_PLANE));
  for (let i = 0; i < 400 && count(high.p, "pure_glimstone") + count(high.p, "glimstone") < 20; i++) seeded.step();
  assert.deepEqual([count(high.p, "pure_glimstone"), count(high.p, "glimstone")], [20, 0], "from Mining 30 it gives pure glimstone, and only that");
  world.interact(low.p, fixedId(PIT_PORTAL.x, PIT_PORTAL.y, PIT_PLANE));
  for (let i = 0; i < 20 && low.p.plane === PIT_PLANE; i++) world.step();
  const square = SPELL_BY_KEY.get("thornbury_teleport")!.lands!;
  assert.deepEqual([low.p.x, low.p.y, low.p.plane], [square.x, square.y, 0], "the portal lets them out in Thornbury's square");
});

test("Vell sends nobody down before The Pull of the Charm; after it he gives another gale charm to someone with none, but not while they keep one", () => {
  const world = new World(stack, () => 0);
  const early = besideVell(world, 1, 0);
  say(world, early.p, early.vell);
  assert.ok(!world.dialogueFor(early.p)!.options.includes("Send me down to the glimstone pit."), "before the quest the pit is shut");
  const { p, vell } = besideVell(world);
  say(world, p, vell, "Where do runes come from?", "You haven't another gale charm?");
  assert.equal(count(p, "gale_charm"), 1, "a gale charm");
  world.closeScreen(p);
  say(world, p, vell, "Where do runes come from?");
  assert.ok(!world.dialogueFor(p)!.options.includes("You haven't another gale charm?"), "and no second one while it is kept");
});

test("a charm says which way its altar lies, and that it is below; beside it, that it is here", () => {
  const world = new World(stack, () => 0);
  const p = world.add("Seeker", undefined, { at: { ...GREEN, plane: 0 } });
  for (const key of ["gale_charm", "shade_charm"]) addItem(p.inventory, item(key).id, 1);
  const slot = (key: string) => p.inventory.findIndex((s) => s?.id === item(key).id);
  assert.equal(world.use(p, slot("gale_charm")), charmPulls("east", false), "the Gale altar lies east of the green");
  assert.equal(world.use(p, slot("shade_charm")), charmPulls("north-east", true), "the Shade altar north-east, and down");
  const gale = altarOf("gale_rune");
  const near = world.add("Near", undefined, { at: { x: gale.at.x + 1, y: gale.at.y, plane: 0 } });
  addItem(near.inventory, item("gale_charm").id, 1);
  assert.equal(world.use(near, near.inventory.findIndex((s) => s?.id === item("gale_charm").id)), CHARM_HERE, "beside the altar it says so");
});

test("charms drop by band: every charm from something, and Shade's and Fury's only from level 60 up", () => {
  for (const a of ALTARS) {
    const from = MONSTERS.filter((m) => [...(m.drops.main ?? []), ...(m.drops.rare ?? [])].some((d) => d.item === charmOf(a)));
    assert.ok(from.length > 0, `the ${charmOf(a)} drops from something`);
    if (a.level >= 77) assert.ok(from.every((m) => levelOf(m) >= 60), `the ${charmOf(a)} only from level 60 up (${from.map((m) => m.key).join(", ")})`);
  }
});

test("building Runesmithing moved nothing else: every other object keeps its id and place, and every other region its ground", () => {
  const without = buildOakridge(OAKRIDGE_SEED, { runesmithing: false });
  const key = (o: { id: number; kind: string; x: number; y: number; side: number; tag?: string }) => `${o.id}:${o.kind}:${o.x},${o.y}:${o.side}:${o.tag ?? ""}`;
  for (const [plane, before] of without.planes) {
    const after = stack.planes.get(plane)!;
    // The builder's objects exactly as they were; and anything else put in after every roll (the gem rocks) still there, unmoved.
    assert.equal(after.objects.filter((o) => o.id < FIXED_IDS).map(key).join("|"), before.objects.filter((o) => o.id < FIXED_IDS).map(key).join("|"), `plane ${plane}: every object as it was`);
    const kept = new Set(after.objects.map(key));
    for (const o of before.objects.filter((x) => x.id >= FIXED_IDS)) assert.ok(kept.has(key(o)), `plane ${plane}: the ${o.kind} at ${o.x},${o.y} as it was`);
    for (const r of before.regions.values()) {
      const both = after.regions.get(r.rx + r.ry * 1000) ?? [...after.regions.values()].find((x) => x.rx === r.rx && x.ry === r.ry)!;
      for (const field of ["heights", "underlay", "overlay", "indoors", "roofs"] as const) assert.deepEqual([...both[field]], [...r[field]], `plane ${plane}, region ${r.rx},${r.ry}: ${field}`);
    }
  }
  // The controls: the pit's plane has gained a region, and the world 14 altars and their 56 stones.
  const pitRegions = (s: typeof stack) => [...(s.planes.get(PIT_PLANE)?.regions.values() ?? [])].filter((r) => r.built && r.rx === 47 && r.ry === 57).length;
  assert.deepEqual([pitRegions(stack), pitRegions(without)], [1, 0], "the pit's region is built with Runesmithing alone");
  const all = [...stack.planes.values()].flatMap((m) => m.objects);
  assert.deepEqual([all.filter((o) => o.kind === "rune_altar").length, all.filter((o) => o.kind === "standing_stone").length], [14, 56]);
});

test("a silver circlet used on an altar with its charm takes the charm into it, and worn, the circlet answers the altar in the charm's place", () => {
  const recipe = RECIPES.find((r) => r.item === "silver_circlet");
  assert.ok(recipe && recipe.skill === "crafting" && recipe.level === 23 && recipe.at.includes("furnace"), "a silver circlet is Crafting 23 at a furnace");
  const bare = carver("star_rune", 27, [["silver_circlet", 1]]);
  const star = altarOf("star_rune"), altarId = fixedId(star.at.x, star.at.y, star.at.plane);
  bare.world.interact(bare.p, altarId, bare.p.inventory.findIndex((s) => s?.id === item("silver_circlet").id));
  for (let i = 0; i < 5 && bare.p.action !== null; i++) bare.world.step();
  assert.ok(bare.p.messages.includes(CIRCLET_NEEDS_CHARM), "without the charm, nothing to set");
  const c = carver("star_rune", 27, [["star_charm", 1], ["silver_circlet", 1], ["pure_glimstone", 3]]);
  const before = c.p.xp.runesmithing;
  c.world.interact(c.p, altarId, c.p.inventory.findIndex((s) => s?.id === item("silver_circlet").id));
  for (let i = 0; i < 5 && c.p.action !== null; i++) c.world.step();
  assert.deepEqual([count(c.p, "star_circlet"), count(c.p, "star_charm"), count(c.p, "silver_circlet")], [1, 0, 0], "the charm is in the circlet now");
  assert.equal(c.p.xp.runesmithing - before, circletXp(star), "for the altar's circlet XP");
  c.world.equip(c.p, c.p.inventory.findIndex((s) => s?.id === item("star_circlet").id));
  assert.equal(c.p.equipment.head?.id, item("star_circlet").id, "worn on the head");
  c.carve();
  assert.equal(count(c.p, "star_rune"), 3, "and the altar answers to it, with no charm in the pack");
});
