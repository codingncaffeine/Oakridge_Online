// The trades' signs: that every bank, shop, inn and smithy in the world has its trade's sign outside by the
// door, the same picture for the same trade in every town; that every sign hangs on a plain length of wall
// beside a door in that wall; and that hanging them took no id and no roll from anything else.
import assert from "node:assert/strict";
import { test } from "node:test";
import { FIXED_IDS, fixedId, SIGN_ICONS, SIGN_IDS, signId, type SignIcon } from "../src/shared/map.ts";
import { buildOakridge, OAKRIDGE_SEED } from "../src/shared/oakridge.ts";
import { SHOPS } from "../src/shared/shops.ts";
import { WorldBuilder } from "../src/shared/worldgen.ts";

const stack = buildOakridge(OAKRIDGE_SEED);
const ground = stack.planes.get(0)!;
const every = [...stack.planes.values()].flatMap((m) => m.objects);
const signs = ground.objects.filter((o) => o.kind === "sign");
/** Whether a sign with this picture hangs within `reach` tiles of a point. */
const signed = (at: { x: number; y: number }, icon: SignIcon, reach = 12) =>
  signs.some((s) => s.tag === icon && Math.max(Math.abs(s.x - at.x), Math.abs(s.y - at.y)) <= reach);

test("every sign hangs outside on a plain length of wall, beside a door in that wall", () => {
  assert.ok(signs.length >= 30, `the towns have their signs (${signs.length})`);
  const at = (kind: string, x: number, y: number, side: number) => ground.objects.some((o) => o.kind === kind && o.x === x && o.y === y && o.side === side);
  for (const s of signs) {
    assert.ok((SIGN_ICONS as readonly string[]).includes(s.tag ?? ""), `the sign at ${s.x},${s.y} shows a trade (${s.tag})`);
    assert.ok(at("wall", s.x, s.y, s.side), `the sign at ${s.x},${s.y} hangs on a wall`);
    assert.ok(!at("wall_window", s.x, s.y, s.side) && !at("door", s.x, s.y, s.side), `and not over a window or a door`);
    const along = s.side === 0 || s.side === 2 ? [[-2, 0], [-1, 0], [1, 0], [2, 0]] : [[0, -2], [0, -1], [0, 1], [0, 2]];
    assert.ok(along.some(([dx, dy]) => at("door", s.x + dx!, s.y + dy!, s.side)), `the sign at ${s.x},${s.y} is beside a door in the same wall`);
  }
  for (const [plane, map] of stack.planes) if (plane !== 0) assert.equal(map.objects.filter((o) => o.kind === "sign").length, 0, `none on plane ${plane}`);
});

test("every bank, shop, inn and smithy has its trade's sign by the door, the same picture in every town", () => {
  for (const booth of ground.objects.filter((o) => o.kind === "bank_booth")) assert.ok(signed(booth, "bank"), `the bank booth at ${booth.x},${booth.y} has the scales outside`);
  for (const counter of ground.objects.filter((o) => o.kind === "counter")) {
    const icon = SHOPS[counter.tag!]!.sign;
    assert.ok(signed(counter, icon), `${counter.tag}'s counter at ${counter.x},${counter.y} has the ${icon} outside`);
  }
  for (const keeper of ground.monsters.filter((s) => s.monster.startsWith("innkeeper"))) assert.ok(signed(keeper, "tankard"), `${keeper.monster}'s inn has the tankard outside`);
  for (const furnace of ground.objects.filter((o) => o.kind === "furnace")) assert.ok(signed(furnace, "anvil"), `the smithy with the furnace at ${furnace.x},${furnace.y} has the anvil outside`);
  // One picture a trade: a tool shop in Deepdelve shows what the one in Oakridge does.
  assert.equal(SHOPS["deepdelve_tools"]!.sign, SHOPS["oakridge_tools"]!.sign);
  assert.equal(SHOPS["kilnhold_blades"]!.sign, SHOPS["thornbury_weapons"]!.sign);
  for (const [key, shop] of Object.entries(SHOPS)) assert.ok((SIGN_ICONS as readonly string[]).includes(shop.sign), `${key} has a sign's picture`);
  // The control: a sign's absence is seen — the rule finds no bank sign by the quarry.
  assert.ok(!signed({ x: 3294, y: 3296 }, "bank"), "and no bank sign where there is no bank");
});

test("hanging the signs took no id from the builder and no roll from anything after", () => {
  for (const s of signs) assert.equal(s.id, signId(s.x, s.y, s.side), `the sign at ${s.x},${s.y} has its edge's id`);
  assert.equal(new Set(every.map((o) => o.id)).size, every.length, "every id names one object");
  // Runesmithing's altars and pit (Phase 18) take theirs from where they stand, above the signs', and no roll either.
  const fixed = every.filter((o) => o.id >= FIXED_IDS);
  assert.ok(fixed.length > 0, "there are objects put in after every roll");
  for (const o of fixed) assert.equal(o.id, fixedId(o.x, o.y, o.plane, o.side), `the ${o.kind} at ${o.x},${o.y} on plane ${o.plane} has its place's id`);
  const ids = every.filter((o) => o.kind !== "sign" && o.id < FIXED_IDS).map((o) => o.id).sort((a, b) => a - b);
  assert.ok(ids.at(-1)! < SIGN_IDS, "every other id is below the signs'");
  // The builder's run from 1, and the only gaps are the lengths of rail it took back for fishing once it was done: no sign took one.
  const retired = stack.retired ?? [];
  const held = new Set(ids);
  assert.ok(retired.every((id) => !held.has(id) && id < ids.at(-1)!), "every id taken back is gone from the world");
  assert.deepEqual([ids[0], ids.at(-1)], [1, ids.length + retired.length], "and the builder's run from 1, with no gap but those, so no sign took one");
  // A builder that hangs a sign draws the same next random number as one that does not.
  const plain = new WorldBuilder(64, 64, 0, 0, 7), hung = new WorldBuilder(64, 64, 0, 0, 7);
  for (const b of [plain, hung]) b.setUnderlay(0, 10, 10, 0);
  assert.ok(hung.hangSign(0, 10, 10, 2, "anvil"), "the sign hangs");
  assert.equal(hung.rand(), plain.rand(), "and took no roll");
  const placed = new WorldBuilder(64, 64, 0, 0, 7);
  placed.setUnderlay(0, 10, 10, 0);
  assert.ok(placed.placeFixed(0, "standing_stone", 11, 10), "an object put in after every roll stands");
  assert.equal(placed.rand(), new WorldBuilder(64, 64, 0, 0, 7).rand(), "and took no roll");
  // The control: placing anything else does take one.
  plain.place(0, "wall", 11, 10, { side: 2 });
  assert.notEqual(plain.rand(), hung.rand(), "a placed wall draws a roll where a hung sign does not");
});
