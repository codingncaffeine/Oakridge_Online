// Brinehaven (PLAN §7.6, Wave 1's fourth site, the port): that it stands where the plan puts it, that
// building it changes nothing in the district, the hamlet, the city or the village it is built after,
// that the Coast Road runs in over Wickstead's edge to the square, the quay, the berths and the mole,
// that the Sound and the sea are water at the sea's level with the headland above them, that
// everything its card promises stands in the port, and that its people talk.
import assert from "node:assert/strict";
import { test } from "node:test";
import { HARROW } from "../src/shared/harrow.ts";
import { SANDREACH_SITE } from "../src/shared/sandreach.ts";
import { inFenSites } from "../src/shared/sallowfen.ts";
import { DEEP_REGION } from "../src/shared/ashbarrow.ts";
import { DEEPDELVE_SITE } from "../src/shared/deepdelve.ts";
import { ADIT_REGION } from "../src/shared/adit.ts";
import { KILNHOLD_SITE } from "../src/shared/kilnhold.ts";
import { SABLEWOOD } from "../src/shared/tarhollow.ts";
import {
  BANK, BERTHS, BRINEHAVEN, BRINEHAVEN_EXITS, BRINEHAVEN_LABELS, FERRY_BERTH, HARBOUR, INN, isSound, isSouthSea, MOLE, MOORINGS,
  OFFICE, POTS, QUAY, ROAD_IN, SOUND, SOUTH_SEA, SQUARE, STOCKS, TOWN, WORKSHOP, YARD,
} from "../src/shared/brinehaven.ts";
import { BLOCKED } from "../src/shared/collision.ts";
import { DIALOGUE } from "../src/shared/dialogue.ts";
import { CATCHES } from "../src/shared/gathering.ts";
import { SEA_CORNER } from "../src/shared/heartland.ts";
import { item } from "../src/shared/items.ts";
import {
  builtBounds, builtRegions, cornerHeight, indoorsAt, OVERLAY_PATH, OVERLAY_WATER, overlayAt, regionId, ROOF_KEEP, ROOF_SLATE, roofAt,
  UNDERLAY_SAND, underlayAt, type WorldMap,
} from "../src/shared/map.ts";
import { levelOf, MONSTER_BY_KEY } from "../src/shared/monsters.ts";
import { areaAt, buildOakridge, DISTRICT, MAP_EXITS, MAP_LABELS, MAP_MARKS, OAKRIDGE_SEED } from "../src/shared/oakridge.ts";
import { findPath } from "../src/shared/pathfind.ts";
import { SHOPS } from "../src/shared/shops.ts";
import { STATION_OF } from "../src/shared/stations.ts";
import { THORNBURY } from "../src/shared/thornbury.ts";
import { COAST_EXIT, WICKSTEAD } from "../src/shared/wickstead.ts";
import { inBox } from "../src/shared/worldgen.ts";

const stack = buildOakridge(OAKRIDGE_SEED);
const ground = stack.planes.get(0)!;
const onSite = ground.objects.filter((o) => inBox(BRINEHAVEN, o.x, o.y));
const inPort = onSite.filter((o) => inBox(TOWN, o.x, o.y) || inBox(HARBOUR, o.x, o.y));
const open = (map: WorldMap, x: number, y: number) => (map.collision.get(x, y) & BLOCKED) === 0;
const key = (x: number, y: number) => y * 8192 + x;
const sea = cornerHeight(ground, SEA_CORNER.x, SEA_CORNER.y);
/** Whether a tile is one of the things standing over the water: a berth's planks or the mole. */
const overWater = (x: number, y: number) => BERTHS.some((b) => inBox(b, x, y)) || inBox(MOLE, x, y);
/** The ground the earlier sites own: everything built that is not this site. */
const theirs = (x: number, y: number) => !inBox(BRINEHAVEN, x, y) && !inBox(KILNHOLD_SITE, x, y) && !inBox(SABLEWOOD, x, y) && !inBox(DEEPDELVE_SITE, x, y) && !inBox(HARROW, x, y) && !inBox(SANDREACH_SITE, x, y) && !inFenSites(x, y);

test("the site is regions 44–46 × 46–49, the Sound's column and the sea's two regions water, and nothing beyond", () => {
  const ids = new Set(builtRegions(ground).map((r) => regionId(r.rx, r.ry)));
  for (let rx = 44; rx <= 46; rx++) for (let ry = 46; ry <= 49; ry++) assert.ok(ids.has(regionId(rx, ry)), `region ${rx},${ry} is built`);
  for (const [rx, ry] of [[43, 47], [43, 48], [47, 47], [47, 48], [47, 49], [44, 45], [45, 45], [46, 45]]) assert.ok(!ids.has(regionId(rx!, ry!)), `region ${rx},${ry} is not`);
  assert.equal(builtRegions(ground).length, 211, "the district's nine, Wave 1's thirty-five, Wave 2's thirty-two, Deepdelve's twelve, the Harrow's forty-five, Sandreach's thirty, and the Fen Road's twelve and the Sallowfen's thirty-six");
  assert.deepEqual(builtBounds(ground), { x0: SABLEWOOD.x0, y0: SABLEWOOD.y0, x1: SANDREACH_SITE.x1, y1: HARROW.y1 });
  assert.ok(onSite.length > 500, `the site has things standing on it (${onSite.length})`);
  // The Sound's column: water end to end but for the berths' planks and the mole, with nothing standing in it but their rails and the mole's wall.
  let water = 0, planks = 0;
  for (let y = SOUND.y0; y <= SOUND.y1; y++) {
    for (let x = SOUND.x0; x <= SOUND.x1; x++) {
      if (overlayAt(ground, x, y) === OVERLAY_WATER) water++;
      else if (overWater(x, y) && overlayAt(ground, x, y) === OVERLAY_PATH) planks++;
    }
  }
  assert.equal(water + planks, (SOUND.x1 - SOUND.x0 + 1) * (SOUND.y1 - SOUND.y0 + 1), `the Sound's column is water end to end but for the berths and the mole (${planks} tiles of them)`);
  assert.ok(planks >= 12, "which reach into it");
  const standing = onSite.filter((o) => inBox(SOUND, o.x, o.y) && !overWater(o.x, o.y));
  assert.deepEqual(standing, [], "and nothing stands in the Sound's column off them");
  // The sea south of the headland: its two regions are water end to end.
  for (let y = SOUTH_SEA.y0; y <= SOUTH_SEA.y1; y++) for (let x = SOUTH_SEA.x0; x <= SOUTH_SEA.x1; x++) assert.equal(overlayAt(ground, x, y), OVERLAY_WATER, `${x},${y} south of the headland is water`);
});

/**
 * ⛔ The seam. Brinehaven is built last on the same builder as the district and the three sites before
 * it, and shares Wickstead's south row of corners. Everything the four of them hold — every corner
 * height, every tile, every object on every plane, every creature, every water and every item lying
 * about — must be exactly what it is when the world is built without the port, or an approved site
 * changed without anyone building it. The control: the corners a row past the seam, and the regions
 * beyond it, exist only in the build with Brinehaven in it.
 */
test("building Brinehaven changes nothing in the district, Stonecote, Thornbury or Wickstead, on any plane", () => {
  const without = buildOakridge(OAKRIDGE_SEED, { brinehaven: false });
  const alone = without.planes.get(0)!;
  assert.equal(builtRegions(alone).length, 199, "the control build is everything but the port");
  assert.deepEqual([...without.planes.keys()].sort(), [...stack.planes.keys()].sort(), "the same planes");
  for (const [plane, before] of without.planes) {
    const after = stack.planes.get(plane)!;
    for (const r of builtRegions(before).filter((r) => !inBox(KILNHOLD_SITE, r.x0, r.y0) && !inBox(SABLEWOOD, r.x0, r.y0) && !inBox(DEEPDELVE_SITE, r.x0, r.y0) && !inBox(HARROW, r.x0, r.y0) && !inBox(SANDREACH_SITE, r.x0, r.y0) && !inFenSites(r.x0, r.y0))) {
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
  // Wickstead's row of corners at y 3200 is Wickstead's, written by it and left alone.
  for (let cx = WICKSTEAD.x0; cx <= WICKSTEAD.x1 + 1; cx++) {
    assert.equal(cornerHeight(ground, cx, WICKSTEAD.y0), cornerHeight(alone, cx, WICKSTEAD.y0), `corner ${cx},${WICKSTEAD.y0} is Wickstead's`);
  }
  // The controls: the checks above can see a difference, because a row past the seam is Brinehaven's own.
  assert.ok(ground.regions.has(regionId(45, 49)) && !alone.regions.has(regionId(45, 49)), "the region south of Wickstead exists only with Brinehaven built");
  let differs = 0;
  for (let cx = BRINEHAVEN.x0; cx <= BRINEHAVEN.x1 + 1; cx++) if (cornerHeight(ground, cx, WICKSTEAD.y0 - 1) !== cornerHeight(alone, cx, WICKSTEAD.y0 - 1)) differs++;
  assert.ok(differs > 100, `the control: the row a tile past the seam is written by Brinehaven alone (${differs} corners differ)`);
  assert.ok(ground.objects.length > alone.objects.length + 400, "and the plane gained the port");
});

test("the ground meets Wickstead's without a step at the seam, and the road runs on over it", () => {
  for (let cx = BRINEHAVEN.x0; cx <= BRINEHAVEN.x1 + 1; cx++) {
    const step = Math.abs(cornerHeight(ground, cx, WICKSTEAD.y0 - 1) - cornerHeight(ground, cx, WICKSTEAD.y0));
    assert.ok(step < 1e-6, `corner ${cx},${WICKSTEAD.y0 - 1} steps ${step.toFixed(3)} from the seam`);
  }
  // The control: twelve rows in, the ground is its own and does move.
  let moves = 0;
  for (let cx = BRINEHAVEN.x0; cx <= BRINEHAVEN.x1; cx++) if (Math.abs(cornerHeight(ground, cx, WICKSTEAD.y0 - 12) - cornerHeight(ground, cx, WICKSTEAD.y0)) > 0.05) moves++;
  assert.ok(moves > 10, `the control: twelve rows in, the ground has gone its own way on ${moves} columns`);
  // The Coast Road: path where Wickstead's stretch ends, and path on this side of the line.
  assert.equal(overlayAt(ground, COAST_EXIT.x, COAST_EXIT.y), OVERLAY_PATH, "Wickstead's road reaches its south edge");
  assert.equal(overlayAt(ground, ROAD_IN.x, ROAD_IN.y), OVERLAY_PATH, "and carries on over the seam");
});

test("the Coast Road runs in from Wickstead's edge to the square, the quay, the berths and the mole, and the map knows the port", () => {
  // One connected run of path from the seam to the square, every door on it, the berths and the mole.
  const seen = new Set<number>();
  const queue: Array<[number, number]> = [[ROAD_IN.x, ROAD_IN.y]];
  seen.add(key(ROAD_IN.x, ROAD_IN.y));
  while (queue.length > 0) {
    const [x, y] = queue.shift()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx, ny = y + dy;
      if (seen.has(key(nx, ny)) || !inBox(BRINEHAVEN, nx, ny) || overlayAt(ground, nx, ny) !== OVERLAY_PATH) continue;
      seen.add(key(nx, ny));
      queue.push([nx, ny]);
    }
  }
  assert.ok(seen.has(key(SQUARE.x, SQUARE.y)), "the path reaches the square");
  assert.ok(seen.has(key(BANK.x0 - 1, BANK.y0 + 3)), "and the bank's door");
  assert.ok(seen.has(key(INN.x0 - 1, INN.y0 + 4)), "and the Bell's");
  assert.ok(seen.has(key(POTS.x0 - 1, POTS.y0 + 3)), "and the shop's");
  assert.ok(seen.has(key(OFFICE.x0 - 1, OFFICE.y0 + 2)), "and the office's");
  assert.ok(seen.has(key(WORKSHOP.x0 - 1, WORKSHOP.y0 + 3)), "and the workshop's");
  for (const [i, berth] of BERTHS.entries()) assert.ok(seen.has(key(berth.x0 + 2, berth.y0)), `and berth ${i + 1}`);
  assert.ok(seen.has(key(MOLE.x0, MOLE.y0)), "and the end of the mole");
  // The ferry is the port's way out, on the map: its route leaves the built water west of the berth; Wickstead's Coast Road is no longer an edge.
  for (const exit of BRINEHAVEN_EXITS) assert.ok(MAP_EXITS.includes(exit), `the map knows "${exit.name}"`);
  assert.ok(BRINEHAVEN_EXITS.some((e) => e.y === FERRY_BERTH.y && e.x === BRINEHAVEN.x0 && e.side === "w"), "and it leaves the site's west edge on the berth's row");
  assert.equal(overlayAt(ground, BRINEHAVEN.x0, FERRY_BERTH.y), OVERLAY_WATER, "which is open water");
  assert.equal(overlayAt(ground, FERRY_BERTH.x, FERRY_BERTH.y), OVERLAY_PATH, "from a berth that is planks");
  assert.ok(!MAP_EXITS.some((e) => e.x === COAST_EXIT.x && e.y === COAST_EXIT.y), "the map no longer calls Wickstead's south edge an exit");
  assert.ok(MAP_MARKS.some((m) => m.icon === "ferry" && m.x === FERRY_BERTH.x), "and marks the berth");
  // And it can all be walked, in legs (the pathfinder's window is 128 tiles across).
  const legs: Array<[[number, number], [number, number], string]> = [
    [[ROAD_IN.x, ROAD_IN.y], [2896, 3160], "south over the seam"],
    [[2896, 3160], [2903, 3120], "down the corridor"],
    [[2903, 3120], [2909, 3080], "on toward the town"],
    [[2909, 3080], [SQUARE.x, SQUARE.y], "and into the square"],
    [[SQUARE.x, SQUARE.y], [BANK.x0 - 1, BANK.y0 + 3], "to the bank's door"],
    [[SQUARE.x, SQUARE.y], [INN.x0 - 1, INN.y0 + 4], "to the Bell's door"],
    [[SQUARE.x, SQUARE.y], [POTS.x0 - 1, POTS.y0 + 3], "to the shop's door"],
    [[SQUARE.x, SQUARE.y], [BERTHS[1]!.x0 + 1, BERTHS[1]!.y0], "out along the middle berth"],
    [[SQUARE.x, SQUARE.y], [MOLE.x0 + 1, MOLE.y1], "out along the mole"],
    [[SQUARE.x, SQUARE.y], [YARD.x0 - 1, 3018], "to the yard's gate"],
    [[SQUARE.x, SQUARE.y], [2943, 3044], "east to the pen's gate"],
  ];
  for (const [[ax, ay], [bx, by], what] of legs) {
    assert.deepEqual(findPath(ground.collision, ax, ay, bx, by).at(-1), { x: bx, y: by }, `${what}: ${ax},${ay} to ${bx},${by} is walkable`);
  }
});

test("the Sound and the sea are water at the sea's level, the headland stands above them, and the two waters are one", () => {
  assert.ok(sea < 0, `the sea's level is read off the district's own sea (${sea.toFixed(2)})`);
  let water = 0, sand = 0;
  for (let y = BRINEHAVEN.y0; y <= BRINEHAVEN.y1; y++) {
    for (let x = BRINEHAVEN.x0; x <= BRINEHAVEN.x1; x++) {
      if (isSound(x, y) || isSouthSea(x, y)) {
        water++;
        if (overWater(x, y)) continue;
        assert.equal(overlayAt(ground, x, y), OVERLAY_WATER, `${x},${y} beyond the shore is water`);
        assert.ok(!open(ground, x, y), "and cannot be walked");
        for (const [cx, cy] of [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]]) {
          // A corner a deck or the mole shares stands with it; every other water corner is at the sea.
          if ([[cx! - 1, cy! - 1], [cx!, cy! - 1], [cx! - 1, cy!], [cx!, cy!]].some(([tx, ty]) => overWater(tx!, ty!))) continue;
          assert.ok(Math.abs(cornerHeight(ground, cx!, cy!) - sea) < 1e-6, `water corner ${cx},${cy} is at the sea's level`);
        }
      } else if (overlayAt(ground, x, y) !== OVERLAY_WATER) {
        if (underlayAt(ground, x, y) === UNDERLAY_SAND) sand++;
        // A land tile beside the water is not below it.
        if (isSound(x - 1, y)) for (const cy of [y, y + 1]) assert.ok(cornerHeight(ground, x + 1, cy) >= sea - 1e-6, `the shore at ${x},${y} is not below the water`);
      }
    }
  }
  assert.ok(water > 20_000, `the water is wide (${water} tiles of it on the site)`);
  assert.ok(sand > 300, `with sand along both shores (${sand} tiles)`);
  // The headland: the square stands well above the water, and the quay a step above it.
  const square = cornerHeight(ground, SQUARE.x, SQUARE.y), quay = cornerHeight(ground, 2890, 3040);
  assert.ok(square > sea + 2, `the square stands above the sea (${(square - sea).toFixed(2)} up)`);
  assert.ok(quay > sea + 0.5 && quay < sea + 2, `the quay stands a step above the water (${(quay - sea).toFixed(2)} up)`);
  // The Sound and the sea are one body of water: a flood from the Sound's far side reaches the sea south of the town.
  const seen = new Set<number>();
  const queue: Array<[number, number]> = [[2830, 3100]];
  seen.add(key(2830, 3100));
  let reached = false;
  while (queue.length > 0 && !reached) {
    const [x, y] = queue.shift()!;
    if (x > 2950 && y < 3000) reached = true;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx, ny = y + dy;
      if (seen.has(key(nx, ny)) || !inBox(BRINEHAVEN, nx, ny) || overlayAt(ground, nx, ny) !== OVERLAY_WATER) continue;
      seen.add(key(nx, ny));
      queue.push([nx, ny]);
    }
  }
  assert.ok(reached, "the Sound runs round the headland into the open sea");
  // The control: the crab beds are not the Sound. A tile off the south beach is water east of the Sound's shore.
  assert.ok(!isSound(2920, 3006) && isSouthSea(2920, 3006) && overlayAt(ground, 2920, 3006) === OVERLAY_WATER, "the control: the sea's water stands east of the Sound's shore");
});

test("everything the plan's card for Brinehaven promises stands in the port", () => {
  const kinds = new Set(inPort.map((o) => o.kind));
  for (const kind of ["bank_booth", "counter", "range", "well", "signpost", "stairs", "fence", "field_gate", "barrel", "crate", "door", "wall_window", "boat", "stone_wall", "anvil"] as const) {
    assert.ok(kinds.has(kind), `the port has a ${kind}`);
  }
  // The bank: a row of booths inside it, two bankers, and a slate roof.
  const booths = inPort.filter((o) => o.kind === "bank_booth");
  assert.ok(booths.length >= 4 && booths.every((o) => inBox(BANK, o.x, o.y)) && new Set(booths.map((o) => o.y)).size === 1, `a row of booths in the bank (${booths.length})`);
  assert.equal(ground.monsters.filter((s) => s.monster === "banker" && inBox(BANK, s.x, s.y)).length, 2, "two bankers behind them");
  assert.equal(roofAt(ground, BANK.x0 + 2, BANK.y0 + 2), ROOF_SLATE, "under slate");
  // The shop: counters that name it, a keeper who keeps it, the creel for the beds outside, and it buys the catch.
  const counters = inPort.filter((o) => STATION_OF[o.kind] === "shop");
  assert.ok(counters.length >= 3 && counters.every((o) => o.tag === "brinehaven_pots" && inBox(POTS, o.x, o.y)), "the counters are the pot shop's");
  const shop = SHOPS.brinehaven_pots!;
  assert.ok(shop, "which is a shop");
  for (const k of ["creel", "fishing_net", "fishing_rod", "harpoon", "bait"]) assert.ok(shop.stock.some((l) => l.id === item(k).id && l.count > 0), `it sells ${k}`);
  for (const k of ["raw_bay_crab", "raw_grayling", "raw_sardine"]) assert.ok(shop.stock.some((l) => l.id === item(k).id), `and buys ${k}`);
  const keeper = ground.monsters.find((s) => MONSTER_BY_KEY.get(s.monster)?.shop === "brinehaven_pots");
  assert.ok(keeper && inBox(POTS, keeper.x, keeper.y), "and the keeper is in it");
  // The Bell: two storeys, a range, and the stair going both ways.
  assert.ok(inPort.some((o) => o.kind === "range" && inBox(INN, o.x, o.y)), "a range in the inn");
  const innStair = inPort.find((o) => o.kind === "stairs" && inBox(INN, o.x, o.y));
  const up = stack.planes.get(1)!;
  assert.ok(innStair && innStair.to === 1 && up.objects.some((o) => o.kind === "stairs" && o.x === innStair.x && o.y === innStair.y && o.to === 0), "a stair up in the inn that comes back down");
  assert.ok(indoorsAt(up, INN.x0 + 3, INN.y0 + 3) > 0, "and an upper floor");
  // The harbourmaster's office: arrow-slit stone under a flat roof, one door, and the man on the quay outside it.
  for (let y = OFFICE.y0; y <= OFFICE.y1; y++) for (let x = OFFICE.x0; x <= OFFICE.x1; x++) assert.equal(roofAt(ground, x, y), ROOF_KEEP, `the office's roof at ${x},${y}`);
  assert.ok(inPort.some((o) => o.kind === "wall_window" && o.tag === "keep" && inBox(OFFICE, o.x, o.y)), "a slit in its wall");
  assert.equal(inPort.filter((o) => o.kind === "door" && inBox(OFFICE, o.x, o.y)).length, 1, "one door");
  const master = ground.monsters.find((s) => s.monster === "harbourmaster");
  assert.ok(master && !inBox(OFFICE, master.x, master.y) && inBox(QUAY, master.x, master.y), "and the harbourmaster on the quay outside it");
  // The shipwright's yard: fenced, open on the quay side, the ferry on the stocks in it, and the shipwright at work by her workshop.
  const rails = inPort.filter((o) => o.kind === "fence" && inBox(YARD, o.x, o.y));
  assert.ok(rails.length >= 2 * (YARD.x1 - YARD.x0 + 1) + 2 * (YARD.y1 - YARD.y0 + 1) - 2, `a fence round the yard (${rails.length} lengths)`);
  assert.equal(inPort.filter((o) => (o.kind === "gate" || o.kind === "field_gate") && inBox(YARD, o.x, o.y)).length, 0, "with an open gap, not a gate");
  const hull = inPort.find((o) => o.kind === "boat" && o.tag === "stocks");
  assert.ok(hull && hull.x === STOCKS.x && hull.y === STOCKS.y && inBox(YARD, hull.x, hull.y), "the ferry's hull on the stocks in it");
  assert.ok(ground.monsters.some((s) => s.monster === "shipwright" && inBox(YARD, s.x, s.y)), "and the shipwright in the yard");
  assert.ok(inPort.some((o) => o.kind === "door" && inBox(WORKSHOP, o.x, o.y)), "her workshop behind it");
  // Three berths: planks over the water with a rail wherever they meet it, each walkable from the quay,
  // a boat lying to each: the two that were always there, and the ferry at the third since she was planked (Wave 2).
  for (const [i, berth] of BERTHS.entries()) {
    const deck: Array<{ x: number; y: number }> = [];
    for (let y = berth.y0; y <= berth.y1; y++) for (let x = berth.x0; x <= berth.x1; x++) if (overlayAt(ground, x, y) === OVERLAY_PATH && isSound(x, y)) deck.push({ x, y });
    assert.ok(deck.length >= 10, `berth ${i + 1} stands over the water (${deck.length} planks)`);
    for (const { x, y } of deck) assert.ok(open(ground, x, y), `its plank at ${x},${y} can be stood on`);
    const railed = onSite.filter((o) => o.kind === "fence" && deck.some((d) => d.x === o.x && d.y === o.y));
    assert.ok(railed.length >= deck.length, `with a rail on its open sides (${railed.length})`);
    assert.equal(overlayAt(ground, berth.x0 - 1, berth.y0), OVERLAY_WATER, "and open water past its end");
    const near = onSite.filter((o) => o.kind === "boat" && !o.tag && Math.abs(o.y - (berth.y0 + berth.y1) / 2) <= 3.5 && o.x >= berth.x0 && o.x <= berth.x1);
    assert.equal(near.length, 1, `berth ${i + 1} has a boat lying to it`);
  }
  const boats = onSite.filter((o) => o.kind === "boat" && !o.tag);
  assert.equal(boats.length, MOORINGS.length + 1, "three boats in the harbour: two moored, and the ferry");
  for (const boat of boats) assert.ok(isSound(boat.x, boat.y) && overlayAt(ground, boat.x, boat.y) === OVERLAY_WATER, `the boat at ${boat.x},${boat.y} is afloat`);
  assert.ok(ground.monsters.some((s) => s.monster === "ferryman" && Math.hypot(s.x - BERTHS[2]!.x1, s.y - BERTHS[2]!.y0) < 5), "and the ferryman at the third berth");
  // The mole: walkable stone out over the water, walled on its seaward side, with the sea past its end and to seaward.
  for (let y = MOLE.y0; y <= MOLE.y1; y++) for (let x = MOLE.x0; x <= MOLE.x1; x++) assert.ok(overlayAt(ground, x, y) === OVERLAY_PATH && open(ground, x, y), `the mole at ${x},${y} can be walked`);
  const moleWall = onSite.filter((o) => o.kind === "stone_wall" && o.tag === "mole");
  assert.ok(moleWall.length >= MOLE.x1 - MOLE.x0 + 1, `walled along its length (${moleWall.length})`);
  assert.equal(overlayAt(ground, MOLE.x0 - 1, MOLE.y0), OVERLAY_WATER, "and open water past its end");
  assert.equal(overlayAt(ground, MOLE.x0 + 4, MOLE.y0 - 1), OVERLAY_WATER, "and to seaward");
  // The quay: paved from the water to the doors.
  let paved = 0, quayTiles = 0;
  for (let y = QUAY.y0; y <= QUAY.y1; y++) {
    for (let x = QUAY.x0; x <= QUAY.x1; x++) {
      if (overlayAt(ground, x, y) === OVERLAY_WATER) continue;
      quayTiles++;
      if (overlayAt(ground, x, y) === OVERLAY_PATH) paved++;
    }
  }
  assert.equal(paved, quayTiles, `the quay is paved end to end (${paved} of ${quayTiles})`);
  // The well on the square, and the doors of twelve buildings.
  assert.ok(inPort.some((o) => o.kind === "well" && Math.hypot(o.x - SQUARE.x, o.y - SQUARE.y) <= 3.5), "the well on the square");
  const doors = inPort.filter((o) => o.kind === "door" && o.plane === 0);
  assert.ok(doors.length >= 12, `${doors.length} doors: the bank, the shop, the Bell, the office, the workshop, two warehouses and five cottages`);
  // The crab beds (§8.4): the creel's rung, in the sea off the south shore and nowhere else on the site; every bed has a bank to stand on.
  const waters = ground.fishing.filter((w) => w.tiles.every((t) => inBox(BRINEHAVEN, t.x, t.y)));
  assert.ok(waters.length >= 1 && waters.every((w) => w.method === "trap"), `the port's waters are creel beds (${waters.map((w) => w.method).join(", ")})`);
  const crab = CATCHES.trap.find((y) => y.item === "raw_bay_crab");
  assert.ok(crab && crab.level === 45, "which give bay crab at Fishing 45");
  for (const w of waters) {
    for (const t of w.tiles) {
      assert.equal(overlayAt(ground, t.x, t.y), OVERLAY_WATER, `the bed at ${t.x},${t.y} is on water`);
      assert.ok(t.y < TOWN.y0 + 4, "south of the town");
      assert.ok([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => open(ground, t.x + dx!, t.y + dy!)), "and has a bank to stand on");
    }
  }
});

test("the people of Brinehaven: peopled, kept, each with something to say, and nothing that starts a fight near the square", () => {
  const spawned = ground.monsters.filter((s) => inBox(TOWN, s.x, s.y) || inBox(HARBOUR, s.x, s.y));
  const people = spawned.filter((s) => MONSTER_BY_KEY.get(s.monster)?.person);
  assert.ok(people.length >= 12, `the port is peopled (${people.length})`);
  for (const s of spawned) {
    const def = MONSTER_BY_KEY.get(s.monster)!;
    // People, and the hens and rats about their doors: nothing that would start a fight, or be worth one.
    assert.ok(def.person || (def.aggro === 0 && levelOf(def) <= 3), `${def.name} at ${s.x},${s.y} is a person or a farmyard animal: nothing else lives in the town`);
    if (def.person) assert.ok(def.talk && DIALOGUE[def.talk], `${def.name} has something to say`);
  }
  for (const k of ["banker", "potmaker", "innkeeper_brinehaven", "harbourmaster", "shipwright", "ferryman", "dockhand", "dockhand_woman", "sailor"]) {
    assert.ok(people.some((s) => s.monster === k), `${k} is in the port`);
  }
  for (const k of ["potmaker", "innkeeper_brinehaven", "harbourmaster", "shipwright", "ferryman", "dockhand", "dockhand_woman", "sailor"]) {
    const def = MONSTER_BY_KEY.get(k)!;
    for (const [slot, w] of Object.entries(def.wear ?? {})) assert.equal(item(w).equip?.slot, slot, `${k} wears ${w} in the ${slot} slot`);
  }
  // Nothing that starts a fight within forty tiles of the square; wolves and spiders in the wood, a long way off.
  let nearest = Infinity;
  for (const s of ground.monsters) {
    const def = MONSTER_BY_KEY.get(s.monster)!;
    if (!inBox(BRINEHAVEN, s.x, s.y) || def.person || def.aggro === 0) continue;
    nearest = Math.min(nearest, Math.hypot(s.x - SQUARE.x, s.y - SQUARE.y));
  }
  assert.ok(nearest > 40, `the nearest thing that would start a fight is ${nearest.toFixed(0)} tiles from the square`);
  assert.ok(ground.monsters.some((s) => s.monster === "grey_wolf" && inBox(BRINEHAVEN, s.x, s.y)), "the control: there are wolves on the site");
  assert.ok(ground.monsters.some((s) => s.monster === "ram" && inBox(BRINEHAVEN, s.x, s.y)), "and sheep in the pen");
  // Music: the harbour, the town, the water, the road between, and over the seam it is Wickstead's shore.
  assert.equal(areaAt(SQUARE.x, SQUARE.y).key, "brinehaven");
  assert.equal(areaAt(BERTHS[1]!.x0 + 3, BERTHS[1]!.y0).key, "harbour");
  assert.equal(areaAt(2850, 3100).key, "sound");
  assert.equal(areaAt(2950, 2980).key, "opensea");
  assert.equal(areaAt(2900, 3150).key, "coastroad");
  assert.equal(areaAt(2892, 3210).key, "sound", "the control: over the seam it is Wickstead's shore");
  // The map: every name the site adds is on the site.
  for (const label of BRINEHAVEN_LABELS) {
    assert.ok(MAP_LABELS.includes(label), `"${label.name}" is on the map`);
    assert.ok(inBox(BRINEHAVEN, label.x, label.y), `at ${label.x},${label.y}, on the site`);
  }
});
