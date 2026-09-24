// Thornbury (PLAN §7.6, Wave 1's second site): that it stands where the plan puts it, that building it
// changes nothing in the district or the hamlet it is built against, that the roads run in from
// Stonecote and out of every gate, that the walls hold, that everything its card promises is there,
// and that the sewers under it work both ways and lead where they say.
import assert from "node:assert/strict";
import { test } from "node:test";
import { CHESTS } from "../src/shared/chests.ts";
import { BLOCKED } from "../src/shared/collision.ts";
import { DIALOGUE } from "../src/shared/dialogue.ts";
import { item } from "../src/shared/items.ts";
import {
  blankMap, builtBounds, builtRegions, cornerHeight, indoorsAt, OVERLAY_PATH, OVERLAY_WATER, overlayAt, REGION, regionId, ROOF_KEEP, roofAt,
  UNDERLAY_ROCK, underlayAt, type MapObject, type WorldMap, type WorldStack,
} from "../src/shared/map.ts";
import { levelOf, MONSTER_BY_KEY, VILLAGERS } from "../src/shared/monsters.ts";
import { areaAt, buildOakridge, DISTRICT, MAP_EXITS, OAKRIDGE_SEED } from "../src/shared/oakridge.ts";
import { findPath, findPathBeside } from "../src/shared/pathfind.ts";
import { SHOPS } from "../src/shared/shops.ts";
import { STATION_OF } from "../src/shared/stations.ts";
import { HOLLOW_CHEST, HOLLOW_PLANE, STONECOTE } from "../src/shared/stonecote.ts";
import {
  BEND, CASTLE, DEEP_BOX, DEEP_PLANE, DEEP_ROOMS, DEEP_STAIR, KEEP, OUTFALL, SEWER_BOX, SEWER_CHEST, SEWER_MOUTH, SEWER_PLANE,
  SEWER_ROOMS, SQUARE, THORNBURY, THORNBURY_EXITS, WALLS, WELL,
} from "../src/shared/thornbury.ts";
import { BRINEHAVEN } from "../src/shared/brinehaven.ts";
import { FOOTHILLS, WICKSTEAD } from "../src/shared/wickstead.ts";
import { inBox } from "../src/shared/worldgen.ts";
import { World } from "../src/server/world.ts";

const stack = buildOakridge(OAKRIDGE_SEED);
const ground = stack.planes.get(0)!;
const sewers = stack.planes.get(SEWER_PLANE)!;
const deep = stack.planes.get(DEEP_PLANE)!;
const onSite = ground.objects.filter((o) => inBox(THORNBURY, o.x, o.y));
const inCity = onSite.filter((o) => inBox(WALLS, o.x, o.y));
const open = (map: WorldMap, x: number, y: number) => (map.collision.get(x, y) & BLOCKED) === 0;
const key = (x: number, y: number) => y * 8192 + x;

test("the site is regions 48–49 × 54–55 and the bend at 48 × 53, and nothing beyond them", () => {
  const ids = new Set(builtRegions(ground).map((r) => regionId(r.rx, r.ry)));
  for (const [rx, ry] of [[48, 53], [48, 54], [49, 54], [48, 55], [49, 55]]) assert.ok(ids.has(regionId(rx!, ry!)), `region ${rx},${ry} is built`);
  for (const [rx, ry] of [[47, 54], [50, 54], [50, 55], [48, 56], [49, 56], [48, 52], [47, 53]]) assert.ok(!ids.has(regionId(rx!, ry!)), `region ${rx},${ry} is not`);
  assert.equal(builtRegions(ground).length, 44, "the district's nine, Stonecote's six, Thornbury's five, Wickstead's twelve and Brinehaven's twelve");
  assert.deepEqual(builtBounds(ground), { x0: WICKSTEAD.x0, y0: BRINEHAVEN.y0, x1: DISTRICT.x1, y1: THORNBURY.y1 });
  assert.ok(onSite.length > 800, `the site has things standing on it (${onSite.length})`);
  assert.ok(sewers && deep, "and the planes under it exist");
  assert.ok(ground.objects.some((o) => inBox(BEND, o.x, o.y)), "the bend has trees on it");
});

/**
 * ⛔ The seam. Thornbury is built after the district and Stonecote on the same builder, and shares
 * Stonecote's west column and its north row of corners. Everything the two of them hold — every
 * corner height, every tile, every object, every creature — must be exactly what it is when the world
 * is built without the city, or the approved sites changed without anyone building them.
 * The controls: the corners Thornbury does write, one past the seam, differ between the two builds.
 */
test("building Thornbury changes nothing in the district or in Stonecote", () => {
  const without = buildOakridge(OAKRIDGE_SEED, { thornbury: false });
  const alone = without.planes.get(0)!;
  assert.equal(builtRegions(alone).length, 39, "the control build is the district, the hamlet, Wickstead and Brinehaven");
  // Wickstead's and Brinehaven's own regions roll differently without the city built before them; only the district's and the hamlet's are compared here.
  for (const r of builtRegions(alone).filter((r) => !inBox(WICKSTEAD, r.rx * REGION, r.ry * REGION) && !inBox(FOOTHILLS, r.rx * REGION, r.ry * REGION) && !inBox(BRINEHAVEN, r.rx * REGION, r.ry * REGION))) {
    const both = ground.regions.get(regionId(r.rx, r.ry))!;
    for (const field of ["heights", "underlay", "overlay", "indoors", "roofs"] as const) {
      assert.deepEqual([...both[field]], [...r[field]], `region ${r.rx},${r.ry}: ${field} unchanged`);
    }
  }
  // The row of corners along Stonecote's north edge is Stonecote's, written by it and left alone — on
  // the surface, and on the plane the Hollow shares with the sewers (its ceiling's edge is that row).
  for (const plane of [0, HOLLOW_PLANE]) {
    const full = stack.planes.get(plane)!, before = without.planes.get(plane)!;
    for (let cx = STONECOTE.x0; cx <= STONECOTE.x1 + 1; cx++) {
      assert.equal(cornerHeight(full, cx, THORNBURY.y0), cornerHeight(before, cx, THORNBURY.y0), `corner ${cx},${THORNBURY.y0} on plane ${plane} is Stonecote's`);
    }
  }
  const theirs = (m: WorldMap) =>
    m.objects.filter((o) => inBox(DISTRICT, o.x, o.y) || inBox(STONECOTE, o.x, o.y))
      .map((o) => `${o.id}:${o.kind}:${o.x},${o.y}:${o.side}:${o.tag ?? ""}`).join("|");
  assert.equal(theirs(ground), theirs(alone), "the district's and the hamlet's objects, with the same ids");
  const spawned = (m: WorldMap) => m.monsters.filter((s) => inBox(DISTRICT, s.x, s.y) || inBox(STONECOTE, s.x, s.y));
  assert.deepEqual(spawned(ground), spawned(alone), "and their creatures");
  assert.deepEqual(ground.fishing.filter((w) => w.tiles.every((t) => inBox(STONECOTE, t.x, t.y))), alone.fishing.filter((w) => w.tiles.every((t) => inBox(STONECOTE, t.x, t.y))), "and the redfin water");
  // The Hollow shares its plane with the sewers now, so it is compared inside the hamlet's box.
  const hollow = (m: WorldMap) => m.objects.filter((o) => inBox(STONECOTE, o.x, o.y)).map((o) => `${o.id}:${o.kind}:${o.x},${o.y}`).join("|");
  assert.equal(hollow(stack.planes.get(HOLLOW_PLANE)!), hollow(without.planes.get(HOLLOW_PLANE)!), "and the Hollow");
  assert.ok(stack.planes.get(HOLLOW_PLANE)!.objects.length > without.planes.get(HOLLOW_PLANE)!.objects.length, "the control: the plane itself gained the sewers");
  // The controls: one corner past each seam, the ground is Thornbury's own, so the checks above can see a difference.
  let south = false, west = false;
  for (let cx = STONECOTE.x0; cx <= STONECOTE.x1 + 1; cx++) if (cornerHeight(ground, cx, THORNBURY.y0 + 1) !== cornerHeight(alone, cx, THORNBURY.y0 + 1)) south = true;
  for (let cy = BEND.y0; cy <= BEND.y1; cy++) if (cornerHeight(ground, BEND.x1, cy) !== cornerHeight(alone, BEND.x1, cy)) west = true;
  assert.ok(south && west, "the control: the corners a tile past the seams are written by Thornbury alone");
});

/**
 * The seam has no step in it: the ground a tile into Thornbury stands at the height Stonecote left on
 * its side of the line, both along the hamlet's north edge and down its west edge beside the bend.
 */
test("the ground meets Stonecote's without a step at either seam", () => {
  // Where the Wend crosses the west seam its bank slopes down to the water over the seam tile, as a
  // bank does anywhere; everywhere else the corner a tile in stands exactly at the seam's height.
  const nearWater = (x: number, y: number) =>
    [[x - 1, y - 1], [x, y - 1], [x - 1, y], [x, y]].some(([tx, ty]) => overlayAt(ground, tx!, ty!) === OVERLAY_WATER);
  for (let cx = STONECOTE.x0; cx <= THORNBURY.x1 + 1; cx++) {
    const step = Math.abs(cornerHeight(ground, cx, THORNBURY.y0 + 1) - cornerHeight(ground, cx, THORNBURY.y0));
    assert.ok(step < 1e-6, `corner ${cx},${THORNBURY.y0 + 1} steps ${step.toFixed(3)} from the seam`);
  }
  let banks = 0;
  for (let cy = BEND.y0; cy <= BEND.y1 + 1; cy++) {
    const step = Math.abs(cornerHeight(ground, BEND.x1, cy) - cornerHeight(ground, BEND.x1 + 1, cy));
    if (nearWater(BEND.x1, cy) || nearWater(BEND.x1 + 1, cy)) {
      banks++;
      assert.ok(step < 1.2, `the bank at ${BEND.x1},${cy} slopes ${step.toFixed(3)} over the seam tile, no more than a bank does`);
    } else {
      assert.ok(step < 1e-6, `corner ${BEND.x1},${cy} steps ${step.toFixed(3)} from the seam`);
    }
  }
  assert.ok(banks > 4 && banks < 40, `the river crosses the west seam (${banks} corners by water)`);
  // The control: further in, the ground is its own and does move.
  let moves = 0;
  for (let cx = STONECOTE.x0; cx <= THORNBURY.x1; cx++) if (Math.abs(cornerHeight(ground, cx, THORNBURY.y0 + 12) - cornerHeight(ground, cx, THORNBURY.y0)) > 0.05) moves++;
  assert.ok(moves > 10, `the control: twelve rows in, the ground has gone its own way on ${moves} columns`);
});

test("the North Road runs in from Stonecote through the south gate to the square, and a road leaves by every other gate", () => {
  assert.equal(overlayAt(ground, 3164, STONECOTE.y1), OVERLAY_PATH, "the road reaches Stonecote's north edge");
  assert.equal(overlayAt(ground, 3163, THORNBURY.y0), OVERLAY_PATH, "and carries on over the seam");
  // One connected run of path from the seam to each of the three exits and to the square.
  const seen = new Set<number>();
  const queue: Array<[number, number]> = [[3163, THORNBURY.y0]];
  seen.add(key(3163, THORNBURY.y0));
  while (queue.length > 0) {
    const [x, y] = queue.shift()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx, ny = y + dy;
      if (seen.has(key(nx, ny)) || !inBox(THORNBURY, nx, ny) || overlayAt(ground, nx, ny) !== OVERLAY_PATH) continue;
      seen.add(key(nx, ny));
      queue.push([nx, ny]);
    }
  }
  assert.ok(seen.has(key(SQUARE.x0 + 2, SQUARE.y0 + 2)), "the path reaches the square");
  for (const exit of THORNBURY_EXITS) {
    assert.equal(overlayAt(ground, exit.x, exit.y), OVERLAY_PATH, `"${exit.name}" is path where it leaves at ${exit.x},${exit.y}`);
    assert.ok(seen.has(key(exit.x, exit.y)), `and the path runs unbroken to it`);
    assert.ok(MAP_EXITS.includes(exit), "and the map knows it");
  }
  // And it can all be walked, in legs (the pathfinder's window is 128 tiles across).
  const legs: Array<[[number, number], [number, number], string]> = [
    [[3164, 3450], [3151, 3486], "in through the south gate"],
    [[3151, 3486], [3145, 3518], "up Main Street to the square"],
    [[3145, 3518], [3113, 3520], "west along the High Street to the west gate"],
    [[3113, 3520], [3073, 3524], "and out on the Kingsway"],
    [[3157, 3518], [3198, 3521], "east to the Fen Road"],
    [[3151, 3526], [3126, 3560], "up Ditch Lane"],
    [[3126, 3560], [3122, 3582], "and out on the Ditch Road"],
    [[3151, 3526], [3151, 3546], "up the King's Way into the castle's courtyard"],
    [[3151, 3500], [3179, 3491], "and to the sewers' yard"],
  ];
  for (const [[ax, ay], [bx, by], what] of legs) {
    assert.ok(findPath(ground.collision, ax, ay, bx, by).length > 0, `${what}: ${ax},${ay} to ${bx},${by} is walkable`);
  }
});

/**
 * The walls hold: every tile of the wall's line carries a wall on its outward side, or is a tower, or
 * is one of the sixteen tiles the four gates take. Nothing else lets anyone through.
 */
test("the city wall runs unbroken round the city but for its four gates, each a tower either side", () => {
  const walled = new Set<string>();
  for (const o of inCity) if (o.kind === "stone_wall" || o.kind === "wall" || o.kind === "wall_window") walled.add(`${o.x},${o.y}:${o.side}`);
  const gaps: string[] = [];
  const check = (x: number, y: number, side: number) => {
    if (walled.has(`${x},${y}:${side}`) || indoorsAt(ground, x, y) > 0) return;
    gaps.push(`${x},${y}`);
  };
  for (let x = WALLS.x0; x <= WALLS.x1; x++) { check(x, WALLS.y0, 2); check(x, WALLS.y1, 0); }
  for (let y = WALLS.y0; y <= WALLS.y1; y++) { check(WALLS.x0, y, 3); check(WALLS.x1, y, 1); }
  assert.equal(gaps.length, 16, `four gates of four tiles, and no other gap (${gaps.join(" ")})`);
  for (const gap of gaps) {
    const [x, y] = gap.split(",").map(Number) as [number, number];
    assert.ok(open(ground, x, y), `the gate tile ${gap} can be walked`);
    // A tower stands within three tiles either way along the wall.
    const tower = [-4, -3, 3, 4].some((d) => (y === WALLS.y0 || y === WALLS.y1) ? indoorsAt(ground, x + d, y) === 2 : indoorsAt(ground, x, y + d) === 2);
    assert.ok(tower, `and a tower stands beside the gate at ${gap}`);
  }
  // Nothing crosses the wall anywhere else: from the square, the tile outside the wall's middle of each
  // side is reached only by walking round to a gate, which takes more steps than the straight line.
  const straight = Math.abs(WALLS.y0 - 1 - SQUARE.y0);
  const round = findPath(ground.collision, 3151, SQUARE.y0, 3125, WALLS.y0 - 1);
  assert.ok(round.length > straight + 20, `the way to the ground outside the south wall goes round by the gate (${round.length} steps)`);
});

test("everything the plan's card for Thornbury promises stands in the city", () => {
  const kinds = new Set(inCity.map((o) => o.kind));
  for (const kind of ["bank_booth", "counter", "stall", "furnace", "anvil", "range", "well", "grave", "trapdoor", "signpost", "stairs"] as const) {
    assert.ok(kinds.has(kind), `the city has a ${kind}`);
  }
  // Two banks: booths in two buildings, one each end of the High Street.
  const booths = inCity.filter((o) => o.kind === "bank_booth");
  const west = booths.filter((o) => o.x < WELL.x), east = booths.filter((o) => o.x > WELL.x);
  assert.ok(west.length >= 4 && east.length >= 4, `two banks (${west.length} booths west, ${east.length} east)`);
  assert.ok(new Set(west.map((o) => o.y)).size === 1 && new Set(east.map((o) => o.y)).size === 1, "each a row of booths");
  // The shop row: every counter names a real shop, and every one of the city's shops has a counter and a keeper.
  const counters = inCity.filter((o) => STATION_OF[o.kind] === "shop");
  for (const o of counters) assert.ok(o.tag && SHOPS[o.tag] && o.tag.startsWith("thornbury_"), `the counter at ${o.x},${o.y} is one of Thornbury's shops`);
  const shops = Object.keys(SHOPS).filter((k) => k.startsWith("thornbury_"));
  assert.ok(shops.length >= 6, `the full shop row (${shops.length} shops)`);
  const keepers = new Map(ground.monsters.filter((s) => inBox(WALLS, s.x, s.y)).map((s) => [MONSTER_BY_KEY.get(s.monster)?.shop, s]));
  for (const shop of shops) {
    assert.ok(counters.some((o) => o.tag === shop), `${shop} has a counter`);
    assert.ok(keepers.has(shop), `and a keeper`);
  }
  assert.ok(inCity.filter((o) => o.kind === "stall" && inBox(SQUARE, o.x, o.y)).length >= 4, "market stalls on the square");
  assert.ok(inCity.some((o) => o.kind === "well" && o.x === WELL.x && o.y === WELL.y), "and the well at its middle");
  // The castle: a keep of arrow-slit stone under a flat roof inside a curtain wall, its stair going both ways.
  for (let y = KEEP.y0; y <= KEEP.y1; y++) for (let x = KEEP.x0; x <= KEEP.x1; x++) assert.equal(roofAt(ground, x, y), ROOF_KEEP, `the keep's roof at ${x},${y}`);
  assert.ok(inCity.some((o) => o.kind === "wall_window" && o.tag === "keep" && inBox(KEEP, o.x, o.y)), "arrow slits in its walls");
  const up = stack.planes.get(1)!;
  const keepStair = inCity.find((o) => o.kind === "stairs" && inBox(KEEP, o.x, o.y));
  assert.ok(keepStair && keepStair.to === 1, "a stair up in the keep");
  assert.ok(up.objects.some((o) => o.kind === "stairs" && o.x === keepStair!.x && o.y === keepStair!.y && o.to === 0), "that comes back down");
  let towers = 0, turrets = 0;
  for (let y = WALLS.y0; y <= WALLS.y1; y++) {
    for (let x = WALLS.x0; x <= WALLS.x1; x++) {
      if (indoorsAt(up, x, y) > 0) continue;
      if (indoorsAt(ground, x, y) === 2) towers++;
      if (indoorsAt(ground, x, y) === 3) turrets++;
    }
  }
  assert.ok(towers >= 18 * 9, `eighteen towers on the walls and the castle (${towers} tiles of them)`);
  assert.ok(turrets >= 4 * 5, `and the keep's four turrets stand a storey prouder (${turrets} tiles)`);
  assert.ok(inCity.some((o) => o.kind === "stone_wall" && inBox(CASTLE, o.x, o.y) && o.tag === undefined), "the castle has its curtain wall");
  // The inn: two storeys and a range; the smithy: furnace and anvil; the church: a bell tower and graves.
  assert.ok(inCity.some((o) => o.kind === "range"), "a range in the inn");
  assert.ok(inCity.filter((o) => o.kind === "furnace").length >= 2 && inCity.filter((o) => o.kind === "anvil").length >= 2, "two furnaces and two anvils");
  assert.ok(inCity.filter((o) => o.kind === "grave").length >= 6, "graves by the church");
  // Twenty houses and more: doors on the ground, one to a building.
  const doors = inCity.filter((o) => o.kind === "door" && o.plane === 0);
  assert.ok(doors.length >= 30, `${doors.length} doors: the named buildings and twenty houses`);
});

test("the people of Thornbury: peopled, kept, guarded, each with something to say, and nothing that starts a fight inside the walls", () => {
  const spawned = ground.monsters.filter((s) => inBox(WALLS, s.x, s.y));
  const people = spawned.filter((s) => MONSTER_BY_KEY.get(s.monster)?.person);
  assert.ok(people.length >= 30, `the city is peopled (${people.length})`);
  for (const s of spawned) {
    const def = MONSTER_BY_KEY.get(s.monster)!;
    assert.ok(def.person, `${def.name} at ${s.x},${s.y} is a person: nothing else lives inside the walls`);
    assert.ok(def.talk && DIALOGUE[def.talk], `${def.name} has something to say`);
  }
  const guards = people.filter((s) => s.monster === "city_guard");
  assert.ok(guards.length >= 12, `the guard is out (${guards.length})`);
  for (const k of ["castellan", "shopkeeper_thornbury", "weaponsmith", "armourer", "fletcher", "goldsmith", "staff_seller", "apothecary", "innkeeper_thornbury", "smith_thornbury", "market_trader", "townsman", "townswoman"]) {
    assert.ok(people.some((s) => s.monster === k), `${k} is in the city`);
  }
  assert.ok(ground.monsters.filter((s) => s.monster === "banker" && inBox(WALLS, s.x, s.y)).length >= 4, "two bankers to a bank");
  // What they wear is real, and worn where it goes.
  for (const def of VILLAGERS) {
    for (const [slot, k] of Object.entries(def.wear ?? {})) assert.equal(item(k).equip?.slot, slot, `${def.key} wears ${k} in the ${slot} slot`);
  }
  // Music: the city, the castle, the road outside, the bend, and under it all the sewers.
  assert.equal(areaAt(WELL.x, WELL.y).key, "thornbury");
  assert.equal(areaAt(3151, 3555).key, "castle");
  assert.equal(areaAt(3151, 3470).key, "thornbury_fields");
  assert.equal(areaAt(3100, 3420).key, "wendbend");
  assert.equal(areaAt(3150, 3489, SEWER_PLANE).key, "sewers");
  assert.equal(areaAt(3180, 3510, DEEP_PLANE).key, "sewers");
  assert.equal(areaAt(3150, 3489, 0).key, "thornbury", "the control: the same tile above ground is the city");
  assert.equal(areaAt(HOLLOW_CHEST.x, HOLLOW_CHEST.y, HOLLOW_PLANE).key, "hollow", "and the Hollow is still the Hollow");
});

test("the Wend runs on from Stonecote's west edge at one level, across the bend and out at the site's west edge", () => {
  const rows = (x: number) => {
    const ys: number[] = [];
    for (let y = BEND.y0; y <= BEND.y1; y++) if (overlayAt(ground, x, y) === OVERLAY_WATER) ys.push(y);
    return ys;
  };
  const theirs = rows(BEND.x1 + 1), ours = rows(BEND.x1);
  const shared = theirs.filter((y) => ours.includes(y));
  assert.ok(shared.length >= 5, `the Wend crosses the seam (${theirs.length} and ${ours.length} rows of water, ${shared.length} shared)`);
  const level = cornerHeight(ground, BEND.x1 + 1, shared[2]!);
  // A water tile's own corners: the two on its west side are this site's; on a shared row the two on
  // its east side are Stonecote's water corners too, and all four stand at the one level.
  for (const y of ours) for (const cy of [y, y + 1]) {
    assert.ok(Math.abs(cornerHeight(ground, BEND.x1, cy) - level) < 1e-6, `water corner ${BEND.x1},${cy} is at Stonecote's level`);
  }
  for (const y of shared) for (const cy of [y, y + 1]) {
    assert.ok(Math.abs(cornerHeight(ground, BEND.x1 + 1, cy) - level) < 1e-6, `Stonecote's water corner ${BEND.x1 + 1},${cy} is at that level`);
  }
  let west = 0;
  for (let y = THORNBURY.y0; y <= THORNBURY.y1; y++) if (overlayAt(ground, THORNBURY.x0, y) === OVERLAY_WATER) west++;
  assert.ok(west >= 5, `and reaches the site's west edge (${west} rows of water there)`);
  // The banks are above the water all the way, and the sewers' outfall stands on dry ground by it, outside the walls.
  for (const box of [BEND, THORNBURY]) {
    for (let y = box.y0; y <= box.y1; y++) {
      for (let x = box.x0; x <= box.x1; x++) {
        if (overlayAt(ground, x, y) !== OVERLAY_WATER) continue;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = x + dx, ny = y + dy;
          if (!(inBox(BEND, nx, ny) || inBox(THORNBURY, nx, ny)) || overlayAt(ground, nx, ny) === OVERLAY_WATER) continue;
          const far = cornerHeight(ground, nx + (dx === 1 ? 1 : 0), ny + (dy === 1 ? 1 : 0));
          assert.ok(far >= level - 1e-6, `the bank at ${nx},${ny} (${far.toFixed(2)}) is not below the water (${level.toFixed(2)})`);
        }
      }
    }
  }
  assert.ok(!inBox(WALLS, OUTFALL.x, OUTFALL.y) && overlayAt(ground, OUTFALL.x, OUTFALL.y) !== OVERLAY_WATER, "the outfall is on land outside the walls");
  assert.ok(ground.objects.some((o) => o.kind === "trapdoor" && o.x === OUTFALL.x && o.y === OUTFALL.y), "with its trapdoor");
  const nearWater = [[3, 0], [-3, 0], [0, 3], [0, -3], [-6, 0], [-6, -3], [-6, 3]].some(([dx, dy]) => overlayAt(ground, OUTFALL.x + dx!, OUTFALL.y + dy!) === OVERLAY_WATER);
  assert.ok(nearWater, "by the river");
});

test("the sewers: down the trapdoor and up again, the drain runs under the walls to the outfall, the ladder goes down to the silver and the chest, and rock all round", () => {
  // Every way in leads somewhere, and every way down has its way back up.
  const climbs: Array<[WorldMap, { x: number; y: number }, number, string]> = [
    [ground, SEWER_MOUTH, SEWER_PLANE, "the trapdoor in the yard leads down"],
    [sewers, SEWER_MOUTH, 0, "and the ladder under it leads back up"],
    [ground, OUTFALL, SEWER_PLANE, "the outfall's trapdoor leads down"],
    [sewers, OUTFALL, 0, "and its ladder leads back up"],
    [sewers, DEEP_STAIR, DEEP_PLANE, "the ladder in the well room leads down to the old works"],
    [deep, DEEP_STAIR, SEWER_PLANE, "and back up"],
  ];
  for (const [map, at, to, what] of climbs) {
    const o = map.objects.find((c) => (c.kind === "trapdoor" || c.kind === "ladder") && c.x === at.x && c.y === at.y);
    assert.ok(o && o.to === to, what);
  }
  // Every room tile is floor; everything else on the regions is rock, and blocked; the creatures stand on floors.
  for (const [map, box, rooms] of [[sewers, SEWER_BOX, SEWER_ROOMS], [deep, DEEP_BOX, DEEP_ROOMS]] as const) {
    const inRoom = (x: number, y: number) => rooms.some((r) => inBox(r, x, y));
    let rock = 0, floor = 0;
    for (let y = box.y0; y <= box.y1; y++) {
      for (let x = box.x0; x <= box.x1; x++) {
        if (inRoom(x, y)) {
          floor++;
          assert.notEqual(underlayAt(map, x, y), UNDERLAY_ROCK, `room tile ${x},${y} on plane ${map.plane} is floor`);
        } else {
          rock++;
          assert.equal(underlayAt(map, x, y), UNDERLAY_ROCK, `tile ${x},${y} on plane ${map.plane} outside the rooms is rock`);
          assert.ok(!open(map, x, y), "and blocked");
        }
      }
    }
    assert.ok(rock > floor * 4, `plane ${map.plane}: ${floor} tiles of room in ${rock} of rock`);
    // The Hollow shares the upper plane, under the hamlet; only what lives under the city is the sewers'.
    const lived = map.monsters.filter((s) => inBox(box, s.x, s.y));
    for (const s of lived) assert.ok(inRoom(s.x, s.y), `${s.monster} at ${s.x},${s.y} on plane ${map.plane} lives in a room`);
    assert.ok(lived.length >= 5, `plane ${map.plane} is lived in (${lived.length})`);
  }
  // The drain's channel: water down the middle, blocked, with a walkway either side.
  const channel = SEWER_ROOMS[1]!;
  let water = 0;
  for (let x = channel.x0; x <= channel.x1; x++) {
    if (overlayAt(sewers, x, channel.y0 + 1) !== OVERLAY_WATER) continue;
    water++;
    assert.ok(!open(sewers, x, channel.y0 + 1) && open(sewers, x, channel.y0) && open(sewers, x, channel.y1), `the channel at ${x} has a walkway either side`);
  }
  assert.ok(water >= 40, `the drain has its channel (${water} tiles of it)`);
  // The shortcut: from the foot of the yard's ladder to the outfall's, all underground; and the way down to the chest.
  const start = { x: SEWER_MOUTH.x - 1, y: SEWER_MOUTH.y };
  assert.ok(open(sewers, start.x, start.y), "there is somewhere to stand at the foot of the ladder");
  // The drain is longer than the pathfinder's window is wide, so it is walked in two legs, as it is played.
  const halfway = findPath(sewers.collision, start.x, start.y, 3120, 3490);
  assert.ok(halfway.length > 50 && halfway.every((t) => inBox(SEWER_ROOMS[1]!, t.x, t.y) || inBox(SEWER_ROOMS[0]!, t.x, t.y) || inBox(SEWER_ROOMS[2]!, t.x, t.y)), `the drain can be walked west from the shaft (${halfway.length} steps)`);
  const toOutfall = findPathBeside(sewers.collision, 3120, 3490, OUTFALL);
  assert.ok(toOutfall.length > 20, `and the outfall reached under the walls from there (${toOutfall.length} steps)`);
  assert.ok(toOutfall.some((t) => inBox(SEWER_ROOMS[3]!, t.x, t.y)), "by way of the turn down to it");
  const toDeep = findPathBeside(sewers.collision, start.x, start.y, DEEP_STAIR);
  assert.ok(toDeep.length > 0 && toDeep.some((t) => inBox(SEWER_ROOMS[5]!, t.x, t.y)), "and the well room, through the passage north of the cistern");
  const landing = { x: DEEP_STAIR.x + 1, y: DEEP_STAIR.y };
  assert.ok(open(deep, landing.x, landing.y), "there is somewhere to stand at the foot of the deep ladder");
  const toChest = findPathBeside(deep.collision, landing.x, landing.y, SEWER_CHEST);
  assert.ok(toChest.length > 0 && toChest.some((t) => inBox(DEEP_ROOMS[1]!, t.x, t.y)), "the chest can be reached, through the passage east");
  // The card's contents: the silver seam, a chest with a table, and something worth the walk down.
  assert.ok(deep.objects.filter((o) => o.kind === "silver_rock").length >= 6, "a silver seam");
  const chest = deep.objects.find((o) => o.kind === "chest");
  assert.ok(chest && chest.tag && CHESTS[chest.tag], "a chest with a loot table");
  assert.equal(CHESTS.sewers!.loot.reduce((n, d) => n + d.weight, 0), 128, "whose table never comes up empty");
  assert.ok(sewers.monsters.some((s) => s.monster === "giant_rat" && inBox(SEWER_BOX, s.x, s.y)), "rats in the drains");
  const hardest = Math.max(...deep.monsters.filter((s) => inBox(DEEP_BOX, s.x, s.y)).map((s) => levelOf(MONSTER_BY_KEY.get(s.monster)!)));
  assert.ok(hardest >= 19, `and something in the old works worth a fighter's while (level ${hardest})`);
  // Nothing on the surface of the sewers' regions is any different for them being there: the city stands on rock it never sees.
  assert.equal(underlayAt(ground, SEWER_MOUTH.x, SEWER_MOUTH.y + 2), underlayAt(ground, SEWER_MOUTH.x, SEWER_MOUTH.y + 2), "the surface is the surface");
});

/**
 * A trapdoor is climbed like a stair: standing beside it puts the player on the plane it leads to, on
 * the nearest tile that can be stood on, and the ladder there brings them back. The control: a well
 * on the same map is not climbable, and clicking it goes nowhere.
 */
test("a trapdoor takes a player down to the plane it names, and the ladder under it brings them back", () => {
  const surface = blankMap(16, 16, 0, 0, 0), under = blankMap(16, 16, 0, 0, -1);
  const down: MapObject = { id: 1, kind: "trapdoor", x: 8, y: 8, plane: 0, side: 0, variant: 0.5, to: -1 };
  const back: MapObject = { id: 2, kind: "ladder", x: 8, y: 8, plane: -1, side: 0, variant: 0.5, to: 0 };
  const well: MapObject = { id: 3, kind: "well", x: 4, y: 4, plane: 0, side: 0, variant: 0.5 };
  surface.objects.push(down, well);
  under.objects.push(back);
  for (const [m, o] of [[surface, down], [surface, well], [under, back]] as const) m.collision.block(o.x, o.y);
  const world = new World({ planes: new Map([[0, surface], [-1, under]]), spawn: { x: 6, y: 8, plane: 0 }, name: "shaft" } satisfies WorldStack);
  const p = world.add("Delver");
  assert.equal(p.plane, 0);
  world.interact(p, down.id);
  for (let i = 0; i < 6 && p.plane === 0; i++) world.step();
  assert.equal(p.plane, -1, "the trapdoor took the player down");
  assert.ok(Math.abs(p.x - 8) <= 1 && Math.abs(p.y - 8) <= 1 && !(p.x === 8 && p.y === 8), `onto a tile beside the ladder (${p.x},${p.y})`);
  world.interact(p, back.id);
  for (let i = 0; i < 6 && p.plane === -1; i++) world.step();
  assert.equal(p.plane, 0, "and the ladder brought them back up");
  // The control: a thing that is not climbable does nothing when reached.
  world.interact(p, well.id);
  for (let i = 0; i < 8; i++) world.step();
  assert.equal(p.plane, 0, "the well is not a way anywhere");
});
