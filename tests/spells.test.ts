// Magic, stage A1 (local plan: the magic plan): the standard spellbook's elemental ladder as the reference
// has it — four elements in five tiers, each tier's catalyst in every spell of it, levels, XP and damage
// rising — with a tier hitting as hard as its best spell the caster has reached; an elemental staff
// standing in for its runes; a spell cast from the book once, from ten tiles, whatever is held; warding
// paying Magic and Defence; the runes sold and dropped where the plan says; and Phase 11's reagents kept
// under their ids as runes.
import assert from "node:assert/strict";
import { test } from "node:test";
import { addItem, countOf } from "../src/server/inventory.ts";
import { World } from "../src/server/world.ts";
import { ITEM_BY_ID, item } from "../src/shared/items.ts";
import { blankMap } from "../src/shared/map.ts";
import { levelOf, MONSTERS } from "../src/shared/monsters.ts";
import { SHOPS } from "../src/shared/shops.ts";
import { noXp, xpForLevel } from "../src/shared/skills.ts";
import {
  ELEMENT_RUNE, ELEMENTS, RUNE_KEYS, SPELL_BY_KEY, SPELL_RANGE, spellMaxHit, SPELLS, STAFF_ELEMENT, TIERS, type Tier,
} from "../src/shared/spells.ts";

/** Sixty hitpoints, and Magic at the level asked: every pinned roll lands its hardest, and the goblin must not kill the caster first. */
const caster = (magic = 1) => ({ ...noXp(), hitpoints: xpForLevel(60), magic: xpForLevel(magic) });

/** A goblin, and a caster twelve tiles west of it holding what is asked; every roll pinned to succeed at its hardest. */
function field(weapon: string | null, pack: Array<[string, number]>, magic = 1, retaliate = true) {
  const map = blankMap(32, 32);
  map.monsters.push({ monster: "mudfoot_goblin", x: 17, y: 10 });
  const world = new World(map, () => 0);
  const equipment = weapon ? { weapon: { id: item(weapon).id, count: 1 } } : {};
  const p = world.add("Mage", undefined, { at: { x: 5, y: 10 }, xp: caster(magic), equipment, retaliate });
  for (const [key, count] of pack) addItem(p.inventory, item(key).id, count);
  return { world, p, goblin: [...world.npcs.values()][0]! };
}

const CATALYST: Record<Tier, string> = { shot: "thought_rune", lance: "wild_rune", crash: "grave_rune", storm: "heart_rune", fury: "fury_rune" };

test("the spellbook is the reference's elemental ladder: four elements in five tiers, rising, each tier's catalyst in every spell of it", () => {
  assert.equal(SPELLS.length, ELEMENTS.length * TIERS.length, "twenty spells");
  let level = 0, xp = 0, most = 0;
  for (const s of SPELLS) {
    assert.ok(s.level > level && s.xp > xp && s.maxHit > most, `${s.name} comes after weaker spells`);
    [level, xp, most] = [s.level, s.xp, s.maxHit];
    assert.equal(SPELL_BY_KEY.get(s.key), s, "and is found by its key");
    const runes = new Map(s.runes);
    assert.equal(runes.get(CATALYST[s.tier] as never), 1, `${s.name} takes one of its tier's catalyst`);
    assert.ok((runes.get("gale_rune") ?? 0) >= 1, `${s.name} rides on gale runes, as the reference's ride on air`);
    if (s.element !== "gale") assert.ok((runes.get(ELEMENT_RUNE[s.element]) ?? 0) >= 1, `${s.name} spends its own element`);
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
  for (const s of SPELLS) assert.equal(spellMaxHit(s, s.level), Math.max(...SPELLS.filter((t) => t.tier === s.tier && t.level <= s.level).map((t) => t.maxHit)));
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
