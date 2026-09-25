// Cooking on a lit fire, through the message a click sends (the user's report, 2026-09-25: right-clicking a
// campfire and choosing Cook did nothing, however close). A lit fire takes an id above everything the map
// holds, and since the signs took their ids from ten million up that is past 2^24, which the message check
// refused: every click on a fire was dropped as malformed before the game saw it. So every id the world hands
// out must pass the check, and a fire lit in the real world is cooked on through the message as parsed.
import assert from "node:assert/strict";
import { test } from "node:test";
import { addItem } from "../src/server/inventory.ts";
import { World } from "../src/server/world.ts";
import { item } from "../src/shared/items.ts";
import { SIGN_IDS } from "../src/shared/map.ts";
import { FIRE_LIT } from "../src/shared/messages.ts";
import { buildOakridge, OAKRIDGE_SEED } from "../src/shared/oakridge.ts";
import { parseC2S } from "../src/shared/protocol.ts";

const stack = buildOakridge(OAKRIDGE_SEED);

test("a fire lit in the real world is cooked on through the message a click sends", () => {
  const world = new World(stack, () => 0.5);
  const p = world.add("Cook", undefined, { at: { x: 3228, y: 3238, plane: 0 } });
  for (const key of ["tinderbox", "logs", "raw_sardine"]) addItem(p.inventory, item(key).id, 1);
  const slot = (key: string) => p.inventory.findIndex((s) => s?.id === item(key).id);
  world.useItems(p, slot("tinderbox"), slot("logs"));
  assert.ok(p.messages.includes(FIRE_LIT), "the fire is lit");
  const fire = world.map.objects.find((o) => o.kind === "fire" && o.x === 3228 && o.y === 3238)!;
  assert.ok(fire && fire.id > SIGN_IDS, `a lit fire's id is above the signs' (${fire?.id})`);
  world.walk(p, fire.x - 1, fire.y);
  for (let i = 0; i < 5; i++) world.step();
  // Cook on the fire, as the client sends it and the server parses it.
  const click = parseC2S(JSON.stringify({ t: "object", id: fire.id }));
  assert.deepEqual(click, { t: "object", id: fire.id }, "the click on the fire is a well-formed message");
  world.interact(p, (click as { id: number }).id);
  for (let i = 0; i < 10 && p.screen === null; i++) world.step();
  assert.equal(p.screen?.kind, "make", "and it opens the cooking list");
  assert.equal((p.screen as { station?: string }).station, "fire", "for the fire");
  // Using the raw fish on it goes by the same check.
  const use = parseC2S(JSON.stringify({ t: "use_object", slot: slot("raw_sardine"), id: fire.id }));
  assert.deepEqual(use, { t: "use_object", slot: slot("raw_sardine"), id: fire.id }, "and so is using a fish on it");
});

test("every object id the world hands out passes the message check, and what no object can be does not", () => {
  const ids = [...stack.planes.values()].flatMap((m) => m.objects.map((o) => o.id));
  const top = Math.max(...ids);
  assert.ok(top > 1 << 24, `the signs' ids run past 2^24 (${top})`);
  for (const id of [Math.min(...ids), top, top + 1_000_000]) {
    assert.deepEqual(parseC2S(JSON.stringify({ t: "object", id })), { t: "object", id }, `id ${id} passes`);
  }
  // The controls: the check still refuses what no object can be.
  for (const id of [0, -1, 1.5, "7", 2 ** 31, null]) assert.equal(parseC2S(JSON.stringify({ t: "object", id })), null, `id ${JSON.stringify(id)} is refused`);
});
