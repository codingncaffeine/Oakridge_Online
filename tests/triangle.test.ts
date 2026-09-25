// Ranged, magic and prayer (PLAN Phase 11), on the world and on the rolls: an archer shoots from where
// they stand and spends an arrow a shot; a mage casts the style's spell and spends a reagent a cast, hit
// or miss; a prayer lends its share, drains its points and goes out at nothing, and an altar puts them
// back; and the triangle stands in the numbers on the armour — melee beats leather, arrows beat wool,
// bolts beat metal — through the same defence roll every fight makes.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  attackRoll, combatLevel, defenceRoll, effectiveLevel, hitChance, rangedMaxHit, stylesOf, type Fighter,
} from "../src/shared/combat.ts";
import { BONUS_NAMES, item, ITEMS, type Bonuses } from "../src/shared/items.ts";
import { blankMap } from "../src/shared/map.ts";
import { BURIED, CHOOSE_SPELL, NO_ARROWS, noRunes, PRAYER_FULL, PRAYER_RESTORED, PRAYER_SPENT, prayerNeeds, spellNeeds } from "../src/shared/messages.ts";
import { boostsOf, drainPerTick, PRAYERS } from "../src/shared/prayers.ts";
import { SPELL_BY_KEY, SPELLS } from "../src/shared/spells.ts";
import { levelForXp, noXp, xpForLevel } from "../src/shared/skills.ts";
import { addItem, bonusesOf, countOf } from "../src/server/inventory.ts";
import { World, type Player } from "../src/server/world.ts";

const noBonus: Bonuses = BONUS_NAMES.map(() => 0);
const fighter = (over: Partial<Fighter> = {}): Fighter =>
  ({ attack: 1, strength: 1, defence: 1, ranged: 1, magic: 1, bonuses: noBonus, rangedStrength: 0, boosts: {}, stance: "aimed", ...over });
const worn = (...keys: string[]): Bonuses => bonusesOf(Object.fromEntries(keys.map((k) => [item(k).equip!.slot, { id: item(k).id, count: 1 }])));

/** Sixty hitpoints and nothing else: every pinned roll lands its hardest, and the goblin's must not kill the fighter first. */
const tough = () => ({ ...noXp(), hitpoints: xpForLevel(60) });

/** A field with one goblin on it, and a fighter ten tiles west of it; every roll pinned to succeed at its hardest. */
function fieldWith(equipment: Record<string, [string, number]>, pack: Array<[string, number]> = [], xp = tough()) {
  const field = blankMap(32, 32);
  field.monsters.push({ monster: "mudfoot_goblin", x: 15, y: 10 });
  const world = new World(field, () => 0);
  const equip = Object.fromEntries(Object.entries(equipment).map(([slot, [key, count]]) => [slot, { id: item(key).id, count }]));
  const p = world.add("A", undefined, { at: { x: 5, y: 10 }, xp, equipment: equip });
  for (const [key, count] of pack) addItem(p.inventory, item(key).id, count);
  const goblin = [...world.npcs.values()][0]!;
  return { world, p, goblin };
}

const apart = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

const untilDead = (world: World, goblin: { deathTick: number }, max = 300) => {
  for (let i = 0; i < max && goblin.deathTick === 0; i++) world.step();
  return goblin.deathTick > 0;
};

test("an archer shoots from where they stand, spends an arrow a shot, is told when the quiver is empty, and viewers see the shot", () => {
  // Fifteen arrows, a goblin of seven hitpoints, and a level-one archer whose hardest shot is one.
  const { world, p, goblin } = fieldWith({ weapon: ["shortbow", 1], ammo: ["bronze_arrow", 15] });
  assert.equal(rangedMaxHit(fighter({ bonuses: worn("shortbow", "bronze_arrow"), rangedStrength: 7 })), 1);
  world.attack(p, goblin.id);
  world.step();
  assert.ok(p.x > 5 && !p.shot, "ten tiles off is too far, so the archer walks in before shooting");
  const before = { ranged: p.xp.ranged, hitpoints: p.xp.hitpoints };
  let firstShotFrom: number | null = null, shots = 0, seen: unknown = null;
  for (let i = 0; i < 120 && goblin.deathTick === 0; i++) {
    world.step();
    if (p.shot) {
      shots++;
      firstShotFrom ??= apart(p, goblin);
      seen ??= world.viewFor(p).ents.find((e) => e.id === p.id)?.shot;
    }
  }
  assert.ok(goblin.deathTick > 0, "the goblin is shot dead");
  assert.equal(shots, 7, "seven shots of one to kill seven hitpoints");
  assert.ok(firstShotFrom !== null && firstShotFrom >= 2 && firstShotFrom <= 7, `the first shot went from tiles off, not from beside it (${firstShotFrom})`);
  assert.deepEqual(seen, { to: goblin.id, kind: "arrow" }, "and the update told viewers what was shot at");
  assert.equal(p.equipment.ammo?.count, 15 - 7, "an arrow a shot, none of them recovered");
  assert.equal(p.xp.ranged - before.ranged, 40 * 7, "Aimed pays four Ranged XP a point");
  assert.equal(p.xp.hitpoints - before.hitpoints, 13 * 7);

  // The quiver runs dry: the shot is refused with a word, and the archer stands down rather than walking in to punch.
  const dry = fieldWith({ weapon: ["shortbow", 1], ammo: ["bronze_arrow", 2] });
  dry.world.attack(dry.p, dry.goblin.id);
  for (let i = 0; i < 60 && dry.p.target !== null; i++) dry.world.step();
  assert.equal(dry.p.equipment.ammo, undefined, "both arrows went");
  assert.equal(dry.p.target, null, "and the fight ended");
  assert.ok(dry.p.messages.includes(NO_ARROWS), "told the quiver is empty");
  assert.equal(dry.goblin.hp, 5, "two arrows landed before it");
  // The control: no bow means no shooting — a quiver alone fights bare-handed, and walks in to do it.
  const fists = fieldWith({ ammo: ["bronze_arrow", 15] });
  fists.world.attack(fists.p, fists.goblin.id);
  assert.ok(untilDead(fists.world, fists.goblin), "the goblin is beaten to death");
  assert.equal(fists.p.equipment.ammo?.count, 15, "and not one arrow was spent");
  assert.equal(apart(fists.p, fists.goblin), 1, "from beside it");
});

test("a shot never goes through a wall: with one across the field the archer walks round it first", () => {
  const { world, p, goblin } = fieldWith({ weapon: ["shortbow", 1], ammo: ["bronze_arrow", 15] });
  // A wall right across the field's rows 4–16 on the east edge of column 9, so no straight line reaches the goblin.
  const collision = world.mapOf(0).collision;
  for (let y = 4; y <= 16; y++) collision.addWall(9, y, 1);
  world.attack(p, goblin.id);
  let firstShotAt: [number, number] | null = null;
  for (let i = 0; i < 200 && goblin.deathTick === 0; i++) {
    world.step();
    if (p.shot) firstShotAt ??= [p.x, p.y];
  }
  assert.ok(firstShotAt, "the archer got a shot off in the end");
  assert.ok(firstShotAt![1] < 4 || firstShotAt![1] > 16 || firstShotAt![0] > 9, `the first shot was from past the wall's end, at ${firstShotAt}`);
});

test("a mage's staff casts the spell it is set to: its recipe a cast whether it lands or not, Magic XP for the cast and the damage, and a word when the runes or the level are short", () => {
  // Gale Shot hits up to 2 at Magic 1, so four casts kill seven hitpoints (2, 2, 2, 1): a gale rune and a thought rune each.
  const { world, p, goblin } = fieldWith({ weapon: ["ash_staff", 1] }, [["gale_rune", 4], ["thought_rune", 4]]);
  world.setStyle(p, 0);
  assert.ok(world.setAutocast(p, "gale_shot"), "the staff is set to Gale Shot");
  const before = { magic: p.xp.magic, hitpoints: p.xp.hitpoints };
  world.attack(p, goblin.id);
  let firstCastFrom: number | null = null;
  const kinds: string[] = [];
  for (let i = 0; i < 120 && goblin.deathTick === 0; i++) {
    world.step();
    if (p.shot) {
      firstCastFrom ??= apart(p, goblin);
      kinds.push(p.shot.kind);
    }
  }
  assert.ok(goblin.deathTick > 0, "the goblin is struck dead");
  assert.deepEqual(kinds, ["gale_shot", "gale_shot", "gale_shot", "gale_shot"], "four casts, each told as the spell it was");
  assert.ok(firstCastFrom !== null && firstCastFrom >= 2 && firstCastFrom <= 10, `cast from tiles off, not from beside it (${firstCastFrom})`);
  assert.equal(countOf(p.inventory, item("gale_rune").id), 0, "a gale rune a cast");
  assert.equal(countOf(p.inventory, item("thought_rune").id), 0, "and a thought rune");
  assert.equal(p.xp.magic - before.magic, 4 * SPELL_BY_KEY.get("gale_shot")!.xp + 20 * 7, "the casts pay their own XP, and the seven points of damage pay more");
  assert.equal(p.xp.hitpoints - before.hitpoints, 13 * 7);

  // One gale rune: the second cast finds the recipe short, says which rune, and the mage stands down with the goblin alive.
  const short = fieldWith({ weapon: ["ash_staff", 1] }, [["gale_rune", 1], ["thought_rune", 4]]);
  short.world.setAutocast(short.p, "gale_shot");
  short.world.attack(short.p, short.goblin.id);
  for (let i = 0; i < 60 && short.p.target !== null; i++) short.world.step();
  assert.equal(short.p.target, null, "the fight ended");
  assert.equal(short.goblin.hp, 5, "after the one cast");
  assert.ok(short.p.messages.includes(noRunes("Gale rune")), "and the mage was told which rune ran short");
  assert.equal(countOf(short.p.inventory, item("thought_rune").id), 3, "nothing of a recipe is spent on a cast it cannot pay for");

  // Tide Shot at Magic 1: it cannot even be chosen, and a staff set to nothing says so rather than casting.
  const early = fieldWith({ weapon: ["ash_staff", 1] }, [["gale_rune", 5], ["tide_rune", 5], ["thought_rune", 5]]);
  assert.ok(!early.world.setAutocast(early.p, "tide_shot"), "refused");
  assert.ok(early.p.messages.includes(spellNeeds(5, "Tide Shot")), "with the level it takes");
  early.world.attack(early.p, early.goblin.id);
  for (let i = 0; i < 60 && early.p.target !== null; i++) early.world.step();
  assert.ok(early.p.messages.includes(CHOOSE_SPELL), "a staff set to no spell asks for one");
  assert.equal(countOf(early.p.inventory, item("tide_rune").id), 5, "and nothing is spent");
  assert.equal(early.goblin.hp, 7);
  // The control: the same at Magic 5 casts it, and hits up to four.
  const xp = tough();
  xp.magic = xpForLevel(5);
  const able = fieldWith({ weapon: ["ash_staff", 1] }, [["gale_rune", 5], ["tide_rune", 5], ["thought_rune", 5]], xp);
  assert.ok(able.world.setAutocast(able.p, "tide_shot"));
  able.world.attack(able.p, able.goblin.id);
  assert.ok(untilDead(able.world, able.goblin), "Tide Shot at 5 kills it");
  assert.equal(countOf(able.p.inventory, item("tide_rune").id), 3, "in two casts of four");
  // And the staff's own swing spends nothing: Bash walks in and hits.
  const bash = fieldWith({ weapon: ["ash_staff", 1] }, [["gale_rune", 3], ["thought_rune", 3]]);
  bash.world.setAutocast(bash.p, "gale_shot");
  bash.world.setStyle(bash.p, 2);
  bash.world.attack(bash.p, bash.goblin.id);
  assert.ok(untilDead(bash.world, bash.goblin), "the goblin is bashed to death");
  assert.equal(countOf(bash.p.inventory, item("gale_rune").id), 3, "with the runes untouched");
});

test("prayer: bones bury for XP, a prayer lends its share and drains its points, everything goes out at nothing, and an altar restores", () => {
  const field = blankMap(32, 32);
  field.objects.push({ id: 1, kind: "altar", x: 8, y: 8, plane: 0, side: 0, variant: 0.5 });
  const world = new World(field, () => 0.5);
  const xp = noXp();
  xp.prayer = xpForLevel(16);
  const p = world.add("A", undefined, { at: { x: 5, y: 5 }, xp });
  assert.equal(p.prayer, 16, "points equal the level");
  // Burying.
  addItem(p.inventory, item("bones").id, 2);
  const slot = p.inventory.findIndex((s) => s?.id === item("bones").id);
  assert.equal(world.use(p, slot), BURIED);
  assert.equal(countOf(p.inventory, item("bones").id), 1);
  assert.equal(p.xp.prayer, xpForLevel(16) + 45, "four and a half XP a burial");
  // A prayer on: its share is in the fighter's levels; two on the same skill cannot both stay on.
  world.pray(p, "steady_hand", true);
  assert.deepEqual([...p.prayers], ["steady_hand"]);
  assert.deepEqual(boostsOf(p.prayers), { attack: 0.05 });
  world.pray(p, "sure_strike", true);
  assert.deepEqual([...p.prayers], ["sure_strike"], "the stronger Attack prayer takes the weaker one's place");
  world.pray(p, "stone_skin", true);
  assert.deepEqual([...p.prayers].sort(), ["stone_skin", "sure_strike"], "one on each skill stays");
  assert.equal(effectiveLevel(fighter({ attack: 40, boosts: boostsOf(p.prayers), stance: "precise" }), "attack"), Math.floor(40 * 1.1) + 3 + 8);
  // Above the level: refused with the level it takes.
  world.pray(p, "bulls_heart", true);
  assert.ok(p.messages.includes(prayerNeeds(22, "Bull's Heart")));
  assert.ok(!p.prayers.has("bulls_heart"));
  // Draining: Sure Strike costs a point every ten ticks, Stone Skin one every twenty; together, three in twenty.
  assert.equal(drainPerTick(p.prayers), 1 / 10 + 1 / 20);
  for (let i = 0; i < 20; i++) world.step();
  assert.equal(p.prayer, 13, "three points gone in twenty ticks");
  for (let i = 0; i < 100; i++) world.step();
  assert.equal(p.prayer, 0, "and the rest by the time the points run out");
  assert.equal(p.prayers.size, 0, "every prayer went out");
  assert.ok(p.messages.includes(PRAYER_SPENT), "with a word");
  world.pray(p, "steady_hand", true);
  assert.equal(p.prayers.size, 0, "nothing comes on with no points");
  // The altar puts them back.
  world.interact(p, 1);
  for (let i = 0; i < 20 && p.prayer === 0; i++) world.step();
  assert.equal(p.prayer, 16, "praying at the altar restores every point");
  assert.ok(p.messages.includes(PRAYER_RESTORED));
  world.interact(p, 1);
  for (let i = 0; i < 5; i++) world.step();
  assert.ok(p.messages.includes(PRAYER_FULL), "and says so when there is nothing to restore");
  // A Prayer bonus worn slows the drain.
  assert.ok(drainPerTick(["steady_hand"], 30) < drainPerTick(["steady_hand"]), "a worn Prayer bonus stretches the ticks between points");
});

test("the triangle is in the armour's numbers: bolts beat metal, arrows beat wool, blades beat leather", () => {
  const roll = (type: "magic" | "ranged" | "slash", ...keys: string[]) => defenceRoll(fighter({ defence: 20, bonuses: worn(...keys) }), type);
  assert.ok(roll("magic", "iron_helm") < roll("magic", "leather_cap"), "iron on the head draws a bolt; leather turns it");
  assert.ok(roll("magic", "iron_shield") < roll("magic", "wooden_shield"), "and so does an iron shield");
  assert.ok(roll("ranged", "iron_helm") > roll("ranged", "leather_cap"), "an arrow skips off iron");
  assert.ok(roll("ranged", "wool_robe") < roll("ranged", "leather_jerkin"), "and goes straight through wool");
  assert.ok(roll("magic", "wool_robe") > roll("magic", "leather_jerkin"), "which turns a bolt better than leather does");
  assert.ok(roll("slash", "leather_cap") < roll("slash", "iron_helm"), "a blade beats leather");
  // The rolls read the right column: a bow's Ranged bonus counts for a shot and not for a swing.
  const archer = fighter({ ranged: 30, bonuses: worn("oak_longbow", "steel_arrow"), rangedStrength: 16 });
  assert.equal(attackRoll(archer, "ranged"), effectiveLevel(archer, "ranged") * (22 + 16 + 64));
  assert.equal(attackRoll(archer, "slash"), effectiveLevel(archer, "attack") * 64);
  assert.ok(hitChance(attackRoll(archer, "ranged"), roll("ranged", "wool_robe")) > hitChance(attackRoll(archer, "ranged"), roll("ranged", "iron_helm")));
  // Every armour item's Magic defence is set the way the decision says: metal below nothing, leather and wool above it.
  const magicDefence = (key: string) => item(key).equip!.bonuses![BONUS_NAMES.indexOf("Magic defence")]!;
  for (const key of ["bronze_helm", "iron_helm", "steel_helm", "coldiron_helm", "emberite_helm", "starfall_helm", "bronze_shield", "starfall_shield"]) {
    assert.ok(magicDefence(key) < 0, `${key} draws a bolt`);
  }
  for (const key of ["leather_cap", "leather_jerkin", "leather_trousers", "wool_robe", "wool_hood"]) assert.ok(magicDefence(key) > 0, `${key} turns one`);
});

test("the combat level takes the best way of fighting, and creatures come out where they always did", () => {
  assert.equal(combatLevel({ attack: 1, strength: 1, defence: 1, hitpoints: 10 }), 3, "a fresh character");
  assert.equal(combatLevel({ attack: 1, strength: 1, defence: 1, hitpoints: 10, ranged: 1, magic: 1, prayer: 1 }), 3, "with the new skills at one");
  const melee = combatLevel({ attack: 60, strength: 60, defence: 40, hitpoints: 50, prayer: 1 });
  assert.equal(melee, Math.floor((40 + 50) / 4 + (13 * 120) / 40));
  const archer = combatLevel({ attack: 1, strength: 1, defence: 40, hitpoints: 50, ranged: 80, prayer: 1 });
  assert.equal(archer, Math.floor((40 + 50) / 4 + (13 * 120) / 40), "eighty Ranged counts as one and a half times that");
  assert.equal(combatLevel({ attack: 1, strength: 1, defence: 40, hitpoints: 50, magic: 80, prayer: 1 }), archer, "and Magic the same");
  assert.equal(combatLevel({ attack: 1, strength: 1, defence: 40, hitpoints: 50, prayer: 40 }), combatLevel({ attack: 1, strength: 1, defence: 40, hitpoints: 50 }) + 5, "forty Prayer is five levels");
  // A creature passes nothing for the three, and its level is what the bestiary was balanced on.
  assert.equal(combatLevel({ attack: 4, strength: 4, defence: 3, hitpoints: 7 }), 5, "the goblin");
});

test("the spells and prayers are consistent, and the shop sells what they need", () => {
  let level = 0, hardest = 0;
  for (const spell of SPELLS) {
    // The whole book rises in level; the elemental ladder rises in damage too (a curse hits for nothing).
    assert.ok(spell.level >= level && (spell.tier === null || spell.maxHit >= hardest), `${spell.key} comes after weaker spells`);
    level = spell.level;
    if (spell.tier !== null) hardest = spell.maxHit;
    for (const [rune] of spell.runes) assert.ok(item(rune).stackable, `${rune} stacks`);
    // Every spell pays but Hearthward, which costs nothing and pays nothing.
    assert.ok(spell.xp > 0 || (spell.hearth === true && spell.runes.length === 0), `${spell.key} pays`);
  }
  level = 0;
  for (const prayer of PRAYERS) {
    assert.ok(prayer.level >= level, `${prayer.key} comes after weaker prayers`);
    level = prayer.level;
    assert.ok(prayer.share === 0.05 || prayer.share === 0.1);
    assert.ok(prayer.drain > 0);
    assert.ok(prayer.share === 0.1 ? prayer.drain < 20 : prayer.drain === 20, "the stronger prayers drain faster");
  }
  const casting = stylesOf("staff").filter((s) => s.autocast);
  assert.ok(casting.length === 2 && casting.every((s) => s.type === "magic"), "a staff casts plainly or warding, whatever spell it is set to");
  assert.ok(ITEMS.filter((d) => d.action === "Bury").every((d) => (d.prayerXp ?? 0) > 0), "everything buried pays");
});
