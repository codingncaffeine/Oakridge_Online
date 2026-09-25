// Deepdelve and Hollow Pass (PLAN §7.6, Wave 3's first site): that it stands where the plan puts it,
// that building it changes nothing in the district or any site before it, that the ground meets
// Thornbury's column and the foothills' row without a step, that the Kingsway runs in from Thornbury's
// gate through the pass to its barred gate and the Delve Road up to the town, every door and the mine's
// mouth, that the pass is the one way through the range, that the town has everything its card promises,
// that the mine goes down three levels with the ore of each and worse company the deeper it goes, and
// that its people talk.
import assert from "node:assert/strict";
import { test } from "node:test";
import { HARROW } from "../src/shared/harrow.ts";
import { SANDREACH_SITE } from "../src/shared/sandreach.ts";
import { inFenSites } from "../src/shared/sallowfen.ts";
import { DEEP_REGION } from "../src/shared/ashbarrow.ts";
import { World } from "../src/server/world.ts";
import { ADIT_REGION } from "../src/shared/adit.ts";
import { CHESTS } from "../src/shared/chests.ts";
import { BLOCKED } from "../src/shared/collision.ts";
import {
  BANK, BELOW, CALDMOOR_EXIT, COAL_PLANE, COAL_ROOMS, COAL_STAIR, COLDIRON_PLANE, COLDIRON_ROOMS, COLDIRON_STAIR, DEEPDELVE_LABELS, DEEPDELVE_SITE,
  FURNACES, GOLD_CHEST, GOLD_PLANE, GOLD_ROOMS, HOUSES, INN, isRock, MINE_BOX, MINE_MOUTH, ORE, PASS, PASS_GATE, ROAD_IN, ROWANS, SMITHY, SQUARE, TOLL_HOUSE,
  TOOLS, TOWN, WELL,
} from "../src/shared/deepdelve.ts";
import { DIALOGUE } from "../src/shared/dialogue.ts";
import { item } from "../src/shared/items.ts";
import {
  builtRegions, cornerHeight, OVERLAY_PATH, overlayAt, regionId, ROOF_SLATE, roofAt, UNDERLAY_STONE, underlayAt, type WorldMap,
} from "../src/shared/map.ts";
import { PASS_SHUT } from "../src/shared/messages.ts";
import { levelOf, MONSTER_BY_KEY } from "../src/shared/monsters.ts";
import { areaAt, buildOakridge, MAP_EXITS, MAP_MARKS, OAKRIDGE_SEED } from "../src/shared/oakridge.ts";
import { besides, findPath } from "../src/shared/pathfind.ts";
import { furnaceHeat, RECIPES } from "../src/shared/recipes.ts";
import { SHOPS } from "../src/shared/shops.ts";
import { inBox } from "../src/shared/worldgen.ts";

const stack = buildOakridge(OAKRIDGE_SEED);
const ground = stack.planes.get(0)!;
const onSite = ground.objects.filter((o) => inBox(DEEPDELVE_SITE, o.x, o.y));
const open = (map: WorldMap, x: number, y: number) => (map.collision.get(x, y) & BLOCKED) === 0;
const key = (x: number, y: number) => y * 8192 + x;
/**
 * Whether someone on `from` can walk to a tile beside `to`, in as many clicks as it takes: a flood by the
 * collision's own step rule. One walk proves less — the pathfinder searches only a window round the walker,
 * and stops as near as it can to what it cannot reach, so a walk that merely exists says nothing.
 */
const walksBeside = (map: WorldMap, from: { x: number; y: number }, to: { x: number; y: number }) => {
  const seen = new Set<number>([key(from.x, from.y)]);
  const queue = [from];
  for (let i = 0; i < queue.length; i++) {
    const t = queue[i]!;
    if (besides(map.collision, t.x, t.y, to.x, to.y)) return true;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      if (seen.has(key(t.x + dx, t.y + dy)) || !map.collision.canStep(t.x, t.y, dx, dy)) continue;
      seen.add(key(t.x + dx, t.y + dy));
      queue.push({ x: t.x + dx, y: t.y + dy });
    }
  }
  return false;
};

test("the site is regions 44–47 × 53–55, west of Thornbury and north of the foothills, and nothing beyond", () => {
  const ids = new Set(builtRegions(ground).map((r) => regionId(r.rx, r.ry)));
  for (let rx = 44; rx <= 47; rx++) for (let ry = 53; ry <= 55; ry++) assert.ok(ids.has(regionId(rx, ry)), `region ${rx},${ry} is built`);
  for (const [rx, ry] of [[43, 53], [43, 55], [44, 56], [44, 57], [44, 52], [47, 52]]) assert.ok(!ids.has(regionId(rx!, ry!)), `region ${rx},${ry} is not`);
  assert.equal(builtRegions(ground).length, 211, "the district's nine, Wave 1's thirty-five, Wave 2's thirty-two, Deepdelve's twelve, the Harrow's forty-five, Sandreach's thirty, and the Fen Road's twelve and the Sallowfen's thirty-six");
  assert.ok(onSite.length > 300, `the site has things standing on it (${onSite.length})`);
  // The range is the site's west third: grey stone, blocked, but for the pass.
  let stone = 0;
  for (let y = DEEPDELVE_SITE.y0; y <= DEEPDELVE_SITE.y1; y++) {
    for (let x = DEEPDELVE_SITE.x0; x < 2860; x++) {
      if (!isRock(x, y)) continue;
      stone++;
      assert.equal(underlayAt(ground, x, y), UNDERLAY_STONE, `${x},${y} of the range is stone`);
      assert.ok(!open(ground, x, y), "and nobody walks on it");
    }
  }
  assert.ok(stone > 6000, `the range stands along the west (${stone} tiles of stone)`);
  // Rowan on the Greycaps' foot (PLAN §8.2, WC 37), on the high ground below the stone.
  const rowans = onSite.filter((o) => o.kind === "rowan");
  assert.ok(rowans.length >= 5, `rowan on the range's foot (${rowans.length})`);
  for (const t of rowans) assert.ok(Math.hypot(t.x - ROWANS.x, t.y - ROWANS.y) <= ROWANS.r + 1 && !isRock(t.x, t.y), `the rowan at ${t.x},${t.y} stands on the slope, not the stone`);
});

/**
 * ⛔ The seams. Deepdelve is built after every site before it on the same builder, against Thornbury's
 * west column of corners and the foothills' north row. Everything else — every region on every plane,
 * every object with its id, every creature, water and item — must be exactly what it is when the world
 * is built without it. The Adit is built after it and takes new ids for its things, so the Adit's own
 * test holds those. The controls: the regions and the corners a tile inside the seams exist only with it.
 */
test("building Deepdelve changes nothing anywhere else, on any plane, and leaves both seams' corners alone", () => {
  const without = buildOakridge(OAKRIDGE_SEED, { deepdelve: false });
  const alone = without.planes.get(0)!;
  assert.equal(builtRegions(alone).length, 106, "the control build is everything but Deepdelve, and the Harrow built against it");
  const theirs = (o: { x: number; y: number; plane: number }) => !inBox(DEEPDELVE_SITE, o.x, o.y) && !inBox(HARROW, o.x, o.y) && !inBox(SANDREACH_SITE, o.x, o.y) && !inFenSites(o.x, o.y) && !(o.plane < 0 && (inBox(ADIT_REGION, o.x, o.y) || inBox(DEEP_REGION, o.x, o.y)));
  for (const [plane, before] of without.planes) {
    const after = stack.planes.get(plane)!;
    for (const r of builtRegions(before).filter((r) => !inBox(SANDREACH_SITE, r.x0, r.y0) && !inFenSites(r.x0, r.y0))) {
      const both = after.regions.get(regionId(r.rx, r.ry))!;
      for (const field of ["heights", "underlay", "overlay", "indoors", "roofs"] as const) assert.deepEqual([...both[field]], [...r[field]], `plane ${plane}, region ${r.rx},${r.ry}: ${field} unchanged`);
    }
    const objects = (m: WorldMap) => m.objects.filter(theirs).map((o) => `${o.id}:${o.kind}:${o.x},${o.y}:${o.side}:${o.tag ?? ""}`).join("|");
    assert.equal(objects(after), objects(before), `plane ${plane}: their objects, with the same ids`);
    assert.deepEqual(after.monsters.filter((s) => !inBox(DEEPDELVE_SITE, s.x, s.y) && !inBox(HARROW, s.x, s.y) && !inBox(SANDREACH_SITE, s.x, s.y) && !inFenSites(s.x, s.y)), before.monsters.filter((s) => !inBox(DEEPDELVE_SITE, s.x, s.y) && !inBox(HARROW, s.x, s.y) && !inBox(SANDREACH_SITE, s.x, s.y) && !inFenSites(s.x, s.y)), `plane ${plane}: and their creatures`);
    assert.deepEqual(after.spawns.filter((s) => !inBox(DEEPDELVE_SITE, s.x, s.y) && !inBox(HARROW, s.x, s.y) && !inBox(SANDREACH_SITE, s.x, s.y) && !inFenSites(s.x, s.y)), before.spawns.filter((s) => !inBox(DEEPDELVE_SITE, s.x, s.y) && !inBox(HARROW, s.x, s.y) && !inBox(SANDREACH_SITE, s.x, s.y) && !inFenSites(s.x, s.y)), `plane ${plane}: and what lies about`);
  }
  for (let cy = DEEPDELVE_SITE.y0; cy <= DEEPDELVE_SITE.y1 + 1; cy++) assert.equal(cornerHeight(ground, 3072, cy), cornerHeight(alone, 3072, cy), `corner 3072,${cy} is Thornbury's`);
  for (let cx = 2880; cx <= 3008; cx++) assert.equal(cornerHeight(ground, cx, 3392), cornerHeight(alone, cx, 3392), `corner ${cx},3392 is the foothills'`);
  assert.ok(ground.regions.get(regionId(45, 54))?.built === true && !alone.regions.has(regionId(45, 54)), "the control: the town's region exists only with Deepdelve");
  let differs = 0;
  for (let cy = DEEPDELVE_SITE.y0; cy <= DEEPDELVE_SITE.y1; cy++) if (cornerHeight(ground, 3071, cy) !== cornerHeight(alone, 3071, cy)) differs++;
  assert.ok(differs > 60, `and the column a tile inside Thornbury's seam is written by Deepdelve alone (${differs} corners differ)`);
  assert.ok(ground.objects.length > alone.objects.length + 300, "and the plane gained the site");
});

test("the ground meets Thornbury's column and the foothills' row without a step, and nowhere along the seam row is a cliff", () => {
  for (let cy = DEEPDELVE_SITE.y0; cy <= DEEPDELVE_SITE.y1 + 1; cy++) {
    const step = Math.abs(cornerHeight(ground, 3071, cy) - cornerHeight(ground, 3072, cy));
    assert.ok(step < 1e-6, `corner 3071,${cy} steps ${step.toFixed(3)} from Thornbury's`);
  }
  for (let cx = 2880; cx <= 3008; cx++) {
    const step = Math.abs(cornerHeight(ground, cx, 3393) - cornerHeight(ground, cx, 3392));
    assert.ok(step < 1e-6, `corner ${cx},3393 steps ${step.toFixed(3)} from the foothills'`);
  }
  // Where the foothills' row ends, the row goes on at the same height: no cliff on the tile past its end.
  const east = Math.abs(cornerHeight(ground, 3009, 3392) - cornerHeight(ground, 3008, 3392));
  assert.ok(east < 0.5, `the seam row runs on past the foothills' east end (${east.toFixed(3)})`);
  // The ground where the range meets the Sound's end is stone nobody stands on.
  for (let x = 2860; x <= 2886; x++) for (let y = 3392; y <= 3403; y++) assert.ok(!open(ground, x, y), `${x},${y}, the rock face over the Sound's end, is not walked`);
  // The controls: twelve tiles in, the ground has gone its own way.
  let moves = 0;
  for (let cy = DEEPDELVE_SITE.y0; cy <= DEEPDELVE_SITE.y1; cy++) if (Math.abs(cornerHeight(ground, 3060, cy) - cornerHeight(ground, 3072, cy)) > 0.05) moves++;
  assert.ok(moves > 10, `the control: twelve columns in, the ground moves on ${moves} rows`);
});

test("the Kingsway runs from Thornbury's gate to the pass and its gate, and the Delve Road up to the square, every door and the mine's mouth", () => {
  assert.equal(overlayAt(ground, 3072, ROAD_IN.y), OVERLAY_PATH, "Thornbury's Kingsway reaches its west edge");
  assert.equal(overlayAt(ground, ROAD_IN.x, ROAD_IN.y), OVERLAY_PATH, "and carries on over the seam");
  const seen = new Set<number>();
  const queue: Array<[number, number]> = [[ROAD_IN.x, ROAD_IN.y]];
  seen.add(key(ROAD_IN.x, ROAD_IN.y));
  while (queue.length > 0) {
    const [x, y] = queue.shift()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx, ny = y + dy;
      if (seen.has(key(nx, ny)) || !inBox(DEEPDELVE_SITE, nx, ny) || overlayAt(ground, nx, ny) !== OVERLAY_PATH) continue;
      seen.add(key(nx, ny));
      queue.push([nx, ny]);
    }
  }
  assert.ok(seen.has(key(PASS_GATE.x + 1, PASS.y)), "the Kingsway reaches the pass's gate");
  assert.ok(seen.has(key(CALDMOOR_EXIT.x, CALDMOOR_EXIT.y)), "and the road runs on past it to the site's edge");
  assert.ok(seen.has(key(TOLL_HOUSE.x0 + 3, TOLL_HOUSE.y0 - 1)), "the toll house's door");
  assert.ok(seen.has(key(SQUARE.x, SQUARE.y)), "the Delve Road reaches the square");
  assert.ok(seen.has(key(BANK.x0 + 5, BANK.y0 - 1)), "and the bank's door");
  assert.ok(seen.has(key(SMITHY.x0 + 5, SMITHY.y0 - 1)), "and the smithy's");
  assert.ok(seen.has(key(TOOLS.x0 + 4, TOOLS.y1 + 1)), "and Delve Tools'");
  assert.ok(seen.has(key(INN.x0 + 6, INN.y1 + 1)), "and the Pick and Lantern's");
  for (const [box] of HOUSES) assert.ok(seen.has(key(box.x0 - 1, box.y0 + 2)), `and the house at ${box.x0},${box.y0}`);
  assert.ok(seen.has(key(MINE_MOUTH.x, MINE_MOUTH.y)) && open(ground, MINE_MOUTH.x, MINE_MOUTH.y), "and the tile before the mine's mouth");
});

test("Hollow Pass is the one way through the range, and its gate is barred", () => {
  // The range's stone stands the site's whole height at x 2850, but for the pass's floor.
  for (let y = DEEPDELVE_SITE.y0; y <= DEEPDELVE_SITE.y1; y++) {
    const inPass = Math.abs(y + 0.5 - PASS.y) < 9;
    assert.equal(open(ground, 2850, y), inPass, `2850,${y} is ${inPass ? "the pass's floor" : "the range's stone"}`);
  }
  // Across the pass: the gate's leaves on the road, a tower either side, wall on every other tile of its floor.
  const gates = onSite.filter((o) => o.kind === "gate" && o.tag === "hollowpass");
  assert.equal(gates.length, 2, "two leaves of gate, one on each tile of the road");
  for (const g of gates) assert.ok(g.x === PASS_GATE.x && g.side === 3 && overlayAt(ground, g.x, g.y) === OVERLAY_PATH, `the leaf at ${g.x},${g.y} is on the road`);
  for (let y = PASS.y - 9; y <= PASS.y + 9; y++) {
    if (!open(ground, PASS_GATE.x, y)) continue;
    assert.ok(ground.collision.wallBetween(PASS_GATE.x, y, -1, 0), `the way west on row ${y} is closed at x ${PASS_GATE.x}`);
  }
  // Nobody walks through. A walk toward an unreachable tile goes as near as it can, so the check is that
  // no step of the walk west ever gets past the gate; the control is a walk along the floor that arrives.
  const west = findPath(ground.collision, PASS_GATE.x + 4, PASS.y, PASS_GATE.x - 6, PASS.y);
  assert.ok(west.every((t) => t.x >= PASS_GATE.x), `no walk goes through the barred gate (the walk west stops at ${west.at(-1)?.x},${west.at(-1)?.y})`);
  const east = findPath(ground.collision, PASS_GATE.x + 4, PASS.y, PASS_GATE.x + 20, PASS.y);
  assert.deepEqual(east.at(-1), { x: PASS_GATE.x + 20, y: PASS.y }, "the control: a walk along the pass's floor arrives");
  // A click on it: the player walks up and is told, and it stays shut.
  const world = new World(stack, () => 0.5);
  const leaf = gates[0]!;
  const p = world.add("Traveller", undefined, { at: { x: leaf.x + 2, y: leaf.y, plane: 0 } });
  world.interact(p, leaf.id);
  for (let i = 0; i < 20 && !p.messages.includes(PASS_SHUT); i++) world.step();
  assert.ok(p.messages.includes(PASS_SHUT), "a click on the gate says it is barred");
  assert.ok(world.map.collision.wallBetween(leaf.x, leaf.y, -1, 0), "and it stays shut");
});

test("the town: the fifth bank, the white smithy, Delve Tools, the Pick and Lantern, five houses, the well, and nothing dangerous in it", () => {
  const kinds = (box: { x0: number; y0: number; x1: number; y1: number }, kind: string) => onSite.filter((o) => inBox(box, o.x, o.y) && o.kind === kind);
  assert.ok(kinds(BANK, "bank_booth").length >= 6, "the bank has its booths");
  assert.equal(ground.monsters.filter((s) => s.monster === "banker" && inBox(BANK, s.x, s.y)).length, 2, "and two bankers");
  const furnaces = kinds(SMITHY, "furnace");
  assert.equal(furnaces.length, FURNACES.length, "two furnaces in the smithy");
  for (const f of furnaces) assert.equal(f.tag, "white", `the furnace at ${f.x},${f.y} runs white`);
  const starfall = RECIPES.find((r) => r.item === "starfall_bar")!;
  assert.ok((starfall.heat ?? 1) <= furnaceHeat("white"), "hot enough for starfall, which smelts here and nowhere else (PLAN §8.3)");
  assert.ok((starfall.heat ?? 1) > furnaceHeat("hot"), "the control: Kilnhold's are not");
  assert.equal(kinds(SMITHY, "anvil").length, 2, "and two anvils");
  assert.ok(ground.monsters.some((s) => s.monster === "smith_deepdelve" && inBox(SMITHY, s.x, s.y)), "the smith is in it");
  const counters = kinds(TOOLS, "counter");
  assert.ok(counters.length >= 5 && counters.every((c) => c.tag === "deepdelve_tools"), "Delve Tools has its counters");
  const shop = SHOPS["deepdelve_tools"]!;
  assert.ok(shop.stock.some((l) => l.id === item("steel_pickaxe").id && l.count > 0), "and sells picks");
  assert.ok(shop.stock.some((l) => l.id === item("coldiron_ore").id && l.count === 0), "and buys the mine's ore");
  assert.equal(kinds(INN, "range").length, 1, "the Pick and Lantern has its range");
  assert.ok(stack.planes.get(1)!.objects.some((o) => inBox(INN, o.x, o.y)), "and an upstairs");
  assert.ok(onSite.some((o) => o.kind === "well" && o.x === WELL.x && o.y === WELL.y), "the well is by the square");
  for (const [box] of HOUSES) assert.equal(roofAt(ground, box.x0 + 2, box.y0 + 2), ROOF_SLATE, `the house at ${box.x0},${box.y0} is slated`);
  for (const s of ground.monsters.filter((s) => inBox(TOWN, s.x, s.y))) {
    const def = MONSTER_BY_KEY.get(s.monster)!;
    assert.ok(def.person || levelOf(def) <= 3, `${s.monster} at ${s.x},${s.y} does not belong in the town`);
  }
  assert.equal(areaAt(SQUARE.x, SQUARE.y).key, "deepdelve", "the town has its tune");
  assert.equal(areaAt(2860, PASS.y).key, "hollowpass", "and the pass its own");
});

test("Deepdelve Mine: three levels down from the mouth in the cliff and back up, the ore of each, and worse company the deeper it goes", () => {
  const mouth = ground.objects.find((o) => o.kind === "adit" && o.x === MINE_MOUTH.x && o.y === MINE_MOUTH.y);
  assert.ok(mouth && mouth.to === COAL_PLANE && mouth.side === 3, "the mouth leads down");
  assert.ok(isRock(MINE_MOUTH.x - 1, MINE_MOUTH.y) && !open(ground, MINE_MOUTH.x - 1, MINE_MOUTH.y), "and it is cut into the cliff: stone behind it");
  const coal = stack.planes.get(COAL_PLANE)!, coldiron = stack.planes.get(COLDIRON_PLANE)!, gold = stack.planes.get(GOLD_PLANE)!;
  const stair = (map: WorldMap, x: number, y: number, to: number) => map.objects.find((o) => o.kind === "stairs" && o.x === x && o.y === y && o.to === to);
  assert.ok(stair(coal, MINE_MOUTH.x, MINE_MOUTH.y, 0), "the first level's stair back up, under the mouth");
  assert.ok(stair(coal, COAL_STAIR.x, COAL_STAIR.y, COLDIRON_PLANE) && stair(coldiron, COAL_STAIR.x, COAL_STAIR.y, COAL_PLANE), "the first and second meet on one tile");
  assert.ok(stair(coldiron, COLDIRON_STAIR.x, COLDIRON_STAIR.y, GOLD_PLANE) && stair(gold, COLDIRON_STAIR.x, COLDIRON_STAIR.y, COLDIRON_PLANE), "and the second and third");
  for (const [map, rooms, from, to] of [
    [coal, COAL_ROOMS, { x: MINE_MOUTH.x - 1, y: MINE_MOUTH.y }, COAL_STAIR],
    [coldiron, COLDIRON_ROOMS, { x: COAL_STAIR.x + 1, y: COAL_STAIR.y }, COLDIRON_STAIR],
    [gold, GOLD_ROOMS, { x: COLDIRON_STAIR.x + 1, y: COLDIRON_STAIR.y }, GOLD_CHEST],
  ] as const) {
    for (let y = MINE_BOX.y0; y <= MINE_BOX.y1; y++) {
      for (let x = MINE_BOX.x0; x <= MINE_BOX.x1; x++) {
        if (!rooms.some((r) => inBox(r, x, y))) assert.ok(!open(map, x, y), `${x},${y} on plane ${map.plane} outside the rooms is rock`);
      }
    }
    assert.ok(open(map, from.x, from.y), `somewhere to stand at ${from.x},${from.y} on plane ${map.plane}`);
    assert.ok(walksBeside(map, from, to), `the way on from ${from.x},${from.y} to ${to.x},${to.y} can be walked`);
  }
  // The ore of each level (PLAN §8.3), every rock on a room's floor where it was written.
  const count = (map: WorldMap, kind: string) => map.objects.filter((o) => o.kind === kind && inBox(MINE_BOX, o.x, o.y)).length;
  assert.equal(count(coal, "coal_rock"), 5, "coal on the first level");
  assert.equal(count(coal, "silver_rock"), 4, "and silver");
  assert.equal(count(coldiron, "coldiron_rock"), 5, "coldiron on the second");
  assert.equal(count(gold, "gold_rock"), 4, "gold on the third");
  assert.equal(ORE.length, 18);
  const chest = gold.objects.find((o) => o.kind === "chest" && inBox(MINE_BOX, o.x, o.y));
  assert.ok(chest && chest.tag === "deepdelve" && chest.x === GOLD_CHEST.x && chest.y === GOLD_CHEST.y, "the chest at the vault's far end");
  assert.equal(CHESTS["deepdelve"]!.loot.reduce((n, d) => n + d.weight, 0), 128, "whose table never comes up empty");
  // Who lives down there: every creature on a room's floor and on no object; the worst on each level worse than the one above; the haunt keeps the gold.
  const worst = new Map<number, number>();
  for (const [monster, plane, x, y] of BELOW) {
    const map = stack.planes.get(plane)!, rooms = plane === COAL_PLANE ? COAL_ROOMS : plane === COLDIRON_PLANE ? COLDIRON_ROOMS : GOLD_ROOMS;
    assert.ok(rooms.some((r) => inBox(r, x, y)) && open(map, x, y), `${monster} at ${x},${y} on plane ${plane} stands on open floor`);
    assert.ok(map.monsters.some((s) => s.monster === monster && s.x === x && s.y === y), `and is spawned there`);
    const level = levelOf(MONSTER_BY_KEY.get(monster)!);
    assert.ok(level <= 60, `${monster} is level ${level}, inside the mine's band (PLAN §8.5: 30–60)`);
    worst.set(plane, Math.max(worst.get(plane) ?? 0, level));
  }
  assert.ok(worst.get(COAL_PLANE)! < worst.get(COLDIRON_PLANE)! && worst.get(COLDIRON_PLANE)! < worst.get(GOLD_PLANE)!, `worse company the deeper it goes (${[...worst.values()].join(" < ")})`);
  assert.ok(worst.get(GOLD_PLANE)! >= 45, "and the vault's keeper at the band's top");
  assert.ok(gold.monsters.some((s) => s.monster === "delve_haunt"), "the haunt keeps the gold");
  assert.equal(areaAt(2900, 3548, COAL_PLANE).key, "deepdelvemine", "below the town is the mine");
});

test("the people of Deepdelve talk, the shop's keeper offers the trade, and the map knows the town, the pass and the road out", () => {
  const people = new Set(ground.monsters.filter((s) => inBox(DEEPDELVE_SITE, s.x, s.y)).map((s) => s.monster).filter((k) => MONSTER_BY_KEY.get(k)!.person));
  assert.ok(people.size >= 8, `${people.size} kinds of people`);
  for (const k of people) {
    const def = MONSTER_BY_KEY.get(k)!;
    assert.ok(def.talk && DIALOGUE[def.talk], `${k} has something to say`);
    if (def.shop) assert.ok(DIALOGUE[def.talk!]!["start"]!.options!.some((o) => o.act === "shop"), `${k} offers the trade`);
  }
  assert.ok(DEEPDELVE_LABELS.some((l) => l.name === "Deepdelve" && inBox(TOWN, l.x, l.y)), "the map names the town");
  assert.ok(MAP_MARKS.some((m) => m.icon === "mine" && m.x === MINE_MOUTH.x && m.y === MINE_MOUTH.y), "and marks the mine");
  assert.ok(MAP_MARKS.some((m) => m.icon === "gate" && m.x === PASS_GATE.x), "and the pass's gate");
  assert.ok(MAP_EXITS.some((e) => e.name.includes("Caldmoor") && e.x === CALDMOOR_EXIT.x && e.y === CALDMOOR_EXIT.y && e.side === "w"), "the Caldmoor Road leaves west through the pass");
  assert.ok(!MAP_EXITS.some((e) => e.name.includes("Kingsway")), "and the Kingsway is no longer an exit: it runs on");
});
