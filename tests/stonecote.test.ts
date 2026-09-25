// Stonecote (PLAN §7.6, Wave 1's first site): that it stands where the plan puts it, that building it
// changes nothing in the district it is built against, that the road runs from the green to its north
// edge, that everything its card promises is there, and that the Hollow under it works both ways.
import assert from "node:assert/strict";
import { test } from "node:test";
import { KILNHOLD_SITE } from "../src/shared/kilnhold.ts";
import { CHESTS } from "../src/shared/chests.ts";
import { BLOCKED } from "../src/shared/collision.ts";
import { DIALOGUE } from "../src/shared/dialogue.ts";
import { ITEM_BY_KEY } from "../src/shared/items.ts";
import {
  builtBounds, builtRegions, cornerHeight, OVERLAY_PATH, OVERLAY_WATER, overlayAt, REGION, regionId, ROOF_SLATE, ROOF_THATCH, roofAt,
  UNDERLAY_ROCK, underlayAt, blankMap, oneMap, type MapObject, type WorldMap,
} from "../src/shared/map.ts";
import { MONSTER_BY_KEY } from "../src/shared/monsters.ts";
import { areaAt, buildOakridge, DISTRICT, GREEN, MAP_EXITS, OAKRIDGE_SEED } from "../src/shared/oakridge.ts";
import { findPath, findPathBeside } from "../src/shared/pathfind.ts";
import { SHOPS } from "../src/shared/shops.ts";
import {
  HAMLET, HOLLOW_CHEST, HOLLOW_MOUTH, HOLLOW_PLANE, HOLLOW_REGION, HOLLOW_ROOMS, SQUARE, STONECOTE,
} from "../src/shared/stonecote.ts";
import { inBox } from "../src/shared/worldgen.ts";
import { World } from "../src/server/world.ts";

const stack = buildOakridge(OAKRIDGE_SEED);
const ground = stack.planes.get(0)!;
const below = stack.planes.get(HOLLOW_PLANE)!;
const onSite = ground.objects.filter((o) => inBox(STONECOTE, o.x, o.y));
const open = (map: WorldMap, x: number, y: number) => (map.collision.get(x, y) & BLOCKED) === 0;

test("the site is regions 49–51 × 52–53 on the district's north edge, and nothing east of them", () => {
  const ids = new Set(builtRegions(ground).map((r) => regionId(r.rx, r.ry)));
  for (const rx of [49, 50, 51]) for (const ry of [52, 53]) assert.ok(ids.has(regionId(rx, ry)), `region ${rx},${ry} is built`);
  assert.ok(!ids.has(regionId(52, 52)), "the region east of the site is not");
  assert.ok(!ids.has(regionId(50, 54)) && !ids.has(regionId(51, 54)), "nor the ones north of its east end: Thornbury is north-west");
  // The world as a whole is counted in oakridge.test.ts; Stonecote's own regions are here.
  const built = builtBounds(ground)!;
  assert.ok(built.y1 >= STONECOTE.y1 && built.x1 === KILNHOLD_SITE.x1, "the built world reaches the site's north edge and east as far as Kilnhold");
  assert.ok(onSite.length > 200, `the site has things standing on it (${onSite.length})`);
  assert.ok(below, "and the Hollow's plane exists");
});

/**
 * ⛔ The seam. Stonecote is built after the district on the same builder and shares its north edge's
 * corners. Everything the district holds — every corner height, every tile, every object — must be
 * exactly what it is when the district is built alone, or the approved village has changed without
 * anyone building it. The control: the row Stonecote does write differs between the two builds.
 */
test("building Stonecote changes nothing in the district", () => {
  const alone = buildOakridge(OAKRIDGE_SEED, { stonecote: false }).planes.get(0)!;
  assert.equal(builtRegions(alone).length, 45, "the control build is the district, Wickstead, Brinehaven and Kilnhold, which are built against the district alone");
  // Wickstead's and Brinehaven's own regions roll differently without the hamlet built before them; only the district's are compared here.
  for (const r of builtRegions(alone).filter((r) => inBox(DISTRICT, r.rx * REGION, r.ry * REGION))) {
    const both = ground.regions.get(regionId(r.rx, r.ry))!;
    for (const field of ["heights", "underlay", "overlay", "indoors", "roofs"] as const) {
      assert.deepEqual([...both[field]], [...r[field]], `region ${r.rx},${r.ry}: ${field} unchanged`);
    }
  }
  // The seam row's corners belong to the regions north of the district and are written by the district alone.
  for (let cx = DISTRICT.x0; cx <= DISTRICT.x1 + 1; cx++) {
    assert.equal(cornerHeight(ground, cx, STONECOTE.y0), cornerHeight(alone, cx, STONECOTE.y0), `corner ${cx},${STONECOTE.y0} is the district's`);
  }
  const districtObjects = (m: WorldMap) =>
    m.objects.filter((o) => inBox(DISTRICT, o.x, o.y)).map((o) => `${o.id}:${o.kind}:${o.x},${o.y}:${o.side}:${o.tag ?? ""}`).join("|");
  assert.equal(districtObjects(ground), districtObjects(alone), "the district's objects, with the same ids");
  assert.deepEqual(ground.monsters.filter((s) => inBox(DISTRICT, s.x, s.y)), alone.monsters.filter((s) => inBox(DISTRICT, s.x, s.y)), "and its creatures");
  // The control: one row north, the ground is Stonecote's own, so the check above can see a difference.
  let differs = false;
  for (let cx = DISTRICT.x0; cx <= DISTRICT.x1 + 1; cx++) {
    if (cornerHeight(ground, cx, STONECOTE.y0 + 1) !== cornerHeight(alone, cx, STONECOTE.y0 + 1)) differs = true;
  }
  assert.ok(differs, "the control: the row above the seam is written by Stonecote alone");
});

test("the North Road runs unbroken from the district's edge to the site's north edge, and can be walked from the green", () => {
  // The road crosses the site's north edge at 3164 and carries on into Thornbury; the map's north exit
  // is the city's now, not the hamlet's.
  const exit = { x: 3164, y: STONECOTE.y1 };
  assert.ok(overlayAt(ground, exit.x, exit.y) === OVERLAY_PATH, "the road really does cross the north edge there");
  assert.ok(overlayAt(ground, exit.x - 1, exit.y + 1) === OVERLAY_PATH, "and carries on into the next site");
  assert.ok(!MAP_EXITS.some((e) => e.y === STONECOTE.y1), "so the map no longer calls the hamlet's north edge an exit");
  // The road itself is one connected run of path from the district's end of it to the exit: a flood
  // fill over path tiles, kept north of the district so it cannot get there through the village's lanes.
  const seen = new Set<number>();
  const queue: Array<[number, number]> = [[3224, 3327]];
  seen.add(3224 * 8192 + 3327);
  let reached = false;
  while (queue.length > 0 && !reached) {
    const [x, y] = queue.shift()!;
    if (x === exit.x && y === exit.y) reached = true;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx, ny = y + dy, key = nx * 8192 + ny;
      if (seen.has(key) || ny < 3327 || overlayAt(ground, nx, ny) !== OVERLAY_PATH) continue;
      seen.add(key);
      queue.push([nx, ny]);
    }
  }
  assert.ok(reached, `the path runs unbroken from the district to the exit (${seen.size} tiles of it reached)`);
  assert.ok(!seen.has(3232 * 8192 + 3250), "the control: the fill did not get there through the village");
  // And it can be walked, from the green: the pathfinder's window is 128 tiles across, so in legs, each
  // ending on the road. The farm's strips used to cut the second leg (crops stood on the road's tiles).
  const legs: Array<[number, number]> = [
    [GREEN.x, GREEN.y + 18], [3226, 3300], [3220, 3350], [3196, 3383], [SQUARE.x, SQUARE.y], [3167, 3445], [exit.x, exit.y - 1],
  ];
  for (let i = 1; i < legs.length; i++) {
    const [ax, ay] = legs[i - 1]!, [bx, by] = legs[i]!;
    assert.ok(findPath(ground.collision, ax, ay, bx, by).length > 0, `leg ${i}: ${ax},${ay} to ${bx},${by} is walkable`);
  }
});

test("the bridge crosses the Wend on a railed deck, and the river runs on from the seam at one level", () => {
  const deck: number[] = [];
  for (let y = HAMLET.y0; y <= HAMLET.y1; y++) {
    const railed = [3166, 3170].every((x) => ground.objects.some((o) => o.kind === "fence" && o.x === x && o.y === y));
    if (railed && overlayAt(ground, 3168, y) === OVERLAY_PATH) deck.push(y);
  }
  assert.ok(deck.length >= 7, `the deck is railed for ${deck.length} rows`);
  const overWater = deck.filter((y) => overlayAt(ground, 3165, y) === OVERLAY_WATER || overlayAt(ground, 3171, y) === OVERLAY_WATER);
  assert.ok(overWater.length >= 5, `and most of it is over water (${overWater.length} rows)`);
  for (const y of deck) assert.ok(open(ground, 3168, y), `the deck can be walked at ${y}`);
  // The seam: the district's last row of water and Stonecote's first share their columns and their level.
  const cols = (y: number) => {
    const xs: number[] = [];
    for (let x = 3240; x <= 3275; x++) if (overlayAt(ground, x, y) === OVERLAY_WATER) xs.push(x);
    return xs;
  };
  const south = cols(STONECOTE.y0 - 1), north = cols(STONECOTE.y0);
  const shared = south.filter((x) => north.includes(x));
  assert.ok(shared.length >= 5, `the Wend crosses the seam (${south.length} and ${north.length} columns of water, ${shared.length} shared)`);
  const level = cornerHeight(ground, shared[2]!, STONECOTE.y0 - 1);
  for (const x of north) for (const cy of [STONECOTE.y0 + 1, STONECOTE.y0 + 2]) {
    assert.ok(Math.abs(cornerHeight(ground, x, cy) - level) < 1e-6, `water corner ${x},${cy} is at the district's level`);
  }
  const under = overWater[2]!;
  if (overlayAt(ground, 3165, under) === OVERLAY_WATER) assert.ok(Math.abs(cornerHeight(ground, 3165, under) - level) < 1e-6, "the water under the bridge is at the same level");
  // The banks are above the water, all the way: no row's water stands proud of the land beside it.
  for (let y = STONECOTE.y0 + 1; y <= STONECOTE.y1; y++) {
    for (let x = STONECOTE.x0; x <= STONECOTE.x1; x++) {
      if (overlayAt(ground, x, y) !== OVERLAY_WATER) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx, ny = y + dy;
        if (!inBox(STONECOTE, nx, ny) || overlayAt(ground, nx, ny) === OVERLAY_WATER || overlayAt(ground, nx, ny) === OVERLAY_PATH) continue;
        const far = cornerHeight(ground, nx + (dx === 1 ? 1 : 0), ny + (dy === 1 ? 1 : 0));
        assert.ok(far >= level - 1e-6, `the bank at ${nx},${ny} (${far.toFixed(2)}) is not below the water (${level.toFixed(2)})`);
      }
    }
  }
});

test("everything the plan's card for Stonecote promises stands in the hamlet, and no bank", () => {
  const inHamlet = onSite.filter((o) => inBox(HAMLET, o.x, o.y));
  const kinds = new Set(inHamlet.map((o) => o.kind));
  for (const kind of ["well", "range", "counter", "stairs", "signpost", "grave", "fence", "gate"] as const) assert.ok(kinds.has(kind), `the hamlet has a ${kind}`);
  assert.ok(!kinds.has("bank_booth"), "and no bank booth: a waypoint that banks is a destination (§5)");
  // Eight buildings: eight ground-floor doors, one to a building.
  assert.equal(inHamlet.filter((o) => o.kind === "door").length, 8, "eight buildings, each with its door");
  const roofs = new Set<number>();
  for (let y = HAMLET.y0; y <= HAMLET.y1; y++) for (let x = HAMLET.x0; x <= HAMLET.x1; x++) { const r = roofAt(ground, x, y); if (r) roofs.add(r); }
  assert.ok(roofs.has(ROOF_SLATE) && roofs.has(ROOF_THATCH), "slate on the inn and the chapel, thatch on the barn");
  // The inn has an upstairs, and its stair goes both ways.
  const up = stack.planes.get(1)!;
  const innStairs = inHamlet.filter((o) => o.kind === "stairs" && o.to === 1);
  assert.equal(innStairs.length, 1, "one stair up in the hamlet: the inn's");
  assert.ok(up.objects.some((o) => o.kind === "stairs" && o.x === innStairs[0]!.x && o.y === innStairs[0]!.y && o.to === 0), "and it comes back down");
  // The tackle shop: its counter names a real shop, its keeper keeps it, and it sells the rod the water needs.
  const counters = inHamlet.filter((o) => o.kind === "counter");
  assert.ok(counters.length > 0 && counters.every((o) => o.tag === "stonecote_tackle"), "the counters are the tackle shop's");
  assert.ok(SHOPS.stonecote_tackle, "which is a real shop");
  assert.equal(MONSTER_BY_KEY.get("tackle_keeper")?.shop, "stonecote_tackle");
  assert.ok(SHOPS.stonecote_tackle!.stock.some((l) => l.id === ITEM_BY_KEY.get("fishing_rod")!.id), "it sells the rod");
  assert.ok(SHOPS.stonecote_tackle!.stock.some((l) => l.id === ITEM_BY_KEY.get("bait")!.id), "and the bait");
  // The redfin water (§8.4): rod fishing, on water, with a bank to stand on, inside the site.
  const rod = ground.fishing.filter((w) => w.method === "angle" && w.tiles.every((t) => inBox(STONECOTE, t.x, t.y)));
  assert.equal(rod.length, 1, "one rod water: the Wend at Stonecote");
  assert.ok(rod[0]!.tiles.length >= 3 && rod[0]!.count >= 1);
  for (const t of rod[0]!.tiles) {
    assert.ok(inBox(STONECOTE, t.x, t.y) && overlayAt(ground, t.x, t.y) === OVERLAY_WATER, `the spot at ${t.x},${t.y} is on the site's water`);
    const bank = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const).some(([dx, dy]) => open(ground, t.x + dx, t.y + dy));
    assert.ok(bank, `and somebody can stand beside it at ${t.x},${t.y}`);
  }
  // The people: each in the bestiary with a conversation; nothing in the hamlet starts a fight.
  const spawned = ground.monsters.filter((s) => inBox(HAMLET, s.x, s.y));
  const people = spawned.filter((s) => MONSTER_BY_KEY.get(s.monster)?.person);
  assert.ok(people.length >= 5, `the hamlet is peopled (${people.length})`);
  for (const s of people) {
    const def = MONSTER_BY_KEY.get(s.monster)!;
    assert.ok(def.talk && DIALOGUE[def.talk], `${def.name} has something to say`);
  }
  assert.ok(new Set(people.map((s) => s.monster)).has("innkeeper_stonecote"), "the innkeeper is in");
  for (const s of spawned) {
    const def = MONSTER_BY_KEY.get(s.monster)!;
    assert.ok(def.person || def.aggro === 0, `${def.name} does not start fights in the hamlet`);
  }
  // Music: the hamlet has its own area, the road between the settlements its own, and under the hamlet is the Hollow.
  assert.equal(areaAt(SQUARE.x, SQUARE.y).key, "stonecote");
  assert.equal(areaAt(3200, 3350).key, "northroad");
  assert.equal(areaAt(HOLLOW_CHEST.x, HOLLOW_CHEST.y, HOLLOW_PLANE).key, "hollow");
  assert.equal(areaAt(HOLLOW_CHEST.x, HOLLOW_CHEST.y, 0).key, "stonecote", "the control: the same tile above ground is the hamlet");
});

test("the Hollow: down from the ring and back up, two rooms joined by a passage, rock all round, and the card's contents", () => {
  const down = ground.objects.find((o) => o.kind === "stairs" && o.x === HOLLOW_MOUTH.x && o.y === HOLLOW_MOUTH.y);
  assert.ok(down && down.to === HOLLOW_PLANE, "the stair in the ring leads down");
  const upStair = below.objects.find((o) => o.kind === "stairs" && o.x === HOLLOW_MOUTH.x && o.y === HOLLOW_MOUTH.y);
  assert.ok(upStair && upStair.to === 0, "and the one below leads back up");
  assert.ok(ground.objects.some((o) => o.kind === "stone_wall" && o.tag === "ruin" && Math.abs(o.x - HOLLOW_MOUTH.x) <= 2 && Math.abs(o.y - HOLLOW_MOUTH.y) <= 2), "old stones stand round the mouth");
  // Every room tile is floor; everything else on the region is rock, and blocked.
  const [near, passage] = HOLLOW_ROOMS;
  const inRoom = (x: number, y: number) => HOLLOW_ROOMS.some((r) => inBox(r, x, y));
  let rock = 0, floor = 0;
  for (let y = HOLLOW_REGION.y0; y <= HOLLOW_REGION.y1; y++) {
    for (let x = HOLLOW_REGION.x0; x <= HOLLOW_REGION.x1; x++) {
      if (inRoom(x, y)) {
        floor++;
        assert.notEqual(underlayAt(below, x, y), UNDERLAY_ROCK, `room tile ${x},${y} is floor`);
      } else {
        rock++;
        assert.equal(underlayAt(below, x, y), UNDERLAY_ROCK, `tile ${x},${y} outside the rooms is rock`);
        assert.ok(!open(below, x, y), `and blocked`);
      }
    }
  }
  assert.ok(rock > floor * 5, `small on purpose: ${floor} tiles of room in ${rock} of rock`);
  // From beside the stair, the chest at the far end is reachable, through the passage.
  const start = { x: HOLLOW_MOUTH.x + 1, y: HOLLOW_MOUTH.y };
  assert.ok(open(below, start.x, start.y), "there is somewhere to stand at the foot of the stair");
  const toChest = findPathBeside(below.collision, start.x, start.y, HOLLOW_CHEST);
  assert.ok(toChest.length > 0, "the chest can be reached");
  assert.ok(toChest.some((t) => inBox(passage, t.x, t.y)), "and the way goes through the passage");
  // Cave walls stand on the rooms' edges, and not across the passage.
  const walls = below.objects.filter((o) => o.kind === "stone_wall" && o.tag === "cave");
  assert.ok(walls.length >= 80, `the rooms are walled (${walls.length} lengths)`);
  assert.ok(!walls.some((o) => o.x === near.x1 && o.y === passage.y0 + 1 && o.side === 1), "the passage is open into the near room");
  assert.ok(walls.some((o) => o.x === near.x1 && o.y === near.y0 && o.side === 1), "the control: the near room's east wall stands elsewhere");
  // What the card lists: the coal seam, the rats, and a chest with a table behind it.
  assert.ok(below.objects.filter((o) => o.kind === "coal_rock").length >= 3, "a coal seam");
  assert.ok(below.monsters.some((s) => s.monster === "giant_rat"), "giant rats");
  assert.ok(below.monsters.every((s) => open(below, s.x, s.y) || below.objects.some((o) => o.x === s.x && o.y === s.y)), "everything below spawns on the rooms' floor");
  const chest = below.objects.find((o) => o.kind === "chest");
  assert.ok(chest && chest.tag && CHESTS[chest.tag], "a chest with a loot table");
  assert.equal(CHESTS.hollow!.loot.reduce((n, d) => n + d.weight, 0), 128, "whose table never comes up empty");
});

/**
 * The chest's mechanics, on a field of their own: the real Hollow has wolves in the room with it, and a
 * level-3 delver left there for the chest's whole respawn is killed and wakes on the green (which is the
 * dungeon working, not the chest).
 */
test("searching a chest gives one thing from its table into the pack, then it stands empty until it fills again", () => {
  const map = blankMap(16, 16);
  const chest: MapObject = { id: 1, kind: "chest", x: 8, y: 8, plane: 0, side: 0, variant: 0.5, tag: "hollow" };
  map.objects.push(chest);
  map.collision.block(8, 8);
  const world = new World(oneMap(map, { x: 7, y: 8 }, "field"));
  const p = world.add("Delver");
  // What the pack holds, by item: coins from the chest stack onto the starter kit's, so slots are no measure.
  const counts = () => {
    const by = new Map<number, number>();
    for (const s of p.inventory) if (s) by.set(s.id, (by.get(s.id) ?? 0) + s.count);
    return by;
  };
  const gainedOver = (was: Map<number, number>) => [...counts()].filter(([id, n]) => n > (was.get(id) ?? 0)).map(([id]) => id);
  const lootIds = new Set(CHESTS.hollow!.loot.map((d) => ITEM_BY_KEY.get(d.item)!.id));
  const before = counts();
  world.interact(p, chest.id);
  for (let i = 0; i < 5 && !world.depleted.has(chest.id); i++) world.step();
  assert.ok(world.depleted.has(chest.id), "the chest has been searched");
  const gained = gainedOver(before);
  assert.ok(gained.length === 1 && lootIds.has(gained[0]!), `one thing from its table is in the pack (gained ${gained.join(",")})`);
  // Searched again while empty, nothing happens: it is not even an action.
  const held = JSON.stringify(p.inventory);
  world.interact(p, chest.id);
  for (let i = 0; i < 3; i++) world.step();
  assert.equal(JSON.stringify(p.inventory), held, "an empty chest gives nothing");
  assert.equal(p.action, null, "and searching it is not an action");
  // After its respawn it fills again, and can be searched again.
  for (let i = 0; i < CHESTS.hollow!.respawn + 2 && world.depleted.has(chest.id); i++) world.step();
  assert.ok(!world.depleted.has(chest.id), "the chest has filled again");
  const between = counts();
  world.interact(p, chest.id);
  for (let i = 0; i < 5 && !world.depleted.has(chest.id); i++) world.step();
  assert.ok(world.depleted.has(chest.id), "and it can be searched again");
  const again = gainedOver(between);
  assert.ok(again.length === 1 && lootIds.has(again[0]!), "with a second thing in the pack");
  // The control: a chest with no table is empty from the start.
  const bare: MapObject = { id: 2, kind: "chest", x: 8, y: 6, plane: 0, side: 0, variant: 0.5 };
  map.objects.push(bare);
  const other = new World(oneMap(map, { x: 7, y: 6 }, "field"));
  const q = other.add("Second");
  const had = JSON.stringify(q.inventory);
  other.interact(q, bare.id);
  for (let i = 0; i < 5; i++) other.step();
  assert.ok(!other.depleted.has(bare.id) && JSON.stringify(q.inventory) === had, "a chest with no table gives nothing");
});
