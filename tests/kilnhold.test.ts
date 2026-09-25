// Kilnhold (PLAN §7.6, Wave 2's first site): that it stands where the plan puts it, that building it
// changes nothing in the district or the four sites of Wave 1, that the Emberway runs in over the
// district's edge through the toll gate's road to the square and out the east gate as the Sand Road,
// that the bay along the south is water at the sea's level, that everything its card promises stands in
// the hold and the waste, that the furnaces run hot, that its people talk, and that the gate is a toll.
import assert from "node:assert/strict";
import { test } from "node:test";
import { HARROW } from "../src/shared/harrow.ts";
import { SANDREACH_SITE } from "../src/shared/sandreach.ts";
import { inFenSites } from "../src/shared/sallowfen.ts";
import { DEEP_REGION } from "../src/shared/ashbarrow.ts";
import { DEEPDELVE_SITE } from "../src/shared/deepdelve.ts";
import { ADIT_REGION } from "../src/shared/adit.ts";
import { SABLEWOOD } from "../src/shared/tarhollow.ts";
import { BRINEHAVEN } from "../src/shared/brinehaven.ts";
import { BLOCKED } from "../src/shared/collision.ts";
import { DIALOGUE } from "../src/shared/dialogue.ts";
import { SEA_CORNER } from "../src/shared/heartland.ts";
import { item } from "../src/shared/items.ts";
import {
  BANK, BLADES, EMBERWAY, FURNACES, GATE_E, GATE_W, HOLD, INN, isBay, KILNHOLD_LABELS, KILNHOLD_SITE, KILNS, OUTCROP, ROAD_IN, SAND_EXIT,
  SMITHY, SQUARE, WASTE, WAYSTATION, WELL,
} from "../src/shared/kilnhold.ts";
import {
  builtBounds, builtRegions, cornerHeight, indoorsAt, OVERLAY_PATH, OVERLAY_WATER, overlayAt, regionId, ROOF_SLATE, roofAt, UNDERLAY_CINDER,
  UNDERLAY_GRASS, underlayAt, type WorldMap,
} from "../src/shared/map.ts";
import { levelOf, MONSTER_BY_KEY } from "../src/shared/monsters.ts";
import { areaAt, buildOakridge, DISTRICT, MAP_EXITS, MAP_MARKS, OAKRIDGE_SEED } from "../src/shared/oakridge.ts";
import { furnaceHeat } from "../src/shared/recipes.ts";
import { SHOPS } from "../src/shared/shops.ts";
import { STATION_OF } from "../src/shared/stations.ts";
import { THORNBURY } from "../src/shared/thornbury.ts";
import { WICKSTEAD } from "../src/shared/wickstead.ts";
import { inBox } from "../src/shared/worldgen.ts";

const stack = buildOakridge(OAKRIDGE_SEED);
const ground = stack.planes.get(0)!;
const onSite = ground.objects.filter((o) => inBox(KILNHOLD_SITE, o.x, o.y));
const inHold = onSite.filter((o) => inBox(HOLD, o.x, o.y));
const open = (map: WorldMap, x: number, y: number) => (map.collision.get(x, y) & BLOCKED) === 0;
const key = (x: number, y: number) => y * 8192 + x;
const sea = cornerHeight(ground, SEA_CORNER.x, SEA_CORNER.y);
/** The ground the earlier sites own: everything built that is not this site. */
const theirs = (x: number, y: number) => !inBox(KILNHOLD_SITE, x, y) && !inBox(SABLEWOOD, x, y) && !inBox(DEEPDELVE_SITE, x, y) && !inBox(HARROW, x, y) && !inBox(SANDREACH_SITE, x, y) && !inFenSites(x, y);

test("the site is regions 52–57 × 49–50 east of the district, the bay along its south is water, and nothing beyond", () => {
  const ids = new Set(builtRegions(ground).map((r) => regionId(r.rx, r.ry)));
  for (let rx = 52; rx <= 57; rx++) for (let ry = 49; ry <= 50; ry++) assert.ok(ids.has(regionId(rx, ry)), `region ${rx},${ry} is built`);
  for (const [rx, ry] of [[52, 48], [55, 48], [52, 51], [56, 51], [57, 48], [58, 51]]) assert.ok(!ids.has(regionId(rx!, ry!)), `region ${rx},${ry} is not`);
  assert.equal(builtRegions(ground).length, 211, "the district's nine, Wave 1's thirty-five, Wave 2's thirty-two, Deepdelve's twelve, the Harrow's forty-five, Sandreach's thirty, and the Fen Road's twelve and the Sallowfen's thirty-six");
  assert.deepEqual(builtBounds(ground), { x0: SABLEWOOD.x0, y0: SABLEWOOD.y0, x1: SANDREACH_SITE.x1, y1: HARROW.y1 });
  assert.ok(onSite.length > 400, `the site has things standing on it (${onSite.length})`);
  // The bay: water where the district's own shore line puts it, sand along it, nothing standing in it.
  let water = 0, standing = 0;
  for (let y = KILNHOLD_SITE.y0; y <= KILNHOLD_SITE.y1; y++) {
    for (let x = KILNHOLD_SITE.x0; x <= KILNHOLD_SITE.x1; x++) {
      const wet = overlayAt(ground, x, y) === OVERLAY_WATER;
      assert.equal(wet, isBay(x, y), `${x},${y} is water exactly where the shore line says`);
      if (wet) water++;
    }
  }
  assert.ok(water > 4000, `the bay runs the site's length (${water} tiles)`);
  for (const o of onSite) if (isBay(o.x, o.y)) standing++;
  assert.equal(standing, 0, "and nothing stands in it");
  for (let x = KILNHOLD_SITE.x0; x <= KILNHOLD_SITE.x1; x += 7) {
    assert.ok(Math.abs(cornerHeight(ground, x, KILNHOLD_SITE.y0 + 2) - sea) < 1e-6, `the water at ${x} stands at the sea's level`);
  }
});

/**
 * ⛔ The seam. Kilnhold is built last on the same builder as the district and Wave 1, and shares the
 * district's east column of corners. Everything the five of them hold — every corner height, every
 * tile, every object on every plane, every creature, every water and every item lying about — must be
 * exactly what it is when the world is built without the hold, or an approved site changed without
 * anyone building it. The control: the corners a column past the seam, and the regions beyond it,
 * exist only in the build with Kilnhold in it.
 */
test("building Kilnhold changes nothing in the district or the sites of Wave 1, on any plane", () => {
  const without = buildOakridge(OAKRIDGE_SEED, { kilnhold: false });
  const alone = without.planes.get(0)!;
  assert.equal(builtRegions(alone).length, 169, "the control build is everything but the hold, and Sandreach built against it");
  assert.deepEqual([...without.planes.keys()].sort(), [...stack.planes.keys()].sort(), "the same planes");
  for (const [plane, before] of without.planes) {
    const after = stack.planes.get(plane)!;
    for (const r of builtRegions(before).filter((r) => !inBox(SABLEWOOD, r.x0, r.y0) && !inBox(ADIT_REGION, r.x0, r.y0) && !inBox(DEEPDELVE_SITE, r.x0, r.y0) && !inBox(HARROW, r.x0, r.y0) && !inBox(SANDREACH_SITE, r.x0, r.y0) && !inFenSites(r.x0, r.y0))) {
      const both = after.regions.get(regionId(r.rx, r.ry))!;
      for (const field of ["heights", "underlay", "overlay", "indoors", "roofs"] as const) {
        assert.deepEqual([...both[field]], [...r[field]], `plane ${plane}, region ${r.rx},${r.ry}: ${field} unchanged`);
      }
    }
    // (The Adit is built after the hold, so its things take different ids without it: they are compared by the Adit's own test.)
    const objects = (m: WorldMap) => m.objects.filter((o) => theirs(o.x, o.y) && !(o.plane < 0 && (inBox(ADIT_REGION, o.x, o.y) || inBox(DEEP_REGION, o.x, o.y)))).map((o) => `${o.id}:${o.kind}:${o.x},${o.y}:${o.side}:${o.tag ?? ""}`).join("|");
    assert.equal(objects(after), objects(before), `plane ${plane}: their objects, with the same ids`);
    assert.deepEqual(after.monsters.filter((s) => theirs(s.x, s.y)), before.monsters.filter((s) => theirs(s.x, s.y)), `plane ${plane}: and their creatures`);
    assert.deepEqual(after.spawns.filter((s) => theirs(s.x, s.y)), before.spawns.filter((s) => theirs(s.x, s.y)), `plane ${plane}: and what lies about`);
    assert.deepEqual(after.fishing.filter((w) => theirs(w.tiles[0]!.x, w.tiles[0]!.y)), before.fishing.filter((w) => theirs(w.tiles[0]!.x, w.tiles[0]!.y)), `plane ${plane}: and their waters`);
  }
  // The district's column of corners at x 3328 is the district's, written by it and left alone.
  for (let cy = KILNHOLD_SITE.y0; cy <= KILNHOLD_SITE.y1 + 1; cy++) {
    assert.equal(cornerHeight(ground, KILNHOLD_SITE.x0, cy), cornerHeight(alone, KILNHOLD_SITE.x0, cy), `corner ${KILNHOLD_SITE.x0},${cy} is the district's`);
  }
  // The controls: the checks above can see a difference, because a column past the seam is Kilnhold's own.
  // (Region 52 exists without the hold too, holding only the district's column of corners: `built` is what says whose it is.)
  assert.ok(ground.regions.get(regionId(52, 50))?.built === true && alone.regions.get(regionId(52, 50))?.built !== true, "the region east of the district is built only with Kilnhold");
  assert.ok(ground.regions.has(regionId(54, 50)) && !alone.regions.has(regionId(54, 50)), "and the waste's regions exist only with it");
  let differs = 0;
  for (let cy = KILNHOLD_SITE.y0; cy <= KILNHOLD_SITE.y1 + 1; cy++) if (cornerHeight(ground, KILNHOLD_SITE.x0 + 1, cy) !== cornerHeight(alone, KILNHOLD_SITE.x0 + 1, cy)) differs++;
  assert.ok(differs > 60, `the control: the column a tile past the seam is written by Kilnhold alone (${differs} corners differ)`);
  assert.ok(ground.objects.length > alone.objects.length + 300, "and the plane gained the hold");
});

test("the ground meets the district's without a step at the seam, and the Emberway runs on over it", () => {
  for (let cy = KILNHOLD_SITE.y0; cy <= KILNHOLD_SITE.y1 + 1; cy++) {
    const step = Math.abs(cornerHeight(ground, KILNHOLD_SITE.x0 + 1, cy) - cornerHeight(ground, KILNHOLD_SITE.x0, cy));
    assert.ok(step < 1e-6, `corner ${KILNHOLD_SITE.x0 + 1},${cy} steps ${step.toFixed(3)} from the seam`);
  }
  // The control: twelve columns in, the ground is its own and does move.
  let moves = 0;
  for (let cy = KILNHOLD_SITE.y0; cy <= KILNHOLD_SITE.y1; cy++) if (Math.abs(cornerHeight(ground, KILNHOLD_SITE.x0 + 12, cy) - cornerHeight(ground, KILNHOLD_SITE.x0, cy)) > 0.05) moves++;
  assert.ok(moves > 10, `the control: twelve columns in, the ground has gone its own way on ${moves} rows`);
  assert.equal(overlayAt(ground, DISTRICT.x1, 3231), OVERLAY_PATH, "the district's Emberway reaches its east edge");
  assert.equal(overlayAt(ground, ROAD_IN.x, ROAD_IN.y), OVERLAY_PATH, "and carries on over the seam");
  // The red earth comes in past the seam, not at it: grass at the seam's column, cinder a region in.
  let grass = 0, cinder = 0;
  for (let y = 3170; y <= 3260; y++) {
    if (underlayAt(ground, KILNHOLD_SITE.x0, y) === UNDERLAY_GRASS) grass++;
    if (underlayAt(ground, KILNHOLD_SITE.x0 + 64, y) === UNDERLAY_CINDER) cinder++;
  }
  assert.ok(grass > 80, `the seam's column is the heartland's grass (${grass} of 91)`);
  assert.ok(cinder > 60, `a region in it is the waste's red earth (${cinder} of 91)`);
});

test("the Emberway runs from the district's edge through the west gate to the square, every door, and out the east gate to the edge", () => {
  const seen = new Set<number>();
  const queue: Array<[number, number]> = [[ROAD_IN.x, ROAD_IN.y]];
  seen.add(key(ROAD_IN.x, ROAD_IN.y));
  while (queue.length > 0) {
    const [x, y] = queue.shift()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx, ny = y + dy;
      if (seen.has(key(nx, ny)) || !inBox(KILNHOLD_SITE, nx, ny) || overlayAt(ground, nx, ny) !== OVERLAY_PATH) continue;
      seen.add(key(nx, ny));
      queue.push([nx, ny]);
    }
  }
  assert.ok(seen.has(key(SQUARE.x, SQUARE.y)), "the path reaches the square");
  // The tile outside each door: the stub is paved up to the wall, and the door's own tile is the room's.
  assert.ok(seen.has(key(BANK.x0 + 5, BANK.y0 - 1)), "and the bank's door");
  assert.ok(seen.has(key(SMITHY.x0 + 5, SMITHY.y0 - 1)), "and the smithy's");
  assert.ok(seen.has(key(BLADES.x0 + 4, BLADES.y1 + 1)), "and Hask's Edge's");
  assert.ok(seen.has(key(INN.x0 + 5, INN.y1 + 1)), "and the Kiln Door's");
  assert.ok(seen.has(key(3607, 3247)) && seen.has(key(3634, 3247)), "and the north lane's houses");
  assert.ok(seen.has(key(3632, 3224)) && seen.has(key(3639, 3224)), "and the south-east houses");
  assert.ok(seen.has(key(SAND_EXIT.x, SAND_EXIT.y)), "and the Sand Road reaches the east edge");
  // The two gates are open gaps in the wall: every tile of each is walkable, and the wall stands either side.
  for (const gate of [GATE_W, GATE_E]) {
    for (let y = gate.y0; y <= gate.y1; y++) assert.ok(open(ground, gate.x0, y), `the gate tile ${gate.x0},${y} is open`);
    // The tile past each end of the gap is plain wall; the towers stand a tile further out.
    const walled = (y: number) => inHold.some((o) => o.kind === "stone_wall" && o.x === gate.x0 && o.y === y);
    assert.ok(walled(gate.y0 - 1) && walled(gate.y1 + 1), `the wall stands either side of the gate at ${gate.x0}`);
    // (A tower's middle tile on the gate's side is its arrow slit, so any of its wall is accepted.)
    const towered = (y: number) => inHold.some((o) => (o.kind === "wall" || o.kind === "wall_window") && o.x === gate.x0 && o.y === y);
    assert.ok(towered(gate.y0 - 3) && towered(gate.y1 + 3), `and a tower a tile beyond each end at ${gate.x0}`);
  }
  // A player can walk the whole road: no tile of it is blocked, and the district's road meets it.
  for (const [x, y] of EMBERWAY) assert.ok(open(ground, x, y), `the Emberway's turning at ${x},${y} is open`);
});

test("everything the card promises stands in the hold: the fourth bank, the hot smithy, Hask's Edge with the steel sword, the Kiln Door, houses, the well", () => {
  const kinds = (box: { x0: number; y0: number; x1: number; y1: number }, kind: string) => onSite.filter((o) => inBox(box, o.x, o.y) && o.kind === kind);
  assert.ok(kinds(BANK, "bank_booth").length >= 6, "the bank has its booths");
  assert.equal(ground.monsters.filter((s) => s.monster === "banker" && inBox(BANK, s.x, s.y)).length, 2, "and two bankers");
  const furnaces = kinds(SMITHY, "furnace");
  assert.equal(furnaces.length, 2, "two furnaces in the smithy");
  for (const f of furnaces) {
    assert.equal(f.tag, "hot", `the furnace at ${f.x},${f.y} runs hot`);
    assert.ok(FURNACES.some((at) => at.x === f.x && at.y === f.y), "where the site says");
  }
  assert.equal(furnaceHeat("hot"), 2, "hot enough for coldiron and emberite");
  assert.equal(furnaceHeat(undefined), 1, "the control: a village furnace is not");
  assert.equal(kinds(SMITHY, "anvil").length, 2, "and two anvils");
  assert.ok(ground.monsters.some((s) => s.monster === "smith_kilnhold" && inBox(SMITHY, s.x, s.y)), "the smith is in it");
  const counters = kinds(BLADES, "counter");
  assert.ok(counters.length >= 5, "Hask's Edge has its counters");
  for (const c of counters) assert.equal(c.tag, "kilnhold_blades");
  const shop = SHOPS["kilnhold_blades"]!;
  assert.ok(shop.stock.some((l) => l.id === item("steel_sword").id && l.count > 0), "and the steel sword is on its shelf");
  for (const [k, def] of Object.entries(SHOPS)) {
    if (k === "kilnhold_blades") continue;
    assert.ok(!def.stock.some((l) => l.id === item("steel_sword").id), `${k} does not sell the steel sword: it is the reason to come here`);
  }
  assert.ok(ground.monsters.some((s) => s.monster === "bladesmith" && inBox(BLADES, s.x, s.y)), "the bladesmith keeps it");
  assert.equal(kinds(INN, "range").length, 1, "the Kiln Door has its range");
  assert.ok(stack.planes.get(1)!.objects.some((o) => inBox(INN, o.x, o.y)), "and an upstairs");
  assert.ok(ground.monsters.some((s) => s.monster === "innkeeper_kilnhold" && inBox(INN, s.x, s.y)), "and its keeper");
  assert.ok(inHold.some((o) => o.kind === "well" && o.x === WELL.x && o.y === WELL.y), "the well is on the square");
  let roofed = 0;
  for (let y = HOLD.y0; y <= HOLD.y1; y++) for (let x = HOLD.x0; x <= HOLD.x1; x++) if (indoorsAt(ground, x, y) > 0) roofed++;
  assert.ok(roofed > 400, `the hold is built up (${roofed} tiles under a roof)`);
  assert.equal(roofAt(ground, BANK.x0 + 2, BANK.y0 + 2), ROOF_SLATE, "the bank is slated");
  assert.equal(ground.monsters.filter((s) => s.monster === "hold_warden").length, 2, "a warden at each gate");
  assert.ok(ground.monsters.filter((s) => (s.monster === "holdsman" || s.monster === "holdswoman") && inBox(HOLD, s.x, s.y)).length >= 4, "and people about");
  // Nothing dangerous inside the walls: every creature in the hold is a person or a farm animal.
  for (const s of ground.monsters.filter((s) => inBox(HOLD, s.x, s.y))) {
    const def = MONSTER_BY_KEY.get(s.monster)!;
    assert.ok(def.person || levelOf(def) <= 3, `${s.monster} at ${s.x},${s.y} does not belong inside the hold`);
  }
});

test("outside the wall: the kilns, the waystation and its highwaymen, the emberite outcrop with the worst company, dead trees on the red earth", () => {
  const kilns = onSite.filter((o) => o.kind === "kiln");
  assert.equal(kilns.length, KILNS.length, "four kilns");
  for (const k of kilns) assert.ok(!inBox(HOLD, k.x, k.y) && k.x < HOLD.x0, `the kiln at ${k.x},${k.y} is outside the west gate`);
  assert.ok(ground.monsters.some((s) => s.monster === "kilnman" && Math.hypot(s.x - 3590, s.y - 3240) < 6), "and the kilnman tends them");
  const ruin = onSite.filter((o) => o.kind === "stone_wall" && o.tag === "ruin" && inBox(WAYSTATION, o.x, o.y));
  assert.ok(ruin.length >= 24, `the waystation is four walls of ruin (${ruin.length} pieces)`);
  assert.ok(onSite.some((o) => o.kind === "fire" && inBox(WAYSTATION, o.x, o.y)), "with a fire in it");
  const thieves = ground.monsters.filter((s) => s.monster === "highwayman" && inBox(KILNHOLD_SITE, s.x, s.y));
  assert.equal(thieves.length, 2, "two highwaymen work the road");
  for (const t of thieves) assert.ok(Math.hypot(t.x - 3470, t.y - 3234) <= 5, `the highwayman at ${t.x},${t.y} is at the waystation`);
  const ember = onSite.filter((o) => o.kind === "emberite_rock");
  assert.equal(ember.length, 5, "five emberite rocks (Mining 58, PLAN §8.3)");
  for (const r of ember) assert.ok(Math.hypot(r.x - OUTCROP.x, r.y - OUTCROP.y) <= OUTCROP.r + 1, `the emberite at ${r.x},${r.y} is on the outcrop`);
  const brutes = ground.monsters.filter((s) => s.monster === "quarry_brute" && inBox(KILNHOLD_SITE, s.x, s.y));
  const scorpions = ground.monsters.filter((s) => s.monster === "dust_scorpion" && Math.hypot(s.x - OUTCROP.x, s.y - OUTCROP.y) < 20);
  assert.ok(brutes.length >= 2 && scorpions.length >= 4, `the outcrop has the worst company on the site (${brutes.length} brutes, ${scorpions.length} scorpions)`);
  // The rule: better resource, further from a bank, worse company. The outcrop is further from the bank than anything in the hold.
  assert.ok(Math.hypot(OUTCROP.x - BANK.x0, OUTCROP.y - BANK.y0) > 90, "and a fair walk from the bank");
  const dead = onSite.filter((o) => o.kind === "dead_tree");
  assert.ok(dead.length > 40, `the waste is dead trees (${dead.length})`);
  for (const d of dead) assert.equal(underlayAt(ground, d.x, d.y), UNDERLAY_CINDER, `the dead tree at ${d.x},${d.y} stands on red earth`);
  const green = onSite.filter((o) => (o.kind === "bush" || o.kind === "tree" || o.kind === "oak" || o.kind === "blackthorn") && underlayAt(ground, o.x, o.y) === UNDERLAY_CINDER);
  assert.deepEqual(green, [], "and nothing green grows on it");
  // The road stays safe: no creature that starts a fight stands on the Emberway itself but the highwaymen.
  for (const s of ground.monsters.filter((s) => inBox(WASTE, s.x, s.y) && s.monster !== "highwayman")) {
    const def = MONSTER_BY_KEY.get(s.monster)!;
    if (def.person || def.aggro === 0) continue;
    assert.notEqual(overlayAt(ground, s.x, s.y), OVERLAY_PATH, `${s.monster} at ${s.x},${s.y} stands on the road`);
  }
});

test("the people of Kilnhold talk, the shop keeper's talk offers the trade, and the map knows the hold", () => {
  const people = new Set(ground.monsters.filter((s) => inBox(KILNHOLD_SITE, s.x, s.y)).map((s) => s.monster).filter((k) => MONSTER_BY_KEY.get(k)!.person));
  assert.ok(people.size >= 7, `${people.size} kinds of people`);
  for (const k of people) {
    const def = MONSTER_BY_KEY.get(k)!;
    assert.ok(def.talk && DIALOGUE[def.talk], `${k} has something to say`);
    assert.ok(DIALOGUE[def.talk!]!["start"]!.lines.length > 0);
    if (def.shop) assert.ok(DIALOGUE[def.talk!]!["start"]!.options!.some((o) => o.act === "shop"), `${k} offers the trade`);
  }
  assert.equal(areaAt(SQUARE.x, SQUARE.y).key, "kilnhold", "the hold has its own tune");
  assert.equal(areaAt(3450, 3200).key, "cinderwaste", "and the waste its own");
  assert.ok(KILNHOLD_LABELS.some((l) => l.name === "Kilnhold" && inBox(KILNHOLD_SITE, l.x, l.y)), "the map names the hold");
  assert.ok(MAP_MARKS.some((m) => m.icon === "mine" && Math.hypot(m.x - OUTCROP.x, m.y - OUTCROP.y) < 3), "and marks the outcrop");
  assert.ok(!MAP_EXITS.some((e) => e.name.includes("Sand Road")), "the Sand Road no longer leaves the map: it runs on to Sandreach");
  assert.ok(!MAP_EXITS.some((e) => e.name.includes("Emberway")), "and the Emberway is no longer an exit: it runs on");
  assert.equal(STATION_OF["furnace"], "furnace");
});

test("the Emberway Gate is a toll gate: the keeper's talk takes ten coins and opens it, and says why", () => {
  const keeper = DIALOGUE["gatekeeper"]!;
  const pay = keeper["start"]!.options!.find((o) => o.do?.some((e) => "open" in e && e.open === "emberway"));
  assert.ok(pay, "an option opens the gate");
  assert.deepEqual(pay.when, [{ has: "coins", count: 10 }], "offered to those with ten coins");
  assert.ok(pay.do!.some((e) => "take" in e && e.take === "coins" && e.count === 10), "and it takes them");
  assert.ok(keeper["why"]!.lines.some((l) => l.includes("toll")), "the keeper explains the toll");
  const gate = ground.objects.find((o) => o.kind === "gate" && o.tag === "emberway");
  assert.ok(gate, "the gate stands");
  assert.ok(MAP_MARKS.some((m) => m.icon === "gate" && m.name.includes("toll")), "and the map calls it a toll gate");
});
