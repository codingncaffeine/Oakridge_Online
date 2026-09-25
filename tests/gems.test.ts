// Gems (the magic plan, stage A5): ten gems cut with a chisel at the reference's Crafting levels and XP; gem
// rocks in Deepdelve's second level that give gems off their table from Mining 40; any ore rock turning up a
// gem once in 256; and putting the gem rocks in moved nothing else in the world.
import assert from "node:assert/strict";
import { test } from "node:test";
import { addItem, countOf } from "../src/server/inventory.ts";
import { World } from "../src/server/world.ts";
import { COLDIRON_PLANE, COLDIRON_STAIR } from "../src/shared/deepdelve.ts";
import { GEM_ROCK_PLANE, GEM_ROCK_TABLE, GEM_ROCKS, GEMS, MINING_GEMS } from "../src/shared/gems.ts";
import { item } from "../src/shared/items.ts";
import { blankMap, FIXED_IDS, fixedId } from "../src/shared/map.ts";
import { foundGem, needLevel } from "../src/shared/messages.ts";
import { buildOakridge, OAKRIDGE_SEED } from "../src/shared/oakridge.ts";
import { RECIPES } from "../src/shared/recipes.ts";
import { noXp, xpForLevel } from "../src/shared/skills.ts";

const stack = buildOakridge(OAKRIDGE_SEED);

test("ten gems, each cut from its uncut stone with a chisel at the reference's Crafting level and XP, and worth more cut", () => {
  const LADDER = [[1, 150], [13, 200], [16, 250], [20, 500], [27, 675], [34, 850], [43, 1075], [55, 1375], [67, 1675], [89, 2000]];
  assert.deepEqual(GEMS.map((g) => [g.level, g.xp]), LADDER, "the reference's levels and XP, Sunstone's raised to 200 (gems.ts says why)");
  for (const g of GEMS) {
    const r = RECIPES.find((x) => x.item === g.key);
    assert.ok(r && r.skill === "crafting" && r.tool === "chisel" && r.level === g.level && r.xp === g.xp, `${g.key} is cut with a chisel at Crafting ${g.level}`);
    assert.deepEqual(r!.needs, [{ item: `uncut_${g.key}`, count: 1 }], "from its uncut stone");
    assert.ok(item(`uncut_${g.key}`).value < item(g.key).value, `${g.key} is worth more cut`);
  }
  for (const e of [...MINING_GEMS, ...GEM_ROCK_TABLE]) assert.ok(item(e.item), `${e.item} exists`);
});

/** A miner standing beside a rock of the kind asked on a blank field, the world's rolls handed out in the order given, then `rest`. */
function beside(kind: "copper_rock" | "gem_rock", mining: number, rolls: number[], rest = 0) {
  const map = blankMap(32, 32);
  map.objects.push({ id: 1, kind, x: 16, y: 18, plane: 0, side: 0, variant: 0.5 });
  map.collision.block(16, 18);
  const world = new World(map, () => rolls.shift() ?? rest);
  const p = world.add("Miner", undefined, { at: { x: 16, y: 17 }, xp: { ...noXp(), mining: xpForLevel(mining) } });
  addItem(p.inventory, item("bronze_pickaxe").id, 1);
  const mine = () => {
    world.interact(p, 1);
    for (let i = 0; i < 40 && p.inventory.filter(Boolean).length === 1 && !p.messages.some((m) => m.startsWith("You need")); i++) world.step();
  };
  return { world, p, mine };
}

test("a gem rock gives a gem off its table in place of ore, from Mining 40", () => {
  const low = beside("gem_rock", 39, []);
  low.mine();
  assert.ok(low.p.messages.includes(needLevel("Mining", 40, "gem rock")), "below 40 it says so");
  const ok = beside("gem_rock", 40, []);
  ok.mine();
  assert.equal(countOf(ok.p.inventory, item("uncut_opal").id), 1, "a roll of nought is the table's first gem, an uncut opal");
  const lucky = beside("gem_rock", 40, [0, 0.99]);
  lucky.mine();
  assert.equal(countOf(lucky.p.inventory, item("uncut_diamond").id), 1, "and the top of the table is a diamond");
});

test("one in 256 of the ore mined turns up a gem as well, off the top of the roll; a roll short of that finds none", () => {
  // The ore's own roll first (nought lands it), then the find (the top 1 in 256), then which gem (nought is a sapphire).
  const found = beside("copper_rock", 1, [0, 0.9962, 0]);
  found.mine();
  assert.equal(countOf(found.p.inventory, item("copper_ore").id), 1, "the ore");
  assert.equal(countOf(found.p.inventory, item("uncut_sapphire").id), 1, "and a sapphire with it");
  assert.ok(found.p.messages.includes(foundGem("Uncut sapphire")));
  const none = beside("copper_rock", 1, [0, 0.9955, 0]);
  none.mine();
  assert.deepEqual([countOf(none.p.inventory, item("copper_ore").id), countOf(none.p.inventory, item("uncut_sapphire").id)], [1, 0], "a roll a hair under the top 1 in 256 finds nothing");
  // Ore rocks only: a gem rock (its own roll, then its table, then a top roll that would be a find) gives its one gem.
  const gemRock = beside("gem_rock", 40, [0, 0, 0.9962, 0]);
  gemRock.mine();
  assert.deepEqual([countOf(gemRock.p.inventory, item("uncut_opal").id), countOf(gemRock.p.inventory, item("uncut_sapphire").id)], [1, 0], "a gem rock turns up no second gem");
});

test("the gem rocks stand in Deepdelve's second level under their places' ids, reached on foot from its stair", () => {
  assert.equal(GEM_ROCK_PLANE, COLDIRON_PLANE, "gems.ts's plane is Deepdelve's second level");
  const map = stack.planes.get(COLDIRON_PLANE)!;
  const seen = new Set([COLDIRON_STAIR.y * 8192 + COLDIRON_STAIR.x]), queue = [[COLDIRON_STAIR.x, COLDIRON_STAIR.y]];
  while (queue.length) {
    const [x, y] = queue.pop()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const k = (y! + dy) * 8192 + x! + dx;
      if (!seen.has(k) && map.collision.canStep(x!, y!, dx, dy)) { seen.add(k); queue.push([x! + dx, y! + dy]); }
    }
  }
  for (const [x, y] of GEM_ROCKS) {
    const rock = map.objects.find((o) => o.x === x && o.y === y && o.kind === "gem_rock");
    assert.ok(rock && rock.id === fixedId(x, y, COLDIRON_PLANE), `a gem rock at ${x},${y} under its place's id`);
    assert.ok([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => seen.has((y + dy!) * 8192 + x + dx!)), `and it can be walked up to`);
  }
  const without = buildOakridge(OAKRIDGE_SEED, { gems: false });
  const key = (o: { id: number; kind: string; x: number; y: number; side: number; tag?: string }) => `${o.id}:${o.kind}:${o.x},${o.y}:${o.side}:${o.tag ?? ""}`;
  for (const [plane, before] of without.planes) {
    const after = stack.planes.get(plane)!.objects.filter((o) => o.kind !== "gem_rock");
    assert.equal(after.map(key).join("|"), before.objects.map(key).join("|"), `plane ${plane}: nothing else moved`);
  }
  assert.ok(FIXED_IDS > 0);
});

test("gem jewellery at the reference's levels and XP: a bar and a cut gem at a furnace, the soft gems in silver and the rest in gold, plain gold below them all", () => {
  const TABLE: Array<[string, string, string, Array<[number, number]>]> = [
    ["opal", "opal", "silver", [[1, 100], [16, 350], [22, 450], [27, 550]]], ["jade", "jade", "silver", [[13, 320], [25, 540], [29, 600], [34, 700]]],
    ["red_topaz", "topaz", "silver", [[16, 350], [32, 700], [38, 750], [45, 800]]], ["sapphire", "sapphire", "gold", [[20, 400], [22, 550], [23, 600], [24, 650]]],
    ["emerald", "emerald", "gold", [[27, 550], [29, 600], [30, 650], [31, 700]]], ["ruby", "ruby", "gold", [[34, 700], [40, 750], [42, 800], [50, 850]]],
    ["diamond", "diamond", "gold", [[43, 850], [56, 900], [58, 950], [70, 1000]]], ["wyrmstone", "wyrmstone", "gold", [[55, 1000], [72, 1050], [74, 1100], [80, 1500]]],
    ["onyx", "onyx", "gold", [[67, 1150], [82, 1200], [84, 1250], [90, 1650]]], ["sunstone", "sunstone", "gold", [[89, 1500], [92, 1650], [95, 1800], [98, 2000]]],
  ];
  const SLOT = { ring: "ring", necklace: "neck", bracelet: "hands", amulet: "neck" } as const;
  for (const [gem, stem, metal, levels] of TABLE) {
    (["ring", "necklace", "bracelet", "amulet"] as const).forEach((kind, i) => {
      const r = RECIPES.find((x) => x.item === `${stem}_${kind}`);
      assert.ok(r && r.at.includes("furnace") && r.skill === "crafting", `${stem}_${kind} is made at a furnace`);
      assert.deepEqual([r!.level, r!.xp], levels[i], `${stem}_${kind} at Crafting ${levels[i]![0]}`);
      assert.deepEqual(r!.needs.map((n) => n.item).sort(), [`${metal}_bar`, gem].sort(), `from a ${metal} bar and a ${gem}`);
      assert.equal(item(`${stem}_${kind}`).equip?.slot, SLOT[kind], `worn in the ${SLOT[kind]} slot`);
    });
  }
  const plain = ["gold_ring", "gold_necklace", "gold_bracelet", "gold_amulet"].map((k) => { const r = RECIPES.find((x) => x.item === k)!; return [r.level, r.xp]; });
  assert.deepEqual(plain, [[5, 150], [6, 200], [7, 250], [8, 300]], "plain gold at 5 to 8, below the first gem piece at 20");
  // One made through the world: a sapphire ring at a furnace.
  const map = blankMap(32, 32);
  map.objects.push({ id: 1, kind: "furnace", x: 16, y: 18, plane: 0, side: 0, variant: 0.5 });
  map.collision.block(16, 18);
  const world = new World(map, () => 0.99);
  const p = world.add("Jeweller", undefined, { at: { x: 16, y: 17 }, xp: { ...noXp(), crafting: xpForLevel(20) } });
  for (const key of ["gold_bar", "sapphire"]) addItem(p.inventory, item(key).id, 1);
  world.interact(p, 1);
  for (let i = 0; i < 20 && p.screen?.kind !== "make"; i++) world.step();
  const screen = p.screen as { kind: "make"; recipes: number[] } | null;
  const ring = screen?.recipes.findIndex((i) => RECIPES[i]!.item === "sapphire_ring") ?? -1;
  assert.ok(ring >= 0, "the furnace offers the sapphire ring");
  world.make(p, ring, 1);
  for (let i = 0; i < 20 && countOf(p.inventory, item("sapphire_ring").id) === 0; i++) world.step();
  assert.deepEqual([countOf(p.inventory, item("sapphire_ring").id), countOf(p.inventory, item("gold_bar").id), countOf(p.inventory, item("sapphire").id)], [1, 0, 0], "and makes it from the bar and the gem");
});
