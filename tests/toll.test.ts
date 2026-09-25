// The Emberway Gate as a toll gate, and the furnaces by their heat (PLAN §7.6 Wave 2, §8.3), through
// the real world: a click on the gate does not open it; the keeper's talk offers the toll only to a
// player with ten coins, takes them, and swings the gate, which shuts itself again as a door does; and
// a bar that wants a hot furnace is refused at a village one with a message that says where to go.
import assert from "node:assert/strict";
import { test } from "node:test";
import { addItem, countOf } from "../src/server/inventory.ts";
import { DOOR_TICKS, World, type Npc, type Player } from "../src/server/world.ts";
import { item } from "../src/shared/items.ts";
import { furnaceTooCool, GATE_TOLL, makeNeedsLevel, needMaterials } from "../src/shared/messages.ts";
import { buildOakridge, OAKRIDGE_SEED } from "../src/shared/oakridge.ts";
import { furnaceHeat, RECIPES } from "../src/shared/recipes.ts";
import { noXp, xpForLevel, type SkillKey } from "../src/shared/skills.ts";

const stack = buildOakridge(OAKRIDGE_SEED);

/** A player standing beside a person, so a talk opens on the first step. */
function beside(world: World, key: string, state: { xp?: Record<SkillKey, number> } = {}): { p: Player; n: Npc } {
  const n = [...world.npcs.values()].find((c) => c.def.key === key);
  assert.ok(n, `${key} is in the world`);
  let at: { x: number; y: number } | null = null;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const t = { x: n.x + dx, y: n.y + dy };
    if ((world.map.collision.get(t.x, t.y) & 1) === 0) { at = t; break; }
  }
  assert.ok(at, `a free tile beside ${key}`);
  const p = world.add("Toller", undefined, { at: { ...at, plane: n.plane }, ...state });
  return { p, n };
}

function talk(world: World, p: Player, n: Npc) {
  world.talk(p, n.id);
  for (let i = 0; i < 20 && p.screen?.kind !== "talk"; i++) world.step();
  const box = world.dialogueFor(p);
  assert.ok(box, `talking to ${n.def.name} opens a box`);
  return box;
}

test("the Emberway Gate opens for the keeper's toll and for nothing else, and shuts itself again", () => {
  const world = new World(stack, () => 0.5);
  const gate = world.map.objects.find((o) => o.kind === "gate" && o.tag === "emberway")!;
  assert.ok(gate, "the gate stands");
  const shut = () => world.map.collision.wallBetween(gate.x, gate.y, 1, 0);
  assert.ok(shut(), "and is shut");

  // Clicking it: the player walks up, and is told whose gate it is.
  const { p, n } = beside(world, "gatekeeper");
  world.interact(p, gate.id);
  for (let i = 0; i < 30 && !p.messages.includes(GATE_TOLL); i++) world.step();
  assert.ok(p.messages.includes(GATE_TOLL), "a click says the keeper opens it");
  assert.ok(shut(), "and it stays shut");

  // Without ten coins the toll is not offered.
  const first = talk(world, p, n);
  assert.ok(!first.options.includes("Here's ten."), `no coins, no offer (offered: ${first.options.join(" | ")})`);
  assert.ok(first.options.includes("Ten coins? For a gate?"));
  world.answer(p, first.options.indexOf("Not today."));

  // With them: the coins go, the gate swings, the walk east is open.
  addItem(p.inventory, item("coins").id, 25);
  const again = talk(world, p, n);
  const pay = again.options.indexOf("Here's ten.");
  assert.ok(pay >= 0, "with coins the toll is offered");
  world.answer(p, pay);
  assert.equal(countOf(p.inventory, item("coins").id), 15, "ten coins taken");
  assert.ok(!shut(), "and the gate stands open");
  assert.ok(p.messages.some((m) => m.includes("swings the gate")), "the keeper says so");

  // It shuts itself after the same while a door does, so the road is not left open for everyone.
  for (let i = 0; i <= DOOR_TICKS + 1; i++) world.step();
  assert.ok(shut(), "and shuts again on its own");
});

test("a bar that wants a hot furnace is refused at a village one, and named for Kilnhold's", () => {
  const world = new World(stack, () => 0.5);
  const p = world.add("Smelter", undefined, { at: { x: 3232, y: 3232, plane: 0 }, xp: { ...noXp(), smithing: xpForLevel(70) } });
  const coldiron = RECIPES.find((r) => r.item === "coldiron_bar")!, steel = RECIPES.find((r) => r.item === "steel_bar")!;
  assert.equal(coldiron.heat, 2);
  assert.equal(steel.heat, 1, "steel runs at any furnace (PLAN §8.3)");
  assert.equal(world.canMakeNow(p, coldiron, furnaceHeat(undefined)).why, furnaceTooCool("Coldiron bar"), "a village furnace refuses coldiron and says where to go");
  assert.equal(world.canMakeNow(p, coldiron, furnaceHeat("hot")).why, needMaterials("Coldiron bar"), "a hot one only wants the ore and the coal");
  assert.equal(world.canMakeNow(p, steel, furnaceHeat(undefined)).why, needMaterials("Steel bar"), "and steel is not refused anywhere");
  // The level is checked before the heat: a smith too low for the bar is told that, not sent to Kilnhold.
  const novice = world.add("Novice", undefined, { at: { x: 3233, y: 3232, plane: 0 } });
  assert.equal(world.canMakeNow(novice, coldiron, furnaceHeat(undefined)).why, makeNeedsLevel("Smithing", 50, "Coldiron bar"));
  const starfall = RECIPES.find((r) => r.item === "starfall_bar")!;
  assert.equal(starfall.heat, 3, "starfall is Deepdelve's alone");
  assert.equal(furnaceHeat("white"), 3);
});
