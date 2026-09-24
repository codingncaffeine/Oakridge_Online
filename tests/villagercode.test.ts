// The NPC maker's "copy as code" prints a `villager(...)` line for shared/monsters.ts. This holds the
// printer to that file's own layout: every person already in it must come back out of the printer
// exactly as they were typed, so what the maker prints pastes in as it stands.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { VILLAGERS } from "../src/shared/monsters.ts";
import { hex6, villagerCode } from "../src/shared/villagercode.ts";

const source = readFileSync(new URL("../src/shared/monsters.ts", import.meta.url), "utf8");
const guard = VILLAGERS.find((v) => v.key === "guard")!;

test("every person in the bestiary prints back as the line they were written as", () => {
  assert.ok(VILLAGERS.length >= 11, "the village has its people");
  for (const def of VILLAGERS) {
    const code = villagerCode(def);
    assert.ok(source.includes(code), `${def.key}'s line is in the file as printed:\n${code}`);
  }
  // Control: one number changed, and the same printer's line is not in the file.
  assert.ok(!source.includes(villagerCode({ ...guard, wander: guard.wander + 1 })), "a changed line is not found");
});

test("worn things print in the order the game draws them, whatever order they were given in", () => {
  assert.ok(guard.wear && Object.keys(guard.wear).length >= 3, "the guard wears enough to have an order");
  const backwards = Object.fromEntries(Object.entries(guard.wear!).reverse()) as typeof guard.wear;
  assert.notDeepEqual(Object.keys(backwards!), Object.keys(guard.wear!), "the control really is in another order");
  assert.equal(villagerCode({ ...guard, wear: backwards }), villagerCode(guard));
});

test("a person with nothing beyond the four arguments prints without an extras block", () => {
  const look = [0, 1, 1, 1, 0, 0, 0, 1, 1, 1, 2, 3, 1];
  assert.equal(
    villagerCode({ key: "passerby", name: "Passer-by", examine: "Going somewhere, slowly.", look }),
    `  villager("passerby", "Passer-by", "Going somewhere, slowly.", [0, 1, 1, 1, 0, 0, 0, 1, 1, 1, 2, 3, 1]),`,
  );
  assert.equal(
    villagerCode({ key: "passerby", name: "Passer-by", examine: "Going somewhere, slowly.", look, wander: 3 }),
    `  villager("passerby", "Passer-by", "Going somewhere, slowly.", [0, 1, 1, 1, 0, 0, 0, 1, 1, 1, 2, 3, 1], {\n    wander: 3,\n  }),`,
  );
});

test("an apron colour keeps all six digits", () => {
  assert.equal(hex6(0x0a0b0c), "0x0a0b0c");
  assert.equal(hex6(0xb59a6a), "0xb59a6a");
  const look = new Array<number>(13).fill(0);
  assert.match(villagerCode({ key: "k", name: "N", examine: "E.", look, apron: 0x00ff00 }), /apron: 0x00ff00,/);
});

test("a person without a look cannot be printed", () => {
  assert.throws(() => villagerCode({ key: "ghost", name: "Ghost", examine: "Not all there." }), /ghost has no look/);
});
