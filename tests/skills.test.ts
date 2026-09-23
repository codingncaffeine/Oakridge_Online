import assert from "node:assert/strict";
import { test } from "node:test";
import { levelForXp, MAX_XP, noXp, readXp, shownGain, successChance, xpForLevel } from "../src/shared/skills.ts";

test("the classic XP curve, kept in tenths", () => {
  const whole = { 2: 83, 10: 1_154, 50: 101_333, 92: 6_517_253, 99: 13_034_431 };
  for (const [level, xp] of Object.entries(whole)) assert.equal(xpForLevel(Number(level)), xp * 10, `level ${level}`);
  assert.equal(xpForLevel(1), 0);
  assert.equal(levelForXp(0), 1);
  assert.equal(levelForXp(829), 1, "82.9 XP is still level 1");
  assert.equal(levelForXp(830), 2);
  assert.equal(levelForXp(xpForLevel(99) - 1), 98);
  assert.equal(levelForXp(MAX_XP), 99, "200 million XP is level 99");
  for (let l = 1; l <= 99; l++) assert.equal(levelForXp(xpForLevel(l)), l, `the XP for level ${l} reaches it`);
});

test("the classic success roll: a straight line from level 1 to 99 in 256ths, capped at certain", () => {
  assert.equal(successChance(64, 200, 1), 65 / 256);
  assert.equal(successChance(64, 200, 99), 201 / 256);
  assert.equal(successChance(64, 200, 50), (1 + Math.floor((64 * 49) / 98 + (200 * 49) / 98 + 0.5)) / 256);
  assert.equal(successChance(300, 600, 1), 1, "never more than certain");
  let last = 0;
  for (let l = 1; l <= 99; l++) {
    const p = successChance(40, 250, l);
    assert.ok(p >= last, `never falls as the level rises (level ${l})`);
    last = p;
  }
});

test("XP drops show whole points, and saves are read back defensively", () => {
  assert.equal(shownGain(0, 25), 2, "the first 2.5 shows as 2");
  assert.equal(shownGain(25, 50), 3, "the second shows as 3");
  // Anything missing, negative, not a number, or not a skill at all falls back to where that skill starts.
  assert.deepEqual(readXp({ woodcutting: 1234, mining: -5, fishing: "lots", thieving: 99 }), { ...noXp(), woodcutting: 1234 });
  assert.deepEqual(readXp({ fishing: MAX_XP + 10 }), { ...noXp(), fishing: MAX_XP });
  assert.deepEqual(readXp(null), noXp());
  assert.notEqual(noXp().hitpoints, 0, "and Hitpoints does not start at nothing");
});
