// Sandreach and the Dunes (PLAN §7.6, Wave 4): that the site is where the plan puts it; that building it changes
// nothing anywhere else and leaves Kilnhold's east column alone, with the bay running on over the seam; that
// the Sand Road runs from Kilnhold's gate to the square and every door; that the town has what its card
// promises round its oasis; that the Dunes hold the gold, the sealed tombs and worse company the further out;
// that its people talk; and that a player walks in over the seam.
import assert from "node:assert/strict";
import { test } from "node:test";
import { World } from "../src/server/world.ts";
import { ADIT_REGION } from "../src/shared/adit.ts";
import { DEEP_REGION } from "../src/shared/ashbarrow.ts";
import { BLOCKED } from "../src/shared/collision.ts";
import { DIALOGUE } from "../src/shared/dialogue.ts";
import { SAND_EXIT } from "../src/shared/kilnhold.ts";
import {
  builtRegions, cornerHeight, OVERLAY_PATH, OVERLAY_WATER, overlayAt, regionId, UNDERLAY_GRASS, underlayAt, type WorldMap,
} from "../src/shared/map.ts";
import { levelOf, MONSTER_BY_KEY } from "../src/shared/monsters.ts";
import { areaAt, buildOakridge, MAP_EXITS, MAP_LABELS, MAP_MARKS, OAKRIDGE_SEED } from "../src/shared/oakridge.ts";
import {
  BANK, DUNES, GOLD, HOUSES, INN, POOL, POST, ROAD_IN, SANDREACH_SITE, SQUARE, TOMBS, TOWN, WELL, YARD, isSea,
} from "../src/shared/sandreach.ts";
import { SHOPS } from "../src/shared/shops.ts";
import { inBox } from "../src/shared/worldgen.ts";

const stack = buildOakridge(OAKRIDGE_SEED);
const ground = stack.planes.get(0)!;
const onSite = ground.objects.filter((o) => inBox(SANDREACH_SITE, o.x, o.y));
const inTown = onSite.filter((o) => inBox(TOWN, o.x, o.y));
const open = (map: WorldMap, x: number, y: number) => (map.collision.get(x, y) & BLOCKED) === 0;
const key = (x: number, y: number) => y * 8192 + x;
const SEAM_X = SANDREACH_SITE.x0;

test("the site is regions 58–62 × 45–50, down the coast from Kilnhold, and nothing beyond", () => {
  const ids = new Set(builtRegions(ground).map((r) => regionId(r.rx, r.ry)));
  for (let rx = 58; rx <= 62; rx++) for (let ry = 45; ry <= 50; ry++) assert.ok(ids.has(regionId(rx, ry)), `region ${rx},${ry} is built`);
  for (const [rx, ry] of [[57, 48], [63, 47], [58, 44], [58, 51], [62, 51]]) assert.ok(!ids.has(regionId(rx!, ry!)), `region ${rx},${ry} is not`);
  assert.equal(builtRegions(ground).length, 163, "the district's nine, Wave 1's thirty-five, Wave 2's thirty-two, Deepdelve's twelve, the Harrow's forty-five and Sandreach's thirty");
  assert.ok(onSite.length > 800, `the site has things standing on it (${onSite.length})`);
  assert.equal(inTown.filter((o) => o.kind === "bank_booth").length, 8, "the sixth bank's booths");
});

/** ⛔ The seam and the control: the world without Sandreach is the same world everywhere else, and Kilnhold's column is Kilnhold's. */
test("building Sandreach changes nothing anywhere else, on any plane, and leaves Kilnhold's east column alone", () => {
  const without = buildOakridge(OAKRIDGE_SEED, { sandreach: false });
  const alone = without.planes.get(0)!;
  assert.equal(builtRegions(alone).length, 133, "the control build is everything but Sandreach");
  const theirs = (o: { x: number; y: number; plane: number }) => !inBox(SANDREACH_SITE, o.x, o.y) && !(o.plane < 0 && (inBox(ADIT_REGION, o.x, o.y) || inBox(DEEP_REGION, o.x, o.y)));
  for (const [plane, before] of without.planes) {
    const after = stack.planes.get(plane)!;
    for (const r of builtRegions(before)) {
      const both = after.regions.get(regionId(r.rx, r.ry))!;
      for (const field of ["heights", "underlay", "overlay", "indoors", "roofs"] as const) assert.deepEqual([...both[field]], [...r[field]], `plane ${plane}, region ${r.rx},${r.ry}: ${field} unchanged`);
    }
    const objects = (m: WorldMap) => m.objects.filter(theirs).map((o) => `${o.id}:${o.kind}:${o.x},${o.y}:${o.side}:${o.tag ?? ""}`).join("|");
    assert.equal(objects(after), objects(before), `plane ${plane}: their objects, with the same ids`);
    assert.deepEqual(after.monsters.filter((s) => !inBox(SANDREACH_SITE, s.x, s.y)), before.monsters.filter((s) => !inBox(SANDREACH_SITE, s.x, s.y)), `plane ${plane}: and their creatures`);
    assert.deepEqual(after.spawns.filter((s) => !inBox(SANDREACH_SITE, s.x, s.y)), before.spawns.filter((s) => !inBox(SANDREACH_SITE, s.x, s.y)), `plane ${plane}: and what lies about`);
  }
  for (let cy = 3136; cy <= 3264; cy++) assert.equal(cornerHeight(ground, SEAM_X, cy), cornerHeight(alone, SEAM_X, cy), `corner ${SEAM_X},${cy} is Kilnhold's`);
  // No step: the column a tile in meets the seam exactly.
  for (let cy = 3136; cy <= 3264; cy++) assert.ok(Math.abs(cornerHeight(ground, SEAM_X + 1, cy) - cornerHeight(ground, SEAM_X, cy)) < 1e-6, `corner ${SEAM_X + 1},${cy} meets the seam`);
  assert.ok(ground.regions.get(regionId(60, 47))?.built === true && !alone.regions.has(regionId(60, 47)), "the control: the town's region exists only with Sandreach");
});

test("Kilnhold's bay runs on over the seam and closes against the coast, with the sea west of the coast all the way down", () => {
  let across = 0;
  for (let y = 3136; y <= 3160; y++) {
    if (overlayAt(ground, SEAM_X - 1, y) !== OVERLAY_WATER) continue;
    assert.equal(overlayAt(ground, SEAM_X, y), OVERLAY_WATER, `the bay's water at ${SEAM_X - 1},${y} runs on over the seam`);
    across++;
  }
  assert.ok(across >= 10, `the bay crosses the seam on ${across} rows`);
  for (let y = SANDREACH_SITE.y0; y <= SANDREACH_SITE.y1; y += 3) {
    for (let x = SANDREACH_SITE.x0; x <= SANDREACH_SITE.x0 + 120; x++) {
      if (isSea(x, y)) assert.ok(overlayAt(ground, x, y) === OVERLAY_WATER && !open(ground, x, y), `${x},${y} west of the coast is sea`);
    }
  }
  assert.ok(!isSea(TOWN.x0, SQUARE.y) && !isSea(3772, 3176), "the town and the road stand east of it");
});

test("the Sand Road runs on from Kilnhold's gate to the square, and the town's lanes to every door", () => {
  assert.equal(overlayAt(ground, SAND_EXIT.x, SAND_EXIT.y), OVERLAY_PATH, "Kilnhold's Sand Road reaches its east edge");
  assert.equal(overlayAt(ground, ROAD_IN.x, ROAD_IN.y), OVERLAY_PATH, "and runs on over the seam");
  const seen = new Set<number>([key(ROAD_IN.x, ROAD_IN.y)]);
  const queue: Array<[number, number]> = [[ROAD_IN.x, ROAD_IN.y]];
  while (queue.length > 0) {
    const [x, y] = queue.shift()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx, ny = y + dy;
      if (seen.has(key(nx, ny)) || !inBox(SANDREACH_SITE, nx, ny) || overlayAt(ground, nx, ny) !== OVERLAY_PATH) continue;
      seen.add(key(nx, ny));
      queue.push([nx, ny]);
    }
  }
  assert.ok(seen.has(key(SQUARE.x, SQUARE.y)), "the Sand Road reaches the square");
  const doors = inTown.filter((o) => o.kind === "door");
  assert.equal(doors.length, 9, "nine doors: the bank, the Post, the Last Well and six houses");
  for (const d of doors) {
    const [ox, oy] = [[0, 1], [1, 0], [0, -1], [-1, 0]][d.side]!;
    assert.ok(seen.has(key(d.x + ox!, d.y + oy!)), `the door at ${d.x},${d.y} opens onto the road's lanes`);
  }
});

test("the town: the sixth bank, the Caravan Post, the Last Well, six houses, the well, the oasis and the caravan yard, and nothing fighting in it", () => {
  assert.ok(inTown.some((o) => o.kind === "well" && o.x === WELL.x && o.y === WELL.y), "the well in the square");
  assert.ok(inTown.filter((o) => o.kind === "bank_booth").every((o) => inBox(BANK, o.x, o.y)), "the booths in the bank");
  const counters = inTown.filter((o) => o.kind === "counter");
  assert.ok(counters.length >= 3 && counters.every((o) => o.tag === "sandreach_caravan" && inBox(POST, o.x, o.y)), "the Caravan Post's counters");
  assert.ok(SHOPS["sandreach_caravan"]!.buysAnything, "and it takes anything, for the caravans to carry east");
  assert.ok(inTown.some((o) => o.kind === "range" && inBox(INN, o.x, o.y)) && stack.planes.get(1)!.objects.some((o) => o.kind === "stairs" && inBox(INN, o.x, o.y)), "the Last Well: a range, and a floor above");
  for (const [box] of HOUSES) assert.equal(inTown.filter((o) => o.kind === "door" && inBox(box, o.x, o.y)).length, 1, `the house at ${box.x0},${box.y0} has its door`);
  for (const [icon, box] of [["bank", BANK], ["bread", POST], ["tankard", INN]] as const) {
    assert.ok(inTown.some((o) => o.kind === "sign" && o.tag === icon && inBox(box, o.x, o.y)), `the ${icon} sign hangs on it`);
  }
  // The oasis: water, reeds round it, grass and trees round them.
  let water = 0, grass = 0;
  for (let y = POOL.y - 12; y <= POOL.y + 12; y++) {
    for (let x = POOL.x - 12; x <= POOL.x + 12; x++) {
      if (overlayAt(ground, x, y) === OVERLAY_WATER) water++;
      else if (underlayAt(ground, x, y) === UNDERLAY_GRASS) grass++;
    }
  }
  assert.ok(water >= 100 && grass >= 150, `the oasis: ${water} tiles of water and ${grass} of grass round it`);
  const near = (kind: string, r: number) => inTown.filter((o) => o.kind === kind && Math.hypot(o.x - POOL.x, o.y - POOL.y) <= r).length;
  assert.ok(near("reed", POOL.r + 2) >= 8 && near("tree", 12) >= 6, "reeds at the water's edge, trees on the grass");
  // The caravan yard: fenced, with a field gate, its stalls selling for the Post.
  assert.ok(inTown.some((o) => o.kind === "field_gate" && inBox(YARD, o.x, o.y)), "the yard has its gate");
  assert.ok(inTown.filter((o) => o.kind === "stall" && inBox(YARD, o.x, o.y)).every((o) => o.tag === "sandreach_caravan"), "and its stalls sell the Post's goods");
  for (const s of ground.monsters.filter((s) => inBox(TOWN, s.x, s.y))) {
    const def = MONSTER_BY_KEY.get(s.monster)!;
    assert.ok(def.person || def.aggro === 0 || s.monster === "hen", `the ${s.monster} at ${s.x},${s.y} is no danger in town`);
  }
  assert.equal(areaAt(SQUARE.x, SQUARE.y).key, "sandreach", "the square is Sandreach");
});

test("the Dunes: gold out in the sand, the old tombs sealed, and worse company the further out", () => {
  const gold = onSite.filter((o) => o.kind === "gold_rock");
  assert.equal(gold.length, 5, "five gold rocks (Mining 44)");
  for (const r of gold) assert.ok(Math.hypot(r.x - GOLD.x, r.y - GOLD.y) <= GOLD.r + 1, `the gold at ${r.x},${r.y} is in its outcrop`);
  const slabs = onSite.filter((o) => o.kind === "sealed");
  assert.equal(slabs.length, TOMBS.length, "a sealed slab for every tomb");
  for (const t of TOMBS) {
    assert.ok(slabs.some((s) => s.tag === "tomb" && s.x === t.x && s.y === t.y - 3), `the tomb at ${t.x},${t.y} has its slab before its face`);
    assert.ok(onSite.filter((o) => o.kind === "wall" && Math.abs(o.x - t.x) <= 3 && Math.abs(o.y - t.y) <= 2).length >= 16, "and its block of stone");
  }
  const levels = (box: typeof DUNES) => ground.monsters.filter((s) => inBox(box, s.x, s.y) && !MONSTER_BY_KEY.get(s.monster)!.person).map((s) => levelOf(MONSTER_BY_KEY.get(s.monster)!));
  const road = { ...SANDREACH_SITE, y0: TOWN.y1 + 1 };
  assert.ok(Math.max(...levels(DUNES)) > Math.max(...levels(road)), `worse company in the Dunes (${Math.max(...levels(DUNES))}) than on the road (${Math.max(...levels(road))})`);
  for (const key of ["sand_stalker", "dune_scorpion", "dune_raider"]) assert.ok(ground.monsters.some((s) => s.monster === key && inBox(SANDREACH_SITE, s.x, s.y)), `${key}s are out there`);
  assert.equal(areaAt(GOLD.x, GOLD.y).key, "dunes", "and the gold is in the Dunes");
});

test("the people of Sandreach talk, the Post's keeper offers the trade, and the map knows the town, the Dunes and the road", () => {
  for (const key of ["caravan_master", "innkeeper_sandreach", "tomb_warden", "sandreacher", "sandreacher_woman", "caravaneer"]) {
    const def = MONSTER_BY_KEY.get(key)!;
    assert.ok(def.talk && DIALOGUE[def.talk], `${key} has something to say`);
    assert.ok(ground.monsters.some((s) => s.monster === key && inBox(SANDREACH_SITE, s.x, s.y)), `and stands in Sandreach`);
  }
  assert.equal(MONSTER_BY_KEY.get("caravan_master")!.shop, "sandreach_caravan");
  assert.ok((DIALOGUE["caravan_master"]!["start"]!.options ?? []).some((o) => o.act === "shop"), "the keeper's talk offers the trade");
  for (const name of ["Sandreach", "The Dunes"]) assert.ok(MAP_LABELS.some((l) => l.name === name && inBox(SANDREACH_SITE, l.x, l.y)), `the map names ${name}`);
  assert.ok(MAP_MARKS.some((m) => m.icon === "inn" && inBox(INN, m.x, m.y)) && MAP_MARKS.some((m) => m.icon === "mine" && m.x === GOLD.x), "and marks the inn and the gold");
  assert.ok(!MAP_EXITS.some((e) => e.name.includes("Sand Road")), "and the Sand Road is no exit: it runs on to here");
});

test("a player walks from Kilnhold's east gate down the Sand Road over the seam", () => {
  const world = new World(stack, () => 0.5);
  const p = world.add("Traveller", undefined, { at: { x: SAND_EXIT.x - 12, y: SAND_EXIT.y, plane: 0 } });
  const to = { x: 3742, y: 3210 };
  world.walk(p, to.x, to.y);
  for (let i = 0; i < 80 && (p.x !== to.x || p.y !== to.y); i++) world.step();
  assert.deepEqual({ x: p.x, y: p.y }, to, "the player comes down the Sand Road into Sandreach's country");
  assert.ok(p.x > SEAM_X, "over the seam");
});
