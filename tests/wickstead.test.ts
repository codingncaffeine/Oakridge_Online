// Wickstead (PLAN §7.6, Wave 1's third site): that it stands where the plan puts it, that building it
// changes nothing in the district, the hamlet or the city it is built beside, that the West Road runs
// in from the district's edge to the square and the Coast Road out, that the Sound is water at the
// sea's level with the shore above it and the beck coming down to it, that everything its card
// promises stands in the village, and that its people talk.
import assert from "node:assert/strict";
import { test } from "node:test";
import { DEEP_REGION } from "../src/shared/ashbarrow.ts";
import { DEEPDELVE_SITE } from "../src/shared/deepdelve.ts";
import { ADIT_REGION } from "../src/shared/adit.ts";
import { KILNHOLD_SITE } from "../src/shared/kilnhold.ts";
import { SABLEWOOD } from "../src/shared/tarhollow.ts";
import { BLOCKED } from "../src/shared/collision.ts";
import { DIALOGUE } from "../src/shared/dialogue.ts";
import { RESOURCES } from "../src/shared/gathering.ts";
import { SEA_CORNER, soundShore } from "../src/shared/heartland.ts";
import { item } from "../src/shared/items.ts";
import {
  builtBounds, builtRegions, cornerHeight, indoorsAt, OVERLAY_PATH, OVERLAY_WATER, overlayAt, regionId, ROOF_KEEP, ROOF_SLATE, roofAt,
  UNDERLAY_FOREST, UNDERLAY_SAND, underlayAt, type WorldMap,
} from "../src/shared/map.ts";
import { levelOf, MONSTER_BY_KEY } from "../src/shared/monsters.ts";
import { areaAt, buildOakridge, DISTRICT, MAP_EXITS, MAP_LABELS, OAKRIDGE_SEED } from "../src/shared/oakridge.ts";
import { findPath } from "../src/shared/pathfind.ts";
import { SHOPS } from "../src/shared/shops.ts";
import { STATION_OF } from "../src/shared/stations.ts";
import { STONECOTE } from "../src/shared/stonecote.ts";
import { BRINEHAVEN } from "../src/shared/brinehaven.ts";
import { BEND, THORNBURY } from "../src/shared/thornbury.ts";
import {
  ALDER_SHORE, BANK, BECK, COAST_EXIT, FOOTHILLS, GARDEN, INN, JETTY, LOCKUP, MANOR, NETS, SOUND, SPRING, SQUARE, VILLAGE, WICKSTEAD,
  WICKSTEAD_LABELS,
} from "../src/shared/wickstead.ts";
import { alongPolyline, inBox } from "../src/shared/worldgen.ts";

const stack = buildOakridge(OAKRIDGE_SEED);
const ground = stack.planes.get(0)!;
const onSite = ground.objects.filter((o) => inBox(WICKSTEAD, o.x, o.y));
const inVillage = onSite.filter((o) => inBox(VILLAGE, o.x, o.y));
const open = (map: WorldMap, x: number, y: number) => (map.collision.get(x, y) & BLOCKED) === 0;
const key = (x: number, y: number) => y * 8192 + x;
const sea = cornerHeight(ground, SEA_CORNER.x, SEA_CORNER.y);
const isSound = (x: number, y: number) => x + 0.5 < soundShore(y);
/** The ground the earlier sites own: the district, the hamlet, the city and the bend. */
const theirs = (x: number, y: number) => inBox(DISTRICT, x, y) || inBox(STONECOTE, x, y) || inBox(THORNBURY, x, y) || inBox(BEND, x, y);

test("the site is regions 44–48 × 50–51 and the foothills 45–46 × 52, the Sound's two of them water, and nothing beyond", () => {
  const ids = new Set(builtRegions(ground).map((r) => regionId(r.rx, r.ry)));
  for (let rx = 44; rx <= 48; rx++) for (const ry of [50, 51]) assert.ok(ids.has(regionId(rx, ry)), `region ${rx},${ry} is built`);
  for (const rx of [45, 46]) assert.ok(ids.has(regionId(rx, 52)), `the foothills' region ${rx},52 is built`);
  for (const [rx, ry] of [[43, 50], [43, 51], [47, 49], [48, 49], [44, 52], [47, 52], [48, 52], [45, 56], [46, 56]]) assert.ok(!ids.has(regionId(rx!, ry!)), `region ${rx},${ry} is not`);
  assert.equal(builtRegions(ground).length, 88, "the district's nine, Stonecote's six, Thornbury's five, Wickstead's twelve, Brinehaven's twelve, Kilnhold's twelve and the isle's twenty");
  assert.deepEqual(builtBounds(ground), { x0: SABLEWOOD.x0, y0: SABLEWOOD.y0, x1: KILNHOLD_SITE.x1, y1: THORNBURY.y1 });
  assert.ok(onSite.length > 600, `the site has things standing on it (${onSite.length})`);
  // The jetty's planks are path laid over the water, and its rails stand on them; everything else is water.
  let water = 0, planks = 0;
  for (let y = SOUND.y0; y <= SOUND.y1; y++) {
    for (let x = SOUND.x0; x <= SOUND.x1; x++) {
      if (overlayAt(ground, x, y) === OVERLAY_WATER) water++;
      else if (inBox(JETTY, x, y) && overlayAt(ground, x, y) === OVERLAY_PATH) planks++;
    }
  }
  assert.equal(water + planks, (SOUND.x1 - SOUND.x0 + 1) * (SOUND.y1 - SOUND.y0 + 1), `the Sound's regions are water end to end but for the jetty (${planks} planks)`);
  assert.ok(planks >= 4, "which reaches into them");
  assert.equal(onSite.filter((o) => inBox(SOUND, o.x, o.y) && !inBox(JETTY, o.x, o.y)).length, 0, "with nothing standing in them but the jetty's rails");
});

/**
 * ⛔ The seam. Wickstead is built last on the same builder as the district, Stonecote and Thornbury,
 * and shares the district's west column of corners. Everything the three of them hold — every corner
 * height, every tile, every object on every plane, every creature, every water and every item lying
 * about — must be exactly what it is when the world is built without the village, or an approved site
 * changed without anyone building it. The control: the corners a tile past the seam, and the regions
 * beyond it, exist only in the build with Wickstead in it.
 */
test("building Wickstead changes nothing in the district, Stonecote or Thornbury, on any plane", () => {
  const without = buildOakridge(OAKRIDGE_SEED, { wickstead: false });
  const alone = without.planes.get(0)!;
  assert.equal(builtRegions(alone).length, 52, "the control build is the district, the hamlet, the city, Kilnhold and the isle");
  assert.deepEqual([...without.planes.keys()].sort(), [...stack.planes.keys()].sort(), "the same planes");
  for (const [plane, before] of without.planes) {
    const after = stack.planes.get(plane)!;
    for (const r of builtRegions(before).filter((r) => !inBox(KILNHOLD_SITE, r.x0, r.y0) && !inBox(SABLEWOOD, r.x0, r.y0) && !inBox(DEEPDELVE_SITE, r.x0, r.y0))) {
      const both = after.regions.get(regionId(r.rx, r.ry))!;
      for (const field of ["heights", "underlay", "overlay", "indoors", "roofs"] as const) {
        assert.deepEqual([...both[field]], [...r[field]], `plane ${plane}, region ${r.rx},${r.ry}: ${field} unchanged`);
      }
    }
    const objects = (m: WorldMap) => m.objects.filter((o) => theirs(o.x, o.y) && !(o.plane < 0 && (inBox(ADIT_REGION, o.x, o.y) || inBox(DEEP_REGION, o.x, o.y)))).map((o) => `${o.id}:${o.kind}:${o.x},${o.y}:${o.side}:${o.tag ?? ""}`).join("|");
    assert.equal(objects(after), objects(before), `plane ${plane}: their objects, with the same ids`);
    assert.deepEqual(after.monsters.filter((s) => theirs(s.x, s.y)), before.monsters.filter((s) => theirs(s.x, s.y)), `plane ${plane}: and their creatures`);
    assert.deepEqual(after.spawns.filter((s) => theirs(s.x, s.y)), before.spawns.filter((s) => theirs(s.x, s.y)), `plane ${plane}: and what lies about`);
    assert.deepEqual(after.fishing.filter((w) => theirs(w.tiles[0]!.x, w.tiles[0]!.y)), before.fishing.filter((w) => theirs(w.tiles[0]!.x, w.tiles[0]!.y)), `plane ${plane}: and their waters`);
  }
  // The district's column of corners at x 3136 is the district's, written by it and left alone.
  for (let cy = DISTRICT.y0; cy <= DISTRICT.y1 + 1; cy++) {
    assert.equal(cornerHeight(ground, DISTRICT.x0, cy), cornerHeight(alone, DISTRICT.x0, cy), `corner ${DISTRICT.x0},${cy} is the district's`);
  }
  // The controls: the checks above can see a difference, because a tile past the seam is Wickstead's own.
  assert.ok(ground.regions.has(regionId(48, 50)) && !alone.regions.has(regionId(48, 50)), "the region west of the district exists only with Wickstead built");
  let differs = 0;
  for (let cy = WICKSTEAD.y0; cy <= WICKSTEAD.y1 + 1; cy++) if (cornerHeight(ground, DISTRICT.x0 - 1, cy) !== cornerHeight(alone, DISTRICT.x0 - 1, cy)) differs++;
  assert.ok(differs > 100, `the control: the column a tile past the seam is written by Wickstead alone (${differs} corners differ)`);
  assert.ok(ground.objects.length > alone.objects.length + 500, "and the plane gained the village");
});

test("the ground meets the district's without a step at the seam", () => {
  for (let cy = WICKSTEAD.y0; cy <= WICKSTEAD.y1 + 1; cy++) {
    const step = Math.abs(cornerHeight(ground, DISTRICT.x0 - 1, cy) - cornerHeight(ground, DISTRICT.x0, cy));
    assert.ok(step < 1e-6, `corner ${DISTRICT.x0 - 1},${cy} steps ${step.toFixed(3)} from the seam`);
  }
  // The control: twelve columns in, the ground is its own and does move.
  let moves = 0;
  for (let cy = WICKSTEAD.y0; cy <= WICKSTEAD.y1; cy++) if (Math.abs(cornerHeight(ground, DISTRICT.x0 - 12, cy) - cornerHeight(ground, DISTRICT.x0, cy)) > 0.05) moves++;
  assert.ok(moves > 10, `the control: twelve columns in, the ground has gone its own way on ${moves} rows`);
  // And the wood does not stop at the line: the forest floor is on both sides of it.
  let forest = 0;
  for (let y = 3232; y <= 3327; y++) if (underlayAt(ground, DISTRICT.x0, y) === UNDERLAY_FOREST && underlayAt(ground, DISTRICT.x0 - 1, y) === UNDERLAY_FOREST) forest++;
  assert.ok(forest > 60, `the Oakenshaw's floor carries on over the seam (${forest} rows of it)`);
});

test("the West Road runs in from the district's edge to the square and the jetty, and the Coast Road out at the south edge", () => {
  assert.equal(overlayAt(ground, DISTRICT.x0, 3236), OVERLAY_PATH, "the district's road reaches its west edge");
  assert.equal(overlayAt(ground, DISTRICT.x0 - 1, 3236), OVERLAY_PATH, "and carries on over the seam");
  // One connected run of path from the seam to the square, the jetty, the bank's door, the manor's gate and the exit.
  const seen = new Set<number>();
  const queue: Array<[number, number]> = [[DISTRICT.x0 - 1, 3236]];
  seen.add(key(DISTRICT.x0 - 1, 3236));
  while (queue.length > 0) {
    const [x, y] = queue.shift()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx, ny = y + dy;
      if (seen.has(key(nx, ny)) || !inBox(WICKSTEAD, nx, ny) || overlayAt(ground, nx, ny) !== OVERLAY_PATH) continue;
      seen.add(key(nx, ny));
      queue.push([nx, ny]);
    }
  }
  assert.ok(seen.has(key(SQUARE.x, SQUARE.y)), "the path reaches the square");
  assert.ok(seen.has(key(JETTY.x0 + 2, JETTY.y0)), "and the jetty");
  assert.ok(seen.has(key(BANK.x0 + 4, BANK.y0 - 1)), "and the bank's door");
  assert.ok(seen.has(key(2936, GARDEN.y0 - 1)), "and the manor's gate");
  assert.equal(overlayAt(ground, COAST_EXIT.x, COAST_EXIT.y), OVERLAY_PATH, `the Coast Road is path where it leaves the site at ${COAST_EXIT.x},${COAST_EXIT.y}`);
  assert.ok(seen.has(key(COAST_EXIT.x, COAST_EXIT.y)), "and the path runs unbroken to it");
  assert.ok(!MAP_EXITS.some((e) => e.x === DISTRICT.x0), "the map no longer calls the district's west edge an exit");
  assert.ok(!MAP_EXITS.some((e) => e.x === COAST_EXIT.x && e.y === COAST_EXIT.y), "nor the village's south edge: the road runs on into Brinehaven");
  // And it can all be walked, in legs (the pathfinder's window is 128 tiles across).
  const legs: Array<[[number, number], [number, number], string]> = [
    [[3140, 3236], [3100, 3244], "west out of the district through the wood"],
    [[3100, 3244], [3060, 3258], "and out of it"],
    [[3060, 3258], [3016, 3272], "on across the open country"],
    [[3016, 3272], [2980, 3283], "past the foothill wood"],
    [[2980, 3283], [2916, 3290], "and into the square"],
    [[2916, 3290], [JETTY.x0 + 1, JETTY.y0], "out along the jetty"],
    [[SQUARE.x, SQUARE.y], [BANK.x0 + 4, BANK.y0 - 1], "to the bank's door"],
    [[SQUARE.x, SQUARE.y], [2936, GARDEN.y0 - 1], "to the manor's gate"],
    [[SQUARE.x, SQUARE.y], [LOCKUP.x0 + 2, LOCKUP.y1 + 1], "to the lock-up's door"],
    [[SQUARE.x, SQUARE.y], [2893, 3240], "south on the Coast Road"],
    [[2893, 3240], [COAST_EXIT.x, COAST_EXIT.y], "and out at the south edge"],
  ];
  for (const [[ax, ay], [bx, by], what] of legs) {
    assert.ok(findPath(ground.collision, ax, ay, bx, by).length > 0, `${what}: ${ax},${ay} to ${bx},${by} is walkable`);
  }
});

test("the Sunder Sound is water at the sea's level west of the shore, the shore stands above it, and the beck comes down to it", () => {
  assert.ok(sea < 0, `the sea's level is read off the district's own sea (${sea.toFixed(2)})`);
  let water = 0, sand = 0;
  for (let y = WICKSTEAD.y0; y <= WICKSTEAD.y1; y++) {
    for (let x = WICKSTEAD.x0; x <= 2900; x++) {
      if (isSound(x, y)) {
        water++;
        if (inBox(JETTY, x, y) && overlayAt(ground, x, y) === OVERLAY_PATH) continue;
        assert.equal(overlayAt(ground, x, y), OVERLAY_WATER, `${x},${y} west of the shore is water`);
        assert.ok(!open(ground, x, y), "and cannot be walked");
        for (const [cx, cy] of [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]]) {
          // A corner the jetty's deck shares stands with the deck; every other water corner is at the sea.
          if ([[cx! - 1, cy! - 1], [cx!, cy! - 1], [cx! - 1, cy!], [cx!, cy!]].some(([tx, ty]) => inBox(JETTY, tx!, ty!) && overlayAt(ground, tx!, ty!) === OVERLAY_PATH)) continue;
          assert.ok(Math.abs(cornerHeight(ground, cx!, cy!) - sea) < 1e-6, `water corner ${cx},${cy} is at the sea's level`);
        }
      } else if (overlayAt(ground, x, y) !== OVERLAY_WATER) {
        if (underlayAt(ground, x, y) === UNDERLAY_SAND) sand++;
        // A land tile beside the water is not below it.
        if (isSound(x - 1, y)) {
          for (const cy of [y, y + 1]) assert.ok(cornerHeight(ground, x + 1, cy) >= sea - 1e-6, `the shore at ${x},${y} is not below the water`);
        }
      }
    }
  }
  assert.ok(water > 60 * 128, `the Sound is wide (${water} tiles of it on the site)`);
  assert.ok(sand > 200, `with sand along its shore (${sand} tiles)`);
  // The beck: water all the way along its line, from the north edge down to the Sound, its level falling as it goes.
  const levels: number[] = [];
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    // A point at `t` of the line's length: walked along it.
    let want = 0;
    for (let j = 1; j < BECK.length; j++) want += Math.hypot(BECK[j]![0] - BECK[j - 1]![0], BECK[j]![1] - BECK[j - 1]![1]);
    want *= t;
    let px = BECK[0]![0], py = BECK[0]![1];
    for (let j = 1; j < BECK.length; j++) {
      const len = Math.hypot(BECK[j]![0] - BECK[j - 1]![0], BECK[j]![1] - BECK[j - 1]![1]);
      if (want <= len) { px = BECK[j - 1]![0] + (BECK[j]![0] - BECK[j - 1]![0]) * (want / len); py = BECK[j - 1]![1] + (BECK[j]![1] - BECK[j - 1]![1]) * (want / len); break; }
      want -= len;
      px = BECK[j]![0]; py = BECK[j]![1];
    }
    const x = Math.floor(px), y = Math.floor(py);
    assert.equal(overlayAt(ground, x, y), OVERLAY_WATER, `the beck is water at ${x},${y} (${(t * 100).toFixed(0)}% of the way up)`);
    levels.push(cornerHeight(ground, x, y));
  }
  assert.ok(levels[20]! > levels[0]! + 1.5, `the beck comes down from its source (${levels[20]!.toFixed(2)}) to the Sound (${levels[0]!.toFixed(2)})`);
  for (let i = 1; i < levels.length; i++) assert.ok(levels[i]! >= levels[i - 1]! - 0.3, `it never runs uphill (${levels[i - 1]!.toFixed(2)} then ${levels[i]!.toFixed(2)})`);
  // The beck's water joins the Sound's: one connected body of water from its source to the open sea.
  const seen = new Set<number>();
  const queue: Array<[number, number]> = [[2934, 3326]];
  assert.equal(overlayAt(ground, 2934, 3326), OVERLAY_WATER, "the source is water");
  seen.add(key(2934, 3326));
  let reachedSea = false;
  while (queue.length > 0 && !reachedSea) {
    const [x, y] = queue.shift()!;
    if (isSound(x, y)) reachedSea = true;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx, ny = y + dy;
      if (seen.has(key(nx, ny)) || !(inBox(WICKSTEAD, nx, ny) || inBox(FOOTHILLS, nx, ny)) || overlayAt(ground, nx, ny) !== OVERLAY_WATER) continue;
      seen.add(key(nx, ny));
      queue.push([nx, ny]);
    }
  }
  assert.ok(reachedSea, "and the beck reaches the Sound");
  // The foothills: the ground climbs away north of the village, going to rock, and the spring is up in it.
  assert.ok(cornerHeight(ground, 2944, FOOTHILLS.y1) > cornerHeight(ground, SQUARE.x, SQUARE.y) + 4, "the Greycaps' foot stands well above the square");
  assert.ok(ground.objects.filter((o) => o.kind === "rock" && inBox(FOOTHILLS, o.x, o.y)).length >= 20, "with rock on it");
  assert.equal(overlayAt(ground, SPRING.x, SPRING.y), OVERLAY_WATER, "and the spring is water");
  assert.equal(areaAt(2944, 3370).key, "foothills", "with the wild's tune");
  // The control: the beck is not the Sound. A tile on its line halfway up is water that is not west of the shore.
  const mid = alongPolyline(2912, 3312, BECK);
  assert.ok(mid.d < 1 && !isSound(2912, 3312) && overlayAt(ground, 2912, 3312) === OVERLAY_WATER, "the control: the beck's water stands east of the shore");
});

test("everything the plan's card for Wickstead promises stands in the village", () => {
  const kinds = new Set(inVillage.map((o) => o.kind));
  for (const kind of ["bank_booth", "counter", "range", "well", "signpost", "stairs", "fence", "gate", "barrel", "crate", "door", "wall_window"] as const) {
    assert.ok(kinds.has(kind), `the village has a ${kind}`);
  }
  // The bank: a row of booths inside it, two bankers, and a slate roof.
  const booths = inVillage.filter((o) => o.kind === "bank_booth");
  assert.ok(booths.length >= 4 && booths.every((o) => inBox(BANK, o.x, o.y)) && new Set(booths.map((o) => o.y)).size === 1, `a row of booths in the bank (${booths.length})`);
  assert.equal(ground.monsters.filter((s) => s.monster === "banker" && inBox(BANK, s.x, s.y)).length, 2, "two bankers behind them");
  assert.equal(roofAt(ground, BANK.x0 + 2, BANK.y0 + 2), ROOF_SLATE, "under slate");
  // The net shop: counters that name it, a keeper who keeps it, and the tools every water on the coast needs.
  const counters = inVillage.filter((o) => STATION_OF[o.kind] === "shop");
  assert.ok(counters.length >= 3 && counters.every((o) => o.tag === "wickstead_nets" && inBox(NETS, o.x, o.y)), "the counters are the net shop's");
  const shop = SHOPS.wickstead_nets!;
  assert.ok(shop, "which is a shop");
  for (const k of ["fishing_net", "fishing_rod", "bait", "creel", "harpoon"]) assert.ok(shop.stock.some((l) => l.id === item(k).id && l.count > 0), `it sells ${k}`);
  for (const k of ["raw_grayling", "raw_redfin"]) assert.ok(shop.stock.some((l) => l.id === item(k).id), `and buys ${k}`);
  const keeper = ground.monsters.find((s) => MONSTER_BY_KEY.get(s.monster)?.shop === "wickstead_nets");
  assert.ok(keeper && inBox(NETS, keeper.x, keeper.y), "and the keeper is in it");
  // The inn: two storeys, a range, and the stair going both ways.
  assert.ok(inVillage.some((o) => o.kind === "range" && inBox(INN, o.x, o.y)), "a range in the inn");
  const innStair = inVillage.find((o) => o.kind === "stairs" && inBox(INN, o.x, o.y));
  const up = stack.planes.get(1)!;
  assert.ok(innStair && innStair.to === 1 && up.objects.some((o) => o.kind === "stairs" && o.x === innStair.x && o.y === innStair.y && o.to === 0), "a stair up in the inn that comes back down");
  // The manor: two storeys of slate inside a garden wall with one gate, on ground higher than the square.
  assert.ok(indoorsAt(up, MANOR.x0 + 3, MANOR.y0 + 3) > 0, "the manor has an upper floor");
  assert.equal(roofAt(ground, MANOR.x0 + 3, MANOR.y0 + 3), ROOF_SLATE, "under slate");
  const gates = inVillage.filter((o) => o.kind === "gate");
  assert.equal(gates.filter((o) => inBox(GARDEN, o.x, o.y)).length, 1, "one gate in the garden wall");
  const rails = inVillage.filter((o) => o.kind === "fence" && inBox(GARDEN, o.x, o.y) && (o.x === GARDEN.x0 || o.x === GARDEN.x1 || o.y === GARDEN.y0 || o.y === GARDEN.y1));
  assert.ok(rails.length >= 2 * (GARDEN.x1 - GARDEN.x0 + 1) + 2 * (GARDEN.y1 - GARDEN.y0 + 1) - 2, `and a wall the rest of the way round (${rails.length} lengths)`);
  assert.ok(cornerHeight(ground, MANOR.x0 + 4, MANOR.y0 + 4) > cornerHeight(ground, SQUARE.x, SQUARE.y) + 1, "on the rise above the square");
  assert.ok(ground.monsters.some((s) => s.monster === "squire" && inBox(MANOR, s.x, s.y)), "with the squire in it");
  // The lock-up: arrow-slit stone under a flat roof, one door, and the constable outside it.
  for (let y = LOCKUP.y0; y <= LOCKUP.y1; y++) for (let x = LOCKUP.x0; x <= LOCKUP.x1; x++) assert.equal(roofAt(ground, x, y), ROOF_KEEP, `the lock-up's roof at ${x},${y}`);
  assert.ok(inVillage.some((o) => o.kind === "wall_window" && o.tag === "keep" && inBox(LOCKUP, o.x, o.y)), "a barred window in its wall");
  assert.equal(inVillage.filter((o) => o.kind === "door" && inBox(LOCKUP, o.x, o.y)).length, 1, "one door");
  const constable = ground.monsters.find((s) => s.monster === "constable");
  assert.ok(constable && !inBox(LOCKUP, constable.x, constable.y) && Math.hypot(constable.x - LOCKUP.x0 - 2, constable.y - LOCKUP.y1) < 5, "and the constable outside it");
  // The jetty: planks over the water with a rail wherever they meet it, walkable from the shore.
  const deck: Array<{ x: number; y: number }> = [];
  for (let y = JETTY.y0; y <= JETTY.y1; y++) for (let x = JETTY.x0; x <= JETTY.x1; x++) if (overlayAt(ground, x, y) === OVERLAY_PATH && isSound(x, y)) deck.push({ x, y });
  assert.ok(deck.length >= 12, `the jetty stands over the water (${deck.length} planks)`);
  for (const { x, y } of deck) assert.ok(open(ground, x, y), `the plank at ${x},${y} can be stood on`);
  const railed = inVillage.filter((o) => o.kind === "fence" && deck.some((d) => d.x === o.x && d.y === o.y));
  assert.ok(railed.length >= deck.length, `with a rail on the open sides (${railed.length})`);
  assert.equal(overlayAt(ground, JETTY.x0 - 1, JETTY.y0), OVERLAY_WATER, "and open water past its end");
  // The well on the square, and the doors of ten buildings.
  assert.ok(inVillage.some((o) => o.kind === "well" && Math.hypot(o.x - SQUARE.x, o.y - SQUARE.y) <= 3.5), "the well on the square");
  const doors = inVillage.filter((o) => o.kind === "door" && o.plane === 0);
  assert.ok(doors.length >= 10, `${doors.length} doors: the bank, the shop, the inn, the manor, the lock-up and five cottages`);
  // The alder shore (§8.2): the first tree past oak, a dozen of them along the water, and nowhere else on the site but there.
  const alders = onSite.filter((o) => o.kind === "alder");
  assert.ok(alders.length >= 12, `alders along the shore (${alders.length})`);
  assert.ok(alders.every((o) => inBox(ALDER_SHORE, o.x, o.y)), "all of them on the shore");
  assert.equal(RESOURCES.alder!.yields.level, 25, "at Woodcutting 25");
  // The waters (§8.4): grayling to a rod in the beck, and net spots off the jetty; every spot has a bank to stand on.
  const waters = ground.fishing.filter((w) => w.tiles.every((t) => inBox(WICKSTEAD, t.x, t.y)));
  const beck = waters.find((w) => w.method === "angle");
  const jetty = waters.find((w) => w.method === "net");
  assert.ok(beck && beck.tiles.every((t) => !isSound(t.x, t.y) && alongPolyline(t.x + 0.5, t.y + 0.5, BECK).d < 2), "the rod water is the beck's");
  assert.ok(jetty && jetty.tiles.every((t) => isSound(t.x, t.y) && Math.abs(t.x - JETTY.x0 - 6) < 12 && Math.abs(t.y - JETTY.y0) < 5), "the net water is off the jetty");
  for (const w of waters) for (const t of w.tiles) {
    assert.equal(overlayAt(ground, t.x, t.y), OVERLAY_WATER, `the spot at ${t.x},${t.y} is on water`);
    assert.ok([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => open(ground, t.x + dx!, t.y + dy!)), `and has a bank to stand on`);
  }
});

test("the people of Wickstead: peopled, kept, each with something to say, and nothing that starts a fight near the square", () => {
  const spawned = ground.monsters.filter((s) => inBox(VILLAGE, s.x, s.y));
  const people = spawned.filter((s) => MONSTER_BY_KEY.get(s.monster)?.person);
  assert.ok(people.length >= 10, `the village is peopled (${people.length})`);
  for (const s of spawned) {
    const def = MONSTER_BY_KEY.get(s.monster)!;
    // People, and the hens and rats about their doors: nothing that would start a fight, or be worth one.
    assert.ok(def.person || (def.aggro === 0 && levelOf(def) <= 3), `${def.name} at ${s.x},${s.y} is a person or a farmyard animal: nothing else lives in the village`);
    if (def.person) assert.ok(def.talk && DIALOGUE[def.talk], `${def.name} has something to say`);
  }
  for (const k of ["banker", "netmaker", "innkeeper_wickstead", "squire", "constable", "fisher", "fisher_woman"]) {
    assert.ok(people.some((s) => s.monster === k), `${k} is in the village`);
  }
  for (const k of ["netmaker", "innkeeper_wickstead", "squire", "constable", "fisher", "fisher_woman"]) {
    const def = MONSTER_BY_KEY.get(k)!;
    for (const [slot, w] of Object.entries(def.wear ?? {})) assert.equal(item(w).equip?.slot, slot, `${k} wears ${w} in the ${slot} slot`);
  }
  // Nothing that starts a fight within forty tiles of the square; wolves in the woods, a long way off.
  let nearest = Infinity;
  for (const s of ground.monsters) {
    const def = MONSTER_BY_KEY.get(s.monster)!;
    if (!inBox(WICKSTEAD, s.x, s.y) || def.person || def.aggro === 0) continue;
    nearest = Math.min(nearest, Math.hypot(s.x - SQUARE.x, s.y - SQUARE.y));
  }
  assert.ok(nearest > 40, `the nearest thing that would start a fight is ${nearest.toFixed(0)} tiles from the square`);
  assert.ok(ground.monsters.some((s) => s.monster === "grey_wolf" && inBox(WICKSTEAD, s.x, s.y)), "the control: there are wolves on the site");
  assert.ok(ground.monsters.some((s) => s.monster === "cow" && inBox(WICKSTEAD, s.x, s.y)), "and cows in the pen");
  // Music: the village, the water, the road between, and the district's own wood is still the district's.
  assert.equal(areaAt(SQUARE.x, SQUARE.y).key, "wickstead");
  assert.equal(areaAt(2850, 3250).key, "sound");
  assert.equal(areaAt(3040, 3260).key, "westroad");
  assert.equal(areaAt(DISTRICT.x0 + 4, 3300).key, "oakenshaw", "the control: over the seam it is the district's wood");
  // The map: every name the site adds is on the site.
  for (const label of WICKSTEAD_LABELS) {
    assert.ok(MAP_LABELS.includes(label), `"${label.name}" is on the map`);
    assert.ok(inBox(WICKSTEAD, label.x, label.y) || inBox(FOOTHILLS, label.x, label.y), `at ${label.x},${label.y}, on the site`);
  }
});
