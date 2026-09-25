// The enchanting spells (the magic plan, stage A5c): each works its own gems' jewellery and nothing else; every
// plain piece has an enchanted self, the gold amulets with the reference's stat amulets' numbers; the Ring of
// Thorns returns part of each blow and crumbles, the Rekindling necklace heals once and the Lifeward ring takes its
// wearer home once, each when a blow leaves them low; and a rubbed piece asks where, goes there, and rests.
import assert from "node:assert/strict";
import { test } from "node:test";
import { addItem, countOf } from "../src/server/inventory.ts";
import { World, type Player } from "../src/server/world.ts";
import { ENCHANTED, RUB_WAIT_MS, SPECIAL, THORNS_CHARGE } from "../src/shared/enchant.ts";
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
