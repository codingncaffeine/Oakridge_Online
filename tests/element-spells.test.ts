// Magic, stage A4 (the magic plan): the spells the reference locks behind its gods, quests and obelisks, on
// this game's own terms. Thought Dart, Scorch and the three high spells are cast only through their own staff;
// Thought Dart hits up to a tenth of the Magic level and ten more, Scorch up to 25; a high spell that lands
// lowers a level 5%, never twice, and hits up to 30 while Charge holds; the orb spells fill a glass orb where
// it lies; and Send-to asks another player, who goes only on a yes.
import assert from "node:assert/strict";
import { test } from "node:test";
import { addItem, countOf } from "../src/server/inventory.ts";
import { World, type Player } from "../src/server/world.ts";
import { item } from "../src/shared/items.ts";
import { blankMap } from "../src/shared/map.ts";
import {
  CHARGE_FADES, CHARGE_WAIT, CHARGED, needsStaff, ORB_ONLY, SEND_FAR, SEND_SELF, sendAsked, sendBusy, sendDeclined,
} from "../src/shared/messages.ts";
import { buildOakridge, GREEN, OAKRIDGE_SEED } from "../src/shared/oakridge.ts";
import { RECIPES } from "../src/shared/recipes.ts";
import { noXp, xpForLevel } from "../src/shared/skills.ts";
import { CHARGE_TICKS, CHARGE_WAIT_TICKS, CHARGED_MAX_HIT, SPELL_BY_KEY, STAFF_ELEMENT, TELEPORT_TICKS } from "../src/shared/spells.ts";

const count = (p: Player, key: string) => countOf(p.inventory, item(key).id);

/**
 * A rift wraith (90 hitpoints, Attack 70) and a caster twelve tiles west of it holding what is asked, every roll
 * pinned to land at its hardest (`roll` 0) or to miss (`roll` near 1). The wraith holds its blows, so the checks
 * measure the spells and not how long the caster lives.
 */
function field(weapon: string | null, pack: Array<[string, number]>, magic: number, roll = 0) {
  const map = blankMap(32, 32);
  map.monsters.push({ monster: "rift_wraith", x: 17, y: 10 });
  const world = new World(map, () => roll);
  const equipment = weapon ? { weapon: { id: item(weapon).id, count: 1 } } : {};
  const p = world.add("Mage", undefined, { at: { x: 5, y: 10 }, xp: { ...noXp(), hitpoints: xpForLevel(99), magic: xpForLevel(magic) }, equipment, retaliate: false });
  for (const [key, n] of pack) addItem(p.inventory, item(key).id, n);
  const wraith = [...world.npcs.values()][0]!;
  wraith.nextAttack = Number.MAX_SAFE_INTEGER;
  return { world, p, wraith };
}

/** Casts a spell from the book on the wraith and steps until it is cast or refused; returns what it took off the wraith. */
function castOnce(f: ReturnType<typeof field>, key: string): number {
  const before = f.wraith.hp;
  f.p.shot = null;
  f.world.castOn(f.p, key, f.wraith.id);
  for (let i = 0; i < 30 && !f.p.shot && f.p.target !== null; i++) f.world.step();
  // Out of the fight again, and the next cast allowed at once: each check casts afresh.
  f.p.target = null;
  f.p.action = null;
  f.p.nextAttack = 0;
  return before - f.wraith.hp;
}

const SUNFALL: Array<[string, number]> = [["gale_rune", 12], ["ember_rune", 6], ["heart_rune", 6]];

test("a special spell is cast only through its own staff: refused without it, with nothing spent, and a staff is set to it only in hand", () => {
  for (const weapon of [null, "pyre_staff"]) {
    const f = field(weapon, SUNFALL, 60);
    assert.equal(castOnce(f, "sunfall"), 0, `with ${weapon ?? "nothing"} in hand, Sunfall does nothing`);
    assert.ok(f.p.messages.includes(needsStaff("Dawn staff", "Sunfall")), "and the caster is told which staff it wants");
    assert.equal(count(f.p, "heart_rune"), 6, "with nothing spent");
    assert.equal(f.world.setAutocast(f.p, "sunfall"), false, "and no staff but its own can be set to it");
  }
  const f = field("dawn_staff", SUNFALL, 60);
  assert.equal(castOnce(f, "sunfall"), 20, "through the Dawn staff it strikes, up to 20");
  assert.equal(count(f.p, "heart_rune"), 4, "two heart runes spent");
  assert.equal(f.world.setAutocast(f.p, "sunfall"), true, "and the Dawn staff can be set to cast it");
  for (const [key, staff] of [["thought_dart", "hunter_staff"], ["scorch", "sear_staff"], ["pyre", "pyre_staff"], ["wildclaw", "briar_staff"]] as const) {
    assert.equal(SPELL_BY_KEY.get(key)!.staff, staff, `${key} is cast through the ${staff}`);
  }
});

test("Thought Dart hits up to a tenth of the Magic level and ten more; Scorch up to 25", () => {
  const darts: Array<[string, number]> = [["thought_rune", 8], ["grave_rune", 2]];
  assert.equal(castOnce(field("hunter_staff", darts, 50), "thought_dart"), 15, "15 at level 50");
  assert.equal(castOnce(field("hunter_staff", darts, 90), "thought_dart"), 19, "19 at level 90");
  assert.equal(castOnce(field("sear_staff", [["ember_rune", 5], ["grave_rune", 1]], 50), "scorch"), 25, "Scorch, 25 at level 50");
});

test("a high spell that lands lowers its level 5%, never twice, and hits up to 30 while Charge holds; a miss lowers nothing", () => {
  const f = field("dawn_staff", [...SUNFALL, ["gale_rune", 3], ["ember_rune", 3], ["heart_rune", 3]], 80);
  assert.equal(castOnce(f, "sunfall"), 20, "Sunfall lands for 20");
  assert.equal(f.wraith.drain.attack, 3, "and takes a twentieth of the wraith's Attack of 70");
  const until = f.wraith.drainUntil;
  assert.equal(castOnce(f, "sunfall"), 20, "again");
  assert.equal(f.wraith.drain.attack, 3, "but the Attack is not lowered twice");
  assert.equal(f.wraith.drainUntil, until, "nor its minute started over");
  f.world.castSelf(f.p, "charge");
  assert.ok(f.p.messages.includes(CHARGED), "Charge is cast");
  assert.equal(castOnce(f, "sunfall"), CHARGED_MAX_HIT, "and Sunfall lands for 30 while it holds");
  const missed = field("briar_staff", [["gale_rune", 4], ["ember_rune", 1], ["heart_rune", 2]], 60, 0.9999);
  assert.equal(castOnce(missed, "wildclaw"), 0, "a Wildclaw that misses does nothing");
  assert.equal(missed.wraith.drain.defence, undefined, "and lowers nothing");
});

test("Charge wears off after 700 ticks and is told so, and cannot be cast again within a minute", () => {
  const world = new World(blankMap(16, 16), () => 0);
  const p = world.add("Mage", undefined, { at: { x: 5, y: 5 }, xp: { ...noXp(), magic: xpForLevel(80) } });
  for (const [key, n] of [["gale_rune", 6], ["ember_rune", 6], ["heart_rune", 6]] as const) addItem(p.inventory, item(key).id, n);
  world.castSelf(p, "charge");
  assert.equal(p.chargedUntil, world.tick + CHARGE_TICKS, "it holds for 700 ticks");
  assert.equal(count(p, "heart_rune"), 3, "three heart runes spent");
  world.step();
  world.castSelf(p, "charge");
  assert.ok(p.messages.includes(CHARGE_WAIT), "cast again at once, it is refused");
  assert.equal(count(p, "heart_rune"), 3, "with nothing spent");
  for (let i = 0; i < CHARGE_WAIT_TICKS; i++) world.step();
  world.castSelf(p, "charge");
  assert.equal(count(p, "heart_rune"), 0, "a minute on, it can be cast again");
  const until = p.chargedUntil;
  while (world.tick < until - 1) world.step();
  assert.ok(!p.messages.includes(CHARGE_FADES) && p.chargedUntil !== 0, "it still holds a tick before its end");
  world.step();
  assert.ok(p.messages.includes(CHARGE_FADES), "and at its end the caster is told it has gone");
  assert.equal(p.chargedUntil, 0);
});

test("an orb spell fills a glass orb where it lies, for three Star runes and thirty of its element (a staff stands in for those), and nothing else", () => {
  const world = new World(blankMap(16, 16), () => 0);
  const p = world.add("Mage", undefined, { at: { x: 5, y: 5 }, xp: { ...noXp(), magic: xpForLevel(56) } });
  addItem(p.inventory, item("bones").id, 1);
  addItem(p.inventory, item("star_rune").id, 6);
  addItem(p.inventory, item("tide_rune").id, 30);
  // Well down the pack, with empty slots before it: an orb put back anywhere but where the glass lay would show.
  const slot = 20;
  p.inventory[slot] = { id: item("glass_orb").id, count: 1 };
  world.castItem(p, "charge_tide_orb", p.inventory.findIndex((s) => s?.id === item("bones").id));
  assert.ok(p.messages.includes(ORB_ONLY), "cast on anything but a glass orb, it says so");
  assert.equal(count(p, "star_rune"), 6, "with nothing spent");
  const before = p.xp.magic;
  world.castItem(p, "charge_tide_orb", slot);
  assert.equal(p.inventory[slot]?.id, item("tide_orb").id, "the glass orb is a tide orb, where it lay");
  assert.equal(count(p, "star_rune"), 3, "three Star runes spent");
  assert.equal(count(p, "tide_rune"), 0, "and thirty tide runes");
  assert.equal(p.xp.magic - before, 660, "for 66 Magic XP");
  // With a tide staff in hand the thirty tide runes are the staff's.
  const staffed = new World(blankMap(16, 16), () => 0);
  const q = staffed.add("Mage", undefined, { at: { x: 5, y: 5 }, xp: { ...noXp(), magic: xpForLevel(56) }, equipment: { weapon: { id: item("tide_staff").id, count: 1 } } });
  addItem(q.inventory, item("glass_orb").id, 1);
  addItem(q.inventory, item("star_rune").id, 3);
  staffed.castItem(q, "charge_tide_orb", q.inventory.findIndex((s) => s?.id === item("glass_orb").id));
  assert.equal(count(q, "tide_orb"), 1, "a tide staff stands in for the thirty tide runes");
  // The orbs go into battlestaves, which stand in for their element as the elemental staves do.
  for (const [element, level, xp] of [["tide", 54, 1000], ["stone", 58, 1125], ["ember", 62, 1250], ["gale", 66, 1375]] as const) {
    const recipe = RECIPES.find((r) => r.item === `${element}_battlestaff`);
    assert.ok(recipe && recipe.skill === "crafting" && recipe.level === level && recipe.xp === xp, `the ${element} battlestaff is Crafting ${level} for ${xp / 10} XP`);
    assert.deepEqual(recipe!.needs.map((n) => n.item).sort(), ["battlestaff", `${element}_orb`].sort(), "from a battlestaff and the orb");
    assert.equal(STAFF_ELEMENT[`${element}_battlestaff`], element, "and it stands in for its element's runes");
  }
});

/** Two players on the green, three tiles apart, the first with the Magic and the runes of every Send-to. */
function green() {
  const world = new World(buildOakridge(OAKRIDGE_SEED), () => 0);
  const caster = world.add("Sender", undefined, { at: { ...GREEN, plane: 0 }, xp: { ...noXp(), magic: xpForLevel(99) } });
  for (const rune of ["oath_rune", "shade_rune", "stone_rune", "tide_rune"]) addItem(caster.inventory, item(rune).id, 20);
  const other = world.add("Asked", undefined, { at: { x: GREEN.x + 3, y: GREEN.y, plane: 0 } });
  return { world, caster, other };
}

test("Send-to asks the other player; a yes sends them where the town's teleport lands, the XP the caster's; a no is told to the caster", () => {
  const { world, caster, other } = green();
  const xp = caster.xp.magic, theirs = other.xp.magic;
  world.castOn(caster, "send_wickstead", other.id);
  assert.equal(other.screen?.kind, "send", "the other player is asked");
  assert.ok(caster.messages.includes(sendAsked("Asked")), "and the caster told so");
  assert.equal(count(caster, "shade_rune"), 19, "the runes spent at the cast");
  assert.equal(caster.xp.magic - xp, 920, "and the caster's 92 XP paid");
  world.answer(other, 0);
  assert.equal(other.screen, null, "the question closes on the answer");
  const lands = SPELL_BY_KEY.get("wickstead_teleport")!.lands!;
  for (let i = 0; i < TELEPORT_TICKS; i++) world.step();
  assert.deepEqual([other.x, other.y], [lands.x, lands.y], "a yes sends them where Wickstead's teleport lands");
  assert.equal(other.xp.magic, theirs, "with no XP of their own for it");
  // A no: the caster hears it, and nobody goes anywhere.
  const again = green();
  again.world.castOn(again.caster, "send_oakridge", again.other.id);
  again.world.answer(again.other, 1);
  for (let i = 0; i < TELEPORT_TICKS + 1; i++) again.world.step();
  assert.ok(again.caster.messages.includes(sendDeclined("Asked")), "a no is told to the caster");
  assert.deepEqual([again.other.x, again.other.y], [GREEN.x + 3, GREEN.y], "and they stay where they were");
});

test("Send-to is refused on oneself, on someone too far off and on someone busy, with nothing spent", () => {
  const { world, caster, other } = green();
  world.castOn(caster, "send_oakridge", caster.id);
  assert.ok(caster.messages.includes(SEND_SELF), "not on oneself");
  const far = world.add("Faraway", undefined, { at: { x: GREEN.x + 20, y: GREEN.y, plane: 0 } });
  world.castOn(caster, "send_oakridge", far.id);
  assert.ok(caster.messages.includes(SEND_FAR), "not on someone twenty tiles off");
  other.screen = { kind: "bank" };
  world.castOn(caster, "send_oakridge", other.id);
  assert.ok(caster.messages.includes(sendBusy("Asked")), "not on someone with a screen open");
  assert.equal(count(caster, "shade_rune"), 20, "and nothing spent on any of them");
});
