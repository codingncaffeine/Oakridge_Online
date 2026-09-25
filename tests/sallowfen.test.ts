// The Fen Road, the Sallowfen and Mourn (PLAN §7.6, Wave 4): that both sites are where the plan puts them;
// that building them changes nothing anywhere else and leaves Thornbury's column, Stonecote's row and the
// Harrow's row alone; that the Fen Road runs on from Thornbury's gate to the Rill, and the causeway from the
// bridge to Mourn's square and every door; that the Black Rill is crossed nowhere but the bridge, and the
// bridge's gate only by the warden's hand from The Silence at Mourn's fifth stage; that Mourn has what its card
// promises; that the fen's company is worse the further in and all of it can be got at; and that the quest
// walks through the real world from the warden's first word to his last coin.
import assert from "node:assert/strict";
import { test } from "node:test";
import { addItem, countOf, spendItem } from "../src/server/inventory.ts";
import { World, type Npc, type Player } from "../src/server/world.ts";
import { ADIT_REGION } from "../src/shared/adit.ts";
import { DEEP_REGION } from "../src/shared/ashbarrow.ts";
import { BLOCKED } from "../src/shared/collision.ts";
import { DIALOGUE } from "../src/shared/dialogue.ts";
import { item } from "../src/shared/items.ts";
import {
  builtRegions, cornerHeight, OVERLAY_PATH, OVERLAY_WATER, overlayAt, regionId, UNDERLAY_FEN, underlayAt, type WorldMap,
} from "../src/shared/map.ts";
import { questBegun, questComplete, RILL_BACK, RILL_OVER, RILL_SHUT } from "../src/shared/messages.ts";
import { levelOf, MONSTER_BY_KEY } from "../src/shared/monsters.ts";
import { areaAt, buildOakridge, MAP_EXITS, MAP_LABELS, MAP_MARKS, OAKRIDGE_SEED } from "../src/shared/oakridge.ts";
import { type Point } from "../src/shared/worldgen.ts";
import { MOURN_QUEST, QUEST_BY_KEY, questPoints, RILL_PASSES_AT, stageOf } from "../src/shared/quests.ts";
import {
  BANK, BRIDGE, CAUSEWAY, CHAPEL, COTTAGES, FEN, FEN_ROAD, FEN_ROAD_SITE, GATE_TOWERS, GATE_X, GUARDHOUSE, HOLLOWS_STAIR, inFenSites, isRill, MOURN,
  REEVE_HOUSE, ROAD_IN, SALLOWFEN_SITE, SQUARE, STORE,
} from "../src/shared/sallowfen.ts";
import { SHOPS } from "../src/shared/shops.ts";
import { FEN_EXIT } from "../src/shared/thornbury.ts";
import { inBox } from "../src/shared/worldgen.ts";

const stack = buildOakridge(OAKRIDGE_SEED);
const ground = stack.planes.get(0)!;
const onRoad = ground.objects.filter((o) => inBox(FEN_ROAD_SITE, o.x, o.y));
const onFen = ground.objects.filter((o) => inBox(SALLOWFEN_SITE, o.x, o.y));
const inMourn = onFen.filter((o) => inBox(MOURN, o.x, o.y));
const key = (x: number, y: number) => y * 8192 + x;
const xOf = (k: number) => k % 8192;
const blocked = (map: WorldMap, x: number, y: number) => (map.collision.get(x, y) & BLOCKED) !== 0;
/** The step across each side of a tile: north, east, south, west. */
const ACROSS: ReadonlyArray<readonly [number, number]> = [[0, 1], [1, 0], [0, -1], [-1, 0]];

/** Every tile reached from `from` by the collision's own step rule, without leaving `within`. */
function flood(map: WorldMap, from: { x: number; y: number }, within: (x: number, y: number) => boolean): Set<number> {
  const seen = new Set<number>([key(from.x, from.y)]);
  const queue: Array<[number, number]> = [[from.x, from.y]];
  for (let head = 0; head < queue.length; head++) {
    const [x, y] = queue[head]!;
    for (const [dx, dy] of ACROSS) {
      const nx = x + dx, ny = y + dy;
      if (seen.has(key(nx, ny)) || !within(nx, ny) || !map.collision.canStep(x, y, dx, dy)) continue;
      seen.add(key(nx, ny));
      queue.push([nx, ny]);
    }
  }
  return seen;
}

/** Every path tile reached from `from` over path alone. */
function pathFlood(from: { x: number; y: number }, within: (x: number, y: number) => boolean): Set<number> {
  const seen = new Set<number>([key(from.x, from.y)]);
  const queue: Array<[number, number]> = [[from.x, from.y]];
  for (let head = 0; head < queue.length; head++) {
    const [x, y] = queue[head]!;
    for (const [dx, dy] of ACROSS) {
      const nx = x + dx, ny = y + dy;
      if (seen.has(key(nx, ny)) || !within(nx, ny) || overlayAt(ground, nx, ny) !== OVERLAY_PATH) continue;
      seen.add(key(nx, ny));
      queue.push([nx, ny]);
    }
  }
  return seen;
}

/** Points every `step` tiles along a polyline, rounded to tiles: the legs a long walk is checked in (the pathfinder looks 64 tiles each way). */
function legsAlong(line: readonly Point[], step: number): Array<{ x: number; y: number }> {
  const out = [{ x: Math.round(line[0]![0]), y: Math.round(line[0]![1]) }];
  let carried = 0;
  for (let i = 1; i < line.length; i++) {
    const [ax, ay] = line[i - 1]!, [bx, by] = line[i]!;
    const len = Math.hypot(bx - ax, by - ay);
    for (let d = step - carried; d <= len; d += step) out.push({ x: Math.round(ax + ((bx - ax) * d) / len), y: Math.round(ay + ((by - ay) * d) / len) });
    carried = (carried + len) % step;
  }
  const [lx, ly] = line.at(-1)!;
  out.push({ x: Math.round(lx), y: Math.round(ly) });
  return out;
}

test("the sites are regions 50–55 × 54–55 and 56–61 × 52–57, east of Thornbury, and nothing beyond them", () => {
  const ids = new Set(builtRegions(ground).map((r) => regionId(r.rx, r.ry)));
  for (let rx = 50; rx <= 55; rx++) for (let ry = 54; ry <= 55; ry++) assert.ok(ids.has(regionId(rx, ry)), `the road's region ${rx},${ry} is built`);
  for (let rx = 56; rx <= 61; rx++) for (let ry = 52; ry <= 57; ry++) assert.ok(ids.has(regionId(rx, ry)), `the fen's region ${rx},${ry} is built`);
  for (const [rx, ry] of [[52, 53], [55, 53], [55, 56], [62, 55], [56, 51], [59, 58]] as const) assert.ok(!ids.has(regionId(rx, ry)), `region ${rx},${ry} is not`);
  assert.equal(builtRegions(ground).length, 211, "the district's nine, Wave 1's thirty-five, Wave 2's thirty-two, Deepdelve's twelve, the Harrow's forty-five, Sandreach's thirty, and the Fen Road's twelve and the Sallowfen's thirty-six");
  assert.ok(onRoad.length > 1000, `the heath has things standing on it (${onRoad.length})`);
  assert.ok(onFen.length > 2000, `and so does the fen (${onFen.length})`);
});

/** ⛔ The seams and the control: the world without the two sites is the same world everywhere else, and the neighbours' corners are theirs. */
test("building the fen changes nothing anywhere else, on any plane, and leaves Thornbury's column, Stonecote's row and the Harrow's row alone", () => {
  const without = buildOakridge(OAKRIDGE_SEED, { sallowfen: false });
  const alone = without.planes.get(0)!;
  assert.equal(builtRegions(alone).length, 163, "the control build is everything but the two sites");
  const theirs = (o: { x: number; y: number; plane: number }) => !inFenSites(o.x, o.y) && !(o.plane < 0 && (inBox(ADIT_REGION, o.x, o.y) || inBox(DEEP_REGION, o.x, o.y)));
  for (const [plane, before] of without.planes) {
    const after = stack.planes.get(plane)!;
    for (const r of builtRegions(before)) {
      const both = after.regions.get(regionId(r.rx, r.ry))!;
      for (const field of ["heights", "underlay", "overlay", "indoors", "roofs"] as const) assert.deepEqual([...both[field]], [...r[field]], `plane ${plane}, region ${r.rx},${r.ry}: ${field} unchanged`);
    }
    const objects = (m: WorldMap) => m.objects.filter(theirs).map((o) => `${o.id}:${o.kind}:${o.x},${o.y}:${o.side}:${o.tag ?? ""}`).join("|");
    assert.equal(objects(after), objects(before), `plane ${plane}: their objects, with the same ids`);
    assert.deepEqual(after.monsters.filter((s) => !inFenSites(s.x, s.y)), before.monsters.filter((s) => !inFenSites(s.x, s.y)), `plane ${plane}: and their creatures`);
    assert.deepEqual(after.spawns.filter((s) => !inFenSites(s.x, s.y)), before.spawns.filter((s) => !inFenSites(s.x, s.y)), `plane ${plane}: and what lies about`);
  }
  // The corners the neighbours wrote are theirs: Thornbury's column, Stonecote's row, the Harrow's row.
  for (let cy = 3456; cy <= 3584; cy++) assert.equal(cornerHeight(ground, 3200, cy), cornerHeight(alone, 3200, cy), `corner 3200,${cy} is Thornbury's`);
  for (let cx = 3200; cx <= 3328; cx++) assert.equal(cornerHeight(ground, cx, 3456), cornerHeight(alone, cx, 3456), `corner ${cx},3456 is Stonecote's`);
  for (let cx = 3201; cx <= 3456; cx++) assert.equal(cornerHeight(ground, cx, 3584), cornerHeight(alone, cx, 3584), `corner ${cx},3584 is the Harrow's`);
  // No step: a corner in from each seam meets it exactly, away from where two seams meet.
  const meets = (ax: number, ay: number, bx: number, by: number) => Math.abs(cornerHeight(ground, ax, ay) - cornerHeight(ground, bx, by)) < 1e-6;
  for (let cy = 3466; cy <= 3574; cy++) assert.ok(meets(3201, cy, 3200, cy), `corner 3201,${cy} meets Thornbury's column`);
  for (let cx = 3210; cx <= 3328; cx++) assert.ok(meets(cx, 3457, cx, 3456), `corner ${cx},3457 meets Stonecote's row`);
  for (let cx = 3210; cx <= 3456; cx++) assert.ok(meets(cx, 3583, cx, 3584), `corner ${cx},3583 meets the Harrow's row`);
  // The rows run on past their owners' ends without a cliff, and the fen's heath meets the road's east column.
  const near = (ax: number, ay: number, bx: number, by: number) => Math.abs(cornerHeight(ground, ax, ay) - cornerHeight(ground, bx, by)) < 0.5;
  assert.ok(near(3329, 3456, 3328, 3456) && near(3457, 3584, 3456, 3584), "the seam rows run on past Stonecote's and the Harrow's ends");
  for (let cy = 3456; cy <= 3584; cy++) assert.ok(near(3585, cy, 3584, cy), `corner 3585,${cy} runs on from the road's column`);
  assert.ok(ground.regions.get(regionId(60, 55))?.built === true && !alone.regions.has(regionId(60, 55)), "the control: Mourn's region exists only with the fen");
});

test("the Fen Road runs on from Thornbury's east gate to the Rill gate, and the causeway from the bridge to Mourn's square and every door", () => {
  assert.equal(overlayAt(ground, FEN_EXIT.x, FEN_EXIT.y), OVERLAY_PATH, "Thornbury's Fen Road reaches its east edge");
  assert.equal(overlayAt(ground, ROAD_IN.x, ROAD_IN.y), OVERLAY_PATH, "and runs on over the seam");
  const west = pathFlood(ROAD_IN, (x, y) => inFenSites(x, y) && x < GATE_X);
  for (let y = BRIDGE.y0; y <= BRIDGE.y1; y++) assert.ok(west.has(key(GATE_X - 1, y)), `the Fen Road reaches the gate at ${GATE_X - 1},${y}`);
  const east = pathFlood({ x: BRIDGE.x0, y: BRIDGE.y0 + 1 }, (x, y) => inBox(SALLOWFEN_SITE, x, y) && x >= GATE_X);
  assert.ok(east.has(key(SQUARE.x, SQUARE.y)), "the bridge and the causeway reach Mourn's square");
  const doors = inMourn.filter((o) => o.kind === "door");
  assert.equal(doors.length, 8, "eight doors: the bank, the store, the chapel, the reeve's house and four cottages");
  for (const d of doors) {
    const [dx, dy] = ACROSS[d.side]!;
    assert.ok(east.has(key(d.x + dx, d.y + dy)), `the door at ${d.x},${d.y} opens onto the causeway's lanes`);
  }
  const guard = onFen.find((o) => o.kind === "door" && inBox(GUARDHOUSE, o.x, o.y))!;
  const [gx, gy] = ACROSS[guard.side]!;
  assert.ok(west.has(key(guard.x + gx, guard.y + gy)), "and the guardhouse's door opens onto the road");
  // It can all be walked, in legs: the road from the city's gate to the Rill gate, and the causeway from the bridge to the square.
  for (const line of [FEN_ROAD, CAUSEWAY]) {
    const legs = legsAlong(line, 40);
    for (let i = 1; i < legs.length; i++) {
      const a = legs[i - 1]!, b = legs[i]!;
      const walk = ground.collision && findPathTo(a, b);
      assert.deepEqual(walk, b, `the walk ${a.x},${a.y} → ${b.x},${b.y} arrives`);
    }
  }
});

/** The last tile of a walk from `a` to `b`: the pathfinder stops as near as it can to a tile it cannot reach, so arrival is what counts. */
import { findPath } from "../src/shared/pathfind.ts";
function findPathTo(a: { x: number; y: number }, b: { x: number; y: number }) {
  const path = findPath(ground.collision, a.x, a.y, b.x, b.y);
  return path.at(-1) ?? { x: a.x, y: a.y };
}

/** ⛔ Crossed nowhere but the bridge: a flood by the collision's own step rule, and the gate's walls taken off as the control. */
test("the Black Rill is crossed nowhere but the bridge, and the bridge's gate is barred for good", () => {
  for (let y = SALLOWFEN_SITE.y0; y <= SALLOWFEN_SITE.y1; y++) {
    let water = 0;
    for (let x = 3620; x <= 3665; x++) {
      if (!isRill(x, y)) continue;
      assert.ok(overlayAt(ground, x, y) === OVERLAY_WATER && blocked(ground, x, y), `the Rill at ${x},${y} is water`);
      water++;
    }
    if (!(y >= BRIDGE.y0 && y <= BRIDGE.y1)) assert.ok(water >= 6, `the Rill is ${water} tiles wide on row ${y}`);
  }
  const gates = onFen.filter((o) => o.kind === "gate");
  assert.equal(gates.length, 3, "three leaves, one a row of the bridge");
  for (const g of gates) {
    assert.ok(g.tag === "rillgate" && g.x === GATE_X && g.side === 3 && g.y >= BRIDGE.y0 && g.y <= BRIDGE.y1, `the gate at ${g.x},${g.y} bars the bridge's west end`);
    assert.ok(ground.collision.wallBetween(GATE_X - 1, g.y, 1, 0), "and stands barred");
  }
  for (const box of GATE_TOWERS) assert.ok(onFen.filter((o) => inBox(box, o.x, o.y) && o.kind === "wall").length >= 8, "a tower either side of it");
  // From the Fen Road, by the step rule, nothing on the bridge or past it is reached.
  const start = { x: GATE_X - 1, y: BRIDGE.y0 + 1 };
  const reached = flood(ground, start, inFenSites);
  assert.ok(reached.size > 10000, `the flood covers the heath (${reached.size} tiles)`);
  // Past the Rill is the bridge or the fen proper: the Rill bends east north of the crossing, so the west bank has land at x ≥ the gate's too.
  const across = (k: number) => inBox(BRIDGE, xOf(k), Math.floor(k / 8192)) || inBox(FEN, xOf(k), Math.floor(k / 8192));
  assert.ok(![...reached].some(across), "and never reaches the bridge or the fen");
  // The control: the gate's walls off, the same flood crosses and reaches Mourn.
  try {
    for (const g of gates) ground.collision.removeWall(g.x, g.y, g.side);
    assert.ok(flood(ground, start, inFenSites).has(key(SQUARE.x, SQUARE.y)), "the control: with the bar up, the flood reaches Mourn's square");
  } finally {
    for (const g of gates) ground.collision.addWall(g.x, g.y, g.side);
  }
  assert.ok(ground.collision.wallBetween(GATE_X - 1, BRIDGE.y0 + 1, 1, 0), "and the bar is down again");
});

test("Mourn: the seventh bank, Carrow's Store, the chapel with its altar and graves, the reeve's house, four cottages, the sealed stair, and nothing fighting in it", () => {
  assert.equal(inMourn.filter((o) => o.kind === "bank_booth" && inBox(BANK, o.x, o.y)).length, 8, "the bank's booths");
  const counters = inMourn.filter((o) => o.kind === "counter");
  assert.ok(counters.length >= 3 && counters.every((o) => o.tag === "mourn_store" && inBox(STORE, o.x, o.y)), "the store's counters");
  assert.ok(inMourn.some((o) => o.kind === "altar" && inBox(CHAPEL, o.x, o.y)), "the chapel's altar");
  assert.ok(inMourn.filter((o) => o.kind === "grave" && o.y < CHAPEL.y0).length >= 6, "the graves behind the chapel");
  for (const [box] of COTTAGES) assert.equal(inMourn.filter((o) => o.kind === "door" && inBox(box, o.x, o.y)).length, 1, `the cottage at ${box.x0},${box.y0} has its door`);
  assert.equal(inMourn.filter((o) => o.kind === "door" && inBox(REEVE_HOUSE, o.x, o.y)).length, 1, "and the reeve's house its");
  for (const [icon, box] of [["bank", BANK], ["bread", STORE]] as const) assert.ok(inMourn.some((o) => o.kind === "sign" && o.tag === icon && inBox(box, o.x, o.y)), `the ${icon} sign hangs by its door`);
  const stair = inMourn.find((o) => o.kind === "open_stair");
  assert.ok(stair && stair.tag === "fenhollows" && stair.x === HOLLOWS_STAIR.x && stair.y === HOLLOWS_STAIR.y, "the Fen Hollows' stair (fenhollows.test.ts goes down it)");
  assert.ok(Math.abs(stair!.y - SQUARE.y) >= 15, "at the mound's north edge, off the square");
  for (const s of ground.monsters.filter((s) => inBox(MOURN, s.x, s.y))) {
    const def = MONSTER_BY_KEY.get(s.monster)!;
    assert.ok(def.person || s.monster === "hen", `the ${s.monster} at ${s.x},${s.y} is no danger in Mourn`);
  }
  for (const who of ["mourn_reeve", "mourn_storekeeper", "banker", "mournfolk", "mournfolk_woman"]) assert.ok(ground.monsters.some((s) => s.monster === who && inBox(MOURN, s.x, s.y)), `${who} lives in Mourn`);
  assert.equal(areaAt(SQUARE.x, SQUARE.y).key, "mourn", "the square is Mourn");
  assert.equal(areaAt(GATE_X - 1, BRIDGE.y0 + 1).key, "rillcrossing", "the gate is the crossing");
  assert.equal(areaAt(3400, 3520).key, "fenroad", "the heath is the Fen Road");
  assert.equal(areaAt(3760, 3600).key, "sallowfen", "and the fen is the Sallowfen");
});

test("the fen: its own ground, pools and dead trees east of the Rill, worse company the further in, and every creature within reach", () => {
  let fen = 0, water = 0, tiles = 0;
  for (let y = FEN.y0; y <= FEN.y1; y++) {
    for (let x = FEN.x0; x <= FEN.x1; x++) {
      tiles++;
      if (overlayAt(ground, x, y) === OVERLAY_WATER) water++;
      else if (underlayAt(ground, x, y) === UNDERLAY_FEN) fen++;
    }
  }
  assert.ok(fen > tiles * 0.4, `the fen's own ground (${fen} of ${tiles})`);
  assert.ok(water > tiles * 0.15 && water < tiles * 0.45, `and water enough to make it a fen (${((100 * water) / tiles).toFixed(0)}%)`);
  const kinds = (k: string) => onFen.filter((o) => o.kind === k && inBox(FEN, o.x, o.y)).length;
  assert.ok(kinds("dead_tree") > 300 && kinds("reed") > 300, `dead trees (${kinds("dead_tree")}) and reeds (${kinds("reed")})`);
  // The company: the castellan's lurkers on the road before the Rill, the dead and the hags past it.
  const creatures = ground.monsters.filter((s) => inFenSites(s.x, s.y) && !MONSTER_BY_KEY.get(s.monster)!.person && s.monster !== "hen");
  const level = (s: { monster: string }) => levelOf(MONSTER_BY_KEY.get(s.monster)!);
  assert.ok(creatures.filter((s) => s.monster === "rill_lurker" && s.x < GATE_X).length >= 4, "four lurkers or more this side of the Rill, for the castellan");
  const road = creatures.filter((s) => s.x < GATE_X), past = creatures.filter((s) => s.x >= GATE_X);
  assert.ok(Math.max(...past.map(level)) > Math.max(...road.map(level)), `worse company past the Rill (${Math.max(...past.map(level))}) than on the road (${Math.max(...road.map(level))})`);
  assert.ok(past.filter((s) => s.monster === "fen_wight").length >= 6 && past.filter((s) => s.monster === "bog_hag").length >= 4, "the dead and the hags");
  // Every creature can be got at: the east from the bridge's far end, the west from the road.
  const eastGround = flood(ground, { x: BRIDGE.x1 + 1, y: BRIDGE.y0 + 1 }, (x, y) => inBox(SALLOWFEN_SITE, x, y) && x >= GATE_X);
  const westGround = flood(ground, ROAD_IN, (x, y) => inFenSites(x, y) && x < GATE_X);
  for (const s of creatures) assert.ok((s.x >= GATE_X ? eastGround : westGround).has(key(s.x, s.y)), `the ${s.monster} at ${s.x},${s.y} can be walked up to`);
});

test("the crossing's and Mourn's people talk, the store trades, and the map knows the road, the Rill, the fen and Mourn", () => {
  for (const who of ["rill_warden", "lamp_man", "mourn_reeve", "mourn_storekeeper", "mournfolk", "mournfolk_woman"]) {
    const def = MONSTER_BY_KEY.get(who)!;
    assert.ok(def.person && def.talk && DIALOGUE[def.talk], `${who} has something to say`);
    assert.ok(ground.monsters.some((s) => s.monster === who && inFenSites(s.x, s.y)), `and stands on the fen's sites`);
  }
  assert.ok(ground.monsters.some((s) => s.monster === "lamp_man" && inBox(GUARDHOUSE, s.x, s.y)), "Pell is kept in the guardhouse");
  assert.equal(MONSTER_BY_KEY.get("mourn_storekeeper")!.shop, "mourn_store");
  assert.ok(SHOPS["mourn_store"] && (DIALOGUE["mourn_storekeeper"]!["start"]!.options ?? []).some((o) => o.act === "shop"), "and her talk offers the trade");
  for (const [name, box] of [["Mourn", SALLOWFEN_SITE], ["The Sallowfen", SALLOWFEN_SITE], ["The Fen Road", FEN_ROAD_SITE]] as const) {
    assert.ok(MAP_LABELS.some((l) => l.name === name && inBox(box, l.x, l.y)), `the map names ${name}`);
  }
  assert.ok(MAP_MARKS.some((m) => m.icon === "gate" && m.x === GATE_X) && MAP_MARKS.some((m) => m.icon === "church" && inBox(CHAPEL, m.x, m.y)), "and marks the gate and the chapel");
  assert.ok(!MAP_EXITS.some((e) => e.name.includes("Fen Road")), "and the Fen Road is no exit: it runs on to the Rill");
});

/** A player on a free tile beside a person, with no wall between, so a talk opens on the first step. */
function besideOf(world: World, who: string): { at: { x: number; y: number; plane: number }; n: Npc } {
  const n = [...world.npcs.values()].find((c) => c.def.key === who);
  assert.ok(n, `${who} is in the world`);
  for (const [dx, dy] of ACROSS) {
    const t = { x: n.x + dx, y: n.y + dy };
    if (!blocked(world.map, t.x, t.y) && !world.map.collision.wallBetween(n.x, n.y, dx, dy)) return { at: { ...t, plane: n.plane }, n };
  }
  throw new Error(`no free tile beside ${who}`);
}

/** Puts the player beside a person, as a crossing would, and opens the talk. */
function talkTo(world: World, p: Player, who: string) {
  const { at, n } = besideOf(world, who);
  world.travel(p, at.x, at.y, at.plane);
  world.talk(p, n.id);
  for (let i = 0; i < 20 && p.screen?.kind !== "talk"; i++) world.step();
  const box = world.dialogueFor(p);
  assert.ok(box, `talking to ${n.def.name} opens a box`);
  return box;
}

/** Picks the option with this text, which must be on offer. */
function say(world: World, p: Player, text: string) {
  const box = world.dialogueFor(p)!;
  const i = box.options.indexOf(text);
  assert.ok(i >= 0, `"${text}" is on offer (offered: ${box.options.join(" | ")})`);
  world.answer(p, i);
  return world.dialogueFor(p);
}

/** Clicks a gate leaf and steps until the player is over it or has been told why not; returns the steps the hop was told as. */
function crossAt(world: World, p: Player, row: number): { told: string | undefined; steps: Array<{ x: number; y: number }> } {
  const gate = world.map.objects.find((o) => o.kind === "gate" && o.tag === "rillgate" && o.y === row)!;
  const side = p.x >= GATE_X;
  const before = p.messages.length;
  world.interact(p, gate.id);
  let steps: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < 30; i++) {
    world.step();
    if ((p.x >= GATE_X) !== side) steps = [...p.moved];
    const told = p.messages.slice(before).find((m) => m === RILL_SHUT || m === RILL_OVER || m === RILL_BACK);
    if (told) return { told, steps };
  }
  return { told: undefined, steps };
}

test("the Rill gate turns a player back until the fifth stage; then the warden passes them over alone, and lets anyone back", () => {
  const world = new World(stack, () => 0.5);
  const row = BRIDGE.y0 + 1;
  const shut = () => world.map.collision.wallBetween(GATE_X - 1, row, 1, 0);
  const p = world.add("Crosser", undefined, { at: { x: GATE_X - 4, y: row, plane: 0 } });
  let r = crossAt(world, p, row);
  assert.equal(r.told, RILL_SHUT, "below the stage, a click says the bar stays down");
  assert.ok(p.x < GATE_X && shut(), "and the player is still on the west bank, the bar down");
  p.quests[MOURN_QUEST] = RILL_PASSES_AT;
  r = crossAt(world, p, row);
  assert.equal(r.told, RILL_OVER, "at the fifth stage the warden passes them over");
  assert.deepEqual({ x: p.x, y: p.y }, { x: GATE_X, y: row }, "onto the bridge's first tile");
  assert.deepEqual(r.steps.at(-1), { x: GATE_X, y: row }, "told to the client as a step, so it is walked, not jumped");
  assert.ok(shut(), "and the bar is down again behind them");
  // Nothing was left open: someone below the stage just behind them is turned back.
  const q = world.add("Follower", undefined, { at: { x: GATE_X - 2, y: row, plane: 0 } });
  assert.equal(crossAt(world, q, row).told, RILL_SHUT, "a follower below the stage is still turned back");
  assert.ok(q.x < GATE_X, "and stays on the west bank");
  // From beside the gate rather than square on to it: stepped onto their own side first, then over.
  const s = world.add("Sidler", undefined, { at: { x: GATE_X - 1, y: BRIDGE.y0 + 1, plane: 0 }, quests: { [MOURN_QUEST]: RILL_PASSES_AT } });
  r = crossAt(world, s, BRIDGE.y1);
  assert.equal(r.told, RILL_OVER);
  assert.deepEqual({ x: s.x, y: s.y }, { x: GATE_X, y: BRIDGE.y1 }, "over from beside");
  // Back the other way is anyone's: nobody is shut in the fen.
  const t = world.add("Stranded", undefined, { at: { x: GATE_X + 3, y: row, plane: 0 } });
  r = crossAt(world, t, row);
  assert.equal(r.told, RILL_BACK, "a player on the bridge, whatever their stage, is let back");
  assert.deepEqual({ x: t.x, y: t.y }, { x: GATE_X - 1, y: row }, "onto the west bank");
  // And the one passed over walks on across the bridge onto the causeway.
  world.walk(p, BRIDGE.x1 + 3, row);
  for (let i = 0; i < 30 && p.x !== BRIDGE.x1 + 3; i++) world.step();
  assert.equal(p.x, BRIDGE.x1 + 3, "the bridge walks through to the causeway");
});

test("The Silence at Mourn, walked through: the warden, the castellan's lurkers and his leave, the turn, Pell, the gate, the reeve's wights, and home", () => {
  const world = new World(stack, () => 0.5);
  const q = QUEST_BY_KEY.get(MOURN_QUEST)!;
  assert.equal(q.stages.length, 8, "eight journal lines");
  const p = world.add("Quester", undefined, { at: { x: GATE_X - 6, y: BRIDGE.y0 + 1, plane: 0 } });
  const stage = () => stageOf(p.quests, MOURN_QUEST);
  const leave = item("sealed_leave").id;

  // 1. The warden: the bridge is barred by the castle's order.
  let box = talkTo(world, p, "rill_warden");
  assert.ok(box.options.includes("Why is it barred?"), "the quest is offered before it is begun");
  say(world, p, "Why is it barred?");
  box = say(world, p, "Then I'll get his leave.")!;
  assert.equal(stage(), 1, "begun");
  assert.ok(p.messages.includes(questBegun(q.name)) && box.lines[0]!.includes("King's Way"), "and he says where the castellan is");
  world.answer(p, 0);
  box = talkTo(world, p, "rill_warden");
  assert.ok(box.lines[0]!.startsWith("No seal, no crossing"), "mid-quest he greets you with what he waits for");
  world.answer(p, 0);

  // 2. The castellan: four lurkers first.
  box = talkTo(world, p, "castellan");
  say(world, p, "The Rill warden sent me. I need your leave to cross into the fen.");
  box = say(world, p, "Four lurkers. Consider it done.")!;
  assert.equal(stage(), 2);
  assert.ok(box.lines[0]!.includes("Fen Road"), "he says where they are");
  world.answer(p, 0);
  p.tally.rill_lurker = 3;
  box = talkTo(world, p, "castellan");
  assert.ok(box.lines[0]!.startsWith("Four lurkers."), "three is not four");
  world.answer(p, 0);
  box = talkTo(world, p, "rill_warden");
  assert.ok(box.lines[0]!.startsWith("Sent you after the lurkers"), "the warden knows the castellan's ways");
  world.answer(p, 1);

  // 3. Four lurkers, and the leave under his seal; lost, and written again.
  p.tally.rill_lurker = 4;
  talkTo(world, p, "castellan");
  say(world, p, "Thank you, Castellan.");
  assert.equal(stage(), 3);
  assert.equal(countOf(p.inventory, leave), 1, "the sealed leave is in the pack");
  spendItem(p.inventory, leave, 1);
  box = talkTo(world, p, "castellan");
  assert.ok(box.lines[0]!.startsWith("You have lost it"), "without it, he says so");
  say(world, p, "Thank you, Castellan.");
  assert.equal(countOf(p.inventory, leave), 1, "and writes another");
  box = talkTo(world, p, "castellan");
  assert.ok(box.lines[0]!.startsWith("You have my leave"), "and with it, sends you to the warden");
  world.answer(p, 0);

  // 4. The warden takes it, and the turn: he has been hiding Pell.
  box = talkTo(world, p, "rill_warden");
  assert.ok(box.lines[0]!.startsWith("That's his seal"), "he sees the leave");
  box = say(world, p, "Here. Lift the bar.")!;
  assert.equal(stage(), 4);
  assert.equal(countOf(p.inventory, leave), 0, "and takes it");
  assert.ok(box.lines.some((l) => l.includes("Pell")), "then names the man he has been hiding");
  world.answer(p, 1);
  assert.equal(crossAt(world, p, BRIDGE.y0 + 1).told, RILL_SHUT, "the bar stays down until Pell is heard");

  // 5. Pell's story, and the gate passes.
  box = talkTo(world, p, "lamp_man");
  assert.ok(box.lines.some((l) => l.includes("under the water")), "Pell heard the bell under the fen");
  box = say(world, p, "I'll find out what's happening in Mourn.")!;
  assert.equal(stage(), 5);
  world.answer(p, 0);
  const warden = besideOf(world, "rill_warden");
  world.travel(p, warden.at.x, warden.at.y, 0);
  assert.equal(crossAt(world, p, BRIDGE.y0 + 1).told, RILL_OVER, "the warden passes you over");
  assert.ok(p.x >= GATE_X, "onto the bridge");

  // 6. The reeve's confession, and three wights.
  box = talkTo(world, p, "mourn_reeve");
  say(world, p, "Pell sent me. He heard your bell ringing under the fen.");
  box = say(world, p, "I'll lay them to rest.")!;
  assert.equal(stage(), 6);
  world.answer(p, 0);
  p.tally.fen_wight = 2;
  box = talkTo(world, p, "mourn_reeve");
  assert.ok(box.lines[0]!.startsWith("Three of them"), "two is not three");
  world.answer(p, 0);

  // 7. Three wights: tell the warden.
  p.tally.fen_wight = 3;
  talkTo(world, p, "mourn_reeve");
  say(world, p, "I'll tell him.");
  assert.equal(stage(), 7);

  // 8. Back over the Rill (anyone may go back), and the warden pays.
  world.travel(p, GATE_X + 2, BRIDGE.y0 + 1, 0);
  assert.equal(crossAt(world, p, BRIDGE.y0 + 1).told, RILL_BACK);
  const xp = { ...p.xp }, coins = countOf(p.inventory, item("coins").id);
  box = talkTo(world, p, "rill_warden");
  say(world, p, "The dead, rising to a bell the village sank itself. Three of them won't rise again.");
  assert.equal(stage(), 8, "complete");
  assert.ok(p.messages.includes(questComplete(q.name)), "and announced");
  assert.equal(questPoints(p.quests), 3, "three quest points");
  for (const [skill, tenths] of q.reward.xp ?? []) assert.equal(p.xp[skill], xp[skill] + tenths, `${tenths} tenths of ${skill}`);
  assert.equal(countOf(p.inventory, item("coins").id), coins + 500, "and 500 coins");
  world.answer(p, 0);

  // Afterwards: the warden passes you still, Pell is going home, and the reeve's Mourn is open.
  assert.ok(talkTo(world, p, "rill_warden").lines[0]!.startsWith("The bar's still down"));
  world.answer(p, 0);
  assert.ok(talkTo(world, p, "lamp_man").lines[0]!.includes("go home"));
  world.answer(p, 0);
  const out = besideOf(world, "rill_warden");
  world.travel(p, out.at.x, out.at.y, 0);
  assert.equal(crossAt(world, p, BRIDGE.y0 + 1).told, RILL_OVER, "the gate passes you still");
  assert.ok(talkTo(world, p, "mourn_reeve").lines[0]!.startsWith("Mourn's open again"));
  // The control: someone who never began it is turned back at the bar and greeted as anyone is.
  const stranger = world.add("Stranger", undefined, { at: { x: GATE_X - 3, y: BRIDGE.y0 + 1, plane: 0 } });
  addItem(stranger.inventory, leave, 1);
  assert.equal(crossAt(world, stranger, BRIDGE.y0 + 1).told, RILL_SHUT, "a leave in the pack alone does not pass the bar: the warden's word does");
  assert.ok(talkTo(world, stranger, "rill_warden").options.includes("Why is it barred?"));
});
