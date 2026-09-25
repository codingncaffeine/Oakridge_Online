// Magic (the magic plan). Stage A1: the standard spellbook's elemental ladder as the reference has it —
// four elements in five tiers, each tier's catalyst in every spell of it, levels, XP and damage rising —
// with a tier hitting as hard as its best spell the caster has reached; an elemental staff standing in for
// its runes; a spell cast from the book once, from ten tiles, whatever is held; warding paying Magic and
// Defence; the runes sold and dropped where the plan says; and Phase 11's reagents kept under their ids as
// runes. Stage A2: curses that lower a level for a minute and never stack, binds that hold a creature where
// it stands, Lay to Rest on the dead alone, Take Measure, and a staff set only to a spell that strikes.
import assert from "node:assert/strict";
import { test } from "node:test";
import { addItem, countOf } from "../src/server/inventory.ts";
import { World } from "../src/server/world.ts";
import { ITEM_BY_ID, item } from "../src/shared/items.ts";
import { blankMap } from "../src/shared/map.ts";
import { ALREADY_HELD, alreadyLowered, DEAD_ONLY, measured, NOT_AUTOCAST } from "../src/shared/messages.ts";
import { levelOf, MONSTER_BY_KEY, MONSTERS } from "../src/shared/monsters.ts";
import { SHOPS } from "../src/shared/shops.ts";
import { noXp, xpForLevel } from "../src/shared/skills.ts";
import {
  CURSE_TICKS, ELEMENT_RUNE, ELEMENTS, RUNE_KEYS, SPELL_BY_KEY, SPELL_RANGE, spellMaxHit, SPELLS, STAFF_ELEMENT, TIERS, type Tier,
} from "../src/shared/spells.ts";

/** Sixty hitpoints, and Magic at the level asked: every pinned roll lands its hardest, and the goblin must not kill the caster first. */
const caster = (magic = 1) => ({ ...noXp(), hitpoints: xpForLevel(60), magic: xpForLevel(magic) });

/** A creature (a goblin unless asked), and a caster twelve tiles west of it holding what is asked; every roll pinned to succeed at its hardest. */
function field(weapon: string | null, pack: Array<[string, number]>, magic = 1, retaliate = true, monster = "mudfoot_goblin") {
  const map = blankMap(32, 32);
  map.monsters.push({ monster, x: 17, y: 10 });
  const world = new World(map, () => 0);
  const equipment = weapon ? { weapon: { id: item(weapon).id, count: 1 } } : {};
  const p = world.add("Mage", undefined, { at: { x: 5, y: 10 }, xp: caster(magic), equipment, retaliate });
  for (const [key, count] of pack) addItem(p.inventory, item(key).id, count);
  return { world, p, goblin: [...world.npcs.values()][0]! };
}

const CATALYST: Record<Tier, string> = { shot: "thought_rune", lance: "wild_rune", crash: "grave_rune", storm: "heart_rune", fury: "fury_rune" };

test("the spellbook is the reference's elemental ladder: four elements in five tiers, rising, each tier's catalyst in every spell of it", () => {
  const ladder = SPELLS.filter((s) => s.element !== null && s.tier !== null);
  assert.equal(ladder.length, ELEMENTS.length * TIERS.length, "twenty elemental spells");
  let level = 0, xp = 0, most = 0;
  for (const s of ladder) {
    assert.ok(s.level > level && s.xp > xp && s.maxHit > most, `${s.name} comes after weaker spells`);
    [level, xp, most] = [s.level, s.xp, s.maxHit];
    assert.equal(SPELL_BY_KEY.get(s.key), s, "and is found by its key");
    const runes = new Map(s.runes);
    assert.equal(runes.get(CATALYST[s.tier!] as never), 1, `${s.name} takes one of its tier's catalyst`);
    assert.ok((runes.get("gale_rune") ?? 0) >= 1, `${s.name} rides on gale runes, as the reference's ride on air`);
    if (s.element !== "gale") assert.ok((runes.get(ELEMENT_RUNE[s.element!]) ?? 0) >= 1, `${s.name} spends its own element`);
    for (const [rune, count] of s.runes) {
      assert.ok(RUNE_KEYS.includes(rune) && count > 0, `${s.name}'s ${rune} is a rune`);
      assert.ok(item(rune).stackable, `${rune} stacks`);
    }
  }
  // The tiers open in the reference's order, a tier's four spells before the next tier's first.
  for (let i = 1; i < TIERS.length; i++) {
    const last = Math.max(...SPELLS.filter((s) => s.tier === TIERS[i - 1]).map((s) => s.level));
    const first = Math.min(...SPELLS.filter((s) => s.tier === TIERS[i]).map((s) => s.level));
    assert.ok(last < first, `${TIERS[i]} opens after ${TIERS[i - 1]} is done`);
  }
  // The whole book in level order, every key once, and every rune of every recipe a stacking rune.
  for (let i = 1; i < SPELLS.length; i++) assert.ok(SPELLS[i]!.level >= SPELLS[i - 1]!.level, `${SPELLS[i]!.name} is in level order`);
  assert.equal(new Set(SPELLS.map((s) => s.key)).size, SPELLS.length, "no key twice");
  for (const s of SPELLS) for (const [rune] of s.runes) assert.ok(RUNE_KEYS.includes(rune) && item(rune).stackable, `${s.name}'s ${rune}`);
});

test("a tier hits as hard as the best spell of it the caster has reached, and never less than its own", () => {
  const gale = SPELL_BY_KEY.get("gale_shot")!, lance = SPELL_BY_KEY.get("gale_lance")!, fury = SPELL_BY_KEY.get("gale_fury")!;
  assert.equal(spellMaxHit(gale, 1), 2, "Gale Shot alone");
  assert.equal(spellMaxHit(gale, 12), 6, "with Stone Shot reached");
  assert.equal(spellMaxHit(gale, 13), 8, "and Ember Shot");
  assert.equal(spellMaxHit(gale, 99), 8, "a higher tier lends nothing");
  assert.equal(spellMaxHit(lance, 34), 11, "Gale Lance at 34, with Stone Lance reached");
  assert.equal(spellMaxHit(lance, 35), 12);
  assert.equal(spellMaxHit(fury, 95), 24);
  for (const s of SPELLS.filter((t) => t.tier !== null)) assert.equal(spellMaxHit(s, s.level), Math.max(...SPELLS.filter((t) => t.tier === s.tier && t.level <= s.level).map((t) => t.maxHit)));
  assert.equal(spellMaxHit(SPELL_BY_KEY.get("lay_to_rest")!, 99), 15, "a spell off the ladder hits as hard as itself, whatever the level");
});

test("an elemental staff stands in for every rune of its element; any other staff does not", () => {
  // A gale staff and thought runes alone: Gale Shot casts four times and not a gale rune is asked for.
  const { world, p, goblin } = field("gale_staff", [["thought_rune", 4]]);
  assert.ok(world.setAutocast(p, "gale_shot"));
  world.attack(p, goblin.id);
  let casts = 0;
  for (let i = 0; i < 120 && goblin.deathTick === 0; i++) {
    world.step();
    if (p.shot) casts++;
  }
  assert.equal(goblin.deathTick > 0 && casts, 4, "four casts on thought runes alone");
  assert.equal(countOf(p.inventory, item("thought_rune").id), 0);
  // The control: an ember staff stands in for nothing Gale Shot needs.
  const other = field("ember_staff", [["thought_rune", 4]]);
  other.world.setAutocast(other.p, "gale_shot");
  other.world.attack(other.p, other.goblin.id);
  for (let i = 0; i < 60 && other.p.target !== null; i++) other.world.step();
  assert.equal(other.goblin.hp, 7, "no cast without gale runes");
  for (const [key, element] of Object.entries(STAFF_ELEMENT)) {
    const def = item(key);
    assert.ok(def.equip?.weapon === "staff" && (def.equip.bonuses?.[3] ?? 0) > 0, `${def.name} is a staff with a Magic bonus`);
    assert.ok(ELEMENTS.includes(element));
  }
});

test("a spell from the book is cast once, from as far as ten tiles, whatever is held, and then the caster stands", () => {
  const { world, p, goblin } = field("bronze_sword", [["gale_rune", 5], ["thought_rune", 5]], 1, false);
  world.castOn(p, "gale_shot", goblin.id);
  let casts = 0, from: number | null = null;
  for (let i = 0; i < 40; i++) {
    world.step();
    if (p.shot) {
      casts++;
      from ??= Math.max(Math.abs(p.x - goblin.x), Math.abs(p.y - goblin.y));
      assert.equal(p.shot.kind, "gale_shot");
    }
  }
  assert.equal(casts, 1, "one cast");
  assert.ok(from !== null && from <= SPELL_RANGE && from >= SPELL_RANGE - 1, `from as far off as it reaches (${from})`);
  assert.equal(p.target, null, "then the caster stands");
  assert.equal(countOf(p.inventory, item("gale_rune").id), 4, "a sword in hand, and the runes spent all the same");
  // Asked without the runes, it is refused on the spot, and nobody walks anywhere.
  const bare = field(null, [["thought_rune", 5]]);
  bare.world.castOn(bare.p, "gale_shot", bare.goblin.id);
  bare.world.step();
  assert.equal(bare.p.target, null, "refused");
  assert.equal(bare.p.x, 5, "without a step taken");
});

test("cast warding pays Magic and Defence for the damage, where plain casting pays Magic alone", () => {
  const plain = field("ash_staff", [["gale_rune", 1], ["thought_rune", 1]], 1, false);
  const warding = field("ash_staff", [["gale_rune", 1], ["thought_rune", 1]], 1, false);
  for (const [f, style] of [[plain, 0], [warding, 1]] as const) {
    f.world.setStyle(f.p, style);
    f.world.setAutocast(f.p, "gale_shot");
    f.world.attack(f.p, f.goblin.id);
    for (let i = 0; i < 40 && f.goblin.hp === 7; i++) f.world.step();
    assert.equal(f.goblin.hp, 5, "one cast of two landed");
  }
  assert.equal(plain.p.xp.magic, xpForLevel(1) + 55 + 20 * 2);
  assert.equal(plain.p.xp.defence, 0);
  assert.equal(warding.p.xp.magic, xpForLevel(1) + 55 + 13 * 2);
  assert.equal(warding.p.xp.defence, 10 * 2);
});

test("the runes are sold where the plan says and dropped by band, and Phase 11's reagents are runes under their own ids", () => {
  const sold = (shop: string) => new Set(SHOPS[shop]!.stock.map((l) => ITEM_BY_ID.get(l.id)?.key));
  const vell = sold("thornbury_staves"), caravan = sold("sandreach_caravan");
  for (const rune of ["gale_rune", "tide_rune", "stone_rune", "ember_rune", "thought_rune", "sinew_rune", "wild_rune", "grave_rune"]) assert.ok(vell.has(rune), `Vell sells ${rune}`);
  for (const staff of Object.keys(STAFF_ELEMENT)) assert.ok(vell.has(staff), `Vell sells the ${staff}`);
  for (const rune of ["bloom_rune", "oath_rune"]) assert.ok(caravan.has(rune), `the Caravan Post sells ${rune}`);
  const everySold = new Set(Object.keys(SHOPS).flatMap((k) => [...sold(k)]));
  for (const rune of ["heart_rune", "shade_rune", "fury_rune"]) assert.ok(!everySold.has(rune), `${rune} is sold nowhere`);
  // Every rune drops from something, and the rarest only from the worst company.
  for (const rune of RUNE_KEYS) {
    const from = MONSTERS.filter((m) => [...(m.drops.main ?? []), ...(m.drops.rare ?? [])].some((d) => d.item === rune));
    assert.ok(from.length > 0, `${rune} drops from something`);
    if (rune === "heart_rune" || rune === "shade_rune" || rune === "fury_rune") {
      assert.ok(from.every((m) => levelOf(m) >= 60), `${rune} only from level 60 up (${from.map((m) => m.key).join(", ")})`);
    }
  }
  assert.equal(item("ember_rune").id, 135, "ember dust is the Ember rune");
  assert.equal(item("tide_rune").id, 136, "frost salt is the Tide rune");
  assert.equal(item("gale_rune").id, 137, "storm glass is the Gale rune");
  const w = new World(blankMap(8, 8), () => 0);
  assert.equal(w.add("Kept", undefined, { autocast: "stone_lance" }).autocast, "stone_lance", "a chosen spell is kept across a save");
  assert.equal(w.add("Stale", undefined, { autocast: "ember_bolt" }).autocast, null, "and a spell that no longer exists is let go");
});

/** Casts a spell from the book on the field's creature and steps until it is cast (or refused); returns the ticks it took. */
function castOnce(f: ReturnType<typeof field>, key: string): void {
  f.world.castOn(f.p, key, f.goblin.id);
  for (let i = 0; i < 30 && !f.p.shot && f.p.target !== null; i++) f.world.step();
}

test("a curse lowers a creature's level by its share for a minute, never twice, and turns it on the caster", () => {
  const befuddle: Array<[string, number]> = [["sinew_rune", 2], ["stone_rune", 4], ["tide_rune", 6]];
  const f = field(null, befuddle, 3, false);
  castOnce(f, "befuddle");
  assert.equal(f.goblin.drain.attack, 1, "Befuddle takes a twentieth of the goblin's Attack, and at least one");
  assert.equal(f.goblin.target, f.p.id, "and the goblin turns on the one who cursed it");
  assert.equal(countOf(f.p.inventory, item("tide_rune").id), 3, "three tide runes spent");
  // Again: refused, with nothing spent, as the reference refuses a curse on a level already lowered.
  f.world.step();
  f.p.shot = null;
  castOnce(f, "befuddle");
  assert.ok(f.p.messages.includes(alreadyLowered("Attack")), "refused on a level already lowered");
  assert.equal(countOf(f.p.inventory, item("tide_rune").id), 3, "and nothing spent on it");
  // A minute on, the level is back.
  for (let i = 0; i < CURSE_TICKS + 2; i++) f.world.step();
  assert.deepEqual(f.goblin.drain, {}, "the curse wears off");
  const def = MONSTER_BY_KEY.get("mudfoot_goblin")!;
  assert.equal(def.attack, 4, "(the goblin's Attack the drain was taken from)");
});

test("a bind holds a creature where it stands, lets go on time, and cannot be doubled up", () => {
  // Five tiles off, inside the goblin's leash: bound, it turns on the caster but cannot close; then it comes on.
  const f = field(null, [["bloom_rune", 4], ["stone_rune", 6], ["tide_rune", 6]], 20, false);
  f.world.travel(f.p, 12, 10, 0);
  castOnce(f, "root");
  const at = { x: f.goblin.x, y: f.goblin.y };
  assert.equal(f.goblin.target, f.p.id, "bound, it turns on the caster");
  let held = 0;
  for (let i = 0; i < 20 && f.goblin.x === at.x && f.goblin.y === at.y; i++) {
    f.world.step();
    if (f.goblin.x === at.x && f.goblin.y === at.y) held++;
  }
  assert.ok(held >= 6 && held <= 8, `it stood its ground for the bind's eight ticks (${held})`);
  assert.ok(f.goblin.x < at.x, "then it came on at the caster");
  // A second bind while the first holds is refused, runes and all.
  const g = field(null, [["bloom_rune", 4], ["stone_rune", 6], ["tide_rune", 6]], 20, false);
  castOnce(g, "root");
  g.world.step();
  g.p.shot = null;
  castOnce(g, "root");
  assert.ok(g.p.messages.includes(ALREADY_HELD), "refused while held");
  assert.equal(countOf(g.p.inventory, item("bloom_rune").id), 2, "one bind's bloom runes spent, not two");
});

test("Lay to Rest works on the dead alone", () => {
  const runes: Array<[string, number]> = [["gale_rune", 4], ["stone_rune", 4], ["wild_rune", 2]];
  const living = field(null, runes, 39, false);
  castOnce(living, "lay_to_rest");
  assert.ok(living.p.messages.includes(DEAD_ONLY), "refused on a goblin");
  assert.equal(countOf(living.p.inventory, item("wild_rune").id), 2, "with nothing spent");
  // The control: on a skeleton it lands, as hard as it can.
  const dead = field(null, runes, 39, false, "ruin_skeleton");
  const hp = dead.goblin.hp;
  castOnce(dead, "lay_to_rest");
  assert.equal(hp - dead.goblin.hp, Math.min(15, hp), "it strikes one of the dead for its fifteen");
  for (const m of MONSTERS) if (m.undead) assert.ok(m.shape === "skeletal" || m.shape === "humanoid", `${m.name} is dead and looks it`);
});

test("Take Measure reads a creature out without starting a fight", () => {
  const f = field(null, [["sinew_rune", 2], ["thought_rune", 2]], 42, false);
  castOnce(f, "take_measure");
  const d = MONSTER_BY_KEY.get("mudfoot_goblin")!;
  assert.ok(f.p.messages.includes(measured(d.name, levelOf(d), d.attack, d.strength, d.defence, d.hitpoints, d.hitpoints, d.maxHit)), "it says the goblin's levels, life and hardest blow");
  assert.equal(f.goblin.target, null, "and the goblin is none the wiser");
});

test("a staff can be set only to a spell that strikes", () => {
  const f = field("ash_staff", [], 50);
  assert.equal(f.world.setAutocast(f.p, "befuddle"), false, "not a curse");
  assert.ok(f.p.messages.includes(NOT_AUTOCAST));
  assert.equal(f.world.setAutocast(f.p, "take_measure"), false, "nor Take Measure");
  assert.equal(f.world.setAutocast(f.p, "lay_to_rest"), true, "Lay to Rest strikes, and can be");
});
