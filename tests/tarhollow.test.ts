// Sablewood Isle (PLAN §7.6, Wave 2's second half): that the site is sea to every edge with one isle
// in it, that building it changes nothing anywhere else, that the path runs from the landing up to
// the square and every door, that everything the card promises stands in Tarhollow and on the isle
// and no bank does, that the ladders' rungs are here, that the Searmouth goes down three planes and
// comes back up with the ore and the mountain's creatures in their band, and that its people talk.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ADIT_REGION } from "../src/shared/adit.ts";
import { CHESTS } from "../src/shared/chests.ts";
import { BLOCKED } from "../src/shared/collision.ts";
import { DIALOGUE } from "../src/shared/dialogue.ts";
import { SEA_CORNER } from "../src/shared/heartland.ts";
import { item } from "../src/shared/items.ts";
import {
  builtRegions, cornerHeight, OVERLAY_PATH, OVERLAY_WATER, overlayAt, regionId, ROOF_THATCH, roofAt, UNDERLAY_CINDER, UNDERLAY_ROCK, underlayAt,
  type WorldMap,
} from "../src/shared/map.ts";
import { levelOf, MONSTER_BY_KEY } from "../src/shared/monsters.ts";
import { areaAt, buildOakridge, MAP_EXITS, MAP_MARKS, OAKRIDGE_SEED } from "../src/shared/oakridge.ts";
import { findPathBeside } from "../src/shared/pathfind.ts";
import { SHOPS } from "../src/shared/shops.ts";
import {
  CHAPEL, EMBERITE, GALLERIES_PLANE, GALLERY_ROOMS, GALLERY_STAIR, HEART_CHEST, HEART_PLANE, HEART_ROOMS, HUT, INN, IRONBARK_WOOD, isLand, JETTY,
  LANDING_ROOT, SABLEWOOD, SEAR, SEAR_REGION, SEARMOUTH, SQUARE, STORE, TARHOLLOW_LABELS, THROAT_PLANE, THROAT_ROOMS, THROAT_STAIR, VILLAGE, WELL,
} from "../src/shared/tarhollow.ts";
import { TRAVEL } from "../src/shared/travel.ts";
import { inBox } from "../src/shared/worldgen.ts";

const stack = buildOakridge(OAKRIDGE_SEED);
const ground = stack.planes.get(0)!;
const onSite = ground.objects.filter((o) => inBox(SABLEWOOD, o.x, o.y));
const open = (map: WorldMap, x: number, y: number) => (map.collision.get(x, y) & BLOCKED) === 0;
const key = (x: number, y: number) => y * 8192 + x;
const sea = cornerHeight(ground, SEA_CORNER.x, SEA_CORNER.y);

test("the site is regions 34–38 × 39–42 with sea to every edge and one isle in it, at the sea's level", () => {
  const ids = new Set(builtRegions(ground).map((r) => regionId(r.rx, r.ry)));
  for (let rx = 34; rx <= 38; rx++) for (let ry = 39; ry <= 42; ry++) assert.ok(ids.has(regionId(rx, ry)), `region ${rx},${ry} is built`);
  for (const [rx, ry] of [[33, 40], [39, 40], [36, 38], [36, 43]]) assert.ok(!ids.has(regionId(rx!, ry!)), `region ${rx},${ry} is not`);
  assert.equal(builtRegions(ground).length, 76, "the district's nine, Wave 1's thirty-five, Kilnhold's twelve and the isle's twenty");
  // Every tile on the site's edge is water, and nothing stands in the water anywhere.
  for (let x = SABLEWOOD.x0; x <= SABLEWOOD.x1; x++) {
    for (const y of [SABLEWOOD.y0, SABLEWOOD.y1]) assert.equal(overlayAt(ground, x, y), OVERLAY_WATER, `${x},${y} on the site's edge is sea`);
  }
  for (let y = SABLEWOOD.y0; y <= SABLEWOOD.y1; y++) {
    for (const x of [SABLEWOOD.x0, SABLEWOOD.x1]) assert.equal(overlayAt(ground, x, y), OVERLAY_WATER, `${x},${y} on the site's edge is sea`);
  }
  let land = 0, water = 0;
  for (let y = SABLEWOOD.y0; y <= SABLEWOOD.y1; y++) {
    for (let x = SABLEWOOD.x0; x <= SABLEWOOD.x1; x++) {
      const wet = overlayAt(ground, x, y) === OVERLAY_WATER;
      assert.equal(wet, !isLand(x, y) && !inBox(JETTY, x, y), `${x},${y} is water exactly where the shore says`);
      if (wet) water++; else land++;
    }
  }
  assert.ok(land > 20000 && water > 30000, `an isle in a sea (${land} land, ${water} water)`);
  // (The ferry lies to the jetty in the water, as the port's boats do: a boat is the one thing that belongs there.)
  for (const o of onSite) if (o.kind !== "boat") assert.ok(overlayAt(ground, o.x, o.y) !== OVERLAY_WATER, `${o.kind} at ${o.x},${o.y} stands in the sea`);
  assert.ok(onSite.some((o) => o.kind === "boat" && overlayAt(ground, o.x, o.y) === OVERLAY_WATER), "and the ferry lies off the jetty");
  for (let x = SABLEWOOD.x0; x <= SABLEWOOD.x1; x += 13) assert.ok(Math.abs(cornerHeight(ground, x, SABLEWOOD.y0 + 1) - sea) < 1e-6, `the sea at ${x} is at the sea's level`);
  // The isle is one piece: from the landing, every land tile the path network touches is reachable; the village is.
  assert.ok(isLand(SQUARE.x, SQUARE.y) && isLand(SEAR.x, SEAR.y) && isLand(IRONBARK_WOOD.x, IRONBARK_WOOD.y), "the village, the mountain and the wood are on the isle");
});

/**
 * ⛔ The control. The isle shares no corner with any other site, so a world built without it is the
 * same world everywhere else on every plane, object for object with the same ids, but for what is
 * built after it (the Adit), which its own test holds.
 */
test("building the isle changes nothing anywhere else, on any plane", () => {
  const without = buildOakridge(OAKRIDGE_SEED, { tarhollow: false });
  assert.equal(builtRegions(without.planes.get(0)!).length, 56, "the control build is everything but the isle");
  const theirs = (o: { x: number; y: number; plane: number }) => !inBox(SABLEWOOD, o.x, o.y) && !(o.plane < 0 && inBox(ADIT_REGION, o.x, o.y));
  for (const [plane, before] of without.planes) {
    const after = stack.planes.get(plane)!;
    for (const r of builtRegions(before).filter((r) => !inBox(ADIT_REGION, r.x0, r.y0))) {
      const both = after.regions.get(regionId(r.rx, r.ry))!;
      for (const field of ["heights", "underlay", "overlay", "indoors", "roofs"] as const) assert.deepEqual([...both[field]], [...r[field]], `plane ${plane}, region ${r.rx},${r.ry}: ${field} unchanged`);
    }
    const objects = (m: WorldMap) => m.objects.filter(theirs).map((o) => `${o.id}:${o.kind}:${o.x},${o.y}:${o.side}:${o.tag ?? ""}`).join("|");
    assert.equal(objects(after), objects(before), `plane ${plane}: their objects, with the same ids`);
    assert.deepEqual(after.monsters.filter((s) => !inBox(SABLEWOOD, s.x, s.y)), before.monsters.filter((s) => !inBox(SABLEWOOD, s.x, s.y)), `plane ${plane}: and their creatures`);
    assert.deepEqual(after.spawns.filter((s) => !inBox(SABLEWOOD, s.x, s.y)), before.spawns.filter((s) => !inBox(SABLEWOOD, s.x, s.y)), `plane ${plane}: and what lies about`);
  }
  assert.ok(!without.planes.get(0)!.regions.has(regionId(36, 41)) && ground.regions.has(regionId(36, 41)), "the control: the isle's regions exist only with it");
  assert.ok(ground.objects.length > without.planes.get(0)!.objects.length + 300, "and the plane gained the isle");
});

test("the path runs from the landing up to the square and to every door, and on to the wood and the mountain's mouth", () => {
  const landing = TRAVEL["tarhollow"]!;
  assert.ok(inBox(LANDING_ROOT, landing.x, landing.y) && open(ground, landing.x, landing.y), "the landing is on the root of the jetty, on land");
  const seen = new Set<number>();
  const queue: Array<[number, number]> = [[landing.x, landing.y]];
  seen.add(key(landing.x, landing.y));
  while (queue.length > 0) {
    const [x, y] = queue.shift()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx, ny = y + dy;
      if (seen.has(key(nx, ny)) || !inBox(SABLEWOOD, nx, ny) || overlayAt(ground, nx, ny) !== OVERLAY_PATH) continue;
      seen.add(key(nx, ny));
      queue.push([nx, ny]);
    }
  }
  assert.ok(seen.has(key(SQUARE.x, SQUARE.y)), "the path reaches the square");
  assert.ok(seen.has(key(INN.x0 + 6, INN.y1 + 1)), "and the Black Pine's door");
  assert.ok(seen.has(key(STORE.x0 + 4, STORE.y0 - 1)), "and the store's");
  assert.ok(seen.has(key(CHAPEL.x0 - 1, CHAPEL.y0 + 5)), "and the chapel's");
  assert.ok(seen.has(key(HUT.x0 - 1, HUT.y0 + 2)), "and the woodcutter's hut");
  assert.ok(seen.has(key(SEARMOUTH.x, SEARMOUTH.y - 1)) || seen.has(key(SEARMOUTH.x, SEARMOUTH.y - 2)), "and the foot of the mountain's mouth");
  for (let y = JETTY.y0; y <= JETTY.y1; y++) assert.ok(open(ground, JETTY.x0, y) && overlayAt(ground, JETTY.x0, y) === OVERLAY_PATH, `the jetty's plank at ${y} can be walked`);
});

test("everything the card promises stands in Tarhollow, and no bank: the Black Pine, Tarr's Store, the chapel, cottages, the well", () => {
  const kinds = (box: { x0: number; y0: number; x1: number; y1: number }, kind: string) => onSite.filter((o) => inBox(box, o.x, o.y) && o.kind === kind);
  assert.equal(onSite.filter((o) => o.kind === "bank_booth").length, 0, "no bank on the isle, on purpose");
  assert.ok(!ground.monsters.some((s) => s.monster === "banker" && inBox(SABLEWOOD, s.x, s.y)), "and no banker");
  assert.equal(kinds(INN, "range").length, 1, "the Black Pine has its range");
  assert.ok(stack.planes.get(1)!.objects.some((o) => inBox(INN, o.x, o.y)), "and an upstairs");
  assert.ok(ground.monsters.some((s) => s.monster === "innkeeper_tarhollow" && inBox(INN, s.x, s.y)), "and its keeper");
  const counters = kinds(STORE, "counter");
  assert.ok(counters.length >= 4 && counters.every((c) => c.tag === "tarhollow_stores"), "Tarr's Store has its counters");
  const shop = SHOPS["tarhollow_stores"]!;
  assert.ok(shop.stock.some((l) => l.id === item("harpoon").id) && shop.stock.some((l) => l.id === item("bait").id), "and sells what a harpoon needs");
  assert.ok(shop.stock.some((l) => l.id === item("raw_blackfish").id && l.count === 0), "and buys the isle's fish");
  assert.equal(kinds(CHAPEL, "altar").length, 1, "the chapel has its altar");
  assert.ok(onSite.some((o) => o.kind === "well" && o.x === WELL.x && o.y === WELL.y), "the well is on the square");
  let thatched = 0;
  for (let y = VILLAGE.y0; y <= VILLAGE.y1; y++) for (let x = VILLAGE.x0; x <= VILLAGE.x1; x++) if (roofAt(ground, x, y) === ROOF_THATCH) thatched++;
  assert.ok(thatched > 100, `the cottages are thatched (${thatched} tiles)`);
  assert.ok(ground.monsters.filter((s) => (s.monster === "islander" || s.monster === "islander_woman") && inBox(VILLAGE, s.x, s.y)).length >= 3, "and islanders about");
  for (const s of ground.monsters.filter((s) => inBox(VILLAGE, s.x, s.y))) {
    const def = MONSTER_BY_KEY.get(s.monster)!;
    assert.ok(def.person || levelOf(def) <= 3, `${s.monster} at ${s.x},${s.y} does not belong in the village`);
  }
});

test("the ladders' rungs: ironbark in its wood, sablewood on the mountain's slopes, blackfish off the jetty", () => {
  const ironbark = onSite.filter((o) => o.kind === "ironbark");
  assert.ok(ironbark.length >= 8, `ironbark (WC 63) in the wood (${ironbark.length})`);
  for (const t of ironbark) assert.ok(Math.hypot(t.x - IRONBARK_WOOD.x, t.y - IRONBARK_WOOD.y) <= IRONBARK_WOOD.r + 1, `the ironbark at ${t.x},${t.y} is in the wood`);
  const sable = onSite.filter((o) => o.kind === "sablewood");
  assert.ok(sable.length >= 7, `sablewood (WC 76) on the slopes (${sable.length})`);
  for (const t of sable) {
    const d = Math.hypot(t.x + 0.5 - SEAR.x, t.y + 0.5 - SEAR.y);
    assert.ok(d >= 23 && d <= 39, `the sablewood at ${t.x},${t.y} stands on the mountain's lower slopes (${d.toFixed(1)} out)`);
  }
  const blackfish = ground.fishing.filter((w) => w.method === "harpoon" && w.tiles.every((t) => inBox(SABLEWOOD, t.x, t.y)));
  assert.equal(blackfish.length, 1, "one harpoon water off the isle");
  for (const t of blackfish[0]!.tiles) {
    assert.equal(overlayAt(ground, t.x, t.y), OVERLAY_WATER, `the spot at ${t.x},${t.y} is on water`);
    assert.ok(Math.abs(t.x - JETTY.x0) <= 2, "beside the jetty");
  }
  assert.ok(!onSite.some((o) => o.kind === "coldiron_rock" || o.kind === "starfall_rock"), "and no rung that is not the isle's");
});

test("Mount Sear is a cone of red earth and black rock, and the Searmouth goes down three planes and comes back up", () => {
  const top = cornerHeight(ground, SEAR.x, SEAR.y + 12), foot = cornerHeight(ground, SEAR.x, SEAR.y + 44), crater = cornerHeight(ground, SEAR.x, SEAR.y);
  assert.ok(top - foot > 5, `the mountain rises (${(top - foot).toFixed(1)} over its foot)`);
  assert.ok(crater < top - 1.5, `with a crater in its top (${(top - crater).toFixed(1)} down)`);
  assert.equal(underlayAt(ground, SEAR.x + 10, SEAR.y), UNDERLAY_ROCK, "black rock above");
  assert.equal(underlayAt(ground, SEAR.x + 30, SEAR.y), UNDERLAY_CINDER, "red earth on the flanks");
  const mouth = ground.objects.find((o) => o.kind === "adit" && o.x === SEARMOUTH.x && o.y === SEARMOUTH.y);
  assert.ok(mouth && mouth.to === THROAT_PLANE && mouth.side === 2, "the mouth in the south flank leads down");
  const throat = stack.planes.get(THROAT_PLANE)!, galleries = stack.planes.get(GALLERIES_PLANE)!, heart = stack.planes.get(HEART_PLANE)!;
  const stair = (map: WorldMap, x: number, y: number, to: number) => map.objects.find((o) => o.kind === "stairs" && o.x === x && o.y === y && o.to === to);
  assert.ok(stair(throat, SEARMOUTH.x, SEARMOUTH.y + 1, 0), "the throat's stair back up to the mouth");
  assert.ok(stair(throat, THROAT_STAIR.x, THROAT_STAIR.y, GALLERIES_PLANE) && stair(galleries, THROAT_STAIR.x, THROAT_STAIR.y, THROAT_PLANE), "the throat and the galleries meet on one tile");
  assert.ok(stair(galleries, GALLERY_STAIR.x, GALLERY_STAIR.y, HEART_PLANE) && stair(heart, GALLERY_STAIR.x, GALLERY_STAIR.y, GALLERIES_PLANE), "and the galleries and the heart");
  // Every plane: its rooms are floor, the rest of the region rock; and each is one connected piece from its stair.
  for (const [map, rooms, from, to] of [
    [throat, THROAT_ROOMS, { x: SEARMOUTH.x, y: SEARMOUTH.y + 2 }, THROAT_STAIR],
    [galleries, GALLERY_ROOMS, { x: THROAT_STAIR.x + 1, y: THROAT_STAIR.y }, GALLERY_STAIR],
    [heart, HEART_ROOMS, { x: GALLERY_STAIR.x - 1, y: GALLERY_STAIR.y }, HEART_CHEST],
  ] as const) {
    let rock = 0;
    for (let y = SEAR_REGION.y0; y <= SEAR_REGION.y1; y++) {
      for (let x = SEAR_REGION.x0; x <= SEAR_REGION.x1; x++) {
        if (rooms.some((r) => inBox(r, x, y))) assert.notEqual(underlayAt(map, x, y), UNDERLAY_ROCK, `room tile ${x},${y} is floor`);
        else { rock++; assert.ok(!open(map, x, y), `${x},${y} outside the rooms is blocked`); }
      }
    }
    assert.ok(rock > 2000, "cut into the rock");
    assert.ok(open(map, from.x, from.y), `somewhere to stand at ${from.x},${from.y}`);
    assert.ok(findPathBeside(map.collision, from.x, from.y, to).length > 0, `the way on from ${from.x},${from.y} to ${to.x},${to.y} can be walked`);
  }
  // The ore, the vents, the chest, and the creatures in their band.
  const ore = [...galleries.objects, ...heart.objects].filter((o) => o.kind === "emberite_rock" && inBox(SEAR_REGION, o.x, o.y));
  assert.equal(ore.length, EMBERITE.length, "seven emberite rocks (Mining 58) down there");
  assert.ok(heart.objects.filter((o) => o.kind === "vent" && inBox(SEAR_REGION, o.x, o.y)).length >= 4, "vents in the heart's floor");
  const chest = heart.objects.find((o) => o.kind === "chest" && inBox(SEAR_REGION, o.x, o.y));
  assert.ok(chest && chest.tag === "searmouth" && chest.x === HEART_CHEST.x, "the chest at the bottom");
  assert.equal(CHESTS["searmouth"]!.loot.reduce((n, d) => n + d.weight, 0), 128, "whose table never comes up empty");
  const below = [throat, galleries, heart].flatMap((m) => m.monsters.filter((s) => inBox(SEAR_REGION, s.x, s.y)));
  assert.ok(below.length >= 20, `the mountain is lived in (${below.length})`);
  for (const s of below) {
    const def = MONSTER_BY_KEY.get(s.monster)!;
    const level = levelOf(def);
    assert.ok(level >= 45 && level <= 75, `${s.monster} is level ${level}, in the band 45–75 (PLAN §8.5)`);
    assert.ok(def.aggro > 0, `${s.monster} starts fights`);
    const map = stack.planes.get(s.plane ?? 0)!;
    assert.ok(open(map, s.x, s.y) || map.objects.some((o) => o.x === s.x && o.y === s.y && o.plane === s.plane), `${s.monster} at ${s.x},${s.y} stands on a room's floor`);
  }
  assert.ok(heart.monsters.some((s) => s.monster === "sear_drake" && inBox(SEAR_REGION, s.x, s.y)), "and the drake keeps the heart");
  for (const k of ["sear_bat", "basalt_crawler", "ash_wight", "sear_drake"]) {
    const def = MONSTER_BY_KEY.get(k)!;
    assert.ok(def.drops.always?.some((d) => d.item === "bones"), `${k} leaves bones`);
    assert.ok(def.shape && def.colors.length === 2, `${k} stands on a shape the bestiary has, in its own colours`);
  }
  assert.equal(areaAt(2400, 2594, THROAT_PLANE).key, "searmouth", "below the mountain is the Searmouth");
  assert.equal(areaAt(2400, 2594, 0).key, "mountsear", "the control: above it is the mountain");
  assert.equal(areaAt(SQUARE.x, SQUARE.y).key, "tarhollow");
});

test("the people of the isle talk, the store keeper's talk offers the trade, the ferryman offers the crossing home, and the map knows the isle", () => {
  const people = new Set(ground.monsters.filter((s) => inBox(SABLEWOOD, s.x, s.y)).map((s) => s.monster).filter((k) => MONSTER_BY_KEY.get(k)!.person));
  assert.ok(people.size >= 5, `${people.size} kinds of people`);
  for (const k of people) {
    const def = MONSTER_BY_KEY.get(k)!;
    assert.ok(def.talk && DIALOGUE[def.talk], `${k} has something to say`);
    if (def.shop) assert.ok(DIALOGUE[def.talk!]!["start"]!.options!.some((o) => o.act === "shop"), `${k} offers the trade`);
  }
  const home = DIALOGUE["ferryman_isle"]!["start"]!.options!.find((o) => o.do?.some((e) => "travel" in e && e.travel === "brinehaven"));
  assert.ok(home && home.do!.some((e) => "take" in e && e.take === "coins"), "the isle's ferryman takes the fare and crosses back");
  assert.ok(TARHOLLOW_LABELS.some((l) => l.name === "Tarhollow" && inBox(VILLAGE, l.x, l.y)), "the map names the village");
  assert.ok(MAP_MARKS.some((m) => m.icon === "ferry" && inBox(LANDING_ROOT, m.x, m.y)), "and marks the landing");
  assert.ok(MAP_MARKS.some((m) => m.icon === "mine" && m.x === SEARMOUTH.x), "and the mouth");
  assert.ok(MAP_EXITS.some((e) => e.name.includes("Brinehaven") && e.x === SABLEWOOD.x1 && e.side === "e"), "the ferry home leaves the isle's east edge");
});
