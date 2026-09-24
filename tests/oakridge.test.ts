// The Oakridge district: that it is built where it says it is, that everything §7.4 promises stands
// somewhere on it, and that the two faults absolute coordinates introduced cannot come back.
import assert from "node:assert/strict";
import { test } from "node:test";
import { BLOCKED } from "../src/shared/collision.ts";
import { isTree, OVERLAY_WATER, ROOF_CLAY, ROOF_KEEP, ROOF_SLATE, ROOF_THATCH, tileIndex, type MapObject, type ObjectKind } from "../src/shared/map.ts";
import { item } from "../src/shared/items.ts";
import { isValidLook, LOOK, normalizeLook } from "../src/shared/look.ts";
import { MONSTER_BY_KEY, VILLAGERS } from "../src/shared/monsters.ts";
import {
  ALL_AREAS, areaAt, buildOakridge, GREEN, MAP_EXITS, MAP_LABELS, MAP_MARKS, OAKRIDGE_SEED,
  ORIGIN_X, ORIGIN_Y, SITES, SIZE,
} from "../src/shared/oakridge.ts";
import { findPath, findPathTo, reaches } from "../src/shared/pathfind.ts";
import { RESOURCES } from "../src/shared/gathering.ts";
import { SHOPS } from "../src/shared/shops.ts";
import { STATION_OF } from "../src/shared/stations.ts";
import { World } from "../src/server/world.ts";
import { starterKit } from "../src/server/inventory.ts";

const stack = buildOakridge(OAKRIDGE_SEED);
const ground = stack.planes.get(0)!;
const every: MapObject[] = [...stack.planes.values()].flatMap((m) => m.objects);
const kinds = new Set<ObjectKind>(every.map((o) => o.kind));

test("the district is where PLAN §7.1 puts it, and the same every build", () => {
  assert.deepEqual(stack.spawn, { x: GREEN.x, y: GREEN.y, plane: 0 });
  assert.equal(ground.originX, ORIGIN_X);
  assert.equal(ground.originY, ORIGIN_Y);
  assert.equal(ground.width, SIZE);
  assert.equal(ground.height, SIZE);
  // The green is the centre of region (50, 50): 64 tiles a region, so 50 × 64 + 32.
  assert.equal(GREEN.x, 50 * 64 + 32);
  assert.equal(GREEN.y, 50 * 64 + 32);
  const again = buildOakridge(OAKRIDGE_SEED).planes.get(0)!;
  assert.deepEqual([...again.heights], [...ground.heights], "the same seed builds the same ground");
  assert.equal(
    again.objects.map((o) => `${o.id}:${o.kind}:${o.x},${o.y}`).join("|"),
    ground.objects.map((o) => `${o.id}:${o.kind}:${o.x},${o.y}`).join("|"),
    "and the same objects, with the same ids — the client builds this map from the seed too",
  );
  assert.ok(ground.heights.every(Number.isFinite), "no corner is left at NaN");
});

/**
 * ⛔ The fault this locks out: an object's id was its position in the map's array until the plane stack
 * made ids unique across planes, and two server lookups still read `map.objects[id]`. Clicking a tree
 * then worked a different tree. A control follows, so the check is known to be able to see it.
 */
test("an object id is not its place in the array, and every lookup honours that", () => {
  const ids = every.map((o) => o.id);
  assert.equal(new Set(ids).size, ids.length, "every object in the stack has its own id");
  const wrong = ground.objects.filter((o, i) => o.id !== i);
  assert.ok(wrong.length > 0, "the control: ids and array positions really do differ on this map");

  const world = new World(stack);
  // A tree whose id is nowhere near its position, and whose array slot holds something else.
  const tree = ground.objects.find((o, i) => o.kind === "tree" && o.id !== i && ground.objects[o.id]?.kind !== "tree");
  assert.ok(tree, "the map has a tree whose array slot holds a different kind");
  assert.equal(world.objectOf(tree.id)?.kind, "tree");
  assert.equal(world.objectAt(tree.x, tree.y)?.id, tree.id);
});

/**
 * ⛔ And the fault beside it: the map's arrays are local, every coordinate on it is absolute, and a
 * renderer that walked the arrays as if the indices were tiles drew the ground 3,000 tiles away.
 */
test("the map's tiles are addressed in world coordinates, not array indices", () => {
  assert.equal(tileIndex(ground, GREEN.x, GREEN.y), (GREEN.y - ORIGIN_Y) * SIZE + (GREEN.x - ORIGIN_X));
  assert.equal(tileIndex(ground, 0, 0), -1, "a local index is not a tile: the control");
  assert.ok(ground.collision.inBounds(GREEN.x, GREEN.y));
  assert.ok(!ground.collision.inBounds(0, 0));
  for (const o of every) {
    assert.ok(o.x >= ORIGIN_X && o.x < ORIGIN_X + SIZE, `object #${o.id} is inside the map in x`);
    assert.ok(o.y >= ORIGIN_Y && o.y < ORIGIN_Y + SIZE, `object #${o.id} is inside the map in y`);
  }
});

test("a player wakes on the green, and can walk off it every way the map is open", () => {
  assert.equal(ground.collision.get(GREEN.x, GREEN.y) & BLOCKED, 0, "the spawn tile is clear");
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const t = { x: GREEN.x + dx * 8, y: GREEN.y + dy * 8 };
    assert.ok(findPath(ground.collision, GREEN.x, GREEN.y, t.x, t.y).length > 0, `${dx},${dy} is walkable`);
  }
});

test("everything PLAN §7.4 promises the district stands somewhere on it", () => {
  // The village's core: the bank, both shops, the smithy's furnace and anvil, the inn's range.
  for (const kind of ["bank_booth", "counter", "furnace", "anvil", "range", "millstone"] as const) {
    assert.ok(kinds.has(kind), `the village has a ${kind}`);
  }
  // Built now for phases that come later (§7, §8.3, §8.5).
  assert.ok(kinds.has("coal_rock"), "the coal seam, without which Phase 8 cannot smith steel");
  assert.ok(kinds.has("barred"), "the Adit's barred mouth, for Wave 2 to open");
  assert.ok(kinds.has("sealed"), "Ashbarrow's sealed stair, for Wave 3");
  assert.ok(kinds.has("gate"), "the Emberway Gate");
  // The three ladders the district is meant to carry, and nothing above them (§8.1).
  for (const kind of ["tree", "oak", "copper_rock", "tin_rock", "iron_rock"] as const) {
    assert.ok(kinds.has(kind), `the district carries ${kind}`);
  }
  assert.equal(ground.fishing.length > 0, true, "there is water to fish");
  assert.ok(ground.fishing.every((w) => w.method === "net"), "and only the net's rungs, as §8.4 has it");
});

test("every counter names a shop that exists, and every stair a plane that does", () => {
  for (const o of every) {
    if (STATION_OF[o.kind] === "shop") assert.ok(o.tag && SHOPS[o.tag], `${o.kind} at ${o.x},${o.y} names a real shop`);
    if (o.kind === "stairs" || o.kind === "ladder") {
      assert.ok(stack.planes.has(o.to ?? -99), `the stair at ${o.x},${o.y} leads to a plane that exists`);
    }
  }
});

test("every creature homed here is in the bestiary, and none of them is at the spawn", () => {
  for (const map of stack.planes.values()) {
    for (const s of map.monsters) {
      assert.ok(MONSTER_BY_KEY.has(s.monster), `${s.monster} is in the bestiary`);
      const def = MONSTER_BY_KEY.get(s.monster)!;
      // §7.5: nothing above level 3 within sight of where players arrive; nothing dangerous at all near it.
      if (!def.person && Math.hypot(s.x - GREEN.x, s.y - GREEN.y) < 8) {
        assert.fail(`${s.monster} lives ${Math.hypot(s.x - GREEN.x, s.y - GREEN.y).toFixed(1)} tiles from the spawn`);
      }
    }
  }
});

/**
 * The village is stone (2026-09-24): every indoor tile names its roof, all four kinds of roof stand
 * somewhere, the bank is a keep with a turret on each corner, the church has a bell tower, the
 * Emberway is shut by a gatehouse, and Ashbarrow's wall is a ruin while the gatehouse's is not.
 */
test("the village is stone with a keep, a bell tower and a gatehouse, and every roof knows its kind", () => {
  for (let i = 0; i < ground.indoors.length; i++) {
    assert.equal(ground.roofs[i]! > 0, ground.indoors[i]! > 0, `tile ${i}: roof ${ground.roofs[i]} under indoors ${ground.indoors[i]}`);
  }
  const styles = new Set(ground.roofs.filter((v) => v > 0));
  for (const style of [ROOF_CLAY, ROOF_SLATE, ROOF_THATCH, ROOF_KEEP]) assert.ok(styles.has(style), `a roof of kind ${style} stands somewhere`);
  // Towers: two storeys of wall on the ground plane with no floor above them.
  const upper = stack.planes.get(1)!;
  let towers = 0;
  for (let i = 0; i < ground.indoors.length; i++) if (ground.indoors[i] === 2 && upper.indoors[i] === 0) towers++;
  assert.ok(towers >= 4 * 4 + 9 + 2 * 9, `four turrets, a bell tower and two gatehouse towers cover ${towers} tiles`);
  // The gatehouse: a tower either side of the gate, and the passage between them open to the sky.
  const gate = every.find((o) => o.kind === "gate" && o.tag === "emberway")!;
  assert.equal(ground.indoors[tileIndex(ground, gate.x, gate.y + 1)], 2, "a tower north of the gate");
  assert.equal(ground.indoors[tileIndex(ground, gate.x, gate.y - 1)], 2, "a tower south of the gate");
  assert.equal(ground.indoors[tileIndex(ground, gate.x, gate.y)], 0, "and the passage itself is open to the sky");
  const into = findPath(ground.collision, gate.x - 4, gate.y, gate.x, gate.y).at(-1);
  assert.ok(into && into.x === gate.x && into.y === gate.y, `the passage can be walked into from the road (got to ${into?.x},${into?.y})`);
  assert.ok(every.some((o) => o.kind === "stone_wall" && o.tag === "ruin"), "Ashbarrow's wall is a ruin");
  assert.ok(every.some((o) => o.kind === "stone_wall" && o.tag === undefined), "the gatehouse's is not");
  // Every wall, window and door carries how tall it stands, and nothing stands on a door.
  for (const o of every) {
    if (o.kind === "wall" || o.kind === "wall_window" || o.kind === "door") assert.ok((o.tall ?? 0) >= 1, `${o.kind} at ${o.x},${o.y} knows its height`);
  }
  const doors = every.filter((o) => o.kind === "door");
  for (const d of doors) {
    const over = every.find((o) => o !== d && o.kind === "wall" && o.x === d.x && o.y === d.y && o.side === d.side && o.plane === d.plane);
    assert.equal(over, undefined, `nothing is stacked over the door at ${d.x},${d.y}`);
  }
});

test("every person of the village has a look the creator would accept, and wears real things", () => {
  for (const def of VILLAGERS) {
    assert.ok(def.look && isValidLook(def.look), `${def.key} has a look the creator would accept`);
    assert.deepEqual(normalizeLook(def.look!), def.look, `${def.key}'s look is as the rules leave it (a type-B body wears no beard)`);
    for (const [slot, key] of Object.entries(def.wear ?? {})) {
      assert.equal(item(key).equip?.slot, slot, `${def.key} wears ${key} in the ${slot} slot`);
    }
    if (def.apron !== undefined) assert.notEqual(def.look![LOOK.torso], 3, `${def.key} wears an apron, so not a belted tunic under it`);
  }
  const spawned = new Set(ground.monsters.map((s) => s.monster));
  assert.ok(spawned.has("villager") && spawned.has("villager_woman"), "both kinds of villager are out on the green");
});

test("the people of the village can be reached, and each has something to say", () => {
  const world = new World(stack);
  const people = [...world.npcs.values()].filter((n) => n.def.person);
  assert.ok(people.length >= 8, `the village is peopled (${people.length})`);
  for (const n of people) assert.ok(n.def.talk, `${n.def.name} has a conversation`);
  const bankers = people.filter((n) => n.def.banker);
  assert.ok(bankers.length > 0, "somebody can open the bank");
  const keepers = people.filter((n) => n.def.shop);
  assert.deepEqual(new Set(keepers.map((n) => n.def.shop)), new Set(Object.keys(SHOPS)), "both shops are kept");
});

test("a beginner can find a tree, a rock and a tool without a coin to their name", () => {
  const world = new World(stack);
  const me = { x: GREEN.x, y: GREEN.y };
  const reachable = (o: { x: number; y: number }) => {
    const rect = { x: o.x, y: o.y, w: 1, h: 1 };
    const end = findPathTo(ground.collision, me.x, me.y, rect).at(-1) ?? me;
    return reaches(ground.collision, end.x, end.y, rect);
  };
  // A level-1 tree within a walk of the green. §7.3 puts everything a beginner needs inside 40 tiles.
  const firstTree = ground.objects.find((o) =>
    isTree(o.kind) && RESOURCES[o.kind]!.yields.level === 1 && Math.hypot(o.x - me.x, o.y - me.y) < 40 && reachable(o));
  assert.ok(firstTree, "a tree a beginner may cut is within reach of the green");
  // The mine is 90 tiles out (§7.3), further than one walk's search window, so it is reached from the
  // quarry rather than from the green — which is what a player does, in stages along the Quarry Track.
  const copper = ground.objects.filter((o) => o.kind === "copper_rock" || o.kind === "tin_rock");
  assert.ok(copper.length > 0, "the quarry has copper and tin on its rim");
  const fromQuarry = { x: copper[0]!.x, y: copper[0]!.y + 12 };
  const reachableFromQuarry = copper.some((o) => {
    const rect = { x: o.x, y: o.y, w: 1, h: 1 };
    const end = findPathTo(ground.collision, fromQuarry.x, fromQuarry.y, rect).at(-1) ?? fromQuarry;
    return reaches(ground.collision, end.x, end.y, rect);
  });
  assert.ok(reachableFromQuarry, "and a beginner standing in the quarry can get at one");
  // ⛔ A player who lost their tools has shops now, but no coins: one of each still lies about.
  const lying = new Set(ground.spawns.map((s) => s.item));
  for (const key of ["bronze_axe", "bronze_pickaxe", "fishing_net"]) {
    assert.ok(lying.has(key), `a free ${key} lies on the map`);
    assert.ok(item(key), `${key} is a real item`);
  }
  assert.ok(world.players.size === 0);
});

test("the fishing spots sit on water with somewhere to stand beside them", () => {
  for (const water of ground.fishing) {
    assert.ok(water.tiles.length > 0);
    for (const t of water.tiles) {
      const i = tileIndex(ground, t.x, t.y);
      assert.ok(i >= 0 && ground.overlay[i] === OVERLAY_WATER, `the spot at ${t.x},${t.y} is on water`);
      const bank = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const).some(([dx, dy]) =>
        (ground.collision.get(t.x + dx, t.y + dy) & BLOCKED) === 0);
      assert.ok(bank, `and somebody can stand beside the spot at ${t.x},${t.y}`);
    }
  }
});

test("the inn has an upstairs, and the stair between its floors goes both ways", () => {
  const up = stack.planes.get(1);
  assert.ok(up, "there is a first floor");
  const stairsUp = ground.objects.filter((o) => o.kind === "stairs" && (o.to ?? 0) === 1);
  const stairsDown = up.objects.filter((o) => o.kind === "stairs" && (o.to ?? 0) === 0);
  assert.ok(stairsUp.length > 0, "a stair goes up");
  assert.ok(stairsDown.length > 0, "and one comes back down");
  for (const s of stairsUp) {
    assert.ok(stairsDown.some((d) => d.x === s.x && d.y === s.y), `the stair at ${s.x},${s.y} has its other half`);
  }
});

test("a character saved outside the district wakes on the green, once", () => {
  const world = new World(stack);
  // The test map's tiles were 0–63: every one of them is outside Oakridge (§7.1's migration rule).
  const old = world.add("Wanderer", undefined, { at: { x: 32, y: 30 }, inventory: starterKit() });
  assert.deepEqual([old.x, old.y, old.plane], [GREEN.x, GREEN.y, 0]);
  // And a character saved inside it stays where it was.
  const here = { x: GREEN.x + 4, y: GREEN.y + 4, plane: 0 };
  const settled = world.add("Settled", undefined, { at: here });
  assert.deepEqual([settled.x, settled.y], [here.x, here.y]);
});

test("the sites of §7.4 are where the table says, and the green is inside the village", () => {
  const inside = (b: { x0: number; y0: number; x1: number; y1: number }, x: number, y: number) =>
    x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1;
  assert.ok(inside(SITES.village!, GREEN.x, GREEN.y), "the green is in the village");
  assert.ok(!inside(SITES.farm!, GREEN.x, GREEN.y), "the control: it is not in the farm");
  // Each site holds something of its own, rather than being a name over empty ground.
  const within = (b: { x0: number; y0: number; x1: number; y1: number }) => every.filter((o) => inside(b, o.x, o.y));
  for (const [name, box] of Object.entries(SITES)) {
    assert.ok(within(box).length > 0, `${name} has something standing in it`);
  }
});

test("the world map names real places, inside the ground it is a map of", () => {
  const inside = (x: number, y: number) =>
    x >= ORIGIN_X && x < ORIGIN_X + SIZE && y >= ORIGIN_Y && y < ORIGIN_Y + SIZE;
  for (const label of MAP_LABELS) {
    assert.ok(label.name.length > 0);
    assert.ok(inside(label.x, label.y), `"${label.name}" is on the map at ${label.x},${label.y}`);
  }
  // Every big name matches a site §7.4 lists, so the map cannot drift from the district.
  const sites = new Set(Object.keys(SITES));
  const named = new Set(MAP_LABELS.filter((l) => !l.small).map((l) => l.name.toLowerCase().replace(/^the /, "")));
  for (const key of ["village", "farm", "oakenshaw", "quarry", "wendmouth", "ashbarrow", "stockade", "meadow"]) {
    assert.ok(sites.has(key), `${key} is a site`);
  }
  assert.ok(named.has("oakridge"), "the village is named on the map");
  assert.ok(named.has("copperfoot quarry"), "and so is the quarry");

  // The four roads out leave by the edge they claim, at a tile that is on it.
  assert.equal(MAP_EXITS.length, 4, "four roads leave the district (§7.4)");
  for (const exit of MAP_EXITS) {
    assert.ok(inside(Math.min(exit.x, ORIGIN_X + SIZE - 1), Math.min(exit.y, ORIGIN_Y + SIZE - 1)));
    const onEdge = exit.side === "w" ? exit.x <= ORIGIN_X + 1
      : exit.side === "e" ? exit.x >= ORIGIN_X + SIZE - 2
        : exit.side === "s" ? exit.y <= ORIGIN_Y + 1
          : exit.y >= ORIGIN_Y + SIZE - 2;
    assert.ok(onEdge, `"${exit.name}" crosses the ${exit.side} edge at ${exit.x},${exit.y}`);
    assert.ok(exit.away >= 0, "and says how far it is, or nothing");
  }
  // Every hand-written mark stands on something: the map may not invent a place.
  for (const mark of MAP_MARKS) {
    assert.ok(inside(mark.x, mark.y), `the ${mark.icon} mark at ${mark.x},${mark.y} is on the map`);
    const near = every.some((o) => Math.hypot(o.x - mark.x, o.y - mark.y) < 22);
    assert.ok(near, `the ${mark.icon} mark at ${mark.x},${mark.y} has something near it`);
  }
});

test("every area of the district names a tune, and the green is in one", () => {
  const tracks = new Set(ALL_AREAS.map((a) => a.track));
  for (const t of tracks) assert.ok(Number.isInteger(t) && t >= 0 && t < 3, `track ${t} is one of the three there are`);
  assert.equal(areaAt(GREEN.x, GREEN.y).key, "village", "the green is in the village");
  assert.equal(areaAt(ORIGIN_X + 4, ORIGIN_Y + 100).key, "oakenshaw", "the far west is the wood");
  // The control: somewhere with no site of its own falls to the open country between them.
  assert.equal(areaAt(3268, 3268).key, "open", "and the ground between places is the open road");
});
