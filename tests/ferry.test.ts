// The Sablewood ferry (PLAN §7.6, Wave 2), through the real world: the ferryman at Brinehaven's far
// berth offers the crossing only to a player with the fare, takes it, and puts them down on the isle's
// landing the same tick, told to their client as a plane change is; the isle's ferryman brings them
// back; and both landings are tiles a player can stand on.
import assert from "node:assert/strict";
import { test } from "node:test";
import { addItem, countOf } from "../src/server/inventory.ts";
import { World, type Npc, type Player } from "../src/server/world.ts";
import { BLOCKED } from "../src/shared/collision.ts";
import { item } from "../src/shared/items.ts";
import { buildOakridge, OAKRIDGE_SEED } from "../src/shared/oakridge.ts";
import { FERRY_FARE, TRAVEL } from "../src/shared/travel.ts";
import { SABLEWOOD } from "../src/shared/tarhollow.ts";
import { BRINEHAVEN } from "../src/shared/brinehaven.ts";
import { inBox } from "../src/shared/worldgen.ts";

const stack = buildOakridge(OAKRIDGE_SEED);
const ground = stack.planes.get(0)!;

function beside(world: World, key: string): { p: Player; n: Npc } {
  const n = [...world.npcs.values()].find((c) => c.def.key === key);
  assert.ok(n, `${key} is in the world`);
  let at: { x: number; y: number } | null = null;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const t = { x: n.x + dx, y: n.y + dy };
    if ((world.map.collision.get(t.x, t.y) & 1) === 0) { at = t; break; }
  }
  assert.ok(at, `a free tile beside ${key}`);
  const p = world.add("Voyager", undefined, { at: { ...at, plane: n.plane } });
  return { p, n };
}

function talk(world: World, p: Player, n: Npc) {
  world.talk(p, n.id);
  for (let i = 0; i < 20 && p.screen?.kind !== "talk"; i++) world.step();
  const box = world.dialogueFor(p);
  assert.ok(box, `talking to ${n.def.name} opens a box`);
  return box;
}

test("both landings are on land a player can stand on, one on the port's quay and one on the isle", () => {
  for (const [name, at] of Object.entries(TRAVEL)) {
    assert.ok((ground.collision.get(at.x, at.y) & BLOCKED) === 0, `${name}'s landing at ${at.x},${at.y} can be stood on`);
  }
  assert.ok(inBox(BRINEHAVEN, TRAVEL["brinehaven"]!.x, TRAVEL["brinehaven"]!.y), "one is in the port");
  assert.ok(inBox(SABLEWOOD, TRAVEL["tarhollow"]!.x, TRAVEL["tarhollow"]!.y), "and one on the isle");
  assert.ok(Math.hypot(TRAVEL["brinehaven"]!.x - TRAVEL["tarhollow"]!.x, TRAVEL["brinehaven"]!.y - TRAVEL["tarhollow"]!.y) > 600, "a long way apart");
});

test("the ferryman takes the fare and puts the player down on the isle, and his brother brings them back", () => {
  const world = new World(stack, () => 0.5);
  const { p, n } = beside(world, "ferryman");
  const first = talk(world, p, n);
  assert.ok(!first.options.includes("Take me across."), `no fare, no crossing (offered: ${first.options.join(" | ")})`);
  world.answer(p, first.options.indexOf("Not today."));

  addItem(p.inventory, item("coins").id, FERRY_FARE + 5);
  const again = talk(world, p, n);
  const go = again.options.indexOf("Take me across.");
  assert.ok(go >= 0, "with the fare the crossing is offered");
  const tickBefore = world.tick;
  world.answer(p, go);
  assert.equal(countOf(p.inventory, item("coins").id), 5, "the fare is taken");
  const landing = TRAVEL["tarhollow"]!;
  assert.ok(Math.hypot(p.x - landing.x, p.y - landing.y) <= 2, `the player stands at the isle's landing (${p.x},${p.y})`);
  assert.equal(p.plane, 0, "on the ground plane");
  assert.ok(p.planeTick >= tickBefore, "and their client will be told the way a plane change is told");
  assert.ok(p.messages.some((m) => m.includes("isle")), "and the crossing is said");

  // Back: the isle's ferryman is beside the landing; the same fare, the same way.
  const brother = [...world.npcs.values()].find((c) => c.def.key === "ferryman_isle")!;
  assert.ok(brother && Math.hypot(brother.x - p.x, brother.y - p.y) < 8, "his brother waits at the landing");
  const back = talk(world, p, brother);
  assert.ok(!back.options.includes("Take me back to Brinehaven."), "five coins is not the fare home");
  world.answer(p, back.options.indexOf("Not yet."));
  addItem(p.inventory, item("coins").id, FERRY_FARE);
  const home = talk(world, p, brother);
  world.answer(p, home.options.indexOf("Take me back to Brinehaven."));
  const berth = TRAVEL["brinehaven"]!;
  assert.ok(Math.hypot(p.x - berth.x, p.y - berth.y) <= 2, `and the player is back on the quay (${p.x},${p.y})`);
  assert.equal(countOf(p.inventory, item("coins").id), 5, "for the fare");
});
