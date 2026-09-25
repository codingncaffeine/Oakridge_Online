// The enchanting spells (the magic plan, stage A5c): each works its own gems' jewellery and nothing else; every
// plain piece has an enchanted self, the gold amulets with the reference's stat amulets' numbers; the Ring of
// Thorns returns part of each blow and crumbles, the Rekindling necklace heals once and the Lifeward ring takes its
// wearer home once, each when a blow leaves them low; and a rubbed piece asks where, goes there, and rests.
import assert from "node:assert/strict";
import { test } from "node:test";
import { addItem, countOf } from "../src/server/inventory.ts";
import { World, type Player } from "../src/server/world.ts";
import { ARROW_ENCHANTS, ARROW_PROCS, ENCHANTED, RUB_WAIT_MS, SPECIAL, THORNS_CHARGE } from "../src/shared/enchant.ts";
import { RECIPES } from "../src/shared/recipes.ts";
import { BONUS_NAMES, item, ITEM_BY_KEY } from "../src/shared/items.ts";
import { blankMap } from "../src/shared/map.ts";
import { cantEnchant, LIFEWARD, REKINDLED, rubWait, THORNS_CRUMBLE } from "../src/shared/messages.ts";
import { MONSTER_BY_KEY } from "../src/shared/monsters.ts";
import { buildOakridge, OAKRIDGE_SEED } from "../src/shared/oakridge.ts";
import { noXp, xpForLevel } from "../src/shared/skills.ts";
import { SPELL_BY_KEY, SPELLS, TELEPORT_TICKS } from "../src/shared/spells.ts";

const count = (p: Player, key: string) => countOf(p.inventory, item(key).id);
const bonus = (key: string, name: (typeof BONUS_NAMES)[number]) => item(key).equip?.bonuses?.[BONUS_NAMES.indexOf(name)] ?? 0;

test("each enchanting spell turns its own gems' pieces into their enchanted selves, spends its recipe, and works nothing else", () => {
  const spells = SPELLS.filter((s) => s.enchants);
  assert.equal(spells.length, 7, "seven, the reference's");
  for (const spell of spells) {
    for (const gem of spell.enchants!) {
      const stem = gem === "red_topaz" ? "topaz" : gem;
      const piece = `${stem}_amulet`, into = ENCHANTED[piece]!;
      const world = new World(blankMap(16, 16), () => 0);
      const p = world.add("Enchanter", undefined, { at: { x: 5, y: 5 }, xp: { ...noXp(), magic: xpForLevel(spell.level) } });
      addItem(p.inventory, item(piece).id, 1);
      for (const [rune, n] of spell.runes) addItem(p.inventory, item(rune).id, n);
      world.castItem(p, spell.key, p.inventory.findIndex((s) => s?.id === item(piece).id));
      assert.equal(count(p, into), 1, `${spell.name} makes a ${into} of a ${piece}`);
      for (const [rune] of spell.runes) assert.equal(count(p, rune), 0, `and spends its ${rune}`);
    }
    const other = spell.key === "enchant_sapphire" ? "ruby_ring" : "sapphire_ring";
    const world = new World(blankMap(16, 16), () => 0);
    const p = world.add("Enchanter", undefined, { at: { x: 5, y: 5 }, xp: { ...noXp(), magic: xpForLevel(99) } });
    addItem(p.inventory, item(other).id, 1);
    for (const [rune, n] of spell.runes) addItem(p.inventory, item(rune).id, n);
    world.castItem(p, spell.key, p.inventory.findIndex((s) => s?.id === item(other).id));
    assert.ok(p.messages.includes(cantEnchant(spell.name)), `${spell.name} will not work a ${other}`);
    assert.equal(count(p, other), 1, "which stays as it was");
  }
});

test("every plain piece has an enchanted self; the gold amulets carry the reference's stat amulets' numbers", () => {
  const pieces = ["opal", "jade", "topaz", "sapphire", "emerald", "ruby", "diamond", "wyrmstone", "onyx", "sunstone"].flatMap((g) => ["ring", "necklace", "bracelet", "amulet"].map((k) => `${g}_${k}`));
  for (const piece of pieces) assert.ok(ITEM_BY_KEY.has(ENCHANTED[piece] ?? ""), `${piece} enchants into something that exists`);
  assert.equal(new Set(Object.values(ENCHANTED)).size, 40, "forty different pieces");
  assert.equal(bonus(ENCHANTED.sapphire_amulet!, "Magic"), 10, "the sapphire amulet: Magic +10");
  assert.equal(bonus(ENCHANTED.emerald_amulet!, "Slash defence"), 7, "the emerald: every defence +7");
  assert.equal(bonus(ENCHANTED.ruby_amulet!, "Strength"), 10, "the ruby: Strength +10");
  assert.deepEqual([bonus(ENCHANTED.diamond_amulet!, "Crush"), bonus(ENCHANTED.diamond_amulet!, "Strength")], [6, 6], "the diamond: all round +6");
  assert.equal(bonus(ENCHANTED.onyx_amulet!, "Stab defence"), 15, "the onyx: defences +15");
  assert.deepEqual(Object.values(SPECIAL).sort(), ["lifeward", "rekindle", "thorns"]);
});

/** A player with 50 hitpoints standing beside a creature that swings at them at its hardest every time, wearing what is asked. */
function struck(hp: number, worn: Partial<Record<"ring" | "neck", string>>, monster = "grey_wolf") {
  const map = blankMap(32, 32);
  map.monsters.push({ monster, x: 11, y: 10 });
  const world = new World(map, () => 0);
  const equipment = Object.fromEntries(Object.entries(worn).map(([slot, key]) => [slot, { id: item(key).id, count: 1 }]));
  const p = world.add("Wearer", undefined, { at: { x: 10, y: 10 }, xp: { ...noXp(), hitpoints: xpForLevel(50) }, equipment, retaliate: false });
  p.hp = hp;
  const n = [...world.npcs.values()][0]!;
  n.target = p.id;
  return { world, p, n, max: MONSTER_BY_KEY.get(monster)!.maxHit };
}

test("a Ring of Thorns returns a tenth of each blow and one more to the creature, and crumbles once it has returned forty", () => {
  const { world, p, n, max } = struck(50, { ring: "ring_of_thorns" });
  const before = n.hp;
  for (let i = 0; i < 10 && p.hp === 50; i++) world.step();
  assert.equal(before - n.hp, Math.floor(max / 10) + 1, `a blow of ${max} returns ${Math.floor(max / 10) + 1}`);
  assert.equal(THORNS_CHARGE, 40);
  p.thorns = 1;
  const hp = p.hp;
  for (let i = 0; i < 10 && p.hp === hp; i++) world.step();
  assert.equal(p.equipment.ring, undefined, "the ring crumbles when its forty are spent");
  assert.ok(p.messages.includes(THORNS_CRUMBLE));
  assert.equal(p.thorns, THORNS_CHARGE, "and the next one starts fresh");
});

test("a Rekindling necklace heals three tenths once a blow leaves its wearer under a fifth; a Lifeward ring takes them home under a tenth", () => {
  // One blow from 11 takes them under a fifth of 50 (10 itself is not under it).
  const blow = MONSTER_BY_KEY.get("mudfoot_goblin")!.maxHit;
  const warm = struck(10 + blow - 1, { neck: "rekindling_necklace" }, "mudfoot_goblin");
  for (let i = 0; i < 10 && !warm.p.messages.includes(REKINDLED); i++) warm.world.step();
  assert.ok(warm.p.messages.includes(REKINDLED), "a blow under a fifth wakes the necklace");
  assert.equal(warm.p.hp, 10 - 1 + 15, "and heals fifteen of fifty");
  assert.equal(warm.p.equipment.neck, undefined, "and it is gone");
  const low = struck(5 + blow - 1, { ring: "lifeward_ring" }, "mudfoot_goblin");
  for (let i = 0; i < 10 && !low.p.messages.includes(LIFEWARD); i++) low.world.step();
  assert.ok(low.p.messages.includes(LIFEWARD), "a blow under a tenth wakes the ring");
  assert.deepEqual([low.p.x, low.p.y], [low.world.stack.spawn.x, low.world.stack.spawn.y], "and it takes them home");
  assert.equal(low.p.equipment.ring, undefined, "and it is gone");
});

test("a rubbed Wyrm amulet asks where, goes there without Magic XP, and rests ten minutes", () => {
  const world = new World(buildOakridge(OAKRIDGE_SEED), () => 0);
  const p = world.add("Rubber", undefined, {});
  addItem(p.inventory, item("wyrm_amulet").id, 1);
  const slot = p.inventory.findIndex((s) => s?.id === item("wyrm_amulet").id), xp = p.xp.magic;
  world.use(p, slot);
  assert.equal(p.screen?.kind, "rub", "rubbing it asks where");
  assert.deepEqual(world.rubPlaces("wyrm_amulet"), ["Oakridge", "Brinehaven", "Kilnhold", "Deepdelve"]);
  world.answer(p, 1);
  for (let i = 0; i < TELEPORT_TICKS; i++) world.step();
  const lands = SPELL_BY_KEY.get("brinehaven_teleport")!.lands!;
  assert.deepEqual([p.x, p.y], [lands.x, lands.y], "the second place is Brinehaven");
  assert.equal(p.xp.magic, xp, "with no Magic XP for it");
  assert.equal(world.use(p, slot), rubWait(RUB_WAIT_MS / 60000), "then it rests ten minutes");
});

test("Enchant Arrows works ten gem-tipped arrows a cast at each gem's own level, recipe and XP, and the tips and arrows are Fletching", () => {
  const spell = SPELL_BY_KEY.get("enchant_arrows")!;
  for (const [key, e] of Object.entries(ARROW_ENCHANTS)) {
    const world = new World(blankMap(16, 16), () => 0);
    const p = world.add("Fletcher", undefined, { at: { x: 5, y: 5 }, xp: { ...noXp(), magic: xpForLevel(e.level) } });
    addItem(p.inventory, item(key).id, 15);
    for (const [rune, n] of e.runes) addItem(p.inventory, item(rune).id, n);
    const before = p.xp.magic;
    world.castItem(p, spell.key, p.inventory.findIndex((s) => s?.id === item(key).id));
    assert.deepEqual([count(p, e.into), count(p, key)], [10, 5], `ten ${key}s become ${e.into}`);
    assert.equal(p.xp.magic - before, e.xp, `for ${e.xp / 10} Magic XP`);
    for (const [rune] of e.runes) assert.equal(count(p, rune), 0, `spending its ${rune}`);
    const early = new World(blankMap(16, 16), () => 0);
    const q = early.add("Early", undefined, { at: { x: 5, y: 5 }, xp: { ...noXp(), magic: xpForLevel(e.level - 1) } });
    addItem(q.inventory, item(key).id, 10);
    for (const [rune, n] of e.runes) addItem(q.inventory, item(rune).id, n);
    early.castItem(q, spell.key, q.inventory.findIndex((s) => s?.id === item(key).id));
    assert.equal(count(q, e.into), 0, `a level short of ${e.level}, nothing`);
    const stem = key.replace("_tipped_arrow", "");
    assert.ok(RECIPES.some((r) => r.item === `${stem}_tips` && r.skill === "fletching" && r.tool === "chisel"), `${stem} tips are cut with a chisel`);
    assert.ok(RECIPES.some((r) => r.item === key && r.skill === "fletching" && r.each === 10), `and ten go onto ten arrows`);
  }
});

/** One shot from a shortbow at a rift wraith (90 hitpoints), every roll pinned so each lands at its hardest and every arrow's chance comes. */
function shoot(ammo: string, hp = 99) {
  const map = blankMap(32, 32);
  map.monsters.push({ monster: "rift_wraith", x: 14, y: 10 });
  const world = new World(map, () => 0);
  const equipment = { weapon: { id: item("shortbow").id, count: 1 }, ammo: { id: item(ammo).id, count: 5 } };
  const p = world.add("Archer", undefined, { at: { x: 10, y: 10 }, xp: { ...noXp(), ranged: xpForLevel(50), hitpoints: xpForLevel(99), prayer: xpForLevel(40) }, equipment, retaliate: false });
  p.hp = hp;
  p.prayer = 10;
  const n = [...world.npcs.values()][0]!;
  n.nextAttack = Number.MAX_SAFE_INTEGER;
  world.attack(p, n.id);
  for (let i = 0; i < 20 && !p.shot; i++) world.step();
  return { world, p, n, took: 90 - n.hp };
}

test("an enchanted arrow does more now and then, in this game's terms; a plain tipped one does not", () => {
  // Each against the same gem's plain tipped arrow: the soft gems sit on iron arrows, the rest on steel.
  const plainOf = (stem: string) => shoot(`${stem}_tipped_arrow`).took;
  const plain = plainOf("onyx");
  assert.ok(plain > 0, `a plain tipped arrow hits for ${plain}`);
  assert.equal(shoot("enchanted_opal_arrow").took, plainOf("opal") + 5, "opal: a tenth of Ranged 50 more");
  assert.equal(shoot("enchanted_emerald_arrow").took, plainOf("emerald") + 1, "emerald: one more");
  assert.equal(shoot("enchanted_wyrmstone_arrow").took, plainOf("wyrmstone") + 10, "wyrmstone: a fifth of Ranged more");
  assert.equal(shoot("enchanted_onyx_arrow", 50).took, Math.floor(plain * 1.2), "onyx: a fifth harder");
  const drink = shoot("enchanted_onyx_arrow", 50);
  assert.equal(drink.p.hp, 50 + Math.floor(Math.floor(plain * 1.2) / 4), "and heals a quarter of it");
  const blood = shoot("enchanted_ruby_arrow", 60);
  assert.deepEqual([blood.took, blood.p.hp], [18, 54], "ruby: a fifth of the wraith's 90, for a tenth of the archer's 60");
  assert.equal(shoot("enchanted_diamond_arrow").took, Math.floor(plainOf("diamond") * 1.15), "diamond: through any defence, and 15% harder");
  const grip = shoot("enchanted_jade_arrow");
  assert.ok(grip.n.heldUntil > grip.world.tick, "jade: the creature is gripped where it stands");
  assert.equal(shoot("enchanted_topaz_arrow").n.drain.strength, 3, "topaz: its Strength lowered 5%");
  assert.equal(shoot("enchanted_sapphire_arrow").p.prayer, 11, "sapphire: a prayer point for the archer");
  assert.deepEqual(Object.keys(ARROW_PROCS).length, 9);
});
